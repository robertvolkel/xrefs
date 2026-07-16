/**
 * Tests for multi-source search: looksLikeMpn, searchPartsioProducts,
 * searchMouserProducts, and the merged searchParts() flow.
 */

import { looksLikeMpn, orderSearchCandidates } from '@/lib/services/partDataService';
import { mapPartsioListingToPartSummary } from '@/lib/services/partsioClient';
import { mapMouserProductToPartSummary } from '@/lib/services/mouserClient';

// ============================================================
// looksLikeMpn — MPN vs description detection
// ============================================================

describe('looksLikeMpn', () => {
  // MPNs — should return true
  it.each([
    'LM358',
    'LM358DR',
    'MDA1050-R36M',
    'SN74HCT04N',
    'GRM188R61C106MA73D',
    'IRF540N',
    'BAV99',
    'TPS54302DDCR',
    'AD5791BRUZ',
    'CRCW080510K0FKEA',
    'EEE-FK1V101P',
    '0402WGF1002TCE',
  ])('"%s" should be detected as MPN', (query) => {
    expect(looksLikeMpn(query)).toBe(true);
  });

  // 2-word queries like "MFR MPN" — should return true
  it.each([
    'TDK CGA5L1X7R2J104K160AC',
    'Murata GRM188',
    'TI LM358',
  ])('"%s" (2 words, MFR+MPN) should be detected as MPN', (query) => {
    expect(looksLikeMpn(query)).toBe(true);
  });

  // Descriptions — should return false
  it.each([
    '100uF aluminum capacitor',
    'low dropout voltage regulator 3.3V',
    'MLCC ceramic capacitor 100nF',
    'NPN bipolar transistor',
    'switching regulator buck',
    'high speed comparator amplifier chip',
    'TVS diode bidirectional',
    'power inductor 10uH shielded',
    'crystal oscillator 16MHz',
    'USB connector type-C',
  ])('"%s" should be detected as description', (query) => {
    expect(looksLikeMpn(query)).toBe(false);
  });

  // Edge cases
  it('returns false for empty string', () => {
    expect(looksLikeMpn('')).toBe(false);
  });

  it('returns false for whitespace-only', () => {
    expect(looksLikeMpn('   ')).toBe(false);
  });

  // Single-word component terms
  it.each([
    'capacitor',
    'resistor',
    'mosfet',
    'regulator',
    'microcontroller',
  ])('"%s" (single component term) should be detected as description', (query) => {
    expect(looksLikeMpn(query)).toBe(false);
  });
});

// ============================================================
// mapPartsioListingToPartSummary
// ============================================================

describe('mapPartsioListingToPartSummary', () => {
  it('maps a typical Parts.io listing to PartSummary', () => {
    const listing = {
      uid: 1,
      'Manufacturer Part Number': 'LM358DR',
      Manufacturer: 'Texas Instruments',
      Description: 'Dual Op-Amp',
      'Status Code': 'Active',
      'Part Life Cycle Code': 'Active',
      Class: 'Amplifier Circuits',
      Category: 'Operational Amplifiers',
    };

    const summary = mapPartsioListingToPartSummary(listing as never);
    expect(summary.mpn).toBe('LM358DR');
    expect(summary.manufacturer).toBe('Texas Instruments');
    expect(summary.description).toBe('Dual Op-Amp');
    expect(summary.category).toBe('Amplifiers');
    expect(summary.status).toBe('Active');
    expect(summary.dataSource).toBe('partsio');
  });

  it('maps lifecycle codes correctly', () => {
    const base = {
      uid: 1,
      'Manufacturer Part Number': 'TEST',
      Manufacturer: 'Test',
      Description: '',
      'Status Code': '',
      Class: 'Capacitors',
      Category: 'MLCC',
    };

    expect(mapPartsioListingToPartSummary({ ...base, 'Part Life Cycle Code': 'Obsolete' } as never).status).toBe('Obsolete');
    expect(mapPartsioListingToPartSummary({ ...base, 'Part Life Cycle Code': 'Discontinued' } as never).status).toBe('Discontinued');
    expect(mapPartsioListingToPartSummary({ ...base, 'Part Life Cycle Code': 'End of Life' } as never).status).toBe('NRND');
    expect(mapPartsioListingToPartSummary({ ...base, 'Part Life Cycle Code': 'Last Time Buy' } as never).status).toBe('LastTimeBuy');
    expect(mapPartsioListingToPartSummary({ ...base, 'Part Life Cycle Code': 'Active' } as never).status).toBe('Active');
  });

  it('maps Parts.io classes to correct categories', () => {
    const make = (cls: string) => ({
      uid: 1, 'Manufacturer Part Number': 'X', Manufacturer: 'X', Description: '',
      'Status Code': '', 'Part Life Cycle Code': 'Active', Class: cls, Category: '',
    });

    expect(mapPartsioListingToPartSummary(make('Capacitors') as never).category).toBe('Capacitors');
    expect(mapPartsioListingToPartSummary(make('Resistors') as never).category).toBe('Resistors');
    expect(mapPartsioListingToPartSummary(make('Diodes') as never).category).toBe('Diodes');
    expect(mapPartsioListingToPartSummary(make('Transistors') as never).category).toBe('Transistors');
    expect(mapPartsioListingToPartSummary(make('Trigger Devices') as never).category).toBe('Thyristors');
    expect(mapPartsioListingToPartSummary(make('Relays') as never).category).toBe('Relays');
    expect(mapPartsioListingToPartSummary(make('Crystals/Resonators') as never).category).toBe('Crystals');
    // Unknown class defaults to ICs
    expect(mapPartsioListingToPartSummary(make('SomethingUnknown') as never).category).toBe('ICs');
  });
});

// ============================================================
// mapMouserProductToPartSummary
// ============================================================

describe('mapMouserProductToPartSummary', () => {
  it('maps a typical Mouser product to PartSummary', () => {
    const product = {
      MouserPartNumber: '511-LM358DR',
      ManufacturerPartNumber: 'LM358DR',
      Manufacturer: 'Texas Instruments',
      Description: 'Operational Amplifiers - Op Amps',
      Category: 'Operational Amplifiers',
      PriceBreaks: [],
    };

    const summary = mapMouserProductToPartSummary(product as never);
    expect(summary.mpn).toBe('LM358DR');
    expect(summary.manufacturer).toBe('Texas Instruments');
    expect(summary.category).toBe('Amplifiers');
    expect(summary.dataSource).toBe('mouser');
  });

  it('maps discontinued products correctly', () => {
    const product = {
      MouserPartNumber: '511-OLD',
      ManufacturerPartNumber: 'OLD-PART',
      Manufacturer: 'Test',
      Description: '',
      Category: 'Capacitors',
      PriceBreaks: [],
      IsDiscontinued: 'true',
    };

    expect(mapMouserProductToPartSummary(product as never).status).toBe('Discontinued');
  });

  it('maps Mouser categories to correct ComponentCategory', () => {
    const make = (cat: string) => ({
      MouserPartNumber: 'X', ManufacturerPartNumber: 'X', Manufacturer: 'X',
      Description: '', Category: cat, PriceBreaks: [],
    });

    expect(mapMouserProductToPartSummary(make('Ceramic Capacitors') as never).category).toBe('Capacitors');
    expect(mapMouserProductToPartSummary(make('Chip Resistors') as never).category).toBe('Resistors');
    expect(mapMouserProductToPartSummary(make('Power Inductors') as never).category).toBe('Inductors');
    expect(mapMouserProductToPartSummary(make('MOSFET Transistors') as never).category).toBe('Transistors');
    expect(mapMouserProductToPartSummary(make('Solid State Relays') as never).category).toBe('Relays');
    expect(mapMouserProductToPartSummary(make('Linear Voltage Regulators') as never).category).toBe('Voltage Regulators');
  });
});

// ============================================================
// orderSearchCandidates — exact-MPN-first, then Active-first
// Fixes "variant lock-on": naming a part must return THAT part, not a
// sample-kit box or a longer ordering variant that the source listed first.
// ============================================================

describe('orderSearchCandidates', () => {
  type Cand = { mpn: string; status?: string };

  it('floats the EXACT part above a sample-kit box the source listed first (the SPM12565VT-D case)', () => {
    // Both Active — pre-fix (active-only sort) leaves the -KIT first because sort is stable.
    const candidates: Cand[] = [
      { mpn: 'SPM12565VT-D-KIT', status: 'Active' },
      { mpn: 'SPM12565VT-D', status: 'Active' },
    ];
    const ordered = orderSearchCandidates(candidates, 'SPM12565VT-D');
    expect(ordered[0].mpn).toBe('SPM12565VT-D'); // FAILS on the pre-fix active-only sort
  });

  it('floats the EXACT part above a longer ordering variant (the BSS138 case)', () => {
    const ordered = orderSearchCandidates(
      [
        { mpn: 'BSS138NH6327XTSA2', status: 'Active' },
        { mpn: 'BSS138', status: 'Active' },
      ],
      'BSS138',
    );
    expect(ordered[0].mpn).toBe('BSS138');
  });

  it('prefers the EXACT named part even when it is obsolete and a variant is Active (it is the intended SOURCE)', () => {
    const ordered = orderSearchCandidates(
      [
        { mpn: 'LM317T', status: 'Active' }, // longer variant, active
        { mpn: 'LM317', status: 'Obsolete' }, // the exact part the user named
      ],
      'LM317',
    );
    expect(ordered[0].mpn).toBe('LM317'); // named part wins; its replacements are found afterward
  });

  it('is case-insensitive on the exact match', () => {
    const ordered = orderSearchCandidates(
      [
        { mpn: 'GRM188R61C106MA73D-TR', status: 'Active' },
        { mpn: 'grm188r61c106ma73d', status: 'Active' },
      ],
      'GRM188R61C106MA73D',
    );
    expect(ordered[0].mpn).toBe('grm188r61c106ma73d');
  });

  it('is a NO-OP for descriptive searches — a multi-word phrase leaves Active-first ordering intact', () => {
    // No candidate MPN equals the phrase, so exactRank is uniformly 1 → pure active-first.
    const ordered = orderSearchCandidates(
      [
        { mpn: 'AAA-1', status: 'Obsolete' },
        { mpn: 'BBB-2', status: 'Active' },
        { mpn: 'CCC-3' }, // missing status → orderable (top)
      ],
      'low dropout voltage regulator 3.3V',
    );
    expect(ordered.map((c) => c.mpn)).toEqual(['BBB-2', 'CCC-3', 'AAA-1']);
  });

  it('keeps Active-first (and source order) among the non-exact remainder', () => {
    const ordered = orderSearchCandidates(
      [
        { mpn: 'X-OLD', status: 'Obsolete' },
        { mpn: 'X-EXACT', status: 'Active' },
        { mpn: 'X-NEW', status: 'Active' },
      ],
      'X-EXACT',
    );
    // Exact first; then the two remaining Active-vs-Obsolete resolves Active-first, stable.
    expect(ordered.map((c) => c.mpn)).toEqual(['X-EXACT', 'X-NEW', 'X-OLD']);
  });
});
