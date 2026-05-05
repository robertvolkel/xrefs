import type { XrefRecommendation } from '../types';
import { countRealMismatches } from '../types';

/**
 * Deterministic chat summary posted after recs land — replaces the LLM-driven
 * engineering assessment that lived here previously.
 *
 * Why deterministic: three rounds of system-prompt tightening could not stop
 * Sonnet from fabricating MFR origin / cert / supply-chain prose in this
 * code path. Its prior on "Chinese capacitor MFRs" (CapXon / Lelon / Rubycon)
 * was strong enough to override match-percentage and identity facts in the
 * recommendation block. Pulling the LLM out of this path eliminates the
 * fabrication surface entirely. Every value in this output traces back to a
 * field on a card the user can see.
 *
 * The bundled-filter path doesn't call this — `dispatchFilterIntent` already
 * posts a "Filtered to N <label> replacements" message with a Top-3 list that
 * serves as the summary in that case.
 */
export function buildRecsSummary(recs: XrefRecommendation[], sourceMpn: string): string {
  if (recs.length === 0) {
    return `No replacement candidates found for **${sourceMpn}**.`;
  }
  const top = recs[0];
  const cleanCount = recs.filter((r) => countRealMismatches(r) === 0).length;
  const flaggedCount = recs.length - cleanCount;
  const headline =
    recs.length === 1
      ? `Found **1** replacement candidate for **${sourceMpn}**.`
      : `Found **${recs.length}** replacement candidates for **${sourceMpn}**.`;
  const topLine = `Top match: **${top.part.mpn}** — ${top.part.manufacturer}, ${Math.round(top.matchPercentage)}% match.`;
  const breakdown =
    flaggedCount === 0
      ? `All candidates pass primary rules.`
      : `${cleanCount} pass all rules; ${flaggedCount} flagged for parameter mismatches — review per-card spec match before committing.`;
  return [headline, topLine, breakdown].join(' ');
}
