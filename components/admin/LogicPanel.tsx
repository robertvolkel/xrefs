'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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
  Typography,
  IconButton,
  Tooltip,
  Button,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { useTranslation } from 'react-i18next';
import { LogicTable, MatchingRule, RuleOverrideRecord } from '@/lib/types';
import { getRuleOverrides, getRuleAnnotations } from '@/lib/api';
import { typeColors, typeTranslationKeys, typeLabels } from './logicConstants';
import RuleOverrideDrawer from './RuleOverrideDrawer';

// Override action → dot color
const ACTION_DOT_COLORS: Record<string, string> = {
  modify: '#FFB74D',  // amber
  add: '#69F0AE',     // green
  remove: '#FF5252',  // red
};

/** Format a date string as "Mar 20, 2026" */
function formatShortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

interface LogicPanelProps {
  table: LogicTable | null;
}

export default function LogicPanel({ table }: LogicPanelProps) {
  const { t } = useTranslation();
  const [overrides, setOverrides] = useState<RuleOverrideRecord[]>([]);
  const [annotationCounts, setAnnotationCounts] = useState<Map<string, number>>(new Map());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<MatchingRule | null>(null);
  const [isAddMode, setIsAddMode] = useState(false);
  const [weightSort, setWeightSort] = useState<'asc' | 'desc' | null>(null);

  // Build override lookup map
  const overrideMap = useMemo(() => {
    const map = new Map<string, RuleOverrideRecord>();
    for (const ov of overrides) map.set(ov.attributeId, ov);
    return map;
  }, [overrides]);

  // Fetch overrides when family changes
  const fetchOverrides = useCallback(async () => {
    if (!table) { setOverrides([]); return; }
    const data = await getRuleOverrides(table.familyId);
    setOverrides(data);
  }, [table]);

  // Fetch annotation counts for all rules in this family (single API call)
  const fetchAnnotationCounts = useCallback(async () => {
    if (!table) { setAnnotationCounts(new Map()); return; }
    const allAnnotations = await getRuleAnnotations(table.familyId);
    const counts = new Map<string, number>();
    for (const a of allAnnotations) {
      if (!a.isResolved) {
        counts.set(a.attributeId, (counts.get(a.attributeId) ?? 0) + 1);
      }
    }
    setAnnotationCounts(counts);
  }, [table]);

  useEffect(() => { fetchOverrides(); }, [fetchOverrides]);
  useEffect(() => { fetchAnnotationCounts(); }, [fetchAnnotationCounts]);

  const handleRowClick = useCallback((rule: MatchingRule) => {
    setSelectedRule(rule);
    setIsAddMode(false);
    setDrawerOpen(true);
  }, []);

  const handleAddClick = useCallback(() => {
    setSelectedRule(null);
    setIsAddMode(true);
    setDrawerOpen(true);
  }, []);

  const handleDrawerClose = useCallback(() => {
    setDrawerOpen(false);
    setSelectedRule(null);
    setIsAddMode(false);
  }, []);

  const handleSaved = useCallback(() => {
    fetchOverrides();
    fetchAnnotationCounts();
  }, [fetchOverrides, fetchAnnotationCounts]);

  if (!table) return null;

  const fKey = `logicTable.${table.familyId}`;

  // Count active overrides for the header badge
  const overrideCount = overrides.length;

  const sortedRules = useMemo(() => {
    if (!weightSort) return table.rules;
    const dir = weightSort === 'asc' ? 1 : -1;
    return [...table.rules].sort((a, b) => dir * (a.weight - b.weight));
  }, [table.rules, weightSort]);

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="h6">
          {t(`${fKey}.name`, table.familyName)}
        </Typography>
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={handleAddClick}
          sx={{ textTransform: 'none' }}
        >
          {t('admin.addRule')}
        </Button>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {t(`${fKey}.desc`, table.description)} &mdash; {t('admin.rulesCount', { count: table.rules.length })}
        {overrideCount > 0 && (
          <Chip
            label={t('admin.overrideCount', { count: overrideCount })}
            size="small"
            color="warning"
            variant="outlined"
            sx={{ ml: 1, height: 20, fontSize: '0.7rem' }}
          />
        )}
      </Typography>

      <TableContainer>
        <Table size="small" sx={{ '& td, & th': { borderColor: 'divider' } }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, width: 40, p: 0.5 }} />
              <TableCell sx={{ fontWeight: 600, width: 34 }}>#</TableCell>
              <TableCell sx={{ fontWeight: 600, width: 180 }}>{t('admin.colAttribute', 'Attribute')}</TableCell>
              <TableCell sx={{ fontWeight: 600, width: 140 }}>{t('admin.colRuleType', 'Rule Type')}</TableCell>
              <TableCell sx={{ fontWeight: 600, width: 200 }}>{t('admin.colCondition', 'Condition')}</TableCell>
              <TableCell sx={{ fontWeight: 600, width: 60, textAlign: 'center' }}>
                <TableSortLabel
                  active={weightSort !== null}
                  direction={weightSort ?? 'desc'}
                  onClick={() => setWeightSort(prev => prev === null ? 'desc' : prev === 'desc' ? 'asc' : null)}
                >
                  {t('admin.colWeight', 'Weight')}
                </TableSortLabel>
              </TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t('admin.colEngineering', 'Engineering Reason')}</TableCell>
              <TableCell sx={{ fontWeight: 600, width: 40 }} />
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedRules.map((rule, idx) => {
              const override = overrideMap.get(rule.attributeId);
              const isOverridden = !!override;
              const annotCount = annotationCounts.get(rule.attributeId) ?? 0;

              return (
                <TableRow
                  key={rule.attributeId}
                  sx={{
                    '&:last-child td': { borderBottom: 0 },
                    cursor: 'pointer',
                    '&:hover': { bgcolor: 'action.hover' },
                    ...(isOverridden && { bgcolor: 'rgba(255,183,77,0.06)' }),
                  }}
                  onClick={() => handleRowClick(rule)}
                >
                  {/* Override indicator dot + annotation icon */}
                  <TableCell sx={{ p: 0.5, textAlign: 'center' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                      {isOverridden && (
                        <Tooltip title={
                          `${override.action} by ${override.createdByName ?? 'Unknown'}` +
                          ` on ${formatShortDate(override.createdAt)}` +
                          ` \u2014 ${override.changeReason}`
                        }>
                          <Box
                            sx={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              bgcolor: ACTION_DOT_COLORS[override.action] ?? '#FFB74D',
                              display: 'inline-block',
                              flexShrink: 0,
                            }}
                          />
                        </Tooltip>
                      )}
                      {annotCount > 0 && (
                        <Tooltip title={t('adminOverride.annotationCount', { count: annotCount, defaultValue: `${annotCount} annotation${annotCount !== 1 ? 's' : ''}` })}>
                          <Box sx={{
                            width: 16, height: 16, borderRadius: '50%', bgcolor: '#FF5252',
                            color: '#fff', fontSize: '0.6rem', fontWeight: 700,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0, lineHeight: 1,
                          }}>
                            {annotCount}
                          </Box>
                        </Tooltip>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {idx + 1}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {t(`${fKey}.attr.${rule.attributeId}`, rule.attributeName)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={t(typeTranslationKeys[rule.logicType], typeLabels[rule.logicType])}
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
                  <TableCell>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {getConditionText(rule, t)}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ textAlign: 'center' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {rule.weight}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" sx={{ color: 'text.secondary', lineHeight: 1.5 }}>
                      {t(`${fKey}.reason.${rule.attributeId}`, rule.engineeringReason)}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ p: 0.5 }}>
                    <IconButton
                      size="small"
                      onClick={e => { e.stopPropagation(); handleRowClick(rule); }}
                      sx={{ opacity: 0.5, '&:hover': { opacity: 1 } }}
                    >
                      <EditOutlinedIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Override Drawer */}
      <RuleOverrideDrawer
        open={drawerOpen}
        onClose={handleDrawerClose}
        familyId={table.familyId}
        baseRule={isAddMode ? null : selectedRule}
        existingOverride={selectedRule ? overrideMap.get(selectedRule.attributeId) ?? null : null}
        onSaved={handleSaved}
      />
    </Box>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getConditionText(rule: MatchingRule, t: any): string {
  if (rule.logicType === 'threshold' || rule.logicType === 'fit') {
    switch (rule.thresholdDirection) {
      case 'gte': return t('admin.condGte', 'Replacement \u2265 Original');
      case 'lte': return t('admin.condLte', 'Replacement \u2264 Original');
      case 'range_superset': return t('admin.condRangeSuperset', 'Replacement range \u2287 Original');
      default: return rule.logicType === 'fit' ? t('admin.condLte', 'Replacement \u2264 Original') : '\u2014';
    }
  }
  if (rule.logicType === 'identity_upgrade' && rule.upgradeHierarchy) {
    return rule.upgradeHierarchy.join(' > ');
  }
  if (rule.logicType === 'identity_flag') {
    return t('admin.condIfRequired', 'If required by original');
  }
  if (rule.logicType === 'application_review') {
    return t('admin.condEngineerReview', 'Requires engineer review');
  }
  return '\u2014';
}
