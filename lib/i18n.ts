import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '@/locales/en.json';
import zhCN from '@/locales/zh-CN.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'zh-CN', label: '简体中文' },
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]['code'];

export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

/**
 * Detects the best matching supported language from the browser's language preferences.
 * Tries exact match first, then prefix match (e.g., de-DE → de, zh-TW → zh-CN).
 * Returns DEFAULT_LANGUAGE if no match or if running server-side.
 */
export function detectBrowserLanguage(): SupportedLanguage {
  if (typeof window === 'undefined') return DEFAULT_LANGUAGE;

  const browserLangs = navigator.languages?.length
    ? navigator.languages
    : [navigator.language];

  const codes = SUPPORTED_LANGUAGES.map((l) => l.code);

  for (const browserLang of browserLangs) {
    // Exact match (e.g., zh-CN)
    if (codes.includes(browserLang as SupportedLanguage)) {
      return browserLang as SupportedLanguage;
    }
    // Prefix match (e.g., zh-TW → zh-CN)
    const prefix = browserLang.split('-')[0].toLowerCase();
    const match = codes.find((c) => c.toLowerCase().startsWith(prefix));
    if (match) return match;
  }

  return DEFAULT_LANGUAGE;
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      'zh-CN': { translation: zhCN },
    },
    lng: DEFAULT_LANGUAGE,
    fallbackLng: DEFAULT_LANGUAGE,
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  });

export default i18n;
