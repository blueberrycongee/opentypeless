import { t } from '../i18n';
import {
  createOverlayElements,
  mountOverlay,
  unmountOverlay,
  positionSpotlight,
  positionTooltip,
  renderTooltipContent,
  bindTooltipActions,
  type OverlayElements
} from './onboarding-overlay';
import {
  ONBOARDING_STEPS,
  STORAGE_KEY,
} from './onboarding-steps';
import type { DesktopStatus, RecordingCommand } from '../../shared/ipc';

export interface OnboardingControllerDeps {
  navigateTo: (view: 'home' | 'settings') => void;
  getDesktopStatus: () => Promise<DesktopStatus>;
  getShortcutDisplay: () => string;
  onRecordingCommand: (callback: (cmd: RecordingCommand) => void) => () => void;
  onPipelineComplete: (callback: () => void) => () => void;
}

type TryItSubState = 'waiting' | 'recording' | 'processing' | 'success';

export interface OnboardingController {
  start: () => void;
  destroy: () => void;
  isActive: () => boolean;
}

export function isOnboardingCompleted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function markCompleted(): void {
  try {
    localStorage.setItem(STORAGE_KEY, 'true');
  } catch {
    /* ignore */
  }
}

export function clearOnboardingCompleted(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function createOnboardingController(
  deps: OnboardingControllerDeps
): OnboardingController {
  let stepIndex = -1;
  let elements: OverlayElements | null = null;
  let permissionPollTimer: number | null = null;
  let tryItSubState: TryItSubState = 'waiting';
  let cleanupRecordingListener: (() => void) | null = null;
  let cleanupPipelineListener: (() => void) | null = null;
  let active = false;

  function currentStep() {
    return ONBOARDING_STEPS[stepIndex] ?? null;
  }

  function complete(): void {
    markCompleted();
    cleanup();
    if (elements) {
      unmountOverlay(elements);
      elements = null;
    }
    active = false;
    deps.navigateTo('home');
  }

  function cleanup(): void {
    if (permissionPollTimer !== null) {
      clearInterval(permissionPollTimer);
      permissionPollTimer = null;
    }
    cleanupRecordingListener?.();
    cleanupRecordingListener = null;
    cleanupPipelineListener?.();
    cleanupPipelineListener = null;
  }

  function goToStep(index: number): void {
    cleanup();
    stepIndex = index;
    const step = currentStep();
    if (!step) {
      complete();
      return;
    }

    if (step.page) {
      deps.navigateTo(step.page);
    }

    // Wait for DOM to settle after page navigation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        renderStep();
      });
    });
  }

  function advance(): void {
    goToStep(stepIndex + 1);
  }

  function renderStep(): void {
    const step = currentStep();
    if (!step || !elements) return;

    const spotlightRect = positionSpotlight(elements.spotlight, step.targetSelector);
    positionTooltip(elements.tooltip, step.tooltipPosition, spotlightRect);

    const shortcut = deps.getShortcutDisplay();

    // Build tooltip content based on step
    let title = t(`${step.i18nPrefix}.title`);
    let body = t(`${step.i18nPrefix}.description`, { shortcut });
    let primaryLabel: string | null = null;
    let onPrimary: (() => void) | null = null;
    let skipLabel: string | null = t('onboarding.skip');
    let onSkip: (() => void) | null = () => advance();

    if (step.id === 'welcome') {
      primaryLabel = t('onboarding.welcome.cta');
      onPrimary = () => advance();
      skipLabel = null;
      onSkip = null;
    } else if (step.id === 'permissions') {
      primaryLabel = null;
      onPrimary = null;
      startPermissionPolling();
      updatePermissionBody();
      return; // Permission step renders its own content in the poll
    } else if (step.id === 'shortcuts') {
      primaryLabel = t('onboarding.shortcuts.cta');
      onPrimary = () => advance();
    } else if (step.id === 'tryit') {
      tryItSubState = 'waiting';
      startTryItListeners();
      body = t('onboarding.tryit.waiting');
      primaryLabel = null;
    }

    setTooltipContent(title, body, primaryLabel, onPrimary, skipLabel, onSkip);
  }

  function setTooltipContent(
    title: string,
    body: string,
    primaryLabel: string | null,
    onPrimary: (() => void) | null,
    skipLabel: string | null,
    onSkip: (() => void) | null
  ): void {
    if (!elements) return;

    elements.tooltip.innerHTML = renderTooltipContent({
      title,
      body,
      primaryLabel,
      onPrimary,
      skipLabel,
      onSkip,
      skipAllLabel: t('onboarding.skipAll'),
      onSkipAll: complete,
      stepIndex,
      totalSteps: ONBOARDING_STEPS.length
    });

    bindTooltipActions(elements.tooltip, {
      onPrimary: onPrimary ?? undefined,
      onSkip: onSkip ?? undefined,
      onSkipAll: complete
    });
  }

  function updatePermissionBody(): void {
    void deps.getDesktopStatus().then((status) => {
      if (!elements || currentStep()?.id !== 'permissions') return;

      const micGranted = status.permissions.microphone === 'granted';
      const accGranted = status.permissions.accessibility === 'granted';

      const micLine = micGranted
        ? t('onboarding.permissions.micGranted')
        : t('onboarding.permissions.micMissing');
      const accLine = accGranted
        ? t('onboarding.permissions.accGranted')
        : t('onboarding.permissions.accMissing');

      const body = `${t('onboarding.permissions.description')}<br><br>
        <span class="badge ${micGranted ? 'badge-green' : 'badge-red'} onboarding-perm-badge">${micLine}</span><br>
        <span class="badge ${accGranted ? 'badge-green' : 'badge-red'} onboarding-perm-badge">${accLine}</span><br><br>
        ${!micGranted || !accGranted ? t('onboarding.permissions.hint') : ''}`;

      setTooltipContent(
        t('onboarding.permissions.title'),
        body,
        null,
        null,
        t('onboarding.skip'),
        () => advance()
      );

      if (micGranted && accGranted) {
        setTimeout(() => advance(), 600);
      }
    });
  }

  function startPermissionPolling(): void {
    updatePermissionBody();
    permissionPollTimer = window.setInterval(() => {
      updatePermissionBody();
    }, 1000);
  }

  function startTryItListeners(): void {
    const shortcut = deps.getShortcutDisplay();

    cleanupRecordingListener = deps.onRecordingCommand((cmd) => {
      if (!elements || currentStep()?.id !== 'tryit') return;

      if (cmd === 'start' && tryItSubState === 'waiting') {
        tryItSubState = 'recording';
        setTooltipContent(
          t('onboarding.tryit.title'),
          t('onboarding.tryit.recording', { shortcut }),
          null, null,
          t('onboarding.skip'), () => advance()
        );
      } else if (cmd === 'stop' && tryItSubState === 'recording') {
        tryItSubState = 'processing';
        setTooltipContent(
          t('onboarding.tryit.title'),
          t('onboarding.tryit.processing'),
          null, null,
          t('onboarding.skip'), () => advance()
        );
      }
    });

    cleanupPipelineListener = deps.onPipelineComplete(() => {
      if (!elements || currentStep()?.id !== 'tryit') return;
      if (tryItSubState !== 'processing' && tryItSubState !== 'recording') return;

      tryItSubState = 'success';
      setTooltipContent(
        t('onboarding.tryit.success'),
        t('onboarding.tryit.successDescription'),
        t('onboarding.tryit.cta'), () => complete(),
        null, null
      );
    });
  }

  return {
    start() {
      if (active) return;
      active = true;
      elements = createOverlayElements();
      mountOverlay(elements);
      goToStep(0);
    },

    destroy() {
      cleanup();
      if (elements) {
        elements.backdrop.remove();
        elements.spotlight.remove();
        elements.tooltip.remove();
        elements = null;
      }
      active = false;
    },

    isActive() {
      return active;
    }
  };
}
