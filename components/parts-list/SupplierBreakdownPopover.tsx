'use client';

import { useState } from 'react';
import { Box, Popover, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { SupplierQuote } from '@/lib/types';
import { SupplierCard } from '@/components/AttributesTabContent';

interface SupplierBreakdownPopoverProps {
  open: boolean;
  anchorEl: HTMLElement | null;
  supplierQuotes: SupplierQuote[] | undefined;
  mpn?: string;
  manufacturer?: string;
  onClose: () => void;
  /** Title shown above the supplier cards. Defaults to MPN — pass a custom one
   *  to disambiguate source vs replacement context (e.g. "Source: ABC123"). */
  title?: string;
}

const INITIAL_SHOW = 5;

/**
 * Anchored popover that renders one card per supplier quote (FindChips data).
 * Shared by the "Best Price (FC)", "Total Stock (FC)", "Repl. Price (FC)",
 * and "Repl. Stock (FC)" cell click flows. Mirrors the per-distributor card
 * layout used in the Commercial tab of the Part / Replacement detail view.
 */
export default function SupplierBreakdownPopover({
  open,
  anchorEl,
  supplierQuotes,
  mpn,
  manufacturer,
  onClose,
  title,
}: SupplierBreakdownPopoverProps) {
  const { t } = useTranslation();
  const [showAll, setShowAll] = useState(false);

  const quotes = supplierQuotes ?? [];
  const hasQuotes = quotes.length > 0;
  const visibleQuotes = showAll ? quotes : quotes.slice(0, INITIAL_SHOW);
  const hiddenCount = quotes.length - INITIAL_SHOW;

  const headerLabel = title ?? mpn ?? 'Distributor pricing';

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={() => { setShowAll(false); onClose(); }}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      slotProps={{ paper: { sx: { width: 480, maxHeight: 520, overflow: 'hidden' } } }}
    >
      <Box sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column', gap: 0.25 }}>
        <Typography variant="caption" sx={{ fontSize: '0.62rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Distributor pricing &amp; stock (FindChips)
        </Typography>
        <Typography variant="subtitle2" sx={{ fontSize: '0.78rem', fontWeight: 600, fontFamily: 'monospace' }}>
          {headerLabel}
        </Typography>
        {manufacturer && (
          <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>
            {manufacturer}
          </Typography>
        )}
      </Box>

      <Box sx={{ p: 1.5, overflowY: 'auto', maxHeight: 440 }}>
        {!hasQuotes && (
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.78rem', textAlign: 'center', py: 2 }}>
            No distributor data available.
          </Typography>
        )}
        {visibleQuotes.map((q, i) => (
          <SupplierCard
            key={`${q.supplier}-${q.supplierPartNumber ?? i}`}
            quote={q}
            t={t}
            mpn={mpn}
            manufacturer={manufacturer}
          />
        ))}
        {!showAll && hiddenCount > 0 && (
          <Typography
            variant="body2"
            color="primary"
            onClick={() => setShowAll(true)}
            sx={{ fontSize: '0.72rem', cursor: 'pointer', textAlign: 'center', py: 1, '&:hover': { textDecoration: 'underline' } }}
          >
            Show {hiddenCount} more distributor{hiddenCount > 1 ? 's' : ''}
          </Typography>
        )}
        {showAll && hiddenCount > 0 && (
          <Typography
            variant="body2"
            color="text.secondary"
            onClick={() => setShowAll(false)}
            sx={{ fontSize: '0.72rem', cursor: 'pointer', textAlign: 'center', py: 1, '&:hover': { textDecoration: 'underline' } }}
          >
            Show fewer
          </Typography>
        )}
      </Box>
    </Popover>
  );
}
