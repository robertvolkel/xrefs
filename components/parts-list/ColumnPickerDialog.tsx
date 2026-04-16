'use client';

import { useState, useMemo } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormLabel,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Radio,
  RadioGroup,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import { useTranslation } from 'react-i18next';
import { ColumnDefinition, GROUP_ORDER } from '@/lib/columnDefinitions';
import { SavedView } from '@/lib/viewConfigStorage';
import type { CalculatedFieldDef } from '@/lib/calculatedFields';
import CalculatedFieldEditor from './CalculatedFieldEditor';

// ============================================================
// SOURCE BADGE
// ============================================================

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  digikey: { label: 'DK', color: '#E65100' },
  partsio: { label: 'PIO', color: '#1565C0' },
  atlas: { label: 'Atlas', color: '#2E7D32' },
};

function SourceBadge({ dataSource }: { dataSource?: string }) {
  if (!dataSource || !SOURCE_LABELS[dataSource]) return null;
  const { label, color } = SOURCE_LABELS[dataSource];
  return (
    <Chip
      label={label}
      size="small"
      sx={{
        height: 16,
        fontSize: '0.6rem',
        fontWeight: 700,
        ml: 0.5,
        bgcolor: `${color}22`,
        color,
        border: `1px solid ${color}44`,
        '& .MuiChip-label': { px: 0.5, py: 0 },
      }}
    />
  );
}

// ============================================================
// COMPONENT
// ============================================================

interface ColumnPickerDialogProps {
  open: boolean;
  mode: 'create' | 'edit';
  availableColumns: ColumnDefinition[];
  initialView?: SavedView;
  isBuiltinView?: boolean;
  /** Scope of the view being edited (master views show a warning) */
  viewScope?: import('@/lib/viewConfigStorage').ViewScope;
  onSave: (name: string, columns: string[], description: string, calculatedFields?: CalculatedFieldDef[], scope?: 'master' | 'list') => void;
  onCancel: () => void;
}

export default function ColumnPickerDialog({
  open,
  mode,
  availableColumns,
  initialView,
  isBuiltinView: isBuiltin,
  viewScope,
  onSave,
  onCancel,
}: ColumnPickerDialogProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState(0);
  const [name, setName] = useState(initialView?.name ?? '');
  const [description, setDescription] = useState(initialView?.description ?? '');
  const [activeColumnIds, setActiveColumnIds] = useState<string[]>(initialView?.columns ?? []);
  const [search, setSearch] = useState('');
  const [calcFields, setCalcFields] = useState<CalculatedFieldDef[]>(initialView?.calculatedFields ?? []);
  const [createScope, setCreateScope] = useState<'master' | 'list'>('master');
  const [editingCalcField, setEditingCalcField] = useState<CalculatedFieldDef | null>(null);
  const [showCalcEditor, setShowCalcEditor] = useState(false);

  // Reset state when dialog opens with new data
  const handleEntered = () => {
    setName(initialView?.name ?? '');
    setDescription(initialView?.description ?? '');
    setActiveColumnIds(initialView?.columns ?? []);
    setCalcFields(initialView?.calculatedFields ?? []);
    setSearch('');
    setShowCalcEditor(false);
    setEditingCalcField(null);
    setCreateScope('master');
    // Create mode → Settings tab first; Edit mode → Columns tab
    setTab(mode === 'create' ? 0 : 1);
  };

  // Group available columns by their group field, sorted by GROUP_ORDER
  const grouped = useMemo(() => {
    const groups = new Map<string, ColumnDefinition[]>();
    for (const col of availableColumns) {
      const existing = groups.get(col.group) ?? [];
      existing.push(col);
      groups.set(col.group, existing);
    }
    // Sort by GROUP_ORDER (known groups first, then unknown groups alphabetically)
    const sorted = new Map<string, ColumnDefinition[]>();
    for (const g of GROUP_ORDER) {
      const cols = groups.get(g);
      if (cols) {
        sorted.set(g, cols);
        groups.delete(g);
      }
    }
    // Append any groups not in GROUP_ORDER
    for (const [g, cols] of groups) {
      sorted.set(g, cols);
    }
    return sorted;
  }, [availableColumns]);

  // Filter available columns by search
  const filteredGroups = useMemo(() => {
    if (!search.trim()) return grouped;
    const lower = search.toLowerCase();
    const filtered = new Map<string, ColumnDefinition[]>();
    for (const [group, cols] of grouped) {
      const matching = cols.filter(
        c => c.label.toLowerCase().includes(lower) || group.toLowerCase().includes(lower),
      );
      if (matching.length > 0) filtered.set(group, matching);
    }
    return filtered;
  }, [grouped, search]);

  // Build ColumnDefinitions for this dialog's calculated fields
  const calcColumnDefs = useMemo(() => {
    const map = new Map<string, ColumnDefinition>();
    for (const cf of calcFields) {
      const id = `calc:${cf.id}`;
      map.set(id, {
        id,
        label: cf.label,
        source: 'calculated',
        group: 'Calculated',
        align: cf.align ?? 'right',
        isNumeric: true,
        calculatedField: cf,
      });
    }
    return map;
  }, [calcFields]);

  // Resolve active columns to their definitions (for the right panel)
  const activeColumns = useMemo(() => {
    const colMap = new Map(availableColumns.map(c => [c.id, c]));
    return activeColumnIds
      .map(id => colMap.get(id) ?? calcColumnDefs.get(id))
      .filter((c): c is ColumnDefinition => c !== undefined);
  }, [activeColumnIds, availableColumns, calcColumnDefs]);

  const activeSet = useMemo(() => new Set(activeColumnIds), [activeColumnIds]);

  const toggleColumn = (id: string) => {
    setActiveColumnIds(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id],
    );
  };

  const moveUp = (colId: string) => {
    setActiveColumnIds(prev => {
      const idx = prev.indexOf(colId);
      if (idx <= 0) return prev;
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  };

  const moveDown = (colId: string) => {
    setActiveColumnIds(prev => {
      const idx = prev.indexOf(colId);
      if (idx < 0 || idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  };

  const removeColumn = (id: string) => {
    setActiveColumnIds(prev => prev.filter(c => c !== id));
    // Also remove the calc field definition if it's a calculated column
    if (id.startsWith('calc:')) {
      const cfId = id.slice(5);
      setCalcFields(prev => prev.filter(f => f.id !== cfId));
    }
  };

  const SKIP_CONFIRM_KEY = 'xrefs_skip_view_save_confirm';
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const doSave = () => {
    const trimmedName = name.trim() || 'Untitled View';
    const scope = mode === 'create' ? createScope : (viewScope === 'master' ? 'master' : 'list');
    onSave(trimmedName, activeColumnIds, description.trim(), calcFields.length > 0 ? calcFields : undefined, scope);
  };

  const handleSave = () => {
    const isMasterEdit = mode === 'edit' && viewScope === 'master';
    // Always confirm for master views; for list views, respect "don't show again"
    if (mode === 'edit') {
      if (isMasterEdit || (typeof window !== 'undefined' && localStorage.getItem(SKIP_CONFIRM_KEY) !== 'true')) {
        setDontShowAgain(false);
        setConfirmOpen(true);
        return;
      }
    }
    doSave();
  };

  const handleConfirmSave = () => {
    if (dontShowAgain && typeof window !== 'undefined') {
      localStorage.setItem(SKIP_CONFIRM_KEY, 'true');
    }
    setConfirmOpen(false);
    doSave();
  };

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      maxWidth="md"
      fullWidth
      TransitionProps={{ onEntered: handleEntered }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        {mode === 'create' ? t('columnPicker.createTitle') : t('columnPicker.editTitle')}
      </DialogTitle>

      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 0, pt: '0 !important', height: 480 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{ borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}
        >
          <Tab label={t('columnPicker.settingsTab')} />
          <Tab label={t('columnPicker.columnsTab')} />
        </Tabs>

        {/* Settings tab */}
        {tab === 0 && (
          <Box sx={{ pt: 2.5, display: 'flex', flexDirection: 'column', gap: 2.5, flex: 1 }}>
            {/* Master view edit warning */}
            {mode === 'edit' && viewScope === 'master' && (
              <Alert severity="info" sx={{ py: 0.5 }}>
                {t('columnPicker.saveMasterConfirmMessage')}
              </Alert>
            )}

            <TextField
              label={t('columnPicker.viewNameLabel')}
              value={name}
              onChange={e => setName(e.target.value)}
              size="small"
              fullWidth
              disabled={isBuiltin}
            />
            <TextField
              label={t('columnPicker.descriptionLabel')}
              placeholder={t('columnPicker.descriptionPlaceholder')}
              value={description}
              onChange={e => setDescription(e.target.value)}
              size="small"
              fullWidth
              multiline
              minRows={3}
              maxRows={6}
            />

            {/* Scope toggle — create mode only */}
            {mode === 'create' && (
              <FormControl>
                <FormLabel sx={{ fontSize: '0.82rem', mb: 0.5 }}>View type</FormLabel>
                <RadioGroup
                  value={createScope}
                  onChange={(e) => setCreateScope(e.target.value as 'master' | 'list')}
                >
                  <FormControlLabel
                    value="master"
                    control={<Radio size="small" />}
                    label={<Typography variant="body2">{t('columnPicker.scopeMaster')}</Typography>}
                  />
                  <FormControlLabel
                    value="list"
                    control={<Radio size="small" />}
                    label={<Typography variant="body2">{t('columnPicker.scopeList')}</Typography>}
                  />
                </RadioGroup>
              </FormControl>
            )}
          </Box>
        )}

        {/* Columns tab */}
        {tab === 1 && (
          <Box sx={{ display: 'flex', gap: 2, flex: 1, overflow: 'hidden', pt: 2 }}>
            {/* Left panel: Available columns */}
            <Box
              sx={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                overflow: 'hidden',
              }}
            >
              <Box sx={{ p: 1, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <TextField
                    placeholder={t('columnPicker.searchPlaceholder')}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    size="small"
                    fullWidth
                    slotProps={{
                      input: {
                        startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary', fontSize: 18 }} />,
                      },
                    }}
                  />
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<AddIcon sx={{ fontSize: 16 }} />}
                    onClick={() => { setEditingCalcField(null); setShowCalcEditor(true); }}
                    sx={{ textTransform: 'none', whiteSpace: 'nowrap', flexShrink: 0, fontSize: '0.75rem' }}
                  >
                    Calculated
                  </Button>
                </Box>
              </Box>

              {/* Inline calc field editor (shown at top when active) */}
              {showCalcEditor && (
                <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider', flexShrink: 0, bgcolor: 'action.hover' }}>
                  <CalculatedFieldEditor
                    availableColumns={availableColumns}
                    existingField={editingCalcField ?? undefined}
                    onSave={(field) => {
                      const colId = `calc:${field.id}`;
                      if (editingCalcField) {
                        setCalcFields(prev => prev.map(f => f.id === field.id ? field : f));
                      } else {
                        setCalcFields(prev => [...prev, field]);
                        setActiveColumnIds(prev => [...prev, colId]);
                      }
                      setShowCalcEditor(false);
                      setEditingCalcField(null);
                    }}
                    onCancel={() => { setShowCalcEditor(false); setEditingCalcField(null); }}
                  />
                </Box>
              )}

              <Box sx={{ flex: 1, overflowY: 'auto', px: 1, py: 0.5 }}>
                {/* Calculated fields (shown first when any exist) */}
                {calcFields.length > 0 && (
                  <Box sx={{ mb: 1 }}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontWeight: 600, display: 'block', px: 1, pt: 1, pb: 0.5 }}
                    >
                      Calculated
                    </Typography>
                    {calcFields.map(cf => {
                      const colId = `calc:${cf.id}`;
                      return (
                        <ListItem
                          key={colId}
                          dense
                          disablePadding
                          sx={{ px: 1, py: 0, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' }, borderRadius: 1 }}
                          onClick={() => toggleColumn(colId)}
                        >
                          <ListItemIcon sx={{ minWidth: 32 }}>
                            <Checkbox
                              edge="start"
                              checked={activeSet.has(colId)}
                              size="small"
                              tabIndex={-1}
                              disableRipple
                            />
                          </ListItemIcon>
                          <ListItemText
                            primary={cf.label}
                            primaryTypographyProps={{ fontSize: '0.82rem' }}
                          />
                          <IconButton
                            size="small"
                            onClick={(e) => { e.stopPropagation(); setEditingCalcField(cf); setShowCalcEditor(true); }}
                            sx={{ p: 0.25 }}
                          >
                            <EditIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </ListItem>
                      );
                    })}
                  </Box>
                )}

                {Array.from(filteredGroups.entries()).map(([group, cols]) => (
                  <Box key={group} sx={{ mb: 1 }}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontWeight: 600, display: 'block', px: 1, pt: 1, pb: 0.5 }}
                    >
                      {group}
                    </Typography>
                    {cols.map(col => (
                      <ListItem
                        key={col.id}
                        dense
                        disablePadding
                        sx={{ px: 1, py: 0, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' }, borderRadius: 1 }}
                        onClick={() => toggleColumn(col.id)}
                      >
                        <ListItemIcon sx={{ minWidth: 32 }}>
                          <Checkbox
                            edge="start"
                            checked={activeSet.has(col.id)}
                            size="small"
                            tabIndex={-1}
                            disableRipple
                          />
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                              <span>{col.label}</span>
                              <SourceBadge dataSource={col.dataSource} />
                            </Box>
                          }
                          primaryTypographyProps={{ fontSize: '0.82rem' }}
                        />
                      </ListItem>
                    ))}
                  </Box>
                ))}
              </Box>
            </Box>

            {/* Right panel: Active columns (ordered) */}
            <Box
              sx={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                overflow: 'hidden',
              }}
            >
              <Box sx={{ p: 1, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                  {t('columnPicker.activeColumnsHeader', { count: activeColumns.length })}
                </Typography>
              </Box>
              <List dense sx={{ flex: 1, overflowY: 'auto', py: 0 }}>
                {activeColumns.map((col, index) => (
                  <ListItem
                    key={col.id}
                    dense
                    secondaryAction={
                      <Box sx={{ display: 'flex', gap: 0 }}>
                        {col.calculatedField && (
                          <IconButton
                            size="small"
                            onClick={() => { setEditingCalcField(col.calculatedField!); setShowCalcEditor(true); }}
                          >
                            <EditIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        )}
                        <IconButton
                          size="small"
                          onClick={() => moveUp(col.id)}
                          disabled={index === 0}
                        >
                          <ArrowUpwardIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => moveDown(col.id)}
                          disabled={index === activeColumns.length - 1}
                        >
                          <ArrowDownwardIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => removeColumn(col.id)}
                        >
                          <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Box>
                    }
                    sx={{ py: 0.5, pr: col.calculatedField ? 14 : 12 }}
                  >
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <span>{col.label || t('columnPicker.actionColumn')}</span>
                          <SourceBadge dataSource={col.dataSource} />
                        </Box>
                      }
                      secondary={col.group}
                      primaryTypographyProps={{ fontSize: '0.82rem' }}
                      secondaryTypographyProps={{ fontSize: '0.7rem' }}
                    />
                  </ListItem>
                ))}
                {activeColumns.length === 0 && (
                  <Box sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="body2" color="text.secondary">
                      {t('columnPicker.noColumnsSelected')}
                    </Typography>
                  </Box>
                )}
              </List>
            </Box>
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onCancel} color="inherit">{t('common.cancel')}</Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={activeColumnIds.length === 0}
        >
          {t('common.save')}
        </Button>
      </DialogActions>

      {/* Confirmation dialog for edit mode */}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ pb: 0.5 }}>{t('columnPicker.saveConfirmTitle')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {viewScope === 'master'
              ? t('columnPicker.saveMasterConfirmMessage')
              : t('columnPicker.saveConfirmMessage')}
          </Typography>
          {viewScope !== 'master' && (
            <FormControlLabel
              control={
                <Checkbox
                  checked={dontShowAgain}
                  onChange={e => setDontShowAgain(e.target.checked)}
                  size="small"
                />
              }
              label={t('columnPicker.dontShowAgain')}
              sx={{ mt: 1.5 }}
              slotProps={{ typography: { variant: 'body2' } }}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setConfirmOpen(false)}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={handleConfirmSave}>{t('common.save')}</Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
