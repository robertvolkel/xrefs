'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Box,
  Chip,
  Collapse,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
  Button,
} from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import { useTranslation } from 'react-i18next';
import { LogicTable, AtlasDictOverrideRecord } from '@/lib/types';
import DictionaryOverrideDrawer from './DictionaryOverrideDrawer';

// Override action → dot color (same palette as LogicPanel)
const ACTION_DOT_COLORS: Record<string, string> = {
  modify: '#FFB74D',
  add: '#69F0AE',
  remove: '#FF5252',
};

interface DictEntry {
  paramName: string;
  attributeId: string;
  attributeName: string;
  unit?: string;
  sortOrder: number;
}

interface DictData {
  familyId: string;
  entries: DictEntry[];
  sharedEntries: DictEntry[];
  unmapped: { paramName: string; count: number }[];
  overrides: AtlasDictOverrideRecord[];
  stats: {
    totalEntries: number;
    uniqueAttributes: number;
    unmappedCount: number;
  };
}

/** Detect CJK characters to classify language */
function isChinese(s: string): boolean {
  return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(s);
}

/** Shared divider style */
const dividerSx = { borderLeft: '1px solid', borderLeftColor: 'divider' } as const;

interface AtlasDictionaryPanelProps {
  table: LogicTable | null;
}

export default function AtlasDictionaryPanel({ table }: AtlasDictionaryPanelProps) {
  const { t } = useTranslation();
  const [data, setData] = useState<DictData | null>(null);
  const [loading, setLoading] = useState(false);
  const [sharedOpen, setSharedOpen] = useState(false);
  const [unmappedOpen, setUnmappedOpen] = useState(false);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<DictEntry | null>(null);
  const [isAddMode, setIsAddMode] = useState(false);
  const [addParamName, setAddParamName] = useState('');

  const familyId = table?.familyId;

  const fetchData = useCallback(() => {
    if (!familyId) return;
    setLoading(true);
    fetch(`/api/admin/atlas/dictionaries?familyId=${familyId}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setData(json.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [familyId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Build override lookup by paramName
  const overrideMap = useMemo(() => {
    const map = new Map<string, AtlasDictOverrideRecord>();
    if (data) {
      for (const ov of data.overrides) map.set(ov.paramName, ov);
    }
    return map;
  }, [data]);

  const handleRowClick = useCallback((entry: DictEntry) => {
    setSelectedEntry(entry);
    setIsAddMode(false);
    setAddParamName('');
    setDrawerOpen(true);
  }, []);

  const handleAddMapping = useCallback((paramName: string) => {
    setSelectedEntry(null);
    setIsAddMode(true);
    setAddParamName(paramName);
    setDrawerOpen(true);
  }, []);

  const handleDrawerClose = useCallback(() => {
    setDrawerOpen(false);
    setSelectedEntry(null);
    setIsAddMode(false);
    setAddParamName('');
  }, []);

  const handleSaved = useCallback(() => {
    handleDrawerClose();
    fetchData();
  }, [handleDrawerClose, fetchData]);

  if (!table) return null;

  if (loading && !data) {
    return (
      <Box>
        <Typography variant="h6" sx={{ mb: 0.5 }}>
          {t(`logicTable.${table.familyId}.name`, table.familyName)}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t('common.loading')}
        </Typography>
      </Box>
    );
  }

  if (!data || data.entries.length === 0) {
    return (
      <Box>
        <Typography variant="h6" sx={{ mb: 0.5 }}>
          {t(`logicTable.${table.familyId}.name`, table.familyName)}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          {t('admin.noDictionary', 'No Atlas translation dictionary for this family.')}
        </Typography>
      </Box>
    );
  }

  const { stats } = data;

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 0.5 }}>
        {t(`logicTable.${table.familyId}.name`, table.familyName)}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
        {t('admin.atlasDictDesc', 'Translation dictionaries mapping Atlas parameter names to internal attributes.')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {stats.totalEntries} {t('admin.entries', 'entries')}
        {' \u00B7 '}
        {stats.uniqueAttributes} {t('admin.uniqueAttributes', 'unique attributes')}
        {stats.unmappedCount > 0 && (
          <>
            {' \u00B7 '}
            <Typography component="span" variant="body2" sx={{ color: 'warning.main' }}>
              {stats.unmappedCount} {t('admin.unmappedParams', 'unmapped')}
            </Typography>
          </>
        )}
      </Typography>

      {/* Dictionary Table */}
      <TableContainer>
        <Table size="small" sx={{ '& td, & th': { borderColor: 'divider' } }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, width: 40 }}>#</TableCell>
              <TableCell sx={{ fontWeight: 600, width: 280 }}>
                {t('admin.atlasParamName', 'Atlas Parameter')}
              </TableCell>
              <TableCell sx={{ fontWeight: 600, width: 50 }}>
                {t('admin.lang', 'Lang')}
              </TableCell>
              <TableCell sx={{ fontWeight: 600, width: 160, ...dividerSx }}>
                {t('admin.attributeId')}
              </TableCell>
              <TableCell sx={{ fontWeight: 600, width: 180 }}>
                {t('admin.attributeName')}
              </TableCell>
              <TableCell sx={{ fontWeight: 600, width: 80 }}>
                {t('admin.unit', 'Unit')}
              </TableCell>
              <TableCell sx={{ fontWeight: 600, width: 60, textAlign: 'center' }}>
                {t('admin.sortOrder', 'Sort')}
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.entries.map((entry, idx) => {
              const override = overrideMap.get(entry.paramName);
              const isRemoved = override?.action === 'remove';

              return (
                <TableRow
                  key={entry.paramName}
                  hover
                  onClick={() => handleRowClick(entry)}
                  sx={{
                    cursor: 'pointer',
                    opacity: isRemoved ? 0.4 : 1,
                    textDecoration: isRemoved ? 'line-through' : 'none',
                  }}
                >
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      {override && (
                        <Tooltip title={`Override: ${override.action}`} arrow>
                          <Box
                            sx={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              bgcolor: ACTION_DOT_COLORS[override.action] ?? '#999',
                              flexShrink: 0,
                            }}
                          />
                        </Tooltip>
                      )}
                      <Typography variant="caption" color="text.secondary">
                        {idx + 1}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {entry.paramName}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={isChinese(entry.paramName) ? 'CN' : 'EN'}
                      size="small"
                      sx={{
                        height: 20,
                        fontSize: '0.65rem',
                        fontWeight: 600,
                        bgcolor: isChinese(entry.paramName) ? '#EF535022' : '#42A5F522',
                        color: isChinese(entry.paramName) ? '#EF5350' : '#42A5F5',
                      }}
                    />
                  </TableCell>
                  <TableCell sx={dividerSx}>
                    <Typography
                      variant="caption"
                      sx={{ fontFamily: 'monospace', color: 'text.secondary' }}
                    >
                      {entry.attributeId}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{entry.attributeName}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {entry.unit || '\u2014'}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ textAlign: 'center' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {entry.sortOrder}
                    </Typography>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Shared Dictionary (collapsible) */}
      {data.sharedEntries.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Box
            onClick={() => setSharedOpen(!sharedOpen)}
            sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 0.5 }}
          >
            <IconButton size="small">
              {sharedOpen ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
            </IconButton>
            <Typography variant="subtitle2" color="text.secondary">
              {t('admin.sharedDictionary', 'Shared Dictionary')} ({data.sharedEntries.length})
            </Typography>
          </Box>
          <Collapse in={sharedOpen} timeout="auto" unmountOnExit>
            <TableContainer sx={{ mt: 1 }}>
              <Table size="small" sx={{ '& td, & th': { borderColor: 'divider' } }}>
                <TableBody>
                  {data.sharedEntries.map((entry) => (
                    <TableRow key={entry.paramName} sx={{ opacity: 0.7 }}>
                      <TableCell sx={{ width: 40 }} />
                      <TableCell sx={{ width: 280 }}>
                        <Typography variant="body2">{entry.paramName}</Typography>
                      </TableCell>
                      <TableCell sx={{ width: 50 }}>
                        <Chip
                          label={isChinese(entry.paramName) ? 'CN' : 'EN'}
                          size="small"
                          sx={{
                            height: 20,
                            fontSize: '0.65rem',
                            fontWeight: 600,
                            bgcolor: isChinese(entry.paramName) ? '#EF535022' : '#42A5F522',
                            color: isChinese(entry.paramName) ? '#EF5350' : '#42A5F5',
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ width: 160, ...dividerSx }}>
                        <Typography
                          variant="caption"
                          sx={{ fontFamily: 'monospace', color: 'text.secondary' }}
                        >
                          {entry.attributeId}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ width: 180 }}>
                        <Typography variant="body2">{entry.attributeName}</Typography>
                      </TableCell>
                      <TableCell sx={{ width: 80 }}>
                        <Typography variant="caption" color="text.secondary">
                          {entry.unit || '\u2014'}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ width: 60, textAlign: 'center' }}>
                        <Typography variant="body2">{entry.sortOrder}</Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Collapse>
        </Box>
      )}

      {/* Unmapped Parameters (collapsible) */}
      {data.unmapped.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Box
            onClick={() => setUnmappedOpen(!unmappedOpen)}
            sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 0.5 }}
          >
            <IconButton size="small">
              {unmappedOpen ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
            </IconButton>
            <Typography variant="subtitle2" color="warning.main">
              {t('admin.unmappedParams', 'Unmapped Parameters')} ({data.unmapped.length})
            </Typography>
          </Box>
          <Collapse in={unmappedOpen} timeout="auto" unmountOnExit>
            <Typography variant="caption" color="text.secondary" sx={{ ml: 5, mb: 1, display: 'block' }}>
              {t('admin.unmappedParamsDesc', 'Parameters found in Atlas products with no dictionary entry.')}
            </Typography>
            <TableContainer sx={{ mt: 1 }}>
              <Table size="small" sx={{ '& td, & th': { borderColor: 'divider' } }}>
                <TableBody>
                  {data.unmapped.map((item) => (
                    <TableRow key={item.paramName} sx={{ opacity: 0.6 }}>
                      <TableCell sx={{ width: 40 }} />
                      <TableCell sx={{ width: 280 }}>
                        <Typography variant="body2">{item.paramName}</Typography>
                      </TableCell>
                      <TableCell sx={{ width: 50 }}>
                        <Chip
                          label={isChinese(item.paramName) ? 'CN' : 'EN'}
                          size="small"
                          sx={{
                            height: 20,
                            fontSize: '0.65rem',
                            fontWeight: 600,
                            bgcolor: isChinese(item.paramName) ? '#EF535022' : '#42A5F522',
                            color: isChinese(item.paramName) ? '#EF5350' : '#42A5F5',
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ width: 160, ...dividerSx }}>
                        <Typography variant="caption" color="text.secondary">
                          {item.count} products
                        </Typography>
                      </TableCell>
                      <TableCell colSpan={3}>
                        <Button
                          size="small"
                          startIcon={<AddCircleOutlineIcon />}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAddMapping(item.paramName);
                          }}
                          sx={{ fontSize: '0.72rem', textTransform: 'none' }}
                        >
                          {t('admin.addMapping', 'Add Mapping')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Collapse>
        </Box>
      )}

      {/* Override Drawer */}
      <DictionaryOverrideDrawer
        open={drawerOpen}
        onClose={handleDrawerClose}
        familyId={familyId ?? ''}
        baseEntry={selectedEntry}
        existingOverride={selectedEntry ? overrideMap.get(selectedEntry.paramName) ?? null : null}
        isAddMode={isAddMode}
        addParamName={addParamName}
        onSaved={handleSaved}
      />
    </Box>
  );
}
