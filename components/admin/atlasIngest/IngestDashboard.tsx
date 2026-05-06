'use client';

/**
 * IngestDashboard — sticky aggregate header for pending batches.
 * Shows total counts, risk breakdown chips, and the bulk-apply button.
 */

import { Box, Button, Chip, Paper, Stack, Typography } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';

interface Props {
  aggregate: {
    counts: { clean: number; review: number; attention: number; total: number };
    productCounts: { willInsert: number; willUpdate: number; willDelete: number };
    attrChanges: { totalNewAttrs: number; totalChangedValues: number; totalRemovedAttrs: number };
  };
  onProceedAllClean: () => void;
  bulkRunning: boolean;
}

export default function IngestDashboard({ aggregate, onProceedAllClean, bulkRunning }: Props) {
  const { counts, productCounts, attrChanges } = aggregate;
  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2, position: 'sticky', top: 0, zIndex: 2, bgcolor: 'background.paper' }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }} justifyContent="space-between">
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {counts.total} pending {counts.total === 1 ? 'batch' : 'batches'}
          </Typography>
          <Stack direction="row" spacing={0.5}>
            <Chip
              size="small"
              label={`${counts.clean} clean`}
              sx={{ bgcolor: 'success.dark', color: 'success.contrastText', fontWeight: 600 }}
            />
            <Chip
              size="small"
              label={`${counts.review} review`}
              sx={{ bgcolor: 'warning.dark', color: 'warning.contrastText', fontWeight: 600 }}
            />
            <Chip
              size="small"
              label={`${counts.attention} attention`}
              sx={{ bgcolor: 'error.dark', color: 'error.contrastText', fontWeight: 600 }}
            />
          </Stack>
          <Box sx={{ borderLeft: '1px solid', borderColor: 'divider', pl: 2 }}>
            <Typography variant="caption" color="text.secondary">
              +{productCounts.willInsert} inserts &middot; {productCounts.willUpdate} updates &middot; {productCounts.willDelete} deletes
            </Typography>
            <br />
            <Typography variant="caption" color="text.secondary">
              {attrChanges.totalNewAttrs} attrs added &middot; {attrChanges.totalChangedValues} values changed
            </Typography>
          </Box>
        </Stack>
        <Button
          variant="contained"
          color="success"
          startIcon={<PlayArrowIcon />}
          onClick={onProceedAllClean}
          disabled={counts.clean === 0 || bulkRunning}
        >
          {bulkRunning ? 'Applying…' : `Proceed All Clean (${counts.clean})`}
        </Button>
      </Stack>
    </Paper>
  );
}
