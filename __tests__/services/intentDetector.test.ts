import { detectQueryIntent, extractQuantity, extractBestPriceQuantity } from '@/lib/services/intentDetector';

describe('detectQueryIntent — best_price', () => {
  const cases = [
    'What is the lowest price I can get in the market for this part: 860020672005',
    'cheapest spot price for STM32L431RBT6',
    'price for GRM188R71C104KA01D',
    'what does LM358 cost?',
    'how much is this part?',
    'where can I buy ABC123',
    'in stock anywhere?',
    'price LM358',
  ];
  it.each(cases)('matches: "%s"', (q) => {
    expect(detectQueryIntent(q)).toBe('best_price');
  });
});

describe('detectQueryIntent — find_replacements', () => {
  const cases = [
    'find a replacement for STM32L431RBT6',
    'what can I use instead of GRM188R71C104KA01D?',
    'cross reference for LM358',
    'cross-ref ABC123',
    'alternatives to this part',
    'alternate parts',
    'can you show me alternates for this part?',
    'is there an equivalent?',
    'equivalent parts for LM358',
    'drop-in substitute for ABC',
    'subs for ABC',
    // Industry vocabulary for cross-references (Decision: alias expansion)
    'show me the crosses',
    'what are the crosses for this part?',
    'xrefs for STM32L431RBT6',
    'x-refs please',
    'any alts?',
    'show me alts',
    // Keyword-less "something else" phrasings
    'show me other parts',
    'parts from other manufacturers',
    'anything from a different manufacturer?',
  ];
  it.each(cases)('matches: "%s"', (q) => {
    expect(detectQueryIntent(q)).toBe('find_replacements');
  });
});

describe('detectQueryIntent — show_mfr_profile', () => {
  const cases = [
    'tell me about Würth Elektronik ABC123',
    'who makes ABC123',
    'info on this manufacturer ABC123',
    'profile of GigaDevice GD25B127D',
  ];
  it.each(cases)('matches: "%s"', (q) => {
    expect(detectQueryIntent(q)).toBe('show_mfr_profile');
  });
});

describe('detectQueryIntent — neutral queries', () => {
  const cases = [
    'STM32L431RBT6',
    'GRM188R71C104KA01D',
    '860020672005',
    '10uF 25V X7R 0805',
    'AEC-Q200 buck converter',
    '',
    '   ',
  ];
  it.each(cases)('returns null for: "%s"', (q) => {
    expect(detectQueryIntent(q)).toBeNull();
  });
});

describe('detectQueryIntent — priority ordering', () => {
  it('prefers best_price over find_replacements when both could match', () => {
    // "lowest price for an alternative to LM358" — both keywords present.
    expect(detectQueryIntent('lowest price for an alternative to LM358')).toBe('best_price');
  });
});

describe('extractQuantity — stated quantities', () => {
  const cases: [string, number][] = [
    ['I will need 100 units', 100],
    ["what's the price for 1 unit", 1],
    ['qty 50', 50],
    ['quantity: 1k', 1000],
    ['10,000 pieces', 10000],
    ['100', 100],
    ['make it 250', 250],
    ['for 100', 100],
    ['order 2k', 2000],
    ['give me 5 pcs', 5],
    ['2.5k units', 2500],
    ['5 each', 5],
  ];
  it.each(cases)('"%s" -> %i', (q, expected) => {
    expect(extractQuantity(q)).toBe(expected);
  });
});

describe('extractQuantity — no quantity (MPNs, specs, vague)', () => {
  const cases = [
    'price for 2N2222',       // MPN, not a qty
    '9V',                     // spec value
    '1-2mA',                  // spec range
    'tolerance of 5%',        // percentage, not a qty
    'operating at 25°C',      // temperature, "at" is not a qty verb
    'lowest price for X',     // no number
    '860020672005',           // 12-digit MPN, above the sane qty cap
    'GRM188R71C104KA01D',     // MPN
    'datasheet of 2N2222',    // MPN after a verb, blocked by trailing-letter guard
    '',
    '   ',
  ];
  it.each(cases)('returns null for: "%s"', (q) => {
    expect(extractQuantity(q)).toBeNull();
  });

  it('strict parse does NOT handle filler words between verb and number', () => {
    // "for just 100" — the loose best-price parser handles this, strict does not.
    expect(extractQuantity('what is the price for just 100')).toBeNull();
  });
});

describe('extractBestPriceQuantity — permissive parse on the price path', () => {
  const cases: [string, number][] = [
    ['Hmm...what is the price for just 100', 100],   // filler word
    ["what's 500 going to cost", 500],               // number before the cost word
    ['I will need 1000 units', 1000],                // strict still wins
    ['price for 1k', 1000],
    ['cheapest, I need around 250', 250],
    ['10,000?', 10000],
  ];
  it.each(cases)('"%s" -> %i', (q, expected) => {
    expect(extractBestPriceQuantity(q)).toBe(expected);
  });

  const nullCases = [
    'price for 2N2222',                  // MPN — digits are letter-adjacent
    'lowest price for STM32L431RBT6',    // MPN
    'price for 0805 caps',               // package code — leading zero excluded
    'what does LM358 cost?',             // MPN, no standalone qty
    'price for 860020672005',            // 12-digit MPN, above qty cap
    'how much is this part?',            // no number at all
  ];
  it.each(nullCases)('returns null for: "%s"', (q) => {
    expect(extractBestPriceQuantity(q)).toBeNull();
  });
});
