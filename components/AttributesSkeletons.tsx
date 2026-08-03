'use client';
import { Box, Skeleton, Stack, TableCell, TableRow, Typography } from '@mui/material';
import { ROW_FONT_SIZE, ROW_FONT_SIZE_MOBILE, ROW_PY, ROW_PY_MOBILE, ROW_HEIGHT, ROW_HEIGHT_MOBILE } from '@/lib/layoutConstants';

/* ────────────────────────────────────────────────────────────────────────────
 * Loading skeletons shared by the source panel (AttributesPanel), its tab
 * bodies (AttributesTabContent) and the replacement panel (ComparisonView).
 *
 * This module exists to break an import cycle: AttributesPanel imports
 * AttributesTabContent, so AttributesTabContent can never import back. Both
 * import from HERE instead. Keep this file free of imports from either panel.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The single rule behind every loading shimmer in the source panel:
 * shimmer iff the fetch is still in flight AND the field has no value yet.
 *
 * `0`, `false` and `[]` are REAL values, not absences — a part with zero
 * distributors must render "0", never a shimmer. Only null/undefined/'' count
 * as pending, so a `!value` test here would reintroduce exactly the false-empty
 * bug this whole treatment exists to fix.
 *
 * Note `supplierQuotes` is written as `quotes.length > 0 ? quotes : undefined`
 * (partDataService), so "fetched, none found" also arrives as `undefined`. That
 * is fine: the source part resolves in a single frame, after which `isEnriching`
 * is false and the row renders its real empty value.
 */
export function isPending(value: unknown, isEnriching: boolean): boolean {
  return isEnriching && (value === undefined || value === null || value === '');
}

/**
 * A shimmer that occupies EXACTLY the height its resolved value will.
 *
 * The em-dash stays in the DOM but transparent, so the line box is the real
 * one; the Skeleton is absolutely positioned and contributes zero layout.
 * A bare `<Skeleton height={14}/>` is ~4px shorter than the resolved
 * Typography, and with a dozen shimmering rows that compounds into a visible
 * whole-panel jolt the moment data lands. Do not "simplify" this away.
 */
export function ShimmerValue({ width = 72 }: { width?: number | string }) {
  return (
    <Typography
      component="span"
      variant="body2"
      aria-hidden
      sx={{
        position: 'relative',
        display: 'inline-block',
        minWidth: width,
        color: 'transparent',
        fontFamily: 'monospace',
        fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE },
      }}
    >
      &#8212;
      <Skeleton variant="rounded" sx={{ position: 'absolute', inset: '18% 0', height: 'auto' }} />
    </Typography>
  );
}

export function SkeletonSectionHeader() {
  return (
    <Box sx={{ bgcolor: 'background.paper', borderTop: 1, borderBottom: 1, borderColor: 'divider', px: 2, py: 0.75 }}>
      <Skeleton width={90} height={14} />
    </Box>
  );
}

export function SkeletonFieldRow({ labelWidth, valueWidth }: { labelWidth: number; valueWidth: number }) {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ py: 0.75, px: 2, minHeight: 32 }}>
      <Skeleton width={labelWidth} height={14} />
      <Skeleton width={valueWidth} height={14} />
    </Stack>
  );
}

/** One Specs-table placeholder row, matching the real row's geometry so it
 *  doesn't jitter against the table's stickyHeader + fixed layout. */
export function SkeletonSpecRow() {
  return (
    <TableRow sx={{ height: { xs: ROW_HEIGHT_MOBILE, md: ROW_HEIGHT } }}>
      <TableCell sx={{ borderColor: 'divider', width: '50%', py: { xs: ROW_PY_MOBILE, md: ROW_PY } }}>
        <Skeleton width={120} height={16} />
      </TableCell>
      <TableCell sx={{ borderColor: 'divider', py: { xs: ROW_PY_MOBILE, md: ROW_PY } }}>
        <Skeleton width={80} height={16} />
      </TableCell>
    </TableRow>
  );
}

export function OverviewSkeleton() {
  return (
    <Box sx={{ flex: 1, overflowY: 'auto' }}>
      {/* Hero */}
      <Box sx={{ display: 'flex', gap: 1.5, px: 2, py: 1.5 }}>
        <Skeleton variant="rectangular" width={80} height={80} sx={{ borderRadius: 1, flexShrink: 0 }} />
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 0.5 }}>
          <Skeleton width="50%" height={12} />
          <Skeleton width="70%" height={18} />
          <Skeleton width="40%" height={14} />
        </Box>
      </Box>
      <SkeletonSectionHeader />
      <SkeletonFieldRow labelWidth={80} valueWidth={220} />
      <SkeletonFieldRow labelWidth={70} valueWidth={70} />
      <SkeletonFieldRow labelWidth={110} valueWidth={60} />
      <SkeletonFieldRow labelWidth={90} valueWidth={80} />
      <SkeletonFieldRow labelWidth={120} valueWidth={50} />
      <SkeletonSectionHeader />
      <SkeletonFieldRow labelWidth={80} valueWidth={40} />
      <SkeletonFieldRow labelWidth={90} valueWidth={70} />
      <SkeletonFieldRow labelWidth={100} valueWidth={120} />
      <SkeletonFieldRow labelWidth={90} valueWidth={70} />
      <SkeletonSectionHeader />
      <Box sx={{ px: 2, py: 0.75 }}>
        <Stack direction="row" spacing={0.75}>
          <Skeleton variant="rounded" width={70} height={20} />
          <Skeleton variant="rounded" width={60} height={20} />
          <Skeleton variant="rounded" width={80} height={20} />
        </Stack>
      </Box>
    </Box>
  );
}

/**
 * Distributor-card placeholders for the Commercial tab.
 *
 * `count` and `dense` preserve two call sites that were previously separate
 * near-duplicates: the full-panel skeleton (4 roomy cards, used when there are
 * no attributes at all) and the inline "quotes still arriving" skeleton (2
 * tighter cards, used when the rest of the part has already painted).
 */
export function CommercialSkeleton({ count = 4, dense = false }: { count?: number; dense?: boolean }) {
  return (
    <Box
      sx={dense ? { flex: 1, overflowY: 'auto', p: 1.5 } : { flex: 1, overflowY: 'auto', px: 2, py: 1.5 }}
      aria-label="Loading pricing and stock"
    >
      {Array.from({ length: count }).map((_, i) => (
        <Box key={i} sx={{ mb: dense ? 1.5 : 2, p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: dense ? 0.5 : 1 }}>
            <Skeleton width={120} height={18} />
            <Skeleton width={60} height={18} />
          </Stack>
          <Skeleton width="40%" height={14} sx={{ mb: 0.5 }} />
          <Skeleton width={dense ? '55%' : '60%'} height={14} sx={dense ? undefined : { mb: 0.5 }} />
          {!dense && <Skeleton width="50%" height={14} />}
        </Box>
      ))}
    </Box>
  );
}
