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
    targetSelector: '[data-onboarding="permissions"]',
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
