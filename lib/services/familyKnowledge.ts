/**
 * Family engineering knowledge — grounded reasoning INPUT for the chat orchestrator.
 *
 * The matching engine's 43 logic tables already encode, per component family, WHICH
 * attributes matter, how much (`weight`), how they're compared (`logicType`), and WHY
 * (a paragraph `engineeringReason` on every rule). Chat barely uses this today: the model
 * reasons about component engineering from training-data memory, which is where the
 * "what matters for a MOSFET / why is this a good cross" answers drift.
 *
 * `summarizeFamilyKnowledge(familyId)` renders that rulebook into a compact, labeled
 * context block the orchestrator injects into the turn (see the chat redesign plan,
 * Phase 1 Track A). It is INPUT only — it changes nothing about how answers are rendered,
 * and it deliberately ends with a grounding-floor reminder so the extra material licenses
 * *explaining which specs matter*, never *inventing* a part number or a target value.
 *
 * Pure + side-effect-free (reads only the in-memory logic tables + context questions), so
 * it's unit-testable and safe to call on every routed turn.
 */

import { getLogicTable } from '../logicTables';
import { getContextQuestionsForFamily } from '../contextQuestions';
import type { LogicType, MatchingRule, ThresholdDirection } from '../types';

/** How many rules get a full `engineeringReason`; the rest are listed by name only.
 *  Keeps the injected block bounded (the reasons are paragraphs) while still naming the
 *  whole spec set so the model knows what exists. */
const FULL_REASON_RULE_CAP = 10;

/**
 * A plain-language descriptor of how a rule is compared, derived from `logicType`
 * (+ `thresholdDirection`). Used so the model reads "must be ≥ the source" rather than
 * the internal enum. Kept exhaustive over `LogicType` so a new type surfaces here.
 */
export function describeRuleComparison(
  logicType: LogicType,
  direction?: ThresholdDirection,
): string {
  switch (logicType) {
    case 'identity':
      return 'must match';
    case 'identity_range':
      return 'range must overlap the source';
    case 'identity_upgrade':
      return 'must match or be superior';
    case 'identity_flag':
      return 'required if the source has it';
    case 'threshold':
      if (direction === 'gte') return 'must be ≥ the source';
      if (direction === 'lte') return 'must be ≤ the source';
      if (direction === 'range_superset') return "range must cover the source's";
      return 'numeric comparison';
    case 'fit':
      return 'must physically fit (≤ the source)';
    case 'application_review':
      return 'needs human review (not automatable)';
    case 'operational':
      return 'non-electrical (packaging / supply chain)';
    case 'vref_check':
      return 'cross-checked against Vout (±2%)';
    default: {
      // Exhaustiveness guard: if LogicType gains a member, TS errors here.
      const _never: never = logicType;
      return _never;
    }
  }
}

/** Rank rules for display: highest weight first, then the table's own sortOrder. Stable,
 *  non-mutating (operates on a copy). */
function rankRules(rules: MatchingRule[]): MatchingRule[] {
  return [...rules].sort((a, b) => b.weight - a.weight || a.sortOrder - b.sortOrder);
}

/**
 * Render a family's engineering knowledge as a labeled context block, or `null` when the
 * family has no logic table (caller simply injects nothing).
 */
export function summarizeFamilyKnowledge(familyId: string): string | null {
  const table = getLogicTable(familyId);
  if (!table || table.rules.length === 0) return null;

  const ranked = rankRules(table.rules);
  const detailed = ranked.slice(0, FULL_REASON_RULE_CAP);
  const remainder = ranked.slice(FULL_REASON_RULE_CAP);

  const lines: string[] = [];
  lines.push(
    `[Family engineering knowledge — ${table.familyName} (${table.category}) — grounded, for reasoning]`,
  );
  if (table.description) lines.push(table.description);

  lines.push('');
  lines.push('What matters most, and why (ranked by importance):');
  for (const rule of detailed) {
    const cmp = describeRuleComparison(rule.logicType, rule.thresholdDirection);
    let head = `- ${rule.attributeName} [${cmp}, weight ${rule.weight}]`;
    if (rule.logicType === 'identity_upgrade' && rule.upgradeHierarchy?.length) {
      head += ` (best→worst: ${rule.upgradeHierarchy.join(' > ')})`;
    }
    lines.push(`${head}: ${rule.engineeringReason}`);
  }

  if (remainder.length > 0) {
    lines.push('');
    lines.push(
      `Other spec dimensions this family also considers: ${remainder
        .map((r) => r.attributeName)
        .join(', ')}.`,
    );
  }

  const ctx = getContextQuestionsForFamily(familyId);
  if (ctx && ctx.questions.length > 0) {
    lines.push('');
    lines.push(
      `Application context that shifts which specs are gating (context-sensitivity: ${ctx.contextSensitivity}):`,
    );
    for (const q of [...ctx.questions].sort((a, b) => a.priority - b.priority)) {
      const opts = q.options.map((o) => o.label).join(' / ');
      lines.push(opts ? `- ${q.questionText} (${opts})` : `- ${q.questionText}`);
    }
  }

  lines.push('');
  lines.push(
    'Use this to explain WHICH specs matter and WHY. It does NOT authorize naming a ' +
      'specific part number, manufacturer, or target value from memory — those must come ' +
      'from a tool/search result, per the grounding floor.',
  );

  return lines.join('\n');
}
