import i18next from 'i18next';

import en from './locales/en.json';
import zhCN from './locales/zh-CN.json';

const STORAGE_KEY = 'app.locale';
const SUPPORTED = ['en', 'zh-CN'] as const;
export type Locale = (typeof SUPPORTED)[number];

function detectLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED.includes(stored as Locale)) return stored as Locale;
  } catch {
    /* ignore */
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language : '';
  if (nav.startsWith('zh')) return 'zh-CN';
  return 'en';
}

const resources = {
  en: { translation: en },
  'zh-CN': { translation: zhCN }
};

i18next.init({
  lng: detectLocale(),
  fallbackLng: 'en',
  supportedLngs: [...SUPPORTED],
  resources,
  interpolation: {
    escapeValue: false
  }
});

export const t = i18next.t.bind(i18next);

export function changeLanguage(lng: Locale): Promise<void> {
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    /* ignore */
  }
  return i18next.changeLanguage(lng).then(() => undefined);
}

export function getLocale(): Locale {
  const lng = i18next.language;
  if (SUPPORTED.includes(lng as Locale)) return lng as Locale;
  return 'en';
}

export function onLanguageChanged(callback: () => void): void {
  i18next.on('languageChanged', callback);
}

export { SUPPORTED as SUPPORTED_LOCALES };
