'use client';

import { Box, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import AtlasGrowthChart from './AtlasGrowthChart';
import AtlasEventLogTable from './AtlasEventLogTable';
import CacheFreshnessBar from './atlasCoverage/CacheFreshnessBar';
import type { AtlasGrowthResponse } from '@/app/api/admin/atlas/growth/route';

interface AtlasActivityTabProps {
  data: AtlasGrowthResponse;
  cachedAt: string | null;
  onRefresh: () => Promise<void> | void;
  refreshing: boolean;
}

export default function AtlasActivityTab({ data, cachedAt, onRefresh, refreshing }: AtlasActivityTabProps) {
  const { t } = useTranslation();

  return (
    <Box
      sx={{
        px: 3,
        pt: '16px',
        pb: 6,
        maxWidth: 960,
        mx: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
      }}
    >
      {/* Header — mirrors Overview tab's title strip for consistency. */}
      <Box>
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 0.5 }}>
          {t('admin.atlasGrowth.headerTitle')}
        </Typography>
        <CacheFreshnessBar cachedAt={cachedAt} onRefresh={onRefresh} refreshing={refreshing} />
      </Box>

      <AtlasGrowthChart series={data.series} />
      <AtlasEventLogTable events={data.events} />
    </Box>
  );
}
