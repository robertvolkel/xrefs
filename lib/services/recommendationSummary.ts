import type { XrefRecommendation } from '../types';
import { countRealMismatches, getDefaultDisplayedRecs } from '../types';

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

  // Report the count the user actually sees in the panel. The panel hides
  // obsolete and high-fail candidates by default (getDefaultDisplayedRecs is
  // the shared predicate), so the raw recs.length would contradict the cards.
  const displayed = getDefaultDisplayedRecs(recs);
  const hiddenCount = recs.length - displayed.length;
  const hiddenNote =
    hiddenCount > 0
      ? ` ${hiddenCount} ${hiddenCount === 1 ? 'other is' : 'others are'} hidden (obsolete or 3+ failing parameters) — say "show all" to review them.`
      : '';

  // All-hidden edge case: candidates exist but every one is filtered out by
  // default. Don't claim "none found" — tell the user they exist and how to see them.
  if (displayed.length === 0) {
    return `Found **${recs.length}** ${recs.length === 1 ? 'candidate' : 'candidates'} for **${sourceMpn}**, but ${recs.length === 1 ? 'it is' : 'all are'} obsolete or ${recs.length === 1 ? 'has' : 'have'} 3+ failing parameters and ${recs.length === 1 ? 'is' : 'are'} hidden by default — say "show all" to review ${recs.length === 1 ? 'it' : 'them'}.`;
  }

  const top = displayed[0];
  const cleanCount = displayed.filter((r) => countRealMismatches(r) === 0).length;
  const flaggedCount = displayed.length - cleanCount;
  const headline =
    displayed.length === 1
      ? `Found **1** replacement candidate for **${sourceMpn}**.`
      : `Found **${displayed.length}** replacement candidates for **${sourceMpn}**.`;
  const topLine = `Top match: **${top.part.mpn}** — ${top.part.manufacturer}, ${Math.round(top.matchPercentage)}% match.`;
  const breakdown =
    flaggedCount === 0
      ? `All shown candidates pass primary rules.`
      : `${cleanCount} pass all rules; ${flaggedCount} flagged for parameter mismatches — review per-card spec match before committing.`;
  return [headline, topLine, breakdown].join(' ') + hiddenNote;
}
