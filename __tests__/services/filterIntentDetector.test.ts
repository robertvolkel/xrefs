import { detectFilterIntent, detectClearFilterIntent } from '@/lib/services/filterIntentDetector';
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

describe('detectFilterIntent — status (active / hide obsolete)', () => {
  it('matches "hide obsolete"', () => {
    const result = detectFilterIntent('hide obsolete', sampleRecs);
    expect(result?.filterInput.exclude_obsolete).toBe(true);
  });

  it('matches "exclude EOL parts"', () => {
    expect(detectFilterIntent('exclude eol parts', sampleRecs)?.filterInput.exclude_obsolete).toBe(true);
  });

  it('matches "show only active"', () => {
    expect(detectFilterIntent('show only active parts', sampleRecs)?.filterInput.exclude_obsolete).toBe(true);
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
