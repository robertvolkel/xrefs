'use client';

import { Box, Typography, Chip, TableCell, TableRow } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { AtlasGrowthEvent, AtlasGrowthEventType } from '@/app/api/admin/atlas/growth/route';

const TYPE_COLORS: Record<AtlasGrowthEventType, 'default' | 'primary' | 'success' | 'info'> = {
  first_added: 'primary',
  parts_added: 'success',
  attributes_enriched: 'info',
  re_ingested: 'default',
};

export function formatEventDate(ev: AtlasGrowthEvent): string {
  return new Date(ev.appliedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

interface AtlasEventRowProps {
  ev: AtlasGrowthEvent;
}

export default function AtlasEventRow({ ev }: AtlasEventRowProps) {
  const { t } = useTranslation();
  const visibleCategories = ev.categoriesAffected.slice(0, 3);
  const overflowCount = Math.max(0, ev.categoriesAffected.length - visibleCategories.length);

  const primaryLabel = ev.nameEn ?? ev.manufacturer ?? '—';
  const secondaryLabel = ev.nameZh ?? null;

  return (
    <TableRow sx={{ '& td': { py: 1.25, fontSize: '0.74rem' } }}>
      <TableCell sx={{ fontSize: '0.74rem', whiteSpace: 'nowrap' }}>{formatEventDate(ev)}</TableCell>
      <TableCell>
        <Box sx={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 0.75, rowGap: 0.25 }}>
          <Typography variant="body2" sx={{ fontSize: '0.78rem', fontWeight: 500, lineHeight: 1.3 }}>
            {primaryLabel}
          </Typography>
          {secondaryLabel && (
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem' }}>
              {secondaryLabel}
            </Typography>
          )}
        </Box>
      </TableCell>
      <TableCell>
        <Chip
          label={t(`admin.atlasGrowth.type.${ev.eventType}`)}
          size="small"
          color={TYPE_COLORS[ev.eventType]}
          variant="outlined"
          sx={{ fontSize: '0.65rem', height: 20 }}
        />
      </TableCell>
      <TableCell>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, maxWidth: 320 }}>
          {visibleCategories.map((c) => (
            <Chip
              key={c}
              label={c}
              size="small"
              variant="outlined"
              sx={{ fontSize: '0.65rem', height: 20, borderColor: 'divider' }}
            />
          ))}
          {overflowCount > 0 && (
            <Typography variant="caption" sx={{ alignSelf: 'center', fontSize: '0.68rem', color: 'text.secondary' }}>
              +{overflowCount}
            </Typography>
          )}
        </Box>
      </TableCell>
      <TableCell align="right" sx={{ fontSize: '0.78rem', fontWeight: 600 }}>
        {ev.partsInserted > 0 ? ev.partsInserted.toLocaleString() : '—'}
      </TableCell>
      <TableCell align="right" sx={{ fontSize: '0.78rem', fontWeight: 600 }}>
        {ev.attrChangeTotal > 0 ? ev.attrChangeTotal.toLocaleString() : '—'}
      </TableCell>
    </TableRow>
  );
}
