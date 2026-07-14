'use client';

import { useMemo, useState } from 'react';
import {
  Box,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Tooltip,
  Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { LogicTable } from '@/lib/types';
import {
  ParamMapEntry,
  ParamMapping,
  computeFamilyParamCoverage,
  getDigikeyCategoriesForFamily,
  getDigikeyAttributeIdsForFamily,
  getFullParamMap,
  reverseParamLookupForFamily,
} from '@/lib/services/digikeyParamMap';
import {
  reversePartsioParamLookup,
  computePartsioCoverage,
  getAllPartsioFields,
} from '@/lib/services/partsioParamMap';
import { getSelectionState, type SelectionStateInfo } from '@/lib/services/selectionQuestions';

/** Data for L2 display-only rendering */
export interface L2ParamMapData {
  name: string;
  digikeyPatterns: string[];
  paramMap: Record<string, ParamMapEntry>;
}

interface ParamMappingsPanelProps {
  table: LogicTable | null;
  /** L2 param map data — when provided (and table is null), renders simplified L2 view */
  l2ParamMap?: L2ParamMapData | null;
}

/** Column widths for the attribute-centric table */
const COL = { num: 36, attrId: 160, attrName: 180, asked: 100, weight: 50, digikey: 220, partsio: 220 };
/** Column widths for the L2 simplified table */
const COL_L2 = { num: 36, attrId: 160, attrName: 200, digikey: 240 };

/**
 * Does the agent ask the user about this spec when they are choosing a part by description?
 *
 * READ-ONLY. Every one of these decisions lives in docs/min_attr_sets.md; hand that file to
 * Claude to revise it, then run `npm run selection:audit`. There is deliberately no way to
 * edit it here — a document and a UI that can both write the same truth is exactly the drift
 * that let an LDO search never ask what voltage goes into the regulator.
 *
 * The chip is NEVER blank. Previously an unasked spec rendered as an unmarked row, so a spec
 * nobody had ever ruled on looked identical to one deliberately excluded — there was nothing
 * to review against.
 *
 * The recorded REASON rides in the tooltip. It exists on essentially every `Not Asked` row and
 * on a handful of others, so hovering any chip answers "why is it treated this way?".
 */
function SelectionChip({ sel }: { sel: SelectionStateInfo | null }) {
  const { t } = useTranslation();
  if (!sel) return null;

  // Labels are short because they sit in a narrow column; the tooltip carries the full meaning.
  // (The reason text comes from docs/min_attr_sets.md and is English-only — it is engineering
  // rationale, not UI copy, and would need re-translating on every review round.)
  const chip = {
    required: {
      label: t('admin.tierRequired', 'Required'),
      color: 'primary' as const,
      tip: t('admin.tierRequiredTip', 'Required to search — always asked, before any search runs.'),
    },
    narrows: {
      label: t('admin.tierNarrows', 'Narrows'),
      color: 'default' as const,
      tip: t('admin.tierNarrowsTip', 'Narrows results — asked only when the result set is too large to be useful.'),
    },
    not_asked: {
      label: t('admin.tierNotAsked', 'Not asked'),
      color: 'default' as const,
      tip: sel.needsReview
        ? t('admin.tierNoReason', 'Not asked — no reason recorded, so this has not been ruled on yet.')
        : t('admin.tierNotAskedTip', 'Never asked when a user is choosing a part by description.'),
    },
  }[sel.state];

  // An unreviewed skip is PROVISIONAL, not an error — a dashed outline says "nobody has
  // decided this yet" without shouting. The actual to-do list lives in docs/min_attr_sets.md.
  const provisional = sel.state === 'not_asked' && sel.needsReview;

  return (
    <Tooltip
      title={
        <>
          {chip.tip}
          {sel.reason && (
            <Box component="span" sx={{ display: 'block', mt: 0.75, fontStyle: 'italic', opacity: 0.85 }}>
              {sel.reason}
            </Box>
          )}
        </>
      }
    >
      <Chip
        label={chip.label}
        size="small"
        color={chip.color}
        variant="outlined"
        sx={{
          height: 18,
          fontSize: '0.6rem',
          ...(sel.state === 'not_asked' && {
            opacity: 0.7,
            borderStyle: provisional ? 'dashed' : 'solid',
          }),
        }}
      />
    </Tooltip>
  );
}

/** Flatten a ParamMapEntry into individual ParamMapping items */
function flattenEntries(paramMap: Record<string, ParamMapEntry>): { dkField: string; mapping: ParamMapping }[] {
  const rows: { dkField: string; mapping: ParamMapping }[] = [];
  for (const [dkField, entry] of Object.entries(paramMap)) {
    if (Array.isArray(entry)) {
      for (const m of entry) rows.push({ dkField, mapping: m });
    } else {
      rows.push({ dkField, mapping: entry });
    }
  }
  return rows.sort((a, b) => a.mapping.sortOrder - b.mapping.sortOrder);
}

export default function ParamMappingsPanel({ table, l2ParamMap }: ParamMappingsPanelProps) {
  const { t } = useTranslation();

  // --- L2 rendering mode ---
  if (!table && l2ParamMap) {
    return <L2View data={l2ParamMap} t={t} />;
  }

  // --- L3 rendering mode (existing) ---
  return <L3View table={table} t={t} />;
}

/** L2 simplified view — no weights, no coverage, just attribute↔field mapping */
function L2View({ data, t }: { data: L2ParamMapData; t: ReturnType<typeof useTranslation>['t'] }) {
  const rows = useMemo(() => flattenEntries(data.paramMap), [data.paramMap]);
  const digikeyCategories = data.digikeyPatterns;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>{data.name}</Typography>
        <Chip
          label={t('admin.displayOnly', 'Display')}
          size="small"
          variant="outlined"
          sx={{ height: 20, fontSize: '0.7rem' }}
        />
      </Box>

      {digikeyCategories.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
          {digikeyCategories.length === 1
            ? <>{t('admin.digikeyCategory')}: <strong>{digikeyCategories[0]}</strong></>
            : <>{t('admin.digikeyCategories', 'Digikey categories')}: <strong>{digikeyCategories.join(', ')}</strong></>
          }
        </Typography>
      )}

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {rows.length} {t('admin.mappedFields', 'mapped fields')}
      </Typography>

      <TableContainer>
        <Table size="small" sx={{ '& td, & th': { borderColor: 'divider' } }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, width: COL_L2.num }}>#</TableCell>
              <TableCell sx={{ fontWeight: 600, width: COL_L2.attrId }}>{t('admin.attributeId')}</TableCell>
              <TableCell sx={{ fontWeight: 600, width: COL_L2.attrName }}>{t('admin.attributeName')}</TableCell>
              <TableCell sx={{ fontWeight: 600, width: COL_L2.digikey }}>{t('admin.digikeyField', 'Digikey Field')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map(({ dkField, mapping }, idx) => (
              <TableRow key={`${mapping.attributeId}-${dkField}`}>
                <TableCell>
                  <Typography variant="caption" color="text.secondary">{idx + 1}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                    {mapping.attributeId}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{mapping.attributeName}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>{dkField}</Typography>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

type SortDir = 'asc' | 'desc';

/** L3 full view — rules with weights, coverage metrics, DK+PIO columns */
function L3View({ table, t }: { table: LogicTable | null; t: ReturnType<typeof useTranslation>['t'] }) {
  const [weightSort, setWeightSort] = useState<SortDir>('desc');
  const categories = useMemo(
    () => (table ? getDigikeyCategoriesForFamily(table.familyId) : []),
    [table],
  );

  const dkReverse = useMemo(() => {
    if (!table) return new Map<string, string>();
    return reverseParamLookupForFamily(table.familyId);
  }, [table]);

  const pioReverse = useMemo(() => {
    if (!table) return new Map<string, string>();
    return reversePartsioParamLookup(table.familyId);
  }, [table]);

  const attributeRows = useMemo(() => {
    if (!table) return [];
    const dir = weightSort === 'asc' ? 1 : -1;
    return [...table.rules].sort((a, b) => dir * (a.weight - b.weight));
  }, [table, weightSort]);

  const coverage = useMemo(() => {
    if (!table) return null;
    const dk = computeFamilyParamCoverage(table.familyId, table.rules);
    const dkMappedIds = getDigikeyAttributeIdsForFamily(table.familyId);
    const pio = computePartsioCoverage(table.familyId, table.rules, dkMappedIds);
    const combinedWeight = dk.matchableWeight + pio.partsioOnlyWeight;
    return {
      totalWeight: dk.totalWeight,
      dkWeight: dk.matchableWeight,
      pioWeight: pio.partsioOnlyWeight,
      combinedWeight,
    };
  }, [table]);

  const extraPioFields = useMemo(() => {
    if (!table) return [];
    const { unmapped } = getAllPartsioFields(table.familyId);
    return unmapped;
  }, [table]);

  if (!table) return null;

  if (categories.length === 0 && pioReverse.size === 0) {
    return (
      <Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 500, mb: 0.5 }}>
          {t(`logicTable.${table.familyId}.name`, table.familyName)}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          {t('admin.noParamMap')}
        </Typography>
      </Box>
    );
  }

  const dkPct = coverage && coverage.totalWeight > 0
    ? Math.round((coverage.dkWeight / coverage.totalWeight) * 100)
    : 0;
  const pioPct = coverage && coverage.totalWeight > 0
    ? Math.round((coverage.pioWeight / coverage.totalWeight) * 100)
    : 0;
  const combinedPct = coverage && coverage.totalWeight > 0
    ? Math.round((coverage.combinedWeight / coverage.totalWeight) * 100)
    : 0;

  const dkColor = dkPct >= 70 ? 'success.main' : dkPct >= 40 ? 'warning.main' : 'error.main';
  const combinedColor = combinedPct >= 70 ? 'success.main' : combinedPct >= 40 ? 'warning.main' : 'error.main';

  return (
    <Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 500, mb: 0.5 }}>
        {t(`logicTable.${table.familyId}.name`, table.familyName)}
      </Typography>

      {coverage && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {t('admin.paramCoverageDk', 'Digikey:')}{' '}
          <Typography component="span" variant="body2" sx={{ fontWeight: 700, color: dkColor }}>
            {dkPct}%
          </Typography>
          {pioPct > 0 && (
            <>
              {' '}{t('admin.paramCoveragePio', '+ Parts.io:')}{' '}
              <Typography component="span" variant="body2" sx={{ fontWeight: 700, color: 'info.main' }}>
                +{pioPct}%
              </Typography>
            </>
          )}
          {' '}{t('admin.paramCoverageCombined', '| Combined:')}{' '}
          <Typography component="span" variant="body2" sx={{ fontWeight: 700, color: combinedColor }}>
            {combinedPct}%
          </Typography>
          {' '}({coverage.combinedWeight} / {coverage.totalWeight} {t('admin.paramCoverageWeight', 'weight')})
        </Typography>
      )}

      {categories.length === 1 && (
        <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
          {t('admin.digikeyCategory')}: <strong>{categories[0]}</strong>
        </Typography>
      )}
      {categories.length > 1 && (
        <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
          {t('admin.digikeyCategories', 'Digikey categories')}: <strong>{categories.join(', ')}</strong>
        </Typography>
      )}

      <TableContainer>
        <Table size="small" sx={{ '& td, & th': { borderColor: 'divider' } }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, width: COL.num }}>#</TableCell>
              <TableCell sx={{ fontWeight: 600, width: COL.attrId }}>{t('admin.attributeId')}</TableCell>
              <TableCell sx={{ fontWeight: 600, width: COL.attrName }}>{t('admin.attributeName')}</TableCell>
              <TableCell sx={{ fontWeight: 600, width: COL.asked }}>
                {t('admin.askedInSearch', 'Asked in search')}
              </TableCell>
              <TableCell sx={{ fontWeight: 600, width: COL.weight, textAlign: 'center' }}>
                <TableSortLabel
                  active
                  direction={weightSort}
                  onClick={() => setWeightSort(prev => prev === 'desc' ? 'asc' : 'desc')}
                >
                  {t('admin.weight')}
                </TableSortLabel>
              </TableCell>
              <TableCell sx={{ fontWeight: 600, width: COL.digikey }}>{t('admin.digikeyField', 'Digikey Field')}</TableCell>
              <TableCell sx={{ fontWeight: 600, width: COL.partsio }}>{t('admin.partsioField', 'Parts.io Field')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {attributeRows.map((rule, idx) => {
              const dkField = dkReverse.get(rule.attributeId);
              const pioField = pioReverse.get(rule.attributeId);
              const hasSources = !!dkField || !!pioField;
              // Read-only marker: does the greenfield agent ask about this spec? Never blank.
              const sel = table ? getSelectionState(table.familyId, rule.attributeId) : null;

              return (
                <TableRow
                  key={rule.attributeId}
                  sx={!hasSources ? { opacity: 0.5 } : undefined}
                >
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {idx + 1}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      variant="caption"
                      sx={{ fontFamily: 'monospace', color: 'text.secondary' }}
                    >
                      {rule.attributeId}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{rule.attributeName}</Typography>
                  </TableCell>
                  <TableCell>
                    <SelectionChip sel={sel} />
                  </TableCell>
                  <TableCell sx={{ textAlign: 'center' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {rule.weight}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: dkField ? 500 : 400, color: dkField ? 'text.primary' : 'text.disabled' }}>
                      {dkField ?? '\u2014'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: pioField ? 500 : 400, color: pioField ? 'info.main' : 'text.disabled' }}>
                      {pioField ?? '\u2014'}
                    </Typography>
                  </TableCell>
                </TableRow>
              );
            })}

            {extraPioFields.length > 0 && extraPioFields.map((field, idx) => (
              <TableRow
                key={`extra-${field}`}
                sx={{
                  opacity: 0.5,
                  ...(idx === 0 && { '& td': { borderTop: '3px solid', borderTopColor: 'divider' } }),
                }}
              >
                <TableCell>
                  <Typography variant="caption" color="text.secondary">
                    {attributeRows.length + idx + 1}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.disabled' }}>
                    {'\u2014'}
                  </Typography>
                </TableCell>
                <TableCell>
                  {idx === 0 && (
                    <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                      {t('admin.extraPartsioFields', 'Additional Parts.io fields (not in schema)')}
                    </Typography>
                  )}
                </TableCell>
                {/* "Asked in search" \u2014 these rows are not schema attributes, so there is nothing to ask about. */}
                <TableCell>
                  <Typography variant="body2" color="text.disabled">{'\u2014'}</Typography>
                </TableCell>
                <TableCell sx={{ textAlign: 'center' }}>
                  <Typography variant="body2" color="text.disabled">{'\u2014'}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.disabled">{'\u2014'}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ color: 'info.main', fontStyle: 'italic' }}>
                    {field}
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
