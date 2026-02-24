'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Switch,
  Stack,
  Chip,
  Tabs,
  Tab,
  CircularProgress,
} from '@mui/material';
import FlagIcon from '@mui/icons-material/Flag';
import HistoryIcon from '@mui/icons-material/History';
import { useTranslation } from 'react-i18next';
import { getQcSettings, updateQcSettings } from '@/lib/api';
import QcFeedbackTab from './QcFeedbackTab';
import QcLogsTab from './QcLogsTab';

export default function QcPanel() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState(0);
  const [loggingEnabled, setLoggingEnabled] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(true);

  useEffect(() => {
    getQcSettings()
      .then((s) => setLoggingEnabled(s.qcLoggingEnabled))
      .catch(() => {})
      .finally(() => setSettingsLoading(false));
  }, []);

  const handleToggle = async (enabled: boolean) => {
    setLoggingEnabled(enabled);
    try {
      await updateQcSettings({ qcLoggingEnabled: enabled });
    } catch {
      setLoggingEnabled(!enabled);
    }
  };

  if (settingsLoading) {
    return (
      <Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header with toggle */}
      <Box sx={{ px: 3, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 600 }}>
            {t('adminQc.title')}
          </Typography>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.78rem' }}>
              {t('adminQc.toggleLabel')}
            </Typography>
            <Switch
              checked={loggingEnabled}
              onChange={(e) => handleToggle(e.target.checked)}
              size="small"
            />
            <Chip
              label={loggingEnabled ? t('adminQc.collecting') : t('adminQc.paused')}
              size="small"
              color={loggingEnabled ? 'success' : 'default'}
              variant="outlined"
              sx={{ height: 22, fontSize: '0.7rem' }}
            />
          </Stack>
        </Stack>
      </Box>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          sx={{ minHeight: 36, '& .MuiTab-root': { minHeight: 36, textTransform: 'none', fontSize: '0.82rem' } }}
        >
          <Tab icon={<FlagIcon sx={{ fontSize: '1rem' }} />} iconPosition="start" label={t('adminQc.tabFeedback')} />
          <Tab icon={<HistoryIcon sx={{ fontSize: '1rem' }} />} iconPosition="start" label={t('adminQc.tabLogs')} />
        </Tabs>
      </Box>

      {/* Tab content */}
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        {activeTab === 0 && <QcFeedbackTab />}
        {activeTab === 1 && <QcLogsTab />}
      </Box>
    </Box>
  );
}
