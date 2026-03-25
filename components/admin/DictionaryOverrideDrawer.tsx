'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Autocomplete,
  Box,
  Chip,
  CircularProgress,
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
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import { AtlasDictOverrideRecord } from '@/lib/types';
import {
  createAtlasDictOverride,
  updateAtlasDictOverride,
  deleteAtlasDictOverride,
  suggestDictMapping,
  type DictMappingSuggestion,
} from '@/lib/api';

interface DictEntry {
  paramName: string;
  attributeId: string;
  attributeName: string;
  unit?: string;
  sortOrder: number;
}

export interface SchemaAttribute {
  attributeId: string;
  attributeName: string;
  unit?: string;
  weight?: number;
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
  /** Sample values for the unmapped param */
  addParamSamples?: string[];
  /** Available schema attributes for the family/category */
  schemaAttributes?: SchemaAttribute[];
  /** Already-mapped attribute IDs (greyed out in picker) */
  mappedAttributeIds?: Set<string>;
  onSaved: () => void;
}

const CONFIDENCE_COLORS: Record<string, string> = {
  high: '#69F0AE',
  medium: '#FFB74D',
  low: '#FF5252',
};

export default function DictionaryOverrideDrawer({
  open,
  onClose,
  familyId,
  baseEntry,
  existingOverride,
  isAddMode,
  addParamName,
  addParamSamples = [],
  schemaAttributes = [],
  mappedAttributeIds,
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

  // AI suggestion state
  const [suggestion, setSuggestion] = useState<DictMappingSuggestion | null>(null);
  const [suggesting, setSuggesting] = useState(false);

  // Selected schema attribute (for Autocomplete)
  const [selectedAttr, setSelectedAttr] = useState<SchemaAttribute | null>(null);

  // Reset form when drawer opens
  useEffect(() => {
    if (!open) return;
    setError(null);
    setSuggestion(null);
    setSuggesting(false);
    setChangeReason(existingOverride?.changeReason ?? '');

    if (isAddMode) {
      setParamName(addParamName);
      setAttributeId('');
      setAttributeName('');
      setUnit('');
      setSortOrder('50');
      setSelectedAttr(null);

      // Fire AI suggestion
      if (addParamName) {
        setSuggesting(true);
        suggestDictMapping(addParamName, addParamSamples, familyId)
          .then((s) => {
            if (s) {
              setSuggestion(s);
              // Auto-fill if confidence is high and there's a schema match
              if (s.confidence === 'high' && s.suggestedAttributeId) {
                const match = schemaAttributes.find((a) => a.attributeId === s.suggestedAttributeId);
                if (match) {
                  setSelectedAttr(match);
                  setAttributeId(match.attributeId);
                  setAttributeName(match.attributeName);
                  setUnit(match.unit ?? s.suggestedUnit ?? '');
                }
                // If no schema match, don't auto-fill — QC must pick from dropdown
              }
            }
          })
          .finally(() => setSuggesting(false));
      }
    } else if (baseEntry) {
      const ov = existingOverride;
      setParamName(baseEntry.paramName);
      setAttributeId(ov?.attributeId ?? baseEntry.attributeId);
      setAttributeName(ov?.attributeName ?? baseEntry.attributeName);
      setUnit(ov?.unit ?? baseEntry.unit ?? '');
      setSortOrder(String(ov?.sortOrder ?? baseEntry.sortOrder));
      const match = schemaAttributes.find((a) => a.attributeId === (ov?.attributeId ?? baseEntry.attributeId));
      setSelectedAttr(match ?? null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, baseEntry, existingOverride, isAddMode, addParamName]);

  const handleAttrSelect = useCallback((_: unknown, value: SchemaAttribute | null) => {
    if (value) {
      setSelectedAttr(value);
      setAttributeId(value.attributeId);
      setAttributeName(value.attributeName);
      setUnit(value.unit ?? '');
    } else {
      setSelectedAttr(null);
      setAttributeId('');
      setAttributeName('');
      setUnit('');
    }
  }, []);

  const handleApplySuggestion = useCallback(() => {
    if (!suggestion?.suggestedAttributeId) return;
    const match = schemaAttributes.find((a) => a.attributeId === suggestion.suggestedAttributeId);
    if (match) {
      setSelectedAttr(match);
      setAttributeId(match.attributeId);
      setAttributeName(match.attributeName);
      setUnit(match.unit ?? suggestion.suggestedUnit ?? '');
    }
    // If no schema match, suggestion can't be applied — attribute must exist in schema
  }, [suggestion, schemaAttributes]);

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
    changeReason, isAddMode, existingOverride, onSaved, t,
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
  }, [familyId, baseEntry, changeReason, onSaved, t]);

  const hasSchemaOptions = schemaAttributes.length > 0;

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
            {isAddMode ? t('adminOverride.addMapping') : t('adminOverride.editMapping')}
          </Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Stack>

        {/* Base value indicator */}
        {!isAddMode && baseEntry && (
          <Alert severity="info" sx={{ mb: 3, py: 0.5 }}>
            {t('adminOverride.baseDictInfo', { attributeId: baseEntry.attributeId, attributeName: baseEntry.attributeName })}
            {existingOverride && ` ${t('adminOverride.overrideActive')}`}
          </Alert>
        )}

        {/* AI Suggestion banner (add mode only) */}
        {isAddMode && (suggesting || suggestion) && (
          <Box sx={{ mb: 2, p: 1.5, borderRadius: 1, bgcolor: 'action.hover', border: 1, borderColor: 'divider' }}>
            {suggesting ? (
              <Stack direction="row" alignItems="center" spacing={1}>
                <CircularProgress size={14} />
                <Typography variant="caption" color="text.secondary">
                  Analyzing parameter...
                </Typography>
              </Stack>
            ) : suggestion && (
              <Stack spacing={0.5}>
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <AutoFixHighIcon sx={{ fontSize: 14, color: 'info.main' }} />
                  <Typography variant="caption" sx={{ fontWeight: 600 }}>
                    AI Suggestion
                  </Typography>
                  <Chip
                    label={suggestion.confidence}
                    size="small"
                    sx={{
                      height: 16,
                      fontSize: '0.6rem',
                      fontWeight: 600,
                      bgcolor: CONFIDENCE_COLORS[suggestion.confidence] + '22',
                      color: CONFIDENCE_COLORS[suggestion.confidence],
                    }}
                  />
                </Stack>
                {suggestion.translation && (
                  <Typography variant="caption" color="text.secondary">
                    Translation: <strong>{suggestion.translation}</strong>
                  </Typography>
                )}
                {suggestion.suggestedAttributeId && (
                  <Typography variant="caption" color="text.secondary">
                    Suggested: <strong>{suggestion.suggestedAttributeId}</strong> ({suggestion.suggestedAttributeName})
                    {suggestion.suggestedUnit && ` [${suggestion.suggestedUnit}]`}
                  </Typography>
                )}
                {suggestion.reasoning && (
                  <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic', fontSize: '0.65rem' }}>
                    {suggestion.reasoning}
                  </Typography>
                )}
                {suggestion.confidence !== 'high' && (
                  <Button
                    size="small"
                    onClick={handleApplySuggestion}
                    sx={{ alignSelf: 'flex-start', fontSize: '0.7rem', textTransform: 'none', mt: 0.5 }}
                  >
                    Apply suggestion
                  </Button>
                )}
              </Stack>
            )}
          </Box>
        )}

        {/* Sample values (add mode) */}
        {isAddMode && addParamSamples.length > 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ mb: 2 }}>
            Sample values: <strong>{addParamSamples.join(', ')}</strong>
          </Typography>
        )}

        {/* Form */}
        <Box sx={{ flex: 1, overflow: 'auto', pt: 1 }}>
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

            {/* Attribute ID — Autocomplete or TextField */}
            {hasSchemaOptions ? (
              <Autocomplete
                options={schemaAttributes}
                value={selectedAttr}
                onChange={handleAttrSelect}
                getOptionLabel={(opt) =>
                  typeof opt === 'string' ? opt : opt.attributeId
                }
                isOptionEqualToValue={(opt, val) => opt.attributeId === val.attributeId}
                renderOption={(props, option) => {
                  const isMapped = mappedAttributeIds?.has(option.attributeId);
                  return (
                    <li {...props} key={option.attributeId}>
                      <Box sx={{ opacity: isMapped ? 0.4 : 1, width: '100%' }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
                          {option.attributeId}
                          {isMapped && (
                            <Typography component="span" variant="caption" sx={{ ml: 1, color: 'text.secondary' }}>
                              (mapped)
                            </Typography>
                          )}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {option.attributeName}
                          {option.weight !== undefined && ` \u00B7 W${option.weight}`}
                          {option.unit && ` \u00B7 ${option.unit}`}
                        </Typography>
                      </Box>
                    </li>
                  );
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label={t('adminOverride.attributeId')}
                    size="small"
                    placeholder="Select an attribute"
                    helperText="Choose from schema attributes"
                  />
                )}
                size="small"
              />
            ) : (
              <TextField
                label={t('adminOverride.attributeId')}
                value={attributeId}
                onChange={(e) => setAttributeId(e.target.value)}
                size="small"
                fullWidth
                placeholder={t('adminOverride.attrIdPlaceholder')}
                helperText={t('adminOverride.attrIdHelper')}
              />
            )}

            {/* Attribute Name */}
            <TextField
              label={t('adminOverride.attributeName')}
              value={attributeName}
              onChange={(e) => setAttributeName(e.target.value)}
              size="small"
              fullWidth
              placeholder={t('adminOverride.attrNamePlaceholder')}
              helperText={selectedAttr ? 'Auto-filled from schema' : t('adminOverride.attrNameHelper')}
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
