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
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Checkbox,
  FormControlLabel,
  Divider,
  Alert,
  Chip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import {
  ContextQuestion,
  ContextOption,
  AttributeEffect,
  ContextEffectType,
  ContextOverrideRecord,
  ContextOverrideAction,
} from '@/lib/types';
import { createContextOverride, deleteContextOverride } from '@/lib/api';

const EFFECT_TYPES: { value: ContextEffectType; key: string }[] = [
  { value: 'escalate_to_mandatory', key: 'adminOverride.escalateMandatoryW10' },
  { value: 'escalate_to_primary', key: 'adminOverride.escalatePrimaryW9' },
  { value: 'not_applicable', key: 'adminOverride.notApplicableW0' },
  { value: 'add_review_flag', key: 'adminOverride.addReviewFlagLabel' },
  { value: 'set_threshold', key: 'adminOverride.setThresholdLabel' },
];

interface ContextOverrideDrawerProps {
  open: boolean;
  onClose: () => void;
  familyId: string;
  /** The mode of editing */
  mode: 'add_question' | 'add_option' | 'modify_option' | 'disable_question';
  /** The question being edited (null for add_question) */
  question: ContextQuestion | null;
  /** The option being edited (null for question-level actions) */
  option: ContextOption | null;
  /** Existing override (for reverting) */
  existingOverride: ContextOverrideRecord | null;
  onSaved: () => void;
}

export default function ContextOverrideDrawer({
  open,
  onClose,
  familyId,
  mode,
  question,
  option,
  existingOverride,
  onSaved,
}: ContextOverrideDrawerProps) {
  const { t } = useTranslation();

  // Question-level fields
  const [questionId, setQuestionId] = useState('');
  const [questionText, setQuestionText] = useState('');
  const [priority, setPriority] = useState<number>(1);

  // Option-level fields
  const [optionValue, setOptionValue] = useState('');
  const [optionLabel, setOptionLabel] = useState('');
  const [optionDescription, setOptionDescription] = useState('');

  // Effects editor
  const [effects, setEffects] = useState<AttributeEffect[]>([]);

  // Meta
  const [changeReason, setChangeReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form on open
  useEffect(() => {
    if (!open) return;
    setError(null);
    setChangeReason('');

    if (mode === 'add_question') {
      setQuestionId('');
      setQuestionText('');
      setPriority(1);
      setOptionValue('');
      setOptionLabel('');
      setOptionDescription('');
      setEffects([]);
    } else if (mode === 'add_option') {
      setQuestionId(question?.questionId ?? '');
      setOptionValue('');
      setOptionLabel('');
      setOptionDescription('');
      setEffects([]);
    } else if (mode === 'modify_option' && option) {
      setQuestionId(question?.questionId ?? '');
      setOptionValue(option.value);
      setOptionLabel(option.label);
      setOptionDescription(option.description ?? '');
      setEffects([...option.attributeEffects]);
    } else if (mode === 'disable_question') {
      setQuestionId(question?.questionId ?? '');
    }
  }, [open, mode, question, option]);

  const addEffect = useCallback(() => {
    setEffects(prev => [...prev, { attributeId: '', effect: 'escalate_to_mandatory' as ContextEffectType }]);
  }, []);

  const removeEffect = useCallback((index: number) => {
    setEffects(prev => prev.filter((_, i) => i !== index));
  }, []);

  const updateEffect = useCallback((index: number, field: keyof AttributeEffect, value: unknown) => {
    setEffects(prev => prev.map((e, i) =>
      i === index ? { ...e, [field]: value } : e,
    ));
  }, []);

  const handleSave = useCallback(async () => {
    if (!changeReason.trim()) {
      setError(t('adminOverride.changeReasonRequired'));
      return;
    }
    setSaving(true);
    setError(null);

    try {
      const action: ContextOverrideAction = mode;
      const data: Record<string, unknown> = {
        familyId,
        questionId: mode === 'add_question' ? questionId : question?.questionId,
        action,
        changeReason: changeReason.trim(),
      };

      if (mode === 'add_question') {
        data.questionText = questionText;
        data.priority = priority;
      }

      if (mode === 'add_option' || mode === 'modify_option') {
        data.optionValue = optionValue;
        data.optionLabel = optionLabel;
        if (optionDescription) data.optionDescription = optionDescription;
        if (effects.length > 0) {
          data.attributeEffects = effects.filter(e => e.attributeId && e.effect);
        }
      }

      if (mode === 'disable_question') {
        // No additional fields needed
      }

      const result = await createContextOverride(data as Parameters<typeof createContextOverride>[0]);
      if (!result) throw new Error('Create failed');

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [
    t, familyId, mode, question, questionId, questionText, priority,
    optionValue, optionLabel, optionDescription, effects, changeReason,
    onSaved, onClose,
  ]);

  const handleRevert = useCallback(async () => {
    if (!existingOverride) return;
    setSaving(true);
    try {
      const ok = await deleteContextOverride(existingOverride.id);
      if (!ok) throw new Error('Revert failed');
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Revert failed');
    } finally {
      setSaving(false);
    }
  }, [existingOverride, onSaved, onClose]);

  const getModeLabel = () => {
    switch (mode) {
      case 'add_question': return t('adminOverride.addQuestion');
      case 'add_option': return t('adminOverride.addOptionTo', { id: question?.questionId ?? '' });
      case 'modify_option': return t('adminOverride.editOption', { value: option?.value ?? '' });
      case 'disable_question': return t('adminOverride.disableQuestion', { id: question?.questionId ?? '' });
      default: return mode;
    }
  };

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
          <Typography variant="h6">{getModeLabel()}</Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Stack>

        {/* Form */}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          <Stack spacing={2.5}>
            {/* Question-level fields */}
            {mode === 'add_question' && (
              <>
                <TextField
                  label={t('adminOverride.questionId')}
                  value={questionId}
                  onChange={e => setQuestionId(e.target.value)}
                  size="small"
                  fullWidth
                  placeholder={t('adminOverride.questionIdPlaceholder')}
                />
                <TextField
                  label={t('adminOverride.questionText')}
                  value={questionText}
                  onChange={e => setQuestionText(e.target.value)}
                  size="small"
                  fullWidth
                  multiline
                  rows={2}
                />
                <TextField
                  label={t('adminOverride.priorityLabel')}
                  value={priority}
                  onChange={e => setPriority(parseInt(e.target.value) || 1)}
                  size="small"
                  type="number"
                  fullWidth
                />
              </>
            )}

            {/* Disable confirmation */}
            {mode === 'disable_question' && (
              <Alert severity="warning">
                {t('adminOverride.disableWarning', { question: question?.questionText ?? '' })}
              </Alert>
            )}

            {/* Option-level fields */}
            {(mode === 'add_option' || mode === 'modify_option') && (
              <>
                <TextField
                  label={t('adminOverride.optionValue')}
                  value={optionValue}
                  onChange={e => setOptionValue(e.target.value)}
                  size="small"
                  fullWidth
                  disabled={mode === 'modify_option'}
                  placeholder={t('adminOverride.optionValuePlaceholder')}
                />
                <TextField
                  label={t('adminOverride.optionLabel')}
                  value={optionLabel}
                  onChange={e => setOptionLabel(e.target.value)}
                  size="small"
                  fullWidth
                  placeholder={t('adminOverride.optionLabelPlaceholder')}
                />
                <TextField
                  label={t('adminOverride.description')}
                  value={optionDescription}
                  onChange={e => setOptionDescription(e.target.value)}
                  size="small"
                  fullWidth
                  multiline
                  rows={2}
                  placeholder={t('adminOverride.descriptionPlaceholder')}
                />

                <Divider />

                {/* Effects Editor */}
                <Box>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                    <Typography variant="subtitle2">{t('adminOverride.attributeEffects')}</Typography>
                    <Button
                      size="small"
                      startIcon={<AddIcon />}
                      onClick={addEffect}
                      sx={{ textTransform: 'none' }}
                    >
                      {t('adminOverride.addEffect')}
                    </Button>
                  </Stack>

                  {effects.length === 0 && (
                    <Typography variant="caption" color="text.secondary">
                      {t('adminOverride.noEffects')}
                    </Typography>
                  )}

                  <Stack spacing={1.5}>
                    {effects.map((effect, idx) => (
                      <Box
                        key={idx}
                        sx={{
                          display: 'flex',
                          gap: 1,
                          alignItems: 'flex-start',
                          p: 1.5,
                          borderRadius: 1,
                          bgcolor: 'action.hover',
                        }}
                      >
                        <TextField
                          label={t('adminOverride.attributeId')}
                          value={effect.attributeId}
                          onChange={e => updateEffect(idx, 'attributeId', e.target.value)}
                          size="small"
                          sx={{ flex: 1 }}
                          placeholder={t('adminOverride.effectAttrIdPlaceholder')}
                        />
                        <FormControl size="small" sx={{ minWidth: 180 }}>
                          <InputLabel>{t('adminOverride.effectLabel')}</InputLabel>
                          <Select
                            value={effect.effect}
                            label={t('adminOverride.effectLabel')}
                            onChange={e => updateEffect(idx, 'effect', e.target.value)}
                          >
                            {EFFECT_TYPES.map(et => (
                              <MenuItem key={et.value} value={et.value}>{t(et.key)}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={effect.blockOnMissing ?? false}
                              onChange={e => updateEffect(idx, 'blockOnMissing', e.target.checked)}
                              size="small"
                            />
                          }
                          label={<Typography variant="caption">{t('adminOverride.blockLabel')}</Typography>}
                          sx={{ mr: 0 }}
                        />
                        <IconButton size="small" onClick={() => removeEffect(idx)}>
                          <DeleteOutlineIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                      </Box>
                    ))}
                  </Stack>
                </Box>
              </>
            )}

            <Divider />

            {/* Change Reason */}
            <TextField
              label={t('adminOverride.changeReason')}
              value={changeReason}
              onChange={e => setChangeReason(e.target.value)}
              size="small"
              fullWidth
              multiline
              rows={2}
              required
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
            {saving ? t('adminOverride.saving') : t('adminOverride.saveOverride')}
          </Button>

          {existingOverride && (
            <Button
              variant="outlined"
              color="warning"
              onClick={handleRevert}
              disabled={saving}
            >
              {t('adminOverride.revert')}
            </Button>
          )}
        </Stack>
      </Box>
    </Drawer>
  );
}
