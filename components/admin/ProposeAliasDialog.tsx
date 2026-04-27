'use client';

import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
  Box, Stack, Typography, Chip, Alert, FormControl, InputLabel, Select, MenuItem,
  CircularProgress,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getLogicTable } from '@/lib/logicTables';
import { getRuleOverrides, createRuleOverride, updateRuleOverride } from '@/lib/api';
import type { RuleOverrideRecord } from '@/lib/types';

interface ProposeAliasDialogProps {
  open: boolean;
  onClose: () => void;
  familyId: string;
  attributeId: string;
  attributeName: string;
  sourceValue: string;
  replacementValue: string;
  /** Called after successful save (used by callers to chain follow-up actions like resolving feedback). */
  onSuccess?: () => void | Promise<void>;
}

/** Same normalize used by the matching engine — keep in sync. */
function normalize(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, ' ');
}

/** Find which existing group (if any) contains the given value. Returns -1 if none. */
function findGroupContaining(groups: string[][], value: string): number {
  const target = normalize(value);
  for (let i = 0; i < groups.length; i++) {
    if (groups[i].some(v => normalize(v) === target)) return i;
  }
  return -1;
}

export default function ProposeAliasDialog({
  open,
  onClose,
  familyId,
  attributeId,
  attributeName,
  sourceValue,
  replacementValue,
  onSuccess,
}: ProposeAliasDialogProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingOverride, setExistingOverride] = useState<RuleOverrideRecord | null>(null);
  const [effectiveGroups, setEffectiveGroups] = useState<string[][]>([]);
  // -1 = create new group; >= 0 = add to existing group at that index
  const [targetGroupIdx, setTargetGroupIdx] = useState<number>(-1);
  const [extraValues, setExtraValues] = useState('');
  const [changeReason, setChangeReason] = useState('');

  // Fetch effective state when dialog opens
  useEffect(() => {
    if (!open) return;
    setError(null);
    setExtraValues('');
    setChangeReason('');
    setLoading(true);

    (async () => {
      try {
        const overrides = await getRuleOverrides(familyId);
        const ov = overrides.find(o => o.attributeId === attributeId && o.isActive) ?? null;
        setExistingOverride(ov);

        const baseRule = getLogicTable(familyId)?.rules.find(r => r.attributeId === attributeId);
        const groups = ov?.valueAliases ?? baseRule?.valueAliases ?? [];
        setEffectiveGroups(groups);

        // Auto-suggest: if either value is already in an existing group, default to that group
        const idxFromSource = findGroupContaining(groups, sourceValue);
        const idxFromRepl = findGroupContaining(groups, replacementValue);
        if (idxFromSource >= 0) setTargetGroupIdx(idxFromSource);
        else if (idxFromRepl >= 0) setTargetGroupIdx(idxFromRepl);
        else setTargetGroupIdx(-1);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load existing aliases');
      } finally {
        setLoading(false);
      }
    })();
  }, [open, familyId, attributeId, sourceValue, replacementValue]);

  /** Compute the new full valueAliases array we'll send. Returns null on conflict. */
  const newValueAliases = useMemo<string[][] | null>(() => {
    const extras = extraValues
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const newMembers = [sourceValue, replacementValue, ...extras];

    if (targetGroupIdx === -1) {
      // Create new group — ensure no member of newMembers is in any existing group
      for (const member of newMembers) {
        const existingIdx = findGroupContaining(effectiveGroups, member);
        if (existingIdx >= 0) {
          // Conflict: this member is in another group. Reject.
          return null;
        }
      }
      return [...effectiveGroups, [...new Set(newMembers)]];
    }

    // Add to existing group
    const updated = effectiveGroups.map((g, i) => {
      if (i !== targetGroupIdx) return g;
      const merged: string[] = [...g];
      const seen = new Set(merged.map(normalize));
      for (const m of newMembers) {
        if (!seen.has(normalize(m))) {
          merged.push(m);
          seen.add(normalize(m));
        }
      }
      return merged;
    });
    // Verify added members aren't in OTHER groups (collision)
    for (const member of newMembers) {
      const idx = findGroupContaining(updated, member);
      if (idx !== targetGroupIdx) {
        return null;
      }
    }
    return updated;
  }, [effectiveGroups, targetGroupIdx, sourceValue, replacementValue, extraValues]);

  const conflictMember = useMemo<string | null>(() => {
    if (newValueAliases !== null) return null;
    const extras = extraValues.split(',').map(s => s.trim()).filter(Boolean);
    const newMembers = [sourceValue, replacementValue, ...extras];
    for (const member of newMembers) {
      const idx = findGroupContaining(effectiveGroups, member);
      if (idx >= 0 && idx !== targetGroupIdx) {
        return member;
      }
    }
    return null;
  }, [newValueAliases, effectiveGroups, targetGroupIdx, sourceValue, replacementValue, extraValues]);

  const canSubmit =
    !loading && !saving && !!changeReason.trim() && newValueAliases !== null;

  const handleSubmit = async () => {
    if (!newValueAliases) return;
    setSaving(true);
    setError(null);
    try {
      if (existingOverride) {
        const ok = await updateRuleOverride(existingOverride.id, {
          valueAliases: newValueAliases,
          changeReason: changeReason.trim(),
        });
        if (!ok) throw new Error('Failed to update override');
      } else {
        const created = await createRuleOverride({
          familyId,
          attributeId,
          action: 'modify',
          valueAliases: newValueAliases,
          changeReason: changeReason.trim(),
        });
        if (!created) throw new Error('Failed to create override');
      }
      if (onSuccess) await onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.25 }}>
          {t('proposeAlias.title', 'Propose value alias')}
        </Typography>
        <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 500 }}>
          {attributeName}
        </Typography>
      </DialogTitle>
      <DialogContent>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {t('proposeAlias.values', 'Values to mark equivalent')}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: 'wrap', gap: 0.5 }}>
                <Chip label={sourceValue} sx={{ fontFamily: 'monospace' }} />
                <Typography sx={{ alignSelf: 'center' }} color="text.secondary">≡</Typography>
                <Chip label={replacementValue} sx={{ fontFamily: 'monospace' }} />
              </Stack>
            </Box>

            <FormControl size="small" fullWidth>
              <InputLabel id="propose-alias-target-label">{t('proposeAlias.target', 'Add to')}</InputLabel>
              <Select
                labelId="propose-alias-target-label"
                value={String(targetGroupIdx)}
                label={t('proposeAlias.target', 'Add to')}
                onChange={(e) => setTargetGroupIdx(parseInt(e.target.value as string, 10))}
              >
                <MenuItem value="-1">
                  {t('proposeAlias.newGroup', 'Create new alias group')}
                </MenuItem>
                {effectiveGroups.map((g, i) => (
                  <MenuItem key={i} value={String(i)}>
                    {t('proposeAlias.existingGroupPrefix', 'Add to existing group:')} {g.slice(0, 4).join(' ≡ ')}{g.length > 4 ? ` (+${g.length - 4})` : ''}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              size="small"
              fullWidth
              label={t('proposeAlias.extraValues', 'Additional synonyms (optional, comma-separated)')}
              value={extraValues}
              onChange={(e) => setExtraValues(e.target.value)}
              placeholder={t('proposeAlias.extraValuesPlaceholder', 'e.g. Uni-Polar, Unipolar')}
              helperText={t('proposeAlias.extraValuesHelper', 'Other known synonyms to add to this group while you\'re here.')}
            />

            <TextField
              size="small"
              fullWidth
              required
              multiline
              rows={2}
              label={t('proposeAlias.changeReason', 'Change reason')}
              value={changeReason}
              onChange={(e) => setChangeReason(e.target.value)}
              placeholder={t('proposeAlias.changeReasonPlaceholder', 'Required — why is this alias being added?')}
              error={!!error && !changeReason.trim()}
            />

            {conflictMember && (
              <Alert severity="warning" sx={{ fontSize: '0.78rem' }}>
                {t('proposeAlias.conflictMessage', { value: conflictMember, defaultValue: `"${conflictMember}" is already a member of a different alias group on this rule. Pick that group from the dropdown above instead, or remove it from your additions.` })}
              </Alert>
            )}

            {error && (
              <Alert severity="error" sx={{ fontSize: '0.78rem' }}>
                {error}
              </Alert>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          {t('common.cancel', 'Cancel')}
        </Button>
        <Button onClick={handleSubmit} variant="contained" disabled={!canSubmit}>
          {saving
            ? t('proposeAlias.saving', 'Saving…')
            : t('proposeAlias.submit', 'Add alias')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
