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
