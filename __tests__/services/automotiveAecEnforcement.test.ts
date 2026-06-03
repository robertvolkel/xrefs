/**
 * Tests for the automotive AEC enforcement helpers in partDataService.ts.
 *
 * The two helpers together implement the rule-level enforcement pattern from
 * Decision #211 (B6 BJT PoC):
 *
 *   1. `applyContextSourceOverrides` clones the scoring-local source attrs
 *      and injects an AEC attribute (`aec_q101: 'Yes'` for B6) when the
 *      user signals automotive intent. Makes the identity_flag rule fire so
 *      `sourceRequired=true` propagates into match evaluation.
 *
 *   2. `filterXxxAutomotiveMismatches` drops candidates whose AEC rule
 *      result is `fail` from the scored output. With the source override
 *      above in place, missing candidate data → fail → drop.
 *
 * These tests exist primarily to lock the contract for the per-family filters
 * added in the B5/B7/C9 rollout following the B6 precedent.
 */

import {
  applyContextSourceOverrides,
  filterBjtAutomotiveMismatches,
  filterMosfetAutomotiveMismatches,
  filterIgbtAutomotiveMismatches,
  filterAdcAutomotiveMismatches,
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

function makeContext(automotive: 'yes' | 'no' | undefined): ApplicationContext {
  return {
    familyId: 'B6',
    answers: automotive === undefined ? {} : { automotive },
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
// filterBjtAutomotiveMismatches — post-scoring drop
// ============================================================

describe('filterBjtAutomotiveMismatches — B6 BJT + automotive', () => {
  const passingRec = makeRec('PASS-1', [makeMatchDetail('aec_q101', 'pass' as RuleResult)]);
  const failingRec = makeRec('FAIL-1', [makeMatchDetail('aec_q101', 'fail' as RuleResult)]);
  const reviewRec = makeRec('REVIEW-1', [makeMatchDetail('aec_q101', 'review' as RuleResult)]);
  const noAecRec = makeRec('NO-AEC-1', [makeMatchDetail('vce_max', 'pass' as RuleResult)]);
  const src = makeSourceAttrs([makeParam('aec_q101', 'Yes')]);

  it('drops recs with aec_q101 ruleResult=fail when automotive=yes', () => {
    const recs = [passingRec, failingRec];
    const result = filterBjtAutomotiveMismatches(recs, src, makeContext('yes'));
    expect(result.map(r => r.part.mpn)).toEqual(['PASS-1']);
  });

  it('keeps recs with aec_q101 ruleResult=pass when automotive=yes', () => {
    const result = filterBjtAutomotiveMismatches([passingRec], src, makeContext('yes'));
    expect(result.length).toBe(1);
  });

  it('keeps recs with aec_q101 ruleResult=review when automotive=yes (review ≠ fail)', () => {
    const result = filterBjtAutomotiveMismatches([reviewRec], src, makeContext('yes'));
    expect(result.length).toBe(1);
  });

  it('keeps recs that have no aec_q101 entry in matchDetails (defensive — keep when uncertain)', () => {
    const result = filterBjtAutomotiveMismatches([noAecRec], src, makeContext('yes'));
    expect(result.length).toBe(1);
  });

  it('returns all recs unchanged when automotive=no', () => {
    const recs = [passingRec, failingRec, reviewRec, noAecRec];
    const result = filterBjtAutomotiveMismatches(recs, src, makeContext('no'));
    expect(result.length).toBe(4);
  });

  it('returns all recs unchanged when applicationContext is undefined', () => {
    const recs = [passingRec, failingRec];
    const result = filterBjtAutomotiveMismatches(recs, src, undefined);
    expect(result.length).toBe(2);
  });

  it('returns an empty array if every rec fails aec_q101 under automotive=yes', () => {
    const recs = [failingRec, failingRec];
    const result = filterBjtAutomotiveMismatches(recs, src, makeContext('yes'));
    expect(result).toEqual([]);
  });
});

// ============================================================
// filterMosfetAutomotiveMismatches — B5 (AEC-Q101)
// ============================================================

describe('filterMosfetAutomotiveMismatches — B5 MOSFET + automotive', () => {
  const passingRec = makeRec('PASS-1', [makeMatchDetail('aec_q101', 'pass' as RuleResult)]);
  const failingRec = makeRec('FAIL-1', [makeMatchDetail('aec_q101', 'fail' as RuleResult)]);
  const reviewRec = makeRec('REVIEW-1', [makeMatchDetail('aec_q101', 'review' as RuleResult)]);
  const noAecRec = makeRec('NO-AEC-1', [makeMatchDetail('vds_max', 'pass' as RuleResult)]);
  const src = makeSourceAttrs([makeParam('aec_q101', 'Yes')]);

  it('drops recs with aec_q101 ruleResult=fail when automotive=yes', () => {
    const result = filterMosfetAutomotiveMismatches([passingRec, failingRec], src, makeContext('yes'));
    expect(result.map(r => r.part.mpn)).toEqual(['PASS-1']);
  });

  it('keeps pass/review/no-aec recs when automotive=yes', () => {
    const result = filterMosfetAutomotiveMismatches([passingRec, reviewRec, noAecRec], src, makeContext('yes'));
    expect(result.length).toBe(3);
  });

  it('returns all recs unchanged when automotive=no', () => {
    const recs = [passingRec, failingRec, reviewRec, noAecRec];
    const result = filterMosfetAutomotiveMismatches(recs, src, makeContext('no'));
    expect(result.length).toBe(4);
  });

  it('returns all recs unchanged when applicationContext is undefined', () => {
    const result = filterMosfetAutomotiveMismatches([passingRec, failingRec], src, undefined);
    expect(result.length).toBe(2);
  });
});

// ============================================================
// filterIgbtAutomotiveMismatches — B7 (AEC-Q101)
// ============================================================

describe('filterIgbtAutomotiveMismatches — B7 IGBT + automotive', () => {
  const passingRec = makeRec('PASS-1', [makeMatchDetail('aec_q101', 'pass' as RuleResult)]);
  const failingRec = makeRec('FAIL-1', [makeMatchDetail('aec_q101', 'fail' as RuleResult)]);
  const reviewRec = makeRec('REVIEW-1', [makeMatchDetail('aec_q101', 'review' as RuleResult)]);
  const noAecRec = makeRec('NO-AEC-1', [makeMatchDetail('vces', 'pass' as RuleResult)]);
  const src = makeSourceAttrs([makeParam('aec_q101', 'Yes')]);

  it('drops recs with aec_q101 ruleResult=fail when automotive=yes', () => {
    const result = filterIgbtAutomotiveMismatches([passingRec, failingRec], src, makeContext('yes'));
    expect(result.map(r => r.part.mpn)).toEqual(['PASS-1']);
  });

  it('keeps pass/review/no-aec recs when automotive=yes', () => {
    const result = filterIgbtAutomotiveMismatches([passingRec, reviewRec, noAecRec], src, makeContext('yes'));
    expect(result.length).toBe(3);
  });

  it('returns all recs unchanged when automotive=no', () => {
    const recs = [passingRec, failingRec, reviewRec, noAecRec];
    const result = filterIgbtAutomotiveMismatches(recs, src, makeContext('no'));
    expect(result.length).toBe(4);
  });

  it('returns all recs unchanged when applicationContext is undefined', () => {
    const result = filterIgbtAutomotiveMismatches([passingRec, failingRec], src, undefined);
    expect(result.length).toBe(2);
  });
});

// ============================================================
// filterAdcAutomotiveMismatches — C9 (AEC-Q100 — note the difference)
// ============================================================

describe('filterAdcAutomotiveMismatches — C9 ADC + automotive (AEC-Q100)', () => {
  // Note: parameterId is aec_q100 for ICs, not aec_q101 like the B-block.
  const passingRec = makeRec('PASS-1', [makeMatchDetail('aec_q100', 'pass' as RuleResult)]);
  const failingRec = makeRec('FAIL-1', [makeMatchDetail('aec_q100', 'fail' as RuleResult)]);
  const reviewRec = makeRec('REVIEW-1', [makeMatchDetail('aec_q100', 'review' as RuleResult)]);
  const noAecRec = makeRec('NO-AEC-1', [makeMatchDetail('resolution_bits', 'pass' as RuleResult)]);
  const src = makeSourceAttrs([makeParam('aec_q100', 'Yes')]);

  it('drops recs with aec_q100 ruleResult=fail when automotive=yes', () => {
    const result = filterAdcAutomotiveMismatches([passingRec, failingRec], src, makeContext('yes'));
    expect(result.map(r => r.part.mpn)).toEqual(['PASS-1']);
  });

  it('keeps pass/review/no-aec recs when automotive=yes', () => {
    const result = filterAdcAutomotiveMismatches([passingRec, reviewRec, noAecRec], src, makeContext('yes'));
    expect(result.length).toBe(3);
  });

  it('does NOT key on aec_q101 (q100 is the right attribute for ICs)', () => {
    // A C9 candidate carrying a Q101 fail should NOT be dropped by the ADC filter
    // since the ADC rule is keyed on Q100. The filter's lookup explicitly uses
    // 'aec_q100' — making sure no copy-paste drift slipped in.
    const wrongAecRec = makeRec('WRONG-AEC', [makeMatchDetail('aec_q101', 'fail' as RuleResult)]);
    const result = filterAdcAutomotiveMismatches([wrongAecRec], src, makeContext('yes'));
    expect(result.length).toBe(1);
  });

  it('returns all recs unchanged when automotive=no', () => {
    const recs = [passingRec, failingRec, reviewRec, noAecRec];
    const result = filterAdcAutomotiveMismatches(recs, src, makeContext('no'));
    expect(result.length).toBe(4);
  });

  it('returns all recs unchanged when applicationContext is undefined', () => {
    const result = filterAdcAutomotiveMismatches([passingRec, failingRec], src, undefined);
    expect(result.length).toBe(2);
  });
});
