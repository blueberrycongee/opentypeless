import './styles.css';

import type { OverlayState, OverlayStep } from '../../shared/ipc';

const STEP_LABELS: Record<OverlayStep, string> = {
  transcribing: 'Transcribing\u2026',
  rewriting: 'Rewriting\u2026',
  inserting: 'Inserting\u2026'
};

let currentState: OverlayState = { kind: 'hidden' };
let timerInterval: number | null = null;
let recordingStartMs = 0;

function getRoot(): HTMLElement {
  return document.getElementById('overlay')!;
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

// ── Renderers ──────────────────────────────────────────────────────

function renderRecording(startedAtIso: string): string {
  recordingStartMs = new Date(startedAtIso).getTime();
  const elapsed = Math.max(0, Date.now() - recordingStartMs);

  return `
    <div class="state-recording">
      <div class="rec-dot"></div>
      <span class="ov-timer" id="ov-timer">${formatElapsed(elapsed)}</span>
      <div class="ov-spacer"></div>
      <span class="kbd-badge" data-action="cancel">esc</span>
      <button class="glass-btn" data-action="stop">
        <span class="stop-icon"></span>
        Stop
      </button>
    </div>
  `;
}

function renderProcessing(steps: Array<{ id: OverlayStep; status: string }>): string {
  const activeStep = steps.find((s) => s.status === 'active');
  const label = activeStep ? STEP_LABELS[activeStep.id] : 'Processing\u2026';

  return `
    <div class="state-processing">
      <div class="step-label-wrapper">
        <span class="step-label visible">${label}</span>
      </div>
      <div class="progress-bar">
        <div class="progress-shimmer"></div>
      </div>
    </div>
  `;
}

function renderSuccess(targetAppName: string | null): string {
  const label = targetAppName ? 'Done' : 'Copied';

  return `
    <div class="state-success">
      <svg class="checkmark" viewBox="0 0 16 16" fill="none">
        <path d="M4 8.5 L7 11.5 L12 5"
          stroke="var(--ov-text-primary)"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round" />
      </svg>
      <span class="success-label">${label}</span>
    </div>
  `;
}

function renderError(message: string): string {
  const parts = message.split(':');
  const title = 'Pipeline failed';
  const detail = message.length > 80 ? message.slice(0, 80) + '\u2026' : message;

  return `
    <div class="state-error">
      <div class="error-title">${title}</div>
      <div class="error-detail">${escapeHtml(detail)}</div>
      <div class="error-actions">
        <button class="glass-btn" data-action="dismiss">Dismiss</button>
      </div>
    </div>
  `;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── State rendering ────────────────────────────────────────────────

function render(state: OverlayState): void {
  const root = getRoot();

  stopTimer();

  let inner = '';
  switch (state.kind) {
    case 'recording':
      inner = renderRecording(state.startedAtIso);
      break;
    case 'processing':
      inner = renderProcessing(state.steps);
      break;
    case 'success':
      inner = renderSuccess(state.targetAppName);
      break;
    case 'error':
      inner = renderError(state.message);
      break;
    case 'hidden':
      root.innerHTML = '';
      return;
  }

  const container = root.querySelector('.overlay-container');
  if (container) {
    container.innerHTML = inner;
  } else {
    root.innerHTML = `<div class="overlay-container visible">${inner}</div>`;
  }

  bindActions();

  if (state.kind === 'recording') {
    startTimer();
  }
}

// ── Timer ──────────────────────────────────────────────────────────

function startTimer(): void {
  timerInterval = window.setInterval(() => {
    const el = document.getElementById('ov-timer');
    if (el && recordingStartMs > 0) {
      el.textContent = formatElapsed(Date.now() - recordingStartMs);
    }
  }, 100);
}

function stopTimer(): void {
  if (timerInterval !== null) {
    window.clearInterval(timerInterval);
    timerInterval = null;
  }
}

// ── Action binding ─────────────────────────────────────────────────

function bindActions(): void {
  const root = getRoot();

  root.querySelectorAll<HTMLElement>('[data-action]').forEach((el) => {
    el.addEventListener('click', () => {
      const action = el.dataset.action;
      if (action === 'stop') {
        window.overlayBridge.sendAction({ kind: 'stop' });
      } else if (action === 'cancel') {
        window.overlayBridge.sendAction({ kind: 'cancel' });
      } else if (action === 'dismiss') {
        window.overlayBridge.sendAction({ kind: 'dismiss' });
      }
    });
  });

  root.addEventListener('mousedown', () => {
    window.overlayBridge.sendAction({ kind: 'request-focus' });
  }, { once: true });
}

// ── Keyboard handling ──────────────────────────────────────────────

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && currentState.kind === 'recording') {
    window.overlayBridge.sendAction({ kind: 'cancel' });
  }
});

// ── Boot ───────────────────────────────────────────────────────────

window.overlayBridge.onState((state) => {
  currentState = state;
  render(state);
});
