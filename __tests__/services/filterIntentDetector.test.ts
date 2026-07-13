import { detectFilterIntent, detectClearFilterIntent, detectOriginIntent, detectSearchOriginRefinement } from '@/lib/services/filterIntentDetector';
import type { XrefRecommendation } from '@/lib/types';

const rec = (
  mpn: string,
  manufacturer: string,
  matchPercentage: number,
  status: string = 'Active',
): XrefRecommendation => ({
  part: {
    mpn,
    manufacturer,
    description: `${manufacturer} ${mpn}`,
    detailedDescription: `${manufacturer} ${mpn}`,
    category: 'Capacitors',
    subcategory: 'Aluminum Electrolytic',
    status: status as 'Active' | 'Obsolete',
  },
  matchPercentage,
  matchDetails: [],
});

const sampleRecs: XrefRecommendation[] = [
  rec('860020772005', 'Würth Elektronik', 96),
  rec('860160672002', 'Würth Elektronik', 96),
  rec('860010672005', 'Würth Elektronik', 90),
  rec('GRM188R71C104KA01D', 'Murata Electronics', 88),
  rec('CL10A106KP8NNNC', 'Samsung Electro-Mechanics', 84),
  rec('UWX1H010MCL1GB', 'Nichicon', 78),
  rec('GHOST1', 'Old MPN', 60, 'Obsolete'),
];

describe('detectFilterIntent — manufacturer', () => {
  it('matches "Pls just show me replacements from Wurth"', () => {
    const result = detectFilterIntent('Pls just show me replacements from Wurth', sampleRecs);
    expect(result?.filterInput.manufacturer_filter).toBe('Würth Elektronik');
    expect(result?.label).toBe('Würth Elektronik');
  });

  // The exact phrasings the user reported failing — must match.
  it('matches "show me parts from Wurth"', () => {
    expect(
      detectFilterIntent('show me parts from Wurth', sampleRecs)?.filterInput.manufacturer_filter,
    ).toBe('Würth Elektronik');
  });

  it('matches "just show me parts from Wurth"', () => {
    expect(
      detectFilterIntent('just show me parts from Wurth', sampleRecs)?.filterInput.manufacturer_filter,
    ).toBe('Würth Elektronik');
  });

  it('matches "show me replacements from Wurth"', () => {
    expect(
      detectFilterIntent('show me replacements from Wurth', sampleRecs)?.filterInput.manufacturer_filter,
    ).toBe('Würth Elektronik');
  });

  it('matches "show me Wurth replacements"', () => {
    expect(
      detectFilterIntent('show me Wurth replacements', sampleRecs)?.filterInput.manufacturer_filter,
    ).toBe('Würth Elektronik');
  });

  it('matches "show only Murata"', () => {
    const result = detectFilterIntent('show only Murata', sampleRecs);
    expect(result?.filterInput.manufacturer_filter).toBe('Murata Electronics');
  });

  it('matches "filter to Nichicon"', () => {
    const result = detectFilterIntent('filter to Nichicon', sampleRecs);
    expect(result?.filterInput.manufacturer_filter).toBe('Nichicon');
  });

  it('matches diacritic-insensitive ("würth" / "wurth" / "Würth")', () => {
    expect(detectFilterIntent('only würth', sampleRecs)?.filterInput.manufacturer_filter).toBe('Würth Elektronik');
    expect(detectFilterIntent('only Würth', sampleRecs)?.filterInput.manufacturer_filter).toBe('Würth Elektronik');
    expect(detectFilterIntent('show only wurth', sampleRecs)?.filterInput.manufacturer_filter).toBe('Würth Elektronik');
  });

  it('returns null when no MFR token in query matches recs', () => {
    expect(detectFilterIntent('show only TDK', sampleRecs)).toBeNull();
    expect(detectFilterIntent('only TI', sampleRecs)).toBeNull();
  });

  it('returns null when no filter verb is present', () => {
    expect(detectFilterIntent('what about Würth?', sampleRecs)).toBeNull();
    expect(detectFilterIntent('I like Murata', sampleRecs)).toBeNull();
  });

  it('returns null when recs list is empty', () => {
    expect(detectFilterIntent('show only Würth', [])).toBeNull();
  });
});

describe('detectFilterIntent — qualification (AEC-Q)', () => {
  it('matches "only AEC-Q200"', () => {
    const result = detectFilterIntent('show only AEC-Q200', sampleRecs);
    expect(result?.filterInput.attribute_filters?.[0].value).toBe('AEC-Q200');
    expect(result?.label).toBe('AEC-Q200');
  });

  it('matches "filter to AEC-Q100"', () => {
    const result = detectFilterIntent('filter to AEC-Q100', sampleRecs);
    expect(result?.filterInput.attribute_filters?.[0].value).toBe('AEC-Q100');
  });

  it('returns null without filter verb (e.g., a question)', () => {
    expect(detectFilterIntent('which are AEC-Q200?', sampleRecs)).toBeNull();
  });
});

describe('detectFilterIntent — status', () => {
  // Each lifecycle word must resolve to EXACTLY the status it names. The original
  // detector collapsed obsolete / discontinued / eol / not-recommended into one
  // `exclude_obsolete` boolean whose predicate only ever removed 'Obsolete' — so
  // "hide discontinued" deleted the user's OBSOLETE parts and left the discontinued
  // ones on screen. These assert the words can never be conflated again.
  const statuses = (q: string) => detectFilterIntent(q, sampleRecs)?.filterInput.exclude_statuses;

  it('"hide obsolete" hides Obsolete and NOTHING else', () => {
    expect(statuses('hide obsolete')).toEqual(['Obsolete']);
  });

  it('"hide discontinued" hides Discontinued and NOTHING else — never Obsolete', () => {
    expect(statuses('hide discontinued parts')).toEqual(['Discontinued']);
  });

  it("the reported phrasing — \"don't show me discontinued parts\"", () => {
    expect(statuses("don't show me discontinued parts")).toEqual(['Discontinued']);
  });

  it('hides NRND on its own', () => {
    expect(statuses('exclude NRND parts')).toEqual(['NRND']);
    expect(statuses('hide not recommended for new designs')).toEqual(['NRND']);
  });

  it('hides Last Time Buy on its own', () => {
    expect(statuses('hide last time buy parts')).toEqual(['LastTimeBuy']);
  });

  it('unions multiple named statuses', () => {
    expect(statuses('hide obsolete and discontinued parts')?.sort())
      .toEqual(['Discontinued', 'Obsolete']);
  });

  it('"exclude EOL parts" is a GROUP word — hides every non-Active status', () => {
    expect(statuses('exclude eol parts')?.sort())
      .toEqual(['Discontinued', 'LastTimeBuy', 'NRND', 'Obsolete']);
  });

  it('"show only active" inverts to hide every non-Active status', () => {
    expect(statuses('show only active parts')?.sort())
      .toEqual(['Discontinued', 'LastTimeBuy', 'NRND', 'Obsolete']);
  });

  it('"only" + a dead status keeps that status and hides the rest', () => {
    expect(statuses('show me only the obsolete ones')?.sort())
      .toEqual(['Active', 'Discontinued', 'LastTimeBuy', 'NRND']);
  });

  it('never hides Active as collateral when Active is the thing being asked FOR', () => {
    // "show the active ones but drop discontinued" names both statuses. Hiding
    // Active here would delete exactly what the user asked to see.
    expect(statuses('show me the active ones but drop discontinued')).toEqual(['Discontinued']);
  });

  it('a status word with no narrowing cue is a QUESTION, not a filter', () => {
    expect(statuses('is this part discontinued?')).toBeUndefined();
    expect(detectFilterIntent('is this part discontinued?', sampleRecs)).toBeNull();
  });

  it('"inactive" does not trip the bare \\bactive\\b matcher', () => {
    // Would be catastrophic: hiding every non-Active status when the user asked
    // to SEE the inactive ones.
    expect(statuses('show me only inactive parts')?.sort()).toEqual(['Active']);
  });
});

describe('detectFilterIntent — match percentage', () => {
  it('matches "≥80%"', () => {
    expect(detectFilterIntent('≥80%', sampleRecs)?.filterInput.min_match_percentage).toBe(80);
  });

  it('matches "above 75"', () => {
    expect(detectFilterIntent('above 75', sampleRecs)?.filterInput.min_match_percentage).toBe(75);
  });

  it('matches "at least 90% match"', () => {
    expect(detectFilterIntent('at least 90% match', sampleRecs)?.filterInput.min_match_percentage).toBe(90);
  });

  it('matches "drop everything below 80"', () => {
    expect(detectFilterIntent('drop everything below 80', sampleRecs)?.filterInput.min_match_percentage).toBe(80);
  });
});

describe('detectFilterIntent — origin (Chinese / Western)', () => {
  // Origin filter relies on Part.mfrOrigin — populated for every rec by the
  // manufacturer alias resolver in production. We don't need recs in the set
  // that match the origin for the detector itself to fire; the dispatcher
  // handles the empty-result case.
  const recsWithOrigin: XrefRecommendation[] = [
    {
      part: {
        mpn: 'CL10A106KP8NNNC', manufacturer: 'Samsung Electro-Mechanics',
        description: 'MLCC', detailedDescription: 'MLCC', category: 'Capacitors',
        subcategory: 'Aluminum Electrolytic', status: 'Active', mfrOrigin: 'western',
      },
      matchPercentage: 84, matchDetails: [],
    },
    {
      part: {
        mpn: 'CC0805KKX5R7BB106', manufacturer: '3PEAK',
        description: 'MLCC', detailedDescription: 'MLCC', category: 'Capacitors',
        subcategory: 'Aluminum Electrolytic', status: 'Active', mfrOrigin: 'atlas',
      },
      matchPercentage: 80, matchDetails: [],
    },
  ];

  it.each([
    'show only Chinese',
    'Chinese alternatives',
    'find me Chinese replacements',
    'Asian alternatives',
    'made in China',
    'from China',
    'sourced in China',
    'PRC manufacturers only',
    'mainland China parts',
  ])('matches "%s" → atlas', (q) => {
    expect(detectFilterIntent(q, recsWithOrigin)?.filterInput.mfr_origin_filter).toBe('atlas');
  });

  it.each([
    'show only Western',
    'Western alternatives',
    'American replacements',
    'European MFRs',
    'non-Chinese',
    'non chinese only',
  ])('matches "%s" → western', (q) => {
    expect(detectFilterIntent(q, recsWithOrigin)?.filterInput.mfr_origin_filter).toBe('western');
  });

  it('label is human-readable', () => {
    expect(detectFilterIntent('Chinese only', recsWithOrigin)?.label).toBe('Chinese MFRs');
    expect(detectFilterIntent('Western only', recsWithOrigin)?.label).toBe('Western MFRs');
  });

  it('does NOT match when origin word is absent', () => {
    expect(detectFilterIntent('show only Murata', recsWithOrigin)?.filterInput.mfr_origin_filter).toBeUndefined();
  });

  it('takes priority over manufacturer detector when both could match', () => {
    // "Chinese Murata" — origin is the more specific signal here
    const r = detectFilterIntent('show only Chinese Murata', recsWithOrigin);
    expect(r?.filterInput.mfr_origin_filter).toBe('atlas');
    expect(r?.filterInput.manufacturer_filter).toBeUndefined();
  });
});

describe('detectOriginIntent — recs-independent (used pre-recs)', () => {
  // The exported origin detector is pure query regex, so the pre-recs path can
  // recognize "recommend Chinese MFRs only" and run cross-references with the
  // filter bundled, before any candidates exist.
  it.each([
    ['Can you recommend Chinese MFRs only?', 'atlas'],
    ['Chinese recommendations', 'atlas'],
    ['any Chinese alternatives', 'atlas'],
    ['made in China options', 'atlas'],
  ])('"%s" -> atlas', (q) => {
    expect(detectOriginIntent(q)?.filterInput.mfr_origin_filter).toBe('atlas');
  });

  it.each([
    'recommend Western MFRs only',
    'non-Chinese options',
    'American or European alternatives',
  ])('"%s" -> western', (q) => {
    expect(detectOriginIntent(q)?.filterInput.mfr_origin_filter).toBe('western');
  });

  it.each([
    'what is the price for 100',
    'show me replacements',
    'tell me about this part',
    '',
  ])('returns null for: "%s"', (q) => {
    expect(detectOriginIntent(q)).toBeNull();
  });
});

describe('detectSearchOriginRefinement — pure origin refine vs new search', () => {
  // Fires (refinement of the CURRENT search cards) only when the message is about
  // origin AND names no part type. Drives the deterministic search-result origin
  // filter that fixes the LLM prose-answering "none are Chinese".
  it.each([
    ['show me only the Chinese ones', 'atlas'],
    ['Show me only products from Chinese manufacturers', 'atlas'],
    ['just the Chinese ones', 'atlas'],
    ['Chinese only', 'atlas'],
    ['now the Western ones', 'western'],
    ['western only', 'western'],
    ['non-Chinese alternatives', 'western'],
  ])('"%s" -> refinement (%s)', (q, origin) => {
    expect(detectSearchOriginRefinement(q)?.origin).toBe(origin);
  });

  // Descriptor-laden origin refinements that the OLD word-list heuristic leaked to
  // the LLM (any ≥3-char leftover word was treated as a part type) — they must now
  // resolve as refinements so origin narrowing stays deterministic.
  it.each([
    ['show me only PRC-based options', 'atlas'],
    ['Chinese firms only', 'atlas'],
    ['the reputable Chinese ones', 'atlas'],
    ['show me the good Chinese ones', 'atlas'],
    ['the better western ones', 'western'],
  ])('"%s" -> refinement (%s) [descriptor, not a part type]', (q, origin) => {
    expect(detectSearchOriginRefinement(q)?.origin).toBe(origin);
  });

  it.each([
    'find Chinese MLCCs',           // names a part type → new search
    'I need a Chinese op amp',
    'Chinese capacitor',
    'show me a chinese tantalum',   // material qualifier names a part type
    'chinese diodes',
    'western mosfets',
    'find me a 3.3V LDO',           // not an origin ask at all
    'show me the cheapest ones',    // a different (non-origin) refinement
  ])('"%s" -> null (new search or non-origin)', (q) => {
    expect(detectSearchOriginRefinement(q)).toBeNull();
  });
});

describe('detectFilterIntent — category', () => {
  it('matches "only Accuris certified"', () => {
    const result = detectFilterIntent('show only Accuris certified', sampleRecs);
    expect(result?.filterInput.category_filter).toBe('third_party_certified');
  });

  it('matches "filter to MFR-certified"', () => {
    const result = detectFilterIntent('filter to MFR-certified', sampleRecs);
    expect(result?.filterInput.category_filter).toBe('manufacturer_certified');
  });

  it('matches "only logic-driven"', () => {
    const result = detectFilterIntent('only logic-driven', sampleRecs);
    expect(result?.filterInput.category_filter).toBe('logic_driven');
  });
});

describe('detectClearFilterIntent', () => {
  const positives = [
    'Can you now show me all the MFRs again (remove the wurth filter)',
    'remove the filter',
    'remove the wurth filter',
    'clear filter',
    'clear the filter',
    'drop the filter',
    'reset filter',
    'unfilter',
    'show me all',
    'show all',
    'show me everything',
    'show me the full list',
    'no filter',
    'without filter',
    'back to all',
    'back to everything',
    'see all replacements',
    'give me all the manufacturers',
  ];
  it.each(positives)('matches: "%s"', (q) => {
    expect(detectClearFilterIntent(q)).toBe(true);
  });

  const negatives = [
    'show only Wurth',
    'show me Wurth replacements',
    'filter to AEC-Q200',
    '',
    '   ',
    'what is this part?',
  ];
  it.each(negatives)('does NOT match: "%s"', (q) => {
    expect(detectClearFilterIntent(q)).toBe(false);
  });
});

describe('detectFilterIntent — priority and edge cases', () => {
  it('matches the longest manufacturer name when multiple could match', () => {
    const recs = [
      rec('A1', 'Murata', 90),
      rec('A2', 'Murata Electronics', 88),
    ];
    // "show only Murata Electronics" → should pick the longer canonical name
    const result = detectFilterIntent('show only Murata Electronics', recs);
    expect(result?.filterInput.manufacturer_filter).toBe('Murata Electronics');
  });

  it('returns null on empty query', () => {
    expect(detectFilterIntent('', sampleRecs)).toBeNull();
    expect(detectFilterIntent('   ', sampleRecs)).toBeNull();
  });

  it('skips MFR stopwords when token-matching', () => {
    // Query "show only electronics" should NOT match a MFR named "Würth Elektronik"
    // just because both contain "elektronik"-like tokens — "electronics" is a stopword.
    // (Note: "electronics" is also normalized but it's a stopword so it shouldn't trigger.)
    const result = detectFilterIntent('show only electronics', sampleRecs);
    expect(result).toBeNull();
  });
});
