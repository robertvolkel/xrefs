/**
 * Layer 1 — a losing spelling's value is never discarded (Decision #278).
 *
 * THE BUG THIS PINS. Two source params can resolve to the same
 * (family, attributeId) slot. Only the first wins; the rest used to be dropped
 * on the floor. Good-Ark shipped `Rdson@ 10V(mΩ) Typ` at column 7 and
 * `Rdson@ 10V(mΩ) Max` at column 8, both pointing at `rds_on` — so ACCEPTING
 * the Max mapping in Triage silently deleted the Max value from all 44 parts,
 * and left `rds_on` holding a TYPICAL number on a weight-9 threshold rule.
 * The data looked fine. Nothing errored. The value was simply gone.
 *
 * SCALE (measured, not estimated — instrumented run of the real mapper over
 * all 429 files in data/atlas/, 437,093 products, with the live 2,034 dictionary
 * overrides applied): 225,902 values were being discarded, 195,886 of them
 * (86.7%) carrying a value the winner did not have. Layer 1 now preserves all
 * 195,886; the other 30,016 are byte-identical to the winner, so dropping them
 * loses nothing.
 *
 * WHY BOTH COPIES ARE TESTED. The mapper exists twice by design — `mapModel`
 * in scripts/atlas-ingest.mjs is the LIVE ingest path; `mapAtlasModel` in
 * lib/services/atlasMapper.ts is what the admin surfaces render. A "keep in
 * lockstep" comment is not a mechanism (see the override-merge divergence in
 * docs/BACKLOG.md, where 5 of 10 shapes silently disagree). The parity block at
 * the bottom is the mechanism.
 */

import {
  rawIdForParam,
  losingValueDiffers,
  MAX_LOSER_SUFFIX,
  mapAtlasModel,
} from '@/lib/services/atlasMapper';

interface MjsMapResult {
  parameters: Record<string, { value: string; numericValue?: number; unit?: string }>;
  unmappedParams: Array<{ paramName: string; attributeId: string; kind: string }>;
}
type MjsMapModel = (
  model: unknown,
  mfr: string,
  sourceFile: string,
) => MjsMapResult;

let mapModel: MjsMapModel;
beforeAll(async () => {
  const mod = await import('../../scripts/atlas-ingest.mjs');
  mapModel = mod.mapModel as unknown as MjsMapModel;
});

/** A B5 MOSFET model — the family the real bug landed in. */
const mosfet = (params: Array<{ name: string; value: string }>) => ({
  componentName: 'TEST-MOSFET-1',
  description: 'N-Channel MOSFET',
  datasheetUrl: null,
  category: {
    c1: { name: '分立器件' },
    c2: { name: '场效应管' },
    c3: { name: 'MOSFET' },
  },
  parameters: params,
});

describe('rawIdForParam — the storage key for a rescued value', () => {
  it('slugs an ASCII name', () => {
    expect(rawIdForParam('Rdson@ 10V(mΩ) Max')).toBe('rdson_10v_mω_max');
  });

  it('strips the gaia- vendor prefix — a vendor name must never reach a stored key', () => {
    expect(rawIdForParam('gaia-drain_source_on_resistance-Typ')).toBe(
      'drain_source_on_resistance_typ',
    );
    expect(rawIdForParam('gaia_forward_voltage')).toBe('forward_voltage');
  });

  /**
   * The 42,902-value bug. An ASCII-only rule ([^a-z0-9_]) reduces a pure-Chinese
   * name to the empty string, and an empty key means the value is dropped —
   * so the first cut of Layer 1 still binned 42,902 values, 14,198 of them from
   * 额定线圈功率 alone. The stored key IS the display name (fromParametersJsonb
   * humanizes it), so the characters have to survive.
   */
  it('KEEPS non-Latin characters — an ASCII-only slug drops the value entirely', () => {
    expect(rawIdForParam('额定线圈功率')).toBe('额定线圈功率');
    expect(rawIdForParam('类型')).toBe('类型');
    expect(rawIdForParam('高(公釐)')).toBe('高_公釐');
  });

  it('never returns a key that is only separators', () => {
    expect(rawIdForParam('---')).toBe('');
    expect(rawIdForParam('   ')).toBe('');
    expect(rawIdForParam('(@)')).toBe('');
  });

  it('NFC-normalizes so one name cannot become two keys', () => {
    const composed = 'Å';          // Å  (single code point)
    const decomposed = 'Å';        // A + combining ring
    expect(rawIdForParam(composed)).toBe(rawIdForParam(decomposed));
  });

  it('collapses separator runs and trims edges', () => {
    expect(rawIdForParam('  VF   IF  (A)  ')).toBe('vf_if_a');
  });
});

describe('losingValueDiffers — only genuine information is kept', () => {
  it('is false for identical values (dropping loses nothing)', () => {
    expect(losingValueDiffers('100 V', '100 V')).toBe(false);
    expect(losingValueDiffers(' 100 V ', '100 v')).toBe(false);
  });

  it('is true when the values genuinely differ', () => {
    expect(losingValueDiffers('6.0', '4.3')).toBe(true);
  });

  /**
   * Deliberately conservative: a missing winner value must read as "differs",
   * because a false "same" DELETES data while a false "differs" merely keeps a
   * redundant copy. The asymmetry is the whole safety argument.
   */
  it('treats an absent winner value as differing', () => {
    expect(losingValueDiffers('6.0', undefined)).toBe(true);
  });
});

describe('mapAtlasModel — the loser survives', () => {
  it('keeps BOTH values when two spellings claim one slot (the Good-Ark bug)', () => {
    const res = mapAtlasModel(
      mosfet([
        { name: 'RDS(on)(mΩ Max.) 10V', value: '4.3' },
        { name: 'RDS(on) @10VMax (mΩ)', value: '6.0' },
      ]),
      'TestMfr',
    );
    const byId = new Map(res.parameters.map(p => [p.parameterId, p.value]));
    // Whichever spelling the dictionary routes to rds_on, the OTHER value must
    // still exist somewhere. Before Layer 1 it was gone.
    const values = [...byId.values()];
    expect(values).toContain('4.3');
    expect(values).toContain('6.0');
  });

  it('does NOT duplicate when the two values are identical', () => {
    const res = mapAtlasModel(
      mosfet([
        { name: 'RDS(on)(mΩ Max.) 10V', value: '4.3' },
        { name: 'RDS(on) @10VMax (mΩ)', value: '4.3' },
      ]),
      'TestMfr',
    );
    expect(res.parameters.filter(p => p.value === '4.3')).toHaveLength(1);
  });

  /**
   * Two DIFFERENT losing spellings that slug to the same key must both survive.
   * Without the numeric suffix the second one is silently binned — which is the
   * exact bug this function exists to fix, reintroduced one level down.
   */
  it('suffixes rather than drops when two losers collide on one key', () => {
    const res = mapAtlasModel(
      mosfet([
        { name: 'RDS(on)(mΩ Max.) 10V', value: '1.0' },
        { name: 'RDS(on) @10VMax (mΩ)', value: '2.0' },
        { name: 'RDS(on)  @10VMax  (mΩ)', value: '3.0' }, // same slug as the previous loser
      ]),
      'TestMfr',
    );
    const values = res.parameters.map(p => p.value);
    expect(values).toContain('1.0');
    expect(values).toContain('2.0');
    expect(values).toContain('3.0');
    // and the ids are distinct
    expect(new Set(res.parameters.map(p => p.parameterId)).size).toBe(res.parameters.length);
  });

  it('rescued values are NOT pushed into Triage as unmapped', () => {
    // These params ARE mapped — they just lost a slot. Surfacing them as gaps
    // would bury the genuine ones (there are ~196k of these corpus-wide).
    const res = mapAtlasModel(
      mosfet([
        { name: 'RDS(on)(mΩ Max.) 10V', value: '4.3' },
        { name: 'RDS(on) @10VMax (mΩ)', value: '6.0' },
      ]),
      'TestMfr',
    );
    // mapAtlasModel surfaces gaps via warnings; a rescued value must not appear
    // there as an unmapped param.
    expect(res.warnings.join(' ')).not.toContain('RDS(on) @10VMax (mΩ)');
  });

  /**
   * The gaia DEDUP branch, distinct from the preferredSuffix branch above.
   * `drain_source_voltage` and `drain_source_breakdown_voltage` are two separate
   * gaia stems that both map to `vds_max`, neither carrying a preferredSuffix —
   * so the second one reaches the plain dedup line. Found by mutation testing:
   * removing the rescue there left every test green until this case existed.
   */
  it('keeps the loser at the gaia DEDUP line (two stems, one attributeId)', () => {
    const res = mapAtlasModel(
      mosfet([
        { name: 'gaia-drain_source_voltage', value: '30 V' },
        { name: 'gaia-drain_source_breakdown_voltage', value: '40 V' },
      ]),
      'TestMfr',
    );
    const values = res.parameters.map(p => p.value);
    expect(values.some(v => v.includes('30'))).toBe(true);
    expect(values.some(v => v.includes('40'))).toBe(true);
  });

  /**
   * The UNMAPPED gaia branch: one stem with no dictionary entry, appearing under
   * two suffixes. Both reduce to the same stem, so the second used to be dropped
   * (80,228 values corpus-wide — reflow profiles, per-mode supply currents).
   */
  it('keeps both suffix variants of an UNMAPPED gaia stem', () => {
    const res = mapAtlasModel(
      mosfet([
        { name: 'gaia-zzz_unknown_measurement-Min', value: '1 V' },
        { name: 'gaia-zzz_unknown_measurement-Max', value: '2 V' },
      ]),
      'TestMfr',
    );
    const values = res.parameters.map(p => p.value);
    expect(values.some(v => v.includes('1'))).toBe(true);
    expect(values.some(v => v.includes('2'))).toBe(true);
  });

  it('MAX_LOSER_SUFFIX is a runaway guard, not a data cap', () => {
    // Measured: a bound of 20 dropped 1,530 real values; 200 drops none.
    expect(MAX_LOSER_SUFFIX).toBeGreaterThanOrEqual(200);
  });
});

describe('mapModel (LIVE ingest path) — the loser survives', () => {
  it('keeps BOTH values when two spellings claim one slot', () => {
    const res = mapModel(
      mosfet([
        { name: 'RDS(on)(mΩ Max.) 10V', value: '4.3' },
        { name: 'RDS(on) @10VMax (mΩ)', value: '6.0' },
      ]),
      'TestMfr',
      'test.json',
    );
    const values = Object.values(res.parameters).map(v => v.value);
    expect(values).toContain('4.3');
    expect(values).toContain('6.0');
  });

  it('does NOT duplicate when the two values are identical', () => {
    const res = mapModel(
      mosfet([
        { name: 'RDS(on)(mΩ Max.) 10V', value: '4.3' },
        { name: 'RDS(on) @10VMax (mΩ)', value: '4.3' },
      ]),
      'TestMfr',
      'test.json',
    );
    expect(Object.values(res.parameters).filter(v => v.value === '4.3')).toHaveLength(1);
  });

  it('keeps a pure-Chinese losing name under a readable key', () => {
    const res = mapModel(
      mosfet([
        { name: '漏源导通电阻', value: '4.3' },
        { name: '额定线圈功率', value: '900' },
      ]),
      'TestMfr',
      'test.json',
    );
    // Whatever the dict does with these, no value may vanish and no key may be
    // the empty string.
    const values = Object.values(res.parameters).map(v => v.value);
    expect(values).toContain('900');
    expect(Object.keys(res.parameters)).not.toContain('');
  });

  it('rescued values are NOT pushed into unmappedParams (Triage)', () => {
    const res = mapModel(
      mosfet([
        { name: 'RDS(on)(mΩ Max.) 10V', value: '4.3' },
        { name: 'RDS(on) @10VMax (mΩ)', value: '6.0' },
      ]),
      'TestMfr',
      'test.json',
    );
    const names = res.unmappedParams.map(u => u.paramName);
    // Exactly one of the two spellings may be genuinely unmapped; neither may
    // appear as a *rescued* entry. Assert no duplicate flooding.
    expect(new Set(names).size).toBe(names.length);
  });
});

/**
 * PARITY — the two copies must agree.
 *
 * The mapper exists twice by design (the CLI is standalone). A "keep in
 * lockstep" comment has already failed once in this codebase: the
 * dictionary-override merge diverges on 5 of 10 shapes and nothing noticed.
 * This block is what makes the Layer 1 comment enforceable.
 */
describe('parity — mapModel (.mjs) and mapAtlasModel (.ts) rescue the same values', () => {
  const cases: Array<{ name: string; params: Array<{ name: string; value: string }> }> = [
    {
      name: 'Typ/Max collision',
      params: [
        { name: 'RDS(on)(mΩ Max.) 10V', value: '4.3' },
        { name: 'RDS(on) @10VMax (mΩ)', value: '6.0' },
      ],
    },
    {
      name: 'identical values — nothing to rescue',
      params: [
        { name: 'RDS(on)(mΩ Max.) 10V', value: '4.3' },
        { name: 'RDS(on) @10VMax (mΩ)', value: '4.3' },
      ],
    },
    {
      name: 'pure-Chinese losing name',
      params: [
        { name: '漏源导通电阻', value: '4.3' },
        { name: '额定线圈功率', value: '900' },
      ],
    },
    {
      name: 'three-way collision',
      params: [
        { name: 'VF IF (A)', value: '1.0' },
        { name: 'VF IF(A)', value: '2.0' },
        { name: 'VF  IF  (A)', value: '3.0' },
      ],
    },
    {
      name: 'gaia Typ/Max pair (preferredSuffix branch)',
      params: [
        { name: 'gaia-drain_source_on_resistance-Typ', value: '4.3 mΩ' },
        { name: 'gaia-drain_source_on_resistance-Max', value: '6.0 mΩ' },
      ],
    },
    {
      name: 'gaia two stems, one attributeId (dedup branch)',
      params: [
        { name: 'gaia-drain_source_voltage', value: '30 V' },
        { name: 'gaia-drain_source_breakdown_voltage', value: '40 V' },
      ],
    },
    {
      name: 'gaia unmapped stem, two suffixes',
      params: [
        { name: 'gaia-zzz_unknown_measurement-Min', value: '1 V' },
        { name: 'gaia-zzz_unknown_measurement-Max', value: '2 V' },
      ],
    },
    /**
     * ⚠️ BLOCKER 2 — the case that was silently deleting data.
     *
     * Both stems map to `vds_max`, so the second hits the dedup branch AFTER
     * the first has been stored NORMALIZED. `parseGaiaValue`'s `<`-branch turns
     * "<30 V" into displayValue "30", so comparing the loser's RAW "30" against
     * the winner's STORED "30" judged them identical and dropped the loser —
     * even though the source strings say different things ("under 30" vs "30").
     *
     * Must use two DIFFERENT stems: a Typ/Max pair on ONE stem routes through
     * the preferredSuffix branch before any winner exists, so it never exercises
     * this comparison. (The first version of this test did exactly that and was
     * vacuous — it passed against the broken code.)
     */
    {
      name: 'normalized winner vs raw loser — "<30 V" must not swallow "30"',
      params: [
        { name: 'gaia-drain_source_voltage', value: '<30 V' },
        { name: 'gaia-drain_source_breakdown_voltage', value: '30' },
      ],
    },
    {
      name: 'normalized winner vs raw loser — ± form must not swallow the bare number',
      params: [
        { name: 'gaia-drain_source_voltage', value: '±20 V' },
        { name: 'gaia-drain_source_breakdown_voltage', value: '20' },
      ],
    },
  ];

  /**
   * ⚠️ Comparing VALUES alone is not enough, and that gap hid Blocker 2.
   *
   * When a normalized winner ("<30 V" → stored "30") and a rescued loser
   * ("30") carry the same string, the value SET is identical whether the loser
   * was preserved under its own key or silently deleted. Only the KEYS differ.
   * Both value assertions below passed against the broken code.
   */
  it.each(cases)('$name — the same set of KEYS survives in both', ({ params }) => {
    const mjs = mapModel(mosfet(params), 'TestMfr', 'test.json');
    const ts = mapAtlasModel(mosfet(params), 'TestMfr');

    const mjsKeys = Object.keys(mjs.parameters).sort();
    const tsKeys = ts.parameters.map(p => p.parameterId).sort();

    expect(tsKeys).toEqual(mjsKeys);
  });

  it.each(cases)('$name — the same set of VALUES survives in both', ({ params }) => {
    const mjs = mapModel(mosfet(params), 'TestMfr', 'test.json');
    const ts = mapAtlasModel(mosfet(params), 'TestMfr');

    const mjsValues = new Set(Object.values(mjs.parameters).map(v => String(v.value)));
    const tsValues = new Set(ts.parameters.map(p => String(p.value)));

    expect([...tsValues].sort()).toEqual([...mjsValues].sort());
  });

  it.each(cases)('$name — no input value is lost by either copy', ({ params }) => {
    const mjs = mapModel(mosfet(params), 'TestMfr', 'test.json');
    const ts = mapAtlasModel(mosfet(params), 'TestMfr');

    const mjsValues = Object.values(mjs.parameters).map(v => String(v.value));
    const tsValues = ts.parameters.map(p => String(p.value));

    // Every DISTINCT input value must be represented somewhere in the output.
    // (Values are normalized by the mapper, so compare on the numeric core.)
    const core = (s: string) => (s.match(/-?\d+(\.\d+)?/)?.[0] ?? s.trim().toLowerCase());
    const wanted = new Set(params.map(p => core(p.value)));
    for (const w of wanted) {
      expect(mjsValues.map(core)).toContain(w);
      expect(tsValues.map(core)).toContain(w);
    }
  });
});

/**
 * ⚠️ BLOCKER 2, asserted DIRECTLY rather than through parity.
 *
 * Parity only proves the two copies agree — it cannot catch a bug present in
 * both, and the value-set assertions cannot see this one at all because the
 * winner and the rescued loser stringify identically. What actually
 * distinguishes "preserved" from "deleted" here is the NUMBER OF ENTRIES.
 *
 * The mechanism: `parseGaiaValue("<30 V")` returns displayValue "30"
 * (atlasGaiaDictionaries.ts, the `<`-branch). `drain_source_voltage` and
 * `drain_source_breakdown_voltage` both map to `vds_max`, so the second one
 * hits the dedup branch after the first is already stored NORMALIZED. Comparing
 * the loser's raw "30" against the winner's stored "30" called them identical
 * and dropped a value whose source string says something different.
 */
describe('Blocker 2 — a normalized winner must not swallow a raw loser', () => {
  const model = (params: Array<{ name: string; value: string }>) => ({
    componentName: 'TEST-B2',
    description: 'N-Channel MOSFET',
    datasheetUrl: '',
    category: {
      c1: { name: 'Discrete Semiconductors' },
      c2: { name: 'Transistors' },
      c3: { name: 'MOSFET' },
    },
    parameters: params,
  });

  const COLLIDING = [
    { name: 'gaia-drain_source_voltage', value: '<30 V' },
    { name: 'gaia-drain_source_breakdown_voltage', value: '30' },
  ];

  it('TS keeps BOTH entries — the winner and the rescued loser', () => {
    const out = mapAtlasModel(model(COLLIDING) as Parameters<typeof mapAtlasModel>[0], 'TestMfr');
    const ids = out.parameters.map(p => p.parameterId);
    expect(ids).toContain('vds_max');
    // The loser must exist as its OWN entry. Without the fix there is exactly
    // one entry here and the second source value is gone for good.
    expect(ids.length).toBeGreaterThan(1);
    expect(ids.filter(i => i !== 'vds_max').length).toBeGreaterThan(0);
  });

  it('the LIVE .mjs copy keeps BOTH entries too', () => {
    const out = mapModel(model(COLLIDING), 'TestMfr', 'test.json');
    const keys = Object.keys(out.parameters);
    expect(keys).toContain('vds_max');
    expect(keys.length).toBeGreaterThan(1);
  });

  it('genuinely identical raw values are still dropped — this is a dedup, not a hoarder', () => {
    const identical = [
      { name: 'gaia-drain_source_voltage', value: '30 V' },
      { name: 'gaia-drain_source_breakdown_voltage', value: '30 V' },
    ];
    const ts = mapAtlasModel(model(identical) as Parameters<typeof mapAtlasModel>[0], 'TestMfr');
    const mjs = mapModel(model(identical), 'TestMfr', 'test.json');
    expect(ts.parameters.map(p => p.parameterId)).toEqual(['vds_max']);
    expect(Object.keys(mjs.parameters)).toEqual(['vds_max']);
  });
});
