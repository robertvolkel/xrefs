import {
  summarizeFamilyKnowledge,
  describeRuleComparison,
} from '@/lib/services/familyKnowledge';
import { getAllLogicTables, getLogicTable } from '@/lib/logicTables';
import { getAllContextConfigs } from '@/lib/contextQuestions';
import type { LogicType, MatchingRule } from '@/lib/types';

/**
 * Mutation-grade tests: each assertion is designed to FAIL if the corresponding
 * behavior in familyKnowledge.ts is broken (ranking inverted, engineeringReason
 * dropped, context questions omitted, null-family mishandled). Expectations are
 * derived from the REAL logic tables so they don't rot, but the asserted PROPERTIES
 * (order-by-weight, reason-substring-present) are independent of the implementation.
 */

// The family with the most rules — best exercise of ranking + the remainder list.
function richestFamily(): { familyId: string; rules: MatchingRule[] } {
  const tables = getAllLogicTables();
  const table = tables.reduce((best, t) =>
    t.rules.length > best.rules.length ? t : best,
  );
  return { familyId: table.familyId, rules: table.rules };
}

function lineIndexOf(text: string, attributeName: string): number {
  return text.indexOf(`- ${attributeName} [`);
}

describe('describeRuleComparison', () => {
  const types: LogicType[] = [
    'identity',
    'identity_range',
    'identity_upgrade',
    'identity_flag',
    'threshold',
    'fit',
    'application_review',
    'operational',
    'vref_check',
  ];

  it('returns a non-empty descriptor for every LogicType', () => {
    for (const t of types) {
      expect(describeRuleComparison(t)).toBeTruthy();
    }
  });

  it('distinguishes threshold direction (≥ vs ≤ vs superset)', () => {
    const gte = describeRuleComparison('threshold', 'gte');
    const lte = describeRuleComparison('threshold', 'lte');
    const sup = describeRuleComparison('threshold', 'range_superset');
    expect(gte).toContain('≥');
    expect(lte).toContain('≤');
    expect(new Set([gte, lte, sup]).size).toBe(3); // all distinct
  });
});

describe('summarizeFamilyKnowledge', () => {
  it('returns null for an unknown family (caller injects nothing)', () => {
    expect(summarizeFamilyKnowledge('NOT_A_FAMILY')).toBeNull();
  });

  it('includes the family name in the header', () => {
    const { familyId } = richestFamily();
    const table = getLogicTable(familyId)!;
    const out = summarizeFamilyKnowledge(familyId)!;
    expect(out).toContain(table.familyName);
  });

  it('ranks rules by weight (highest-weight rule appears before a lower-weight one)', () => {
    const { familyId, rules } = richestFamily();
    const ranked = [...rules].sort(
      (a, b) => b.weight - a.weight || a.sortOrder - b.sortOrder,
    );
    const top = ranked[0];
    // The lowest-weight rule still inside the detailed cap (both render as "- name [").
    const detailedCount = Math.min(10, ranked.length);
    const lastDetailed = ranked[detailedCount - 1];
    // Guard: the two must actually differ in weight for the order test to mean something.
    expect(top.weight).toBeGreaterThan(lastDetailed.weight);

    const out = summarizeFamilyKnowledge(familyId)!;
    const iTop = lineIndexOf(out, top.attributeName);
    const iLast = lineIndexOf(out, lastDetailed.attributeName);
    expect(iTop).toBeGreaterThanOrEqual(0);
    expect(iLast).toBeGreaterThanOrEqual(0);
    expect(iTop).toBeLessThan(iLast); // fails if ranking is inverted/removed
  });

  it('carries the engineeringReason of the top rule (not just its name)', () => {
    const { familyId, rules } = richestFamily();
    const top = [...rules].sort(
      (a, b) => b.weight - a.weight || a.sortOrder - b.sortOrder,
    )[0];
    const out = summarizeFamilyKnowledge(familyId)!;
    // A distinctive slice of the reason must be present — fails if reasons are dropped.
    const reasonSlice = top.engineeringReason.slice(0, 30);
    expect(reasonSlice.length).toBeGreaterThan(10);
    expect(out).toContain(reasonSlice);
  });

  it('lists the remaining spec dimensions by name when a family exceeds the reason cap', () => {
    const { familyId, rules } = richestFamily();
    expect(rules.length).toBeGreaterThan(10); // the richest family should exceed the cap
    const ranked = [...rules].sort(
      (a, b) => b.weight - a.weight || a.sortOrder - b.sortOrder,
    );
    const out = summarizeFamilyKnowledge(familyId)!;
    expect(out).toContain('Other spec dimensions');
    // An 11th-ranked rule's name should appear (in the remainder list).
    expect(out).toContain(ranked[10].attributeName);
  });

  it('renders the application-context questions for a family that has them', () => {
    const config = getAllContextConfigs()[0];
    const familyId = config.familyIds[0];
    const out = summarizeFamilyKnowledge(familyId);
    // familyKnowledge only renders context when the family also has a logic table.
    if (out && getLogicTable(familyId)) {
      expect(out).toContain('Application context');
      expect(out).toContain(config.questions[0].questionText);
    } else {
      // Otherwise assert we found SOME family with both, so the test isn't vacuous.
      const both = getAllContextConfigs()
        .flatMap((c) => c.familyIds)
        .find((id) => getLogicTable(id) && getContextQuestionsCount(id) > 0);
      expect(both).toBeDefined();
      const out2 = summarizeFamilyKnowledge(both!)!;
      expect(out2).toContain('Application context');
    }
  });

  it('always ends with the grounding-floor discipline note', () => {
    const { familyId } = richestFamily();
    const out = summarizeFamilyKnowledge(familyId)!;
    expect(out).toMatch(/does NOT authorize naming a specific part number/i);
  });
});

// Local helper (kept out of the module — test-only) to avoid importing an internal.
function getContextQuestionsCount(familyId: string): number {
  const cfg = getAllContextConfigs().find((c) => c.familyIds.includes(familyId));
  return cfg?.questions.length ?? 0;
}
