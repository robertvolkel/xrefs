'use client';

import { IconButton, Tooltip } from '@mui/material';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProfile } from '@/lib/hooks/useProfile';
import { getLogicTable } from '@/lib/logicTables';
import ProposeAliasDialog from './ProposeAliasDialog';

interface ProposeAliasButtonProps {
  familyId: string | null | undefined;
  attributeId: string;
  attributeName: string;
  sourceValue: string;
  replacementValue: string;
  ruleResult?: string;
  onSuccess?: () => void | Promise<void>;
}

/**
 * Inline icon button on a comparison row that lets admins propose a value-alias
 * for two values that the engine flagged as different but are actually synonyms.
 *
 * Hidden unless ALL of:
 *  - User is admin
 *  - The rule is identity OR identity_upgrade (other rule types ignore aliases)
 *  - The row's ruleResult is 'fail'
 *  - Both values are non-empty / non-N/A
 *  - Family logic table exists
 */
export default function ProposeAliasButton({
  familyId,
  attributeId,
  attributeName,
  sourceValue,
  replacementValue,
  ruleResult,
  onSuccess,
}: ProposeAliasButtonProps) {
  const { isAdmin } = useProfile();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  if (!isAdmin || ruleResult !== 'fail' || !familyId) return null;

  const table = getLogicTable(familyId);
  if (!table) return null;
  const rule = table.rules.find(r => r.attributeId === attributeId);
  if (!rule) return null;
  if (rule.logicType !== 'identity' && rule.logicType !== 'identity_upgrade') return null;

  const isMissing = (v: string) => {
    const t = (v ?? '').trim();
    if (!t) return true;
    const upper = t.toUpperCase();
    return upper === 'N/A' || upper === '-' || upper === '--';
  };
  if (isMissing(sourceValue) || isMissing(replacementValue)) return null;

  // Hide on pure numeric mismatches — "3421K" vs "3380K" or "100" vs "200" are
  // genuinely different specs, never synonyms. Mirrors the mining script filter.
  const isCleanNumeric = (v: string) => {
    const trimmed = v.trim();
    const m = trimmed.match(/^([-+]?\d*\.?\d+)\s*[a-zA-Zµ°%/Ω]*$/);
    return !!m && !isNaN(parseFloat(m[1]));
  };
  if (isCleanNumeric(sourceValue) && isCleanNumeric(replacementValue)) return null;

  return (
    <>
      <Tooltip title={t('proposeAlias.tooltip', 'Propose alias — mark these values equivalent')} placement="left" arrow>
        <IconButton
          size="small"
          onClick={(e) => { e.stopPropagation(); setOpen(true); }}
          sx={{ color: 'text.disabled', p: 0.25, '&:hover': { color: 'primary.main' } }}
        >
          <LinkOutlinedIcon sx={{ fontSize: 14 }} />
        </IconButton>
      </Tooltip>
      <ProposeAliasDialog
        open={open}
        onClose={() => setOpen(false)}
        familyId={familyId}
        attributeId={attributeId}
        attributeName={attributeName}
        sourceValue={sourceValue}
        replacementValue={replacementValue}
        onSuccess={onSuccess}
      />
    </>
  );
}
