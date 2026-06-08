/**
 * Tests for the composite domain-card string helpers (Composite Domain
 * Cards refactor). Pure functions, no mocks needed.
 */

import {
  composeCardText,
  splitCardText,
  FACTS_START_SENTINEL,
  FACTS_END_SENTINEL,
  NARRATIVE_SENTINEL,
  CARD_FORMAT_VERSION,
} from '@/lib/services/atlasFamilyCardComposite';

describe('composeCardText', () => {
  it('wraps facts in the FACTS sentinels and narrative under ENGINEERING NOTES', () => {
    const out = composeCardText('RULES:\n- x (X) — identity, weight=10', 'SUB-TYPES — foo vs bar.');
    expect(out).toContain(FACTS_START_SENTINEL);
    expect(out).toContain(FACTS_END_SENTINEL);
    expect(out).toContain(NARRATIVE_SENTINEL);
    // Facts come before narrative.
    expect(out.indexOf(FACTS_START_SENTINEL)).toBeLessThan(out.indexOf(NARRATIVE_SENTINEL));
    expect(out.indexOf(FACTS_END_SENTINEL)).toBeLessThan(out.indexOf(NARRATIVE_SENTINEL));
  });

  it('trims both regions', () => {
    const out = composeCardText('  facts here  ', '\n\nnarrative here\n\n');
    const { factsRegion, narrativeRegion } = splitCardText(out);
    expect(factsRegion).toBe('facts here');
    expect(narrativeRegion).toBe('narrative here');
  });
});

describe('splitCardText', () => {
  it('round-trips with composeCardText', () => {
    const facts = 'RULES:\n- device_category (Device Category) — identity, weight=10\nMFR COHORT:\n- EVISUN: 100 products';
    const narrative = 'SUB-TYPES — 555 timers vs packaged oscillators are architecturally unrelated.';
    const composed = composeCardText(facts, narrative);
    const { factsRegion, narrativeRegion } = splitCardText(composed);
    expect(factsRegion).toBe(facts.trim());
    expect(narrativeRegion).toBe(narrative.trim());
  });

  it('returns factsRegion=null for legacy prose cards (no sentinel)', () => {
    const legacy = 'SUB-TYPES — N-channel vs P-channel: HARD GATE.\nCOMMON MPN PREFIXES: IRF, BSS.';
    const { factsRegion, narrativeRegion } = splitCardText(legacy);
    expect(factsRegion).toBeNull();
    // Legacy → whole card is the audit surface.
    expect(narrativeRegion).toBe(legacy);
  });

  it('handles empty input', () => {
    expect(splitCardText('')).toEqual({ factsRegion: null, narrativeRegion: '' });
  });

  it('treats a FACTS start without an END sentinel as legacy (does not hide text)', () => {
    const malformed = `${FACTS_START_SENTINEL}\nsome facts but no end marker\nmore prose`;
    const { factsRegion, narrativeRegion } = splitCardText(malformed);
    expect(factsRegion).toBeNull();
    expect(narrativeRegion).toBe(malformed);
  });

  it('handles a composite card with no ENGINEERING NOTES sentinel (narrative is whatever follows facts)', () => {
    const card = `${FACTS_START_SENTINEL}\nfacts body\n${FACTS_END_SENTINEL}\ntrailing narrative`;
    const { factsRegion, narrativeRegion } = splitCardText(card);
    expect(factsRegion).toBe('facts body');
    expect(narrativeRegion).toBe('trailing narrative');
  });
});

describe('CARD_FORMAT_VERSION', () => {
  it('is 2 (composite format)', () => {
    expect(CARD_FORMAT_VERSION).toBe(2);
  });
});
