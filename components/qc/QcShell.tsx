'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Box, Typography, Switch, Stack, Chip } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { PAGE_HEADER_HEIGHT } from '@/lib/layoutConstants';
import { getQcSettings, updateQcSettings } from '@/lib/api';
import QcSectionNav, { QcSection } from './QcSectionNav';
import QcFeedbackTab from '@/components/admin/QcFeedbackTab';
import QcLogsTab from '@/components/admin/QcLogsTab';

function isValidSection(s: string | null): s is QcSection {
  return s === 'feedback' || s === 'logs';
}

function QcShellInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();

  const sectionParam = searchParams.get('section');
  const [activeSection, setActiveSection] = useState<QcSection>(
    isValidSection(sectionParam) ? sectionParam : 'feedback',
  );

  const [loggingEnabled, setLoggingEnabled] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    getQcSettings()
      .then((s) => setLoggingEnabled(s.qcLoggingEnabled))
      .catch(() => {})
      .finally(() => setSettingsLoaded(true));
  }, []);

  const handleToggle = async (enabled: boolean) => {
    setLoggingEnabled(enabled);
    try {
      await updateQcSettings({ qcLoggingEnabled: enabled });
    } catch {
      setLoggingEnabled(!enabled);
    }
  };

  const handleSectionChange = useCallback(
    (section: QcSection) => {
      setActiveSection(section);
      router.replace(`/qc?section=${section}`, { scroll: false });
    },
    [router],
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default' }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 3,
          height: PAGE_HEADER_HEIGHT,
          borderBottom: 1,
          borderColor: 'divider',
          flexShrink: 0,
        }}
      >
        <Typography variant="h6" fontWeight={400} color="text.secondary" sx={{ lineHeight: 1 }}>
          {t('adminQc.title')}
        </Typography>

        {settingsLoaded && (
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
        )}
      </Box>

      {/* Body */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Section Nav */}
        <Box
          sx={{
            width: 240,
            flexShrink: 0,
            borderRight: 1,
            borderColor: 'divider',
            overflow: 'hidden',
          }}
        >
          <QcSectionNav activeSection={activeSection} onSectionChange={handleSectionChange} />
        </Box>

        {/* Content */}
        <Box sx={{ flex: 1, overflow: 'hidden' }}>
          {activeSection === 'feedback' && <QcFeedbackTab />}
          {activeSection === 'logs' && <QcLogsTab />}
        </Box>
      </Box>
    </Box>
  );
}

export default function QcShell() {
  return (
    <Suspense>
      <QcShellInner />
    </Suspense>
  );
}
