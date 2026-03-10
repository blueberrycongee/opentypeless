import './styles.css';

import type { CompleteDictationResult, DesktopAttentionEvent, DesktopPermissionKind, DesktopStatus, DictationSession, RecordingCommand, RuntimeInfo, SentMessage } from '../shared/ipc';

interface AppState {
  info: RuntimeInfo;
  desktop: DesktopStatus;
  isRecording: boolean;
  isRefreshing: boolean;
  busySessionId: string | null;
  recorder: MediaRecorder | null;
  recordingStartedAt: number | null;
  sessions: DictationSession[];
  sentMessages: SentMessage[];
  statusMessage: string;
  stream: MediaStream | null;
}

const state: AppState = {
  info: null as unknown as RuntimeInfo,
  desktop: null as unknown as DesktopStatus,
  isRecording: false,
  isRefreshing: false,
  busySessionId: null,
  recorder: null,
  recordingStartedAt: null,
  sessions: [],
  sentMessages: [],
  statusMessage: 'Grant permissions, then press the global shortcut to dictate into the app currently under your cursor.',
  stream: null
};

function isPermissionGranted(kind: DesktopPermissionKind): boolean {
  return state.desktop.permissions[kind] === 'granted';
}

function permissionTone(kind: DesktopPermissionKind): 'ready' | 'blocked' {
  return isPermissionGranted(kind) ? 'ready' : 'blocked';
}

function permissionStepCopy(kind: DesktopPermissionKind): string {
  if (kind === 'microphone') {
    return isPermissionGranted('microphone')
      ? 'Microphone access is ready. OpenTypeless can capture speech when you start dictation.'
      : 'OpenTypeless needs microphone access to capture speech as soon as the shortcut starts recording.';
  }

  return isPermissionGranted('accessibility')
    ? 'Accessibility access is ready. OpenTypeless can paste the cleaned text back into the target app.'
    : 'Accessibility access lets OpenTypeless activate the target app and paste the rewritten text for you.';
}

function setupGuideMarkup(): string {
  const steps = [
    {
      title: 'Grant microphone access',
      detail: isPermissionGranted('microphone')
        ? 'Done. Recording can start immediately.'
        : 'Click Request, accept the macOS prompt, then come back here.'
    },
    {
      title: 'Allow Accessibility',
      detail: isPermissionGranted('accessibility')
        ? 'Done. Automatic paste is available.'
        : 'Click Request. If macOS sends you to System Settings, enable OpenTypeless under Accessibility.'
    },
    {
      title: 'Dictate in any app',
      detail: `Focus the app where you want text to land, press ${state.desktop.shortcuts.startRecording}, then stop with ${state.desktop.shortcuts.stopRecording}.`
    }
  ];

  return `
    <div class="setup-guide">
      <div>
        <span class="meta-label">Recommended flow</span>
        <h3>Get to first successful dictation</h3>
      </div>
      <ol class="setup-steps">
        ${steps
          .map((step, index) => `
            <li class="setup-step">
              <span class="setup-step-index">0${index + 1}</span>
              <div>
                <p class="module-label">${step.title}</p>
                <p class="module-note">${step.detail}</p>
              </div>
            </li>
          `)
          .join('')}
      </ol>
    </div>
  `;
}

function moduleMarkup(info: RuntimeInfo): string {
  return info.modules
    .map(
      (module) => `
        <li class="module-card">
          <div>
            <p class="module-label">${module.label}</p>
            <p class="module-note">${module.note}</p>
          </div>
          <span class="module-status module-status--${module.status}">${module.status}</span>
        </li>
      `
    )
    .join('');
}

function permissionMarkup(): string {
  return `
    <div class="permission-grid">
      <div class="permission-card permission-card--${permissionTone('microphone')}">
        <div>
          <span class="meta-label">Microphone</span>
          <strong>${state.desktop.permissions.microphone}</strong>
          <p class="module-note">${permissionStepCopy('microphone')}</p>
        </div>
        <div class="permission-actions">
          <button id="request-microphone" class="ghost-button" ${isPermissionGranted('microphone') ? 'disabled' : ''}>${isPermissionGranted('microphone') ? 'Granted' : 'Request'}</button>
          <button id="open-microphone-settings" class="ghost-button">Open settings</button>
        </div>
      </div>
      <div class="permission-card permission-card--${permissionTone('accessibility')}">
        <div>
          <span class="meta-label">Accessibility</span>
          <strong>${state.desktop.permissions.accessibility}</strong>
          <p class="module-note">${permissionStepCopy('accessibility')}</p>
        </div>
        <div class="permission-actions">
          <button id="request-accessibility" class="ghost-button" ${isPermissionGranted('accessibility') ? 'disabled' : ''}>${isPermissionGranted('accessibility') ? 'Granted' : 'Request'}</button>
          <button id="open-accessibility-settings" class="ghost-button">Open settings</button>
        </div>
      </div>
    </div>
  `;
}

function shortcutMarkup(): string {
  const target = state.desktop.activeTargetAppName ? `Target app: ${state.desktop.activeTargetAppName}` : 'No external target app captured yet.';
  return `
    <div class="shortcut-card">
      <div>
        <span class="meta-label">Global shortcuts</span>
        <div class="shortcut-stack">
          <strong>Start: ${state.desktop.shortcuts.startRecording}</strong>
          <strong>Stop: ${state.desktop.shortcuts.stopRecording}</strong>
        </div>
      </div>
      <p class="module-note">${target}</p>
    </div>
  `;
}

function sessionMarkup(sessions: DictationSession[]): string {
  if (sessions.length === 0) {
    return '<li class="empty-state">No recordings saved yet. Use the global shortcut or the local controls below.</li>';
  }

  return sessions
    .map((session) => {
      const busy = state.busySessionId === session.id;
      const canProcess = !busy && session.pipeline.send !== 'completed';
      return `
        <li class="session-card">
          <div class="session-main">
            <div>
              <p class="module-label">${session.audio.fileName}</p>
              <p class="module-note">${formatSessionMeta(session)}</p>
            </div>
            <div class="session-pipeline">
              <span class="module-status module-status--${session.pipeline.transcription}">transcription ${session.pipeline.transcription}</span>
              <span class="module-status module-status--${session.pipeline.rewrite}">rewrite ${session.pipeline.rewrite}</span>
              <span class="module-status module-status--${session.pipeline.send}">send ${session.pipeline.send}</span>
            </div>
            ${session.transcript ? `<div class="result-block"><span class="result-label">Transcript</span><p>${session.transcript.text}</p></div>` : ''}
            ${session.rewrite ? `<div class="result-block"><span class="result-label">Rewritten</span><p>${session.rewrite.text}</p></div>` : ''}
            ${session.delivery ? `<div class="result-block"><span class="result-label">Delivered</span><p>${session.delivery.deliveredText}</p></div>` : ''}
            ${session.error ? `<div class="result-block result-block--error"><span class="result-label">Error</span><p>${session.error}</p></div>` : ''}
          </div>
          <div class="session-actions">
            <button class="ghost-button" data-process-session="${session.id}" ${canProcess ? '' : 'disabled'}>
              ${busy ? 'Processing...' : session.pipeline.send === 'completed' ? 'Sent' : 'Run local pipeline'}
            </button>
          </div>
        </li>
      `;
    })
    .join('');
}

function outboxMarkup(sentMessages: SentMessage[]): string {
  if (sentMessages.length === 0) {
    return '<li class="empty-state">No simulated messages have been delivered yet.</li>';
  }

  return sentMessages
    .map(
      (message) => `
        <li class="session-card">
          <div class="session-main">
            <p class="module-label">${message.text}</p>
            <p class="module-note">${new Date(message.deliveredAt).toLocaleString()} • ${message.channel} • session ${message.sessionId}</p>
          </div>
        </li>
      `
    )
    .join('');
}

function formatDuration(durationMs: number | null): string {
  if (durationMs === null) {
    return 'unknown duration';
  }

  if (durationMs < 1000) {
    return `${durationMs} ms`;
  }

  return `${(durationMs / 1000).toFixed(1)} s`;
}

function formatSessionMeta(session: DictationSession): string {
  const createdAt = new Date(session.createdAt).toLocaleString();
  const kilobytes = (session.audio.bytes / 1024).toFixed(1);
  const normalized = session.audio.normalizedRelativePath ? ` • normalized ${session.audio.normalizedRelativePath}` : '';

  return `${createdAt} • ${formatDuration(session.durationMs)} • ${kilobytes} KB • ${session.audio.relativePath}${normalized}`;
}

function render(): void {
  const root = document.getElementById('app');
  if (!root) {
    throw new Error('Renderer root #app was not found.');
  }

  root.innerHTML = `
    <main class="shell">
      <section class="hero">
        <p class="eyebrow">Desktop-first open source AI dictation</p>
        <h1>${state.info.appName} desktop workflow</h1>
        <p class="lead">
          Give the app microphone and accessibility permission, then use the global shortcuts to start and stop dictation.
          OpenTypeless records, transcribes, rewrites, and pastes the result back into the app that was focused when recording began.
        </p>
        <div class="meta-row">
          <div class="meta-card">
            <span class="meta-label">Platform</span>
            <strong>${state.info.platform}</strong>
          </div>
          <div class="meta-card">
            <span class="meta-label">Saved sessions</span>
            <strong>${state.sessions.length}</strong>
          </div>
          <div class="meta-card">
            <span class="meta-label">Simulated sends</span>
            <strong>${state.sentMessages.length}</strong>
          </div>
        </div>
      </section>

      <section class="panel recorder-panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Permissions and shortcuts</p>
            <h2>Grant access, then dictate anywhere</h2>
          </div>
        </div>
        <p class="status-banner">${state.statusMessage}</p>
        ${setupGuideMarkup()}
        ${permissionMarkup()}
        ${shortcutMarkup()}
        <div class="button-row">
          <button id="start-recording" class="action-button" ${state.isRecording ? 'disabled' : ''}>Start locally</button>
          <button id="stop-recording" class="action-button action-button--secondary" ${state.isRecording ? '' : 'disabled'}>Stop locally</button>
          <button id="refresh-data" class="ghost-button" ${state.isRefreshing ? 'disabled' : ''}>Refresh data</button>
        </div>
      </section>

      <section class="panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Architecture map</p>
            <h2>MVP module placeholders</h2>
          </div>
        </div>
        <ul class="module-grid">${moduleMarkup(state.info)}</ul>
      </section>

      <section class="panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Saved source audio</p>
            <h2>Session queue</h2>
          </div>
        </div>
        <ul class="session-list">${sessionMarkup(state.sessions)}</ul>
      </section>

      <section class="panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Simulated delivery</p>
            <h2>Outbox</h2>
          </div>
        </div>
        <ul class="session-list">${outboxMarkup(state.sentMessages)}</ul>
      </section>
    </main>
  `;

  bindUi();
}

function bindUi(): void {
  document.getElementById('start-recording')?.addEventListener('click', () => {
    void startRecording('manual');
  });
  document.getElementById('stop-recording')?.addEventListener('click', () => {
    void stopRecording();
  });
  document.getElementById('refresh-data')?.addEventListener('click', () => {
    void refreshAll();
  });
  document.getElementById('request-microphone')?.addEventListener('click', () => {
    void requestMicrophonePermission();
  });
  document.getElementById('request-accessibility')?.addEventListener('click', () => {
    void requestAccessibilityPermission();
  });
  document.getElementById('open-microphone-settings')?.addEventListener('click', () => {
    void openPermissionSettings('microphone');
  });
  document.getElementById('open-accessibility-settings')?.addEventListener('click', () => {
    void openPermissionSettings('accessibility');
  });

  document.querySelectorAll<HTMLButtonElement>('[data-process-session]').forEach((button) => {
    button.addEventListener('click', () => {
      const sessionId = button.dataset.processSession;
      if (sessionId) {
        void processSession(sessionId);
      }
    });
  });
}

async function refreshAll(): Promise<void> {
  state.isRefreshing = true;
  render();
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
  state.statusMessage = granted
    ? 'Microphone access granted. You can now start dictation.'
    : 'Microphone access is still unavailable. Open System Settings if the prompt did not appear.';
  await refreshAll();
}

async function requestAccessibilityPermission(): Promise<void> {
  const granted = await window.opentypeless.requestAccessibilityPermission();
  state.statusMessage = granted
    ? 'Accessibility access granted. OpenTypeless can paste into the focused app.'
    : 'Accessibility access is still unavailable. Open System Settings and allow OpenTypeless under Accessibility.';
  await refreshAll();
}

async function openPermissionSettings(kind: 'microphone' | 'accessibility'): Promise<void> {
  await window.opentypeless.openPermissionSettings(kind);
  state.statusMessage = `Opened ${kind} settings. Grant access there, then return here and refresh.`;
  render();
}

async function processSession(sessionId: string): Promise<void> {
  state.busySessionId = sessionId;
  state.statusMessage = 'Running local transcription, rewrite, and simulated send...';
  render();

  try {
    const processed = await window.opentypeless.processDictationSession(sessionId);
    state.sessions = state.sessions.map((session) => (session.id === processed.id ? processed : session));
    state.sentMessages = await window.opentypeless.listSentMessages();
    state.statusMessage = `Completed local pipeline for ${processed.audio.fileName}.`;
  } catch (error) {
    state.statusMessage = `Pipeline failed: ${errorMessage(error)}`;
  } finally {
    state.busySessionId = null;
    await refreshAll();
  }
}

async function startRecording(source: 'manual' | 'shortcut'): Promise<void> {
  if (state.isRecording) {
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    state.statusMessage = 'This environment does not support microphone capture.';
    render();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = pickMimeType();
    const chunks: Blob[] = [];
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    });

    recorder.addEventListener('stop', () => {
      void finalizeRecording(chunks, recorder.mimeType || mimeType || 'audio/webm');
    });

    recorder.start(250);
    state.isRecording = true;
    state.recorder = recorder;
    state.recordingStartedAt = Date.now();
    state.stream = stream;
    state.statusMessage =
      source === 'shortcut'
        ? 'Global shortcut started recording. Speak into the app you were using, then press the stop shortcut.'
        : 'Manual recording started. This is useful for local testing inside the app window.';
    render();
  } catch (error) {
    state.statusMessage = `Unable to access microphone: ${errorMessage(error)}`;
    render();
  }
}

async function stopRecording(): Promise<void> {
  if (!state.recorder || !state.isRecording) {
    return;
  }

  state.statusMessage = 'Stopping capture and writing the raw audio file...';
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
    state.sessions = [saved, ...state.sessions];
    state.busySessionId = saved.id;
    state.statusMessage = `Saved ${saved.audio.fileName}. Running transcription, rewrite, and paste...`;
    render();

    const result = await window.opentypeless.completeDictationSession(saved.id);
    applyCompletionResult(result);
  } catch (error) {
    stopStream();
    state.isRecording = false;
    state.recorder = null;
    state.recordingStartedAt = null;
    state.busySessionId = null;
    state.statusMessage = `Recording failed: ${errorMessage(error)}`;
    render();
  }
}

function applyCompletionResult(result: CompleteDictationResult): void {
  state.sessions = state.sessions.map((session) => (session.id === result.processed.id ? result.processed : session));
  state.busySessionId = null;

  if (result.inserted) {
    state.statusMessage = `Inserted rewritten text into ${result.targetAppName ?? 'the focused app'}.`;
  } else {
    state.statusMessage = 'Processed the dictation, but there was no external target app available for insertion.';
  }

  void refreshAll();
}

function stopStream(): void {
  state.stream?.getTracks().forEach((track) => track.stop());
  state.stream = null;
}

function pickMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm'];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? '';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function describeMissingPermissions(missing: DesktopPermissionKind[]): string {
  if (missing.length === 2) {
    return 'microphone and accessibility permissions';
  }

  return missing[0] === 'microphone' ? 'microphone permission' : 'accessibility permission';
}

async function handleDesktopAttention(event: DesktopAttentionEvent): Promise<void> {
  if (event.kind !== 'permission-required') {
    return;
  }

  state.statusMessage = `OpenTypeless cannot start dictation yet. Please grant ${describeMissingPermissions(event.missing)} first.`;
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
  window.opentypeless.onRecordingCommand((command) => {
    void handleRecordingCommand(command);
  });
  window.opentypeless.onDesktopAttention((event) => {
    void handleDesktopAttention(event);
  });
  render();
}

void boot();
