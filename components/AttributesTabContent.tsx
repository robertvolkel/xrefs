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
  Divider,
  Link,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import type { TFunction } from 'i18next';
import { Part, SupplierQuote } from '@/lib/types';
import { ROW_FONT_SIZE, ROW_FONT_SIZE_MOBILE } from '@/lib/layoutConstants';

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

/* ── Risk tab content ── */
export function RiskContent({ part, t, dataSource }: { part: Part; t: T; dataSource?: DataSource }) {
  const hasLifecycle = part.status || part.yteol != null || part.riskRank != null;
  const hasCompliance = !!part.reachCompliance || !!part.eccnCode || !!part.htsCode || !!part.countryOfOrigin;
  const hasSuggestedReplacement = part.lifecycleInfo?.some(l => l.suggestedReplacement);
  const hasSupplyChain = part.factoryLeadTimeWeeks != null;
  const hasAnything = hasLifecycle || hasCompliance || hasSupplyChain || hasSuggestedReplacement;

  if (!hasAnything) {
    return (
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem', textAlign: 'center', maxWidth: 280 }}>
          {t('attributes.noRiskData')}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ flex: 1, overflowY: 'auto', py: 1 }}>
      {/* Lifecycle */}
      {hasLifecycle && (
        <>
          <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', px: 2, pt: 0.5, pb: 0.5 }}>
            Lifecycle
          </Typography>
          {part.status && (
            <FieldRow label={t('attributes.lifecycleStatus')} source={dataSource ?? 'digikey' as DataSource}>
              <Chip label={part.status} size="small" color={part.status === 'Active' ? 'success' : 'warning'} variant="outlined" sx={{ height: 18, fontSize: '0.6rem' }} />
            </FieldRow>
          )}
          {part.yteol != null && (
            <FieldRow label={t('attributes.yteol')} value={`${part.yteol.toFixed(1)} yrs`} source="partsio" />
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
          {part.lifecycleInfo?.filter(l => l.suggestedReplacement).map(l => (
            <FieldRow key={l.source} label={t('attributes.suggestedReplacement')} value={l.suggestedReplacement!} source={l.source as DataSource} />
          ))}
        </>
      )}

      {hasLifecycle && hasCompliance && <Divider sx={{ my: 1 }} />}

      {/* Compliance */}
      {hasCompliance && (
        <>
          <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', px: 2, pt: 0.5, pb: 0.5 }}>
            Compliance & Trade
          </Typography>
          {part.reachCompliance && <FieldRow label={t('attributes.reachCompliance')} value={part.reachCompliance} source="partsio" />}
          {part.eccnCode && <FieldRow label={t('attributes.eccnCode')} value={part.eccnCode} source="partsio" />}
          {part.htsCode && <FieldRow label={t('attributes.htsCode')} value={part.htsCode} source="partsio" />}
          {part.countryOfOrigin && <FieldRow label={t('attributes.countryOfOrigin')} value={part.countryOfOrigin} source="partsio" />}
          {/* Regional HTS codes from complianceData */}
          {part.complianceData?.filter(c => c.htsCodesByRegion).map(c => (
            Object.entries(c.htsCodesByRegion!).map(([region, code]) => (
              <FieldRow key={`${c.source}-${region}`} label={`HTS (${region.toUpperCase()})`} value={code} source={c.source as DataSource} />
            ))
          ))}
        </>
      )}

      {(hasLifecycle || hasCompliance) && hasSupplyChain && <Divider sx={{ my: 1 }} />}

      {/* Supply Chain */}
      {hasSupplyChain && (
        <>
          <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', px: 2, pt: 0.5, pb: 0.5 }}>
            Supply Chain
          </Typography>
          <FieldRow label={t('attributes.factoryLeadTime')} value={`${part.factoryLeadTimeWeeks} wks`} source="partsio" />
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
function formatPrice(price: number, currency?: string): string {
  const cur = currency ?? 'USD';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(price);
  } catch {
    return `${cur} ${price.toFixed(4)}`;
  }
}

/* ── Supplier quote card ── */
function SupplierCard({ quote, t }: { quote: SupplierQuote; t: T }) {
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
          <Link href={quote.productUrl} target="_blank" rel="noopener" sx={{ display: 'flex', alignItems: 'center', fontSize: '0.68rem' }}>
            <OpenInNewIcon sx={{ fontSize: '0.85rem' }} />
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
        <SupplierCard key={`${q.supplier}-${q.supplierPartNumber ?? i}`} quote={q} t={t} />
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
