import {
  buildSyntheticSource,
  computeOverSpecPenalty,
  buildGreenfieldQuery,
  pickFetchBand,
  SYNTHETIC_SOURCE_MPN,
} from '@/lib/services/searchConstraints';
import { getLogicTable, resolveFamilyFromText } from '@/lib/logicTables';
import { findReplacements } from '@/lib/services/matchingEngine';
import { countRealMismatches, type PartAttributes, type SearchConstraint } from '@/lib/types';

// ── Helpers ──────────────────────────────────────────────
const B5 = getLogicTable('B5')!;

function mosfet(
  mpn: string,
  opts: { channel: string; vds: number; id: number; status?: PartAttributes['part']['status'] },
): PartAttributes {
  return {
    part: {
      mpn,
      manufacturer: 'Test',
      description: 'MOSFET',
      detailedDescription: 'MOSFET',
      category: 'Discrete Semiconductors' as PartAttributes['part']['category'],
      subcategory: 'N-Channel MOSFET',
      status: opts.status ?? 'Active',
    },
    parameters: [
      { parameterId: 'channel_type', parameterName: 'Channel Type', value: opts.channel, sortOrder: 1 },
      { parameterId: 'vds_max', parameterName: 'Vds Max', value: `${opts.vds} V`, numericValue: opts.vds, unit: 'V', sortOrder: 2 },
      { parameterId: 'id_max', parameterName: 'Id Max', value: `${opts.id} A`, numericValue: opts.id, unit: 'A', sortOrder: 3 },
    ],
  };
}

const MOSFET_CONSTRAINTS: SearchConstraint[] = [
  { attribute: 'channel type', value: 'N-Channel' },
  { attribute: 'drain-source voltage', value: 12, unit: 'V' },
  { attribute: 'current', value: 5, unit: 'A' },
];

describe('resolveFamilyFromText', () => {
  it('maps a descriptive part-type hint to a family ID', () => {
    expect(resolveFamilyFromText('N-channel MOSFET')).toBe('B5');
    expect(resolveFamilyFromText('power mosfet')).toBe('B5');
    expect(resolveFamilyFromText('MLCC capacitor')).toBe('12');
  });
  it('returns null for an unrecognized hint', () => {
    expect(resolveFamilyFromText('flux capacitor doohickey')).toBeNull();
    expect(resolveFamilyFromText(undefined)).toBeNull();
    expect(resolveFamilyFromText('')).toBeNull();
  });
  it('matches whole words only — short acronym keys do not match inside unrelated words', () => {
    // "mov" lives inside "removable"; "scr" inside "screw" — must NOT resolve to
    // Varistors (65) / SCRs (B8).
    expect(resolveFamilyFromText('removable connector')).not.toBe('65');
    expect(resolveFamilyFromText('screw terminal block')).not.toBe('B8');
    // But a genuine standalone acronym still resolves.
    expect(resolveFamilyFromText('MOV surge protector')).toBe('65');
  });
  it('tolerates a trailing plural on a singular key', () => {
    expect(resolveFamilyFromText('MOSFETs')).toBe('B5');
    expect(resolveFamilyFromText('bipolar transistors')).toBe('B6');
  });
});

describe('buildSyntheticSource', () => {
  it('builds a synthetic source from constraints (family via partType hint)', () => {
    const out = buildSyntheticSource(MOSFET_CONSTRAINTS, 'N-channel MOSFET', []);
    expect(out).not.toBeNull();
    expect(out!.familyId).toBe('B5');
    expect(out!.source.part.mpn).toBe(SYNTHETIC_SOURCE_MPN);
    const byId = new Map(out!.source.parameters.map(p => [p.parameterId, p]));
    expect(byId.get('channel_type')?.value).toBe('N-Channel');
    expect(byId.get('vds_max')?.numericValue).toBe(12);
    expect(byId.get('id_max')?.numericValue).toBe(5);
  });

  it('classifies the family from the candidate set when present', () => {
    const candidates = [
      mosfet('A', { channel: 'N-Channel', vds: 30, id: 8 }),
      mosfet('B', { channel: 'N-Channel', vds: 60, id: 10 }),
    ];
    const out = buildSyntheticSource(MOSFET_CONSTRAINTS, undefined, candidates);
    expect(out?.familyId).toBe('B5');
  });

  it('normalizes SI prefixes — "5000 mA" equals "5 A"', () => {
    const out = buildSyntheticSource(
      [{ attribute: 'current', value: 5000, unit: 'mA' }],
      'N-channel MOSFET',
      [],
    );
    expect(out!.source.parameters.find(p => p.parameterId === 'id_max')?.numericValue).toBe(5);
  });

  it('returns null when no family resolves (no candidates, no usable hint)', () => {
    expect(buildSyntheticSource(MOSFET_CONSTRAINTS, 'flux doohickey', [])).toBeNull();
  });

  it('returns null when there are no constraints', () => {
    expect(buildSyntheticSource([], 'N-channel MOSFET', [])).toBeNull();
    expect(buildSyntheticSource(undefined, 'N-channel MOSFET', [])).toBeNull();
  });

  it('drops constraints whose attribute cannot be mapped, keeps the rest', () => {
    const out = buildSyntheticSource(
      [
        { attribute: 'drain-source voltage', value: 12, unit: 'V' },
        { attribute: 'warp core flux', value: 42 },
      ],
      'N-channel MOSFET',
      [],
    );
    expect(out!.source.parameters).toHaveLength(1);
    expect(out!.source.parameters[0].parameterId).toBe('vds_max');
  });
});

describe('logic-vetted scoring (synthetic source through the engine)', () => {
  const built = buildSyntheticSource(MOSFET_CONSTRAINTS, 'N-channel MOSFET', [])!;
  const source = built.source;

  it('a valid over-rated N-channel part has zero real mismatches', () => {
    const recs = findReplacements(B5, source, [mosfet('GOOD', { channel: 'N-Channel', vds: 30, id: 8 })]);
    expect(countRealMismatches(recs[0])).toBe(0);
  });

  it('an undersized-voltage part is a real mismatch (would never work)', () => {
    const recs = findReplacements(B5, source, [mosfet('UNDER', { channel: 'N-Channel', vds: 8, id: 5 })]);
    expect(countRealMismatches(recs[0])).toBeGreaterThanOrEqual(1);
  });

  it('a wrong-channel part is a real mismatch', () => {
    const recs = findReplacements(B5, source, [mosfet('PCH', { channel: 'P-Channel', vds: 30, id: 8 })]);
    expect(countRealMismatches(recs[0])).toBeGreaterThanOrEqual(1);
  });

  it('ranks: clean pass above undersized/wrong-channel (least-fails-first)', () => {
    const candidates = [
      mosfet('UNDER', { channel: 'N-Channel', vds: 8, id: 5 }),
      mosfet('PCH', { channel: 'P-Channel', vds: 30, id: 8 }),
      mosfet('GOOD', { channel: 'N-Channel', vds: 30, id: 8 }),
    ];
    const recs = findReplacements(B5, source, candidates);
    recs.sort((a, b) => countRealMismatches(a) - countRealMismatches(b));
    expect(recs[0].part.mpn).toBe('GOOD');
  });
});

describe('computeOverSpecPenalty', () => {
  const source = buildSyntheticSource(MOSFET_CONSTRAINTS, 'N-channel MOSFET', [])!.source;

  it('penalizes a wildly over-spec part more than a close fit', () => {
    const close = computeOverSpecPenalty(B5, source, mosfet('A', { channel: 'N-Channel', vds: 30, id: 8 }));
    const over = computeOverSpecPenalty(B5, source, mosfet('B', { channel: 'N-Channel', vds: 1200, id: 100 }));
    expect(over).toBeGreaterThan(close);
  });

  it('a part meeting the requirement exactly earns ~zero penalty', () => {
    const exact = computeOverSpecPenalty(B5, source, mosfet('A', { channel: 'N-Channel', vds: 12, id: 5 }));
    expect(exact).toBeCloseTo(0, 6);
  });

  it('sinks 1200V below 30V via the closeness tiebreak among equal-fail parts', () => {
    const candidates = [
      mosfet('OVER', { channel: 'N-Channel', vds: 1200, id: 100 }),
      mosfet('CLOSE', { channel: 'N-Channel', vds: 30, id: 8 }),
    ];
    const recs = findReplacements(B5, source, candidates);
    // Both pass all rules → tiebreak by over-spec penalty (closest first).
    recs.sort((a, b) => {
      const fd = countRealMismatches(a) - countRealMismatches(b);
      if (fd !== 0) return fd;
      const pa = computeOverSpecPenalty(B5, source, candidates.find(c => c.part.mpn === a.part.mpn)!);
      const pb = computeOverSpecPenalty(B5, source, candidates.find(c => c.part.mpn === b.part.mpn)!);
      return pa - pb;
    });
    expect(recs[0].part.mpn).toBe('CLOSE');
  });
});

// ── Greenfield determinism (Phase A — Decision #248) ──────────
describe('buildGreenfieldQuery', () => {
  it('is a pure, stable function of (partType, categorical constraints) — order/case independent', () => {
    const a = buildGreenfieldQuery('NPN transistor', [
      { attribute: 'channel type', value: 'N-Channel' },
      { attribute: 'technology', value: 'Silicon' },
    ]);
    const b = buildGreenfieldQuery('NPN transistor', [
      { attribute: 'technology', value: 'silicon' },   // different order + case
      { attribute: 'channel type', value: 'n-channel' },
    ]);
    expect(a).toBe(b);
    expect(a).toBe('NPN transistor n-channel silicon'); // base first, then sorted unique tokens
  });

  it('excludes numeric specs — keyword search ignores numbers (those are vetting-only)', () => {
    const q = buildGreenfieldQuery('MOSFET', [
      { attribute: 'drain-source voltage', value: 12, unit: 'V' },
      { attribute: 'current', value: '5', unit: 'A' },
      { attribute: 'channel type', value: 'N-Channel' },
    ]);
    expect(q).toBe('MOSFET n-channel');
  });

  it('skips a categorical token already present in the part type (no redundant keywords)', () => {
    const q = buildGreenfieldQuery('N-Channel MOSFET', [
      { attribute: 'channel type', value: 'N-Channel' },
    ]);
    expect(q).toBe('N-Channel MOSFET');
  });

  it('returns the bare part type when there are no categorical constraints', () => {
    expect(buildGreenfieldQuery('buck converter', [])).toBe('buck converter');
    expect(buildGreenfieldQuery('buck converter', undefined)).toBe('buck converter');
  });

  it('returns empty string when no part type is given', () => {
    expect(buildGreenfieldQuery(undefined, [{ attribute: 'channel type', value: 'N-Channel' }])).toBe('n-channel');
    expect(buildGreenfieldQuery('', undefined)).toBe('');
  });
});

// ── Phase B: parametric pool filtering ────────────────────────
describe('pickFetchBand', () => {
  it('builds a two-sided band from a "lo-hi" range value (±15% inclusive margin)', () => {
    const band = pickFetchBand([{ attribute: 'drain-source voltage', value: '12-30', unit: 'V' }], B5);
    expect(band).not.toBeNull();
    expect(band!.attrId).toBe('vds_max');
    expect(band!.lo).toBeCloseTo(12 * 0.85, 5);
    expect(band!.hi).toBeCloseTo(30 * 1.15, 5);
  });

  it('builds a two-sided band from separate min/max constraints (strips the min/max label before resolving)', () => {
    const band = pickFetchBand(
      [
        { attribute: 'drain current min', value: 1, unit: 'A' },
        { attribute: 'drain current max', value: 5, unit: 'A' },
      ],
      B5,
    );
    expect(band!.attrId).toBe('id_max');
    expect(band!.lo).toBeCloseTo(1 * 0.85, 5);
    expect(band!.hi).toBeCloseTo(5 * 1.15, 5);
  });

  it('detects underscore-delimited min/max labels (hFE_min / hFE_max), not just spaces', () => {
    const band = pickFetchBand(
      [
        { attribute: 'hFE_min', value: 200 },
        { attribute: 'hFE_max', value: 400 },
      ],
      getLogicTable('B6')!,
    );
    expect(band!.attrId).toBe('hfe');
    expect(band!.lo).toBeCloseTo(200 * 0.85, 5);
    expect(band!.hi).toBeCloseTo(400 * 1.15, 5);
  });

  it('treats two plain values for the same attr as an implicit range', () => {
    const band = pickFetchBand(
      [
        { attribute: 'drain-source voltage', value: 12, unit: 'V' },
        { attribute: 'drain-source voltage', value: 30, unit: 'V' },
      ],
      B5,
    );
    expect(band!.attrId).toBe('vds_max');
    expect(band!.lo).toBeCloseTo(12 * 0.85, 5);
    expect(band!.hi).toBeCloseTo(30 * 1.15, 5);
  });

  it('builds a one-sided gte band [v, v×10] from a single threshold value (no margin)', () => {
    const band = pickFetchBand([{ attribute: 'drain-source voltage', value: 30, unit: 'V' }], B5);
    expect(band!.attrId).toBe('vds_max');
    expect(band!.lo).toBe(30);
    expect(band!.hi).toBe(300);
  });

  it('normalizes SI prefixes to base units (5000 mA == 5 A floor)', () => {
    const band = pickFetchBand([{ attribute: 'drain current', value: 5000, unit: 'mA' }], B5);
    expect(band!.attrId).toBe('id_max');
    expect(band!.lo).toBe(5); // gte floor, base-SI
  });

  it('prefers a two-sided band over a one-sided one (more selective)', () => {
    const band = pickFetchBand(
      [
        { attribute: 'drain-source voltage', value: '12-30', unit: 'V' }, // two-sided
        { attribute: 'drain current', value: 5, unit: 'A' },              // one-sided gte
      ],
      B5,
    );
    expect(band!.attrId).toBe('vds_max'); // the range wins
  });

  it('returns null when nothing maps to a numeric band', () => {
    expect(pickFetchBand([{ attribute: 'channel type', value: 'N-Channel' }], B5)).toBeNull(); // categorical
    expect(pickFetchBand([{ attribute: 'warp core flux', value: 42 }], B5)).toBeNull();        // unresolvable
    expect(pickFetchBand([], B5)).toBeNull();
    expect(pickFetchBand(undefined, B5)).toBeNull();
  });
});
