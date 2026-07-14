import { logicTableRegistry } from '../logicTables';
import type { LogicTable, MatchingRule } from '../types';

/**
 * docs/min_attr_sets.md is the SOURCE OF TRUTH for which specs the agent asks a user
 * when they are selecting a part by description. This module is the parser, validator
 * and serializer for that file.
 *
 * WHY THE FILE WINS AND THE CODE IS GENERATED
 * -------------------------------------------
 * The file used to be a *document about* the code: someone hand-copied it into
 * SELECTION_TIERS once and never revisited it. The two then drifted, silently, for a
 * month — and the drift was invisible because the only guard test asked "does every
 * listed id exist?", never "is every scored rule listed?". 536 of 823 scored specs were
 * never asked about, and nobody had ever *decided* not to ask about them.
 *
 * So: the file is the input, `selectionTiers.generated.ts` is the output, and the build
 * refuses a file that omits any rule the engine scores. There is exactly ONE writable
 * surface (this file); the admin panel is read-only. Two writable surfaces would recreate
 * the original bug.
 *
 * WHAT IS AUTHORITATIVE WHERE
 *   - live logic tables → which specs EXIST, their real names and weights (regenerated,
 *     so a typo'd id or a stale weight in the file cannot survive a round-trip)
 *   - this markdown file → the STATE of each spec (asked / narrows / never asked) + reason
 */

export type SelectionState = 'required' | 'narrows' | 'not_asked';

export const STATE_LABELS: Record<SelectionState, string> = {
  required: 'Required for Search',
  narrows: 'Narrows Results',
  not_asked: 'Not Asked',
};

const LABEL_TO_STATE = new Map<string, SelectionState>(
  (Object.entries(STATE_LABELS) as [SelectionState, string][]).map(([s, l]) => [l.toLowerCase(), s]),
);

/** Marks a row a human still has to rule on. Cosmetic — never parsed back in. */
export const NEEDS_REVIEW = '⚠️ NEEDS REVIEW';

/** Everything from this heading to EOF is hand-written prose, preserved verbatim. */
export const NOTES_HEADING = '## Engineering Notes';

export interface SelectionRow {
  attributeId: string;
  state: SelectionState;
  reason: string;
}

export interface ParsedDoc {
  /** familyId → rows, in file order. Row order within a state IS the order the agent asks. */
  families: Map<string, SelectionRow[]>;
  /** The hand-written tail (engineering notes), preserved across regeneration. */
  notes: string;
}

// ─── Parse ────────────────────────────────────────────────────────────────────

/** `### C1 — Linear Voltage Regulators (LDOs)` → `C1` (also tolerates a plain hyphen). */
const FAMILY_HEADING = /^###\s+([A-Za-z0-9]+)\s+[—-]\s+/;

/**
 * A spec row. Only `id` and `State` are read back — the name and weight columns are
 * regenerated from the logic tables, so a reviewer mangling them is harmless. Inventing
 * an *id*, however, is caught by validateSelectionDoc().
 */
function parseRow(line: string, familyId: string, errors: string[]): SelectionRow | null {
  const cells = line.split('|').map(c => c.trim());
  // A markdown row is bounded by pipes, so split() yields empty first/last cells.
  if (cells.length < 2 || cells[0] !== '') return null;
  const body = cells.slice(1, -1);
  if (body.length < 4) {
    errors.push(`[${familyId}] row has ${body.length} columns, expected 5: ${line.trim()}`);
    return null;
  }
  const [, idCell, , stateCell, reasonCell] = body;

  const attributeId = idCell.replace(/`/g, '').trim();
  if (!attributeId) {
    errors.push(`[${familyId}] row is missing an attribute id: ${line.trim()}`);
    return null;
  }

  // Tolerate a decorative ⚠️/emoji prefix on the state, which the generator itself emits.
  const stateText = stateCell.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const state = LABEL_TO_STATE.get(stateText);
  if (!state) {
    errors.push(
      `[${familyId}] ${attributeId}: unknown state "${stateCell}". ` +
        `Must be one of: ${Object.values(STATE_LABELS).join(' | ')}`,
    );
    return null;
  }

  return { attributeId, state, reason: (reasonCell ?? '').replace(NEEDS_REVIEW, '').trim() };
}

export function parseSelectionDoc(md: string): { doc: ParsedDoc; errors: string[] } {
  const errors: string[] = [];
  const families = new Map<string, SelectionRow[]>();

  const notesAt = md.indexOf(NOTES_HEADING);
  const body = notesAt === -1 ? md : md.slice(0, notesAt);
  const notes = notesAt === -1 ? '' : md.slice(notesAt).trimEnd();

  let current: string | null = null;
  let seen = new Set<string>();

  for (const line of body.split('\n')) {
    const heading = line.match(FAMILY_HEADING);
    if (heading) {
      current = heading[1];
      seen = new Set();
      if (families.has(current)) errors.push(`[${current}] appears twice in the file`);
      families.set(current, []);
      continue;
    }
    if (!current || !line.trimStart().startsWith('|')) continue;
    if (/^\s*\|[\s|:-]+\|\s*$/.test(line)) continue; // separator row
    if (/^\s*\|\s*Spec\s*\|/i.test(line)) continue; // header row

    const row = parseRow(line, current, errors);
    if (!row) continue;
    if (seen.has(row.attributeId)) {
      errors.push(`[${current}] ${row.attributeId} is listed twice`);
      continue;
    }
    seen.add(row.attributeId);
    families.get(current)!.push(row);
  }

  return { doc: { families, notes }, errors };
}

// ─── Validate ─────────────────────────────────────────────────────────────────

/**
 * THE COMPLETENESS CHECK — the whole point of this module.
 *
 * Not "does every listed spec exist?" (the old test, which 536 holes passed) but
 * "is every spec the engine SCORES accounted for, with an explicit state?". Add a rule to
 * a logic table and forget this file → the build fails and someone has to decide. They may
 * still decide "Not Asked" — but now that is a line in a diff, not an invisible absence.
 *
 * No weight thresholds. A threshold is an invented heuristic and it fails both ways: it
 * would flag `tst` (storage temperature, weight 8, correctly never asked) and it would HIDE
 * C1's `vin_min` (weight 7, and plausibly a real omission). Completeness only.
 */
export function validateSelectionDoc(
  doc: ParsedDoc,
  registry: Record<string, LogicTable> = logicTableRegistry,
): string[] {
  const errors: string[] = [];

  for (const familyId of Object.keys(registry)) {
    const rows = doc.families.get(familyId);
    if (!rows) {
      errors.push(`Family ${familyId} (${registry[familyId].familyName}) is missing from the file entirely.`);
      continue;
    }
    const listed = new Set(rows.map(r => r.attributeId));
    const scored = new Set(registry[familyId].rules.map(r => r.attributeId));

    for (const rule of registry[familyId].rules) {
      if (!listed.has(rule.attributeId)) {
        errors.push(
          `[${familyId}] "${rule.attributeName}" (${rule.attributeId}, weight ${rule.weight}) is scored by the ` +
            `matching engine but has no row in the file. Add it with a state, or run \`npm run selection:audit\`.`,
        );
      }
    }
    for (const id of listed) {
      if (!scored.has(id)) {
        errors.push(
          `[${familyId}] "${id}" is listed in the file but no such rule exists in the logic table. ` +
            `Attribute ids may never be invented — use only the ids the file already lists.`,
        );
      }
    }
  }

  for (const familyId of doc.families.keys()) {
    if (!registry[familyId]) errors.push(`Family "${familyId}" is in the file but not in the logic-table registry.`);
  }

  return errors;
}

/**
 * Cross-family contradiction: the SAME attribute is asked in one family and silently
 * skipped in another that also scores it. Two decisions about the same thing that
 * disagree — so at least one is wrong. Threshold-free, evidence-backed, and it catches the
 * reported bug on its own (C2 switching regulators ask `vin_max`; C1 LDOs do not — so the
 * app never asked what voltage goes INTO a voltage regulator).
 *
 * These are REVIEW ITEMS, never auto-fixes: some are legitimate (a through-hole resistor
 * may genuinely key off `lead_spacing` rather than `package_case`).
 */
export interface Contradiction {
  attributeId: string;
  attributeName: string;
  maxWeight: number;
  askedIn: string[];
  skippedIn: string[];
  /**
   * Families that skip this spec WITHOUT recording a reason, while a sibling asks for it.
   * These are the actionable ones — an unreasoned skip is not a decision, it is an absence.
   * A skip that carries a reason is a deliberate divergence and needs no action.
   */
  unreasonedSkips: string[];
}

export function findContradictions(
  doc: ParsedDoc,
  registry: Record<string, LogicTable> = logicTableRegistry,
): Contradiction[] {
  const byAttr = new Map<
    string,
    { name: string; maxWeight: number; asked: string[]; skipped: string[]; unreasoned: string[] }
  >();

  for (const [familyId, table] of Object.entries(registry)) {
    const rows = doc.families.get(familyId);
    if (!rows) continue;
    const rowById = new Map(rows.map(r => [r.attributeId, r]));

    for (const rule of table.rules) {
      const row = rowById.get(rule.attributeId);
      if (!row) continue;
      const entry = byAttr.get(rule.attributeId) ?? {
        name: rule.attributeName,
        maxWeight: 0,
        asked: [],
        skipped: [],
        unreasoned: [],
      };
      entry.maxWeight = Math.max(entry.maxWeight, rule.weight);
      if (row.state === 'not_asked') {
        entry.skipped.push(familyId);
        if (!row.reason) entry.unreasoned.push(familyId);
      } else {
        entry.asked.push(familyId);
      }
      byAttr.set(rule.attributeId, entry);
    }
  }

  return [...byAttr.entries()]
    .filter(([, e]) => e.asked.length > 0 && e.skipped.length > 0)
    .map(([attributeId, e]) => ({
      attributeId,
      attributeName: e.name,
      maxWeight: e.maxWeight,
      askedIn: e.asked,
      skippedIn: e.skipped,
      unreasonedSkips: e.unreasoned,
    }))
    // Unreasoned skips first — those are the ones that still need a human.
    .sort(
      (a, b) =>
        (b.unreasonedSkips.length > 0 ? 1 : 0) - (a.unreasonedSkips.length > 0 ? 1 : 0) ||
        b.maxWeight - a.maxWeight ||
        a.attributeId.localeCompare(b.attributeId),
    );
}

/**
 * THE SAME SPEC, COMPARED DIFFERENTLY IN DIFFERENT FAMILIES.
 *
 * A sibling of findContradictions(), and it needs no more judgement than that one does: if 33
 * families compare a package by matching the text and 5 say "a human must eyeball it", at least
 * one group is wrong. Families disagreeing about the same thing is evidence, not opinion.
 *
 * This is how the package bug was found. `package_case` was `application_review` — a rule type
 * that scores EVERY candidate an identical 50% and can never separate two parts — in C6/C7/C8/
 * C9/C10, while 33 other families compared it exactly. All five ALSO required the user to state
 * their package, so the app asked the question and then threw the answer away. (The C8 rule's own
 * engineering note said "BLOCK substitutions with a different package size"; the code did the
 * opposite.)
 *
 * NOT every difference is a bug — a mica capacitor's dielectric genuinely has no better/worse
 * ranking the way an MLCC's does, so `identity` there is right and `identity_upgrade` would be
 * wrong. So these are REVIEW ITEMS surfaced in the document, never auto-fixes. What IS reported
 * as actionable is the sharp case: a family that cannot use an answer it asks the user for.
 */
export interface LogicTypeDivergence {
  attributeId: string;
  attributeName: string;
  /** logicType → families using it, majority first. */
  variants: Array<{ logicType: string; familyIds: string[] }>;
  /** Families that ASK the user for this spec but score it with a rule that cannot compare. */
  askedButUncomparable: string[];
}

/** Scores every candidate a flat 50% — it cannot separate two parts, whatever the user says. */
const CANNOT_COMPARE = new Set(['application_review', 'operational']);

export function findLogicTypeDivergences(
  doc: ParsedDoc,
  registry: Record<string, LogicTable> = logicTableRegistry,
): LogicTypeDivergence[] {
  const byAttr = new Map<string, { name: string; byType: Map<string, string[]> }>();

  for (const [familyId, table] of Object.entries(registry)) {
    for (const rule of table.rules) {
      const e = byAttr.get(rule.attributeId) ?? { name: rule.attributeName, byType: new Map() };
      e.byType.set(rule.logicType, [...(e.byType.get(rule.logicType) ?? []), familyId]);
      byAttr.set(rule.attributeId, e);
    }
  }

  const out: LogicTypeDivergence[] = [];
  for (const [attributeId, e] of byAttr) {
    if (e.byType.size < 2) continue;
    const variants = [...e.byType.entries()]
      .map(([logicType, familyIds]) => ({ logicType, familyIds }))
      .sort((a, b) => b.familyIds.length - a.familyIds.length);

    // The actionable case: we ASK for this spec, and that family's rule cannot compare it.
    const askedButUncomparable = variants
      .filter(v => CANNOT_COMPARE.has(v.logicType))
      .flatMap(v => v.familyIds)
      .filter(f => {
        const row = doc.families.get(f)?.find(r => r.attributeId === attributeId);
        return !!row && row.state !== 'not_asked';
      });

    out.push({ attributeId, attributeName: e.name, variants, askedButUncomparable });
  }

  return out.sort(
    (a, b) =>
      (b.askedButUncomparable.length > 0 ? 1 : 0) - (a.askedButUncomparable.length > 0 ? 1 : 0) ||
      b.variants[0].familyIds.length - a.variants[0].familyIds.length ||
      a.attributeId.localeCompare(b.attributeId),
  );
}

/**
 * Specs we ASK the user for and then CANNOT USE — regardless of whether any other family
 * disagrees. A question whose answer the engine structurally ignores is worse than no question.
 */
export function findAskedButUncomparable(
  doc: ParsedDoc,
  registry: Record<string, LogicTable> = logicTableRegistry,
): Array<{ familyId: string; attributeId: string; attributeName: string; logicType: string; weight: number }> {
  const out = [];
  for (const [familyId, table] of Object.entries(registry)) {
    for (const rule of table.rules) {
      if (!CANNOT_COMPARE.has(rule.logicType)) continue;
      const row = doc.families.get(familyId)?.find(r => r.attributeId === rule.attributeId);
      if (!row || row.state === 'not_asked') continue;
      out.push({
        familyId,
        attributeId: rule.attributeId,
        attributeName: rule.attributeName,
        logicType: rule.logicType,
        weight: rule.weight,
      });
    }
  }
  return out.sort((a, b) => b.weight - a.weight || a.familyId.localeCompare(b.familyId));
}

// ─── Merge (the audit refresh) ────────────────────────────────────────────────

/**
 * Reconcile the file against the live logic tables:
 *   - every scored rule gets a row (a new rule seeds as `Not Asked`, flagged for review)
 *   - a row whose rule no longer exists is dropped
 *   - existing states and reasons are PRESERVED
 *
 * Row order = ask order. Required rows keep their relative order (C1 must ask output type
 * and polarity before anything else — see the engineering notes), then narrows, then the
 * rest by weight descending so the biggest unreviewed omissions read first.
 */
export function mergeWithLogicTables(
  doc: ParsedDoc,
  registry: Record<string, LogicTable> = logicTableRegistry,
): ParsedDoc {
  const families = new Map<string, SelectionRow[]>();

  for (const [familyId, table] of Object.entries(registry)) {
    const existing = new Map((doc.families.get(familyId) ?? []).map(r => [r.attributeId, r]));
    const order = new Map((doc.families.get(familyId) ?? []).map((r, i) => [r.attributeId, i]));
    const weight = new Map(table.rules.map(r => [r.attributeId, r.weight]));

    const rows: SelectionRow[] = table.rules.map(rule => {
      const prev = existing.get(rule.attributeId);
      return prev ?? { attributeId: rule.attributeId, state: 'not_asked' as SelectionState, reason: '' };
    });

    const rank: Record<SelectionState, number> = { required: 0, narrows: 1, not_asked: 2 };
    rows.sort((a, b) => {
      if (rank[a.state] !== rank[b.state]) return rank[a.state] - rank[b.state];
      if (a.state === 'not_asked') {
        const dw = (weight.get(b.attributeId) ?? 0) - (weight.get(a.attributeId) ?? 0);
        if (dw !== 0) return dw;
      }
      // Preserve the order the file already had; brand-new rules sort last within their state.
      return (order.get(a.attributeId) ?? Infinity) - (order.get(b.attributeId) ?? Infinity);
    });

    families.set(familyId, rows);
  }

  return { families, notes: doc.notes };
}

// ─── Render ───────────────────────────────────────────────────────────────────

const REVIEW_PROMPT = `## How to run this review

Attach this whole file to Claude. Claude will not accept an attachment with an empty message
box, so paste this one line as the message — everything it needs is already in the file:

> Read the review prompt at the top of the attached file and carry out the review it describes.
> Return the complete corrected file in the identical format.

---

## Review prompt

You are reviewing which component specifications an electronics sourcing agent asks a user
about when they are choosing a part by description (rather than by part number).

Every spec below is scored by the app's matching engine today. For each one, decide which of
**three states** it belongs in, and put that exact wording in the **State** column:

| State | When the agent asks | Consequence of getting it wrong |
|---|---|---|
| \`Required for Search\` | **Always** — asked before any search runs, and it blocks the search. | Over-marking is the failure mode. Every extra spec here is another question the user must answer before seeing a single part. Mark 4–6 per family, not 20. |
| \`Narrows Results\` | **Only when the result set is too large to be useful** (roughly 20+ candidates). Optional; the user can skip. | This is where a spec goes when it genuinely helps pick between candidates but is not needed to run a sane search at all. |
| \`Not Asked\` | Never asked. | This is where silent holes hid. Choosing this is fine — but choose it *deliberately*. |

### Rules for the review

1. **Judge ANSWERABILITY, not just importance.** Weight is shown as *information*, never as the
   verdict. A user can state an input voltage; a user cannot state a thermal resistance or a
   storage temperature. A high weight on a spec the user cannot possibly know is still \`Not Asked\`.
2. **\`Required for Search\` must stay small.** It is asked every single time. A family with 20
   required specs interrogates the user for twenty turns before showing a part. That is a failure
   this product has already shipped once.
3. **The ORDER of the \`Required for Search\` rows IS the order the agent asks them.** Put the
   architecture-defining question first (for a regulator: fixed vs adjustable, before the voltage).
4. **NEVER invent an attribute id.** Use only the ids already in this file. A new id fails the
   build; it should not be produced in the first place.
5. **A \`Reason\` is optional** — most useful on a *surprising* skip, i.e. an important-looking spec
   you are deliberately leaving unasked. Rows marked ${NEEDS_REVIEW} are ones no human has ruled on yet.
6. **Return the file in the identical format**, so it re-ingests and validates.

Pay particular attention to the **cross-family contradictions** listed below: the same spec asked
in one family and silently skipped in another that also scores it. At least one of those two
decisions is wrong.

> **Status note — for whoever is running this review, not for the reviewer.**
> \`Required for Search\` decisions take effect as soon as the corrected file is applied and
> \`npm run selection:audit\` is run. \`Narrows Results\` decisions are **recorded but not yet acted
> on**: the step that asks a narrowing question when a search returns too many candidates has not
> been built, so today the agent asks *no* \`Narrows Results\` spec in any family. (That gap is the
> reason a search for a small-signal NPN stopped surfacing the obvious BC847 — gain is filed as a
> narrowing spec and was never asked.) The review is still worth doing now; those decisions land
> the moment that step ships.
`;

function coverageLine(rows: SelectionRow[]): string {
  const asked = rows.filter(r => r.state !== 'not_asked').length;
  return `Currently asks **${asked} of ${rows.length}** scored specs.`;
}

const escapePipes = (s: string) => s.replace(/\|/g, '\\|');

export function renderSelectionDoc(
  doc: ParsedDoc,
  registry: Record<string, LogicTable> = logicTableRegistry,
): string {
  const out: string[] = [];
  const totals = { specs: 0, asked: 0 };

  out.push('# Selection Questions — what the agent asks, per family');
  out.push('');
  out.push(
    '<!-- MANAGED FILE. This file is the SOURCE OF TRUTH for the agent\'s selection questions.',
    '     `npm run selection:audit` regenerates the spec names, ids and weights from the live logic',
    '     tables and PRESERVES the State/Reason columns. `npm run selection:check` fails the build if',
    '     any scored rule is missing a state. Edit State/Reason here — never in the admin UI, which is',
    '     read-only by design (two writable surfaces is the exact bug this file exists to fix). -->',
  );
  out.push('');
  out.push(REVIEW_PROMPT);
  out.push('---');
  out.push('');

  // Contradictions — surfaced to the reviewer as explicit work items.
  const contradictions = findContradictions(doc, registry);
  out.push('## Review items — cross-family contradictions');
  out.push('');
  const actionable = contradictions.filter(c => c.unreasonedSkips.length > 0);
  if (contradictions.length === 0) {
    out.push('None. Every spec is treated consistently across the families that score it.');
  } else {
    out.push(
      'The same spec is **asked** in one family and **not asked** in another that also scores it.',
      '',
      `**${actionable.length} need a decision** — the family that skips the spec records no reason, so nobody`,
      'has actually ruled on it. Those are listed first, marked **⚠**.',
      '',
      `The other **${contradictions.length - actionable.length}** are **deliberate divergences**: the skip carries a`,
      'reason, so the two families genuinely differ (a through-hole resistor really does key off lead spacing',
      'rather than package size). They are listed for transparency, not as work. Read the Reason column in the',
      'family table before changing one.',
      '',
      '| | Spec | id | Max weight | Asked in | Not asked in |',
      '|---|---|---|---|---|---|',
    );
    for (const c of contradictions) {
      const asked = c.askedIn.length > 6 ? `${c.askedIn.length} families` : c.askedIn.join(', ');
      const skipped = c.skippedIn
        .map(f => (c.unreasonedSkips.includes(f) ? `**${f}**` : f))
        .join(', ');
      out.push(
        `| ${c.unreasonedSkips.length ? '⚠' : ''} | ${escapePipes(c.attributeName)} | \`${c.attributeId}\` | ` +
          `${c.maxWeight} | ${asked} | ${skipped} |`,
      );
    }
  }
  out.push('');
  out.push('---');
  out.push('');

  // ── Specs we ask for and cannot use ─────────────────────────────────────────
  const uncomparable = findAskedButUncomparable(doc, registry);
  out.push('## Review items — specs we ASK you for, then IGNORE');
  out.push('');
  if (uncomparable.length === 0) {
    out.push('None. Every spec the agent asks about is one the engine can actually compare.');
  } else {
    out.push(
      'These specs are scored by a rule type that **cannot compare two parts** — it hands every',
      'candidate an identical half-mark, whatever you told us. So the agent asks the question and',
      'then throws the answer away. Either the rule type is wrong, or we should not be asking.',
      '',
      '| Family | Spec | id | Weight | Scored as |',
      '|---|---|---|---|---|',
    );
    for (const u of uncomparable) {
      out.push(
        `| ${u.familyId} | ${escapePipes(u.attributeName)} | \`${u.attributeId}\` | ${u.weight} | ` +
          `\`${u.logicType}\` |`,
      );
    }
  }
  out.push('');
  out.push('---');
  out.push('');

  // ── Same spec, compared differently across families ─────────────────────────
  const divergences = findLogicTypeDivergences(doc, registry);
  out.push('## Review items — the same spec, compared differently in different families');
  out.push('');
  if (divergences.length === 0) {
    out.push('None. Every spec is compared the same way everywhere it appears.');
  } else {
    out.push(
      `${divergences.length} specs are compared differently depending on the family. At least one`,
      'side of each is likely wrong — but **not all of them are bugs**: a mica capacitor\'s dielectric',
      'genuinely has no better/worse ranking the way an MLCC\'s does, so an exact match there is',
      'correct. Judge each on its merits. Rows marked **⚠** are the sharp case: a family that asks',
      'you for the spec and then scores it with a rule that cannot compare anything.',
      '',
      '| | Spec | id | How it is compared |',
      '|---|---|---|---|',
    );
    for (const d of divergences) {
      const how = d.variants
        .map(v => `\`${v.logicType}\` (${v.familyIds.length > 8 ? `${v.familyIds.length} families` : v.familyIds.join(', ')})`)
        .join(' · ');
      out.push(
        `| ${d.askedButUncomparable.length ? '⚠' : ''} | ${escapePipes(d.attributeName)} | ` +
          `\`${d.attributeId}\` | ${how} |`,
      );
    }
  }
  out.push('');
  out.push('---');
  out.push('');
  out.push('## Families');
  out.push('');

  for (const [familyId, table] of Object.entries(registry)) {
    const rows = doc.families.get(familyId) ?? [];
    const ruleById = new Map(table.rules.map(r => [r.attributeId, r]));
    totals.specs += rows.length;
    totals.asked += rows.filter(r => r.state !== 'not_asked').length;

    out.push(`### ${familyId} — ${table.familyName}`);
    out.push('');
    out.push(coverageLine(rows));
    out.push('');
    out.push('| Spec | id | Weight | State | Reason |');
    out.push('|---|---|---|---|---|');
    for (const row of rows) {
      const rule = ruleById.get(row.attributeId) as MatchingRule;
      const needsReview = row.state === 'not_asked' && !row.reason;
      const reason = row.reason || (needsReview ? NEEDS_REVIEW : '');
      out.push(
        `| ${escapePipes(rule.attributeName)} | \`${row.attributeId}\` | ${rule.weight} | ` +
          `${STATE_LABELS[row.state]} | ${escapePipes(reason)} |`,
      );
    }
    out.push('');
  }

  out.push('---');
  out.push('');
  out.push(
    `**Total: ${totals.specs} scored specs across ${Object.keys(registry).length} families. ` +
      `${totals.asked} asked, ${totals.specs - totals.asked} not asked.**`,
  );
  out.push('');

  if (doc.notes) {
    out.push(doc.notes);
    out.push('');
  }

  return out.join('\n');
}

/** The typed module the app reads. Generated — never hand-edited. */
export function renderGeneratedModule(doc: ParsedDoc, registry: Record<string, LogicTable> = logicTableRegistry): string {
  const lines: string[] = [];
  lines.push('// GENERATED FILE — DO NOT EDIT.');
  lines.push('// Source of truth: docs/min_attr_sets.md');
  lines.push('// Regenerate:      npm run selection:audit');
  lines.push('//');
  lines.push('// Hand-editing this file re-creates the bug it exists to prevent: a code copy of the');
  lines.push('// selection questions that is allowed to drift from the document describing them.');
  lines.push('');
  lines.push("import type { SelectionState } from './selectionDoc';");
  lines.push('');
  lines.push('export interface GeneratedSelectionEntry {');
  lines.push('  state: SelectionState;');
  lines.push('  reason?: string;');
  lines.push('}');
  lines.push('');
  lines.push('/** familyId → attributeId → state. Every scored rule in every family appears here. */');
  lines.push('export const SELECTION_STATES: Record<string, Record<string, GeneratedSelectionEntry>> = {');
  for (const familyId of Object.keys(registry)) {
    const rows = doc.families.get(familyId) ?? [];
    lines.push(`  '${familyId}': {`);
    for (const row of rows) {
      const reason = row.reason ? `, reason: ${JSON.stringify(row.reason)}` : '';
      lines.push(`    ${JSON.stringify(row.attributeId)}: { state: '${row.state}'${reason} },`);
    }
    lines.push('  },');
  }
  lines.push('};');
  lines.push('');
  lines.push('/**');
  lines.push(' * The ask lists, in ASK ORDER (which is the row order in the source document).');
  lines.push(' *   tier2 = Required for Search — always asked, before any search runs.');
  lines.push(' *   tier3 = Narrows Results     — asked only when the result set is too large to be useful.');
  lines.push(' */');
  lines.push("export const SELECTION_TIERS: Record<string, { tier2: string[]; tier3: string[] }> = {");
  for (const familyId of Object.keys(registry)) {
    const rows = doc.families.get(familyId) ?? [];
    const tier2 = rows.filter(r => r.state === 'required').map(r => r.attributeId);
    const tier3 = rows.filter(r => r.state === 'narrows').map(r => r.attributeId);
    const fmt = (ids: string[]) => (ids.length ? ids.map(i => `'${i}'`).join(', ') : '');
    lines.push(`  '${familyId}': { tier2: [${fmt(tier2)}], tier3: [${fmt(tier3)}] },`);
  }
  lines.push('};');
  lines.push('');
  return lines.join('\n');
}
