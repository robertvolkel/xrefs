'use client';

import { Chip, Tooltip } from '@mui/material';
import type { DomainClassification } from '@/lib/types';
import { domainBadge } from '@/lib/services/qualificationDomain';

/**
 * Renders a qualification-domain badge chip (Decision #155).
 *
 * Three visual states:
 *   - Context-matched (tone=success): green chip, no border emphasis.
 *   - Unknown (tone=warning): amber chip, chip+border emphasis.
 *   - Deviation (tone=danger): red chip, chip+border emphasis + tooltip with evidence.
 *
 * Returns null when no badge should be rendered (e.g. commercial part with no
 * active domain-gating context, or no classification at all).
 */
interface DomainChipProps {
  classification: DomainClassification | undefined;
  deviation?: boolean;
  /** Whether the user's selected context activates domain gating. When false,
   *  unknown-domain classifications are silent (showing "Domain unknown —
   *  verify" without a context that cares about the domain is noise). */
  contextActive?: boolean;
}

const TONE_COLOR: Record<string, string> = {
  success: '#66BB6A',
  info: '#4FC3F7',
  warning: '#FFB74D',
  danger: '#EF5350',
  neutral: '#90A4AE',
};

export default function DomainChip({ classification, deviation, contextActive }: DomainChipProps) {
  const badge = domainBadge(classification, { deviation, contextActive });
  if (!badge) return null;
  const color = TONE_COLOR[badge.tone] ?? TONE_COLOR.neutral;
  return (
    <Tooltip title={badge.tooltip} arrow>
      <Chip
        label={badge.label}
        size="small"
        variant="outlined"
        sx={{
          height: 18,
          fontSize: '0.6rem',
          color,
          borderColor: color,
          // chip+border emphasis: thicker border + filled background for
          // deviation/unknown so users catch it on fast skim
          ...(badge.emphasis === 'chip+border' && {
            borderWidth: 2,
            bgcolor: `${color}14`, // ~8% alpha
          }),
        }}
      />
    </Tooltip>
  );
}

/**
 * Derive a `contextActive` hint from a recommendation list when the context
 * isn't available at render time. Any rec flagged as a deviation proves the
 * server applied a domain filter, which means context is active.
 *
 * Imperfect: when every candidate is `unknown` (no classifier coverage), this
 * returns false and the amber chips are suppressed. Acceptable for Phase 1 —
 * users in that state see no domain chips and revert to pre-Decision-#153
 * behavior, which matches how the app worked before.
 */
export function inferContextActive<T extends { domainDeviation?: boolean }>(
  recs: T[],
): boolean {
  return recs.some(r => r.domainDeviation === true);
}
