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
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import RestoreIcon from '@mui/icons-material/Restore';
import {
  MatchingRule,
  LogicType,
  ThresholdDirection,
  RuleOverrideRecord,
  RuleOverrideAction,
} from '@/lib/types';
import { createRuleOverride, updateRuleOverride, deleteRuleOverride } from '@/lib/api';
import { typeLabels } from './logicConstants';

const LOGIC_TYPES: LogicType[] = [
  'identity', 'identity_range', 'identity_upgrade', 'identity_flag',
  'threshold', 'fit', 'application_review', 'operational', 'vref_check',
];

const THRESHOLD_DIRECTIONS: { value: ThresholdDirection; label: string }[] = [
  { value: 'gte', label: 'Replacement \u2265 Original' },
  { value: 'lte', label: 'Replacement \u2264 Original' },
  { value: 'range_superset', label: 'Replacement range \u2287 Original' },
];

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

  // Reset form when drawer opens with new rule
  useEffect(() => {
    if (!open) return;
    setError(null);
    setChangeReason(existingOverride?.changeReason ?? '');

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

  const needsDirection = logicType === 'threshold' || logicType === 'fit';
  const needsHierarchy = logicType === 'identity_upgrade';
  const needsTolerance = logicType === 'identity';

  const handleSave = useCallback(async () => {
    if (!changeReason.trim()) {
      setError('Please provide a reason for this change.');
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
    onSaved, onClose,
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
      setError('Please provide a reason for removing this rule.');
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
  }, [familyId, baseRule, changeReason, onSaved, onClose]);

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: 460, bgcolor: 'background.default' } }}
    >
      <Box sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
          <Typography variant="h6">
            {isAddMode ? 'Add Rule' : `Edit: ${baseRule?.attributeName}`}
          </Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Stack>

        {/* Base value indicator */}
        {!isAddMode && baseRule && (
          <Alert severity="info" sx={{ mb: 2, py: 0.5 }}>
            Base: {typeLabels[baseRule.logicType]}, weight {baseRule.weight}
            {existingOverride && ' — override active'}
          </Alert>
        )}

        {/* Form */}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          <Stack spacing={2.5}>
            {/* Attribute ID (only for add mode) */}
            {isAddMode && (
              <>
                <TextField
                  label="Attribute ID"
                  value={attributeId}
                  onChange={e => setAttributeId(e.target.value)}
                  size="small"
                  fullWidth
                  placeholder="e.g. new_parameter"
                />
                <TextField
                  label="Attribute Name"
                  value={attributeName}
                  onChange={e => setAttributeName(e.target.value)}
                  size="small"
                  fullWidth
                  placeholder="e.g. New Parameter"
                />
              </>
            )}

            {/* Logic Type */}
            <FormControl size="small" fullWidth>
              <InputLabel>Rule Type</InputLabel>
              <Select
                value={logicType}
                label="Rule Type"
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
                Weight: {weight}
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
                <InputLabel>Direction</InputLabel>
                <Select
                  value={thresholdDirection}
                  label="Direction"
                  onChange={e => setThresholdDirection(e.target.value as ThresholdDirection)}
                >
                  {THRESHOLD_DIRECTIONS.map(d => (
                    <MenuItem key={d.value} value={d.value}>{d.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            {/* Upgrade Hierarchy (conditional) */}
            {needsHierarchy && (
              <TextField
                label="Upgrade Hierarchy"
                value={upgradeHierarchy}
                onChange={e => setUpgradeHierarchy(e.target.value)}
                size="small"
                fullWidth
                placeholder="Best, Good, Acceptable (comma-separated, best first)"
                helperText="Comma-separated list, best option first"
              />
            )}

            {/* Tolerance Percent (conditional) */}
            {needsTolerance && (
              <TextField
                label="Tolerance %"
                value={tolerancePercent}
                onChange={e => setTolerancePercent(e.target.value)}
                size="small"
                fullWidth
                type="number"
                placeholder="e.g. 10"
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
                  Block on missing data (fail instead of review)
                </Typography>
              }
            />

            {/* Engineering Reason */}
            <TextField
              label="Engineering Reason"
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
              label="Why are you making this change?"
              value={changeReason}
              onChange={e => setChangeReason(e.target.value)}
              size="small"
              fullWidth
              multiline
              rows={2}
              required
              error={!!error && !changeReason.trim()}
              placeholder="Required — explain why this override is needed"
            />
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
            {saving ? 'Saving...' : existingOverride ? 'Update Override' : 'Save Override'}
          </Button>

          {existingOverride && (
            <Button
              variant="outlined"
              color="warning"
              onClick={handleRevert}
              disabled={saving}
              startIcon={<RestoreIcon />}
            >
              Revert
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
              Remove
            </Button>
          )}
        </Stack>
      </Box>
    </Drawer>
  );
}
