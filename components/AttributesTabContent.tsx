'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Chip,
  Stack,
  Link,
  Tooltip,
  TextField,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import type { TFunction } from 'i18next';
import { Part, SupplierQuote, XrefRecommendation, RecommendationCategory, deriveRecommendationCategories } from '@/lib/types';
import { ROW_FONT_SIZE, ROW_FONT_SIZE_MOBILE } from '@/lib/layoutConstants';
import { logDistributorClick } from '@/lib/supabaseLogger';
import { isDomainCoveredQualification, humanReadable } from '@/lib/services/qualificationDomain';
import { computeBestPrice, formatPrice } from '@/lib/services/bestPriceCalculator';
import { QUANTITY_PRESETS, parseQuantity } from '@/lib/constants/quantityPresets';
import QuantityPresetButtons from './QuantityPresetButtons';

type T = TFunction<'translation', undefined>;

// Re-export the canonical price formatter (single implementation lives in
// bestPriceCalculator so the Commercial tab and the chat best-price prose format
// the same number identically). Existing importers (e.g. RecommendationCard)
// keep importing it from here.
export { formatPrice };

/* ── "Good/certified" green, shared with the manufacturer_certified chip below ── */
const SUCCESS_GREEN = '#69F0AE';
const SUCCESS_GREEN_BG = 'rgba(105, 240, 174, 0.12)';

/* ── Always-editable quantity control for the Commercial tab header.
 *  Unlike chat's QuantityPrompt (one-shot submit + lock), this stays live so
 *  the user can re-price repeatedly. Commits valid positive integers only. ── */
function QuantityInline({ value, onChange }: { value: number; onChange: (qty: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  // Sync the field to an external value change (preset click, chat, sibling
  // panel) — but if the field is focused (the user is mid-edit), the updater
  // returns the current draft unchanged so their in-progress edit isn't wiped.
  // The setDraft call stays unconditional; the focus check lives in the updater.
  const focusedRef = useRef(false);
  useEffect(() => {
    setDraft((d) => (focusedRef.current ? d : String(value)));
  }, [value]);

  const commit = (raw: string) => {
    const n = parseQuantity(raw);
    if (n === null) {
      setDraft(String(value)); // revert invalid input
      return;
    }
    if (n !== value) onChange(n);
  };

  return (
    <Box sx={{ mb: 1.5 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.75 }}>
        <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.secondary', fontWeight: 600 }}>
          Quantity
        </Typography>
        <TextField
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
          onFocus={() => { focusedRef.current = true; }}
          onBlur={() => { focusedRef.current = false; commit(draft); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(draft); } }}
          size="small"
          inputProps={{ inputMode: 'numeric', pattern: '[0-9]*', 'aria-label': 'Quantity', style: { padding: '2px 8px', fontSize: '0.75rem', width: 72 } }}
        />
      </Stack>
      <QuantityPresetButtons compact presets={QUANTITY_PRESETS} activeValue={value} onSelect={onChange} />
    </Box>
  );
}

/* ── Pill toggle bar shared styles ── */
export const pillGroupSx = {
  mt: 1,
  height: 28,
  minHeight: 28,
  '& .MuiToggleButtonGroup-grouped': {
    border: '1px solid',
    borderColor: 'divider',
    borderRadius: '14px !important',
    mx: 0.25,
    '&:not(:first-of-type)': { borderLeft: '1px solid', borderColor: 'divider' },
  },
  '& .MuiToggleButton-root': {
    height: 28,
    fontSize: '0.68rem',
    textTransform: 'none' as const,
    px: 1.5,
    py: 0,
    color: 'text.secondary',
    '&.Mui-selected': {
      bgcolor: 'action.selected',
      color: 'text.primary',
      borderColor: 'text.disabled',
    },
  },
};

type DataSource = 'digikey' | 'partsio' | 'mouser' | 'atlas';

const SOURCE_LABELS: Record<DataSource, string> = { digikey: 'D', partsio: 'P', mouser: 'M', atlas: 'A' };

/* ── Small circular source badge (D / P / M) ── */
function SourceBadge({ source }: { source: DataSource }) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 14, height: 14, borderRadius: '50%',
        border: '1px solid', borderColor: 'text.disabled',
        fontSize: '0.5rem', color: 'text.disabled', fontWeight: 600, fontFamily: 'sans-serif',
        flexShrink: 0, ml: 0.75,
      }}
    >
      {SOURCE_LABELS[source]}
    </Box>
  );
}

/* ── Reusable label-value row ── */
export function FieldRow({ label, value, source, children }: { label: string; value?: string; source?: DataSource; children?: React.ReactNode }) {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ py: 0.75, px: 2 }}>
      <Typography variant="body2" color="text.secondary" sx={{ fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE } }}>
        {label}
      </Typography>
      <Stack direction="row" alignItems="center">
        {children ?? (
          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE } }}>
            {value}
          </Typography>
        )}
        {source && <SourceBadge source={source} />}
      </Stack>
    </Stack>
  );
}

/* Description row — clamps to 2 lines with reserved height so comparison
   panels stay row-aligned. Tooltip + `cursor: help` activate only when the
   text actually overflows (detected via ResizeObserver). */
function DescriptionRow({ description }: { description?: string }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflowing(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [description]);

  return (
    <FieldRow label="Description">
      <Tooltip
        title={description || ''}
        arrow
        placement="left"
        disableHoverListener={!overflowing}
        disableFocusListener={!overflowing}
        disableTouchListener={!overflowing}
      >
        <Typography
          ref={ref}
          variant="body2"
          component="span"
          sx={{
            fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE },
            lineHeight: 1.4,
            textAlign: 'right',
            maxWidth: 420,
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 2,
            overflow: 'hidden',
            minHeight: '2.8em',
            color: description ? 'text.primary' : 'text.secondary',
            cursor: overflowing ? 'help' : 'default',
          }}
        >
          {description || '—'}
        </Typography>
      </Tooltip>
    </FieldRow>
  );
}

/* ── Overview tab helpers ── */

const CATEGORY_CHIP_COLORS: Record<'manufacturer_certified' | 'third_party_certified' | 'logic_driven', { bg: string; border: string; fg: string }> = {
  manufacturer_certified: { bg: SUCCESS_GREEN_BG, border: SUCCESS_GREEN, fg: SUCCESS_GREEN },
  third_party_certified: { bg: 'rgba(255, 213, 79, 0.12)', border: '#FFD54F', fg: '#FFD54F' },
  logic_driven: { bg: 'rgba(79, 195, 247, 0.12)', border: '#4FC3F7', fg: '#4FC3F7' },
};

/** Target Price: min(per-distributor top-tier unit price) × 0.80 */
function computeTargetPrice(quotes: SupplierQuote[] | undefined): { targetPrice: number; currency: string } | null {
  if (!quotes || quotes.length === 0) return null;
  const perDistributorTopTier: Array<{ price: number; currency: string }> = [];
  for (const q of quotes) {
    if (!q.priceBreaks || q.priceBreaks.length === 0) continue;
    const topTier = [...q.priceBreaks].sort((a, b) => b.quantity - a.quantity)[0];
    if (topTier) perDistributorTopTier.push({ price: topTier.unitPrice, currency: topTier.currency });
  }
  if (perDistributorTopTier.length === 0) return null;
  const cheapest = perDistributorTopTier.reduce((min, curr) => curr.price < min.price ? curr : min);
  return { targetPrice: cheapest.price * 0.8, currency: cheapest.currency };
}

/** Flatten min/max unitPrice across every priceBreak of every distributor */
export function computePriceRange(quotes: SupplierQuote[] | undefined): { min: number; max: number; currency: string } | null {
  if (!quotes || quotes.length === 0) return null;
  const all: Array<{ price: number; currency: string }> = [];
  for (const q of quotes) {
    for (const pb of q.priceBreaks ?? []) {
      all.push({ price: pb.unitPrice, currency: pb.currency });
    }
  }
  if (all.length === 0) return null;
  const min = all.reduce((m, p) => p.price < m.price ? p : m);
  const max = all.reduce((m, p) => p.price > m.price ? p : m);
  return { min: min.price, max: max.price, currency: min.currency };
}

/** Aggregate cross-reference categories + unique MFR list with China flag.
 *  Counts over the FULL candidate set: the Replacements panel now shows every
 *  candidate regardless of lifecycle status or match quality (Decision #227),
 *  so a chip's number equals what clicking it surfaces in the panel. */
function summarizeCrossRefs(allRecs: XrefRecommendation[] | undefined) {
  if (!allRecs || allRecs.length === 0) return null;
  const recs = allRecs;
  let mfrCertified = 0;
  let thirdPartyCertified = 0;
  let logicDriven = 0;
  const mfrMap = new Map<string, { isChinese: boolean }>();
  for (const rec of recs) {
    const cats = deriveRecommendationCategories(rec);
    if (cats.includes('manufacturer_certified')) mfrCertified += 1;
    if (cats.includes('third_party_certified')) thirdPartyCertified += 1;
    if (cats.includes('logic_driven')) logicDriven += 1;
    const mfr = rec.part.manufacturer;
    if (!mfr) continue;
    const entry = mfrMap.get(mfr) ?? { isChinese: false };
    if (rec.dataSource === 'atlas') entry.isChinese = true;
    mfrMap.set(mfr, entry);
  }
  const mfrs = Array.from(mfrMap.entries()).map(([name, v]) => ({ name, isChinese: v.isChinese }));
  mfrs.sort((a, b) => a.name.localeCompare(b.name));
  return { mfrCertified, thirdPartyCertified, logicDriven, mfrs };
}

/* ── Section header styled like the Specs tab table header strip ── */
function SectionHeader({ label }: { label: string }) {
  return (
    <Box
      sx={{
        bgcolor: 'background.paper',
        borderTop: 1,
        borderBottom: 1,
        borderColor: 'divider',
        px: 2,
        py: 0.75,
      }}
    >
      <Typography
        variant="subtitle2"
        sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em' }}
      >
        {label}
      </Typography>
    </Box>
  );
}

/* ── Overview tab content ── */
export function OverviewContent({ part, t, allRecommendations, dataSource, xrefCategory = 'all', xrefMfr = '', onSelectXrefCategory, onSelectXrefMfr }: { part: Part; t: T; allRecommendations?: XrefRecommendation[]; dataSource?: DataSource; xrefCategory?: RecommendationCategory | 'all'; xrefMfr?: string; onSelectXrefCategory?: (cat: RecommendationCategory | 'all') => void; onSelectXrefMfr?: (mfr: string) => void }) {
  const description = part.detailedDescription || part.description;
  const distributorCount = part.supplierQuotes?.length ?? 0;
  const totalStock = part.supplierQuotes?.reduce((sum, q) => sum + (q.quantityAvailable ?? 0), 0) ?? 0;
  const priceRange = computePriceRange(part.supplierQuotes);
  const targetPrice = computeTargetPrice(part.supplierQuotes);
  const xrefSummary = summarizeCrossRefs(allRecommendations);

  const visibleQualifications = part.qualifications?.filter(q => !isDomainCoveredQualification(q)) ?? [];
  const hasQualifications = visibleQualifications.length > 0;

  return (
    <Box sx={{ flex: 1, overflowY: 'auto' }}>
      {/* Hero — image + identity */}
      <Box sx={{ display: 'flex', gap: 1.5, px: 2, py: 1.5 }}>
        <Box
          sx={{
            width: 80,
            height: 80,
            minWidth: 80,
            border: 1,
            borderColor: 'divider',
            borderRadius: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'background.paper',
            overflow: 'hidden',
          }}
        >
          {part.imageUrl ? (
            <Box
              component="img"
              src={part.imageUrl}
              alt={part.mpn}
              sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
            />
          ) : (
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.6rem' }}>No image</Typography>
          )}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {part.category}{part.subcategory ? ` › ${part.subcategory}` : ''}
          </Typography>
          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.85rem', fontWeight: 600, mt: 0.25 }} noWrap>
            {part.mpn}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.72rem' }} noWrap component="div">
            {part.manufacturer}
            {part.mfrOrigin === 'atlas' && (
              <Tooltip title="Chinese manufacturer" arrow>
                <Box component="span" sx={{ ml: 0.5, fontSize: 11, verticalAlign: 'middle', lineHeight: 1 }}>&#127464;&#127475;</Box>
              </Tooltip>
            )}
          </Typography>
        </Box>
      </Box>

      {/* Attributes — every row always rendered (with "—" fallback) so row
          positions match between the source panel and the side-by-side
          comparison panel. See parts.io rows below for the same pattern. */}
      <SectionHeader label="Attributes" />
      <DescriptionRow description={description} />
      {part.datasheetUrl ? (
        <FieldRow label="Datasheet">
          <Link
            href={part.datasheetUrl}
            target="_blank"
            rel="noopener"
            sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE }, color: '#E57373' }}
          >
            View PDF
            <OpenInNewIcon sx={{ fontSize: '0.8rem' }} />
          </Link>
        </FieldRow>
      ) : (
        <FieldRow label="Datasheet" value="—" />
      )}
      {part.status ? (
        <FieldRow label={t('attributes.lifecycleStatus')} source={dataSource ?? 'digikey' as DataSource}>
          <Chip label={part.status} size="small" color={part.status === 'Active' ? 'success' : 'warning'} variant="outlined" sx={{ height: 18, fontSize: '0.6rem' }} />
        </FieldRow>
      ) : (
        <FieldRow label={t('attributes.lifecycleStatus')} value="—" source={dataSource ?? 'digikey' as DataSource} />
      )}
      {/* Grade — qualification tier (Automotive / Medical / Military / Commercial).
          Always rendered for source/comparison alignment; "—" when unclassified. */}
      <FieldRow
        label="Grade"
        value={
          part.qualificationDomain && part.qualificationDomain.domain !== 'unknown'
            ? humanReadable(part.qualificationDomain.domain)
            : '—'
        }
        source={dataSource ?? 'digikey' as DataSource}
      />

      {/* parts.io-sourced rows — always rendered so section heights stay aligned
          between the source and the side-by-side comparison panel. Values fall
          back to "—" when parts.io has no data for the part. */}
      <FieldRow
        label="Years to EOL"
        value={part.yteol != null ? `${part.yteol.toFixed(1)} yrs` : '—'}
        source="partsio"
      />
      {part.riskRank != null ? (
        <FieldRow label={t('attributes.riskRank')} source="partsio">
          <Stack direction="row" alignItems="center" spacing={0.75}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: part.riskRank <= 2 ? '#69F0AE' : part.riskRank <= 5 ? '#FFD54F' : '#FF5252', flexShrink: 0 }} />
            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE } }}>
              {part.riskRank.toFixed(1)}
            </Typography>
          </Stack>
        </FieldRow>
      ) : (
        <FieldRow label={t('attributes.riskRank')} value="—" source="partsio" />
      )}
      <FieldRow label={t('attributes.countryOfOrigin')} value={part.countryOfOrigin || '—'} source="partsio" />
      {part.lifecycleInfo?.filter(l => l.suggestedReplacement).map(l => (
        <FieldRow key={l.source} label={t('attributes.suggestedReplacement')} value={l.suggestedReplacement!} source={l.source as DataSource} />
      ))}

      {/* Distribution — always shown so empty state is visible */}
      <SectionHeader label="Distribution" />
      <FieldRow label="Distributors" value={String(distributorCount)} />
      <FieldRow label="Total Stock" value={totalStock > 0 ? totalStock.toLocaleString() : '—'} />
      <FieldRow
        label="Price Range"
        value={priceRange ? `${formatPrice(priceRange.min, priceRange.currency)} – ${formatPrice(priceRange.max, priceRange.currency)}` : '—'}
      />
      <FieldRow label="Target Price">
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: targetPrice ? 600 : 400, fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE } }}>
            {targetPrice ? formatPrice(targetPrice.targetPrice, targetPrice.currency) : '—'}
          </Typography>
          <Tooltip title="Lowest per-distributor top-tier price, reduced by 20%" arrow>
            <Box component="span" sx={{ fontSize: '0.6rem', color: 'text.disabled', cursor: 'help' }}>ⓘ</Box>
          </Tooltip>
        </Stack>
      </FieldRow>

      {/* Qualifications */}
      {hasQualifications && (
        <>
          <SectionHeader label="Qualifications" />
          <Box sx={{ px: 2, py: 0.75 }}>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
              {visibleQualifications.map(q => (
                <Chip
                  key={q}
                  label={q}
                  size="small"
                  variant="outlined"
                  sx={{ height: 18, fontSize: '0.6rem', color: '#4FC3F7', borderColor: '#4FC3F7' }}
                />
              ))}
            </Stack>
          </Box>
        </>
      )}

      {/* Environmental & Export — section header + 4 fixed rows always rendered
          (with "—" fallback) so row positions align with the comparison panel.
          Dynamic per-region HTS rows append after the fixed rows when present. */}
      <SectionHeader label="Environmental & Export" />
      <FieldRow label={t('attributes.rohsStatus')} value={part.rohsStatus || '—'} source="mouser" />
      <FieldRow label={t('attributes.reachCompliance')} value={part.reachCompliance || '—'} source="partsio" />
      <FieldRow label={t('attributes.eccnCode')} value={part.eccnCode || '—'} source="partsio" />
      <FieldRow label={t('attributes.htsCode')} value={part.htsCode || '—'} source="partsio" />
      {part.complianceData?.filter(c => c.htsCodesByRegion).map(c => (
        Object.entries(c.htsCodesByRegion!).map(([region, code]) => (
          <FieldRow key={`${c.source}-${region}`} label={`HTS (${region.toUpperCase()})`} value={code} source={c.source as DataSource} />
        ))
      ))}

      {/* Cross References (source-side only) — last so it doesn't fight for
          alignment with the comparison panel's Environmental & Export. */}
      {xrefSummary && (
        <>
          <SectionHeader label="Cross References" />
          <Box sx={{ px: 2, py: 0.75 }}>
            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
              {([
                { key: 'manufacturer_certified' as const, label: 'MFR Certified', count: xrefSummary.mfrCertified },
                { key: 'third_party_certified' as const, label: 'Accuris Certified', count: xrefSummary.thirdPartyCertified },
                { key: 'logic_driven' as const, label: 'Logic Driven', count: xrefSummary.logicDriven },
              ]).filter(c => c.count > 0).map(({ key, label, count }) => {
                const colors = CATEGORY_CHIP_COLORS[key];
                const active = xrefCategory === key;
                const clickable = Boolean(onSelectXrefCategory);
                return (
                  <Chip
                    key={key}
                    label={`${label} (${count})`}
                    size="small"
                    variant="outlined"
                    onClick={clickable ? () => onSelectXrefCategory!(active ? 'all' : key) : undefined}
                    sx={{
                      height: 20,
                      fontSize: '0.62rem',
                      cursor: clickable ? 'pointer' : 'default',
                      fontWeight: active ? 700 : 400,
                      bgcolor: active ? colors.fg : colors.bg,
                      borderColor: colors.border,
                      color: active ? '#0b0b0b' : colors.fg,
                      '&:hover': clickable ? { bgcolor: active ? colors.fg : colors.border, color: '#0b0b0b' } : undefined,
                    }}
                  />
                );
              })}
            </Stack>
          </Box>
          {xrefSummary.mfrs.length > 0 && (
            <Box sx={{ px: 2, pb: 1 }}>
              <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.6rem', display: 'block', mb: 0.5 }}>
                Manufacturers with crosses
              </Typography>
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                {xrefSummary.mfrs.map(m => {
                  const active = xrefMfr === m.name;
                  const clickable = Boolean(onSelectXrefMfr);
                  return (
                    <Chip
                      key={m.name}
                      size="small"
                      variant={active ? 'filled' : 'outlined'}
                      color={active ? 'primary' : 'default'}
                      onClick={clickable ? () => onSelectXrefMfr!(active ? '' : m.name) : undefined}
                      sx={{ height: 20, fontSize: '0.62rem', cursor: clickable ? 'pointer' : 'default' }}
                      label={
                        <Stack direction="row" alignItems="center" spacing={0.25} component="span">
                          <Box component="span">{m.name}</Box>
                          {m.isChinese && (
                            <Tooltip title="Atlas — Chinese manufacturer" arrow>
                              <Box component="span" sx={{ fontSize: 11, lineHeight: 1 }}>&#127464;&#127475;</Box>
                            </Tooltip>
                          )}
                        </Stack>
                      }
                    />
                  );
                })}
              </Stack>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}

/* ── Supplier display name map ── */
// Single source of truth lives in lib/constants/suppliers.ts so chat answers,
// parts-list columns, and the right-panel SupplierCard all render the same
// canonical names ("RS Components", not "rs"; "element14" preserves brand casing).
export { SUPPLIER_DISPLAY, formatSupplierName } from '@/lib/constants/suppliers';
import { SUPPLIER_DISPLAY as _SUPPLIER_DISPLAY } from '@/lib/constants/suppliers';

/* ── Supplier quote card ── */
export function SupplierCard({
  quote,
  t,
  mpn,
  manufacturer,
  isBestPrice = false,
  highlightTierQty = null,
  highlightCurrency = null,
  bestLabel,
}: {
  quote: SupplierQuote;
  t: T;
  mpn?: string;
  manufacturer?: string;
  /** When true, crown this card as the best spot price (green border + tint + chip). */
  isBestPrice?: boolean;
  /** The price-break tier qty to highlight green inside this card's table. */
  highlightTierQty?: number | null;
  /** Currency of the winning tier — disambiguates rare mixed-currency suppliers. */
  highlightCurrency?: string | null;
  /** Header chip label for a crowned card (e.g. "Best @ qty 100" / "Min qty 250"). */
  bestLabel?: string;
}) {
  const supplierLabel = _SUPPLIER_DISPLAY[quote.supplier] ?? quote.supplier.charAt(0).toUpperCase() + quote.supplier.slice(1);
  const currency = quote.priceBreaks[0]?.currency;

  return (
    <Box
      sx={{
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        p: 1.5,
        mb: 1,
      }}
    >
      {/* Header */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.75 }}>
        <Stack direction="row" alignItems="center" spacing={0.75}>
          <Typography variant="subtitle2" sx={{ fontSize: '0.75rem', fontWeight: 600 }}>
            {supplierLabel}
          </Typography>
          {isBestPrice && bestLabel && (
            <Chip
              label={bestLabel}
              size="small"
              sx={{ height: 16, fontSize: '0.55rem', fontWeight: 700, color: SUCCESS_GREEN, bgcolor: SUCCESS_GREEN_BG, border: `1px solid ${SUCCESS_GREEN}`, '& .MuiChip-label': { px: 0.6 } }}
            />
          )}
          {quote.authorized && (
            <Typography variant="caption" sx={{ fontSize: '0.55rem', color: 'success.main', fontWeight: 500 }}>Auth</Typography>
          )}
        </Stack>
        {quote.productUrl && (
          <Link
            href={quote.productUrl}
            target="_blank"
            rel="noopener"
            underline="none"
            onClick={() => {
              if (mpn && manufacturer) {
                logDistributorClick({ mpn, manufacturer, distributor: quote.supplier, productUrl: quote.productUrl });
              }
            }}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.25,
              px: 0.75,
              py: 0.15,
              fontSize: '0.6rem',
              fontWeight: 600,
              letterSpacing: '0.02em',
              color: 'primary.main',
              border: 1,
              borderColor: 'primary.main',
              borderRadius: 0.75,
              '&:hover': { bgcolor: 'primary.main', color: 'primary.contrastText' },
            }}
          >
            Go Buy
            <OpenInNewIcon sx={{ fontSize: '0.7rem' }} />
          </Link>
        )}
      </Stack>

      {/* Summary row */}
      <Stack direction="row" spacing={2} sx={{ mb: quote.priceBreaks.length > 0 ? 0.75 : 0 }}>
        {quote.unitPrice != null && (
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem', display: 'block' }}>{t('attributes.unitPrice')}</Typography>
            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: ROW_FONT_SIZE }}>{formatPrice(quote.unitPrice, currency)}</Typography>
          </Box>
        )}
        {quote.quantityAvailable != null && (
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem', display: 'block' }}>{t('attributes.stock')}</Typography>
            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: ROW_FONT_SIZE }}>{quote.quantityAvailable.toLocaleString()}</Typography>
          </Box>
        )}
        {quote.packageType && (
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem', display: 'block' }}>Package</Typography>
            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: ROW_FONT_SIZE }}>{quote.packageType}</Typography>
          </Box>
        )}
      </Stack>

      {/* Price breaks */}
      {quote.priceBreaks.length > 0 && (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontSize: '0.6rem', fontWeight: 600, color: 'text.secondary', borderColor: 'divider', py: 0.25 }}>{t('attributes.quantity')}</TableCell>
              <TableCell sx={{ fontSize: '0.6rem', fontWeight: 600, color: 'text.secondary', borderColor: 'divider', py: 0.25 }}>{t('attributes.unitPrice')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {quote.priceBreaks.map((pb) => {
              const isWinningRow =
                isBestPrice &&
                highlightTierQty != null &&
                pb.quantity === highlightTierQty &&
                (highlightCurrency == null || (pb.currency || '').toUpperCase() === highlightCurrency.toUpperCase());
              return (
                <TableRow key={pb.quantity} sx={isWinningRow ? { bgcolor: SUCCESS_GREEN_BG } : undefined}>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: ROW_FONT_SIZE, borderColor: 'divider', py: 0.25, color: isWinningRow ? SUCCESS_GREEN : undefined, fontWeight: isWinningRow ? 700 : undefined }}>{pb.quantity.toLocaleString()}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: ROW_FONT_SIZE, borderColor: 'divider', py: 0.25, color: isWinningRow ? SUCCESS_GREEN : undefined, fontWeight: isWinningRow ? 700 : undefined }}>{formatPrice(pb.unitPrice, pb.currency)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Box>
  );
}

/* ── Commercial tab content ── */
export function CommercialContent({
  part,
  t,
  spotQuantity = 1,
  onSpotQuantityChange,
}: {
  part: Part;
  t: T;
  /** Shared spot-pricing quantity. Drives the best-price crown + reorder. */
  spotQuantity?: number;
  onSpotQuantityChange?: (qty: number) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const hasQuotes = part.supplierQuotes && part.supplierQuotes.length > 0;

  // Own the quantity self-contained so the control works everywhere this tab
  // renders (mobile, parts-list modal), not just where a parent wires the
  // shared state. When `onSpotQuantityChange` is provided we're controlled —
  // the shared `spotQuantity` drives the crown and chat-sync; otherwise we fall
  // back to local state.
  const [localQty, setLocalQty] = useState(1);
  const qty = onSpotQuantityChange ? spotQuantity : localQty;
  const setQty = onSpotQuantityChange ?? setLocalQty;

  // Compute the best spot price at the requested qty. Memoized; runs before the
  // early return so hook order stays stable. Each panel crowns the best price
  // for ITS OWN part at the shared qty.
  const bestPrice = useMemo(
    () => computeBestPrice(part.supplierQuotes, qty),
    [part.supplierQuotes, qty],
  );

  if (!hasQuotes) {
    return (
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem', textAlign: 'center', maxWidth: 280 }}>
          {t('attributes.noCommercialData')}
        </Typography>
      </Box>
    );
  }

  // Derive the winning supplier + tier from the compute result. A 'fallback'
  // winner (qty below every MOQ) is still crowned but labeled "Min qty N".
  const winner =
    bestPrice.kind === 'match' ? bestPrice.top
    : bestPrice.kind === 'fallback' ? bestPrice.minOption
    : null;
  const winnerSupplier = winner?.supplier ?? null;
  const winnerTierQty = winner?.appliedTierQty ?? null;
  const winnerCurrency = winner?.currency ?? null;
  const bestLabel =
    bestPrice.kind === 'match' ? `Best @ qty ${qty.toLocaleString()}`
    : bestPrice.kind === 'fallback' ? `Min qty ${winner?.minOrderQty.toLocaleString()}`
    : undefined;

  const quotes = part.supplierQuotes!;
  // Tag each quote with a STABLE key (from its original index, so the key
  // doesn't shift under the winner-first reorder and cards don't remount on a
  // qty change) and whether it is the crowned winner. Crown by original-array
  // identity — the FIRST quote matching the winning supplier — so a same-named
  // duplicate quote can't steal the crown from the actual cheapest one.
  const winnerOriginalIndex = winnerSupplier ? quotes.findIndex((q) => q.supplier === winnerSupplier) : -1;
  const tagged = quotes.map((q, i) => ({
    q,
    key: `${q.supplier}-${q.supplierPartNumber ?? `i${i}`}`,
    isWinner: i === winnerOriginalIndex,
  }));
  const ordered = winnerSupplier
    ? [...tagged].sort((a, b) => (b.isWinner ? 1 : 0) - (a.isWinner ? 1 : 0))
    : tagged;

  const INITIAL_SHOW = 5;
  const visibleQuotes = showAll ? ordered : ordered.slice(0, INITIAL_SHOW);
  const hiddenCount = ordered.length - INITIAL_SHOW;

  return (
    <Box sx={{ flex: 1, overflowY: 'auto', p: 1.5 }}>
      <QuantityInline value={qty} onChange={(q) => setQty(q)} />
      {visibleQuotes.map(({ q, key, isWinner }) => (
        <SupplierCard
          key={key}
          quote={q}
          t={t}
          mpn={part.mpn}
          manufacturer={part.manufacturer}
          isBestPrice={isWinner}
          highlightTierQty={isWinner ? winnerTierQty : null}
          highlightCurrency={isWinner ? winnerCurrency : null}
          bestLabel={isWinner ? bestLabel : undefined}
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
  );
}
