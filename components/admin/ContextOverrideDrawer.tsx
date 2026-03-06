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

const EFFECT_TYPES: { value: ContextEffectType; label: string }[] = [
  { value: 'escalate_to_mandatory', label: 'Escalate to Mandatory (w=10)' },
  { value: 'escalate_to_primary', label: 'Escalate to Primary (w=9)' },
  { value: 'not_applicable', label: 'Not Applicable (w=0)' },
  { value: 'add_review_flag', label: 'Add Review Flag' },
  { value: 'set_threshold', label: 'Set Threshold' },
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
      setError('Please provide a reason for this change.');
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
    familyId, mode, question, questionId, questionText, priority,
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

  const modeLabels: Record<string, string> = {
    add_question: 'Add Question',
    add_option: `Add Option to Q: ${question?.questionId ?? ''}`,
    modify_option: `Edit Option: ${option?.value ?? ''}`,
    disable_question: `Disable: ${question?.questionId ?? ''}`,
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
          <Typography variant="h6">{modeLabels[mode] ?? mode}</Typography>
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
                  label="Question ID"
                  value={questionId}
                  onChange={e => setQuestionId(e.target.value)}
                  size="small"
                  fullWidth
                  placeholder="e.g. new_question"
                />
                <TextField
                  label="Question Text"
                  value={questionText}
                  onChange={e => setQuestionText(e.target.value)}
                  size="small"
                  fullWidth
                  multiline
                  rows={2}
                />
                <TextField
                  label="Priority"
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
                This will suppress the question &quot;{question?.questionText}&quot; from being
                shown during cross-reference evaluation.
              </Alert>
            )}

            {/* Option-level fields */}
            {(mode === 'add_option' || mode === 'modify_option') && (
              <>
                <TextField
                  label="Option Value"
                  value={optionValue}
                  onChange={e => setOptionValue(e.target.value)}
                  size="small"
                  fullWidth
                  disabled={mode === 'modify_option'}
                  placeholder="e.g. high_impedance"
                />
                <TextField
                  label="Option Label"
                  value={optionLabel}
                  onChange={e => setOptionLabel(e.target.value)}
                  size="small"
                  fullWidth
                  placeholder="Display label for this option"
                />
                <TextField
                  label="Description"
                  value={optionDescription}
                  onChange={e => setOptionDescription(e.target.value)}
                  size="small"
                  fullWidth
                  multiline
                  rows={2}
                  placeholder="Help text for the user"
                />

                <Divider />

                {/* Effects Editor */}
                <Box>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                    <Typography variant="subtitle2">Attribute Effects</Typography>
                    <Button
                      size="small"
                      startIcon={<AddIcon />}
                      onClick={addEffect}
                      sx={{ textTransform: 'none' }}
                    >
                      Add Effect
                    </Button>
                  </Stack>

                  {effects.length === 0 && (
                    <Typography variant="caption" color="text.secondary">
                      No effects — this option will have no impact on matching rules.
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
                          label="Attribute ID"
                          value={effect.attributeId}
                          onChange={e => updateEffect(idx, 'attributeId', e.target.value)}
                          size="small"
                          sx={{ flex: 1 }}
                          placeholder="e.g. voltage_rating"
                        />
                        <FormControl size="small" sx={{ minWidth: 180 }}>
                          <InputLabel>Effect</InputLabel>
                          <Select
                            value={effect.effect}
                            label="Effect"
                            onChange={e => updateEffect(idx, 'effect', e.target.value)}
                          >
                            {EFFECT_TYPES.map(et => (
                              <MenuItem key={et.value} value={et.value}>{et.label}</MenuItem>
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
                          label={<Typography variant="caption">Block</Typography>}
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
              label="Why are you making this change?"
              value={changeReason}
              onChange={e => setChangeReason(e.target.value)}
              size="small"
              fullWidth
              multiline
              rows={2}
              required
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
            {saving ? 'Saving...' : 'Save Override'}
          </Button>

          {existingOverride && (
            <Button
              variant="outlined"
              color="warning"
              onClick={handleRevert}
              disabled={saving}
            >
              Revert
            </Button>
          )}
        </Stack>
      </Box>
    </Drawer>
  );
}
