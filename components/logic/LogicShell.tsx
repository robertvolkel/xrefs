'use client';

import { useState, useMemo } from 'react';
import {
  Box,
  Chip,
  IconButton,
  Link,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { getAllLogicTables } from '@/lib/logicTables';
import { LogicTable, LogicType, MatchingRule } from '@/lib/types';

const allTables = getAllLogicTables();
const allCategories = [...new Set(allTables.map(t => t.category))];

// Color map for logic type chips
const typeColors: Record<LogicType, string> = {
  identity: '#64B5F6',           // blue
  identity_upgrade: '#CE93D8',   // purple
  identity_flag: '#FFB74D',      // orange
  threshold: '#81C784',          // green
  fit: '#4DB6AC',                // teal
  application_review: '#FFD54F', // amber
  operational: '#90A4AE',        // grey
};

const typeLabels: Record<LogicType, string> = {
  identity: 'Exact Match',
  identity_upgrade: 'Match or Upgrade',
  identity_flag: 'Flag (if required)',
  threshold: 'Threshold',
  fit: 'Physical Fit',
  application_review: 'Manual Review',
  operational: 'Operational',
};

function getConditionText(rule: MatchingRule): string {
  if (rule.logicType === 'threshold' || rule.logicType === 'fit') {
    switch (rule.thresholdDirection) {
      case 'gte': return 'Replacement ≥ Original';
      case 'lte': return 'Replacement ≤ Original';
      case 'range_superset': return 'Replacement range ⊇ Original';
      default: return rule.logicType === 'fit' ? 'Replacement ≤ Original' : '—';
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
  return '—';
}

export default function LogicShell() {
  const [selectedCategory, setSelectedCategory] = useState(allCategories[0] ?? '');
  const filteredTables = useMemo(
    () => allTables.filter(t => t.category === selectedCategory),
    [selectedCategory],
  );
  const [selectedId, setSelectedId] = useState(allTables[0]?.familyId ?? '');
  const selectedTable = filteredTables.find((t) => t.familyId === selectedId) ?? filteredTables[0];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default' }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: 3,
          py: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton href="/" size="small" sx={{ color: 'text.secondary' }}>
            <ArrowBackIcon fontSize="small" />
          </IconButton>
          <Link href="/" sx={{ display: 'flex', alignItems: 'center' }}>
            <Box
              component="img"
              src="/xq-logo.png"
              alt="XQ"
              sx={{ width: 28, opacity: 0.55, '&:hover': { opacity: 0.8 } }}
            />
          </Link>
          <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
            Cross-Reference Logic
          </Typography>
        </Box>
      </Box>

      {/* Body: sidebar + content */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar */}
        <Box
          sx={{
            width: 260,
            flexShrink: 0,
            borderRight: 1,
            borderColor: 'divider',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <Box sx={{ px: 2, py: 1.5, flexShrink: 0 }}>
            <Select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              size="small"
              fullWidth
              sx={{ fontSize: '0.85rem' }}
            >
              {allCategories.map((cat) => (
                <MenuItem key={cat} value={cat}>{cat}</MenuItem>
              ))}
            </Select>
          </Box>
          <List disablePadding sx={{ overflowY: 'auto', flex: 1 }}>
            {filteredTables.map((table) => (
              <ListItemButton
                key={table.familyId}
                selected={table.familyId === selectedId}
                onClick={() => setSelectedId(table.familyId)}
                sx={{
                  py: 1,
                  px: 2,
                  '&.Mui-selected': { bgcolor: 'action.selected' },
                }}
              >
                <ListItemText
                  primary={table.familyName}
                  primaryTypographyProps={{ variant: 'body2', fontWeight: table.familyId === selectedId ? 600 : 400 }}
                />
              </ListItemButton>
            ))}
          </List>
        </Box>

        {/* Content */}
        <Box sx={{ flex: 1, overflowY: 'auto', p: 3 }}>
          {selectedTable && (
            <>
              <Typography variant="h6" sx={{ mb: 0.5 }}>
                {selectedTable.familyName}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                {selectedTable.description} &mdash; {selectedTable.rules.length} rules
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
                    {selectedTable.rules.map((rule, idx) => (
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
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
}
