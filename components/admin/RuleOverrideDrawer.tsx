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
import { useTranslation } from 'react-i18next';
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

const THRESHOLD_DIRECTIONS: ThresholdDirection[] = ['gte', 'lte', 'range_superset'];

const DIRECTION_KEYS: Record<ThresholdDirection, string> = {
  gte: 'adminOverride.dirGte',
  lte: 'adminOverride.dirLte',
  range_superset: 'adminOverride.dirRangeSuperset',
};

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
        <Box sx={{ flex: 1, overflow: 'auto' }}>
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
  );
}
