import { pickNarrowingQuestion } from '@/lib/services/guidedSelection';
import type { PartAttributes } from '@/lib/types';

/**
 * The narrowing step: after a search comes back too big to be useful, ask ONE question that
 * actually splits the pool — chosen from the DATA, not from a hand-ranked list per family.
 *
 * The pool fixtures below mirror the real BJT pool measured off the live catalog (50 parts,
 * ~60% carrying a gain figure, gains spread 100-420, AEC present on only a quarter of them).
 */

const CAT = 'Discrete Semiconductors' as PartAttributes['part']['category'];

function part(mpn: string, params: Record<string, string>): PartAttributes {
  return {
    part: { mpn, manufacturer: 'onsemi', description: 'NPN', detailedDescription: 'NPN', category: CAT, subcategory: 'BJT', status: 'Active' },
    parameters: Object.entries(params).map(([parameterId, value], i) => ({
      parameterId,
      parameterName: parameterId,
      value,
      // The catalog's real landmine: for gain this field is the TEST CONDITION, not the gain.
      numericValue: parameterId === 'hfe' ? 0.002 : undefined,
      sortOrder: i,
    })),
  };
}

/** 30 parts with a spread of gains (like the real pool), 20 with none at all. */
function realisticBjtPool(): PartAttributes[] {
  const gains = ['110 @ 2mA, 5V', '200 @ 2mA, 5V', '420 @ 2mA, 5V', '100 @ 10mA, 1V', '250 @ 2mA, 5V', '150 @ 2mA, 5V'];
  const pool: PartAttributes[] = [];
  for (let i = 0; i < 30; i++) {
    pool.push(part(`WITH-GAIN-${i}`, { hfe: gains[i % gains.length], vce_sat: `${(0.1 + (i % 5) * 0.1).toFixed(1)} V` }));
  }
  for (let i = 0; i < 20; i++) pool.push(part(`NO-GAIN-${i}`, {}));
  return pool;
}

describe('pickNarrowingQuestion', () => {
  // The DOCUMENT decides which of the usable questions to ask (tier3 order = the reviewed
  // judgement), the DATA only decides which are usable at all. Gain is B6's first narrowing spec,
  // so a pool where gain genuinely splits gets asked about gain — with zero B6-specific code.
  it('asks the highest-ranked narrowing spec the pool can actually support', () => {
    const q = pickNarrowingQuestion('B6', new Set(['polarity', 'vceo_max', 'ic_max', 'package_case']), realisticBjtPool());
    expect(q).not.toBeNull();
    expect(q!.attributeId).toBe('hfe');
    expect(q!.poolSize).toBe(50);
  });

  // ⚠️ Split quality is a GATE, not a ranking. Measured: gain vs saturation voltage scored
  // 0.90/0.85 read from enriched attributes and 0.71/0.92 read from the search projection — the
  // ORDER FLIPS with the data source. Ranking on it would change the question a user is asked
  // based on invisible plumbing. So a spec that splits the pool merely *adequately* still wins if
  // the document ranks it higher than one that splits it beautifully.
  it('does NOT let a better-splitting spec outrank a higher-ranked one — entropy vetoes, it does not vote', () => {
    // vce_sat splits perfectly (4 even buckets); hfe splits adequately but is doc#0.
    const pool = Array.from({ length: 40 }, (_, i) =>
      part(`P-${i}`, {
        hfe: i < 30 ? '200 @ 2mA, 5V' : '420 @ 2mA, 5V',        // lopsided 30/10, but real
        vce_sat: `${(0.1 + (i % 4) * 0.2).toFixed(1)} V`,       // a perfectly even 4-way split
      }));
    expect(pickNarrowingQuestion('B6', new Set(['polarity']), pool)!.attributeId).toBe('hfe');
  });

  it('offers value RANGES drawn from the pool, never a free-text box', () => {
    const q = pickNarrowingQuestion('B6', new Set(['polarity']), realisticBjtPool())!;
    expect(q.options.length).toBeGreaterThanOrEqual(2);
    // Every option must parse as an explicit range — that is what makes the answer a BAND
    // (statedBands refuses a bare number, whose direction is unknowable).
    for (const o of q.options) expect(o).toMatch(/^-?[\d.]+ - -?[\d.]+$/);
  });

  // The convergence guarantee. This product's documented worst behaviour is "never stops asking"
  // (27 questions before showing a MOSFET). A narrowing ANSWER lands in the answered set, so the
  // count of answered narrowing specs IS the number of questions already asked — no counter, no
  // state channel, nothing to fall out of sync.
  it('asks AT MOST ONE narrowing question — a pool that is still big afterwards is presented, not re-interrogated', () => {
    const answeredAfterNarrowing = new Set(['polarity', 'vceo_max', 'ic_max', 'package_case', 'hfe']);
    expect(pickNarrowingQuestion('B6', answeredAfterNarrowing, realisticBjtPool())).toBeNull();
  });

  it('an "any" answer also terminates the flow (it is answered, just without a value)', () => {
    // The extractor reports a waived spec with value null — it lands in the answered set exactly
    // like a real answer, so the user is never re-asked something they explicitly waived.
    expect(pickNarrowingQuestion('B6', new Set(['hfe']), realisticBjtPool())).toBeNull();
  });

  it('does not fire on a pool that is already small enough to be useful', () => {
    expect(pickNarrowingQuestion('B6', new Set(['polarity']), realisticBjtPool().slice(0, 12))).toBeNull();
  });

  it('skips a spec most of the pool does not carry — it cannot sort what it does not describe', () => {
    // AEC scored a 0.89 split on the live pool but only 26% of parts carry the field. Without a
    // coverage gate it would have won, and asked a question about a spec three-quarters of the
    // candidates are silent on.
    const pool = realisticBjtPool().map((p, i) =>
      i < 10 ? part(`AEC-${i}`, { aec_q101: i % 2 ? 'Yes' : 'No' }) : p);
    const q = pickNarrowingQuestion('B6', new Set(['polarity']), pool);
    expect(q?.attributeId).not.toBe('aec_q101');
  });

  it('skips a spec every part shares — a question that cannot divide the pool is noise', () => {
    const identical = Array.from({ length: 40 }, (_, i) => part(`SAME-${i}`, { hfe: '200 @ 2mA, 5V' }));
    const q = pickNarrowingQuestion('B6', new Set(['polarity']), identical);
    expect(q?.attributeId).not.toBe('hfe');
  });

  it('returns null when nothing can split the pool at all', () => {
    const blank = Array.from({ length: 40 }, (_, i) => part(`BLANK-${i}`, {}));
    expect(pickNarrowingQuestion('B6', new Set(['polarity']), blank)).toBeNull();
  });

  it('is deterministic — the same pool always yields the same question', () => {
    const pool = realisticBjtPool();
    const a = pickNarrowingQuestion('B6', new Set(['polarity']), pool);
    const b = pickNarrowingQuestion('B6', new Set(['polarity']), [...pool].reverse());
    expect(a!.attributeId).toBe(b!.attributeId);
    expect(a!.options).toEqual(b!.options);
  });

  it('returns null for an unknown family rather than throwing', () => {
    expect(pickNarrowingQuestion('ZZ', new Set(), realisticBjtPool())).toBeNull();
  });
});
