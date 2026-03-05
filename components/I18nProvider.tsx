'use client';

import { useEffect } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { useColorScheme } from '@mui/material/styles';
import i18n, { DEFAULT_LANGUAGE, detectBrowserLanguage, SupportedLanguage } from '@/lib/i18n';
import { useAuth } from './AuthProvider';

/**
 * Syncs language from Supabase user_metadata to i18next + <html lang>.
 * On the client, also detects browser language as fallback.
 */
function LanguageSync() {
  const { user } = useAuth();
  const { i18n: i18nInstance } = useTranslation();

  useEffect(() => {
    const lang: SupportedLanguage =
      (user?.user_metadata?.language as SupportedLanguage) || detectBrowserLanguage();

    if (i18nInstance.language !== lang) {
      i18nInstance.changeLanguage(lang);
    }
    document.documentElement.lang = lang;
  }, [user?.user_metadata?.language, i18nInstance]);

  return null;
}

/**
 * Reads theme from Supabase user_metadata and syncs to MUI color scheme.
 * MUI persists mode to localStorage automatically; this handles cross-device sync.
 */
function ThemeSync() {
  const { user } = useAuth();
  const { setMode } = useColorScheme();

  useEffect(() => {
    const supabaseTheme = user?.user_metadata?.theme as 'light' | 'dark' | undefined;
    if (supabaseTheme) {
      setMode(supabaseTheme);
    }
  }, [user?.user_metadata?.theme, setMode]);

  return null;
}

interface I18nProviderProps {
  children: React.ReactNode;
  initialLocale?: string;
}

export default function I18nProvider({ children, initialLocale }: I18nProviderProps) {
  // Set the language synchronously before the first render so that server
  // and client agree on the locale during hydration (prevents mismatch).
  // The server layout reads the user's saved language from Supabase and passes
  // it here; on the client the same prop value is used for the initial render.
  // LanguageSync useEffect handles subsequent changes (profile updates, browser detect).
  const targetLang = (initialLocale as SupportedLanguage) || DEFAULT_LANGUAGE;
  if (i18n.language !== targetLang) {
    i18n.changeLanguage(targetLang);
  }

  return (
    <I18nextProvider i18n={i18n}>
      <LanguageSync />
      <ThemeSync />
      {children}
    </I18nextProvider>
  );
}
