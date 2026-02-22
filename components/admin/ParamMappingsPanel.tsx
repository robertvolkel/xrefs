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
import { LogicTable } from '@/lib/types';
import {
  getDigikeyCategoriesForFamily,
  getFullParamMap,
  ParamMapEntry,
  ParamMapping,
} from '@/lib/services/digikeyParamMap';

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
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Digikey ParameterText to internal attribute mappings &mdash; {rows.length} parameters mapped
      </Typography>

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

      <TableContainer>
        <Table size="small" sx={{ '& td, & th': { borderColor: 'divider' } }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, width: 40 }}>#</TableCell>
              <TableCell sx={{ fontWeight: 600, width: 240 }}>{t('admin.parameterText')}</TableCell>
              <TableCell sx={{ fontWeight: 600, width: 160 }}>{t('admin.attributeId')}</TableCell>
              <TableCell sx={{ fontWeight: 600, width: 180 }}>{t('admin.attributeName')}</TableCell>
              <TableCell sx={{ fontWeight: 600, width: 80 }}>{t('admin.unit')}</TableCell>
              <TableCell sx={{ fontWeight: 600, width: 60, textAlign: 'center' }}>{t('admin.sortOrder')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row, idx) =>
              row.mappings.map((mapping, mIdx) => (
                <TableRow
                  key={`${row.parameterText}-${mapping.attributeId}`}
                  sx={{ '&:last-child td': { borderBottom: 0 } }}
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
                  <TableCell>
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
                    <Typography variant="caption" color="text.secondary">
                      {mapping.unit ?? '\u2014'}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ textAlign: 'center' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {mapping.sortOrder}
                    </Typography>
                  </TableCell>
                </TableRow>
              )),
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
