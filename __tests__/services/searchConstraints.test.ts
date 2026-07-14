import {
  buildSyntheticSource,
  computeOverSpecPenalty,
  buildGreenfieldQuery,
  toBaseSI,
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

const B6 = getLogicTable('B6')!;

function bjt(
  mpn: string,
  opts: { polarity: string; vceo: number; status?: PartAttributes['part']['status'] },
): PartAttributes {
  return {
    part: {
      mpn,
      manufacturer: 'Test',
      description: 'BJT',
      detailedDescription: 'BJT',
      category: 'Discrete Semiconductors' as PartAttributes['part']['category'],
      subcategory: 'Bipolar Transistor',
      status: opts.status ?? 'Active',
    },
    parameters: [
      { parameterId: 'polarity', parameterName: 'Polarity (NPN / PNP)', value: opts.polarity, sortOrder: 1 },
      { parameterId: 'vceo_max', parameterName: 'Vceo Max', value: `${opts.vceo} V`, numericValue: opts.vceo, unit: 'V', sortOrder: 2 },
    ],
  };
}

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

describe('buildSyntheticSource — identity-categorical injection from partType', () => {
  const npnCand = bjt('BC847B', { polarity: 'NPN', vceo: 45 });
  const pnpCand = bjt('BC857B', { polarity: 'PNP', vceo: 45 });
  const pool = [npnCand, pnpCand];
  // A single resolvable numeric constraint (no polarity) so the source is non-null;
  // the polarity must come from the part-type noun, not a constraint.
  const VCEO_ONLY: SearchConstraint[] = [{ attribute: 'vceo', value: 45, unit: 'V' }];

  it('injects the polarity named in the part-type noun (NPN) as a gating constraint', () => {
    const out = buildSyntheticSource(VCEO_ONLY, 'small-signal NPN', pool)!;
    expect(out.familyId).toBe('B6');
    expect(out.source.parameters.find(p => p.parameterId === 'polarity')?.value).toBe('NPN');
  });

  it('learns the vocabulary from the candidate pool — injects PNP for a PNP request', () => {
    const out = buildSyntheticSource(VCEO_ONLY, 'PNP transistor', pool)!;
    expect(out.source.parameters.find(p => p.parameterId === 'polarity')?.value).toBe('PNP');
  });

  it('does NOT inject when the part type names no polarity (gate stays relaxed)', () => {
    const out = buildSyntheticSource(VCEO_ONLY, 'small-signal transistor', pool)!;
    expect(out.source.parameters.find(p => p.parameterId === 'polarity')).toBeUndefined();
  });

  it('does NOT inject without a candidate pool to learn the vocabulary from', () => {
    // Part type resolves the family on its own ("bipolar transistor") so the
    // source is non-null; with no pool there is no vocabulary, so polarity stays
    // un-injected even though the noun says NPN.
    const out = buildSyntheticSource(VCEO_ONLY, 'bipolar transistor NPN', [])!;
    expect(out.familyId).toBe('B6');
    expect(out.source.parameters.find(p => p.parameterId === 'polarity')).toBeUndefined();
  });

  it('end-to-end: a PNP candidate becomes a real mismatch for an NPN request', () => {
    const out = buildSyntheticSource(VCEO_ONLY, 'small-signal NPN', pool)!;
    const recs = findReplacements(B6, out.source, pool);
    const byMpn = new Map(recs.map(r => [r.part.mpn, r]));
    expect(countRealMismatches(byMpn.get('BC847B')!)).toBe(0);            // NPN passes the gate
    expect(countRealMismatches(byMpn.get('BC857B')!)).toBeGreaterThan(0); // PNP fails it → sinks
  });

  it('B5: injects channel type from the part-type noun even without a channel constraint', () => {
    const out = buildSyntheticSource(
      [{ attribute: 'drain-source voltage', value: 12, unit: 'V' }], // no channel constraint
      'N-channel MOSFET',
      [mosfet('N1', { channel: 'N-Channel', vds: 60, id: 10 }), mosfet('P1', { channel: 'P-Channel', vds: 60, id: 10 })],
    )!;
    expect(out.source.parameters.find(p => p.parameterId === 'channel_type')?.value).toBe('N-Channel');
  });

  it('an explicit channel constraint wins over a conflicting part-type noun (seen-guard)', () => {
    // MOSFET_CONSTRAINTS already carries channel_type=N-Channel; a "P-channel"
    // part type must not duplicate or clobber it.
    const out = buildSyntheticSource(MOSFET_CONSTRAINTS, 'P-channel MOSFET', [mosfet('X', { channel: 'P-Channel', vds: 60, id: 10 })])!;
    const channels = out.source.parameters.filter(p => p.parameterId === 'channel_type');
    expect(channels).toHaveLength(1);
    expect(channels[0].value).toBe('N-Channel');
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

  it('adopts the catalog wording for a categorical code so an exact part is not "Below spec"', () => {
    // The exact-match-reads-Below-spec bug: user types "0805", Digikey stores
    // "0805 (2012 Metric)" → identity check fails on formatting. The synthetic source
    // must adopt the catalog's own value (learned from the pool) so it byte-matches.
    const candidate: PartAttributes = {
      part: { mpn: 'CL21B105KAFNNNE', manufacturer: 'Samsung', description: 'CAP CER 1UF 25V X7R 0805',
        detailedDescription: '', category: 'Passives' as PartAttributes['part']['category'],
        subcategory: 'Ceramic Capacitors – MLCC (Surface Mount)', status: 'Active' },
      parameters: [
        { parameterId: 'package_case', parameterName: 'Package / Case', value: '0805 (2012 Metric)', sortOrder: 1 },
        { parameterId: 'dielectric', parameterName: 'Dielectric', value: 'X7R', sortOrder: 2 },
      ],
    };
    const syn = buildSyntheticSource(
      [{ attribute: 'package_case', value: '0805' }, { attribute: 'dielectric', value: 'X7R' }],
      'Ceramic Capacitors – MLCC (Surface Mount)',
      [candidate],
    );
    const pkg = syn?.source.parameters.find(p => p.parameterId === 'package_case');
    expect(pkg?.value).toBe('0805 (2012 Metric)');   // adopted the catalog's verbose form
    expect(pkg?.numericValue).toBeUndefined();        // categorical → no spurious 805
  });

  it('bridges a count WORD (Dual) to the catalog DIGIT (2) so a dual part is not "Below spec"', () => {
    // The LLM emits "Dual" for channel count; Digikey stores "2" → the identity rule
    // fails on every op-amp (even genuinely-dual ones). canonicalizeCategorical must adopt
    // the catalog's "2" so a real dual part scores a pass.
    const dual: PartAttributes = {
      part: { mpn: 'TLV272', manufacturer: 'TI', description: 'IC CMOS 2 CIRCUIT 8SO', detailedDescription: '',
        category: 'Integrated Circuits' as PartAttributes['part']['category'],
        subcategory: 'Instrumentation, OP Amps, Buffer Amps', status: 'Active' },
      parameters: [
        { parameterId: 'channels', parameterName: 'Number of Channels', value: '2', sortOrder: 1 },
        { parameterId: 'input_type', parameterName: 'Input Stage Technology', value: 'CMOS', sortOrder: 2 },
      ],
    };
    const syn = buildSyntheticSource(
      [{ attribute: 'number of channels', value: 'Dual' }, { attribute: 'input stage technology', value: 'CMOS' }],
      'op-amp',
      [dual],
    );
    expect(syn?.familyId).toBe('C4');
    expect(syn?.source.parameters.find(p => p.parameterId === 'channels')?.value).toBe('2'); // adopted the digit
  });

  it('KEEPS a categorical size/package CODE (0805) so the fetch is shaped by it', () => {
    // The all-below-spec bug: a fully-specified MLCC fetched zero 0805 parts because the
    // size code was stripped as "number-like". Package/size codes are stable Digikey
    // description tokens → keep them; measured numerics (1µF, 25V) still drop out.
    const q = buildGreenfieldQuery('Ceramic Capacitors – MLCC (Surface Mount)', [
      { attribute: 'capacitance', value: 1, unit: 'µF' },
      { attribute: 'voltage_rated', value: 25, unit: 'V' },
      { attribute: 'dielectric', value: 'X7R' },
      { attribute: 'package_case', value: '0805' },
    ]);
    expect(q).toBe('Ceramic Capacitors – MLCC (Surface Mount) 0805 x7r');
  });

  it('does NOT keyword a measured numeric even when the model dropped its unit', () => {
    // voltage is a THRESHOLD attr → its value is vetting-only even if it arrives unit-less;
    // only the categorical package code survives.
    const q = buildGreenfieldQuery('Ceramic Capacitors – MLCC (Surface Mount)', [
      { attribute: 'voltage_rated', value: '25' },
      { attribute: 'package_case', value: '0805' },
    ]);
    expect(q).toBe('Ceramic Capacitors – MLCC (Surface Mount) 0805');
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
