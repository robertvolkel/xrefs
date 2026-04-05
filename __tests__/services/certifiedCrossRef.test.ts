/**
 * Tests for Certified Cross-Reference feature:
 * - resolveMouserSuggestedMpn() — Mouser part number prefix stripping
 * - CertificationSource type usage
 */

import { resolveMouserSuggestedMpn } from '@/lib/services/mouserClient';

// ============================================================
// resolveMouserSuggestedMpn
// ============================================================

describe('resolveMouserSuggestedMpn', () => {
  it('strips standard Mouser prefix (3-digit)', () => {
    expect(resolveMouserSuggestedMpn('595-SN74HCT04N')).toBe('SN74HCT04N');
  });

  it('strips 2-digit prefix', () => {
    expect(resolveMouserSuggestedMpn('81-GRM188R71H104KA93')).toBe('GRM188R71H104KA93');
  });

  it('strips 4-digit prefix', () => {
    expect(resolveMouserSuggestedMpn('1234-ABC123')).toBe('ABC123');
  });

  it('preserves MPN with hyphens after prefix', () => {
    expect(resolveMouserSuggestedMpn('926-LM340T-5.0/NOPB')).toBe('LM340T-5.0/NOPB');
  });

  it('returns raw MPN when no prefix pattern matches', () => {
    expect(resolveMouserSuggestedMpn('SN74HC04N')).toBe('SN74HC04N');
  });

  it('returns null for empty string', () => {
    expect(resolveMouserSuggestedMpn('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(resolveMouserSuggestedMpn('   ')).toBeNull();
  });

  it('returns null when resolved MPN matches source MPN (self-reference)', () => {
    expect(resolveMouserSuggestedMpn('595-SN74HC04N', 'SN74HC04N')).toBeNull();
  });

  it('self-reference check is case-insensitive', () => {
    expect(resolveMouserSuggestedMpn('595-sn74hc04n', 'SN74HC04N')).toBeNull();
  });

  it('returns resolved MPN when it differs from source', () => {
    expect(resolveMouserSuggestedMpn('595-SN74HCT04N', 'SN74HC04N')).toBe('SN74HCT04N');
  });

  it('handles trimming of whitespace', () => {
    expect(resolveMouserSuggestedMpn('  595-SN74HCT04N  ')).toBe('SN74HCT04N');
  });

  it('returns null when source MPN not provided but input is empty', () => {
    expect(resolveMouserSuggestedMpn('', 'ABC123')).toBeNull();
  });

  it('handles single-digit prefix (does not strip — not a Mouser pattern)', () => {
    // Single digit prefixes are likely part of the actual MPN
    expect(resolveMouserSuggestedMpn('5-ABC123')).toBe('5-ABC123');
  });

  it('handles 5-digit prefix (does not strip — too long for Mouser pattern)', () => {
    expect(resolveMouserSuggestedMpn('12345-ABC123')).toBe('12345-ABC123');
  });
});

// ============================================================
// CertificationSource type
// ============================================================

describe('CertificationSource type', () => {
  it('should accept valid certification sources', () => {
    // Type-level test — if this compiles, the types are correct
    const sources: import('@/lib/types').CertificationSource[] = [
      'partsio_fff',
      'partsio_functional',
      'mouser',
      'manufacturer',
    ];
    expect(sources).toHaveLength(4);
  });
});

// ============================================================
// Certification map accumulation logic
// ============================================================

describe('Certification map accumulation', () => {
  it('accumulates multiple sources for same MPN', () => {
    const certificationMap = new Map<string, Set<string>>();

    // Simulate parts.io FFF equivalent
    const key = 'sn74hct04n';
    if (!certificationMap.has(key)) certificationMap.set(key, new Set());
    certificationMap.get(key)!.add('partsio_fff');

    // Simulate Mouser suggestion for same MPN
    if (!certificationMap.has(key)) certificationMap.set(key, new Set());
    certificationMap.get(key)!.add('mouser');

    const certs = Array.from(certificationMap.get(key)!);
    expect(certs).toContain('partsio_fff');
    expect(certs).toContain('mouser');
    expect(certs).toHaveLength(2);
  });

  it('handles MPN appearing from only one source', () => {
    const certificationMap = new Map<string, Set<string>>();
    const key = 'mc7805ctg';
    if (!certificationMap.has(key)) certificationMap.set(key, new Set());
    certificationMap.get(key)!.add('mouser');

    const certs = Array.from(certificationMap.get(key)!);
    expect(certs).toEqual(['mouser']);
  });

  it('derives equivalenceType from certifiedBy for backward compat', () => {
    // FFF takes priority
    const certsWithFff = new Set(['partsio_fff', 'mouser']);
    const eqType = certsWithFff.has('partsio_fff') ? 'fff'
      : certsWithFff.has('partsio_functional') ? 'functional'
      : undefined;
    expect(eqType).toBe('fff');

    // Functional when no FFF
    const certsWithFunc = new Set(['partsio_functional', 'mouser']);
    const eqType2 = certsWithFunc.has('partsio_fff') ? 'fff'
      : certsWithFunc.has('partsio_functional') ? 'functional'
      : undefined;
    expect(eqType2).toBe('functional');

    // Mouser only — no equivalenceType
    const certsMouserOnly = new Set(['mouser']);
    const eqType3 = certsMouserOnly.has('partsio_fff') ? 'fff'
      : certsMouserOnly.has('partsio_functional') ? 'functional'
      : undefined;
    expect(eqType3).toBeUndefined();
  });
});
