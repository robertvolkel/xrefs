'use client';
import { useState } from 'react';
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
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import type { TFunction } from 'i18next';
import { Part, SupplierQuote, XrefRecommendation, deriveRecommendationCategories } from '@/lib/types';
import { ROW_FONT_SIZE, ROW_FONT_SIZE_MOBILE } from '@/lib/layoutConstants';
import { logDistributorClick } from '@/lib/supabaseLogger';

type T = TFunction<'translation', undefined>;

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

/* ── Overview tab helpers ── */

const CATEGORY_CHIP_COLORS: Record<'manufacturer_certified' | 'third_party_certified' | 'logic_driven', { bg: string; border: string; fg: string }> = {
  manufacturer_certified: { bg: 'rgba(105, 240, 174, 0.12)', border: '#69F0AE', fg: '#69F0AE' },
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

/** Aggregate cross-reference categories + unique MFR list with China flag */
function summarizeCrossRefs(recs: XrefRecommendation[] | undefined) {
  if (!recs || recs.length === 0) return null;
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
export function OverviewContent({ part, t, allRecommendations, dataSource }: { part: Part; t: T; allRecommendations?: XrefRecommendation[]; dataSource?: DataSource }) {
  const description = part.detailedDescription || part.description;
  const distributorCount = part.supplierQuotes?.length ?? 0;
  const totalStock = part.supplierQuotes?.reduce((sum, q) => sum + (q.quantityAvailable ?? 0), 0) ?? 0;
  const priceRange = computePriceRange(part.supplierQuotes);
  const targetPrice = computeTargetPrice(part.supplierQuotes);
  const xrefSummary = summarizeCrossRefs(allRecommendations);

  const hasQualifications = (part.qualifications?.length ?? 0) > 0;
  const hasCompliance = !!part.rohsStatus || !!part.reachCompliance || !!part.eccnCode || !!part.htsCode || (part.complianceData?.some(c => c.htsCodesByRegion || c.rohsStatus || c.eccnCode) ?? false);

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
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.72rem' }} noWrap>
            {part.manufacturer}
          </Typography>
        </Box>
      </Box>

      {/* Attributes */}
      <SectionHeader label="Attributes" />
      {description && (
        <FieldRow label="Description">
          <Typography
            variant="body2"
            sx={{
              fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE },
              lineHeight: 1.4,
              textAlign: 'right',
              maxWidth: 420,
            }}
          >
            {description}
          </Typography>
        </FieldRow>
      )}
      {part.datasheetUrl && (
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
      )}
      {part.status && (
        <FieldRow label={t('attributes.lifecycleStatus')} source={dataSource ?? 'digikey' as DataSource}>
          <Chip label={part.status} size="small" color={part.status === 'Active' ? 'success' : 'warning'} variant="outlined" sx={{ height: 18, fontSize: '0.6rem' }} />
        </FieldRow>
      )}
      {part.yteol != null && (
        <FieldRow label="Years to EOL" value={`${part.yteol.toFixed(1)} yrs`} source="partsio" />
      )}
      {part.riskRank != null && (
        <FieldRow label={t('attributes.riskRank')} source="partsio">
          <Stack direction="row" alignItems="center" spacing={0.75}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: part.riskRank <= 2 ? '#69F0AE' : part.riskRank <= 5 ? '#FFD54F' : '#FF5252', flexShrink: 0 }} />
            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE } }}>
              {part.riskRank.toFixed(1)}
            </Typography>
          </Stack>
        </FieldRow>
      )}
      {part.countryOfOrigin && <FieldRow label={t('attributes.countryOfOrigin')} value={part.countryOfOrigin} source="partsio" />}
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
              {part.qualifications!.map(q => (
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

      {/* Cross References (source-side only) */}
      {xrefSummary && (
        <>
          <SectionHeader label="Cross References" />
          <Box sx={{ px: 2, py: 0.75 }}>
            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
              {xrefSummary.mfrCertified > 0 && (
                <Chip
                  label={`MFR Certified (${xrefSummary.mfrCertified})`}
                  size="small"
                  variant="outlined"
                  sx={{
                    height: 20,
                    fontSize: '0.62rem',
                    bgcolor: CATEGORY_CHIP_COLORS.manufacturer_certified.bg,
                    borderColor: CATEGORY_CHIP_COLORS.manufacturer_certified.border,
                    color: CATEGORY_CHIP_COLORS.manufacturer_certified.fg,
                  }}
                />
              )}
              {xrefSummary.thirdPartyCertified > 0 && (
                <Chip
                  label={`Accuris Certified (${xrefSummary.thirdPartyCertified})`}
                  size="small"
                  variant="outlined"
                  sx={{
                    height: 20,
                    fontSize: '0.62rem',
                    bgcolor: CATEGORY_CHIP_COLORS.third_party_certified.bg,
                    borderColor: CATEGORY_CHIP_COLORS.third_party_certified.border,
                    color: CATEGORY_CHIP_COLORS.third_party_certified.fg,
                  }}
                />
              )}
              {xrefSummary.logicDriven > 0 && (
                <Chip
                  label={`Logic Driven (${xrefSummary.logicDriven})`}
                  size="small"
                  variant="outlined"
                  sx={{
                    height: 20,
                    fontSize: '0.62rem',
                    bgcolor: CATEGORY_CHIP_COLORS.logic_driven.bg,
                    borderColor: CATEGORY_CHIP_COLORS.logic_driven.border,
                    color: CATEGORY_CHIP_COLORS.logic_driven.fg,
                  }}
                />
              )}
            </Stack>
          </Box>
          {xrefSummary.mfrs.length > 0 && (
            <Box sx={{ px: 2, pb: 1 }}>
              <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.6rem', display: 'block', mb: 0.5 }}>
                Manufacturers with crosses
              </Typography>
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                {xrefSummary.mfrs.map(m => (
                  <Chip
                    key={m.name}
                    size="small"
                    variant="outlined"
                    sx={{ height: 20, fontSize: '0.62rem' }}
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
                ))}
              </Stack>
            </Box>
          )}
        </>
      )}

      {/* Environmental & Export */}
      {hasCompliance && (
        <>
          <SectionHeader label="Environmental & Export" />
          {part.rohsStatus && <FieldRow label={t('attributes.rohsStatus')} value={part.rohsStatus} source="mouser" />}
          {part.reachCompliance && <FieldRow label={t('attributes.reachCompliance')} value={part.reachCompliance} source="partsio" />}
          {part.eccnCode && <FieldRow label={t('attributes.eccnCode')} value={part.eccnCode} source="partsio" />}
          {part.htsCode && <FieldRow label={t('attributes.htsCode')} value={part.htsCode} source="partsio" />}
          {part.complianceData?.filter(c => c.htsCodesByRegion).map(c => (
            Object.entries(c.htsCodesByRegion!).map(([region, code]) => (
              <FieldRow key={`${c.source}-${region}`} label={`HTS (${region.toUpperCase()})`} value={code} source={c.source as DataSource} />
            ))
          ))}
        </>
      )}
    </Box>
  );
}

/* ── Supplier display name map ── */
const SUPPLIER_DISPLAY: Record<string, string> = {
  digikey: 'Digikey', mouser: 'Mouser', arrow: 'Arrow', lcsc: 'LCSC',
  element14: 'element14', farnell: 'Farnell', newark: 'Newark', rs: 'RS Components',
  tme: 'TME', avnet: 'Avnet', future: 'Future Electronics', rochester: 'Rochester',
  rutronik: 'Rutronik', verical: 'Verical', chip1stop: 'Chip One Stop',
};

/** Format price with currency symbol */
export function formatPrice(price: number, currency?: string): string {
  const cur = currency ?? 'USD';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(price);
  } catch {
    return `${cur} ${price.toFixed(4)}`;
  }
}

/* ── Supplier quote card ── */
function SupplierCard({ quote, t, mpn, manufacturer }: { quote: SupplierQuote; t: T; mpn?: string; manufacturer?: string }) {
  const supplierLabel = SUPPLIER_DISPLAY[quote.supplier] ?? quote.supplier.charAt(0).toUpperCase() + quote.supplier.slice(1);
  const currency = quote.priceBreaks[0]?.currency;

  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5, mb: 1 }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.75 }}>
        <Stack direction="row" alignItems="center" spacing={0.75}>
          <Typography variant="subtitle2" sx={{ fontSize: '0.75rem', fontWeight: 600 }}>
            {supplierLabel}
          </Typography>
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
            {quote.priceBreaks.map((pb) => (
              <TableRow key={pb.quantity}>
                <TableCell sx={{ fontFamily: 'monospace', fontSize: ROW_FONT_SIZE, borderColor: 'divider', py: 0.25 }}>{pb.quantity.toLocaleString()}</TableCell>
                <TableCell sx={{ fontFamily: 'monospace', fontSize: ROW_FONT_SIZE, borderColor: 'divider', py: 0.25 }}>{formatPrice(pb.unitPrice, pb.currency)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Box>
  );
}

/* ── Commercial tab content ── */
export function CommercialContent({ part, t }: { part: Part; t: T }) {
  const [showAll, setShowAll] = useState(false);
  const hasQuotes = part.supplierQuotes && part.supplierQuotes.length > 0;

  if (!hasQuotes) {
    return (
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem', textAlign: 'center', maxWidth: 280 }}>
          {t('attributes.noCommercialData')}
        </Typography>
      </Box>
    );
  }

  const quotes = part.supplierQuotes!;
  const INITIAL_SHOW = 5;
  const visibleQuotes = showAll ? quotes : quotes.slice(0, INITIAL_SHOW);
  const hiddenCount = quotes.length - INITIAL_SHOW;

  return (
    <Box sx={{ flex: 1, overflowY: 'auto', p: 1.5 }}>
      {visibleQuotes.map((q, i) => (
        <SupplierCard key={`${q.supplier}-${q.supplierPartNumber ?? i}`} quote={q} t={t} mpn={part.mpn} manufacturer={part.manufacturer} />
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
