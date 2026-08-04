import type { XrefRecommendation } from '../types';
import { countRealMismatches, countComparedSpecs } from '../types';

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
  // The panel shows every candidate (Decision #227 — no status/quality hiding),
  // so the summary counts the full set and the number always matches the cards.
  const top = recs[0];
  const cleanCount = recs.filter((r) => countRealMismatches(r) === 0).length;
  const flaggedCount = recs.length - cleanCount;
  const headline =
    recs.length === 1
      ? `Found **1** replacement candidate for **${sourceMpn}**.`
      : `Found **${recs.length}** replacement candidates for **${sourceMpn}**.`;
  // Say how much of that percentage is real evidence. A rule the SOURCE part
  // can't answer scores a silent full pass, so a sparse source produces a
  // confident number derived from nothing — measured on real logs, MNS2N2222AUB
  // reported "94% match" off 1 of 18 specs actually compared, while a healthy
  // part (MCP1703T-5002E/CB) compared 15 of 22. Reporting the count is
  // threshold-free; a coverage cutoff was measured against all 174 real source
  // parts in the logs and rejected (see countComparedSpecs).
  //
  // Phrasing is uniform on purpose — "(12 of 12 specs compared)" is mildly
  // redundant, but one branch means one thing to test and no prose to drift.
  const { compared, total } = countComparedSpecs(top);
  const evidence = total > 0 ? ` (${compared} of ${total} specs compared)` : '';
  const topLine = `Top match: **${top.part.mpn}** — ${top.part.manufacturer}, ${Math.round(top.matchPercentage)}% match${evidence}.`;
  const breakdown =
    flaggedCount === 0
      ? `All candidates pass primary rules.`
      : `${cleanCount} pass all rules; ${flaggedCount} flagged for parameter mismatches — review per-card spec match before committing.`;
  return [headline, topLine, breakdown].join(' ');
}
