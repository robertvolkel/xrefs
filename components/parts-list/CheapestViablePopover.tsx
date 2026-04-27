'use client';

import { Box, Button, Chip, Popover, Stack, Typography } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { XrefRecommendation, deriveRecommendationBucket } from '@/lib/types';
import { resolveBestRecPrice } from '@/lib/columnDefinitions';

interface CheapestViablePopoverProps {
  open: boolean;
  anchorEl: HTMLElement | null;
  recs: XrefRecommendation[] | undefined;
  sourceMpn?: string;
  /** True when the popover content was derived from the row's persisted top-5
   *  rather than a fresh full-rec computation. The list may not include the
   *  global price floor — surface a refresh affordance. */
  isFallback?: boolean;
  /** Triggers a per-row refresh; only shown when `isFallback` is true. */
  onRefresh?: () => void;
  onClose: () => void;
  onSelectRec?: (rec: XrefRecommendation) => void;
}

function formatPrice(value: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value);
  } catch {
    return `${value.toFixed(4)} ${currency}`;
  }
}

function bucketLabel(rec: XrefRecommendation): { label: string; color: 'success' | 'primary' | 'default' } {
  const bucket = deriveRecommendationBucket(rec);
  if (bucket === 'accuris') return { label: 'Accuris Cert', color: 'success' };
  if (bucket === 'manufacturer') return { label: 'MFR Cert', color: 'primary' };
  return { label: `${rec.matchPercentage}%`, color: 'default' };
}

/**
 * Anchored popover listing the top viable replacements for a row, sorted by
 * best FC unit price ascending. Surfaces the price floor when there are many
 * viable swaps that won't all fit in the row's persisted alternates.
 */
export default function CheapestViablePopover({
  open,
  anchorEl,
  recs,
  sourceMpn,
  isFallback,
  onRefresh,
  onClose,
  onSelectRec,
}: CheapestViablePopoverProps) {
  const list = recs ?? [];

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      slotProps={{ paper: { sx: { width: 540, maxHeight: 480, overflow: 'hidden' } } }}
    >
      <Box sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="caption" sx={{ fontSize: '0.62rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>
          Cheapest viable replacements (FindChips)
        </Typography>
        {sourceMpn && (
          <Typography variant="subtitle2" sx={{ fontSize: '0.78rem', fontWeight: 600, fontFamily: 'monospace' }}>
            Source: {sourceMpn}
          </Typography>
        )}
      </Box>

      {isFallback && (
        <Box sx={{ px: 1.5, py: 0.75, bgcolor: 'warning.main', color: 'warning.contrastText', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Typography variant="caption" sx={{ fontSize: '0.65rem', lineHeight: 1.3 }}>
            Showing the cheapest among this row&apos;s saved alternates. Refresh the row to scan all candidates.
          </Typography>
          {onRefresh && (
            <Button
              size="small"
              startIcon={<RefreshIcon sx={{ fontSize: 14 }} />}
              onClick={onRefresh}
              sx={{ fontSize: '0.65rem', textTransform: 'none', color: 'warning.contrastText', borderColor: 'warning.contrastText', minHeight: 24, px: 1, flexShrink: 0 }}
              variant="outlined"
            >
              Refresh
            </Button>
          )}
        </Box>
      )}

      <Box sx={{ overflowY: 'auto', maxHeight: 400 }}>
        {list.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.78rem', textAlign: 'center', py: 3 }}>
            No viable cheaper alternatives.
          </Typography>
        )}
        {list.map((rec, i) => {
          const price = resolveBestRecPrice(rec);
          const stockTotals = rec.part.supplierQuotes
            ?.map(q => q.quantityAvailable)
            .filter((s): s is number => s != null);
          const stock = stockTotals && stockTotals.length > 0
            ? stockTotals.reduce((a, b) => a + b, 0)
            : rec.part.quantityAvailable;
          const badge = bucketLabel(rec);
          const clickable = !!onSelectRec;
          return (
            <Box
              key={`${rec.part.mpn}-${i}`}
              onClick={clickable ? () => onSelectRec(rec) : undefined}
              sx={{
                px: 1.5,
                py: 1,
                borderBottom: i < list.length - 1 ? 1 : 0,
                borderColor: 'divider',
                cursor: clickable ? 'pointer' : 'default',
                '&:hover': clickable ? { bgcolor: 'action.hover' } : undefined,
                display: 'grid',
                gridTemplateColumns: '1fr auto auto',
                columnGap: 1.5,
                rowGap: 0.25,
                alignItems: 'center',
              }}
            >
              <Stack direction="row" alignItems="center" spacing={0.75} sx={{ minWidth: 0 }}>
                <Typography
                  variant="body2"
                  sx={{ fontFamily: 'monospace', fontSize: '0.78rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {rec.part.mpn}
                </Typography>
                <Chip
                  label={badge.label}
                  size="small"
                  color={badge.color === 'default' ? undefined : badge.color}
                  variant={badge.color === 'default' ? 'outlined' : 'filled'}
                  sx={{ height: 18, fontSize: '0.6rem', '& .MuiChip-label': { px: 0.6 } }}
                />
              </Stack>
              <Typography
                variant="body2"
                sx={{ fontFamily: 'monospace', fontSize: '0.78rem', fontWeight: 600, textAlign: 'right', minWidth: 70 }}
              >
                {price != null ? formatPrice(price) : '—'}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontSize: '0.65rem', textAlign: 'right', minWidth: 60 }}
              >
                {stock != null ? `${stock.toLocaleString()} stk` : '— stk'}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontSize: '0.65rem', gridColumn: '1 / -1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {rec.part.manufacturer}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Popover>
  );
}
