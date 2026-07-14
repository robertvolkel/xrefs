import { parseStatedBands, widenBandForFetch, countStatedBandViolations } from '@/lib/services/statedBands';
import { getLogicTable } from '@/lib/logicTables';
import type { PartAttributes } from '@/lib/types';

const B5 = getLogicTable('B5')!;
const B6 = getLogicTable('B6')!;
const R52 = getLogicTable('52')!;

/** A BJT candidate carrying its gain EXACTLY as the live Digikey catalog does — the value is the
 *  part's MINIMUM gain followed by the test condition it was measured at. Verified against the
 *  real catalog: `numericValue` is 0.002, i.e. the 2 mA, NOT the gain. Any code reading it gets
 *  the test current. These fixtures carry that landmine on purpose. */
function bjt(mpn: string, gain: string): PartAttributes {
  return {
    part: {
      mpn, manufacturer: 'onsemi', description: 'NPN', detailedDescription: 'NPN',
      category: 'Discrete Semiconductors' as PartAttributes['part']['category'],
      subcategory: 'BJT', status: 'Active',
    },
    parameters: [
      { parameterId: 'hfe', parameterName: 'DC Current Gain (hFE)', value: gain, numericValue: 0.002, sortOrder: 1 },
    ],
  };
}

describe('parseStatedBands — the shapes a stated range actually arrives in', () => {
  it('a "lo-hi" range value → a two-sided band', () => {
    const bands = parseStatedBands([{ attribute: 'hfe', value: '200-400' }], B6);
    expect(bands.get('hfe')).toMatchObject({ lo: 200, hi: 400 });
  });

  it('en-dash, tilde and "to" all read as ranges (the model picks whichever it likes)', () => {
    for (const v of ['200–400', '200 ~ 400', '200 to 400']) {
      expect(parseStatedBands([{ attribute: 'hfe', value: v }], B6).get('hfe')).toMatchObject({ lo: 200, hi: 400 });
    }
  });

  // These assert PARSING (how a bound arrives), so they use a spec where BOTH ends bind. The
  // earlier version of this suite asserted a two-sided band on `id_max` / `vds_max` — which are
  // MAX-RATING rules, where a two-sided band is the bug. Those tests PASSED and pinned it.
  // Direction is now asserted separately, below.
  it('separate min/max constraints → one two-sided band', () => {
    const bands = parseStatedBands(
      [{ attribute: 'hfe min', value: 200 }, { attribute: 'hfe max', value: 400 }],
      B6,
    );
    expect(bands.get('hfe')).toMatchObject({ lo: 200, hi: 400 });
  });

  it('UNDERSCORE-delimited min/max labels (hFE_min / hFE_max) — `\\b` does not break before `_`, so a naive word-boundary test misses these entirely', () => {
    const bands = parseStatedBands(
      [{ attribute: 'hFE_min', value: 200 }, { attribute: 'hFE_max', value: 400 }],
      B6,
    );
    expect(bands.get('hfe')).toMatchObject({ lo: 200, hi: 400 });
  });

  it('min-only → [v, ∞); max-only → (-∞, v]', () => {
    expect(parseStatedBands([{ attribute: 'hfe min', value: 200 }], B6).get('hfe')).toMatchObject({ lo: 200, hi: Infinity });
    expect(parseStatedBands([{ attribute: 'hfe max', value: 400 }], B6).get('hfe')).toMatchObject({ lo: -Infinity, hi: 400 });
  });

  it('normalizes SI prefixes to base units (1000 mA ≡ 1 A)', () => {
    // `capacitance` is an identity spec — both ends bind — so this isolates unit normalization.
    const bands = parseStatedBands([{ attribute: 'capacitance', value: '100-1000', unit: 'nF' }], getLogicTable('12')!);
    expect(bands.get('capacitance')!.lo).toBeCloseTo(1e-7, 12);
    expect(bands.get('capacitance')!.hi).toBeCloseTo(1e-6, 12);
  });

  it('two plain values for the same attribute → an implicit range', () => {
    const bands = parseStatedBands(
      [{ attribute: 'hfe', value: 200 }, { attribute: 'hfe', value: 400 }],
      B6,
    );
    expect(bands.get('hfe')).toMatchObject({ lo: 200, hi: 400 });
  });

  // ⚠️ THE LOAD-BEARING NEGATIVE. A bare value's DIRECTION is unknowable: "gain 200" means at
  // LEAST 200, "parasitic inductance 2nH" means at MOST 2nH, and nothing in the data says which.
  // The last time this codebase guessed a direction, it read a "2 mA circuit" as "rated for 2 mA"
  // and banded the catalog to 2-20 mA — excluding every ordinary small-signal transistor by
  // construction. We refuse to guess. If this test ever gets "fixed" by inventing a default,
  // that bug comes straight back.
  it('a SINGLE plain value is NOT a band — the direction is unknowable and we do not invent one', () => {
    expect(parseStatedBands([{ attribute: 'hfe', value: 200 }], B6).size).toBe(0);
    expect(parseStatedBands([{ attribute: 'drain-source voltage', value: 30, unit: 'V' }], B5).size).toBe(0);
  });

  // ⚠️⚠️ THE ONE THAT NEARLY SHIPPED THE ORIGINAL BUG BACK. Half the specs in this codebase are
  // NAMED `*_max` — because the spec IS a maximum RATING. A user asking for "9 V" means "rated for
  // at LEAST 9 V". Reading the `_max` in the spec's OWN NAME as a user-stated upper bound produces
  // the band (-∞, 9] and hands Digikey "give me transistors rated 9 V or less", which excludes
  // every ordinary transistor ever made — exactly the failure this whole line of work started from.
  // Caught in a live run, not by reasoning.
  it('does NOT read the "max" in a spec\'s own NAME (vceo_max, vds_max, ic_max) as a user-stated upper bound', () => {
    expect(parseStatedBands([{ attribute: 'vceo_max', value: 9, unit: 'V' }], B6).size).toBe(0);
    expect(parseStatedBands([{ attribute: 'ic_max', value: 2, unit: 'mA' }], B6).size).toBe(0);
    expect(parseStatedBands([{ attribute: 'vds_max', value: 30, unit: 'V' }], B5).size).toBe(0);
    expect(parseStatedBands([{ attribute: 'id_max', value: 5, unit: 'A' }], B5).size).toBe(0);
  });

  it('still reads a REAL bound label on a spec whose own name has no min/max in it', () => {
    // `hfe` is just "hfe" — so `hfe_max` can only be a bound the extractor added.
    expect(parseStatedBands([{ attribute: 'hfe_max', value: 400 }], B6).get('hfe')).toMatchObject({ lo: -Infinity, hi: 400 });
  });

  it('ignores categorical, unresolvable and empty constraints', () => {
    expect(parseStatedBands([{ attribute: 'channel type', value: 'N-Channel' }], B5).size).toBe(0);
    expect(parseStatedBands([{ attribute: 'warp core flux', value: '1-2' }], B5).size).toBe(0);
    expect(parseStatedBands([], B5).size).toBe(0);
    expect(parseStatedBands(undefined, B5).size).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// A BAND CARRIES ITS OWN DIRECTION.
//
// The same misreading has come back THREE times through three different doors: a stated "1-2 mA"
// is what the user's CIRCUIT DRAWS, not a ceiling they want the part limited to. Twice the
// guarding rule was written in a COMMENT, and twice a new consumer failed to obey it — most
// recently the catalog fetch, which took the raw [lo, hi] pair and asked Digikey for transistors
// RATED 1-2 mA, excluding every ordinary transistor. So direction is now resolved at PARSE time,
// where the rule is known, and a consumer cannot get it wrong.
//
// ⚠️ These fixtures use the shape the REAL extractor emits — measured: it reports "1-2mA" as the
// STRING "1-2", not the scalar 2. The first version of this suite used scalars, which produce no
// band at all, so the entire threshold-band path went untested and the bug shipped.
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('band direction — resolved at parse time, from the rule', () => {
  const MLCC = getLogicTable('12')!;

  it('gte (a MAXIMUM RATING): "1-2 mA" of collector current → [1mA, ∞) — headroom is FREE', () => {
    // THE BUG. A two-sided [1mA, 2mA] band here asks the catalog for parts *rated* 1-2 mA.
    // Every ordinary small-signal NPN is rated 100 mA. All of them would be excluded.
    const band = parseStatedBands([{ attribute: 'ic_max', value: '1-2', unit: 'mA' }], B6).get('ic_max');
    expect(band).toMatchObject({ lo: 0.001, hi: Infinity });
  });

  it('gte: the upper bound is dropped even when the user states it explicitly as a max', () => {
    const band = parseStatedBands(
      [{ attribute: 'drain-source voltage min', value: 12, unit: 'V' }, { attribute: 'drain-source voltage max', value: 30, unit: 'V' }],
      B5,
    ).get('vds_max');
    expect(band).toMatchObject({ lo: 12, hi: Infinity }); // a 60 V part is a fine answer to "12-30 V"
  });

  it('lte / fit (a LIMIT): the LOWER bound is dropped — being further under a limit is free', () => {
    // `height` is a `fit` rule: the part must be no TALLER than this. A part half the height fits.
    const band = parseStatedBands([{ attribute: 'height', value: '1-2', unit: 'mm' }], R52).get('height');
    expect(band).toMatchObject({ lo: -Infinity, hi: 2 });
  });

  // The regression the direction fix must NOT cause: for a spec where BOTH ends genuinely bind,
  // the two-sided band has to survive. A 10 µF cap is not an acceptable answer to "1-2 µF".
  it('identity (an EXACT value): both ends bind — a stated capacitance range stays two-sided', () => {
    const band = parseStatedBands([{ attribute: 'capacitance', value: '1-10', unit: 'uF' }], MLCC).get('capacitance');
    expect(band!.lo).toBeCloseTo(1e-6, 12);
    expect(band!.hi).toBeCloseTo(1e-5, 12);
  });

  it('uncomparable (gain): both ends bind — the engine scores it 50% either way, so this IS the check', () => {
    expect(parseStatedBands([{ attribute: 'hfe', value: '200-400' }], B6).get('hfe')).toMatchObject({ lo: 200, hi: 400 });
  });

  it('the FULL real extractor payload for the canonical query yields exactly the right two bands', () => {
    const bands = parseStatedBands([
      { attribute: 'polarity', value: 'NPN' },              // categorical → no band
      { attribute: 'vceo_max', value: '9', unit: 'V' },     // bare value → no band (no direction)
      { attribute: 'ic_max', value: '1-2', unit: 'mA' },    // gte → headroom preserved
      { attribute: 'hfe', value: '200-400' },               // uncomparable → two-sided
    ], B6);
    expect([...bands.keys()].sort()).toEqual(['hfe', 'ic_max']);
    expect(bands.get('ic_max')).toMatchObject({ hi: Infinity });
    expect(bands.get('hfe')).toMatchObject({ lo: 200, hi: 400 });
  });
});

describe('widenBandForFetch — a NET for the catalog, never the cut', () => {
  it('widens outward by 15% so a boundary part survives the fetch', () => {
    const [band] = [...parseStatedBands([{ attribute: 'hfe', value: '200-400' }], B6).values()];
    const w = widenBandForFetch(band);
    expect(w.lo).toBeCloseTo(170, 5);
    expect(w.hi).toBeCloseTo(460, 5);
  });

  it('widens a NEGATIVE bound DOWNWARD, not toward zero', () => {
    // -40..125 °C. A multiplicative `lo * 0.85` would raise -40 to -34 — NARROWING the band and
    // dropping exactly the -40 °C parts the user asked for.
    const bands = parseStatedBands(
      [{ attribute: 'operating temp min', value: -40, unit: '°C' }, { attribute: 'operating temp max', value: 125, unit: '°C' }],
      R52,
    );
    const w = widenBandForFetch([...bands.values()][0]);
    expect(w.lo).toBeLessThan(-40);
    expect(w.hi).toBeGreaterThan(125);
  });

  it('leaves an infinite bound infinite', () => {
    const [band] = [...parseStatedBands([{ attribute: 'hfe min', value: 200 }], B6).values()];
    expect(widenBandForFetch(band).hi).toBe(Infinity);
  });
});

describe('countStatedBandViolations — what makes the right BC847 win', () => {
  const bands = parseStatedBands([{ attribute: 'hfe', value: '200-400' }], B6);

  // The whole point, on the real parts. Under the engine ALONE all three of these score an
  // identical 50% on gain (`hfe` is application_review — it never compares the two values), so
  // the 420-gain part could outrank the 200-gain one the user actually asked for.
  it('BC847B (gain 200) is IN the stated 200-400 band', () => {
    expect(countStatedBandViolations(bands, B6, bjt('BC847BLT1G', '200 @ 2mA, 5V'))).toBe(0);
  });

  it('BC847A (gain 110) is BELOW the band → violation', () => {
    expect(countStatedBandViolations(bands, B6, bjt('BC847ALT1G', '110 @ 2mA, 5V'))).toBe(1);
  });

  it('BC847C (gain 420) is ABOVE the band → violation', () => {
    expect(countStatedBandViolations(bands, B6, bjt('BC847CLT3G', '420 @ 2mA, 5V'))).toBe(1);
  });

  // If this ever reads numericValue it sees 0.002 (the 2 mA TEST CONDITION, not the gain) and
  // every single part "violates" a 200-400 band. The value STRING is the truth.
  it('reads the value STRING, never numericValue — which holds the test condition, not the gain', () => {
    const part = bjt('BC847BLT1G', '200 @ 2mA, 5V');
    expect(part.parameters[0].numericValue).toBe(0.002); // the landmine, as the catalog ships it
    expect(countStatedBandViolations(bands, B6, part)).toBe(0);
  });

  it('a part with NO gain figure violates nothing — missing data never rejects a part', () => {
    const noGain: PartAttributes = { ...bjt('MMBT3904', '100 @ 10mA, 1V'), parameters: [] };
    expect(countStatedBandViolations(bands, B6, noGain)).toBe(0);
  });

  // Rule 2. Banding a rule the ENGINE can compare would re-introduce the over-spec bug from the
  // other side: the engine correctly PASSES a 100 V part for a 12 V ask, and a band would fail it.
  it('NEVER second-guesses a rule the engine can compare (vds_max is a threshold → engine owns it)', () => {
    const vdsBands = parseStatedBands(
      [{ attribute: 'drain-source voltage min', value: 12, unit: 'V' }, { attribute: 'drain-source voltage max', value: 30, unit: 'V' }],
      B5,
    );
    expect(vdsBands.get('vds_max')).toBeTruthy(); // the band parses...
    const mosfet: PartAttributes = {
      part: {
        mpn: 'X', manufacturer: 'm', description: 'd', detailedDescription: 'd',
        category: 'Discrete Semiconductors' as PartAttributes['part']['category'],
        subcategory: 'MOSFET', status: 'Active',
      },
      parameters: [{ parameterId: 'vds_max', parameterName: 'Vds', value: '100 V', numericValue: 100, sortOrder: 1 }],
    };
    // ...but a 100 V part is NOT counted as a violation: the engine's threshold rule already
    // (correctly) passes it, and headroom on a max rating is free.
    expect(countStatedBandViolations(vdsBands, B5, mosfet)).toBe(0);
  });
});
