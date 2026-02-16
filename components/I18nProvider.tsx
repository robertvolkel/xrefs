'use client';

import { useEffect } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import i18n, { DEFAULT_LANGUAGE, SupportedLanguage } from '@/lib/i18n';
import { useAuth } from './AuthProvider';

/**
 * Reads language from Supabase user_metadata and syncs to i18next + <html lang>.
 */
function LanguageSync() {
  const { user } = useAuth();
  const { i18n: i18nInstance } = useTranslation();

  useEffect(() => {
    const lang: SupportedLanguage =
      (user?.user_metadata?.language as SupportedLanguage) || DEFAULT_LANGUAGE;

    if (i18nInstance.language !== lang) {
      i18nInstance.changeLanguage(lang);
    }
    document.documentElement.lang = lang;
  }, [user?.user_metadata?.language, i18nInstance]);

  return null;
}

export default function I18nProvider({ children }: { children: React.ReactNode }) {
  return (
    <I18nextProvider i18n={i18n}>
      <LanguageSync />
      {children}
    </I18nextProvider>
  );
}
