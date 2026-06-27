import type { ChoiceOption } from '../types';
import { mentionsMpn } from './searchSummary';

/**
 * Enforce the `present_choices` hard line deterministically: a choice button is a
 * requirement CATEGORY or a workflow action, NEVER a specific part.
 *
 * The chat SYSTEM_PROMPT already forbids part-proposing choices ("no option carries
 * an mpn/manufacturer or otherwise proposes a candidate"), but a prompt is a SOFT
 * instruction — a model slip would render a fabricated part number / spec straight
 * onto a button, because the label is shown verbatim (unlike an MPN lookup, which
 * resolves against the catalog and drops non-existent parts). This is the
 * deterministic backstop that makes the rule enforceable.
 *
 * Only LLM-authored choices (from the `present_choices` tool) pass through here. The
 * app's own next-step choices (`find_replacements` / `show_mfr_profile` /
 * `show_best_price` / `best_price_at_qty`) are built client-side from already-resolved
 * parts and never reach this function.
 *
 * Two rules:
 *  1. Drop any option whose label NAMES a specific part. `mentionsMpn` excludes
 *     spec / package / qualification tokens, so categorical labels ("N-channel",
 *     "X7R dielectric", "AEC-Q200 only", "100V rail") are unaffected; "Use BC847C"
 *     or "Confirm MMBT3904" is dropped.
 *  2. Strip mpn/manufacturer and coerce action 'confirm_part' → 'other', so no choice
 *     can carry or confirm a candidate. 'other' round-trips the label as a normal,
 *     catalog-grounded search turn when clicked.
 */
export function sanitizeChoiceOptions(choices: unknown): ChoiceOption[] {
  if (!Array.isArray(choices)) return [];
  const out: ChoiceOption[] = [];
  for (const raw of choices) {
    const c = raw as Partial<ChoiceOption> | null | undefined;
    if (!c || typeof c.id !== 'string' || typeof c.label !== 'string') continue;
    // Rule 1: a label that names a specific part is never a valid choice button.
    if (mentionsMpn(c.label)) continue;
    // Rule 2: keep only id + label + a neutered workflow action. mpn/manufacturer
    // are dropped by omission; confirm_part is downgraded to a plain search turn.
    const safe: ChoiceOption = { id: c.id, label: c.label };
    const action = c.action === 'confirm_part' ? 'other' : c.action;
    if (action) safe.action = action;
    out.push(safe);
  }
  return out;
}
