'use client';

import { useMemo } from 'react';
import {
  Box,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
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
const COL = { num: 36, attrId: 160, attrName: 180, weight: 50, digikey: 220, partsio: 220 };
/** Column widths for the L2 simplified table */
const COL_L2 = { num: 36, attrId: 160, attrName: 200, digikey: 240 };

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
        <Typography variant="h6">{data.name}</Typography>
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

/** L3 full view — rules with weights, coverage metrics, DK+PIO columns */
function L3View({ table, t }: { table: LogicTable | null; t: ReturnType<typeof useTranslation>['t'] }) {
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
    return [...table.rules].sort((a, b) => b.weight - a.weight);
  }, [table]);

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
        <Typography variant="h6" sx={{ mb: 0.5 }}>
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
      <Typography variant="h6" sx={{ mb: 0.5 }}>
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
              <TableCell sx={{ fontWeight: 600, width: COL.weight, textAlign: 'center' }}>{t('admin.weight')}</TableCell>
              <TableCell sx={{ fontWeight: 600, width: COL.digikey }}>{t('admin.digikeyField', 'Digikey Field')}</TableCell>
              <TableCell sx={{ fontWeight: 600, width: COL.partsio }}>{t('admin.partsioField', 'Parts.io Field')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {attributeRows.map((rule, idx) => {
              const dkField = dkReverse.get(rule.attributeId);
              const pioField = pioReverse.get(rule.attributeId);
              const hasSources = !!dkField || !!pioField;

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
