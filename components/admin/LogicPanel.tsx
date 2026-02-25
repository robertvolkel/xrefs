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
import { LogicTable, MatchingRule } from '@/lib/types';
import { typeColors, typeLabels } from './logicConstants';

function getConditionText(rule: MatchingRule): string {
  if (rule.logicType === 'threshold' || rule.logicType === 'fit') {
    switch (rule.thresholdDirection) {
      case 'gte': return 'Replacement \u2265 Original';
      case 'lte': return 'Replacement \u2264 Original';
      case 'range_superset': return 'Replacement range \u2287 Original';
      default: return rule.logicType === 'fit' ? 'Replacement \u2264 Original' : '\u2014';
    }
  }
  if (rule.logicType === 'identity_upgrade' && rule.upgradeHierarchy) {
    return rule.upgradeHierarchy.join(' > ');
  }
  if (rule.logicType === 'identity_flag') {
    return 'If required by original';
  }
  if (rule.logicType === 'application_review') {
    return 'Requires engineer review';
  }
  return '\u2014';
}

interface LogicPanelProps {
  table: LogicTable | null;
}

export default function LogicPanel({ table }: LogicPanelProps) {
  if (!table) return null;

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 0.5 }}>
        {table.familyName}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {table.description} &mdash; {table.rules.length} rules
      </Typography>

      <TableContainer>
        <Table size="small" sx={{ '& td, & th': { borderColor: 'divider' } }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, width: 40 }}>#</TableCell>
              <TableCell sx={{ fontWeight: 600, width: 180 }}>Attribute</TableCell>
              <TableCell sx={{ fontWeight: 600, width: 140 }}>Rule Type</TableCell>
              <TableCell sx={{ fontWeight: 600, width: 200 }}>Condition</TableCell>
              <TableCell sx={{ fontWeight: 600, width: 60, textAlign: 'center' }}>Weight</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Engineering Reason</TableCell>
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
                    {rule.attributeName}
                  </Typography>
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
                <TableCell>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {getConditionText(rule)}
                  </Typography>
                </TableCell>
                <TableCell sx={{ textAlign: 'center' }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {rule.weight}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="caption" sx={{ color: 'text.secondary', lineHeight: 1.5 }}>
                    {rule.engineeringReason}
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
