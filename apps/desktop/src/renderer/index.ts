import './styles.css';

import { changeLanguage, getLocale, onLanguageChanged, type Locale } from './i18n';
import { t } from './i18n';
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
import {
  createOnboardingController,
  isOnboardingCompleted,
  clearOnboardingCompleted,
  type OnboardingController
} from './onboarding/onboarding-controller';

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
let onboardingController: OnboardingController | null = null;
let pipelineCompleteCallbacks: Array<() => void> = [];

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
  if (status === 'ready') return `<span class="badge badge-green">${t('badge.ready')}</span>`;
  if (status === 'blocked') return `<span class="badge badge-red">${t('badge.blocked')}</span>`;
  return `<span class="badge badge-neutral">${t('badge.planned')}</span>`;
}

function setStatus(text: string, tone: StatusTone): void {
  if (statusTimeoutId !== null) window.clearTimeout(statusTimeoutId);
  state.statusMessage = { text, tone };
  statusTimeoutId = window.setTimeout(() => {
    state.statusMessage = null;
    render();
  }, 6000);
}

function navigateTo(view: View): void {
  if (view !== state.view) {
    state.view = view;
    render();
  }
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
        ${nav('home', icons.home, t('nav.home'))}
        ${nav('history', icons.clock, t('nav.history'))}
        ${nav('dictionary', icons.book, t('nav.dictionary'))}
        ${nav('settings', icons.sliders, t('nav.settings'))}
      </nav>
      <div class="sidebar-footer">
        <span class="sidebar-footer-text">${t('sidebar.footer', { platform: state.info.platform })}</span>
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
        <p class="perm-alert-title">${t('home.permissionsTitle')}</p>
        <p class="perm-alert-desc">${t('home.permissionsDesc')}</p>
        <div class="btn-row">
          <button class="btn btn-secondary btn-sm" data-nav="settings">${t('home.openSettings')}</button>
        </div>
      </div>
    </div>
  `;

  let recCard: string;
  if (state.desktop.overlayActive) {
    recCard = `
    <div class="rec-card rec-card--active">
      <div class="rec-icon rec-icon--active">${icons.micLarge}</div>
      <p class="rec-title">${t('home.recordingInProgress')}</p>
      <p class="rec-hint">${t('home.recordingOverlayHint', { shortcut: shortcutKeys(state.desktop.shortcuts.startRecording) })}</p>
    </div>
    `;
  } else if (state.isRecording) {
    recCard = `
    <div class="rec-card rec-card--active">
      <div class="rec-icon rec-icon--active">${icons.micLarge}</div>
      <p class="rec-title">${t('home.recordingActive')}</p>
      <p class="rec-hint">${t('home.recordingHint')}</p>
      <p class="rec-timer" id="recording-timer">${formatElapsed(state.recordingElapsed)}</p>
      <button class="btn btn-danger" data-action="stop-recording">${icons.stop} ${t('home.stopRecording')}</button>
    </div>
    `;
  } else {
    recCard = `
    <div class="rec-card">
      <div class="rec-icon rec-icon--idle">${icons.micLarge}</div>
      <p class="rec-title">${t('home.readyToDictate')}</p>
      <p class="rec-hint">${t('home.recordingStartHint', { shortcut: shortcutKeys(state.desktop.shortcuts.startRecording) })}</p>
      <button class="btn btn-primary" data-action="start-recording">${icons.mic} ${t('home.startRecording')}</button>
    </div>
    `;
  }

  const stats = `
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-value">${state.sessions.length}</div>
        <div class="stat-label">${t('home.statsSessions')}</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${state.sentMessages.length}</div>
        <div class="stat-label">${t('home.statsDelivered')}</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${state.desktop.activeTargetAppName ?? '—'}</div>
        <div class="stat-label">${t('home.statsTargetApp')}</div>
      </div>
    </div>
  `;

  const recentSessions =
    state.sessions.length > 0
      ? `
    <div class="section">
      <div class="section-header">
        <span class="section-title">${t('home.recentSessions')}</span>
        <button class="btn btn-ghost btn-sm" data-nav="history">${t('home.viewAll')} ${icons.chevronRight}</button>
      </div>
      <div class="card">
        ${state.sessions.slice(0, 5).map(renderSessionItem).join('')}
      </div>
    </div>
  `
      : '';

  return `
    <div class="page-header">
      <h1 class="page-title">${t('home.title')}</h1>
      <p class="page-subtitle">${t('home.subtitle')}</p>
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
      <p class="empty-title">${t('history.emptyTitle')}</p>
      <p class="empty-desc">${t('history.emptyDesc')}</p>
    </div>
  `
      : `<div class="card">${state.sessions.map(renderSessionItem).join('')}</div>`;

  const count = state.sessions.length;
  const subtitleKey = count === 1 ? 'history.subtitle_one' : 'history.subtitle_other';

  return `
    <div class="page-header">
      <h1 class="page-title">${t('history.title')}</h1>
      <p class="page-subtitle">${t(subtitleKey, { count })}</p>
    </div>
    ${body}
  `;
}

// ── View: Dictionary ───────────────────────────────────────────────

function renderDictionary(): string {
  return `
    <div class="page-header">
      <h1 class="page-title">${t('dictionary.title')}</h1>
      <p class="page-subtitle">${t('dictionary.subtitle')}</p>
    </div>
    <div class="card">
      <div class="empty">
        <div class="empty-icon">${icons.book}</div>
        <p class="empty-title">${t('dictionary.emptyTitle')}</p>
        <p class="empty-desc">${t('dictionary.emptyDesc')}</p>
      </div>
    </div>
  `;
}

// ── View: Settings ─────────────────────────────────────────────────

function renderSettings(): string {
  const micStatus = permissionGranted('microphone');
  const accStatus = permissionGranted('accessibility');
  const currentLocale = getLocale();

  return `
    <div class="page-header">
      <h1 class="page-title">${t('settings.title')}</h1>
      <p class="page-subtitle">${t('settings.subtitle')}</p>
    </div>

    <div class="settings-group">
      <h3 class="settings-group-title">${t('settings.language')}</h3>
      <div class="card">
        <div class="settings-row">
          <div class="settings-row-info">
            <p class="settings-row-label">${t('settings.language')}</p>
            <p class="settings-row-desc">${t('settings.languageDesc')}</p>
          </div>
          <div class="btn-row">
            <button class="btn btn-secondary btn-sm ${currentLocale === 'en' ? 'btn-primary' : ''}" data-action="set-locale" data-locale="en">English</button>
            <button class="btn btn-secondary btn-sm ${currentLocale === 'zh-CN' ? 'btn-primary' : ''}" data-action="set-locale" data-locale="zh-CN">中文</button>
          </div>
        </div>
      </div>
    </div>

    <div class="settings-group">
      <h3 class="settings-group-title">${t('settings.permissions')}</h3>
      <div class="card" data-onboarding="permissions">
        <div class="settings-row">
          <div class="settings-row-info">
            <p class="settings-row-label">${icons.mic} ${t('settings.microphone')}</p>
            <p class="settings-row-desc">${t('settings.microphoneDesc')}</p>
          </div>
          <div class="btn-row">
            <span class="badge ${micStatus ? 'badge-green' : 'badge-red'}">${micStatus ? t('settings.granted') : t('settings.denied')}</span>
            <button class="btn btn-secondary btn-sm" data-action="request-microphone" ${micStatus ? 'disabled' : ''}>${t('settings.grant')}</button>
            <button class="btn btn-ghost btn-sm" data-action="open-microphone-settings">${icons.externalLink}</button>
          </div>
        </div>
        <div class="settings-row">
          <div class="settings-row-info">
            <p class="settings-row-label">${icons.shield} ${t('settings.accessibility')}</p>
            <p class="settings-row-desc">${t('settings.accessibilityDesc')}</p>
          </div>
          <div class="btn-row">
            <span class="badge ${accStatus ? 'badge-green' : 'badge-red'}">${accStatus ? t('settings.granted') : t('settings.denied')}</span>
            <button class="btn btn-secondary btn-sm" data-action="request-accessibility" ${accStatus ? 'disabled' : ''}>${t('settings.grant')}</button>
            <button class="btn btn-ghost btn-sm" data-action="open-accessibility-settings">${icons.externalLink}</button>
          </div>
        </div>
      </div>
    </div>

    <div class="settings-group">
      <h3 class="settings-group-title">${t('settings.shortcuts')}</h3>
      <div class="card">
        <div class="settings-row">
          <div class="settings-row-info">
            <p class="settings-row-label">${t('settings.startRecording')}</p>
          </div>
          <div>${shortcutKeys(state.desktop.shortcuts.startRecording)}</div>
        </div>
        <div class="settings-row">
          <div class="settings-row-info">
            <p class="settings-row-label">${t('settings.stopRecording')}</p>
          </div>
          <div>${shortcutKeys(state.desktop.shortcuts.stopRecording)}</div>
        </div>
      </div>
    </div>

    <div class="settings-group">
      <h3 class="settings-group-title">${t('settings.aiEngine')}</h3>
      <div class="card">
        <div class="settings-row">
          <div class="settings-row-info">
            <p class="settings-row-label">${t('settings.speechToText')}</p>
          </div>
          <span class="settings-row-value">${t('settings.whisperLocal')}</span>
        </div>
        <div class="settings-row">
          <div class="settings-row-info">
            <p class="settings-row-label">${t('settings.textRewrite')}</p>
          </div>
          <span class="settings-row-value">${t('settings.mlxLocal')}</span>
        </div>
        <div class="settings-row">
          <div class="settings-row-info">
            <p class="settings-row-label">${t('settings.textDelivery')}</p>
          </div>
          <span class="settings-row-value">${t('settings.clipboardPaste')}</span>
        </div>
      </div>
    </div>

    <div class="settings-group">
      <h3 class="settings-group-title">${t('settings.systemModules')}</h3>
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
      <h3 class="settings-group-title">${t('settings.about')}</h3>
      <div class="card">
        <div class="settings-row">
          <div class="settings-row-info"><p class="settings-row-label">${t('settings.application')}</p></div>
          <span class="settings-row-value">${escapeHtml(state.info.appName)} v0.1.0</span>
        </div>
        <div class="settings-row">
          <div class="settings-row-info"><p class="settings-row-label">${t('settings.platform')}</p></div>
          <span class="settings-row-value">${state.info.platform}</span>
        </div>
        <div class="settings-row">
          <div class="settings-row-info"><p class="settings-row-label">${t('settings.license')}</p></div>
          <span class="settings-row-value">MIT</span>
        </div>
      </div>
    </div>

    <div class="settings-group">
      <h3 class="settings-group-title">${t('onboarding.restartGuide')}</h3>
      <div class="card">
        <div class="settings-row">
          <div class="settings-row-info">
            <p class="settings-row-label">${t('onboarding.restartGuide')}</p>
            <p class="settings-row-desc">${t('onboarding.restartGuideDesc')}</p>
          </div>
          <button class="btn btn-secondary btn-sm" data-action="restart-guide">${t('onboarding.restartGuide')}</button>
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
    ? `<div class="session-result"><span class="session-result-label">${t('session.transcript')}</span>${escapeHtml(session.transcript.text)}</div>`
    : '';
  const rewrite = session.rewrite
    ? `<div class="session-result"><span class="session-result-label">${t('session.rewritten')}</span>${escapeHtml(session.rewrite.text)}</div>`
    : '';
  const error = session.error ? `<p class="session-error">${escapeHtml(session.error)}</p>` : '';

  const btnLabel = isBusy ? t('session.processing') : isComplete ? t('session.done') : t('session.runPipeline');

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
          ${btnLabel}
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
      if (target) navigateTo(target);
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

  document.querySelectorAll<HTMLButtonElement>('[data-action="set-locale"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const locale = btn.dataset.locale as Locale;
      if (locale === 'en' || locale === 'zh-CN') {
        void changeLanguage(locale).then(() => render());
      }
    });
  });

  document.querySelector('[data-action="restart-guide"]')?.addEventListener('click', () => {
    clearOnboardingCompleted();
    if (onboardingController) {
      onboardingController.destroy();
    }
    startOnboarding();
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
    granted ? t('status.microphoneGranted') : t('status.microphoneUnavailable'),
    granted ? 'success' : 'warning'
  );
  await refreshAll();
}

async function requestAccessibilityPermission(): Promise<void> {
  const granted = await window.opentypeless.requestAccessibilityPermission();
  setStatus(
    granted ? t('status.accessibilityGranted') : t('status.accessibilityUnavailable'),
    granted ? 'success' : 'warning'
  );
  await refreshAll();
}

async function openPermissionSettings(kind: DesktopPermissionKind): Promise<void> {
  await window.opentypeless.openPermissionSettings(kind);
  const kindKey = kind === 'microphone' ? 'settings.microphone' : 'settings.accessibility';
  setStatus(t('status.openedSettings', { kind: t(kindKey) }), 'info');
  render();
}

async function processSession(sessionId: string): Promise<void> {
  state.busySessionId = sessionId;
  setStatus(t('status.runningPipeline'), 'info');
  render();

  try {
    const processed = await window.opentypeless.processDictationSession(sessionId);
    state.sessions = state.sessions.map((s) => (s.id === processed.id ? processed : s));
    state.sentMessages = await window.opentypeless.listSentMessages();
    setStatus(t('status.pipelineCompleted', { fileName: processed.audio.fileName }), 'success');
  } catch (err) {
    setStatus(t('status.pipelineFailed', { message: err instanceof Error ? err.message : String(err) }), 'error');
  } finally {
    state.busySessionId = null;
    render();
  }
}

async function startRecording(source: 'manual' | 'shortcut'): Promise<void> {
  if (state.isRecording) return;

  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus(t('status.noMicrophone'), 'error');
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
      setStatus(t('status.shortcutStarted'), 'info');
    }

    render();
    startTimer();
  } catch (err) {
    setStatus(t('status.microphoneError', { message: err instanceof Error ? err.message : String(err) }), 'error');
    render();
  }
}

async function stopRecording(): Promise<void> {
  if (!state.recorder || !state.isRecording) return;
  stopTimer();
  setStatus(t('status.stoppingCapture'), 'info');
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
    setStatus(t('status.savedRunning', { fileName: saved.audio.fileName }), 'info');
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
    setStatus(t('status.recordingFailed', { message: err instanceof Error ? err.message : String(err) }), 'error');
    render();
  }
}

function applyCompletionResult(result: CompleteDictationResult): void {
  state.sessions = state.sessions.map((s) => (s.id === result.processed.id ? result.processed : s));
  state.busySessionId = null;

  if (result.inserted) {
    setStatus(t('status.inserted', { app: result.targetAppName ?? t('status.focusedApp') }), 'success');
  } else {
    setStatus(t('status.noTargetApp'), 'warning');
  }

  void refreshAll();
  pipelineCompleteCallbacks.forEach((cb) => cb());
}

function cancelRecording(): void {
  if (!state.recorder || !state.isRecording) return;
  stopTimer();

  state.recorder.ondataavailable = null;
  state.recorder.onstop = null;
  try {
    state.recorder.stop();
  } catch {
    // already stopped
  }

  stopStream();
  state.isRecording = false;
  state.recorder = null;
  state.recordingStartedAt = null;
  state.recordingElapsed = 0;
  state.busySessionId = null;
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
  if (missing.length === 2) return t('status.permissionsBoth');
  return missing[0] === 'microphone' ? t('status.permissionsMicrophone') : t('status.permissionsAccessibility');
}

async function handleDesktopAttention(event: DesktopAttentionEvent): Promise<void> {
  if (event.kind === 'permission-lost') {
    showPermissionLostModal(event.missing);
    return;
  }
  if (event.kind !== 'permission-required') return;
  state.view = 'home';
  setStatus(t('status.grantPermissions', { permissions: describeMissingPermissions(event.missing) }), 'warning');
  await refreshAll();
}

async function handleRecordingCommand(command: RecordingCommand): Promise<void> {
  if (command === 'start') {
    await refreshAll();
    await startRecording('shortcut');
    return;
  }
  if (command === 'cancel') {
    cancelRecording();
    return;
  }
  await stopRecording();
}

function startOnboarding(): void {
  onboardingController = createOnboardingController({
    navigateTo: (view) => navigateTo(view),
    getDesktopStatus: () => window.opentypeless.getDesktopStatus(),
    getShortcutDisplay: () => shortcutKeys(state.desktop.shortcuts.startRecording),
    onRecordingCommand: (callback) => window.opentypeless.onRecordingCommand(callback),
    onPipelineComplete: (callback) => {
      pipelineCompleteCallbacks.push(callback);
      return () => {
        pipelineCompleteCallbacks = pipelineCompleteCallbacks.filter((cb) => cb !== callback);
      };
    }
  });
  onboardingController.start();
}

function showPermissionLostModal(missing: DesktopPermissionKind[]): void {
  if (document.querySelector('.perm-modal-backdrop')) return;

  const permNames = missing.map((k) =>
    k === 'microphone' ? t('settings.microphone') : t('settings.accessibility')
  ).join(', ');

  const backdrop = document.createElement('div');
  backdrop.className = 'perm-modal-backdrop';
  backdrop.innerHTML = `
    <div class="perm-modal">
      <h3 class="perm-modal-title">${t('onboarding.permissionLost.title')}</h3>
      <p class="perm-modal-body">${t('onboarding.permissionLost.description', { permissions: permNames })}</p>
      <div class="perm-modal-actions">
        <button class="btn btn-secondary btn-sm" data-perm-modal="dismiss">${t('onboarding.permissionLost.dismiss')}</button>
        <button class="btn btn-primary btn-sm" data-perm-modal="open-settings">${t('onboarding.permissionLost.openSettings')}</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('perm-modal-backdrop--visible'));

  function dismiss(): void {
    backdrop.classList.remove('perm-modal-backdrop--visible');
    backdrop.addEventListener('transitionend', () => backdrop.remove(), { once: true });
    setTimeout(() => backdrop.remove(), 300);
  }

  backdrop.querySelector('[data-perm-modal="dismiss"]')?.addEventListener('click', dismiss);
  backdrop.querySelector('[data-perm-modal="open-settings"]')?.addEventListener('click', () => {
    dismiss();
    for (const kind of missing) {
      void window.opentypeless.openPermissionSettings(kind);
    }
  });
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

  onLanguageChanged(() => render());

  render();

  if (!isOnboardingCompleted()) {
    startOnboarding();
  }
}

void boot();
