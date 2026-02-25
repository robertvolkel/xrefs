'use client';

import { useMemo } from 'react';
import {
  Box,
  Chip,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogicTable, MatchingRule } from '@/lib/types';
import {
  computeFamilyParamCoverage,
  getDigikeyCategoriesForFamily,
  getFullParamMap,
  ParamMapEntry,
  ParamMapping,
} from '@/lib/services/digikeyParamMap';
import { typeColors, typeLabels } from './logicConstants';

interface ParamMappingsPanelProps {
  table: LogicTable | null;
}

/** Flatten a param map into sorted rows for display */
function flattenParamMap(map: Record<string, ParamMapEntry>): {
  parameterText: string;
  mappings: ParamMapping[];
}[] {
  const rows: { parameterText: string; mappings: ParamMapping[] }[] = [];

  for (const [parameterText, entry] of Object.entries(map)) {
    const mappings = Array.isArray(entry) ? entry : [entry];
    rows.push({ parameterText, mappings });
  }

  // Sort by the first mapping's sortOrder
  rows.sort((a, b) => (a.mappings[0]?.sortOrder ?? 99) - (b.mappings[0]?.sortOrder ?? 99));
  return rows;
}

/** Shared column widths for visual alignment between mapped and unmapped tables */
const COL = { num: 40, digikey: 240, attrId: 160, attrName: 180, ruleType: 140, weight: 60 };

/** Shared divider style for the Digikey → Internal boundary */
const dividerSx = { borderLeft: '1px solid', borderLeftColor: 'divider' } as const;

export default function ParamMappingsPanel({ table }: ParamMappingsPanelProps) {
  const { t } = useTranslation();
  const [tabIndex, setTabIndex] = useState(0);

  const categories = useMemo(
    () => (table ? getDigikeyCategoriesForFamily(table.familyId) : []),
    [table],
  );

  const activeCategory = categories[tabIndex] ?? categories[0];
  const paramMap = useMemo(
    () => (activeCategory ? getFullParamMap(activeCategory) : null),
    [activeCategory],
  );
  const rows = useMemo(() => (paramMap ? flattenParamMap(paramMap) : []), [paramMap]);

  // Lookup rule weight + logicType by attributeId
  const ruleMap = useMemo(() => {
    if (!table) return new Map<string, MatchingRule>();
    return new Map(table.rules.map(r => [r.attributeId, r]));
  }, [table]);

  // Compute unmapped rules across ALL categories (not just active tab)
  const unmappedRules = useMemo((): MatchingRule[] => {
    if (!table) return [];
    const mappedIds = new Set<string>();
    for (const cat of categories) {
      const map = getFullParamMap(cat);
      if (!map) continue;
      for (const entry of Object.values(map)) {
        const mappings = Array.isArray(entry) ? entry : [entry];
        for (const m of mappings) mappedIds.add(m.attributeId);
      }
    }
    return table.rules
      .filter(r => !mappedIds.has(r.attributeId))
      .sort((a, b) => b.weight - a.weight);
  }, [table, categories]);

  // Param coverage for this family
  const coverage = useMemo(() => {
    if (!table) return null;
    return computeFamilyParamCoverage(table.familyId, table.rules);
  }, [table]);

  // Count mapped body rows (multi-maps expand into multiple rows)
  const mappedRowCount = rows.reduce((n, r) => n + r.mappings.length, 0);

  if (!table) return null;

  if (categories.length === 0) {
    return (
      <Box>
        <Typography variant="h6" sx={{ mb: 0.5 }}>
          {table.familyName}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          {t('admin.noParamMap')}
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 0.5 }}>
        {table.familyName}
      </Typography>
      {coverage && (() => {
        const pct = coverage.totalWeight > 0
          ? Math.round((coverage.matchableWeight / coverage.totalWeight) * 100)
          : 0;
        const color = pct >= 70 ? 'success.main' : pct >= 40 ? 'warning.main' : 'error.main';
        return (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Digikey parameter coverage:{' '}
            <Typography component="span" variant="body2" sx={{ fontWeight: 700, color }}>
              {pct}%
            </Typography>
            {' '}({coverage.matchableWeight} / {coverage.totalWeight} weight)
            {' '}&mdash; {rows.length} parameters mapped
          </Typography>
        );
      })()}

      {categories.length > 1 && (
        <Tabs
          value={tabIndex}
          onChange={(_, v) => setTabIndex(v)}
          sx={{ mb: 2, minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0.5 } }}
        >
          {categories.map((cat) => (
            <Tab key={cat} label={cat} sx={{ fontSize: '0.8rem', textTransform: 'none' }} />
          ))}
        </Tabs>
      )}

      {categories.length === 1 && (
        <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
          {t('admin.digikeyCategory')}: <strong>{activeCategory}</strong>
        </Typography>
      )}

      {/* Single unified table: mapped parameters + unmapped rules */}
      <TableContainer>
        <Table size="small" sx={{ '& td, & th': { borderColor: 'divider' } }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, width: COL.num }}>#</TableCell>
              <TableCell sx={{ fontWeight: 600, width: COL.digikey }}>{t('admin.parameterText')}</TableCell>
              <TableCell sx={{ fontWeight: 600, width: COL.attrId, ...dividerSx }}>{t('admin.attributeId')}</TableCell>
              <TableCell sx={{ fontWeight: 600, width: COL.attrName }}>{t('admin.attributeName')}</TableCell>
              <TableCell sx={{ fontWeight: 600, width: COL.ruleType }}>{t('admin.ruleType')}</TableCell>
              <TableCell sx={{ fontWeight: 600, width: COL.weight, textAlign: 'center' }}>{t('admin.weight')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {/* Mapped rows */}
            {rows.map((row, idx) =>
              row.mappings.map((mapping, mIdx) => {
                const rule = ruleMap.get(mapping.attributeId);
                return (
                  <TableRow
                    key={`${row.parameterText}-${mapping.attributeId}`}
                  >
                    <TableCell>
                      {mIdx === 0 && (
                        <Typography variant="caption" color="text.secondary">
                          {idx + 1}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {mIdx === 0 && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {row.parameterText}
                          </Typography>
                          {row.mappings.length > 1 && (
                            <Chip
                              label={t('admin.multiMap')}
                              size="small"
                              sx={{
                                bgcolor: '#CE93D822',
                                color: '#CE93D8',
                                fontWeight: 500,
                                fontSize: '0.65rem',
                                height: 20,
                              }}
                            />
                          )}
                        </Box>
                      )}
                    </TableCell>
                    <TableCell sx={dividerSx}>
                      <Typography
                        variant="caption"
                        sx={{ fontFamily: 'monospace', color: 'text.secondary' }}
                      >
                        {mapping.attributeId}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{mapping.attributeName}</Typography>
                    </TableCell>
                    <TableCell>
                      {rule && (
                        <Chip
                          label={typeLabels[rule.logicType]}
                          size="small"
                          sx={{
                            bgcolor: typeColors[rule.logicType] + '22',
                            color: typeColors[rule.logicType],
                            fontWeight: 500,
                            fontSize: '0.72rem',
                            height: 24,
                          }}
                        />
                      )}
                    </TableCell>
                    <TableCell sx={{ textAlign: 'center' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {rule?.weight ?? '\u2014'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                );
              }),
            )}

            {/* Unmapped rows (continuing numbering, thicker top border on first) */}
            {unmappedRules.map((rule, idx) => (
              <TableRow
                key={rule.attributeId}
                sx={{
                  opacity: 0.6,
                  ...(idx === 0 && { '& td': { borderTop: '3px solid', borderTopColor: 'divider' } }),
                }}
              >
                <TableCell>
                  <Typography variant="caption" color="text.secondary">
                    {rows.length + idx + 1}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">
                    {'\u2014'}
                  </Typography>
                </TableCell>
                <TableCell sx={dividerSx}>
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
                  <Chip
                    label={typeLabels[rule.logicType]}
                    size="small"
                    sx={{
                      bgcolor: typeColors[rule.logicType] + '22',
                      color: typeColors[rule.logicType],
                      fontWeight: 500,
                      fontSize: '0.72rem',
                      height: 24,
                    }}
                  />
                </TableCell>
                <TableCell sx={{ textAlign: 'center' }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {rule.weight}
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
