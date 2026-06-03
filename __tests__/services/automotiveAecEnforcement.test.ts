/**
 * Tests for the automotive AEC enforcement mechanism in partDataService.ts.
 *
 * Decision #220 refactored the per-family filter clones (Decisions #211, #219)
 * into a table-driven mechanism. The two exported helpers are:
 *
 *   1. `applyContextSourceOverrides` — clones the scoring-local source attrs
 *      and injects an AEC attribute (Yes) when the family's context answer
 *      matches the table. Makes the identity_flag rule fire so
 *      `sourceRequired=true` propagates into match evaluation.
 *
 *   2. `filterAutomotiveAecMismatches(recs, src, ctx, familyId)` — drops
 *      candidates whose AEC rule result is `fail`. With the source override
 *      above in place, missing candidate data → fail → drop. Looks up the
 *      family in AUTOMOTIVE_AEC_ENFORCEMENT to determine which attribute and
 *      which questionId to consult.
 *
 * Describe blocks are organized per family. They all exercise the same
 * generic helper — the family-specific framing documents the per-family
 * contract that's now table-encoded.
 */

import {
  applyContextSourceOverrides,
  filterAutomotiveAecMismatches,
  getAutomotiveAecEnforcementTable,
  hasAutomotiveAecEnforcement,
} from '@/lib/services/partDataService';
import type {
  ApplicationContext,
  PartAttributes,
  ParametricAttribute,
  XrefRecommendation,
  MatchDetail,
  RuleResult,
} from '@/lib/types';

// ============================================================
// HELPERS
// ============================================================

function makeParam(parameterId: string, value: string, parameterName?: string): ParametricAttribute {
  return {
    parameterId,
    parameterName: parameterName ?? parameterId,
    value,
    sortOrder: 0,
  };
}

function makeSourceAttrs(params: ParametricAttribute[] = []): PartAttributes {
  return {
    part: {
      mpn: 'SRC-MPN',
      manufacturer: 'TestMfr',
      description: 'Source part',
      detailedDescription: 'Source part',
      category: 'Discrete Semiconductors',
      subcategory: 'BJT',
      status: 'Active',
    },
    parameters: params,
  };
}

/**
 * Build an ApplicationContext with a single (questionId → answer) pair.
 * Most families use questionId='automotive', but D1/D2/E1/F1 carry
 * different ids — the helper accepts whatever the family declares so the
 * tests reflect what the matcher actually sees.
 */
function makeContext(answer: 'yes' | 'no' | undefined, questionId: string = 'automotive'): ApplicationContext {
  return {
    familyId: 'TEST',
    answers: answer === undefined ? {} : { [questionId]: answer },
  };
}

function makeMatchDetail(parameterId: string, ruleResult: RuleResult): MatchDetail {
  return {
    parameterId,
    parameterName: parameterId,
    sourceValue: 'Yes',
    replacementValue: ruleResult === 'pass' ? 'Yes' : 'No',
    matchStatus: ruleResult === 'pass' ? 'exact' : 'different',
    ruleResult,
  };
}

function makeRec(mpn: string, matchDetails: MatchDetail[]): XrefRecommendation {
  return {
    part: {
      mpn,
      manufacturer: 'TestMfr',
      description: 'x',
      detailedDescription: 'x',
      category: 'Discrete Semiconductors',
      subcategory: 'BJT',
      status: 'Active',
    },
    matchPercentage: 80,
    matchDetails,
  };
}

// ============================================================
// applyContextSourceOverrides — source-attribute injection
// ============================================================

describe('applyContextSourceOverrides — B6 BJT + automotive', () => {
  it('injects aec_q101: Yes when familyId=B6 and automotive=yes', () => {
    const src = makeSourceAttrs([makeParam('vce_max', '50 V')]);
    const result = applyContextSourceOverrides(src, makeContext('yes'), 'B6');

    const injected = result.parameters.find(p => p.parameterId === 'aec_q101');
    expect(injected).toBeDefined();
    expect(injected!.value).toBe('Yes');
    expect(injected!.parameterName).toBe('AEC-Q101 (Automotive Qualification)');
  });

  it('does NOT mutate the original sourceAttrs object', () => {
    const src = makeSourceAttrs([makeParam('vce_max', '50 V')]);
    const originalParamLength = src.parameters.length;
    applyContextSourceOverrides(src, makeContext('yes'), 'B6');

    expect(src.parameters.length).toBe(originalParamLength);
    expect(src.parameters.find(p => p.parameterId === 'aec_q101')).toBeUndefined();
  });

  it('returns the same object reference when no injections apply', () => {
    const src = makeSourceAttrs([makeParam('vce_max', '50 V')]);
    const result = applyContextSourceOverrides(src, makeContext('no'), 'B6');
    expect(result).toBe(src);
  });

  it('no-ops when automotive=no', () => {
    const src = makeSourceAttrs([]);
    const result = applyContextSourceOverrides(src, makeContext('no'), 'B6');
    expect(result.parameters.find(p => p.parameterId === 'aec_q101')).toBeUndefined();
  });

  it('no-ops when applicationContext is undefined', () => {
    const src = makeSourceAttrs([]);
    const result = applyContextSourceOverrides(src, undefined, 'B6');
    expect(result.parameters.find(p => p.parameterId === 'aec_q101')).toBeUndefined();
  });

  it('no-ops when familyId is not in the injection table', () => {
    const src = makeSourceAttrs([]);
    // C5 Logic ICs has no automotive AEC enforcement wired up here; use it as
    // the negative case. (Picking 12/MLCC also worked, but B-block families
    // are the natural neighbors for this test.)
    const result = applyContextSourceOverrides(src, makeContext('yes'), 'C5');
    expect(result.parameters.find(p => p.parameterId === 'aec_q101')).toBeUndefined();
  });

  it('injects aec_q101: Yes when familyId=B5 and automotive=yes (MOSFETs)', () => {
    const src = makeSourceAttrs([makeParam('vds_max', '60 V')]);
    const result = applyContextSourceOverrides(src, makeContext('yes'), 'B5');
    const injected = result.parameters.find(p => p.parameterId === 'aec_q101');
    expect(injected).toBeDefined();
    expect(injected!.value).toBe('Yes');
  });

  it('injects aec_q101: Yes when familyId=B7 and automotive=yes (IGBTs)', () => {
    const src = makeSourceAttrs([makeParam('vces', '1200 V')]);
    const result = applyContextSourceOverrides(src, makeContext('yes'), 'B7');
    const injected = result.parameters.find(p => p.parameterId === 'aec_q101');
    expect(injected).toBeDefined();
    expect(injected!.value).toBe('Yes');
  });

  it('injects aec_q100 (NOT q101) when familyId=C9 and automotive=yes (ADCs are ICs)', () => {
    const src = makeSourceAttrs([makeParam('resolution_bits', '12')]);
    const result = applyContextSourceOverrides(src, makeContext('yes'), 'C9');
    const q100 = result.parameters.find(p => p.parameterId === 'aec_q100');
    const q101 = result.parameters.find(p => p.parameterId === 'aec_q101');
    expect(q100).toBeDefined();
    expect(q100!.value).toBe('Yes');
    expect(q101).toBeUndefined();  // ICs use Q100, not Q101
  });

  it('clobbers an existing aec_q101 value when automotive=yes', () => {
    // Source explicitly says "No" but user signals automotive — the override
    // forces 'Yes' so the rule fires with sourceRequired=true and candidates
    // get filtered properly.
    const src = makeSourceAttrs([makeParam('aec_q101', 'No', 'AEC-Q101 (Automotive Qualification)')]);
    const result = applyContextSourceOverrides(src, makeContext('yes'), 'B6');

    const aec = result.parameters.find(p => p.parameterId === 'aec_q101');
    expect(aec!.value).toBe('Yes');
  });
});

// ============================================================
// filterAutomotiveAecMismatches — B6 (AEC-Q101)
// ============================================================

describe('filterAutomotiveAecMismatches — B6 BJT + automotive', () => {
  const passingRec = makeRec('PASS-1', [makeMatchDetail('aec_q101', 'pass' as RuleResult)]);
  const failingRec = makeRec('FAIL-1', [makeMatchDetail('aec_q101', 'fail' as RuleResult)]);
  const reviewRec = makeRec('REVIEW-1', [makeMatchDetail('aec_q101', 'review' as RuleResult)]);
  const noAecRec = makeRec('NO-AEC-1', [makeMatchDetail('vce_max', 'pass' as RuleResult)]);
  const src = makeSourceAttrs([makeParam('aec_q101', 'Yes')]);

  it('drops recs with aec_q101 ruleResult=fail when automotive=yes', () => {
    const recs = [passingRec, failingRec];
    const result = filterAutomotiveAecMismatches(recs, src, makeContext('yes'), 'B6');
    expect(result.map(r => r.part.mpn)).toEqual(['PASS-1']);
  });

  it('keeps recs with aec_q101 ruleResult=pass when automotive=yes', () => {
    const result = filterAutomotiveAecMismatches([passingRec], src, makeContext('yes'), 'B6');
    expect(result.length).toBe(1);
  });

  it('keeps recs with aec_q101 ruleResult=review when automotive=yes (review ≠ fail)', () => {
    const result = filterAutomotiveAecMismatches([reviewRec], src, makeContext('yes'), 'B6');
    expect(result.length).toBe(1);
  });

  it('keeps recs that have no aec_q101 entry in matchDetails (defensive — keep when uncertain)', () => {
    const result = filterAutomotiveAecMismatches([noAecRec], src, makeContext('yes'), 'B6');
    expect(result.length).toBe(1);
  });

  it('returns all recs unchanged when automotive=no', () => {
    const recs = [passingRec, failingRec, reviewRec, noAecRec];
    const result = filterAutomotiveAecMismatches(recs, src, makeContext('no'), 'B6');
    expect(result.length).toBe(4);
  });

  it('returns all recs unchanged when applicationContext is undefined', () => {
    const recs = [passingRec, failingRec];
    const result = filterAutomotiveAecMismatches(recs, src, undefined, 'B6');
    expect(result.length).toBe(2);
  });

  it('returns an empty array if every rec fails aec_q101 under automotive=yes', () => {
    const recs = [failingRec, failingRec];
    const result = filterAutomotiveAecMismatches(recs, src, makeContext('yes'), 'B6');
    expect(result).toEqual([]);
  });

  it('returns all recs unchanged when familyId is not in the table', () => {
    // C5 Logic ICs has no automotive AEC enforcement; the filter should be a no-op.
    const result = filterAutomotiveAecMismatches([passingRec, failingRec], src, makeContext('yes'), 'C5');
    expect(result.length).toBe(2);
  });
});

// ============================================================
// filterAutomotiveAecMismatches — B5 (AEC-Q101)
// ============================================================

describe('filterAutomotiveAecMismatches — B5 MOSFET + automotive', () => {
  const passingRec = makeRec('PASS-1', [makeMatchDetail('aec_q101', 'pass' as RuleResult)]);
  const failingRec = makeRec('FAIL-1', [makeMatchDetail('aec_q101', 'fail' as RuleResult)]);
  const reviewRec = makeRec('REVIEW-1', [makeMatchDetail('aec_q101', 'review' as RuleResult)]);
  const noAecRec = makeRec('NO-AEC-1', [makeMatchDetail('vds_max', 'pass' as RuleResult)]);
  const src = makeSourceAttrs([makeParam('aec_q101', 'Yes')]);

  it('drops recs with aec_q101 ruleResult=fail when automotive=yes', () => {
    const result = filterAutomotiveAecMismatches([passingRec, failingRec], src, makeContext('yes'), 'B5');
    expect(result.map(r => r.part.mpn)).toEqual(['PASS-1']);
  });

  it('keeps pass/review/no-aec recs when automotive=yes', () => {
    const result = filterAutomotiveAecMismatches([passingRec, reviewRec, noAecRec], src, makeContext('yes'), 'B5');
    expect(result.length).toBe(3);
  });

  it('returns all recs unchanged when automotive=no', () => {
    const recs = [passingRec, failingRec, reviewRec, noAecRec];
    const result = filterAutomotiveAecMismatches(recs, src, makeContext('no'), 'B5');
    expect(result.length).toBe(4);
  });

  it('returns all recs unchanged when applicationContext is undefined', () => {
    const result = filterAutomotiveAecMismatches([passingRec, failingRec], src, undefined, 'B5');
    expect(result.length).toBe(2);
  });
});

// ============================================================
// filterAutomotiveAecMismatches — B7 (AEC-Q101)
// ============================================================

describe('filterAutomotiveAecMismatches — B7 IGBT + automotive', () => {
  const passingRec = makeRec('PASS-1', [makeMatchDetail('aec_q101', 'pass' as RuleResult)]);
  const failingRec = makeRec('FAIL-1', [makeMatchDetail('aec_q101', 'fail' as RuleResult)]);
  const reviewRec = makeRec('REVIEW-1', [makeMatchDetail('aec_q101', 'review' as RuleResult)]);
  const noAecRec = makeRec('NO-AEC-1', [makeMatchDetail('vces', 'pass' as RuleResult)]);
  const src = makeSourceAttrs([makeParam('aec_q101', 'Yes')]);

  it('drops recs with aec_q101 ruleResult=fail when automotive=yes', () => {
    const result = filterAutomotiveAecMismatches([passingRec, failingRec], src, makeContext('yes'), 'B7');
    expect(result.map(r => r.part.mpn)).toEqual(['PASS-1']);
  });

  it('keeps pass/review/no-aec recs when automotive=yes', () => {
    const result = filterAutomotiveAecMismatches([passingRec, reviewRec, noAecRec], src, makeContext('yes'), 'B7');
    expect(result.length).toBe(3);
  });

  it('returns all recs unchanged when automotive=no', () => {
    const recs = [passingRec, failingRec, reviewRec, noAecRec];
    const result = filterAutomotiveAecMismatches(recs, src, makeContext('no'), 'B7');
    expect(result.length).toBe(4);
  });

  it('returns all recs unchanged when applicationContext is undefined', () => {
    const result = filterAutomotiveAecMismatches([passingRec, failingRec], src, undefined, 'B7');
    expect(result.length).toBe(2);
  });
});

// ============================================================
// filterAutomotiveAecMismatches — C9 (AEC-Q100 — note the difference)
// ============================================================

describe('filterAutomotiveAecMismatches — C9 ADC + automotive (AEC-Q100)', () => {
  // Note: parameterId is aec_q100 for ICs, not aec_q101 like the B-block.
  const passingRec = makeRec('PASS-1', [makeMatchDetail('aec_q100', 'pass' as RuleResult)]);
  const failingRec = makeRec('FAIL-1', [makeMatchDetail('aec_q100', 'fail' as RuleResult)]);
  const reviewRec = makeRec('REVIEW-1', [makeMatchDetail('aec_q100', 'review' as RuleResult)]);
  const noAecRec = makeRec('NO-AEC-1', [makeMatchDetail('resolution_bits', 'pass' as RuleResult)]);
  const src = makeSourceAttrs([makeParam('aec_q100', 'Yes')]);

  it('drops recs with aec_q100 ruleResult=fail when automotive=yes', () => {
    const result = filterAutomotiveAecMismatches([passingRec, failingRec], src, makeContext('yes'), 'C9');
    expect(result.map(r => r.part.mpn)).toEqual(['PASS-1']);
  });

  it('keeps pass/review/no-aec recs when automotive=yes', () => {
    const result = filterAutomotiveAecMismatches([passingRec, reviewRec, noAecRec], src, makeContext('yes'), 'C9');
    expect(result.length).toBe(3);
  });

  it('does NOT key on aec_q101 (q100 is the right attribute for ICs)', () => {
    // A C9 candidate carrying a Q101 fail should NOT be dropped by the ADC filter
    // since the C9 table entry is keyed on Q100. The filter consults the table
    // to find the right attributeId — making sure no copy-paste drift slipped in.
    const wrongAecRec = makeRec('WRONG-AEC', [makeMatchDetail('aec_q101', 'fail' as RuleResult)]);
    const result = filterAutomotiveAecMismatches([wrongAecRec], src, makeContext('yes'), 'C9');
    expect(result.length).toBe(1);
  });

  it('returns all recs unchanged when automotive=no', () => {
    const recs = [passingRec, failingRec, reviewRec, noAecRec];
    const result = filterAutomotiveAecMismatches(recs, src, makeContext('no'), 'C9');
    expect(result.length).toBe(4);
  });

  it('returns all recs unchanged when applicationContext is undefined', () => {
    const result = filterAutomotiveAecMismatches([passingRec, failingRec], src, undefined, 'C9');
    expect(result.length).toBe(2);
  });
});

// ============================================================
// AUTOMOTIVE_AEC_ENFORCEMENT — table-introspection invariants
// ============================================================

describe('AUTOMOTIVE_AEC_ENFORCEMENT — table invariants', () => {
  const table = getAutomotiveAecEnforcementTable();

  it('contains entries for the currently-shipping families (Decisions #211 / #219)', () => {
    const ids = table.map(e => e.familyId).sort();
    expect(ids).toEqual(expect.arrayContaining(['B5', 'B6', 'B7', 'C9']));
  });

  it('every entry uses a recognized AEC attribute id', () => {
    const valid = new Set(['aec_q100', 'aec_q101', 'aec_q200']);
    for (const e of table) {
      expect(valid.has(e.attributeId)).toBe(true);
    }
  });

  it('each familyId appears at most once', () => {
    const ids = table.map(e => e.familyId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('hasAutomotiveAecEnforcement reflects table membership', () => {
    for (const e of table) {
      expect(hasAutomotiveAecEnforcement(e.familyId)).toBe(true);
    }
    expect(hasAutomotiveAecEnforcement('C5')).toBe(false);
    expect(hasAutomotiveAecEnforcement('XX')).toBe(false);
  });
});
