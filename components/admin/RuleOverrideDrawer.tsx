'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Drawer,
  Typography,
  Stack,
  Button,
  IconButton,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Slider,
  Checkbox,
  FormControlLabel,
  Divider,
  Alert,
  Collapse,
  Chip,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import RestoreIcon from '@mui/icons-material/Restore';
import HistoryIcon from '@mui/icons-material/History';
import SendIcon from '@mui/icons-material/Send';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import UndoIcon from '@mui/icons-material/Undo';
import { useTranslation } from 'react-i18next';
import {
  MatchingRule,
  LogicType,
  ThresholdDirection,
  RuleOverrideRecord,
  RuleOverrideAction,
  RuleOverrideHistoryEntry,
  RuleAnnotation,
} from '@/lib/types';
import {
  createRuleOverride,
  updateRuleOverride,
  deleteRuleOverride,
  getRuleOverrideHistory,
  restoreRuleOverride,
  getRuleAnnotations,
  createRuleAnnotation,
  updateRuleAnnotation,
  deleteRuleAnnotation,
} from '@/lib/api';
import { typeLabels } from './logicConstants';

const LOGIC_TYPES: LogicType[] = [
  'identity', 'identity_range', 'identity_upgrade', 'identity_flag',
  'threshold', 'fit', 'application_review', 'operational', 'vref_check',
];

const THRESHOLD_DIRECTIONS: ThresholdDirection[] = ['gte', 'lte', 'range_superset'];

const DIRECTION_KEYS: Record<ThresholdDirection, string> = {
  gte: 'adminOverride.dirGte',
  lte: 'adminOverride.dirLte',
  range_superset: 'adminOverride.dirRangeSuperset',
};

/** Human-readable labels for snapshot fields */
const FIELD_LABELS: Record<string, string> = {
  weight: 'Weight',
  logic_type: 'Rule Type',
  threshold_direction: 'Direction',
  upgrade_hierarchy: 'Hierarchy',
  block_on_missing: 'Block on Missing',
  tolerance_percent: 'Tolerance %',
  engineering_reason: 'Engineering Reason',
  attribute_name: 'Attribute Name',
  sort_order: 'Sort Order',
  action: 'Action',
};

/** Format a value for display in diffs */
function formatDiffValue(val: unknown): string {
  if (val === null || val === undefined) return '\u2014';
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  if (Array.isArray(val)) return val.join(' > ');
  return String(val);
}

/** Compute field-level diffs between previous_values and current override */
function computeDiffs(
  previousValues: Record<string, unknown> | null | undefined,
  current: RuleOverrideHistoryEntry,
): Array<{ field: string; label: string; oldVal: string; newVal: string }> {
  if (!previousValues) return [];
  const diffs: Array<{ field: string; label: string; oldVal: string; newVal: string }> = [];

  // Map current record fields to snake_case for comparison
  const currentSnake: Record<string, unknown> = {
    weight: current.weight,
    logic_type: current.logicType,
    threshold_direction: current.thresholdDirection,
    upgrade_hierarchy: current.upgradeHierarchy,
    block_on_missing: current.blockOnMissing,
    tolerance_percent: current.tolerancePercent,
    engineering_reason: current.engineeringReason,
    attribute_name: current.attributeName,
    sort_order: current.sortOrder,
    action: current.action,
  };

  const allFields = new Set([
    ...Object.keys(previousValues).filter(k => k !== 'source'),
    ...Object.keys(currentSnake),
  ]);

  for (const field of allFields) {
    const oldVal = previousValues[field];
    const newVal = currentSnake[field];
    // Skip undefined/null on both sides
    if (oldVal === undefined && newVal === undefined) continue;
    if (oldVal === null && newVal === null) continue;
    // Compare stringified to handle arrays
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal) && newVal !== undefined) {
      diffs.push({
        field,
        label: FIELD_LABELS[field] ?? field,
        oldVal: formatDiffValue(oldVal),
        newVal: formatDiffValue(newVal),
      });
    }
  }

  return diffs;
}

/** Format relative time */
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface RuleOverrideDrawerProps {
  open: boolean;
  onClose: () => void;
  familyId: string;
  /** The base TS rule (null for "add new rule" mode) */
  baseRule: MatchingRule | null;
  /** Existing active override for this rule (null if none) */
  existingOverride: RuleOverrideRecord | null;
  onSaved: () => void;
}

export default function RuleOverrideDrawer({
  open,
  onClose,
  familyId,
  baseRule,
  existingOverride,
  onSaved,
}: RuleOverrideDrawerProps) {
  const { t } = useTranslation();
  const isAddMode = !baseRule;

  // Form state
  const [attributeId, setAttributeId] = useState('');
  const [attributeName, setAttributeName] = useState('');
  const [logicType, setLogicType] = useState<LogicType>('identity');
  const [weight, setWeight] = useState<number>(5);
  const [thresholdDirection, setThresholdDirection] = useState<ThresholdDirection | ''>('');
  const [upgradeHierarchy, setUpgradeHierarchy] = useState('');
  const [blockOnMissing, setBlockOnMissing] = useState(false);
  const [tolerancePercent, setTolerancePercent] = useState('');
  const [engineeringReason, setEngineeringReason] = useState('');
  const [changeReason, setChangeReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // History state
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<RuleOverrideHistoryEntry[]>([]);
  const [historyBaseRule, setHistoryBaseRule] = useState<MatchingRule | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Restore dialog
  const [restoreTarget, setRestoreTarget] = useState<RuleOverrideHistoryEntry | null>(null);
  const [restoreReason, setRestoreReason] = useState('');
  const [restoring, setRestoring] = useState(false);

  // Annotations state
  const [annotationsOpen, setAnnotationsOpen] = useState(false);
  const [annotations, setAnnotations] = useState<RuleAnnotation[]>([]);
  const [annotationsLoading, setAnnotationsLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [addingComment, setAddingComment] = useState(false);
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState('');
  const [showResolved, setShowResolved] = useState(false);

  // Reset form when drawer opens with new rule
  useEffect(() => {
    if (!open) return;
    setError(null);
    setChangeReason(existingOverride?.changeReason ?? '');
    setHistoryOpen(false);
    setHistoryEntries([]);
    setAnnotations([]);
    setShowResolved(false);
    // Annotations: eagerly fetch and auto-expand if any exist
    if (!isAddMode && baseRule) {
      setAnnotationsLoading(true);
      getRuleAnnotations(familyId, baseRule.attributeId).then(data => {
        setAnnotations(data);
        setAnnotationsOpen(data.some(a => !a.isResolved));
      }).finally(() => setAnnotationsLoading(false));
    } else {
      setAnnotationsOpen(false);
    }

    if (isAddMode) {
      setAttributeId('');
      setAttributeName('');
      setLogicType('identity');
      setWeight(5);
      setThresholdDirection('');
      setUpgradeHierarchy('');
      setBlockOnMissing(false);
      setTolerancePercent('');
      setEngineeringReason('');
    } else {
      // Populate from override (if exists) or base rule
      const ov = existingOverride;
      setAttributeId(baseRule.attributeId);
      setAttributeName(ov?.attributeName ?? baseRule.attributeName);
      setLogicType(ov?.logicType ?? baseRule.logicType);
      setWeight(ov?.weight ?? baseRule.weight);
      setThresholdDirection(ov?.thresholdDirection ?? baseRule.thresholdDirection ?? '');
      setUpgradeHierarchy(
        (ov?.upgradeHierarchy ?? baseRule.upgradeHierarchy)?.join(', ') ?? '',
      );
      setBlockOnMissing(ov?.blockOnMissing ?? baseRule.blockOnMissing ?? false);
      setTolerancePercent(
        String(ov?.tolerancePercent ?? baseRule.tolerancePercent ?? ''),
      );
      setEngineeringReason(ov?.engineeringReason ?? baseRule.engineeringReason);
    }
  }, [open, baseRule, existingOverride, isAddMode]);

  // Fetch history when section is expanded
  useEffect(() => {
    if (!historyOpen || isAddMode || !baseRule) return;
    setHistoryLoading(true);
    getRuleOverrideHistory(familyId, baseRule.attributeId).then(({ baseRule: br, history }) => {
      setHistoryEntries(history);
      setHistoryBaseRule(br);
    }).finally(() => setHistoryLoading(false));
  }, [historyOpen, familyId, baseRule, isAddMode]);

  // No lazy-fetch effect needed — annotations are fetched eagerly on drawer open

  const needsDirection = logicType === 'threshold' || logicType === 'fit';
  const needsHierarchy = logicType === 'identity_upgrade';
  const needsTolerance = logicType === 'identity';

  const handleSave = useCallback(async () => {
    if (!changeReason.trim()) {
      setError(t('adminOverride.changeReasonRequired'));
      return;
    }
    setSaving(true);
    setError(null);

    try {
      const action: RuleOverrideAction = isAddMode ? 'add' : 'modify';
      const hierarchy = upgradeHierarchy
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      const data = {
        familyId,
        attributeId: isAddMode ? attributeId : baseRule!.attributeId,
        action,
        weight,
        logicType,
        ...(needsDirection && thresholdDirection ? { thresholdDirection: thresholdDirection as ThresholdDirection } : {}),
        ...(needsHierarchy && hierarchy.length > 0 ? { upgradeHierarchy: hierarchy } : {}),
        blockOnMissing,
        ...(needsTolerance && tolerancePercent ? { tolerancePercent: parseFloat(tolerancePercent) } : {}),
        engineeringReason,
        ...(isAddMode ? { attributeName } : {}),
        changeReason: changeReason.trim(),
      };

      if (existingOverride) {
        const ok = await updateRuleOverride(existingOverride.id, data);
        if (!ok) throw new Error('Update failed');
      } else {
        const result = await createRuleOverride(data);
        if (!result) throw new Error('Create failed');
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [
    familyId, baseRule, isAddMode, existingOverride,
    attributeId, attributeName, logicType, weight, thresholdDirection,
    upgradeHierarchy, blockOnMissing, tolerancePercent, engineeringReason,
    changeReason, needsDirection, needsHierarchy, needsTolerance,
    onSaved, onClose, t,
  ]);

  const handleRevert = useCallback(async () => {
    if (!existingOverride) return;
    setSaving(true);
    setError(null);
    try {
      const ok = await deleteRuleOverride(existingOverride.id);
      if (!ok) throw new Error('Delete failed');
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Revert failed');
    } finally {
      setSaving(false);
    }
  }, [existingOverride, onSaved, onClose]);

  const handleRemoveRule = useCallback(async () => {
    if (!baseRule || !changeReason.trim()) {
      setError(t('adminOverride.removeReasonRequired'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await createRuleOverride({
        familyId,
        attributeId: baseRule.attributeId,
        action: 'remove',
        changeReason: changeReason.trim(),
      });
      if (!result) throw new Error('Remove failed');
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remove failed');
    } finally {
      setSaving(false);
    }
  }, [familyId, baseRule, changeReason, onSaved, onClose, t]);

  // ── Restore handlers ─────────────────────────────────────────

  const handleRestoreConfirm = useCallback(async () => {
    if (!restoreTarget || !restoreReason.trim()) return;
    setRestoring(true);
    try {
      const ok = await restoreRuleOverride(restoreTarget.id, restoreReason.trim());
      if (!ok) throw new Error('Restore failed');
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed');
    } finally {
      setRestoring(false);
      setRestoreTarget(null);
      setRestoreReason('');
    }
  }, [restoreTarget, restoreReason, onSaved, onClose]);

  // ── Annotation handlers ──────────────────────────────────────

  const handleAddComment = useCallback(async () => {
    if (!newComment.trim() || !baseRule) return;
    setAddingComment(true);
    try {
      const annotation = await createRuleAnnotation(familyId, baseRule.attributeId, newComment.trim());
      if (annotation) {
        setAnnotations(prev => [annotation, ...prev]);
        setNewComment('');
        onSaved(); // refresh badge counts in LogicPanel
      }
    } finally {
      setAddingComment(false);
    }
  }, [newComment, familyId, baseRule, onSaved]);

  const handleResolveAnnotation = useCallback(async (id: string, isResolved: boolean) => {
    const ok = await updateRuleAnnotation(id, { isResolved });
    if (ok) {
      setAnnotations(prev => prev.map(a =>
        a.id === id ? { ...a, isResolved } : a,
      ));
      onSaved(); // refresh badge counts in LogicPanel
    }
  }, [onSaved]);

  const handleDeleteAnnotation = useCallback(async (id: string) => {
    const ok = await deleteRuleAnnotation(id);
    if (ok) {
      setAnnotations(prev => prev.filter(a => a.id !== id));
      onSaved(); // refresh badge counts in LogicPanel
    }
  }, [onSaved]);

  const handleEditAnnotation = useCallback(async (id: string) => {
    if (!editingBody.trim()) return;
    const ok = await updateRuleAnnotation(id, { body: editingBody.trim() });
    if (ok) {
      setAnnotations(prev => prev.map(a =>
        a.id === id ? { ...a, body: editingBody.trim() } : a,
      ));
      setEditingAnnotationId(null);
      setEditingBody('');
    }
  }, [editingBody]);

  const unresolvedAnnotations = annotations.filter(a => !a.isResolved);
  const resolvedAnnotations = annotations.filter(a => a.isResolved);

  return (
    <>
      <Drawer
        anchor="right"
        open={open}
        onClose={onClose}
        PaperProps={{ sx: { width: 480, bgcolor: 'background.default' } }}
      >
        <Box sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
          {/* Header */}
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
            <Typography variant="h6">
              {isAddMode ? t('adminOverride.addRule') : t('adminOverride.editRule', { name: baseRule?.attributeName })}
            </Typography>
            <IconButton onClick={onClose} size="small">
              <CloseIcon />
            </IconButton>
          </Stack>

          {/* Base value indicator */}
          {!isAddMode && baseRule && (
            <Alert severity="info" sx={{ mb: 2, py: 0.5 }}>
              {t('adminOverride.baseInfo', { type: typeLabels[baseRule.logicType], weight: baseRule.weight })}
              {existingOverride && ` ${t('adminOverride.overrideActive')}`}
            </Alert>
          )}

          {/* Form */}
          <Box sx={{ flex: 1, overflow: 'auto', pt: 1 }}>
            <Stack spacing={2.5}>
              {/* Attribute ID (only for add mode) */}
              {isAddMode && (
                <>
                  <TextField
                    label={t('adminOverride.attributeId')}
                    value={attributeId}
                    onChange={e => setAttributeId(e.target.value)}
                    size="small"
                    fullWidth
                    placeholder={t('adminOverride.placeholderAttrId')}
                  />
                  <TextField
                    label={t('adminOverride.attributeName')}
                    value={attributeName}
                    onChange={e => setAttributeName(e.target.value)}
                    size="small"
                    fullWidth
                    placeholder={t('adminOverride.placeholderAttrName')}
                  />
                </>
              )}

              {/* Logic Type */}
              <FormControl size="small" fullWidth>
                <InputLabel>{t('adminOverride.ruleType')}</InputLabel>
                <Select
                  value={logicType}
                  label={t('adminOverride.ruleType')}
                  onChange={e => setLogicType(e.target.value as LogicType)}
                >
                  {LOGIC_TYPES.map(lt => (
                    <MenuItem key={lt} value={lt}>{typeLabels[lt]}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Weight */}
              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {t('adminOverride.weightLabel', { weight })}
                </Typography>
                <Slider
                  value={weight}
                  onChange={(_, v) => setWeight(v as number)}
                  min={0}
                  max={10}
                  step={1}
                  marks
                  valueLabelDisplay="auto"
                  size="small"
                />
              </Box>

              {/* Threshold Direction (conditional) */}
              {needsDirection && (
                <FormControl size="small" fullWidth>
                  <InputLabel>{t('adminOverride.direction')}</InputLabel>
                  <Select
                    value={thresholdDirection}
                    label={t('adminOverride.direction')}
                    onChange={e => setThresholdDirection(e.target.value as ThresholdDirection)}
                  >
                    {THRESHOLD_DIRECTIONS.map(d => (
                      <MenuItem key={d} value={d}>{t(DIRECTION_KEYS[d])}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}

              {/* Upgrade Hierarchy (conditional) */}
              {needsHierarchy && (
                <TextField
                  label={t('adminOverride.upgradeHierarchy')}
                  value={upgradeHierarchy}
                  onChange={e => setUpgradeHierarchy(e.target.value)}
                  size="small"
                  fullWidth
                  placeholder={t('adminOverride.upgradeHierarchyPlaceholder')}
                  helperText={t('adminOverride.upgradeHierarchyHelper')}
                />
              )}

              {/* Tolerance Percent (conditional) */}
              {needsTolerance && (
                <TextField
                  label={t('adminOverride.tolerancePercent')}
                  value={tolerancePercent}
                  onChange={e => setTolerancePercent(e.target.value)}
                  size="small"
                  fullWidth
                  type="number"
                  placeholder={t('adminOverride.placeholderTolerance')}
                />
              )}

              {/* Block on Missing */}
              <FormControlLabel
                control={
                  <Checkbox
                    checked={blockOnMissing}
                    onChange={e => setBlockOnMissing(e.target.checked)}
                    size="small"
                  />
                }
                label={
                  <Typography variant="body2">
                    {t('adminOverride.blockOnMissing')}
                  </Typography>
                }
              />

              {/* Engineering Reason */}
              <TextField
                label={t('adminOverride.engineeringReason')}
                value={engineeringReason}
                onChange={e => setEngineeringReason(e.target.value)}
                size="small"
                fullWidth
                multiline
                rows={3}
              />

              <Divider />

              {/* Change Reason (required) */}
              <TextField
                label={t('adminOverride.changeReason')}
                value={changeReason}
                onChange={e => setChangeReason(e.target.value)}
                size="small"
                fullWidth
                multiline
                rows={2}
                required
                error={!!error && !changeReason.trim()}
                placeholder={t('adminOverride.changeReasonPlaceholder')}
              />

              {/* ── Annotations Section ──────────────────────── */}
              {!isAddMode && baseRule && (
                <>
                  <Divider />
                  <Box
                    onClick={() => setAnnotationsOpen(!annotationsOpen)}
                    sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
                  >
                    {unresolvedAnnotations.length > 0 ? (
                      <Box sx={{
                        width: 18, height: 18, borderRadius: '50%', bgcolor: '#FF5252',
                        color: '#fff', fontSize: '0.65rem', fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        mr: 1, flexShrink: 0, lineHeight: 1,
                      }}>
                        {unresolvedAnnotations.length}
                      </Box>
                    ) : (
                      <Box sx={{ width: 18, height: 18, mr: 1 }} />
                    )}
                    <Typography variant="subtitle2" sx={{ flex: 1 }}>
                      {t('adminOverride.annotations', 'Annotations')}
                    </Typography>
                    {annotationsOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  </Box>
                  <Collapse in={annotationsOpen}>
                    <Stack spacing={1.5} sx={{ mt: 1 }}>
                      {annotationsLoading ? (
                        <Box sx={{ textAlign: 'center', py: 2 }}>
                          <CircularProgress size={20} />
                        </Box>
                      ) : (
                        <>
                          {/* Add comment — always at top */}
                          <Stack direction="row" spacing={1} alignItems="flex-end">
                            <TextField
                              value={newComment}
                              onChange={e => setNewComment(e.target.value)}
                              placeholder={t('adminOverride.addAnnotation', 'Add a comment...')}
                              size="small"
                              fullWidth
                              multiline
                              maxRows={3}
                              onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  handleAddComment();
                                }
                              }}
                            />
                            <IconButton
                              onClick={handleAddComment}
                              disabled={!newComment.trim() || addingComment}
                              size="small"
                              color="primary"
                            >
                              <SendIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                          </Stack>

                          {/* Unresolved annotations */}
                          {unresolvedAnnotations.map(a => (
                            <AnnotationCard
                              key={a.id}
                              annotation={a}
                              isEditing={editingAnnotationId === a.id}
                              editingBody={editingBody}
                              onStartEdit={() => { setEditingAnnotationId(a.id); setEditingBody(a.body); }}
                              onCancelEdit={() => { setEditingAnnotationId(null); setEditingBody(''); }}
                              onSaveEdit={() => handleEditAnnotation(a.id)}
                              onEditBodyChange={setEditingBody}
                              onResolve={() => handleResolveAnnotation(a.id, true)}
                              onDelete={() => handleDeleteAnnotation(a.id)}
                            />
                          ))}

                          {/* Resolved toggle */}
                          {resolvedAnnotations.length > 0 && (
                            <Button
                              size="small"
                              onClick={() => setShowResolved(!showResolved)}
                              sx={{ textTransform: 'none', alignSelf: 'flex-start', fontSize: '0.75rem' }}
                            >
                              {showResolved
                                ? t('adminOverride.hideResolved', 'Hide resolved')
                                : t('adminOverride.showResolved', { count: resolvedAnnotations.length, defaultValue: `Show ${resolvedAnnotations.length} resolved` })}
                            </Button>
                          )}
                          <Collapse in={showResolved}>
                            <Stack spacing={1.5}>
                              {resolvedAnnotations.map(a => (
                                <AnnotationCard
                                  key={a.id}
                                  annotation={a}
                                  isEditing={editingAnnotationId === a.id}
                                  editingBody={editingBody}
                                  onStartEdit={() => { setEditingAnnotationId(a.id); setEditingBody(a.body); }}
                                  onCancelEdit={() => { setEditingAnnotationId(null); setEditingBody(''); }}
                                  onSaveEdit={() => handleEditAnnotation(a.id)}
                                  onEditBodyChange={setEditingBody}
                                  onResolve={() => handleResolveAnnotation(a.id, false)}
                                  onDelete={() => handleDeleteAnnotation(a.id)}
                                />
                              ))}
                            </Stack>
                          </Collapse>
                        </>
                      )}
                    </Stack>
                  </Collapse>
                </>
              )}

              {/* ── History Section ──────────────────────────── */}
              {!isAddMode && baseRule && (
                <>
                  <Divider />
                  <Box
                    onClick={() => setHistoryOpen(!historyOpen)}
                    sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
                  >
                    <HistoryIcon sx={{ fontSize: 18, mr: 1, color: 'text.secondary' }} />
                    <Typography variant="subtitle2" sx={{ flex: 1 }}>
                      {t('adminOverride.changeHistory', 'Change History')}
                      {historyEntries.length > 0 && (
                        <Chip
                          label={historyEntries.length}
                          size="small"
                          variant="outlined"
                          sx={{ ml: 1, height: 18, fontSize: '0.7rem' }}
                        />
                      )}
                    </Typography>
                    {historyOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  </Box>
                  <Collapse in={historyOpen}>
                    <Stack spacing={0} sx={{ mt: 1 }}>
                      {historyLoading ? (
                        <Box sx={{ textAlign: 'center', py: 2 }}>
                          <CircularProgress size={20} />
                        </Box>
                      ) : historyEntries.length === 0 ? (
                        <Typography variant="caption" color="text.secondary" sx={{ py: 1 }}>
                          {t('adminOverride.noHistory', 'No changes recorded yet.')}
                        </Typography>
                      ) : (
                        <>
                          {historyEntries.map((entry, idx) => {
                            const diffs = computeDiffs(entry.previousValues, entry);
                            return (
                              <Box
                                key={entry.id}
                                sx={{
                                  py: 1.5,
                                  pl: 2,
                                  borderLeft: 2,
                                  borderColor: entry.isActive ? 'primary.main' : 'divider',
                                  ...(idx < historyEntries.length - 1 && { borderBottom: 1, borderBottomColor: 'divider' }),
                                }}
                              >
                                <Stack direction="row" alignItems="center" justifyContent="space-between">
                                  <Typography variant="caption" sx={{ fontWeight: 500 }}>
                                    {entry.createdByName}
                                    <Typography component="span" variant="caption" color="text.secondary">
                                      {' \u2014 '}{relativeTime(entry.createdAt)}
                                    </Typography>
                                    {entry.isActive && (
                                      <Chip label="Active" size="small" color="primary" sx={{ ml: 1, height: 16, fontSize: '0.65rem' }} />
                                    )}
                                  </Typography>
                                  {!entry.isActive && (
                                    <IconButton
                                      size="small"
                                      onClick={() => { setRestoreTarget(entry); setRestoreReason(''); }}
                                      sx={{ opacity: 0.6, '&:hover': { opacity: 1 } }}
                                    >
                                      <UndoIcon sx={{ fontSize: 16 }} />
                                    </IconButton>
                                  )}
                                </Stack>
                                <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic', display: 'block', mt: 0.5 }}>
                                  {entry.changeReason}
                                </Typography>
                                {diffs.length > 0 ? (
                                  <Box sx={{ mt: 0.75, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                    {diffs.map(d => (
                                      <Chip
                                        key={d.field}
                                        label={`${d.label}: ${d.oldVal} \u2192 ${d.newVal}`}
                                        size="small"
                                        variant="outlined"
                                        sx={{ height: 20, fontSize: '0.68rem' }}
                                      />
                                    ))}
                                  </Box>
                                ) : entry.previousValues ? null : (
                                  <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: 'block' }}>
                                    {t('adminOverride.preAudit', 'Pre-audit change')}
                                  </Typography>
                                )}
                              </Box>
                            );
                          })}

                          {/* Original TS base entry */}
                          {historyBaseRule && (
                            <Box sx={{ py: 1.5, pl: 2, borderLeft: 2, borderColor: 'text.disabled' }}>
                              <Typography variant="caption" sx={{ fontWeight: 500, color: 'text.secondary' }}>
                                {t('adminOverride.tsBase', 'Original (TS Base)')}
                              </Typography>
                              <Box sx={{ mt: 0.5, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                <Chip
                                  label={`${typeLabels[historyBaseRule.logicType]} \u00b7 w${historyBaseRule.weight}`}
                                  size="small"
                                  variant="outlined"
                                  sx={{ height: 20, fontSize: '0.68rem', color: 'text.secondary' }}
                                />
                              </Box>
                            </Box>
                          )}
                        </>
                      )}
                    </Stack>
                  </Collapse>
                </>
              )}
            </Stack>
          </Box>

          {/* Error */}
          {error && (
            <Alert severity="error" sx={{ mt: 2, py: 0.5 }}>
              {error}
            </Alert>
          )}

          {/* Actions */}
          <Stack direction="row" spacing={1} sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: 'divider' }}>
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={saving}
              sx={{ flex: 1 }}
            >
              {saving ? t('adminOverride.saving') : existingOverride ? t('adminOverride.updateOverride') : t('adminOverride.saveOverride')}
            </Button>

            {existingOverride && (
              <Button
                variant="outlined"
                color="warning"
                onClick={handleRevert}
                disabled={saving}
                startIcon={<RestoreIcon />}
              >
                {t('adminOverride.revert')}
              </Button>
            )}

            {!isAddMode && !existingOverride && (
              <Button
                variant="outlined"
                color="error"
                onClick={handleRemoveRule}
                disabled={saving}
                size="small"
              >
                {t('adminOverride.remove')}
              </Button>
            )}
          </Stack>
        </Box>
      </Drawer>

      {/* Restore Confirmation Dialog */}
      <Dialog
        open={!!restoreTarget}
        onClose={() => { setRestoreTarget(null); setRestoreReason(''); }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{t('adminOverride.restoreTitle', 'Restore Version')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('adminOverride.restoreDesc', 'This will create a new override with the values from the selected version.')}
          </Typography>
          <TextField
            label={t('adminOverride.restoreReason', 'Reason for restoring')}
            value={restoreReason}
            onChange={e => setRestoreReason(e.target.value)}
            size="small"
            fullWidth
            multiline
            rows={2}
            autoFocus
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setRestoreTarget(null); setRestoreReason(''); }}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            onClick={handleRestoreConfirm}
            disabled={!restoreReason.trim() || restoring}
            variant="contained"
          >
            {restoring ? t('adminOverride.restoring', 'Restoring...') : t('adminOverride.restore', 'Restore')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

// ── Annotation Card Component ───────────────────────────────

interface AnnotationCardProps {
  annotation: RuleAnnotation;
  isEditing: boolean;
  editingBody: string;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onEditBodyChange: (body: string) => void;
  onResolve: () => void;
  onDelete: () => void;
}

function AnnotationCard({
  annotation,
  isEditing,
  editingBody,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onEditBodyChange,
  onResolve,
  onDelete,
}: AnnotationCardProps) {
  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: 1,
        bgcolor: annotation.isResolved ? 'action.hover' : 'background.paper',
        border: 1,
        borderColor: annotation.isResolved ? 'divider' : 'action.focus',
        opacity: annotation.isResolved ? 0.7 : 1,
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
        <Typography variant="caption" sx={{ fontWeight: 500 }}>
          {annotation.createdByName}
          <Typography component="span" variant="caption" color="text.secondary">
            {' \u2014 '}{relativeTime(annotation.createdAt)}
          </Typography>
        </Typography>
        <Stack direction="row" spacing={0}>
          <IconButton size="small" onClick={onStartEdit} sx={{ opacity: 0.5, '&:hover': { opacity: 1 } }}>
            <EditOutlinedIcon sx={{ fontSize: 14 }} />
          </IconButton>
          <IconButton
            size="small"
            onClick={onResolve}
            sx={{ opacity: 0.5, '&:hover': { opacity: 1 } }}
            color={annotation.isResolved ? 'default' : 'success'}
          >
            <CheckCircleOutlineIcon sx={{ fontSize: 14 }} />
          </IconButton>
          <IconButton size="small" onClick={onDelete} sx={{ opacity: 0.5, '&:hover': { opacity: 1 } }} color="error">
            <DeleteOutlineIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Stack>
      </Stack>
      {isEditing ? (
        <Stack spacing={1}>
          <TextField
            value={editingBody}
            onChange={e => onEditBodyChange(e.target.value)}
            size="small"
            fullWidth
            multiline
            maxRows={4}
            autoFocus
          />
          <Stack direction="row" spacing={1}>
            <Button size="small" variant="contained" onClick={onSaveEdit} disabled={!editingBody.trim()}>
              Save
            </Button>
            <Button size="small" onClick={onCancelEdit}>Cancel</Button>
          </Stack>
        </Stack>
      ) : (
        <Typography variant="body2" sx={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>
          {annotation.body}
        </Typography>
      )}
      {annotation.isResolved && annotation.resolvedByName && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block', fontStyle: 'italic' }}>
          Resolved by {annotation.resolvedByName}
        </Typography>
      )}
    </Box>
  );
}
