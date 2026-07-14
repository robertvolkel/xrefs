import { getLogicTable } from '../logicTables';
import type { MatchingRule, SelectionAttr } from '../types';
import type { SelectionState } from './selectionDoc';
import { SELECTION_STATES, SELECTION_TIERS } from './selectionTiers.generated';

/**
 * Per-family minimum attribute sets for greenfield part selection.
 *
 *   - tier2 = "Required to Search" — the agent must have these before searching.
 *   - tier3 = "Narrows Results"    — asked to narrow a result set too large to be useful.
 *
 * GENERATED from docs/min_attr_sets.md — that document is the source of truth, and
 * `npm run selection:check` fails the build if it omits any rule the engine scores.
 *
 * This list used to be hand-transcribed from that document and then never revisited. The
 * two drifted: 536 of 823 scored specs had no decision recorded either way, and the doc
 * itself omitted an LDO's input voltage while requiring it for switching regulators — so
 * the app never asked what voltage goes INTO a voltage regulator. Do not re-introduce a
 * hand-written copy here. Edit the document and run `npm run selection:audit`.
 */
export { SELECTION_TIERS };

/**
 * Extract a CLOSED option set (for choice buttons), or undefined when there isn't a
 * clean one. Whether a spec is a "choice" is decided SOLELY by this — NOT by logicType.
 * `logicType` describes how the engine scores a match; many numeric specs (output_voltage,
 * nominal_frequency_hz, coil_voltage_vdc) are scored by `identity` exact-match yet are
 * typed VALUES, not pick-lists. Deriving "choice" from logicType mislabels those.
 *
 * Source order: an explicit upgrade hierarchy, else a slash-delimited list inside the
 * rule's attributeName parenthetical (e.g. "Output Type (Fixed / Adjustable / Tracking /
 * Negative)"). Rejects:
 *   - numeric-scored rules — a `threshold`/`fit`/`identity_range`/`vref_check` spec is a
 *     TYPED value, never a pick-list, so a slashed parenthetical on one is always a
 *     unit/symbol synonym, NOT choices ("VDRM / VRRM", "(AC/DC)", "Supply Voltage Range
 *     (Single/Dual)"). This is the reliable half of the logicType signal: numeric-scored
 *     ⇒ always typed. (The converse isn't reliable — numeric IDENTITY specs like
 *     output_voltage are exact-match yet typed — which is why every genuine choice below
 *     is identity / identity_upgrade and the gate only excludes the numeric types.)
 *   - non-parenthetical slashes ("Package / Footprint" — an open set, type it in prose),
 *   - single-character tokens ("Channel Type (N/P)", "Safety Rating (X/Y Class)" → the
 *     parse would invent cryptic/garbage chips like "X", "N"),
 *   - parentheticals carrying a unit/symbol rather than choices ("(Vin Max)", "(Iout Max)").
 * A surviving option must be ≥2 chars and contain a letter.
 */
const NUMERIC_LOGIC_TYPES = new Set(['threshold', 'fit', 'identity_range', 'vref_check']);

function parseOptions(rule: MatchingRule): string[] | undefined {
  if (rule.upgradeHierarchy && rule.upgradeHierarchy.length >= 2) return [...rule.upgradeHierarchy];
  if (NUMERIC_LOGIC_TYPES.has(rule.logicType)) return undefined;
  const paren = rule.attributeName.match(/\(([^)]*)\)/);
  if (!paren || !paren[1].includes('/')) return undefined;
  const opts = paren[1].split('/').map(s => s.trim()).filter(Boolean);
  const valid = opts.length >= 2 && opts.every(o => o.length >= 2 && /[A-Za-z]/.test(o));
  return valid ? opts : undefined;
}

function toSelectionAttr(attributeId: string, ruleById: Map<string, MatchingRule>): SelectionAttr | null {
  const rule = ruleById.get(attributeId);
  if (!rule) return null;
  const options = parseOptions(rule);
  const attr: SelectionAttr = {
    attributeId,
    label: rule.attributeName,
    input: options ? 'choice' : 'value',
  };
  if (options) attr.options = options;
  return attr;
}

export interface SelectionQuestions {
  tier2: SelectionAttr[];
  tier3: SelectionAttr[];
}

/**
 * Resolve a family's Tier 2 / Tier 3 selection questions against its live logic table.
 * Labels, kinds, and chip options are read from the (runtime-merged) logic-table rules,
 * so variant families inherit base rules. Returns null for an unknown family or one with
 * no selection tiers. IDs that somehow miss a rule are dropped (the guard test prevents this).
 */
export function getSelectionQuestions(familyId: string): SelectionQuestions | null {
  const tiers = SELECTION_TIERS[familyId];
  if (!tiers) return null;
  const table = getLogicTable(familyId);
  if (!table) return null;
  const ruleById = new Map(table.rules.map(r => [r.attributeId, r]));
  const map = (ids: string[]): SelectionAttr[] =>
    ids.map(id => toSelectionAttr(id, ruleById)).filter((a): a is SelectionAttr => a !== null);
  return { tier2: map(tiers.tier2), tier3: map(tiers.tier3) };
}

/**
 * Which selection tier an attribute belongs to for a family, or null.
 * Used by the admin "Attribute Templates" read-only marker.
 */
export function getSelectionTier(familyId: string, attributeId: string): 'tier2' | 'tier3' | null {
  const tiers = SELECTION_TIERS[familyId];
  if (!tiers) return null;
  if (tiers.tier2.includes(attributeId)) return 'tier2';
  if (tiers.tier3.includes(attributeId)) return 'tier3';
  return null;
}

export interface SelectionStateInfo {
  state: SelectionState;
  reason?: string;
  /** No human has ruled on this spec yet — it is unasked by default, not by decision. */
  needsReview: boolean;
}

/**
 * The full recorded decision for a spec, for the admin "Attribute Templates" panel.
 *
 * Unlike getSelectionTier(), this NEVER returns null for a scored rule — every spec has an
 * explicit state. That is the point: an omission that was decided ("a user cannot state a
 * thermal resistance") and an omission nobody ever noticed used to render identically, as a
 * blank row. Now the panel can tell them apart.
 *
 * READ-ONLY. Decisions are edited in docs/min_attr_sets.md, never in the UI — two writable
 * surfaces for the same truth is precisely the bug this replaced.
 */
export function getSelectionState(familyId: string, attributeId: string): SelectionStateInfo | null {
  const entry = SELECTION_STATES[familyId]?.[attributeId];
  if (!entry) return null;
  return {
    state: entry.state,
    reason: entry.reason,
    needsReview: entry.state === 'not_asked' && !entry.reason,
  };
}
