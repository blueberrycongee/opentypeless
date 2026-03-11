import type {
  OverlayAction,
  OverlayState,
  OverlayStateProcessing,
  OverlayStep,
  OverlayStepStatus
} from '../../shared/ipc';

const ALL_STEPS: OverlayStep[] = ['transcribing', 'rewriting', 'inserting'];
const SUCCESS_DISPLAY_MS = 1200;

export interface OverlayWindow {
  sendState: (state: OverlayState) => void;
  show: () => void;
  hide: () => void;
  destroy: () => void;
  setFocusable: (value: boolean) => void;
  focus: () => void;
  setHeight: (height: number) => void;
  isDestroyed: () => boolean;
}

export interface OverlayManagerDeps {
  createWindow: () => OverlayWindow;
}

export interface OverlayManager {
  showRecording: () => void;
  transitionToProcessing: () => void;
  updateProcessingStep: (step: OverlayStep, status: OverlayStepStatus) => void;
  transitionToSuccess: (targetAppName: string | null) => void;
  transitionToError: (message: string) => void;
  hide: () => void;
  isActive: () => boolean;
  onAction: (handler: (action: OverlayAction) => void) => void;
  handleRendererAction: (action: OverlayAction) => void;
  destroy: () => void;
}

export function createOverlayManager(deps: OverlayManagerDeps): OverlayManager {
  let window: OverlayWindow | null = null;
  let active = false;
  let currentState: OverlayState = { kind: 'hidden' };
  let processingSteps: OverlayStateProcessing['steps'] = [];
  let actionHandler: ((action: OverlayAction) => void) | null = null;
  let successTimeout: ReturnType<typeof setTimeout> | null = null;

  function getWindow(): OverlayWindow {
    if (!window || window.isDestroyed()) {
      window = deps.createWindow();
    }
    return window;
  }

  function pushState(state: OverlayState): void {
    currentState = state;
    const win = getWindow();
    win.sendState(state);
  }

  function clearSuccessTimeout(): void {
    if (successTimeout !== null) {
      clearTimeout(successTimeout);
      successTimeout = null;
    }
  }

  return {
    showRecording(): void {
      clearSuccessTimeout();
      active = true;
      const win = getWindow();
      const state: OverlayState = {
        kind: 'recording',
        startedAtIso: new Date().toISOString()
      };
      pushState(state);
      win.setHeight(44);
      win.show();
    },

    transitionToProcessing(): void {
      processingSteps = ALL_STEPS.map((id) => ({ id, status: 'pending' as OverlayStepStatus }));
      const state: OverlayState = {
        kind: 'processing',
        steps: [...processingSteps]
      };
      pushState(state);
      getWindow().setHeight(56);
    },

    updateProcessingStep(step: OverlayStep, status: OverlayStepStatus): void {
      const stepIndex = ALL_STEPS.indexOf(step);
      processingSteps = ALL_STEPS.map((id, i) => {
        if (i < stepIndex) return { id, status: 'done' as OverlayStepStatus };
        if (i === stepIndex) return { id, status };
        return { id, status: processingSteps[i]?.status ?? 'pending' as OverlayStepStatus };
      });
      const state: OverlayState = {
        kind: 'processing',
        steps: [...processingSteps]
      };
      pushState(state);
    },

    transitionToSuccess(targetAppName: string | null): void {
      const state: OverlayState = {
        kind: 'success',
        targetAppName
      };
      pushState(state);
      getWindow().setHeight(44);
      successTimeout = setTimeout(() => {
        this.hide();
      }, SUCCESS_DISPLAY_MS);
    },

    transitionToError(message: string): void {
      const state: OverlayState = {
        kind: 'error',
        message
      };
      pushState(state);
      getWindow().setHeight(80);
    },

    hide(): void {
      clearSuccessTimeout();
      active = false;
      if (window && !window.isDestroyed()) {
        pushState({ kind: 'hidden' });
        window.hide();
      }
    },

    isActive(): boolean {
      return active;
    },

    onAction(handler: (action: OverlayAction) => void): void {
      actionHandler = handler;
    },

    handleRendererAction(action: OverlayAction): void {
      if (action.kind === 'request-focus' && window && !window.isDestroyed()) {
        window.setFocusable(true);
        window.focus();
        setTimeout(() => {
          if (window && !window.isDestroyed()) {
            window.setFocusable(false);
          }
        }, 200);
        return;
      }
      actionHandler?.(action);
    },

    destroy(): void {
      clearSuccessTimeout();
      active = false;
      if (window && !window.isDestroyed()) {
        window.destroy();
      }
      window = null;
    }
  };
}
