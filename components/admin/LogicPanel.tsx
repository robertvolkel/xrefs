'use client';

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
import { LogicTable, MatchingRule } from '@/lib/types';
import { typeColors, typeTranslationKeys, typeLabels } from './logicConstants';

interface LogicPanelProps {
  table: LogicTable | null;
}

export default function LogicPanel({ table }: LogicPanelProps) {
  const { t } = useTranslation();

  if (!table) return null;

  const fKey = `logicTable.${table.familyId}`;

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 0.5 }}>
        {t(`${fKey}.name`, table.familyName)}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {t(`${fKey}.desc`, table.description)} &mdash; {t('admin.rulesCount', { count: table.rules.length })}
      </Typography>

      <TableContainer>
        <Table size="small" sx={{ '& td, & th': { borderColor: 'divider' } }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, width: 40 }}>#</TableCell>
              <TableCell sx={{ fontWeight: 600, width: 180 }}>{t('admin.colAttribute', 'Attribute')}</TableCell>
              <TableCell sx={{ fontWeight: 600, width: 140 }}>{t('admin.colRuleType', 'Rule Type')}</TableCell>
              <TableCell sx={{ fontWeight: 600, width: 200 }}>{t('admin.colCondition', 'Condition')}</TableCell>
              <TableCell sx={{ fontWeight: 600, width: 60, textAlign: 'center' }}>{t('admin.colWeight', 'Weight')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t('admin.colEngineering', 'Engineering Reason')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {table.rules.map((rule, idx) => (
              <TableRow key={rule.attributeId} sx={{ '&:last-child td': { borderBottom: 0 } }}>
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
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
