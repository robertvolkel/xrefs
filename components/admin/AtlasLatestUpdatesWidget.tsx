'use client';

import {
  Box,
  Typography,
  Button,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@mui/material';
import ArrowForwardOutlinedIcon from '@mui/icons-material/ArrowForwardOutlined';
import { useTranslation } from 'react-i18next';
import type { AtlasGrowthEvent } from '@/app/api/admin/atlas/growth/route';
import AtlasEventRow from './atlasCoverage/AtlasEventRow';

interface AtlasLatestUpdatesWidgetProps {
  events: AtlasGrowthEvent[];
  onViewAll: () => void;
}

export default function AtlasLatestUpdatesWidget({ events, onViewAll }: AtlasLatestUpdatesWidgetProps) {
  const { t } = useTranslation();

  return (
    <Box
      sx={{
        p: 2.5,
        border: 1,
        borderColor: 'divider',
        borderRadius: 2,
        bgcolor: 'background.paper',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography variant="body1" fontWeight={600}>
          {t('admin.atlasGrowth.latestTitle')}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {t('admin.atlasGrowth.latestSubtitle')}
        </Typography>
      </Box>

      {events.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
          {t('admin.atlasGrowth.emptyRecent')}
        </Typography>
      ) : (
        <Table size="small" sx={{ '& td, & th': { borderColor: 'divider' } }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, fontSize: '0.72rem', width: 160 }}>
                {t('admin.atlasGrowth.colDate')}
              </TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: '0.72rem' }}>
                {t('admin.atlasGrowth.colMfr')}
              </TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: '0.72rem', width: 140 }}>
                {t('admin.atlasGrowth.colType')}
              </TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: '0.72rem' }}>
                {t('admin.atlasGrowth.colCategories')}
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.72rem', width: 110 }}>
                {t('admin.atlasGrowth.colPartsAdded')}
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.72rem', width: 110 }}>
                {t('admin.atlasGrowth.colAttrUpdates')}
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {events.map((ev) => (
              <AtlasEventRow key={ev.id} ev={ev} />
            ))}
          </TableBody>
        </Table>
      )}

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
        <Button
          size="small"
          endIcon={<ArrowForwardOutlinedIcon fontSize="small" />}
          onClick={onViewAll}
          sx={{ textTransform: 'none', fontSize: '0.78rem' }}
        >
          {t('admin.atlasGrowth.viewAll')}
        </Button>
      </Box>
    </Box>
  );
}
