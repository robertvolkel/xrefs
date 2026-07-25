/**
 * REAL-PATH test for Fix A (per-manufacturer vetting key).
 *
 * Not an isolated fixture: this drives the ACTUAL `searchParts()` merge + logic-vetting
 * pipeline end to end, mocking only the network/DB boundary (Digikey keyword search, the
 * Atlas query, the alias resolver, the caches). Everything under test runs for real — the
 * real Digikey mappers, the real family classifier, the real synthetic-source builder, the
 * real matching engine, and the real reorder/annotate block.
 *
 * The defect it pins (found by code review 2026-07-24): with PER_MFR_CARDS_ENABLED on, the
 * merge keeps two same-MPN cards from different makers, but the vetting stage keyed its maps
 * by BARE MPN — so on a descriptive (constraints-present) search one card was dropped and the
 * survivor was scored with the OTHER maker's attributes. The fix keys every vetting structure
 * by the SAME `computeSearchDedupKey` the merge uses.
 *
 * Scenario: two makers ship the standard part "LM317T" — Texas Instruments (via Digikey, rated
 * Vds 100 V) and 3PEAK (via Atlas, rated 20 V) — and the user asks for "≥30 V". A correct
 * pipeline shows BOTH cards, marks the 100 V TI part as fitting and the 20 V 3PEAK part as
 * below spec. The bug collapses them to one card scored from a single maker's data.
 */

const SHARED_MPN = 'LM317T';

// ── Mock ONLY the boundary: real mappers/classifier/engine stay live ──

jest.mock('../../lib/services/digikeyClient', () => {
  const actual = jest.requireActual('../../lib/services/digikeyClient');
  return { ...actual, keywordSearch: jest.fn(), isDigikeyConfigured: jest.fn(() => true) };
});

jest.mock('../../lib/services/atlasClient', () => {
  const actual = jest.requireActual('../../lib/services/atlasClient');
  return { ...actual, searchAtlasProducts: jest.fn() };
});

jest.mock('../../lib/services/manufacturerAliasResolver', () => {
  const actual = jest.requireActual('../../lib/services/manufacturerAliasResolver');
  return { ...actual, resolveManufacturerAlias: jest.fn() };
});

jest.mock('../../lib/services/partDataCache', () => {
  const actual = jest.requireActual('../../lib/services/partDataCache');
  return { ...actual, getCachedResponse: jest.fn(async () => null), setCachedResponse: jest.fn(async () => {}) };
});

jest.mock('../../lib/services/overrideMerger', () => {
  const actual = jest.requireActual('../../lib/services/overrideMerger');
  return { ...actual, applyRuleOverrides: jest.fn(async (t: unknown) => t) };
});

jest.mock('../../lib/services/findchipsClient', () => {
  const actual = jest.requireActual('../../lib/services/findchipsClient');
  return {
    ...actual,
    getCachedDistributorCounts: jest.fn(async () => new Map()),
    getCachedDistributorPayloads: jest.fn(async () => new Map()),
  };
});

import { searchParts, looksLikeMpn } from '../../lib/services/partDataService';
import { keywordSearch, isDigikeyConfigured } from '../../lib/services/digikeyClient';
import { searchAtlasProducts } from '../../lib/services/atlasClient';
import { resolveManufacturerAlias } from '../../lib/services/manufacturerAliasResolver';
import { getCachedDistributorPayloads } from '../../lib/services/findchipsClient';

const kw = keywordSearch as jest.Mock;
const atlas = searchAtlasProducts as jest.Mock;
const alias = resolveManufacturerAlias as jest.Mock;
const distPayloads = getCachedDistributorPayloads as jest.Mock;

/** A raw Digikey keyword response for TI's LM317T, categorized so the real mapper
 *  classifies it into the MOSFET family (B5) with a real Vds parameter. */
function tiDigikeyResponse(vds: string) {
  return {
    ExactMatches: [],
    Products: [
      {
        ManufacturerProductNumber: SHARED_MPN,
        Manufacturer: { Name: 'Texas Instruments' },
        Description: { ProductDescription: 'N-Channel MOSFET', DetailedDescription: '' },
        Category: {
          Name: 'Discrete Semiconductor Products',
          ChildCategories: [
            { Name: 'Transistors - FETs, MOSFETs - Single', CategoryId: 278, ChildCategories: [] },
          ],
        },
        ProductStatus: { Status: 'Active' },
        Parameters: [{ ParameterText: 'Drain to Source Voltage (Vdss)', ValueText: vds }],
      },
    ],
  };
}

/** The Atlas return contract: `{ result, attrsByMpn }`, both keyed by lowercased MPN,
 *  with the attrs carrying 3PEAK's own (lower) Vds. */
function peakAtlasReturn(vds: number) {
  const part = {
    mpn: SHARED_MPN,
    manufacturer: '3PEAK',
    description: 'N-Channel MOSFET',
    detailedDescription: '',
    category: 'Transistors',
    subcategory: 'MOSFET',
    status: 'Active',
  };
  return {
    result: {
      type: 'single',
      matches: [
        {
          mpn: SHARED_MPN,
          manufacturer: '3PEAK',
          description: 'N-Channel MOSFET',
          category: 'Transistors',
          status: 'Active',
          dataSource: 'atlas',
        },
      ],
    },
    attrsByMpn: new Map([
      [
        SHARED_MPN.toLowerCase(),
        {
          part,
          parameters: [
            {
              parameterId: 'vds_max',
              parameterName: 'Drain-Source Voltage (Vds Max)',
              value: `${vds} V`,
              numericValue: vds,
              unit: 'V',
              sortOrder: 1,
            },
          ],
          dataSource: 'atlas',
        },
      ],
    ]),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (isDigikeyConfigured as jest.Mock).mockReturnValue(true);
  alias.mockImplementation(async (name: string) => {
    const l = String(name).toLowerCase();
    if (l.includes('texas') || l === 'ti') {
      return { canonical: 'Texas Instruments', slug: 'texas-instruments', source: 'western', variants: ['Texas Instruments', 'TI'] };
    }
    if (l.includes('3peak')) {
      return { canonical: '3PEAK', slug: '3peak', source: 'atlas', variants: ['3PEAK'] };
    }
    return null;
  });
});

afterEach(() => {
  delete process.env.PER_MFR_CARDS_ENABLED;
});

describe('searchParts per-MFR vetting key (Fix A, real-path)', () => {
  it('the descriptive query is treated as a description, not an MPN (vetting can run)', () => {
    // Guard: if this were MPN-shaped, constraints would be dropped and the whole vetting
    // path skipped — the rest of the suite would pass vacuously.
    expect(looksLikeMpn('30v n-channel mosfet')).toBe(false);
  });

  it('flag ON: keeps BOTH makers of a shared MPN and scores each from its OWN attrs', async () => {
    process.env.PER_MFR_CARDS_ENABLED = '1';
    kw.mockResolvedValue(tiDigikeyResponse('100 V')); // TI 100 V ≥ 30 → fits
    atlas.mockResolvedValue(peakAtlasReturn(20)); // 3PEAK 20 V < 30 → below spec

    const result = await searchParts('30v n-channel mosfet', 'USD', undefined, {
      skipFindchips: true,
      constraints: [{ attribute: 'drain-source voltage', value: 30, unit: 'V', bound: 'min' }],
    });

    const lm = result.matches.filter(m => m.mpn.toLowerCase() === SHARED_MPN.toLowerCase());
    // BUG: one card is dropped by the bare-MPN `summaryByMpn`/`placed` collapse → length 1.
    expect(lm).toHaveLength(2);

    const ti = lm.find(m => m.manufacturer === 'Texas Instruments');
    const peak = lm.find(m => m.manufacturer === '3PEAK');
    expect(ti).toBeDefined();
    expect(peak).toBeDefined();

    // Each card carries its OWN maker origin (sanity that two distinct makers survived).
    expect(ti!.mfrOrigin).toBe('western');
    expect(peak!.mfrOrigin).toBe('atlas');

    // Each card scored from its OWN Vds. BUG: both read the first-writer (TI) attrs, so the
    // 20 V part would NOT be below spec.
    expect(peak!.specFit).toBe('below_spec');
    expect(ti!.specFit).not.toBe('below_spec');
  });

  it('flag ON: each same-MPN card gets its OWN maker distributor count, not one shared value', async () => {
    // Regression for the per-MFR distributor-count collision: the cached row is keyed by MPN
    // alone, so an MPN-keyed number map hands every same-MPN card the last maker's count. The
    // fix reads the raw payload once and resolves EACH card against its own maker.
    process.env.PER_MFR_CARDS_ENABLED = '1';
    kw.mockResolvedValue(tiDigikeyResponse('100 V'));
    atlas.mockResolvedValue(peakAtlasReturn(20));
    // One MPN row, distinct per-maker counts. Buggy (MPN-keyed) code gives both cards the same.
    distPayloads.mockResolvedValue(
      new Map([[SHARED_MPN.toLowerCase(), { count: 40, byMaker: { 'texas instruments': 7, '3peak': 2 } }]]),
    );

    // Distinct query text so this doesn't hit the L1 search cache warmed by the other flag-ON test.
    const result = await searchParts('n-channel power mosfet 30v', 'USD', undefined, {
      skipFindchips: true,
      constraints: [{ attribute: 'drain-source voltage', value: 30, unit: 'V', bound: 'min' }],
    });

    const lm = result.matches.filter(m => m.mpn.toLowerCase() === SHARED_MPN.toLowerCase());
    const ti = lm.find(m => m.manufacturer === 'Texas Instruments');
    const peak = lm.find(m => m.manufacturer === '3PEAK');
    expect(ti?.distributorCount).toBe(7);
    expect(peak?.distributorCount).toBe(2);
  });

  it('flag OFF: the same two-source shared MPN collapses to ONE card (legacy dedup preserved)', async () => {
    kw.mockResolvedValue(tiDigikeyResponse('100 V'));
    atlas.mockResolvedValue(peakAtlasReturn(20));

    const result = await searchParts('n-channel mosfet 30v discrete', 'USD', undefined, {
      skipFindchips: true,
      constraints: [{ attribute: 'drain-source voltage', value: 30, unit: 'V', bound: 'min' }],
    });

    const lm = result.matches.filter(m => m.mpn.toLowerCase() === SHARED_MPN.toLowerCase());
    expect(lm).toHaveLength(1); // MPN-only dedup — different makers of one MPN merge to one card
  });
});
