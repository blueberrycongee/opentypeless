import './styles.css';

import type { DictationSession, RuntimeInfo } from '../shared/ipc';

interface AppState {
  info: RuntimeInfo;
  isRecording: boolean;
  recorder: MediaRecorder | null;
  recordingStartedAt: number | null;
  sessions: DictationSession[];
  statusMessage: string;
  stream: MediaStream | null;
}

const state: AppState = {
  info: null as unknown as RuntimeInfo,
  isRecording: false,
  recorder: null,
  recordingStartedAt: null,
  sessions: [],
  statusMessage: 'Ready to capture microphone audio and store it locally.',
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
    return '<li class="empty-state">No recordings saved yet. Start one to verify the local pipeline.</li>';
  }

  return sessions
    .map(
      (session) => `
        <li class="session-card">
          <div>
            <p class="module-label">${session.audio.fileName}</p>
            <p class="module-note">${formatSessionMeta(session)}</p>
          </div>
          <div class="session-pipeline">
            <span class="module-status module-status--${session.pipeline.transcription}">transcription ${session.pipeline.transcription}</span>
            <span class="module-status module-status--${session.pipeline.rewrite}">rewrite ${session.pipeline.rewrite}</span>
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

  return `${createdAt} • ${formatDuration(session.durationMs)} • ${kilobytes} KB • ${session.audio.relativePath}`;
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
        <h1>${state.info.appName} desktop shell</h1>
        <p class="lead">
          The raw-audio pipeline is now live: record from the microphone, persist the source file,
          and enqueue the transcript and rewrite stages for future model integration.
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
        </div>
      </section>

      <section class="panel recorder-panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Local dictation pipeline</p>
            <h2>Capture -> store -> queue models</h2>
          </div>
        </div>
        <p class="status-banner">${state.statusMessage}</p>
        <div class="button-row">
          <button id="start-recording" class="action-button" ${state.isRecording ? 'disabled' : ''}>Start recording</button>
          <button id="stop-recording" class="action-button action-button--secondary" ${state.isRecording ? '' : 'disabled'}>Stop and save</button>
          <button id="refresh-sessions" class="ghost-button">Refresh sessions</button>
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
    void refreshSessions();
  });
}

async function refreshSessions(): Promise<void> {
  state.sessions = await window.opentypeless.listDictationSessions();
  render();
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
    state.statusMessage = `Saved ${saved.audio.fileName}. The transcription and rewrite stages are queued as pending.`;
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
  const [info, sessions] = await Promise.all([
    window.opentypeless.getRuntimeInfo(),
    window.opentypeless.listDictationSessions()
  ]);
  state.info = info;
  state.sessions = sessions;
  render();
}

void boot();
