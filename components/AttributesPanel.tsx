'use client';
import { useState, useMemo, Fragment } from 'react';
import {
  Box,
  Link,
  Tooltip,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Skeleton,
  Stack,
  Slider,
  TextField,
  Collapse,
  Checkbox,
  FormGroup,
  FormControlLabel,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import { useTranslation } from 'react-i18next';
import { PartAttributes, RecommendationCategory, XrefRecommendation, AcceptanceCriteria, AcceptanceCriterion, MatchingRule, ParametricAttribute } from '@/lib/types';
import { getLogicTableForSubcategory } from '@/lib/logicTables';
import { normalize as normalizeMatchValue, parseBoolean as parseFlagValue } from '@/lib/services/matchingEngine';
import { ATTRIBUTES_HEADER_HEIGHT, ATTRIBUTES_HEADER_HEIGHT_MOBILE, ROW_FONT_SIZE, ROW_FONT_SIZE_MOBILE, ROW_PY, ROW_PY_MOBILE, ROW_HEIGHT, ROW_HEIGHT_MOBILE } from '@/lib/layoutConstants';
import { useScrollIndicators } from '@/hooks/useScrollIndicators';
import type { AttributesTab } from './DesktopLayout';
import { pillGroupSx, OverviewContent, CommercialContent } from './AttributesTabContent';
import DomainChip, { inferContextActive } from './DomainChip';
import { isDomainCoveredQualification } from '@/lib/services/qualificationDomain';

interface AttributesPanelProps {
  attributes: PartAttributes | null;
  loading?: boolean;
  title: string;
  activeTab: AttributesTab;
  onTabChange: (tab: AttributesTab) => void;
  allRecommendations?: XrefRecommendation[];
  onManufacturerClick?: (manufacturer: string) => void;
  /** Cross-reference filter shared with the Replacements panel (single-part view).
   *  Drives active-chip highlight in the Overview "Cross References" section. */
  xrefCategory?: RecommendationCategory | 'all';
  xrefMfr?: string;
  onSelectXrefCategory?: (cat: RecommendationCategory | 'all') => void;
  onSelectXrefMfr?: (mfr: string) => void;
  /** Per-attribute acceptance criteria the user has set (attributeId → criterion).
   *  Presence of `onAcceptanceChange` enables the inline acceptance control on
   *  eligible Specs rows — only wired for the source panel. */
  acceptanceCriteria?: AcceptanceCriteria;
  onAcceptanceChange?: (attributeId: string, criterion: AcceptanceCriterion | null) => void;
}

/** Maximum ± band offered by the range slider. */
const TOLERANCE_MAX = 25;
const TOLERANCE_MARKS = [1, 5, 10, 20].map((v) => ({ value: v, label: `${v}%` }));

/** Identity attributeIds representing a *continuous* physical quantity, where a
 *  ±% acceptance band (range criterion) is engineering-meaningful. Explicit
 *  allowlist (MVP scope): many `identity` rules are categorical (package_case,
 *  mounting_style, polarity, …) or discrete counts (resolution_bits, gate_count)
 *  for which a band is nonsense — and nothing in the rule/attribute data reliably
 *  distinguishes them (`numericValue`/`unit` are polluted by the parser, e.g.
 *  "0805 (2012 Metric)" → numericValue 2012, unit "Metric"). Gating on this set
 *  is the only robust way to keep the band off those rows. */
const RANGE_ELIGIBLE_ATTRIBUTE_IDS = new Set<string>([
  // Passives — continuous values
  'resistance', 'resistance_r25',
  'capacitance', 'load_capacitance_pf',
  'inductance', 'impedance_100mhz',
  'varistor_voltage',
  // Frequency control
  'fsw', 'nominal_frequency_hz', 'output_frequency_hz',
  // Discrete-semiconductor continuous values
  'vz', 'vrwm', 'vbr', 'izt', 'trip_current', 'hold_current',
  // ICs — continuous values
  'output_voltage', 'input_logic_threshold',
]);

/** AttributeIds whose acceptable values are a discrete *set* the user picks from
 *  a checklist (set criterion) — categorical or flag rules where a ±% band is
 *  meaningless. MVP scope: AEC qualification, which is non-keyword, so accepting
 *  the non-qualified value surfaces parts already in the candidate pool without a
 *  fetch change. Extend as the pattern is validated (composition, dielectric, …). */
const SET_ELIGIBLE_ATTRIBUTE_IDS = new Set<string>([
  'aec_q200', 'aec_q101', 'aec_q100',
]);

/** Which acceptance control (if any) a Specs row supports: a continuous ±% band
 *  ('range'), a discrete acceptable-values checklist ('set'), or none. */
function getAcceptanceKind(param: ParametricAttribute, rule: MatchingRule | undefined): 'range' | 'set' | null {
  if (!rule) return null;
  if (rule.logicType === 'identity' && typeof param.numericValue === 'number' && RANGE_ELIGIBLE_ATTRIBUTE_IDS.has(rule.attributeId)) return 'range';
  if (SET_ELIGIBLE_ATTRIBUTE_IDS.has(rule.attributeId)) {
    // A `set` criterion only LOOSENS matching — it flips a failing candidate to pass. For a
    // boolean flag rule (AEC-Q200/Q101/Q100), candidates only fail when the SOURCE requires
    // the flag (value 'Yes'). If the source doesn't require it ('No'), the flag rule already
    // passes every candidate, so accepting values would do nothing — hide the no-op control.
    if (rule.logicType === 'identity_flag' && !parseFlagValue(param.value)) return null;
    return 'set';
  }
  return null;
}

/** Range editor — continuous ±% band. Slider + numeric input stay in sync via
 *  local draft state; commits (slider release / input blur / Enter) propagate. */
function RangeEditor({
  attributeName,
  value,
  onCommit,
}: {
  attributeName: string;
  value: number;
  onCommit: (criterion: AcceptanceCriterion | null) => void;
}) {
  // Local draft seeds from the committed value on mount. The editor remounts per
  // expanded attribute (Fragment key in the parent), so the draft seeds fresh.
  const [draft, setDraft] = useState<number>(value);
  const clamp = (n: number) => Math.max(0, Math.min(TOLERANCE_MAX, n));
  const commit = (n: number) => onCommit(n > 0 ? { kind: 'range', percent: n } : null);

  // Caption + numeric input/Clear on the top line, the slider on its own
  // full-width line below — so the slider's mark labels (1/5/10/20%) have
  // vertical room and aren't clipped by the next table row.
  return (
    <Box sx={{ px: 2, pt: 1.25, pb: 2.5, bgcolor: 'action.hover' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ minWidth: 0 }}>
          Accept candidates within ±{draft}% of the source {attributeName.toLowerCase()} when matching
        </Typography>
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ flexShrink: 0 }}>
          <TextField
            size="small"
            type="number"
            value={draft}
            onChange={(e) => setDraft(clamp(parseFloat(e.target.value) || 0))}
            onBlur={() => commit(draft)}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(draft); }}
            slotProps={{ htmlInput: { min: 0, max: TOLERANCE_MAX, step: 0.5, style: { width: 44 } }, input: { endAdornment: <Box component="span" sx={{ fontSize: '0.7rem', color: 'text.secondary', ml: 0.25 }}>%</Box> } }}
          />
          <Link
            component="button"
            variant="caption"
            onClick={() => onCommit(null)}
            sx={{ color: 'text.disabled', textDecoration: 'none', whiteSpace: 'nowrap', '&:hover': { color: 'text.secondary' } }}
          >
            Clear
          </Link>
        </Stack>
      </Stack>
      <Slider
        size="small"
        value={draft}
        min={0}
        max={TOLERANCE_MAX}
        step={0.5}
        marks={TOLERANCE_MARKS}
        valueLabelDisplay="auto"
        valueLabelFormat={(v) => `±${v}%`}
        onChange={(_, v) => setDraft(clamp(v as number))}
        onChangeCommitted={(_, v) => commit(clamp(v as number))}
        sx={{ display: 'block', mx: 1, width: 'auto' }}
      />
    </Box>
  );
}

/** Set editor — discrete acceptable-values checklist. The source value is always
 *  accepted (shown locked); the user ticks which other candidate values to also
 *  accept. `options` are the distinct values seen among current candidates. */
function SetEditor({
  attributeName,
  sourceValue,
  options,
  accepted,
  onCommit,
}: {
  attributeName: string;
  sourceValue: string;
  options: string[];
  accepted: string[];
  onCommit: (criterion: AcceptanceCriterion | null) => void;
}) {
  // Controlled: `checked` derives from the committed `accepted` prop each render,
  // so the checklist can never desync from state — every toggle commits and the
  // parent re-renders with the new accepted set (no local snapshot, no stale key).
  // Values are sorted on commit so the stored set + cache key are order-stable.
  const checked = new Set(accepted);
  const toggle = (v: string) => {
    const next = new Set(checked);
    if (next.has(v)) next.delete(v); else next.add(v);
    const arr = [...next].sort();
    onCommit(arr.length > 0 ? { kind: 'set', values: arr } : null);
  };

  return (
    <Box sx={{ px: 2, pt: 1.25, pb: 1.5, bgcolor: 'action.hover' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1.5} sx={{ mb: 0.25 }}>
        <Typography variant="caption" color="text.secondary" sx={{ minWidth: 0 }}>
          Acceptable values for {attributeName.toLowerCase()} when matching
        </Typography>
        <Link
          component="button"
          variant="caption"
          onClick={() => onCommit(null)}
          sx={{ color: 'text.disabled', textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0, '&:hover': { color: 'text.secondary' } }}
        >
          Clear
        </Link>
      </Stack>
      <FormGroup sx={{ pl: 0.5 }}>
        <FormControlLabel
          control={<Checkbox size="small" checked disabled sx={{ py: 0.25 }} />}
          label={<Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{sourceValue} <Box component="span" sx={{ color: 'text.disabled', fontFamily: 'sans-serif' }}>(source)</Box></Typography>}
        />
        {options.map((v) => (
          <FormControlLabel
            key={v}
            control={<Checkbox size="small" checked={checked.has(v)} onChange={() => toggle(v)} sx={{ py: 0.25 }} />}
            label={<Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{v}</Typography>}
          />
        ))}
      </FormGroup>
      {options.length === 0 && (
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', pl: 0.5 }}>
          No other values seen among current candidates.
        </Typography>
      )}
    </Box>
  );
}

function SkeletonSectionHeader() {
  return (
    <Box sx={{ bgcolor: 'background.paper', borderTop: 1, borderBottom: 1, borderColor: 'divider', px: 2, py: 0.75 }}>
      <Skeleton width={90} height={14} />
    </Box>
  );
}

function SkeletonFieldRow({ labelWidth, valueWidth }: { labelWidth: number; valueWidth: number }) {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ py: 0.75, px: 2, minHeight: 32 }}>
      <Skeleton width={labelWidth} height={14} />
      <Skeleton width={valueWidth} height={14} />
    </Stack>
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

export function CommercialSkeleton() {
  return (
    <Box sx={{ flex: 1, overflowY: 'auto', px: 2, py: 1.5 }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <Box key={i} sx={{ mb: 2, p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Skeleton width={120} height={18} />
            <Skeleton width={60} height={18} />
          </Stack>
          <Skeleton width="40%" height={14} sx={{ mb: 0.5 }} />
          <Skeleton width="60%" height={14} sx={{ mb: 0.5 }} />
          <Skeleton width="50%" height={14} />
        </Box>
      ))}
    </Box>
  );
}

export default function AttributesPanel({ attributes, loading, title, activeTab, onTabChange, allRecommendations, onManufacturerClick, xrefCategory, xrefMfr, onSelectXrefCategory, onSelectXrefMfr, acceptanceCriteria, onAcceptanceChange }: AttributesPanelProps) {
  const { t } = useTranslation();
  const { ref: scrollRef, canScrollUp, canScrollDown } = useScrollIndicators<HTMLDivElement>();
  const [showExtras, setShowExtras] = useState(false);
  // Which Specs row currently has its acceptance editor expanded (attributeId | null).
  const [expandedAcceptance, setExpandedAcceptance] = useState<string | null>(null);

  // Resolve the family's matching rules so the Specs table knows which rows are
  // acceptance-eligible (continuous range or discrete set). Logic tables are
  // bundled client-side, so this needs no fetch. Only when a handler is wired.
  const ruleByAttribute = useMemo(() => {
    const map = new Map<string, MatchingRule>();
    if (!attributes || !onAcceptanceChange) return map;
    const table = getLogicTableForSubcategory(attributes.part.subcategory, attributes);
    table?.rules.forEach((r) => map.set(r.attributeId, r));
    return map;
  }, [attributes, onAcceptanceChange]);

  // Distinct candidate values per attribute, from the current recommendations'
  // matchDetails — feeds the 'set' checklist's options. Excludes 'N/A'.
  const candidateValuesByAttribute = useMemo(() => {
    const map = new Map<string, Set<string>>();
    if (!onAcceptanceChange) return map;
    for (const rec of allRecommendations ?? []) {
      for (const d of rec.matchDetails) {
        if (!d.replacementValue || d.replacementValue === 'N/A') continue;
        if (!map.has(d.parameterId)) map.set(d.parameterId, new Set());
        map.get(d.parameterId)!.add(d.replacementValue);
      }
    }
    return map;
  }, [allRecommendations, onAcceptanceChange]);

  // Split Atlas parameters into recognized (in schema) and extras (unrecognized)
  const { recognized, extras } = useMemo(() => {
    if (!attributes?.parameters) return { recognized: [], extras: [] };
    const sorted = [...attributes.parameters].sort((a, b) => a.sortOrder - b.sortOrder);
    // Only split for Atlas-sourced data that has the recognized flag
    const hasRecognizedFlag = sorted.some((p) => p.recognized !== undefined);
    if (!hasRecognizedFlag) return { recognized: sorted, extras: [] };
    return {
      recognized: sorted.filter((p) => p.recognized !== false),
      extras: sorted.filter((p) => p.recognized === false),
    };
  }, [attributes?.parameters]);
  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header — taller to include pill bar */}
      <Box
        sx={{
          height: { xs: ATTRIBUTES_HEADER_HEIGHT_MOBILE, md: ATTRIBUTES_HEADER_HEIGHT },
          minHeight: { xs: ATTRIBUTES_HEADER_HEIGHT_MOBILE, md: ATTRIBUTES_HEADER_HEIGHT },
          px: 2,
          py: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {loading ? (
          <>
            <Skeleton width={80} height={16} sx={{ mb: 0.5 }} />
            <Skeleton width={200} height={22} />
            <Skeleton width={160} height={16} sx={{ mt: 0.5 }} />
            <Skeleton width={180} height={28} sx={{ mt: 1, borderRadius: '14px' }} />
          </>
        ) : attributes ? (
          <>
            <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {title}
            </Typography>
            <Stack direction="row" alignItems="center" spacing={0.75}>
              <Typography variant="h6" sx={{ fontFamily: 'monospace', fontSize: '0.95rem', lineHeight: 1.3 }} noWrap>
                {attributes.part.mpn}
              </Typography>
              <Chip label={attributes.part.status} size="small" color={attributes.part.status === 'Active' ? 'success' : 'warning'} variant="outlined" sx={{ height: 18, fontSize: '0.6rem' }} />
              <DomainChip
                classification={attributes.part.qualificationDomain}
                contextActive={inferContextActive(allRecommendations ?? [])}
              />
              {attributes.part.qualifications?.filter(q => !isDomainCoveredQualification(q)).map(q => (
                <Chip key={q} label={q} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.6rem', color: '#4FC3F7', borderColor: '#4FC3F7' }} />
              ))}
            </Stack>
            <Typography variant="body2" color="text.primary" sx={{ fontSize: '0.78rem', mt: 0.5 }} noWrap component="div">
              {onManufacturerClick && attributes.part.manufacturer && attributes.part.mfrOrigin === 'atlas' ? (
                <Box
                  component="span"
                  onClick={() => onManufacturerClick(attributes.part.manufacturer)}
                  sx={{
                    cursor: 'pointer',
                    '&:hover': { color: 'primary.main', textDecoration: 'underline' },
                    transition: 'color 0.15s ease',
                  }}
                >
                  {attributes.part.manufacturer}
                </Box>
              ) : (
                attributes.part.manufacturer
              )}
              {attributes.part.mfrOrigin === 'atlas' && (
                <Tooltip title="Chinese manufacturer" arrow>
                  <Box component="span" sx={{ ml: 0.5, fontSize: 11, verticalAlign: 'middle', lineHeight: 1 }}>&#127464;&#127475;</Box>
                </Tooltip>
              )}
            </Typography>
            {/* Pill segment control */}
            <ToggleButtonGroup
              value={activeTab}
              exclusive
              onChange={(_, v) => { if (v !== null) onTabChange(v as AttributesTab); }}
              size="small"
              sx={pillGroupSx}
            >
              <ToggleButton value="overview">{t('attributes.tabOverview')}</ToggleButton>
              <ToggleButton value="specs">{t('attributes.tabSpecs')}</ToggleButton>
              <ToggleButton value="commercial">{t('attributes.tabCommercial')}</ToggleButton>
            </ToggleButtonGroup>
          </>
        ) : null}
      </Box>

      {/* Tab content */}
      {activeTab === 'specs' && (
        <Box sx={{ flex: 1, position: 'relative', minHeight: 0 }}>
          {canScrollUp && (
            <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 24, background: 'linear-gradient(to bottom, rgba(0,0,0,0.12), transparent)', pointerEvents: 'none', zIndex: 1 }} />
          )}
          {canScrollDown && (
            <Box sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 24, background: 'linear-gradient(to top, rgba(0,0,0,0.12), transparent)', pointerEvents: 'none', zIndex: 1 }} />
          )}
          <TableContainer ref={scrollRef} sx={{ height: '100%', overflowY: 'auto' }}>
            <Table size="small" stickyHeader sx={{ tableLayout: 'fixed' }}>
              <TableHead>
                <TableRow sx={{ height: { xs: ROW_HEIGHT_MOBILE, md: ROW_HEIGHT } }}>
                  <TableCell sx={{ bgcolor: 'background.paper', fontSize: '0.7rem', fontWeight: 600, borderColor: 'divider', color: 'text.secondary', py: { xs: ROW_PY_MOBILE, md: ROW_PY }, width: '50%' }}>
                    {t('attributes.parameterHeader')}
                  </TableCell>
                  <TableCell sx={{ bgcolor: 'background.paper', fontSize: '0.7rem', fontWeight: 600, borderColor: 'divider', color: 'text.secondary', py: { xs: ROW_PY_MOBILE, md: ROW_PY }, width: '50%' }}>
                    {t('attributes.valueHeader')}
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading
                  ? Array.from({ length: 12 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell sx={{ borderColor: 'divider', py: { xs: ROW_PY_MOBILE, md: ROW_PY } }}>
                          <Skeleton width={120} height={16} />
                        </TableCell>
                        <TableCell sx={{ borderColor: 'divider', py: { xs: ROW_PY_MOBILE, md: ROW_PY } }}>
                          <Skeleton width={80} height={16} />
                        </TableCell>
                      </TableRow>
                    ))
                  : <>
                      {recognized.map((param) => {
                        const rule = ruleByAttribute.get(param.parameterId);
                        const kind = onAcceptanceChange ? getAcceptanceKind(param, rule) : null;
                        const eligible = kind !== null;
                        const criterion = acceptanceCriteria?.[param.parameterId];
                        const active = criterion != null;
                        const chipLabel = criterion?.kind === 'range'
                          ? `±${criterion.percent}%`
                          : criterion?.kind === 'set'
                            ? `+${criterion.values.length}`
                            : null;
                        const isOpen = expandedAcceptance === param.parameterId;
                        // 'set' checklist options: candidate values deduped by the
                        // engine's normalize() (so case/whitespace variants collapse to
                        // one box that matches how scoring compares) and excluding the
                        // source value (always accepted). First raw form shown.
                        const setOptions: string[] = [];
                        if (kind === 'set') {
                          const srcNorm = normalizeMatchValue(param.value);
                          const seen = new Set<string>([srcNorm]);
                          for (const v of candidateValuesByAttribute.get(param.parameterId) ?? []) {
                            const n = normalizeMatchValue(v);
                            if (seen.has(n)) continue;
                            seen.add(n);
                            setOptions.push(v);
                          }
                        }
                        return (
                        <Fragment key={param.parameterId}>
                        <TableRow
                          hover
                          sx={{
                            height: { xs: ROW_HEIGHT_MOBILE, md: ROW_HEIGHT },
                            ...(isOpen && { bgcolor: 'action.hover' }),
                            // Reveal the acceptance trigger on row hover (it stays
                            // visible when a criterion is set or the editor is open).
                            '&:hover .acc-trigger': { opacity: 1 },
                          }}
                        >
                          <TableCell
                            sx={{
                              color: 'text.secondary',
                              fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE },
                              borderColor: 'divider',
                              ...(isOpen && { borderBottom: 'none' }),
                              width: '50%',
                              py: { xs: ROW_PY_MOBILE, md: ROW_PY },
                            }}
                          >
                            {param.parameterName}
                          </TableCell>
                          <TableCell
                            sx={{
                              fontFamily: 'monospace',
                              fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE },
                              borderColor: 'divider',
                              ...(isOpen && { borderBottom: 'none' }),
                              py: { xs: ROW_PY_MOBILE, md: ROW_PY },
                            }}
                          >
                            <Stack direction="row" alignItems="center" spacing={0.75}>
                              <Box component="span" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{param.value}</Box>
                              {chipLabel != null && (
                                <Tooltip title={criterion?.kind === 'set' ? `${criterion.values.length} additional value(s) accepted` : 'Tolerance band applied'} arrow>
                                  <Chip
                                    label={chipLabel}
                                    size="small"
                                    color="primary"
                                    variant="outlined"
                                    sx={{ height: 16, fontSize: '0.6rem', '& .MuiChip-label': { px: 0.6 } }}
                                  />
                                </Tooltip>
                              )}
                              {/* Acceptance trigger — hover-revealed, sits to the LEFT of the
                                  D/P/A source badge. Click opens the inline editor. Stays
                                  visible (opacity 1) when a criterion is set or the editor is open. */}
                              {eligible && (
                                <Tooltip title={kind === 'set' ? 'Choose acceptable values for matching' : 'Set an acceptable tolerance range for matching'} arrow>
                                  <Box
                                    component="span"
                                    className="acc-trigger"
                                    role="button"
                                    tabIndex={0}
                                    aria-label={`Set acceptance criteria for ${param.parameterName}`}
                                    onClick={(e) => { e.stopPropagation(); setExpandedAcceptance(isOpen ? null : param.parameterId); }}
                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedAcceptance(isOpen ? null : param.parameterId); } }}
                                    sx={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      cursor: 'pointer',
                                      flexShrink: 0,
                                      opacity: isOpen || active ? 1 : 0,
                                      transition: 'opacity 0.12s ease',
                                      color: isOpen || active ? 'primary.main' : 'text.disabled',
                                      '&:hover': { color: 'primary.main' },
                                    }}
                                  >
                                    <TuneOutlinedIcon sx={{ fontSize: 15 }} />
                                  </Box>
                                </Tooltip>
                              )}
                              {param.source && (
                                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: '50%', border: '1px solid', borderColor: 'text.disabled', fontSize: '0.5rem', color: 'text.disabled', fontWeight: 600, fontFamily: 'sans-serif', flexShrink: 0 }}>
                                  {param.source === 'digikey' ? 'D' : param.source === 'partsio' ? 'P' : 'A'}
                                </Box>
                              )}
                            </Stack>
                          </TableCell>
                        </TableRow>
                        {/* Acceptance editor — expands directly beneath the selected
                            attribute. Range slider for continuous attrs, checklist for
                            discrete sets. Remounts per attribute via the Fragment key. */}
                        {isOpen && eligible && onAcceptanceChange && (
                          <TableRow>
                            <TableCell colSpan={2} sx={{ p: 0, borderColor: 'divider' }}>
                              <Collapse in timeout="auto" unmountOnExit>
                                {kind === 'set' ? (
                                  <SetEditor
                                    attributeName={param.parameterName}
                                    sourceValue={param.value}
                                    options={setOptions}
                                    accepted={criterion?.kind === 'set' ? criterion.values : []}
                                    onCommit={(c) => onAcceptanceChange(param.parameterId, c)}
                                  />
                                ) : (
                                  <RangeEditor
                                    attributeName={param.parameterName}
                                    value={criterion?.kind === 'range' ? criterion.percent : 0}
                                    onCommit={(c) => onAcceptanceChange(param.parameterId, c)}
                                  />
                                )}
                              </Collapse>
                            </TableCell>
                          </TableRow>
                        )}
                        </Fragment>
                        );
                      })}
                      {/* Extra unrecognized attributes toggle */}
                      {extras.length > 0 && (
                        <TableRow>
                          <TableCell colSpan={2} sx={{ borderColor: 'divider', py: 0.5, textAlign: 'right' }}>
                            <Link
                              component="button"
                              variant="caption"
                              onClick={() => setShowExtras(!showExtras)}
                              sx={{ color: 'text.disabled', fontSize: '0.7rem', textDecoration: 'none', '&:hover': { color: 'text.secondary' } }}
                            >
                              {showExtras ? 'Less' : `More (${extras.length})`}
                            </Link>
                          </TableCell>
                        </TableRow>
                      )}
                      {showExtras && extras.map((param) => (
                        <TableRow key={param.parameterId} sx={{ height: { xs: ROW_HEIGHT_MOBILE, md: ROW_HEIGHT } }}>
                          <TableCell
                            sx={{
                              color: 'text.disabled',
                              fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE },
                              borderColor: 'divider',
                              width: '50%',
                              py: { xs: ROW_PY_MOBILE, md: ROW_PY },
                            }}
                          >
                            {param.parameterName}
                          </TableCell>
                          <TableCell
                            sx={{
                              fontFamily: 'monospace',
                              fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE },
                              borderColor: 'divider',
                              color: 'text.disabled',
                              py: { xs: ROW_PY_MOBILE, md: ROW_PY },
                            }}
                          >
                            {param.value}
                          </TableCell>
                        </TableRow>
                      ))}
                    </>}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {activeTab === 'overview' && (
        loading ? (
          <OverviewSkeleton />
        ) : attributes ? (
          <OverviewContent
            part={attributes.part}
            t={t}
            allRecommendations={allRecommendations}
            dataSource={attributes.dataSource as 'digikey' | 'atlas' | 'partsio'}
            xrefCategory={xrefCategory}
            xrefMfr={xrefMfr}
            onSelectXrefCategory={onSelectXrefCategory}
            onSelectXrefMfr={onSelectXrefMfr}
          />
        ) : null
      )}

      {activeTab === 'commercial' && (
        loading ? (
          <CommercialSkeleton />
        ) : attributes ? (
          <CommercialContent part={attributes.part} t={t} />
        ) : null
      )}
    </Box>
  );
}
