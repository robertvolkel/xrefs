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

// A vetted-search result set: each card scored by the engine, so failCount /
// hardFail are populated. Two "Below spec" (hardFail) parts + three green ones.
const vetted: PartSummary[] = [
  part({ mpn: 'BC847B', manufacturer: 'Nexperia', failCount: 0, hardFail: false, status: 'Active', qualifications: ['AEC-Q101'] }),
  part({ mpn: 'MMBT3904', manufacturer: 'onsemi', failCount: 0, hardFail: false, status: 'Active' }),
  part({ mpn: 'BC817', manufacturer: 'Diodes Inc', failCount: 0, hardFail: false, status: 'Obsolete' }),
  part({ mpn: '2N2222', manufacturer: 'STMicro', failCount: 2, hardFail: true, status: 'Active' }),
  part({ mpn: 'PN2222', manufacturer: 'onsemi', failCount: 1, hardFail: true, status: 'Active' }),
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
      part({ mpn: 'A', failCount: 0, hardFail: false }),
      part({ mpn: 'B' }), // no failCount/hardFail — engine did not score it
      part({ mpn: 'C', failCount: 3, hardFail: true }),
    ];
    // Missing data never causes rejection: B (unknown) is kept, only C drops.
    expect(applySearchResultFilter(unscored, { meets_spec: true }).map(p => p.mpn)).toEqual(['A', 'B']);
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
