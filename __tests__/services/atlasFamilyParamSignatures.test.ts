import {
  FAMILY_PARAM_SIGNATURES,
  detectForeignFamily,
  detectForeignFamilyWithList,
} from '@/lib/services/atlasFamilyParamSignatures';

const findSig = (targetFamilyId: string, predicate: (src: string) => boolean) =>
  FAMILY_PARAM_SIGNATURES.find(
    (s) => s.target.familyId === targetFamilyId && predicate(s.pattern.source),
  );

describe('FAMILY_PARAM_SIGNATURES — pattern matching', () => {
  // ── B6 BJT ────────────────────────────────────────────────────────
  describe('B6 vcbo / vceo / vebo (with optional B prefix)', () => {
    const sig = findSig('B6', (src) => src.includes('vcbo|vceo|vebo'));
    if (!sig) throw new Error('expected B6 vcbo/vceo/vebo signature');

    it.each([
      ['vcbo', true],
      ['vceo', true],
      ['vebo', true],
      ['VCBO(V)', true],
      ['VCEO(V)', true],
      ['VEBO(V)', true],
      ['VCEO (V)', true], // WPMSEMI-style with space
      ['vceo_v', true],
      ['vcbo_v', true],
      ['vebo_v', true],
      ['bvceo_v', true],
      ['bvcbo_v', true],
      ['BVCBO(V)', true],
      ['BVCEO(V)', true],
      ['BVEBO(V)', true],
    ])('%s → match=%s', (input, expected) => {
      expect(sig.pattern.test(input)).toBe(expected);
    });

    it.each([
      ['vcesat'], // B7 sig, not B6
      ['vcesat_v'],
      ['VCESAT(V)'], // KEXIN VCEsat
      ['vds'], // MOSFET
      ['vbr'], // generic breakdown
      ['vcbox'], // overlong — must not match (boundary required)
      ['xvceo'], // not at start
    ])('does NOT match %s', (input) => {
      expect(sig.pattern.test(input)).toBe(false);
    });
  });

  describe('B6 hfe', () => {
    const sig = findSig('B6', (src) => src.includes('hfe') && !src.includes('vcbo'));
    if (!sig) throw new Error('expected B6 hfe signature');

    it.each([
      ['hfe', true],
      ['hFE', true],
      ['hfe_min', true],
      ['hfe_max', true],
      ['hFE_Min', true],
      ['hFE_Max', true],
      ['HFE(Min.)', true],
      ['HFE(Max.)', true],
      ['hfe(min.)', true],
      ['hfe(max.)', true],
      ['hfe ', true], // trailing space
      ['hfe(typ)', true],
    ])('%s → match=%s', (input, expected) => {
      expect(sig.pattern.test(input)).toBe(expected);
    });

    it.each([
      ['hfehfe'], // SWST concat — intentionally not matched standalone
      ['hfeic'], // SWST concat
      ['hfemax'], // SWST concat
      ['xhfe'], // not at start
    ])('does NOT match %s (boundary required)', (input) => {
      expect(sig.pattern.test(input)).toBe(false);
    });
  });

  describe('B6 ic (cooccurrence-required)', () => {
    const sig = findSig('B6', (src) => src.includes('@?ic'));
    if (!sig) throw new Error('expected B6 ic signature');

    it('has requiresAlsoMatching to guard against IGBT false positives', () => {
      expect(sig.requiresAlsoMatching).toBeDefined();
      expect(sig.requiresAlsoMatching!.length).toBeGreaterThan(0);
    });

    it.each([
      ['ic', true],
      ['Ic', true],
      ['IC', true],
      ['ic_ma', true],
      ['ic(ma)', true],
      ['IC(mA)', true],
      ['IC (mA)', true], // WPMSEMI-style with space
      ['IC(A)', true],
      ['@ic(ma)', true],
      ['@Ic(mA)', true],
    ])('%s → pattern match=%s', (input, expected) => {
      expect(sig.pattern.test(input)).toBe(expected);
    });

    it.each([
      ['icc'], // supply current — common on ICs
      ['Icq'], // quiescent current — op-amps
      ['icbo'], // BJT but not the target — would need its own entry
      ['idd'], // supply current
      ['ical'], // not ic
    ])('does NOT match %s (false positive avoided)', (input) => {
      expect(sig.pattern.test(input)).toBe(false);
    });
  });

  describe('B6 ft (cooccurrence-required)', () => {
    const sig = findSig('B6', (src) => src.startsWith('^ft'));
    if (!sig) throw new Error('expected B6 ft signature');

    it('has requiresAlsoMatching to guard against RF MOSFET false positives', () => {
      expect(sig.requiresAlsoMatching).toBeDefined();
      expect(sig.requiresAlsoMatching!.length).toBeGreaterThan(0);
    });

    it.each([
      ['ft', true],
      ['fT', true],
      ['ft(mhz)', true],
      ['fT(MHz)', true],
      ['ft_min', true],
      ['fT_Min (MHz)', true], // WPMSEMI-style with space
      ['ft_max', true],
    ])('%s → pattern match=%s', (input, expected) => {
      expect(sig.pattern.test(input)).toBe(expected);
    });

    it.each([['ftox'], ['ftime'], ['ftrip']])(
      'does NOT match %s (false positive avoided)',
      (input) => {
        expect(sig.pattern.test(input)).toBe(false);
      },
    );
  });

  // ── B5 MOSFET ──────────────────────────────────────────────────────
  describe('B5 vgs(th) — cooccurrence-required', () => {
    const sig = FAMILY_PARAM_SIGNATURES.find(
      (s) => s.target.familyId === 'B5' && s.pattern.source.includes('vgs'),
    );
    if (!sig) throw new Error('expected B5 vgs(th) signature');

    it('has requiresAlsoMatching to guard against IGBT false positives', () => {
      expect(sig.requiresAlsoMatching).toBeDefined();
      expect(sig.requiresAlsoMatching!.length).toBeGreaterThan(0);
    });

    it.each([
      ['vgs(th)', true],
      ['Vgs(th)', true],
      ['vgs_th', true],
      ['Vgs_th', true],
      ['vgs th', true],
      ['Vgs threshold', true],
      ['vgs(threshold)', true],
    ])('pattern: %s → match=%s', (input, expected) => {
      expect(sig.pattern.test(input)).toBe(expected);
    });
  });

  describe('B5 q(g|gs|gd)', () => {
    const sig = findSig('B5', (src) => src.includes('q(?:g|gs|gd)') || src.includes('q(g|gs|gd)'));
    if (!sig) throw new Error('expected B5 qg/qgs/qgd signature');

    it.each([
      ['qg', true],
      ['qgs', true],
      ['qgd', true],
      ['Qg(nC)', true],
      ['qg_nc', true],
      ['qgs(nc)', true],
      ['qgd_nc', true],
    ])('%s → match=%s', (input, expected) => {
      expect(sig.pattern.test(input)).toBe(expected);
    });

    it.each([['qgg'], ['qgsmin'], ['qgdmax']])('does NOT match %s', (input) => {
      expect(sig.pattern.test(input)).toBe(false);
    });
  });

  // ── B7 IGBT ────────────────────────────────────────────────────────
  describe('B7 eon / eoff / ets', () => {
    const sig = findSig('B7', (src) => src.includes('eon|eoff|ets'));
    if (!sig) throw new Error('expected B7 eon/eoff/ets signature');

    it.each([
      ['eon', true],
      ['eoff', true],
      ['ets', true],
      ['Eoff(mJ)', true],
      ['eon_mj', true],
      ['eoff_mj', true],
      ['ets_mj', true],
    ])('%s → match=%s', (input, expected) => {
      expect(sig.pattern.test(input)).toBe(expected);
    });

    it.each([['eoffset'], ['etsy'], ['eonx']])('does NOT match %s', (input) => {
      expect(sig.pattern.test(input)).toBe(false);
    });
  });

  // ── B9 JFET ────────────────────────────────────────────────────────
  describe('B9 idss', () => {
    const sig = findSig('B9', () => true);
    if (!sig) throw new Error('expected B9 idss signature');

    it.each([
      ['idss', true],
      ['Idss(mA)', true],
      ['idss_ma', true],
      ['idss_min', true],
    ])('%s → match=%s', (input, expected) => {
      expect(sig.pattern.test(input)).toBe(expected);
    });

    it.each([['idsson'], ['idssmax']])('does NOT match %s', (input) => {
      expect(sig.pattern.test(input)).toBe(false);
    });
  });

  // ── E1 Optocoupler ────────────────────────────────────────────────
  describe('E1 ctr / viso', () => {
    const ctrSig = findSig('E1', (src) => src.includes('ctr'));
    const visoSig = findSig('E1', (src) => src.includes('viso'));
    if (!ctrSig || !visoSig) throw new Error('expected E1 ctr + viso signatures');

    it.each([
      ['ctr', true],
      ['CTR(%)', true],
      ['ctr_min', true],
      ['ctr_max', true],
      ['ctr_pct', true],
    ])('ctr: %s → match=%s', (input, expected) => {
      expect(ctrSig.pattern.test(input)).toBe(expected);
    });

    it.each([['ctrim'], ['ctrlrange']])('ctr: does NOT match %s', (input) => {
      expect(ctrSig.pattern.test(input)).toBe(false);
    });

    it.each([
      ['viso', true],
      ['Viso(V)', true],
      ['viso_vrms', true],
      ['viso_kv', true],
    ])('viso: %s → match=%s', (input, expected) => {
      expect(visoSig.pattern.test(input)).toBe(expected);
    });

    it.each([['visor'], ['vison']])('viso: does NOT match %s', (input) => {
      expect(visoSig.pattern.test(input)).toBe(false);
    });
  });
});

describe('detectForeignFamilyWithList', () => {
  it('returns null when currentFamily is null', () => {
    expect(detectForeignFamilyWithList('hfe_min', null, FAMILY_PARAM_SIGNATURES)).toBeNull();
  });

  it('returns null when no signature matches', () => {
    expect(
      detectForeignFamilyWithList('package_case', 'B1', FAMILY_PARAM_SIGNATURES),
    ).toBeNull();
  });

  it('returns null when matched signature target equals current family', () => {
    // hfe matches B6; if we are already in B6, no foreign-family flag.
    expect(detectForeignFamilyWithList('hfe_min', 'B6', FAMILY_PARAM_SIGNATURES)).toBeNull();
  });

  it('returns the matching signature when target family differs', () => {
    const hit = detectForeignFamilyWithList('hfe_min', 'B7', FAMILY_PARAM_SIGNATURES);
    expect(hit).not.toBeNull();
    expect(hit!.target.familyId).toBe('B6');
  });

  it('skips cooccurrence-required signatures (per-paramName caller cannot evaluate cooccurrence)', () => {
    // Ic alone with no product context — would match the B6 ic pattern if it
    // weren't cooccurrence-gated. Triage caller must NOT auto-flag without
    // confirming hfe/vcbo/vceo/vebo co-occur on the same product.
    const hit = detectForeignFamilyWithList('ic_ma', 'B7', FAMILY_PARAM_SIGNATURES);
    expect(hit).toBeNull();
  });

  it('skips cooccurrence-required fT signature too', () => {
    const hit = detectForeignFamilyWithList('ft_mhz', 'B5', FAMILY_PARAM_SIGNATURES);
    expect(hit).toBeNull();
  });

  it('skips cooccurrence-required Vgs(th) signature (added May 27, 2026)', () => {
    const hit = detectForeignFamilyWithList('vgs_th', 'B7', FAMILY_PARAM_SIGNATURES);
    expect(hit).toBeNull();
  });

  it('skips cooccurrence-required Qg signature (added May 27, 2026)', () => {
    const hit = detectForeignFamilyWithList('qg_nc', 'B7', FAMILY_PARAM_SIGNATURES);
    expect(hit).toBeNull();
  });

  it('skips cooccurrence-required Vce(sat) signature (added May 27, 2026)', () => {
    const hit = detectForeignFamilyWithList('vce_sat_max_v', 'B6', FAMILY_PARAM_SIGNATURES);
    expect(hit).toBeNull();
  });
});

describe('detectForeignFamily (code-only convenience wrapper)', () => {
  it('uses FAMILY_PARAM_SIGNATURES baseline', () => {
    const hit = detectForeignFamily('hfe_min', 'B7');
    expect(hit).not.toBeNull();
    expect(hit!.target.familyId).toBe('B6');
  });

  it('returns null on no match', () => {
    expect(detectForeignFamily('package_case', 'B1')).toBeNull();
  });
});
