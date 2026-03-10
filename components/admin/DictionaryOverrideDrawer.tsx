'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Drawer,
  Typography,
  Stack,
  Button,
  IconButton,
  TextField,
  Divider,
  Alert,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import RestoreIcon from '@mui/icons-material/Restore';
import { AtlasDictOverrideRecord } from '@/lib/types';
import {
  createAtlasDictOverride,
  updateAtlasDictOverride,
  deleteAtlasDictOverride,
} from '@/lib/api';

interface DictEntry {
  paramName: string;
  attributeId: string;
  attributeName: string;
  unit?: string;
  sortOrder: number;
}

interface DictionaryOverrideDrawerProps {
  open: boolean;
  onClose: () => void;
  familyId: string;
  /** The base dictionary entry (null for add mode) */
  baseEntry: DictEntry | null;
  /** Existing active override (null if none) */
  existingOverride: AtlasDictOverrideRecord | null;
  /** Whether we're adding a new mapping */
  isAddMode: boolean;
  /** Pre-filled param name for add mode (from unmapped list) */
  addParamName: string;
  onSaved: () => void;
}

export default function DictionaryOverrideDrawer({
  open,
  onClose,
  familyId,
  baseEntry,
  existingOverride,
  isAddMode,
  addParamName,
  onSaved,
}: DictionaryOverrideDrawerProps) {
  const { t } = useTranslation();

  // Form state
  const [paramName, setParamName] = useState('');
  const [attributeId, setAttributeId] = useState('');
  const [attributeName, setAttributeName] = useState('');
  const [unit, setUnit] = useState('');
  const [sortOrder, setSortOrder] = useState('');
  const [changeReason, setChangeReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when drawer opens
  useEffect(() => {
    if (!open) return;
    setError(null);
    setChangeReason(existingOverride?.changeReason ?? '');

    if (isAddMode) {
      setParamName(addParamName);
      setAttributeId('');
      setAttributeName('');
      setUnit('');
      setSortOrder('50');
    } else if (baseEntry) {
      // Populate from override (if exists) or base entry
      const ov = existingOverride;
      setParamName(baseEntry.paramName);
      setAttributeId(ov?.attributeId ?? baseEntry.attributeId);
      setAttributeName(ov?.attributeName ?? baseEntry.attributeName);
      setUnit(ov?.unit ?? baseEntry.unit ?? '');
      setSortOrder(String(ov?.sortOrder ?? baseEntry.sortOrder));
    }
  }, [open, baseEntry, existingOverride, isAddMode, addParamName]);

  const handleSave = useCallback(async () => {
    if (!changeReason.trim()) {
      setError(t('adminOverride.changeReasonRequired'));
      return;
    }
    if (!paramName.trim()) {
      setError(t('adminOverride.paramNameRequired'));
      return;
    }
    if (!attributeId.trim()) {
      setError(t('adminOverride.attributeIdRequired'));
      return;
    }
    if (!attributeName.trim()) {
      setError(t('adminOverride.attributeNameRequired'));
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const data: Record<string, unknown> = {
        familyId,
        paramName: paramName.toLowerCase().trim(),
        action: isAddMode ? 'add' : 'modify',
        attributeId: attributeId.trim(),
        attributeName: attributeName.trim(),
        unit: unit.trim() || undefined,
        sortOrder: sortOrder ? parseInt(sortOrder, 10) : undefined,
        changeReason: changeReason.trim(),
      };

      if (existingOverride) {
        const ok = await updateAtlasDictOverride(existingOverride.id, data);
        if (!ok) throw new Error('Update failed');
      } else {
        const result = await createAtlasDictOverride(data);
        if (!result) throw new Error('Create failed');
      }

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [
    familyId, paramName, attributeId, attributeName, unit, sortOrder,
    changeReason, isAddMode, existingOverride, onSaved,
  ]);

  const handleRevert = useCallback(async () => {
    if (!existingOverride) return;
    setSaving(true);
    setError(null);
    try {
      const ok = await deleteAtlasDictOverride(existingOverride.id);
      if (!ok) throw new Error('Revert failed');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Revert failed');
    } finally {
      setSaving(false);
    }
  }, [existingOverride, onSaved]);

  const handleRemoveMapping = useCallback(async () => {
    if (!baseEntry || !changeReason.trim()) {
      setError(t('adminOverride.removeMappingReasonRequired'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await createAtlasDictOverride({
        familyId,
        paramName: baseEntry.paramName,
        action: 'remove',
        changeReason: changeReason.trim(),
      });
      if (!result) throw new Error('Remove failed');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remove failed');
    } finally {
      setSaving(false);
    }
  }, [familyId, baseEntry, changeReason, onSaved]);

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: 420, bgcolor: 'background.default' } }}
    >
      <Box sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
          <Typography variant="h6">
            {isAddMode ? t('adminOverride.addMapping') : t('adminOverride.editMapping')}
          </Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Stack>

        {/* Base value indicator */}
        {!isAddMode && baseEntry && (
          <Alert severity="info" sx={{ mb: 2, py: 0.5 }}>
            {t('adminOverride.baseDictInfo', { attributeId: baseEntry.attributeId, attributeName: baseEntry.attributeName })}
            {existingOverride && ` ${t('adminOverride.overrideActive')}`}
          </Alert>
        )}

        {/* Form */}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          <Stack spacing={2.5}>
            {/* Param Name */}
            <TextField
              label={t('adminOverride.atlasParamName')}
              value={paramName}
              onChange={(e) => setParamName(e.target.value)}
              size="small"
              fullWidth
              disabled={!isAddMode}
              helperText={isAddMode ? t('adminOverride.atlasParamHelper') : undefined}
            />

            {/* Attribute ID */}
            <TextField
              label={t('adminOverride.attributeId')}
              value={attributeId}
              onChange={(e) => setAttributeId(e.target.value)}
              size="small"
              fullWidth
              placeholder={t('adminOverride.attrIdPlaceholder')}
              helperText={t('adminOverride.attrIdHelper')}
            />

            {/* Attribute Name */}
            <TextField
              label={t('adminOverride.attributeName')}
              value={attributeName}
              onChange={(e) => setAttributeName(e.target.value)}
              size="small"
              fullWidth
              placeholder={t('adminOverride.attrNamePlaceholder')}
              helperText={t('adminOverride.attrNameHelper')}
            />

            {/* Unit */}
            <TextField
              label={t('adminOverride.unit')}
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              size="small"
              fullWidth
              placeholder={t('adminOverride.unitPlaceholder')}
            />

            {/* Sort Order */}
            <TextField
              label={t('adminOverride.sortOrder')}
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              size="small"
              fullWidth
              type="number"
              placeholder={t('adminOverride.sortOrderPlaceholder')}
              helperText={t('adminOverride.sortOrderHelper')}
            />

            <Divider />

            {/* Change Reason (required) */}
            <TextField
              label={t('adminOverride.changeReason')}
              value={changeReason}
              onChange={(e) => setChangeReason(e.target.value)}
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

          {!isAddMode && !existingOverride && baseEntry && (
            <Button
              variant="outlined"
              color="error"
              onClick={handleRemoveMapping}
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
