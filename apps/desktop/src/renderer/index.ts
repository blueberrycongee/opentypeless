import './styles.css';

import { icons } from './icons';
import type {
  CompleteDictationResult,
  DesktopAttentionEvent,
  DesktopPermissionKind,
  DesktopStatus,
  DictationSession,
  PipelineStageStatus,
  RecordingCommand,
  RuntimeInfo,
  SentMessage
} from '../shared/ipc';

// ── Types ──────────────────────────────────────────────────────────

type View = 'home' | 'history' | 'dictionary' | 'settings';
type StatusTone = 'info' | 'success' | 'warning' | 'error';

interface AppState {
  view: View;
  info: RuntimeInfo;
  desktop: DesktopStatus;
  isRecording: boolean;
  isRefreshing: boolean;
  busySessionId: string | null;
  recorder: MediaRecorder | null;
  recordingStartedAt: number | null;
  recordingElapsed: number;
  sessions: DictationSession[];
  sentMessages: SentMessage[];
  statusMessage: { text: string; tone: StatusTone } | null;
  stream: MediaStream | null;
  timerInterval: number | null;
}

// ── State ──────────────────────────────────────────────────────────

const state: AppState = {
  view: 'home',
  info: null as unknown as RuntimeInfo,
  desktop: null as unknown as DesktopStatus,
  isRecording: false,
  isRefreshing: false,
  busySessionId: null,
  recorder: null,
  recordingStartedAt: null,
  recordingElapsed: 0,
  sessions: [],
  sentMessages: [],
  statusMessage: null,
  stream: null,
  timerInterval: null
};

let statusTimeoutId: number | null = null;

// ── Helpers ────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatKB(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ', ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  );
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function shortcutKeys(shortcut: string): string {
  return shortcut
    .replace('CommandOrControl', '⌘')
    .replace('Shift', '⇧')
    .replace('Alt', '⌥')
    .split('+')
    .map((k) => `<kbd class="kbd">${k}</kbd>`)
    .join('');
}

function permissionGranted(kind: DesktopPermissionKind): boolean {
  return state.desktop.permissions[kind] === 'granted';
}

function allPermissionsGranted(): boolean {
  return permissionGranted('microphone') && permissionGranted('accessibility');
}

function pipelineBadge(label: string, status: PipelineStageStatus): string {
  const cls: Record<PipelineStageStatus, string> = {
    pending: 'badge-neutral',
    running: 'badge-blue',
    completed: 'badge-green',
    failed: 'badge-red'
  };
  return `<span class="badge ${cls[status]}">${label}</span>`;
}

function moduleStatusBadge(status: string): string {
  if (status === 'ready') return '<span class="badge badge-green">ready</span>';
  if (status === 'blocked') return '<span class="badge badge-red">blocked</span>';
  return '<span class="badge badge-neutral">planned</span>';
}

function setStatus(text: string, tone: StatusTone): void {
  if (statusTimeoutId !== null) window.clearTimeout(statusTimeoutId);
  state.statusMessage = { text, tone };
  statusTimeoutId = window.setTimeout(() => {
    state.statusMessage = null;
    render();
  }, 6000);
}

// ── View: Sidebar ──────────────────────────────────────────────────

function renderSidebar(): string {
  const nav = (view: View, icon: string, label: string) => {
    const active = state.view === view ? ' nav-item--active' : '';
    let badge = '';
    if (view === 'home' && state.isRecording) {
      badge = '<span class="nav-rec-dot"></span>';
    }
    if (view === 'settings' && !allPermissionsGranted()) {
      badge = '<span class="nav-warn-dot"></span>';
    }
    return `<button class="nav-item${active}" data-nav="${view}">${icon}<span>${label}</span>${badge}</button>`;
  };

  return `
    <aside class="sidebar">
      <div class="sidebar-brand">
        <div class="sidebar-brand-icon">${icons.waveform}</div>
        <span class="sidebar-brand-name">OpenTypeless</span>
      </div>
      <nav class="sidebar-nav">
        ${nav('home', icons.home, 'Home')}
        ${nav('history', icons.clock, 'History')}
        ${nav('dictionary', icons.book, 'Dictionary')}
        ${nav('settings', icons.sliders, 'Settings')}
      </nav>
      <div class="sidebar-footer">
        <span class="sidebar-footer-text">v0.1.0 · ${state.info.platform}</span>
      </div>
    </aside>
  `;
}

// ── View: Home ─────────────────────────────────────────────────────

function renderHome(): string {
  const statusBanner = state.statusMessage
    ? `<div class="status-banner status-banner--${state.statusMessage.tone}">${icons.info} ${escapeHtml(state.statusMessage.text)}</div>`
    : '';

  const permAlert = allPermissionsGranted()
    ? ''
    : `
    <div class="perm-alert">
      ${icons.alertCircle}
      <div class="perm-alert-text">
        <p class="perm-alert-title">Permissions required</p>
        <p class="perm-alert-desc">Grant microphone and accessibility access to enable dictation into any app.</p>
        <div class="btn-row">
          <button class="btn btn-secondary btn-sm" data-nav="settings">Open Settings</button>
        </div>
      </div>
    </div>
  `;

  const recCard = state.isRecording
    ? `
    <div class="rec-card rec-card--active">
      <div class="rec-icon rec-icon--active">${icons.micLarge}</div>
      <p class="rec-title">Recording...</p>
      <p class="rec-hint">Speak naturally. Your words will be transcribed and cleaned by AI.</p>
      <p class="rec-timer" id="recording-timer">${formatElapsed(state.recordingElapsed)}</p>
      <button class="btn btn-danger" data-action="stop-recording">${icons.stop} Stop recording</button>
    </div>
  `
    : `
    <div class="rec-card">
      <div class="rec-icon rec-icon--idle">${icons.micLarge}</div>
      <p class="rec-title">Ready to dictate</p>
      <p class="rec-hint">Press ${shortcutKeys(state.desktop.shortcuts.startRecording)} from any app, or start here.</p>
      <button class="btn btn-primary" data-action="start-recording">${icons.mic} Start recording</button>
    </div>
  `;

  const stats = `
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-value">${state.sessions.length}</div>
        <div class="stat-label">Sessions</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${state.sentMessages.length}</div>
        <div class="stat-label">Delivered</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${state.desktop.activeTargetAppName ?? '—'}</div>
        <div class="stat-label">Target app</div>
      </div>
    </div>
  `;

  const recentSessions =
    state.sessions.length > 0
      ? `
    <div class="section">
      <div class="section-header">
        <span class="section-title">Recent sessions</span>
        <button class="btn btn-ghost btn-sm" data-nav="history">View all ${icons.chevronRight}</button>
      </div>
      <div class="card">
        ${state.sessions.slice(0, 5).map(renderSessionItem).join('')}
      </div>
    </div>
  `
      : '';

  return `
    <div class="page-header">
      <h1 class="page-title">Home</h1>
      <p class="page-subtitle">Desktop AI dictation, ready when you are.</p>
    </div>
    ${statusBanner}
    ${permAlert}
    ${recCard}
    ${stats}
    ${recentSessions}
  `;
}

// ── View: History ──────────────────────────────────────────────────

function renderHistory(): string {
  const body =
    state.sessions.length === 0
      ? `
    <div class="empty">
      <div class="empty-icon">${icons.clock}</div>
      <p class="empty-title">No sessions yet</p>
      <p class="empty-desc">Record your first dictation from the Home tab. Sessions will appear here with full transcripts and pipeline details.</p>
    </div>
  `
      : `<div class="card">${state.sessions.map(renderSessionItem).join('')}</div>`;

  return `
    <div class="page-header">
      <h1 class="page-title">History</h1>
      <p class="page-subtitle">${state.sessions.length} session${state.sessions.length === 1 ? '' : 's'} recorded</p>
    </div>
    ${body}
  `;
}

// ── View: Dictionary ───────────────────────────────────────────────

function renderDictionary(): string {
  return `
    <div class="page-header">
      <h1 class="page-title">Dictionary</h1>
      <p class="page-subtitle">Custom words and phrases for better accuracy.</p>
    </div>
    <div class="card">
      <div class="empty">
        <div class="empty-icon">${icons.book}</div>
        <p class="empty-title">Personal dictionary</p>
        <p class="empty-desc">Add specialized terms, abbreviations, and names to improve transcription accuracy. This feature is coming in a future update.</p>
      </div>
    </div>
  `;
}

// ── View: Settings ─────────────────────────────────────────────────

function renderSettings(): string {
  const micStatus = permissionGranted('microphone');
  const accStatus = permissionGranted('accessibility');

  return `
    <div class="page-header">
      <h1 class="page-title">Settings</h1>
      <p class="page-subtitle">Permissions, shortcuts, and system configuration.</p>
    </div>

    <div class="settings-group">
      <h3 class="settings-group-title">Permissions</h3>
      <div class="card">
        <div class="settings-row">
          <div class="settings-row-info">
            <p class="settings-row-label">${icons.mic} Microphone</p>
            <p class="settings-row-desc">Record speech for transcription</p>
          </div>
          <div class="btn-row">
            <span class="badge ${micStatus ? 'badge-green' : 'badge-red'}">${micStatus ? 'granted' : 'denied'}</span>
            <button class="btn btn-secondary btn-sm" data-action="request-microphone" ${micStatus ? 'disabled' : ''}>Grant</button>
            <button class="btn btn-ghost btn-sm" data-action="open-microphone-settings">${icons.externalLink}</button>
          </div>
        </div>
        <div class="settings-row">
          <div class="settings-row-info">
            <p class="settings-row-label">${icons.shield} Accessibility</p>
            <p class="settings-row-desc">Paste text into other applications</p>
          </div>
          <div class="btn-row">
            <span class="badge ${accStatus ? 'badge-green' : 'badge-red'}">${accStatus ? 'granted' : 'denied'}</span>
            <button class="btn btn-secondary btn-sm" data-action="request-accessibility" ${accStatus ? 'disabled' : ''}>Grant</button>
            <button class="btn btn-ghost btn-sm" data-action="open-accessibility-settings">${icons.externalLink}</button>
          </div>
        </div>
      </div>
    </div>

    <div class="settings-group">
      <h3 class="settings-group-title">Shortcuts</h3>
      <div class="card">
        <div class="settings-row">
          <div class="settings-row-info">
            <p class="settings-row-label">Start recording</p>
          </div>
          <div>${shortcutKeys(state.desktop.shortcuts.startRecording)}</div>
        </div>
        <div class="settings-row">
          <div class="settings-row-info">
            <p class="settings-row-label">Stop recording</p>
          </div>
          <div>${shortcutKeys(state.desktop.shortcuts.stopRecording)}</div>
        </div>
      </div>
    </div>

    <div class="settings-group">
      <h3 class="settings-group-title">AI engine</h3>
      <div class="card">
        <div class="settings-row">
          <div class="settings-row-info">
            <p class="settings-row-label">Speech-to-text</p>
          </div>
          <span class="settings-row-value">whisper.cpp (local)</span>
        </div>
        <div class="settings-row">
          <div class="settings-row-info">
            <p class="settings-row-label">Text rewrite</p>
          </div>
          <span class="settings-row-value">MLX-LM (local)</span>
        </div>
        <div class="settings-row">
          <div class="settings-row-info">
            <p class="settings-row-label">Text delivery</p>
          </div>
          <span class="settings-row-value">Clipboard paste</span>
        </div>
      </div>
    </div>

    <div class="settings-group">
      <h3 class="settings-group-title">System modules</h3>
      ${state.info.modules
        .map(
          (m) => `
        <div class="module-item">
          <div>
            <p class="module-item-label">${escapeHtml(m.label)}</p>
            <p class="module-item-note">${escapeHtml(m.note)}</p>
          </div>
          ${moduleStatusBadge(m.status)}
        </div>
      `
        )
        .join('')}
    </div>

    <div class="settings-group">
      <h3 class="settings-group-title">About</h3>
      <div class="card">
        <div class="settings-row">
          <div class="settings-row-info"><p class="settings-row-label">Application</p></div>
          <span class="settings-row-value">${escapeHtml(state.info.appName)} v0.1.0</span>
        </div>
        <div class="settings-row">
          <div class="settings-row-info"><p class="settings-row-label">Platform</p></div>
          <span class="settings-row-value">${state.info.platform}</span>
        </div>
        <div class="settings-row">
          <div class="settings-row-info"><p class="settings-row-label">License</p></div>
          <span class="settings-row-value">MIT</span>
        </div>
      </div>
    </div>
  `;
}

// ── Shared: Session item ───────────────────────────────────────────

function renderSessionItem(session: DictationSession): string {
  const isBusy = state.busySessionId === session.id;
  const isComplete = session.pipeline.send === 'completed';
  const canProcess = !isBusy && !isComplete;

  const transcript = session.transcript
    ? `<div class="session-result"><span class="session-result-label">Transcript</span>${escapeHtml(session.transcript.text)}</div>`
    : '';
  const rewrite = session.rewrite
    ? `<div class="session-result"><span class="session-result-label">Rewritten</span>${escapeHtml(session.rewrite.text)}</div>`
    : '';
  const error = session.error ? `<p class="session-error">${escapeHtml(session.error)}</p>` : '';

  return `
    <div class="session-item">
      <div>
        <p class="session-name">${escapeHtml(session.audio.fileName)}</p>
        <p class="session-meta">${formatDate(session.createdAt)} · ${formatDuration(session.durationMs)} · ${formatKB(session.audio.bytes)}</p>
        <div class="session-badges">
          ${pipelineBadge('STT', session.pipeline.transcription)}
          ${pipelineBadge('Rewrite', session.pipeline.rewrite)}
          ${pipelineBadge('Send', session.pipeline.send)}
        </div>
        ${transcript}
        ${rewrite}
        ${error}
      </div>
      <div class="session-actions">
        <button class="btn btn-secondary btn-sm" data-action="process-session" data-session-id="${session.id}" ${canProcess ? '' : 'disabled'}>
          ${isBusy ? 'Processing...' : isComplete ? 'Done' : 'Run pipeline'}
        </button>
      </div>
    </div>
  `;
}

// ── Layout & Render ────────────────────────────────────────────────

function renderContent(): string {
  const views: Record<View, () => string> = {
    home: renderHome,
    history: renderHistory,
    dictionary: renderDictionary,
    settings: renderSettings
  };
  return `<main class="content"><div class="content-inner">${views[state.view]()}</div></main>`;
}

function render(): void {
  const root = document.getElementById('app');
  if (!root) return;
  root.innerHTML = `<div class="app-layout">${renderSidebar()}${renderContent()}</div>`;
  bindUi();
}

// ── Event binding ──────────────────────────────────────────────────

function bindUi(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.nav as View;
      if (target && target !== state.view) {
        state.view = target;
        render();
      }
    });
  });

  document.querySelector('[data-action="start-recording"]')?.addEventListener('click', () => {
    void startRecording('manual');
  });

  document.querySelector('[data-action="stop-recording"]')?.addEventListener('click', () => {
    void stopRecording();
  });

  document.querySelector('[data-action="request-microphone"]')?.addEventListener('click', () => {
    void requestMicrophonePermission();
  });

  document.querySelector('[data-action="request-accessibility"]')?.addEventListener('click', () => {
    void requestAccessibilityPermission();
  });

  document.querySelector('[data-action="open-microphone-settings"]')?.addEventListener('click', () => {
    void openPermissionSettings('microphone');
  });

  document.querySelector('[data-action="open-accessibility-settings"]')?.addEventListener('click', () => {
    void openPermissionSettings('accessibility');
  });

  document.querySelectorAll<HTMLButtonElement>('[data-action="process-session"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sessionId = btn.dataset.sessionId;
      if (sessionId) void processSession(sessionId);
    });
  });
}

// ── Timer ──────────────────────────────────────────────────────────

function startTimer(): void {
  stopTimer();
  state.timerInterval = window.setInterval(() => {
    if (state.recordingStartedAt) {
      state.recordingElapsed = Date.now() - state.recordingStartedAt;
      const el = document.getElementById('recording-timer');
      if (el) el.textContent = formatElapsed(state.recordingElapsed);
    }
  }, 100);
}

function stopTimer(): void {
  if (state.timerInterval !== null) {
    window.clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
}

// ── Actions ────────────────────────────────────────────────────────

async function refreshAll(): Promise<void> {
  state.isRefreshing = true;
  const [desktop, sessions, sentMessages] = await Promise.all([
    window.opentypeless.getDesktopStatus(),
    window.opentypeless.listDictationSessions(),
    window.opentypeless.listSentMessages()
  ]);
  state.desktop = desktop;
  state.sessions = sessions;
  state.sentMessages = sentMessages;
  state.isRefreshing = false;
  render();
}

async function requestMicrophonePermission(): Promise<void> {
  const granted = await window.opentypeless.requestMicrophonePermission();
  setStatus(
    granted ? 'Microphone access granted.' : 'Microphone access unavailable. Open System Settings to grant.',
    granted ? 'success' : 'warning'
  );
  await refreshAll();
}

async function requestAccessibilityPermission(): Promise<void> {
  const granted = await window.opentypeless.requestAccessibilityPermission();
  setStatus(
    granted ? 'Accessibility access granted.' : 'Open System Settings and enable OpenTypeless under Accessibility.',
    granted ? 'success' : 'warning'
  );
  await refreshAll();
}

async function openPermissionSettings(kind: DesktopPermissionKind): Promise<void> {
  await window.opentypeless.openPermissionSettings(kind);
  setStatus(`Opened ${kind} settings. Grant access, then return here.`, 'info');
  render();
}

async function processSession(sessionId: string): Promise<void> {
  state.busySessionId = sessionId;
  setStatus('Running local pipeline...', 'info');
  render();

  try {
    const processed = await window.opentypeless.processDictationSession(sessionId);
    state.sessions = state.sessions.map((s) => (s.id === processed.id ? processed : s));
    state.sentMessages = await window.opentypeless.listSentMessages();
    setStatus(`Pipeline completed for ${processed.audio.fileName}.`, 'success');
  } catch (err) {
    setStatus(`Pipeline failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
  } finally {
    state.busySessionId = null;
    render();
  }
}

async function startRecording(source: 'manual' | 'shortcut'): Promise<void> {
  if (state.isRecording) return;

  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus('This environment does not support microphone capture.', 'error');
    render();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = pickMimeType();
    const chunks: Blob[] = [];
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    });

    recorder.addEventListener('stop', () => {
      void finalizeRecording(chunks, recorder.mimeType || mimeType || 'audio/webm');
    });

    recorder.start(250);
    state.isRecording = true;
    state.recorder = recorder;
    state.recordingStartedAt = Date.now();
    state.recordingElapsed = 0;
    state.stream = stream;
    state.view = 'home';

    if (source === 'shortcut') {
      setStatus('Global shortcut started recording. Speak, then press stop.', 'info');
    }

    render();
    startTimer();
  } catch (err) {
    setStatus(`Microphone error: ${err instanceof Error ? err.message : String(err)}`, 'error');
    render();
  }
}

async function stopRecording(): Promise<void> {
  if (!state.recorder || !state.isRecording) return;
  stopTimer();
  setStatus('Stopping capture...', 'info');
  render();
  state.recorder.stop();
}

async function finalizeRecording(chunks: Blob[], mimeType: string): Promise<void> {
  try {
    const blob = new Blob(chunks, { type: mimeType });
    const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
    const saved = await window.opentypeless.saveCapturedAudio({
      audioBytes: bytes,
      durationMs: state.recordingStartedAt ? Date.now() - state.recordingStartedAt : null,
      mimeType: blob.type || mimeType
    });

    stopStream();
    state.isRecording = false;
    state.recorder = null;
    state.recordingStartedAt = null;
    state.recordingElapsed = 0;
    state.sessions = [saved, ...state.sessions];
    state.busySessionId = saved.id;
    setStatus(`Saved ${saved.audio.fileName}. Running pipeline...`, 'info');
    render();

    const result = await window.opentypeless.completeDictationSession(saved.id);
    applyCompletionResult(result);
  } catch (err) {
    stopStream();
    state.isRecording = false;
    state.recorder = null;
    state.recordingStartedAt = null;
    state.recordingElapsed = 0;
    state.busySessionId = null;
    setStatus(`Recording failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
    render();
  }
}

function applyCompletionResult(result: CompleteDictationResult): void {
  state.sessions = state.sessions.map((s) => (s.id === result.processed.id ? result.processed : s));
  state.busySessionId = null;

  if (result.inserted) {
    setStatus(`Text inserted into ${result.targetAppName ?? 'the focused app'}.`, 'success');
  } else {
    setStatus('Processed, but no external target app was available for insertion.', 'warning');
  }

  void refreshAll();
}

function stopStream(): void {
  state.stream?.getTracks().forEach((t) => t.stop());
  state.stream = null;
}

function pickMimeType(): string {
  return ['audio/webm;codecs=opus', 'audio/webm'].find((c) => MediaRecorder.isTypeSupported(c)) ?? '';
}

// ── IPC event handlers ─────────────────────────────────────────────

function describeMissingPermissions(missing: DesktopPermissionKind[]): string {
  if (missing.length === 2) return 'microphone and accessibility permissions';
  return missing[0] === 'microphone' ? 'microphone permission' : 'accessibility permission';
}

async function handleDesktopAttention(event: DesktopAttentionEvent): Promise<void> {
  if (event.kind !== 'permission-required') return;
  state.view = 'home';
  setStatus(`Grant ${describeMissingPermissions(event.missing)} to start dictation.`, 'warning');
  await refreshAll();
}

async function handleRecordingCommand(command: RecordingCommand): Promise<void> {
  if (command === 'start') {
    await refreshAll();
    await startRecording('shortcut');
    return;
  }
  await stopRecording();
}

// ── Boot ───────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  const [info, desktop, sessions, sentMessages] = await Promise.all([
    window.opentypeless.getRuntimeInfo(),
    window.opentypeless.getDesktopStatus(),
    window.opentypeless.listDictationSessions(),
    window.opentypeless.listSentMessages()
  ]);
  state.info = info;
  state.desktop = desktop;
  state.sessions = sessions;
  state.sentMessages = sentMessages;

  window.opentypeless.onRecordingCommand((cmd) => void handleRecordingCommand(cmd));
  window.opentypeless.onDesktopAttention((evt) => void handleDesktopAttention(evt));

  render();
}

void boot();
