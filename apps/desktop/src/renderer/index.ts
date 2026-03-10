import './styles.css';

import type { DictationSession, RuntimeInfo, SentMessage } from '../shared/ipc';

interface AppState {
  info: RuntimeInfo;
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
  isRecording: false,
  isRefreshing: false,
  busySessionId: null,
  recorder: null,
  recordingStartedAt: null,
  sessions: [],
  sentMessages: [],
  statusMessage: 'Ready to capture microphone audio, transcribe it locally, rewrite it locally, and simulate a send.',
  stream: null
};

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

function sessionMarkup(sessions: DictationSession[]): string {
  if (sessions.length === 0) {
    return '<li class="empty-state">No recordings saved yet. Record one to drive the local pipeline.</li>';
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
              ${busy ? 'Processing...' : session.pipeline.send === 'completed' ? 'Sent' : 'Run full local pipeline'}
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
        <h1>${state.info.appName} local AI shell</h1>
        <p class="lead">
          Record from the microphone, persist the source audio, normalize it locally, transcribe it with Whisper,
          rewrite it with a local open-source LLM, and simulate the final send.
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
            <p class="eyebrow">Local dictation pipeline</p>
            <h2>Capture -> transcribe -> rewrite -> simulate send</h2>
          </div>
        </div>
        <p class="status-banner">${state.statusMessage}</p>
        <div class="button-row">
          <button id="start-recording" class="action-button" ${state.isRecording ? 'disabled' : ''}>Start recording</button>
          <button id="stop-recording" class="action-button action-button--secondary" ${state.isRecording ? '' : 'disabled'}>Stop and save</button>
          <button id="refresh-sessions" class="ghost-button" ${state.isRefreshing ? 'disabled' : ''}>Refresh data</button>
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
    void startRecording();
  });
  document.getElementById('stop-recording')?.addEventListener('click', () => {
    void stopRecording();
  });
  document.getElementById('refresh-sessions')?.addEventListener('click', () => {
    void refreshAll();
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
  const [sessions, sentMessages] = await Promise.all([
    window.opentypeless.listDictationSessions(),
    window.opentypeless.listSentMessages()
  ]);
  state.sessions = sessions;
  state.sentMessages = sentMessages;
  state.isRefreshing = false;
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
    render();
  }
}

async function startRecording(): Promise<void> {
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
    state.statusMessage = 'Recording from the selected microphone. Stop to save the raw audio locally.';
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
    state.statusMessage = `Saved ${saved.audio.fileName}. Run the full local pipeline when you are ready.`;
    render();
  } catch (error) {
    stopStream();
    state.isRecording = false;
    state.recorder = null;
    state.recordingStartedAt = null;
    state.statusMessage = `Recording failed: ${errorMessage(error)}`;
    render();
  }
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

async function boot(): Promise<void> {
  const [info, sessions, sentMessages] = await Promise.all([
    window.opentypeless.getRuntimeInfo(),
    window.opentypeless.listDictationSessions(),
    window.opentypeless.listSentMessages()
  ]);
  state.info = info;
  state.sessions = sessions;
  state.sentMessages = sentMessages;
  render();
}

void boot();
