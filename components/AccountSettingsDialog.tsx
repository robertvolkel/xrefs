'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Tabs,
  Tab,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { SUPPORTED_LANGUAGES, SupportedLanguage, DEFAULT_LANGUAGE } from '@/lib/i18n';
import { useAuth } from './AuthProvider';
import { createClient } from '@/lib/supabase/client';

interface AccountSettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function AccountSettingsDialog({ open, onClose }: AccountSettingsDialogProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState(0);
  const [language, setLanguage] = useState<SupportedLanguage>(DEFAULT_LANGUAGE);
  const [saving, setSaving] = useState(false);

  // Sync language from user metadata when dialog opens
  useEffect(() => {
    if (!open) return;
    const lang = (user?.user_metadata?.language as SupportedLanguage) || DEFAULT_LANGUAGE;
    setLanguage(lang);
    setActiveTab(0);
  }, [open, user?.user_metadata?.language]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const supabase = createClient();
      await supabase.auth.updateUser({ data: { language } });
    } catch {
      // Supabase not configured
    }
    setSaving(false);
    onClose();
  };

  const hasChanges = language !== ((user?.user_metadata?.language as SupportedLanguage) || DEFAULT_LANGUAGE);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: { borderRadius: 3, bgcolor: 'background.paper', minHeight: 400 },
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pb: 0,
          fontWeight: 600,
        }}
      >
        {t('accountSettings.title')}
        <IconButton onClick={onClose} size="small" sx={{ color: 'text.secondary' }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ display: 'flex', gap: 0, p: 0, mt: 1 }}>
        {/* Left tabs */}
        <Tabs
          orientation="vertical"
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          sx={{
            borderRight: 1,
            borderColor: 'divider',
            minWidth: 180,
            '.MuiTab-root': {
              textTransform: 'none',
              alignItems: 'flex-start',
              textAlign: 'left',
              fontSize: '0.85rem',
              px: 3,
              minHeight: 44,
            },
          }}
        >
          <Tab label={t('accountSettings.globalSettings')} />
          <Tab label={t('accountSettings.myProfile')} />
          <Tab label={t('accountSettings.dataSources')} />
          <Tab label={t('accountSettings.notifications')} />
        </Tabs>

        {/* Right panel */}
        <Box sx={{ flex: 1, p: 3, minHeight: 260 }}>
          {/* Global Settings */}
          {activeTab === 0 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <FormControl size="small" fullWidth>
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

              <FormControl size="small" fullWidth disabled>
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
          )}

          {/* Placeholder tabs */}
          {activeTab === 1 && (
            <Typography variant="body2" color="text.secondary">
              {t('common.comingSoon')}
            </Typography>
          )}
          {activeTab === 2 && (
            <Typography variant="body2" color="text.secondary">
              {t('common.comingSoon')}
            </Typography>
          )}
          {activeTab === 3 && (
            <Typography variant="body2" color="text.secondary">
              {t('common.comingSoon')}
            </Typography>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} sx={{ borderRadius: 20, textTransform: 'none' }}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={!hasChanges || saving}
          sx={{ borderRadius: 20, textTransform: 'none' }}
        >
          {t('common.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
