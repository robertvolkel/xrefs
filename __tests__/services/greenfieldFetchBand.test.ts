import { pickNumericValueIds } from '@/lib/services/greenfieldParametricFetch';
import { effectiveThresholdDirection } from '@/lib/services/matchingEngine';
import { getLogicTable } from '@/lib/logicTables';
import type { MatchingRule } from '@/lib/types';

/** A Digikey parametric facet, shaped like the real thing. */
const facet = (name: string, values: Array<[string, number]>) =>
  ({
    ParameterId: 1,
    ParameterName: name,
    FilterValues: values.map(([ValueName, ProductCount], i) => ({
      ValueId: String(i + 1),
      ValueName,
      ProductCount,
    })),
  }) as Parameters<typeof pickNumericValueIds>[0];

const rule = (over: Partial<MatchingRule>): MatchingRule => ({
  attributeId: 'x',
  attributeName: 'X',
  logicType: 'threshold',
  weight: 5,
  engineeringReason: '',
  sortOrder: 1,
  ...over,
});

const names = (f: ReturnType<typeof facet>, ids: string[]) =>
  (f.FilterValues ?? []).filter(v => ids.includes(v.ValueId)).map(v => v.ValueName);

describe('effectiveThresholdDirection — ONE definition, shared by the engine and the fetch', () => {
  it('`fit` compares as "no more than" (lte) — the engine has always evaluated it that way', () => {
    expect(effectiveThresholdDirection(rule({ logicType: 'fit' }))).toBe('lte');
  });

  it('a threshold defaults to gte', () => {
    expect(effectiveThresholdDirection(rule({ logicType: 'threshold' }))).toBe('gte');
    expect(effectiveThresholdDirection(rule({ logicType: 'threshold', thresholdDirection: 'lte' }))).toBe('lte');
  });

  it('a non-comparison rule has no direction', () => {
    expect(effectiveThresholdDirection(rule({ logicType: 'identity' }))).toBeNull();
    expect(effectiveThresholdDirection(undefined)).toBeNull();
  });
});

/**
 * THE BUG THAT BURIED THE BC847.
 *
 * A "gte" spec means "the part must be RATED for at least X". The fetch used to band that as
 * [X, X×10] — quietly asserting that a part rated far above what you need is a worse answer.
 * It is not: headroom on a maximum rating is free. Ask for a transistor for a circuit drawing
 * 2 mA and the old band fetched only parts *rated* 2–20 mA, so every ordinary small-signal NPN
 * (rated 100 mA — the BC847, the 2N3904, all of them) was excluded BY CONSTRUCTION.
 */
describe('gte band — headroom on a maximum rating is FREE (no upper bound)', () => {
  const ic = facet('Current - Collector (Ic) (Max)', [
    ['3mA', 40], ['10mA', 900], ['20mA', 500],
    ['100mA', 5000],   // ← the BC847 / 2N3904 rating. The old ×10 band excluded this.
    ['500mA', 3000], ['1A', 2000],
  ]);
  const icRule = rule({ attributeId: 'ic_max', logicType: 'threshold', thresholdDirection: 'gte' });

  it('a 2 mA ask KEEPS the 100 mA parts — the regression that lost the BC847', () => {
    const picked = names(ic, pickNumericValueIds(ic, 0.002, icRule));
    expect(picked).toContain('100mA');
    expect(picked).toContain('1A');
  });

  it('and still never admits a part rated BELOW what was asked for', () => {
    const picked = names(ic, pickNumericValueIds(ic, 0.05, icRule)); // need 50 mA
    expect(picked).not.toContain('3mA');
    expect(picked).not.toContain('10mA');
    expect(picked).not.toContain('20mA');
    expect(picked).toContain('100mA');
  });

  it('the pool stays bounded by popularity, so removing the ceiling cannot flood it', () => {
    const many = facet('V', Array.from({ length: 60 }, (_, i) => [`${i + 1}V`, 100 - i] as [string, number]));
    expect(pickNumericValueIds(many, 1, rule({ logicType: 'threshold' }))).toHaveLength(25);
  });
});

/**
 * THE MIRROR-IMAGE BUG, found while fixing the first.
 *
 * `fit` (height, diameter) means "the part must be no BIGGER than this". The engine has always
 * evaluated it as lte — but the fetch banded it with the gte branch. Ask for "height ≤ 1 mm" and
 * it went to Digikey for parts 1–10 mm tall: precisely the parts that CANNOT FIT.
 * 31 rules across 25 families. The fetch's own doc comment said "lte/fit → [0, v]" — the comment
 * was right and the code was wrong, which is what a second copy of a truth eventually becomes.
 */
describe('fit band — a part that must FIT is SMALLER, not bigger', () => {
  // NOTE ON UNITS: lengths are handled in MILLIMETRES throughout, not metres — `toBaseSI(x,'mm')`
  // returns x unchanged (while a bare 'm' is read as the milli PREFIX). Source and facet agree,
  // so the comparison is self-consistent. Hence `required = 1` here means 1 mm, not 1 metre.
  const height = facet('Height - Seated (Max)', [
    ['0.5mm', 800], ['0.8mm', 900], ['1mm', 700],
    ['2mm', 600], ['5mm', 400], ['10mm', 200],
  ]);
  const fitRule = rule({ attributeId: 'height', logicType: 'fit' });

  it('"height ≤ 1 mm" fetches parts that FIT — never the 2–10 mm ones that cannot', () => {
    const picked = names(height, pickNumericValueIds(height, 1, fitRule));
    expect(picked).toEqual(expect.arrayContaining(['0.5mm', '0.8mm', '1mm']));
    expect(picked).not.toContain('2mm');
    expect(picked).not.toContain('5mm');
    expect(picked).not.toContain('10mm'); // the old band fetched EXACTLY these
  });

  it('every real `fit` rule in every family now bands downward', () => {
    // 31 rules across 25 families were banded backwards. Pin the whole class, not one example.
    const fitRules = ['12', '52', '58', '59', '64', '71', 'B1', 'B5']
      .map(f => getLogicTable(f)!.rules.find(r => r.logicType === 'fit'))
      .filter(Boolean) as MatchingRule[];
    expect(fitRules.length).toBeGreaterThan(0);
    for (const r of fitRules) {
      expect(effectiveThresholdDirection(r)).toBe('lte');
      const picked = names(height, pickNumericValueIds(height, 1, r));
      expect(picked).not.toContain('10mm');
    }
  });
});

describe('the other bands are untouched', () => {
  const cap = facet('Capacitance', [['0.9µF', 10], ['1µF', 900], ['1.1µF', 10], ['10µF', 500]]);

  it('identity stays an exact-ish match — a 1 µF ask must not pull in 10 µF', () => {
    const picked = names(cap, pickNumericValueIds(cap, 1e-6, rule({ logicType: 'identity' })));
    expect(picked).toEqual(['1µF']);
  });

  it('lte still bands downward', () => {
    const esr = facet('ESR', [['10mOhm', 100], ['50mOhm', 200], ['500mOhm', 50]]);
    const picked = names(esr, pickNumericValueIds(esr, 0.1, rule({ logicType: 'threshold', thresholdDirection: 'lte' })));
    expect(picked).toEqual(expect.arrayContaining(['10mOhm', '50mOhm']));
    expect(picked).not.toContain('500mOhm');
  });
});
