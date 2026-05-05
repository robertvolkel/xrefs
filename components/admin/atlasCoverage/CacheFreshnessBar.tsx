'use client';

import { Box, Typography, Tooltip, Button } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useTranslation } from 'react-i18next';
import { formatRelativeTime } from '@/lib/utils/dateFormatting';

interface CacheFreshnessBarProps {
  cachedAt: string | null;
  onRefresh: () => Promise<void> | void;
  refreshing: boolean;
}

/**
 * "Last refreshed X ago" indicator + Refresh button. Used at the top of both
 * the Overview and Activity tabs so users can see how stale the data is and
 * force a recompute when they want fresher numbers.
 *
 * Hover the timestamp to see the absolute time. The button shows "Refreshing…"
 * + disabled state during a `?refresh=1` round-trip.
 */
export default function CacheFreshnessBar({ cachedAt, onRefresh, refreshing }: CacheFreshnessBarProps) {
  const { t } = useTranslation();

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
      {cachedAt && (
        <Tooltip title={new Date(cachedAt).toLocaleString()}>
          <Typography variant="caption" color="text.secondary">
            {t('admin.atlasGrowth.lastRefreshed', { relative: formatRelativeTime(cachedAt) })}
          </Typography>
        </Tooltip>
      )}
      <Button
        size="small"
        variant="outlined"
        startIcon={<RefreshIcon fontSize="small" />}
        onClick={() => void onRefresh()}
        disabled={refreshing}
        sx={{ textTransform: 'none' }}
      >
        {refreshing ? t('admin.atlasGrowth.refreshing') : t('admin.atlasGrowth.refreshNow')}
      </Button>
    </Box>
  );
}
