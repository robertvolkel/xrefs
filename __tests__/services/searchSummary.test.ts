import { buildSearchSummary, looksLikeMpn } from '@/lib/services/searchSummary';
import type { PartSummary, SearchResult } from '@/lib/types';

function part(overrides: Partial<PartSummary> = {}): PartSummary {
  return {
    mpn: 'PART-1',
    manufacturer: 'Acme',
    description: 'A part',
    category: 'Transistors',
    ...overrides,
  };
}

function result(type: SearchResult['type'], matches: PartSummary[], extra: Partial<SearchResult> = {}): SearchResult {
  return { type, matches, ...extra };
}

describe('buildSearchSummary', () => {
  it('handles an empty result set defensively (no undefined/NaN/markdown artifacts)', () => {
    const out = buildSearchSummary(result('none', []));
    expect(out).toMatch(/couldn't find/i);
    expect(out).not.toContain('undefined');
    expect(out).not.toContain('NaN');
    expect(out).not.toContain('**');
  });

  it('also handles a degenerate multiple-with-zero-matches', () => {
    const out = buildSearchSummary(result('multiple', []));
    expect(out).toMatch(/couldn't find/i);
  });

  it('names MPN + manufacturer for a single match and is one C6-compliant sentence', () => {
    const out = buildSearchSummary(result('single', [part({ mpn: 'IRF540N', manufacturer: 'Infineon' })]));
    expect(out).toContain('**IRF540N**');
    expect(out).toContain('**Infineon**');
    expect(out).toMatch(/matching your criteria/i);
    expect(out).toMatch(/click it to confirm/i);
    // exactly one sentence (one terminal period)
    expect((out.match(/\./g) || []).length).toBe(1);
  });

  it('reports the count for multiple matches, equal to matches.length', () => {
    const out = buildSearchSummary(result('multiple', [part(), part({ mpn: 'P2' }), part({ mpn: 'P3' })]));
    expect(out).toContain('**3** parts');
    expect(out).toMatch(/click the one/i);
  });

  it('never leaks status or qualifications into prose', () => {
    const out = buildSearchSummary(
      result('multiple', [
        part({ mpn: 'A', status: 'Active', qualifications: ['AEC-Q101', 'RoHS'] }),
        part({ mpn: 'B', status: 'Obsolete', qualifications: ['AEC-Q200'] }),
      ]),
    );
    expect(out).not.toMatch(/aec/i);
    expect(out).not.toMatch(/obsolete/i);
    expect(out).not.toMatch(/active/i);
    expect(out).not.toMatch(/rohs/i);
  });

  it('never leaks data-source / provenance', () => {
    const out = buildSearchSummary(
      result('multiple', [part({ mpn: 'A', dataSource: 'atlas' }), part({ mpn: 'B', dataSource: 'digikey' })], {
        sourcesContributed: ['digikey', 'atlas', 'partsio'],
      }),
    );
    expect(out).not.toMatch(/digikey|atlas|partsio|mouser|source/i);
  });

  it('routes a degenerate single-element multiple to the singular form', () => {
    const out = buildSearchSummary(result('multiple', [part({ mpn: 'ONLY1', manufacturer: 'Solo' })]));
    expect(out).toContain('**ONLY1**');
    expect(out).toMatch(/click it to confirm/i);
    expect(out).not.toMatch(/parts/);
  });

  it('uses the plural "parts" only when n > 1', () => {
    expect(buildSearchSummary(result('multiple', [part(), part({ mpn: 'P2' })]))).toContain('**2** parts');
  });

  it('never puts specs (keyParameters) into prose (rule B2)', () => {
    const out = buildSearchSummary(
      result('single', [part({ mpn: 'M1', keyParameters: [{ name: 'V_DS', value: '60V' }] })]),
    );
    expect(out).not.toContain('60V');
    expect(out).not.toContain('V_DS');
  });

  it('single message makes no post-click promise (rule C6)', () => {
    const out = buildSearchSummary(result('single', [part()]));
    expect(out).not.toMatch(/to see|pricing|panel|spec|distributor/i);
  });

  it('is deterministic and uses ** markdown for bolding', () => {
    const r = result('multiple', [part(), part({ mpn: 'P2' })]);
    expect(buildSearchSummary(r)).toBe(buildSearchSummary(r));
    expect(buildSearchSummary(r)).toContain('**');
  });
});

describe('looksLikeMpn (relocated — behavior preserved)', () => {
  it('treats 3+ word and component-term queries as descriptions (greenfield)', () => {
    expect(looksLikeMpn('I need a MOSFET for a 24V motor driver')).toBe(false);
    expect(looksLikeMpn('low noise transistor')).toBe(false);
    expect(looksLikeMpn('capacitor')).toBe(false);
  });

  it('treats single-word alphanumeric and 2-word MFR+MPN as MPN-like', () => {
    expect(looksLikeMpn('2N2222AUB')).toBe(true);
    expect(looksLikeMpn('TDK CGA5L1X7R2J104K160AC')).toBe(true);
  });

  it('returns false for empty input', () => {
    expect(looksLikeMpn('   ')).toBe(false);
  });
});
