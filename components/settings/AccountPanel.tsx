'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Button,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { useColorScheme } from '@mui/material/styles';
import LightModeOutlined from '@mui/icons-material/LightModeOutlined';
import DarkModeOutlined from '@mui/icons-material/DarkModeOutlined';
import { SUPPORTED_LANGUAGES, SupportedLanguage, DEFAULT_LANGUAGE } from '@/lib/i18n';
import { useAuth } from '@/components/AuthProvider';
import { createClient } from '@/lib/supabase/client';

export default function AccountPanel() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { mode, setMode } = useColorScheme();
  const [language, setLanguage] = useState<SupportedLanguage>(DEFAULT_LANGUAGE);
  const [pendingTheme, setPendingTheme] = useState<'light' | 'dark' | null>(null);
  const [saving, setSaving] = useState(false);

  const savedLanguage = (user?.user_metadata?.language as SupportedLanguage) || DEFAULT_LANGUAGE;
  const savedTheme = (user?.user_metadata?.theme as 'light' | 'dark' | undefined) ?? 'light';

  useEffect(() => {
    setLanguage(savedLanguage);
  }, [savedLanguage]);

  const handleThemeChange = (_: React.MouseEvent<HTMLElement>, newMode: 'light' | 'dark' | null) => {
    if (!newMode) return;
    setMode(newMode);
    setPendingTheme(newMode);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const supabase = createClient();
      await supabase.auth.updateUser({
        data: {
          language,
          ...(pendingTheme ? { theme: pendingTheme } : {}),
        },
      });
      setPendingTheme(null);
    } catch {
      // Supabase not configured
    }
    setSaving(false);
  };

  const languageChanged = language !== savedLanguage;
  const themeChanged = pendingTheme !== null && pendingTheme !== savedTheme;
  const hasChanges = languageChanged || themeChanged;

  return (
    <Box sx={{ px: 3, pt: '16px', pb: 4 }}>
      {/* Global Settings */}
      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
        {t('accountSettings.globalSettings')}
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mb: 5 }}>
        <FormControl size="small" fullWidth sx={{ maxWidth: 360 }}>
          <InputLabel>{t('accountSettings.language')}</InputLabel>
          <Select
            value={language}
            label={t('accountSettings.language')}
            onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
          >
            {SUPPORTED_LANGUAGES.map((lang) => (
              <MenuItem key={lang.code} value={lang.code}>
                {lang.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" fullWidth disabled sx={{ maxWidth: 360 }}>
          <InputLabel>{t('accountSettings.currency')}</InputLabel>
          <Select value="USD" label={t('accountSettings.currency')}>
            <MenuItem value="USD">USD — US Dollar</MenuItem>
            <MenuItem value="EUR">EUR — Euro</MenuItem>
            <MenuItem value="CNY">CNY — Chinese Yuan</MenuItem>
          </Select>
        </FormControl>
        <Typography variant="caption" color="text.secondary" sx={{ mt: -2 }}>
          {t('accountSettings.currencyPlaceholder')}
        </Typography>
      </Box>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 4 }} />

      {/* Display Settings */}
      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
        {t('accountSettings.displaySettings')}
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 5 }}>
        <Typography variant="body2" color="text.secondary">
          {t('accountSettings.theme')}
        </Typography>
        <ToggleButtonGroup
          value={mode}
          exclusive
          onChange={handleThemeChange}
          size="small"
          sx={{ maxWidth: 240 }}
        >
          <ToggleButton value="light" sx={{ textTransform: 'none', px: 2 }}>
            <LightModeOutlined sx={{ mr: 0.75, fontSize: 18 }} />
            {t('accountSettings.themeLight')}
          </ToggleButton>
          <ToggleButton value="dark" sx={{ textTransform: 'none', px: 2 }}>
            <DarkModeOutlined sx={{ mr: 0.75, fontSize: 18 }} />
            {t('accountSettings.themeDark')}
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Unified Save */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={!hasChanges || saving}
          sx={{ borderRadius: 20, textTransform: 'none' }}
        >
          {t('common.save')}
        </Button>
      </Box>
    </Box>
  );
}
