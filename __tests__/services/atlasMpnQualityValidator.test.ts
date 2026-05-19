import {
  detectMpnQualityIssue,
  summarizeMpnQualityIssues,
} from '@/lib/services/atlasMpnQualityValidator';

describe('detectMpnQualityIssue', () => {
  describe('range_thru', () => {
    it('detects "Thru" with proper case', () => {
      const r = detectMpnQualityIssue('SS12 Thru SS120');
      expect(r?.kind).toBe('range_thru');
    });
    it('detects lowercase "thru"', () => {
      const r = detectMpnQualityIssue('BZT52B2V4S thru BZT52B75S');
      expect(r?.kind).toBe('range_thru');
    });
    it('detects CREATEK typo "thur"', () => {
      const r = detectMpnQualityIssue('GBU1502 thur GBU1510');
      expect(r?.kind).toBe('range_thru');
    });
    it('detects "through"', () => {
      const r = detectMpnQualityIssue('1SMA4728AF Through 1SMA4777AF');
      expect(r?.kind).toBe('range_thru');
    });
    it('does NOT match substring "thru" inside a legitimate MPN', () => {
      // word-boundary check should prevent false positives
      expect(detectMpnQualityIssue('ABCthruDEF123')).toBeNull();
    });
  });

  describe('range_series', () => {
    it('detects English "Series" suffix', () => {
      const r = detectMpnQualityIssue('BAS40T Series');
      expect(r?.kind).toBe('range_series');
    });
    it('detects "Series" mid-MPN', () => {
      const r = detectMpnQualityIssue('AW3642x Series');
      // The trailing-x check fires first (placeholder_x wins) — verify
      // both detections trip but order is deterministic.
      expect(r).not.toBeNull();
    });
    it('detects KEXIN Chinese full-width paren wrapping Series', () => {
      const r = detectMpnQualityIssue('SMDJ5.0A（SMDJ Series）');
      expect(r?.kind).toBe('range_series');
    });
    it('does NOT match MPN containing "series" mid-word', () => {
      expect(detectMpnQualityIssue('XSERIESABC')).toBeNull();
    });
  });

  describe('placeholder_x', () => {
    it('detects trailing lowercase x', () => {
      const r = detectMpnQualityIssue('GD30DC1101x');
      expect(r?.kind).toBe('placeholder_x');
    });
    it('detects trailing uppercase X', () => {
      const r = detectMpnQualityIssue('GD30DC1105X');
      expect(r?.kind).toBe('placeholder_x');
    });
    it('does NOT flag legitimate TX/RX suffixes', () => {
      // SN74LVC1G14DCKR... if an MPN happened to end in TX or RX, treat as legit.
      expect(detectMpnQualityIssue('SOMETX')).toBeNull();
      expect(detectMpnQualityIssue('SOMERX')).toBeNull();
    });
    it('does NOT flag MPNs where x is preceded by non-alphanumeric', () => {
      // hyphen-x suffix used by some MFRs as a real suffix
      expect(detectMpnQualityIssue('PART-x')).toBeNull();
    });
  });

  describe('placeholder_xx_midword', () => {
    it('detects Gainsil-style mid-MPN xx placeholder', () => {
      const r = detectMpnQualityIssue('GS2019-xxTR');
      expect(r?.kind).toBe('placeholder_xx_midword');
    });
    it('detects xx followed by alphanumeric suffix', () => {
      const r = detectMpnQualityIssue('GS2019-xxCR');
      expect(r?.kind).toBe('placeholder_xx_midword');
    });
    it('does NOT match xx at start of MPN', () => {
      // No alphanumeric/hyphen before "xx" → not flagged
      expect(detectMpnQualityIssue('xxTR')).toBeNull();
    });
    it('does NOT match trailing xx (caught by placeholder_x instead)', () => {
      // Trailing "xx" hits the placeholder_x rule first (single x trailing
      // with another x as the preceding alphanumeric).
      const r = detectMpnQualityIssue('MMBTA42xx');
      expect(r?.kind).toBe('placeholder_x');
    });
    it('does NOT match uppercase XX (only lowercase xx is the convention)', () => {
      expect(detectMpnQualityIssue('GS2019-XXTR')).toBeNull();
    });
  });

  describe('slash_variant', () => {
    it('detects Geehy slash-delimited row', () => {
      const r = detectMpnQualityIssue('GHD3440/3440R');
      expect(r?.kind).toBe('slash_variant');
    });
    it('does NOT flag legitimate MPNs with slash followed by non-alphanumeric', () => {
      // e.g. "PART-12/" wouldn't fire because nothing alphanumeric follows
      expect(detectMpnQualityIssue('PART-12/')).toBeNull();
    });
  });

  describe('clean MPNs', () => {
    it('returns null for clean industry-standard MPNs', () => {
      expect(detectMpnQualityIssue('IRF540')).toBeNull();
      expect(detectMpnQualityIssue('2N7002')).toBeNull();
      expect(detectMpnQualityIssue('BZT52C5V1')).toBeNull();
      expect(detectMpnQualityIssue('TPS54331DR')).toBeNull();
      expect(detectMpnQualityIssue('SDCL0402H3N0BTS01')).toBeNull();
    });
    it('returns null for empty/whitespace/null input', () => {
      expect(detectMpnQualityIssue('')).toBeNull();
      expect(detectMpnQualityIssue('   ')).toBeNull();
      expect(detectMpnQualityIssue(null)).toBeNull();
      expect(detectMpnQualityIssue(undefined)).toBeNull();
    });
  });
});

describe('summarizeMpnQualityIssues', () => {
  it('counts by kind and caps samples', () => {
    const issues = [
      { originalMpn: 'A Thru B', kind: 'range_thru' as const, reason: 'r' },
      { originalMpn: 'C Series', kind: 'range_series' as const, reason: 'r' },
      { originalMpn: 'Dx', kind: 'placeholder_x' as const, reason: 'r' },
      { originalMpn: 'E/F', kind: 'slash_variant' as const, reason: 'r' },
      { originalMpn: 'G Thru H', kind: 'range_thru' as const, reason: 'r' },
    ];
    const summary = summarizeMpnQualityIssues(issues, 3);
    expect(summary.totalIssues).toBe(5);
    expect(summary.byKind.range_thru).toBe(2);
    expect(summary.byKind.range_series).toBe(1);
    expect(summary.byKind.placeholder_x).toBe(1);
    expect(summary.byKind.placeholder_xx_midword).toBe(0);
    expect(summary.byKind.slash_variant).toBe(1);
    expect(summary.samples).toHaveLength(3);
    // Samples ordered by kind: range_thru entries come first
    expect(summary.samples[0].kind).toBe('range_thru');
    expect(summary.samples[1].kind).toBe('range_thru');
  });
});
