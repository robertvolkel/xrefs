import { normalizeMakerName, makerMatches } from '@/lib/services/makerNameMatch';

/**
 * The manufacturer strings below are REAL FindChips values pulled from a live LM317T response
 * (franchised site, 2026-07-24), paired with the card/source names our app actually carries.
 * The rule under test is conservative-by-design: confident match, or exclude. The dangerous
 * direction is a FALSE positive (attributes a distributor's buy link to the wrong maker), so the
 * "must NOT match" cases are the load-bearing ones.
 */

describe('normalizeMakerName', () => {
  it('strips generic corporate-suffix words down to the identity core', () => {
    expect(normalizeMakerName('Goodwork Semiconductor Co Ltd')).toBe('goodwork');
    expect(normalizeMakerName('National Semiconductor Corporation')).toBe('national');
    expect(normalizeMakerName('Fairchild Semiconductor Corporation')).toBe('fairchild');
    expect(normalizeMakerName('Silicon Penn Microelectronics Co Ltd')).toBe('silicon penn');
  });

  it('leaves a concatenated single-token name intact (no separator to split on)', () => {
    expect(normalizeMakerName('STMicroelectronics')).toBe('stmicroelectronics');
  });

  it('is case- and punctuation-insensitive', () => {
    expect(normalizeMakerName('minos')).toBe(normalizeMakerName('Minos'));
    expect(normalizeMakerName('ST-Ericsson')).toBe('st ericsson');
  });

  it('does not touch a company word fused into a single token (Microchip is not "chip")', () => {
    expect(normalizeMakerName('Microchip')).toBe('microchip');
  });

  it('returns empty for blank/unknown input', () => {
    expect(normalizeMakerName('')).toBe('');
    expect(normalizeMakerName(undefined)).toBe('');
    expect(normalizeMakerName(null)).toBe('');
  });
});

describe('makerMatches — confident matches (real FindChips strings)', () => {
  it('matches identical full names', () => {
    expect(makerMatches('STMicroelectronics', 'STMicroelectronics')).toBe(true);
    expect(makerMatches('Texas Instruments', 'Texas Instruments')).toBe(true);
    expect(makerMatches('onsemi', 'onsemi')).toBe(true);
  });

  it('matches a short card name to the full FindChips corporate name', () => {
    expect(makerMatches('GOODWORK', 'Goodwork Semiconductor Co Ltd')).toBe(true);
    expect(makerMatches('UMW', 'UMW')).toBe(true);
    expect(makerMatches('minos', 'Minos')).toBe(true);
  });

  it('matches via an alias variant when the raw card name differs', () => {
    // A source card labelled "ST" still matches FindChips "STMicroelectronics" when the alias
    // resolver supplies the variant.
    expect(makerMatches('ST', 'STMicroelectronics', ['ST', 'STMicroelectronics'])).toBe(true);
  });
});

describe('makerMatches — must NOT match (the dangerous direction)', () => {
  it('does not match two genuinely different makers of the same MPN', () => {
    expect(makerMatches('STMicroelectronics', 'Texas Instruments')).toBe(false);
    expect(makerMatches('Texas Instruments', 'National Semiconductor Corporation')).toBe(false);
    expect(makerMatches('onsemi', 'Fairchild Semiconductor Corporation')).toBe(false);
  });

  it('does not confuse a related-but-distinct entity (ST vs ST-Ericsson)', () => {
    expect(makerMatches('STMicroelectronics', 'ST-Ericsson')).toBe(false);
    expect(makerMatches('STMicroelectronics', 'ST-E')).toBe(false);
  });

  it('does not match an abbreviation it cannot confidently expand (HGSEMI vs HuaGuan)', () => {
    expect(makerMatches('HGSEMI', 'HuaGuan Semiconductor')).toBe(false);
  });

  it('does not collapse distinct companies that share a word once generic suffixes are stripped', () => {
    // Crystal Semiconductor (→ Cirrus Logic) is NOT Micro Crystal AG (Swiss RTC maker). Regression
    // for the 'micro'/'semiconductor' strips both landing on "crystal". (Found by code review.)
    expect(makerMatches('Crystal Semiconductor', 'Micro Crystal')).toBe(false);
    expect(makerMatches('Crystal Semiconductor Corporation', 'Micro Crystal AG')).toBe(false);
    // Linear Technology (→ Analog Devices) is NOT Linear (Integrated) Systems (discrete JFET maker).
    // The more dangerous one — Linear Systems second-sources discretes, so MPN overlap is realistic.
    expect(makerMatches('Linear Technology', 'Linear Systems')).toBe(false);
    // A real maker must not reduce to a generic COMPONENT word. Stripping 'international' left
    // "International Rectifier" as bare "rectifier", matching any "…Rectifier" offer. (Reviewer 2.)
    expect(makerMatches('International Rectifier', 'Rectifier')).toBe(false);
  });

  it('never matches when either side is empty/unknown', () => {
    expect(makerMatches(undefined, 'STMicroelectronics')).toBe(false);
    expect(makerMatches('STMicroelectronics', undefined)).toBe(false);
    expect(makerMatches('STMicroelectronics', '')).toBe(false);
  });
});
