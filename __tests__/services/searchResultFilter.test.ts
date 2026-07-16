import { applySearchResultFilter, describeSearchFilterInput } from '@/lib/services/searchResultFilter';
import type { PartSummary } from '@/lib/types';

function part(overrides: Partial<PartSummary>): PartSummary {
  return {
    mpn: 'TEST',
    manufacturer: 'Generic',
    description: 'test part',
    category: 'Transistors',
    ...overrides,
  };
}

// A vetted-search result set: each card scored by the engine, so failCount / hardFail / specFit are
// populated. Three parts we READ and that meet the ask, two we read and that VIOLATE it.
//
// ⚠️ `specFit` IS NOT OPTIONAL DECORATION HERE. `searchParts` writes hardFail and specFit together,
// on the same line — there is no state where one exists without the other. A fixture that carries
// only `hardFail` describes a shape the system does not emit, and a test built on it silently stops
// testing the real thing. (The whole reason `specFit` exists is that `hardFail` could not tell
// "meets every spec" apart from "we could not read a single one".)
const vetted: PartSummary[] = [
  part({ mpn: 'BC847B', manufacturer: 'Nexperia', failCount: 0, hardFail: false, specFit: 'fits', specsRead: 3, specsStated: 3, status: 'Active', qualifications: ['AEC-Q101'] }),
  part({ mpn: 'MMBT3904', manufacturer: 'onsemi', failCount: 0, hardFail: false, specFit: 'fits', specsRead: 3, specsStated: 3, status: 'Active' }),
  part({ mpn: 'BC817', manufacturer: 'Diodes Inc', failCount: 0, hardFail: false, specFit: 'fits', specsRead: 3, specsStated: 3, status: 'Obsolete' }),
  part({ mpn: '2N2222', manufacturer: 'STMicro', failCount: 2, hardFail: true, specFit: 'below_spec', specsRead: 3, specsStated: 3, status: 'Active' }),
  part({ mpn: 'PN2222', manufacturer: 'onsemi', failCount: 1, hardFail: true, specFit: 'below_spec', specsRead: 3, specsStated: 3, status: 'Active' }),
];

// Mixed-origin set: resolved mfrOrigin populated by searchParts. The "3PEAK" row is the
// load-bearing case — a Chinese maker whose part arrived via Digikey (dataSource !== atlas)
// must still be caught by the origin filter (keys off resolved mfrOrigin, not the source tag).
const mixedOrigin: PartSummary[] = [
  part({ mpn: 'LM358A', manufacturer: '3PEAK', dataSource: 'digikey', mfrOrigin: 'atlas' }),
  part({ mpn: 'LM358DR-CN', manufacturer: 'ChipNobo', dataSource: 'atlas', mfrOrigin: 'atlas' }),
  part({ mpn: 'LM358AM/TR', manufacturer: 'HGSEMI', dataSource: 'atlas', mfrOrigin: 'atlas' }),
  part({ mpn: 'LM358DR', manufacturer: 'Texas Instruments', dataSource: 'digikey', mfrOrigin: 'western' }),
  part({ mpn: 'LM358DR2G', manufacturer: 'onsemi', dataSource: 'digikey', mfrOrigin: 'western' }),
  part({ mpn: 'LM358MYST', manufacturer: 'Mystery Co', dataSource: 'digikey', mfrOrigin: 'unknown' }),
];

// Cached search result from before mfrOrigin was resolved: the cards carry only the
// `dataSource` tag the UI uses to render the 🇨🇳 flag. The Chinese filter MUST mirror
// that flag (dataSource==='atlas') so a card the user can SEE is flagged Chinese is
// never silently dropped. This is the exact case that produced "0 results are Chinese".
const cachedNoOrigin: PartSummary[] = [
  part({ mpn: 'LM358N', manufacturer: 'HGSEMI', dataSource: 'atlas' }),       // flagged 🇨🇳, no mfrOrigin
  part({ mpn: 'LM358S', manufacturer: 'Slkor', dataSource: 'atlas' }),         // flagged 🇨🇳, no mfrOrigin
  part({ mpn: 'LM358DR', manufacturer: 'Texas Instruments', dataSource: 'digikey' }), // not flagged
];

describe('applySearchResultFilter', () => {
  it('returns all matches when no predicate is set', () => {
    expect(applySearchResultFilter(vetted, {})).toHaveLength(5);
  });

  it('meets_spec keeps EVERY green card and drops only the below-spec ones', () => {
    const result = applySearchResultFilter(vetted, { meets_spec: true });
    // This is the headline guarantee: all three failCount===0 cards survive,
    // the two hardFail cards are removed — no subset, no cap.
    expect(result.map(p => p.mpn).sort()).toEqual(['BC817', 'BC847B', 'MMBT3904']);
  });

  it('meets_spec keeps parts with no verdict (unscored / unvetted search)', () => {
    const unscored = [
      part({ mpn: 'A', failCount: 0, hardFail: false, specFit: 'fits', specsRead: 2, specsStated: 2 }),
      part({ mpn: 'B' }), // no verdict at all — the user stated no specs, so there is nothing to be unconfirmed about
      part({ mpn: 'C', failCount: 3, hardFail: true, specFit: 'below_spec', specsRead: 2, specsStated: 2 }),
    ];
    // An unvetted card is kept: there is nothing to check it against.
    expect(applySearchResultFilter(unscored, { meets_spec: true }).map(p => p.mpn)).toEqual(['A', 'B']);
  });

  // ── THE BUG THIS FILTER USED TO HAVE ──────────────────────────────────────────────────────────
  //
  // `meets_spec` was `p.hardFail !== true`. A rule only FAILS when a value DISAGREES, so a part
  // whose specs could not be READ has no failures — and this filter kept it. Measured on a real
  // "30V N-channel MOSFET, 1 to 5 amps" search: 20 of the 50 results were dual MOSFETs rated
  // 0.115–0.95 A (they physically cannot carry 1 A), every one labelled "Fits your specs", and
  // every one survived a "show me the ones that meet spec" request.
  //
  // The filter's NAME is a promise. A part we never managed to check does not meet the spec.
  describe('a part whose specs we could not READ does not "meet spec"', () => {
    const withUnreadable: PartSummary[] = [
      part({ mpn: 'CSD17313Q2', description: 'MOSFET N-CH 30V 5A', failCount: 0, hardFail: false, specFit: 'fits', specsRead: 3, specsStated: 3 }),
      // The real offender: a DUAL MOSFET. Digikey names a dual's parameters differently, our map
      // does not recognise them, so not one of the three stated specs could be read.
      part({ mpn: '2N7002DW', description: 'MOSFET 2N-CH 60V 0.115A', failCount: 0, hardFail: false, specFit: 'unconfirmed', specsRead: 0, specsStated: 3 }),
      part({ mpn: 'IRLR024N', description: 'MOSFET N-CH 55V 17A', failCount: 0, hardFail: false, specFit: 'fits', specsRead: 3, specsStated: 3 }),
      part({ mpn: 'BSS138', description: 'MOSFET N-CH 50V 0.2A', failCount: 1, hardFail: true, specFit: 'below_spec', specsRead: 3, specsStated: 3 }),
    ];

    it('drops it — it cannot carry the 1 A that was asked for, and we never checked', () => {
      const result = applySearchResultFilter(withUnreadable, { meets_spec: true });
      expect(result.map(p => p.mpn)).toEqual(['CSD17313Q2', 'IRLR024N']);
      expect(result.map(p => p.mpn)).not.toContain('2N7002DW');
    });

    it('would have KEPT it under the old `hardFail !== true` rule — this is the regression guard', () => {
      // Pin the old behaviour explicitly, so nobody "simplifies" the filter back to it.
      const oldRule = withUnreadable.filter(p => p.hardFail !== true);
      expect(oldRule.map(p => p.mpn)).toContain('2N7002DW');
    });
  });

  it('manufacturer_filter matches case-insensitive substring', () => {
    const result = applySearchResultFilter(vetted, { manufacturer_filter: 'onsemi' });
    expect(result.map(p => p.mpn).sort()).toEqual(['MMBT3904', 'PN2222']);
  });

  it('exclude_obsolete (legacy alias) drops Obsolete parts only', () => {
    const result = applySearchResultFilter(vetted, { exclude_obsolete: true });
    expect(result.map(p => p.mpn)).not.toContain('BC817');
    expect(result).toHaveLength(4);
  });

  // Lifecycle statuses are DISTINCT. The original predicate was a literal
  // `status !== 'Obsolete'` check driven by one boolean, and the fixture set above
  // carries no Discontinued part — which is exactly why the suite stayed green
  // while "hide discontinued" was deleting the user's Obsolete parts instead.
  describe('exclude_statuses — per-status precision', () => {
    const mixed: PartSummary[] = [
      part({ mpn: 'ACT', status: 'Active' }),
      part({ mpn: 'OBS', status: 'Obsolete' }),
      part({ mpn: 'DISC', status: 'Discontinued' }),
      part({ mpn: 'NR', status: 'NRND' }),
      part({ mpn: 'LTB', status: 'LastTimeBuy' }),
      part({ mpn: 'NOSTATUS' }), // no lifecycle data at all
    ];

    it('hides Discontinued WITHOUT touching Obsolete', () => {
      const out = applySearchResultFilter(mixed, { exclude_statuses: ['Discontinued'] });
      expect(out.map(p => p.mpn)).not.toContain('DISC');
      expect(out.map(p => p.mpn)).toContain('OBS'); // the original bug: OBS was dropped instead
    });

    it('hides Obsolete WITHOUT touching Discontinued', () => {
      const out = applySearchResultFilter(mixed, { exclude_statuses: ['Obsolete'] });
      expect(out.map(p => p.mpn)).not.toContain('OBS');
      expect(out.map(p => p.mpn)).toContain('DISC');
    });

    it('hides NRND and LastTimeBuy independently', () => {
      expect(applySearchResultFilter(mixed, { exclude_statuses: ['NRND'] }).map(p => p.mpn)).not.toContain('NR');
      expect(applySearchResultFilter(mixed, { exclude_statuses: ['LastTimeBuy'] }).map(p => p.mpn)).not.toContain('LTB');
    });

    it('hides several statuses at once', () => {
      const out = applySearchResultFilter(mixed, { exclude_statuses: ['Obsolete', 'Discontinued'] });
      expect(out.map(p => p.mpn).sort()).toEqual(['ACT', 'LTB', 'NOSTATUS', 'NR']);
    });

    it('"only active" hides every non-Active status', () => {
      const out = applySearchResultFilter(mixed, {
        exclude_statuses: ['Obsolete', 'Discontinued', 'NRND', 'LastTimeBuy'],
      });
      expect(out.map(p => p.mpn).sort()).toEqual(['ACT', 'NOSTATUS']);
    });

    it('a part with NO status data is treated as Active — missing data never hides a part', () => {
      const out = applySearchResultFilter(mixed, {
        exclude_statuses: ['Obsolete', 'Discontinued', 'NRND', 'LastTimeBuy'],
      });
      expect(out.map(p => p.mpn)).toContain('NOSTATUS');
    });

    it('unions with the legacy exclude_obsolete flag rather than overriding it', () => {
      const out = applySearchResultFilter(mixed, {
        exclude_statuses: ['Discontinued'],
        exclude_obsolete: true,
      });
      expect(out.map(p => p.mpn).sort()).toEqual(['ACT', 'LTB', 'NOSTATUS', 'NR']);
    });
  });

  it('aec_qualified_only keeps parts with an AEC badge', () => {
    const result = applySearchResultFilter(vetted, { aec_qualified_only: true });
    expect(result.map(p => p.mpn)).toEqual(['BC847B']);
  });

  it('ANDs multiple predicates', () => {
    // meets spec AND active AND from onsemi → MMBT3904 only (PN2222 is hardFail).
    const result = applySearchResultFilter(vetted, {
      meets_spec: true,
      exclude_obsolete: true,
      manufacturer_filter: 'onsemi',
    });
    expect(result.map(p => p.mpn)).toEqual(['MMBT3904']);
  });

  it('does not mutate the input array', () => {
    const copy = [...vetted];
    applySearchResultFilter(vetted, { meets_spec: true });
    expect(vetted).toEqual(copy);
  });

  it('mfr_origin_filter=atlas keeps every Chinese maker — incl. one sourced via Digikey', () => {
    const result = applySearchResultFilter(mixedOrigin, { mfr_origin_filter: 'atlas' });
    // 3PEAK (Digikey-sourced) is the case the old dataSource-only approach missed.
    expect(result.map(p => p.manufacturer).sort()).toEqual(['3PEAK', 'ChipNobo', 'HGSEMI']);
  });

  it('mfr_origin_filter=western keeps only non-Chinese makers', () => {
    const result = applySearchResultFilter(mixedOrigin, { mfr_origin_filter: 'western' });
    expect(result.map(p => p.manufacturer).sort()).toEqual(['Texas Instruments', 'onsemi']);
  });

  it('mfr_origin_filter drops unresolved (unknown) origin on an explicit origin ask', () => {
    const result = applySearchResultFilter(mixedOrigin, { mfr_origin_filter: 'atlas' });
    expect(result.map(p => p.mpn)).not.toContain('LM358MYST');
  });

  it('mfr_origin_filter=atlas catches Atlas-sourced cards that have no resolved mfrOrigin (cached)', () => {
    // The regression: a card flagged 🇨🇳 via dataSource==='atlas' must survive the
    // Chinese filter even when mfrOrigin was never set. Old predicate dropped them → "0 Chinese".
    const result = applySearchResultFilter(cachedNoOrigin, { mfr_origin_filter: 'atlas' });
    expect(result.map(p => p.manufacturer).sort()).toEqual(['HGSEMI', 'Slkor']);
  });

  it('mfr_origin_filter=western never counts an Atlas-sourced card', () => {
    // Without a resolved mfrOrigin we cannot prove a card is Western, and an
    // Atlas-sourced card is definitively NOT Western — so it must be excluded.
    const result = applySearchResultFilter(cachedNoOrigin, { mfr_origin_filter: 'western' });
    expect(result.map(p => p.mpn)).toEqual([]); // TI card has no mfrOrigin in this cached set
    const resolvedWestern = applySearchResultFilter(mixedOrigin, { mfr_origin_filter: 'western' });
    expect(resolvedWestern.map(p => p.manufacturer).sort()).toEqual(['Texas Instruments', 'onsemi']);
  });
});

describe('describeSearchFilterInput', () => {
  it('joins active predicates with +', () => {
    expect(describeSearchFilterInput({ meets_spec: true, manufacturer_filter: 'Vishay' }))
      .toBe('meets your specs + Vishay');
  });

  it('labels the origin filter', () => {
    expect(describeSearchFilterInput({ mfr_origin_filter: 'atlas' })).toBe('Chinese MFRs');
    expect(describeSearchFilterInput({ mfr_origin_filter: 'western' })).toBe('Western MFRs');
  });

  it('falls back to "filtered" when empty', () => {
    expect(describeSearchFilterInput({})).toBe('filtered');
  });
});
