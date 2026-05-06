import { detectQueryIntent } from '@/lib/services/intentDetector';

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
    'is there an equivalent?',
    'drop-in substitute for ABC',
    'subs for ABC',
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
