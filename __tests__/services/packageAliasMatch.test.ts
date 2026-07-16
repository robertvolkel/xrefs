import { packageValuesMatch } from '@/lib/services/matchingEngine';

/**
 * A PACKAGE IS AN ALIAS LIST, NOT A NAME.
 *
 * Digikey writes a package as every name it goes by, comma-separated, in one field. Everyone else
 * writes one name. An exact string compare therefore fails for EVERY part — measured on BC847C in a
 * "gain of at least 300" search, `package_case` was the ONLY failing rule, and it was enough to
 * label the correct part "Below spec" while dual transistors (whose specs we can't read, so nothing
 * could fail) were presented as fitting.
 *
 * The MUST-NOT-MATCH cases below are the reason this is a real rule and not a `startsWith`. Getting
 * them wrong would silently cross a 3-lead part to a 6-lead footprint — a physically impossible
 * swap that would look like a clean pass.
 */
describe('packageValuesMatch — a package is an alias list', () => {
  const DIGIKEY_SOT23_3 = 'TO-236-3, SC-59, SOT-23-3';

  describe('the bug this fixes', () => {
    it('matches a user\'s "SOT-23" against Digikey\'s full alias list', () => {
      expect(packageValuesMatch('SOT-23', DIGIKEY_SOT23_3)).toBe(true);
    });

    it('matches on ANY name in the list, not just the first', () => {
      expect(packageValuesMatch('SC-59', DIGIKEY_SOT23_3)).toBe(true);
      expect(packageValuesMatch('TO-236-3', DIGIKEY_SOT23_3)).toBe(true);
    });

    it('matches two sources that name the same package differently', () => {
      // The cross-reference case: a real source part and a real candidate, from different feeds.
      expect(packageValuesMatch(DIGIKEY_SOT23_3, 'SOT-23-3')).toBe(true);
    });

    it('ignores a trailing parenthetical gloss — "0402 (1005 Metric)" is still 0402', () => {
      expect(packageValuesMatch('0402', '0402 (1005 Metric)')).toBe(true);
      expect(packageValuesMatch('0402 (1005 Metric)', '0402')).toBe(true);
    });

    it('is case- and whitespace-insensitive', () => {
      expect(packageValuesMatch('sot-23', 'TO-236-3,  SC-59,  SOT-23-3')).toBe(true);
    });
  });

  describe('MUST NOT MATCH — the lead count is load-bearing', () => {
    it('does NOT cross a 3-lead part to a 6-lead footprint', () => {
      // This is the swap that would be physically impossible and would look like a clean pass.
      expect(packageValuesMatch('SOT-23-3', 'SOT-23-6')).toBe(false);
      expect(packageValuesMatch(DIGIKEY_SOT23_3, 'SOT-23-6, SOT-26')).toBe(false);
    });

    it('does NOT confuse SOT-23 with SOT-223 — a prefix test would', () => {
      // "SOT-23" is a string-prefix of "SOT-223"; they are completely different packages.
      expect(packageValuesMatch('SOT-23', 'SOT-223')).toBe(false);
      expect(packageValuesMatch('SOT-23', 'SOT-223-3')).toBe(false);
    });

    it('does NOT match unrelated packages', () => {
      expect(packageValuesMatch('SOT-23', 'TO-92-3')).toBe(false);
      expect(packageValuesMatch('0402', '0603')).toBe(false);
      expect(packageValuesMatch('SOT-23', '')).toBe(false);
    });
  });

  describe('an unstated lead count stays open', () => {
    it('"SOT-23" (no count stated) matches either lead count', () => {
      // Deliberate: the user left it open, so we do not narrow it for them. The 6-lead DUAL that
      // this admits must be rejected on POLARITY (it is an NPN/PNP pair, not an NPN) — not here.
      expect(packageValuesMatch('SOT-23', 'SOT-23-3')).toBe(true);
      expect(packageValuesMatch('SOT-23', 'SOT-23-6')).toBe(true);
    });
  });

  describe('MUST NOT MATCH — same pin count is not the same package', () => {
    // The trap the old numeric fallback fell into: an IC package leads with its pin count, and
    // reading just that number made every 8-pin part equal to every other. "8-SOIC" and "8-MSOP"
    // are different footprints and are NOT interchangeable.
    it('does NOT cross two 8-pin IC packages of different families', () => {
      expect(packageValuesMatch('8-SOIC', '8-MSOP')).toBe(false);
      expect(packageValuesMatch('8-SOIC', '8-VSSOP')).toBe(false);
      expect(packageValuesMatch('8-SOIC', '8-SON')).toBe(false);
    });
    it('does NOT cross an optocoupler DIP-4 to a SOP-4 (same 4 pins, incompatible footprint)', () => {
      expect(packageValuesMatch('DIP-4', 'SOP-4')).toBe(false);
    });
    it('does NOT match two IC packages with different pin counts', () => {
      expect(packageValuesMatch('14-SOIC', '8-SOIC')).toBe(false);
      expect(packageValuesMatch('SOIC-14', 'SOIC-8')).toBe(false);
    });
  });

  describe('IC package word order — pin count leads OR trails, same footprint', () => {
    // JEDEC/datasheets write "SOIC-8"; Digikey writes "8-SOIC". Same package, and a user may type
    // either. Must match — but ONLY when the family and the count both agree.
    it('matches "8-SOIC" against "SOIC-8"', () => {
      expect(packageValuesMatch('8-SOIC', 'SOIC-8')).toBe(true);
      expect(packageValuesMatch('SOIC-8', '8-SOIC')).toBe(true);
      expect(packageValuesMatch('14-TSSOP', 'TSSOP-14')).toBe(true);
    });
    it('does NOT let word order override a family mismatch', () => {
      expect(packageValuesMatch('8-SOIC', 'MSOP-8')).toBe(false);
    });
  });

  describe("a Digikey dimension gloss has a comma INSIDE the parenthetical", () => {
    // "8-SOIC (0.154", 3.90mm Width)" — the gloss itself contains a comma. Splitting on commas
    // first shatters the token; the gloss must be stripped before the split, or the real "8-SOIC"
    // never survives to be compared. This is the DOMINANT IC package format from our primary source.
    it('matches a user\'s "8-SOIC" against Digikey\'s full "8-SOIC (0.154\", 3.90mm Width)"', () => {
      expect(packageValuesMatch('8-SOIC', '8-SOIC (0.154", 3.90mm Width)')).toBe(true);
    });
    it('matches word order even through the gloss', () => {
      expect(packageValuesMatch('SOIC-8', '8-SOIC (0.154", 3.90mm Width)')).toBe(true);
    });
  });
});
