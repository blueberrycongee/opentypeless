# First-Time Onboarding Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a coach-marks onboarding overlay to the Hub window that guides first-time users through welcome, permissions, shortcuts, and a real first dictation — then add an independent permission-loss modal.

**Architecture:** Three new renderer-side modules (`onboarding-controller.ts`, `onboarding-overlay.ts`, `onboarding-steps.ts`) plus CSS additions. The overlay sits on top of the existing Hub DOM via `position: fixed` elements. Integration hooks into the existing `boot()` function in `renderer/index.ts` and the existing `render()` cycle. No main-process changes needed — all IPC channels already exist.

**Tech Stack:** TypeScript, vanilla DOM (matching existing renderer patterns), CSS box-shadow spotlight technique, i18next for copy.

---

## Task 1: Add i18n strings for onboarding

**Files:**
- Modify: `apps/desktop/src/renderer/locales/en.json`
- Modify: `apps/desktop/src/renderer/locales/zh-CN.json`

**Step 1: Add English onboarding strings**

Add the following keys to `en.json` (after the existing `"badge.planned"` entry):

```json
  "onboarding.welcome.title": "Welcome to OpenTypeless",
  "onboarding.welcome.description": "Press a shortcut, speak, and your words appear wherever you're typing.",
  "onboarding.welcome.cta": "Get Started",
  "onboarding.permissions.title": "Grant Permissions",
  "onboarding.permissions.description": "OpenTypeless needs microphone access to hear you and accessibility access to type for you.",
  "onboarding.permissions.micGranted": "Microphone: Granted",
  "onboarding.permissions.micMissing": "Microphone: Not granted",
  "onboarding.permissions.accGranted": "Accessibility: Granted",
  "onboarding.permissions.accMissing": "Accessibility: Not granted",
  "onboarding.permissions.hint": "Click the Grant buttons above.",
  "onboarding.shortcuts.title": "Your Shortcut",
  "onboarding.shortcuts.description": "Press {{shortcut}} anywhere to start recording. Press again to stop.",
  "onboarding.shortcuts.cta": "Got it",
  "onboarding.tryit.title": "Let's Try It!",
  "onboarding.tryit.description": "Press {{shortcut}} now and say something.",
  "onboarding.tryit.waiting": "Waiting for you to press the shortcut...",
  "onboarding.tryit.recording": "Recording... press {{shortcut}} again to stop.",
  "onboarding.tryit.processing": "Processing your voice...",
  "onboarding.tryit.success": "You're All Set!",
  "onboarding.tryit.successDescription": "Your first dictation worked perfectly.",
  "onboarding.tryit.cta": "Start Using",
  "onboarding.skip": "Skip",
  "onboarding.skipAll": "Skip setup",
  "onboarding.restartGuide": "Restart Guide",
  "onboarding.restartGuideDesc": "Walk through the setup guide again.",
  "onboarding.permissionLost.title": "Permission Lost",
  "onboarding.permissionLost.description": "{{permissions}} has been revoked. Dictation won't work until it's restored.",
  "onboarding.permissionLost.openSettings": "Open System Settings",
  "onboarding.permissionLost.dismiss": "Dismiss"
```

**Step 2: Add Chinese onboarding strings**

Add the corresponding keys to `zh-CN.json`:

```json
  "onboarding.welcome.title": "欢迎使用 OpenTypeless",
  "onboarding.welcome.description": "按下快捷键，说话，文字就会出现在你正在输入的地方。",
  "onboarding.welcome.cta": "开始设置",
  "onboarding.permissions.title": "授予权限",
  "onboarding.permissions.description": "OpenTypeless 需要麦克风权限来听取语音，需要辅助功能权限来为你输入文字。",
  "onboarding.permissions.micGranted": "麦克风：已授权",
  "onboarding.permissions.micMissing": "麦克风：未授权",
  "onboarding.permissions.accGranted": "辅助功能：已授权",
  "onboarding.permissions.accMissing": "辅助功能：未授权",
  "onboarding.permissions.hint": "点击上方的授权按钮。",
  "onboarding.shortcuts.title": "快捷键",
  "onboarding.shortcuts.description": "在任何应用中按 {{shortcut}} 开始录音，再按一次停止。",
  "onboarding.shortcuts.cta": "知道了",
  "onboarding.tryit.title": "试一试！",
  "onboarding.tryit.description": "现在按 {{shortcut}} 说点什么。",
  "onboarding.tryit.waiting": "等待你按下快捷键…",
  "onboarding.tryit.recording": "录音中…再按 {{shortcut}} 停止。",
  "onboarding.tryit.processing": "正在处理语音…",
  "onboarding.tryit.success": "设置完成！",
  "onboarding.tryit.successDescription": "你的第一次听写成功了。",
  "onboarding.tryit.cta": "开始使用",
  "onboarding.skip": "跳过",
  "onboarding.skipAll": "跳过设置",
  "onboarding.restartGuide": "重新引导",
  "onboarding.restartGuideDesc": "重新体验一遍设置引导。",
  "onboarding.permissionLost.title": "权限丢失",
  "onboarding.permissionLost.description": "{{permissions}} 已被撤销，听写功能将无法使用。",
  "onboarding.permissionLost.openSettings": "打开系统设置",
  "onboarding.permissionLost.dismiss": "关闭"
```

**Step 3: Commit**

```bash
git add apps/desktop/src/renderer/locales/en.json apps/desktop/src/renderer/locales/zh-CN.json
git commit -m "feat(i18n): add onboarding and permission-loss locale strings"
```

---

## Task 2: Create onboarding step definitions

**Files:**
- Create: `apps/desktop/src/renderer/onboarding/onboarding-steps.ts`

**Step 1: Write the step definitions module**

```typescript
export type OnboardingStepId = 'welcome' | 'permissions' | 'shortcuts' | 'tryit';

export type TooltipPosition = 'bottom' | 'right' | 'left' | 'top' | 'center';

export interface OnboardingStepDef {
  id: OnboardingStepId;
  page: 'home' | 'settings' | null;
  targetSelector: string | null;
  tooltipPosition: TooltipPosition;
  i18nPrefix: string;
}

export const ONBOARDING_STEPS: OnboardingStepDef[] = [
  {
    id: 'welcome',
    page: null,
    targetSelector: null,
    tooltipPosition: 'center',
    i18nPrefix: 'onboarding.welcome'
  },
  {
    id: 'permissions',
    page: 'settings',
    targetSelector: '.settings-group:nth-child(2) .card',
    tooltipPosition: 'bottom',
    i18nPrefix: 'onboarding.permissions'
  },
  {
    id: 'shortcuts',
    page: 'home',
    targetSelector: '.rec-card',
    tooltipPosition: 'bottom',
    i18nPrefix: 'onboarding.shortcuts'
  },
  {
    id: 'tryit',
    page: 'home',
    targetSelector: null,
    tooltipPosition: 'center',
    i18nPrefix: 'onboarding.tryit'
  }
];

export const STORAGE_KEY = 'onboarding-completed';
```

**Step 2: Commit**

```bash
git add apps/desktop/src/renderer/onboarding/onboarding-steps.ts
git commit -m "feat(onboarding): add step definitions"
```

---

## Task 3: Create onboarding overlay DOM renderer

**Files:**
- Create: `apps/desktop/src/renderer/onboarding/onboarding-overlay.ts`

This module handles all DOM creation and positioning for the overlay elements (backdrop, spotlight, tooltip).

**Step 1: Write the overlay renderer**

```typescript
import type { TooltipPosition } from './onboarding-steps';

export interface OverlayElements {
  backdrop: HTMLDivElement;
  spotlight: HTMLDivElement;
  tooltip: HTMLDivElement;
}

const SPOTLIGHT_PADDING = 8;
const TOOLTIP_GAP = 12;
const TOOLTIP_MAX_WIDTH = 360;

export function createOverlayElements(): OverlayElements {
  const backdrop = document.createElement('div');
  backdrop.className = 'onboarding-backdrop';

  const spotlight = document.createElement('div');
  spotlight.className = 'onboarding-spotlight';

  const tooltip = document.createElement('div');
  tooltip.className = 'onboarding-tooltip';

  return { backdrop, spotlight, tooltip };
}

export function mountOverlay(elements: OverlayElements): void {
  document.body.appendChild(elements.backdrop);
  document.body.appendChild(elements.spotlight);
  document.body.appendChild(elements.tooltip);
  requestAnimationFrame(() => {
    elements.backdrop.classList.add('onboarding-backdrop--visible');
    elements.tooltip.classList.add('onboarding-tooltip--visible');
  });
}

export function unmountOverlay(elements: OverlayElements): void {
  elements.backdrop.classList.remove('onboarding-backdrop--visible');
  elements.tooltip.classList.remove('onboarding-tooltip--visible');
  elements.spotlight.classList.remove('onboarding-spotlight--visible');

  const onEnd = (): void => {
    elements.backdrop.remove();
    elements.spotlight.remove();
    elements.tooltip.remove();
  };
  elements.backdrop.addEventListener('transitionend', onEnd, { once: true });
  setTimeout(onEnd, 400);
}

export function positionSpotlight(
  spotlight: HTMLDivElement,
  targetSelector: string | null
): DOMRect | null {
  if (!targetSelector) {
    spotlight.classList.remove('onboarding-spotlight--visible');
    return null;
  }

  const el = document.querySelector(targetSelector);
  if (!el) {
    spotlight.classList.remove('onboarding-spotlight--visible');
    return null;
  }

  const rect = el.getBoundingClientRect();
  spotlight.style.top = `${rect.top - SPOTLIGHT_PADDING}px`;
  spotlight.style.left = `${rect.left - SPOTLIGHT_PADDING}px`;
  spotlight.style.width = `${rect.width + SPOTLIGHT_PADDING * 2}px`;
  spotlight.style.height = `${rect.height + SPOTLIGHT_PADDING * 2}px`;
  spotlight.classList.add('onboarding-spotlight--visible');

  return rect;
}

export function positionTooltip(
  tooltip: HTMLDivElement,
  position: TooltipPosition,
  spotlightRect: DOMRect | null
): void {
  tooltip.style.maxWidth = `${TOOLTIP_MAX_WIDTH}px`;

  if (position === 'center' || !spotlightRect) {
    tooltip.style.top = '50%';
    tooltip.style.left = '50%';
    tooltip.style.transform = 'translate(-50%, -50%)';
    tooltip.dataset.position = 'center';
    return;
  }

  tooltip.style.transform = '';
  tooltip.dataset.position = position;
  const padded = {
    top: spotlightRect.top - SPOTLIGHT_PADDING,
    left: spotlightRect.left - SPOTLIGHT_PADDING,
    bottom: spotlightRect.bottom + SPOTLIGHT_PADDING,
    right: spotlightRect.right + SPOTLIGHT_PADDING,
    width: spotlightRect.width + SPOTLIGHT_PADDING * 2,
    height: spotlightRect.height + SPOTLIGHT_PADDING * 2
  };

  switch (position) {
    case 'bottom':
      tooltip.style.top = `${padded.bottom + TOOLTIP_GAP}px`;
      tooltip.style.left = `${padded.left + padded.width / 2}px`;
      tooltip.style.transform = 'translateX(-50%)';
      break;
    case 'top':
      tooltip.style.top = `${padded.top - TOOLTIP_GAP}px`;
      tooltip.style.left = `${padded.left + padded.width / 2}px`;
      tooltip.style.transform = 'translate(-50%, -100%)';
      break;
    case 'right':
      tooltip.style.top = `${padded.top + padded.height / 2}px`;
      tooltip.style.left = `${padded.right + TOOLTIP_GAP}px`;
      tooltip.style.transform = 'translateY(-50%)';
      break;
    case 'left':
      tooltip.style.top = `${padded.top + padded.height / 2}px`;
      tooltip.style.left = `${padded.left - TOOLTIP_GAP}px`;
      tooltip.style.transform = 'translate(-100%, -50%)';
      break;
  }
}

export function renderTooltipContent(opts: {
  title: string;
  body: string;
  primaryLabel: string | null;
  onPrimary: (() => void) | null;
  skipLabel: string | null;
  onSkip: (() => void) | null;
  skipAllLabel: string;
  onSkipAll: () => void;
  stepIndex: number;
  totalSteps: number;
}): string {
  const dots = Array.from({ length: opts.totalSteps }, (_, i) =>
    `<span class="onboarding-dot${i === opts.stepIndex ? ' onboarding-dot--active' : ''}"></span>`
  ).join('');

  const primaryBtn = opts.primaryLabel && opts.onPrimary
    ? `<button class="btn btn-primary btn-sm" data-onboarding-action="primary">${opts.primaryLabel}</button>`
    : '';

  const skipBtn = opts.skipLabel && opts.onSkip
    ? `<button class="btn btn-ghost btn-sm" data-onboarding-action="skip">${opts.skipLabel}</button>`
    : '';

  return `
    <div class="onboarding-tooltip-content">
      <h3 class="onboarding-tooltip-title">${opts.title}</h3>
      <p class="onboarding-tooltip-body">${opts.body}</p>
      <div class="onboarding-tooltip-actions">
        ${skipBtn}${primaryBtn}
      </div>
      <div class="onboarding-tooltip-footer">
        <div class="onboarding-dots">${dots}</div>
        <button class="onboarding-skip-all" data-onboarding-action="skip-all">${opts.skipAllLabel}</button>
      </div>
    </div>
  `;
}

export function bindTooltipActions(
  tooltip: HTMLDivElement,
  handlers: {
    onPrimary?: () => void;
    onSkip?: () => void;
    onSkipAll: () => void;
  }
): void {
  tooltip.querySelector('[data-onboarding-action="primary"]')
    ?.addEventListener('click', () => handlers.onPrimary?.());
  tooltip.querySelector('[data-onboarding-action="skip"]')
    ?.addEventListener('click', () => handlers.onSkip?.());
  tooltip.querySelector('[data-onboarding-action="skip-all"]')
    ?.addEventListener('click', () => handlers.onSkipAll());
}
```

**Step 2: Commit**

```bash
git add apps/desktop/src/renderer/onboarding/onboarding-overlay.ts
git commit -m "feat(onboarding): add overlay DOM renderer with spotlight and tooltip"
```

---

## Task 4: Create onboarding controller (state machine)

**Files:**
- Create: `apps/desktop/src/renderer/onboarding/onboarding-controller.ts`

**Step 1: Write the controller**

This is the core module. It manages step transitions, integrates with page navigation, and handles the permissions polling and try-it detection.

```typescript
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
  type OnboardingStepId
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
```

**Step 2: Commit**

```bash
git add apps/desktop/src/renderer/onboarding/onboarding-controller.ts
git commit -m "feat(onboarding): add controller state machine with step flow"
```

---

## Task 5: Add onboarding CSS

**Files:**
- Modify: `apps/desktop/src/renderer/styles.css`

**Step 1: Append onboarding styles at the end of `styles.css`**

Add the following CSS after the last rule (`.mt-24`):

```css
/* ── Onboarding overlay ────────────────────────── */

.onboarding-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(2px);
  z-index: 1000;
  opacity: 0;
  transition: opacity 200ms ease;
  pointer-events: auto;
}

.onboarding-backdrop--visible {
  opacity: 1;
}

.onboarding-spotlight {
  position: fixed;
  z-index: 1001;
  border-radius: 12px;
  box-shadow:
    0 0 0 4px rgba(59, 130, 246, 0.5),
    0 0 0 9999px rgba(0, 0, 0, 0.6);
  pointer-events: none;
  opacity: 0;
  transition: top 300ms ease, left 300ms ease, width 300ms ease, height 300ms ease, opacity 200ms ease;
}

.onboarding-spotlight--visible {
  opacity: 1;
}

.onboarding-tooltip {
  position: fixed;
  z-index: 1002;
  background: var(--surface);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  padding: 24px;
  max-width: 360px;
  opacity: 0;
  transition: opacity 200ms ease, top 300ms ease, left 300ms ease, transform 300ms ease;
}

.onboarding-tooltip--visible {
  opacity: 1;
}

.onboarding-tooltip-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 8px;
}

.onboarding-tooltip-body {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-secondary);
  margin-bottom: 20px;
}

.onboarding-tooltip-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.onboarding-tooltip-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
}

.onboarding-dots {
  display: flex;
  gap: 6px;
}

.onboarding-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 1.5px solid var(--text-tertiary);
  background: transparent;
}

.onboarding-dot--active {
  border-color: var(--blue);
  background: var(--blue);
}

.onboarding-skip-all {
  font-size: 11px;
  color: var(--text-tertiary);
  cursor: pointer;
}

.onboarding-skip-all:hover {
  color: var(--text-secondary);
}

.onboarding-perm-badge {
  margin: 2px 0;
}

/* ── Permission loss modal ─────────────────────── */

.perm-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 200ms ease;
}

.perm-modal-backdrop--visible {
  opacity: 1;
}

.perm-modal {
  background: var(--surface);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  padding: 28px;
  max-width: 400px;
  text-align: center;
}

.perm-modal-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 8px;
}

.perm-modal-body {
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.6;
  margin-bottom: 20px;
}

.perm-modal-actions {
  display: flex;
  gap: 8px;
  justify-content: center;
}
```

**Step 2: Commit**

```bash
git add apps/desktop/src/renderer/styles.css
git commit -m "feat(onboarding): add CSS for coach-marks overlay and permission modal"
```

---

## Task 6: Integrate onboarding into renderer boot sequence

**Files:**
- Modify: `apps/desktop/src/renderer/index.ts`

This is the integration task. We need to:
1. Export the `navigateTo` function so the onboarding controller can call it
2. Hook onboarding into `boot()`
3. Add a "Restart Guide" button to Settings
4. Add pipeline-complete event tracking for the try-it step

**Step 1: Add imports at the top of `renderer/index.ts`**

After the existing imports (line ~16), add:

```typescript
import {
  createOnboardingController,
  isOnboardingCompleted,
  clearOnboardingCompleted,
  type OnboardingController
} from './onboarding/onboarding-controller';
```

**Step 2: Add onboarding state tracking**

After the `let statusTimeoutId` line (~59), add:

```typescript
let onboardingController: OnboardingController | null = null;
let pipelineCompleteCallbacks: Array<() => void> = [];
```

**Step 3: Create navigateTo helper**

The existing navigation is inline in `bindUi`. Extract a reusable function. Before the `renderSidebar` function (~138), add:

```typescript
function navigateTo(view: View): void {
  if (view !== state.view) {
    state.view = view;
    render();
  }
}
```

**Step 4: Update `bindUi` to use `navigateTo`**

In `bindUi` (the `[data-nav]` listener around line 509-517), replace the click handler body:

```typescript
// Before:
const target = btn.dataset.nav as View;
if (target && target !== state.view) {
  state.view = target;
  render();
}

// After:
const target = btn.dataset.nav as View;
if (target) navigateTo(target);
```

**Step 5: Add "Restart Guide" button to Settings**

In the `renderSettings` function, before the final closing backtick (after the About settings-group, around line 443), add a new settings group:

```typescript
    <div class="settings-group">
      <h3 class="settings-group-title">${t('nav.home')}</h3>
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
```

**Step 6: Bind the restart-guide button in `bindUi`**

After the `set-locale` binding block (around line 557), add:

```typescript
  document.querySelector('[data-action="restart-guide"]')?.addEventListener('click', () => {
    clearOnboardingCompleted();
    if (onboardingController) {
      onboardingController.destroy();
    }
    startOnboarding();
  });
```

**Step 7: Add pipeline-complete tracking in `applyCompletionResult`**

In `applyCompletionResult` (around line 724), after the existing code, add at the end of the function:

```typescript
  pipelineCompleteCallbacks.forEach((cb) => cb());
```

**Step 8: Create `startOnboarding` helper and update `boot`**

Before the `boot` function (around line 796), add:

```typescript
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
```

Then in `boot()`, after the `render()` call at the end (line ~813), add:

```typescript
  if (!isOnboardingCompleted()) {
    startOnboarding();
  }
```

**Step 9: Verify the app builds**

Run: `cd apps/desktop && npm run lint`
Expected: No errors

**Step 10: Commit**

```bash
git add apps/desktop/src/renderer/index.ts
git commit -m "feat(onboarding): integrate controller into renderer boot and settings"
```

---

## Task 7: Add permission-loss modal

**Files:**
- Modify: `apps/desktop/src/renderer/index.ts`
- Modify: `apps/desktop/src/shared/ipc.ts`

**Step 1: Extend `DesktopAttentionEvent` in `shared/ipc.ts`**

Change the `DesktopAttentionEvent` type (line ~54-57) to also support a `permission-lost` kind:

```typescript
// Before:
export interface DesktopAttentionEvent {
  kind: 'permission-required';
  missing: DesktopPermissionKind[];
}

// After:
export type DesktopAttentionEvent =
  | { kind: 'permission-required'; missing: DesktopPermissionKind[] }
  | { kind: 'permission-lost'; missing: DesktopPermissionKind[] };
```

**Step 2: Add permission-loss modal rendering in `renderer/index.ts`**

After the `startOnboarding` function, add:

```typescript
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
```

**Step 3: Update `handleDesktopAttention` to handle permission-lost**

Modify the existing `handleDesktopAttention` function (around line 774):

```typescript
// Before:
async function handleDesktopAttention(event: DesktopAttentionEvent): Promise<void> {
  if (event.kind !== 'permission-required') return;
  state.view = 'home';
  setStatus(t('status.grantPermissions', { permissions: describeMissingPermissions(event.missing) }), 'warning');
  await refreshAll();
}

// After:
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
```

**Step 4: Commit**

```bash
git add apps/desktop/src/shared/ipc.ts apps/desktop/src/renderer/index.ts
git commit -m "feat(onboarding): add permission-loss modal with open-settings action"
```

---

## Task 8: Add onboarding controller unit tests

**Files:**
- Create: `apps/desktop/src/renderer/onboarding/onboarding-controller.test.ts`

Tests focus on the controller's state machine logic. Since this runs in Node.js test runner (no DOM), we test the pure logic paths by mocking the deps.

**Step 1: Write tests**

```typescript
import assert from 'node:assert/strict';
import test from 'node:test';

import { STORAGE_KEY } from './onboarding-steps';

// Since the controller depends on DOM (document.createElement), we test
// the exported pure functions: isOnboardingCompleted and clearOnboardingCompleted.
// Full integration testing requires a browser environment (manual or e2e).

test('STORAGE_KEY is correct', () => {
  assert.equal(STORAGE_KEY, 'onboarding-completed');
});

test('ONBOARDING_STEPS has 4 steps in correct order', async () => {
  const { ONBOARDING_STEPS } = await import('./onboarding-steps.js');
  assert.equal(ONBOARDING_STEPS.length, 4);
  assert.equal(ONBOARDING_STEPS[0].id, 'welcome');
  assert.equal(ONBOARDING_STEPS[1].id, 'permissions');
  assert.equal(ONBOARDING_STEPS[2].id, 'shortcuts');
  assert.equal(ONBOARDING_STEPS[3].id, 'tryit');
});

test('welcome step has no target selector (centered)', async () => {
  const { ONBOARDING_STEPS } = await import('./onboarding-steps.js');
  assert.equal(ONBOARDING_STEPS[0].targetSelector, null);
  assert.equal(ONBOARDING_STEPS[0].tooltipPosition, 'center');
});

test('permissions step navigates to settings page', async () => {
  const { ONBOARDING_STEPS } = await import('./onboarding-steps.js');
  assert.equal(ONBOARDING_STEPS[1].page, 'settings');
});

test('shortcuts step navigates to home page', async () => {
  const { ONBOARDING_STEPS } = await import('./onboarding-steps.js');
  assert.equal(ONBOARDING_STEPS[2].page, 'home');
});

test('tryit step has center position', async () => {
  const { ONBOARDING_STEPS } = await import('./onboarding-steps.js');
  assert.equal(ONBOARDING_STEPS[3].tooltipPosition, 'center');
  assert.equal(ONBOARDING_STEPS[3].targetSelector, null);
});
```

**Step 2: Run tests**

Run: `cd apps/desktop && npx tsx --test src/renderer/onboarding/onboarding-controller.test.ts`
Expected: All 6 tests pass.

**Step 3: Commit**

```bash
git add apps/desktop/src/renderer/onboarding/onboarding-controller.test.ts
git commit -m "test(onboarding): add unit tests for step definitions"
```

---

## Task 9: Lint and build verification

**Step 1: Run linter**

Run: `cd apps/desktop && npm run lint`
Expected: No errors.

**Step 2: Run all tests**

Run: `cd apps/desktop && npm test`
Expected: All tests pass (existing + new onboarding tests).

**Step 3: Run type check**

Run: `cd apps/desktop && npx tsc --noEmit`
Expected: No type errors.

**Step 4: Run build**

Run: `cd apps/desktop && npm run package`
Expected: Build completes without errors.

**Step 5: Fix any issues found in steps 1-4, then commit**

```bash
git add -A
git commit -m "chore: fix lint and type errors from onboarding integration"
```

---

## Task 10: Manual E2E verification

**Step 1: Start the app in dev mode**

Run: `cd apps/desktop && npm start`

**Step 2: Test first-time onboarding**

1. Open DevTools console, run: `localStorage.removeItem('onboarding-completed')`
2. Reload the app (Cmd+R)
3. Verify: Welcome step appears with backdrop and centered tooltip
4. Click "Get Started"
5. Verify: App navigates to Settings, spotlight highlights permissions section
6. Grant microphone permission → verify badge updates live
7. Grant accessibility permission → verify auto-advance to shortcuts step
8. Verify: App navigates to Home, spotlight highlights recording card
9. Click "Got it"
10. Verify: Try-it step shows "Waiting for you to press the shortcut..."
11. Press ⌘⇧; → verify tooltip updates to "Recording..."
12. Press ⌘⇧; again → verify tooltip updates to "Processing..."
13. Wait for pipeline → verify "You're All Set!" appears
14. Click "Start Using" → verify overlay disappears

**Step 3: Test skip flow**

1. Clear localStorage, reload
2. Click "Skip setup" in footer → verify overlay closes, app works normally

**Step 4: Test restart guide**

1. Go to Settings
2. Click "Restart Guide" → verify onboarding overlay appears again

**Step 5: Test permission-loss modal**

This requires revoking a permission via System Settings while the app is running, then attempting to record.
