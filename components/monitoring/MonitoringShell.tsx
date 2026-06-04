'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Box, Typography, Switch, Stack, Chip } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { getQcSettings, updateQcSettings, getAdminAppFeedbackList } from '@/lib/api';
import { PAGE_HEADER_HEIGHT } from '@/lib/layoutConstants';
import MonitoringSectionNav, {
  MonitoringSection,
  MONITORING_SECTION_ITEMS,
} from './MonitoringSectionNav';
import QcLogsTab from '@/components/admin/QcLogsTab';
import QcFeedbackTab from '@/components/admin/QcFeedbackTab';
import DistributorClicksTab from '@/components/admin/DistributorClicksTab';
import AppFeedbackTab from '@/components/admin/AppFeedbackTab';

const VALID_SECTIONS = new Set<MonitoringSection>(MONITORING_SECTION_ITEMS.map((s) => s.id));

const DEFAULT_SECTION: MonitoringSection = 'activity-logs';

function isValidSection(s: string | null): s is MonitoringSection {
  return s !== null && VALID_SECTIONS.has(s as MonitoringSection);
}

function MonitoringShellInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();

  const sectionParam = searchParams.get('section');
  const [activeSection, setActiveSection] = useState<MonitoringSection>(
    isValidSection(sectionParam) ? sectionParam : DEFAULT_SECTION,
  );

  // QC logging toggle state — applies to recommendation/QC log capture
  const [loggingEnabled, setLoggingEnabled] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // App feedback "needs attention" count for nav badge — same semantics as
  // the Monitoring sidebar dot. Triggered by unread user replies and items
  // never opened by the admin; NOT by items merely sitting in 'open' status.
  const [appFeedbackNeedsAttention, setAppFeedbackNeedsAttention] = useState(0);

  const refreshAppFeedbackCount = useCallback(() => {
    getAdminAppFeedbackList({ limit: 1 })
      .then((r) => setAppFeedbackNeedsAttention(r.needsAttentionCount))
      .catch(() => {});
  }, []);

  useEffect(() => {
    getQcSettings()
      .then((s) => setLoggingEnabled(s.qcLoggingEnabled))
      .catch(() => {})
      .finally(() => setSettingsLoaded(true));

    refreshAppFeedbackCount();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh badge when leaving app-feedback section (may have resolved items)
  useEffect(() => {
    if (activeSection !== 'app-feedback') refreshAppFeedbackCount();
  }, [activeSection, refreshAppFeedbackCount]);

  const handleToggleLogging = async (enabled: boolean) => {
    setLoggingEnabled(enabled);
    try {
      await updateQcSettings({ qcLoggingEnabled: enabled });
    } catch {
      setLoggingEnabled(!enabled);
    }
  };

  const handleSectionChange = useCallback(
    (section: MonitoringSection) => {
      setActiveSection(section);
      router.replace(`/monitoring?section=${section}`, { scroll: false });
    },
    [router],
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default' }}>
      {/* Header — section name + QC logging toggle */}
      <Box
        id="monitoring-page-header"
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
          {t('monitoring.title')}
        </Typography>

        {settingsLoaded && (
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.78rem' }}>
              {t('adminQc.toggleLabel')}
            </Typography>
            <Switch
              checked={loggingEnabled}
              onChange={(e) => handleToggleLogging(e.target.checked)}
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
        <Box
          id="monitoring-nav"
          sx={{
            width: 240,
            flexShrink: 0,
            borderRight: 1,
            borderColor: 'divider',
            overflow: 'hidden',
          }}
        >
          <MonitoringSectionNav
            activeSection={activeSection}
            onSectionChange={handleSectionChange}
            appFeedbackNeedsAttentionCount={appFeedbackNeedsAttention}
          />
        </Box>

        <Box sx={{ flex: 1, overflow: 'hidden' }}>
          {activeSection === 'activity-logs' && <QcLogsTab />}
          {activeSection === 'distributor-clicks' && <DistributorClicksTab />}
          {activeSection === 'app-feedback' && <AppFeedbackTab />}
          {activeSection === 'logic-feedback' && <QcFeedbackTab />}
        </Box>
      </Box>
    </Box>
  );
}

export default function MonitoringShell() {
  return (
    <Suspense>
      <MonitoringShellInner />
    </Suspense>
  );
}
