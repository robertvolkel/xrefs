/**
 * Tests for manufacturerAliasResolver (Atlas + Western).
 *
 * Mocks server-side Supabase createClient. The mock routes by table name so
 * the same test can drive both the Atlas single-query path and the Western
 * paginated path with different data.
 */

type AtlasRow = {
  slug: string;
  name_display: string;
  name_en: string;
  name_zh: string | null;
  aliases: string[] | null;
};
type CompanyRow = {
  uid: number;
  name: string;
  status: string | null;
  parent_uid: number | null;
  slug: string;
};
type AliasRow = {
  company_uid: number;
  value: string;
  context: string;
};

// Populated by beforeEach in each test.
let atlasData: AtlasRow[] = [];
let companyData: CompanyRow[] = [];
let aliasData: AliasRow[] = [];
let atlasError: { message: string } | null = null;

// Spy to count actual network calls (for cache tests).
let atlasSelectCalls = 0;
let companiesRangeCalls = 0;
let aliasesRangeCalls = 0;

jest.mock('../../lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    from: (table: string) => {
      if (table === 'atlas_manufacturers') {
        return {
          select: () => {
            atlasSelectCalls++;
            return Promise.resolve({ data: atlasData, error: atlasError });
          },
        };
      }
      if (table === 'manufacturer_companies') {
        return {
          select: () => ({
            order: () => ({
              range: (from: number, to: number) => {
                companiesRangeCalls++;
                const slice = companyData.slice(from, to + 1);
                return Promise.resolve({ data: slice, error: null });
              },
            }),
          }),
        };
      }
      if (table === 'manufacturer_aliases') {
        return {
          select: () => ({
            order: () => ({
              range: (from: number, to: number) => {
                aliasesRangeCalls++;
                const slice = aliasData.slice(from, to + 1);
                return Promise.resolve({ data: slice, error: null });
              },
            }),
          }),
        };
      }
      throw new Error(`Unexpected table in mock: ${table}`);
    },
  })),
}));

import {
  resolveManufacturerAlias,
  getAllManufacturerVariants,
  invalidateManufacturerAliasCache,
} from '@/lib/services/manufacturerAliasResolver';

// ─── Atlas fixtures ──────────────────────────────────────

const gigadevice: AtlasRow = {
  slug: 'gigadevice',
  name_display: 'GIGADEVICE 兆易创新',
  name_en: 'GIGADEVICE',
  name_zh: '兆易创新',
  aliases: ['gigadevice', 'gd', 'gd/兆易创新'],
};
const isc: AtlasRow = {
  slug: 'isc',
  name_display: 'ISC 无锡固电',
  name_en: 'ISC',
  name_zh: '无锡固电',
  aliases: [],
};

// ─── Western fixtures (modeling Linear Tech → ADI chain) ──

const adi: CompanyRow = {
  uid: 1742,
  name: 'Analog Devices Inc',
  status: 'corporate',
  parent_uid: 1742,
  slug: 'analog-devices-inc',
};
const linearTech: CompanyRow = {
  uid: 2136,
  name: 'Linear Technology',
  status: 'acquired',
  parent_uid: 1742,
  slug: 'linear-technology',
};
const maxim: CompanyRow = {
  uid: 2164,
  name: 'Maxim Integrated Products',
  status: 'acquired',
  parent_uid: 1742,
  slug: 'maxim-integrated-products',
};
const hittite: CompanyRow = {
  uid: 2035,
  name: 'Hittite Microwave Corp',
  status: 'acquired',
  parent_uid: 1742,
  slug: 'hittite-microwave-corp',
};

// National Semi — acquired_by alias chain, not parent_uid.
const ti: CompanyRow = {
  uid: 2477,
  name: 'Texas Instruments',
  status: 'corporate',
  parent_uid: 2477,
  slug: 'texas-instruments',
};
const nationalSemi: CompanyRow = {
  uid: 2216,
  name: 'National Semiconductor Corporation',
  status: 'acquired',
  parent_uid: 2216, // SELF, not pointing at TI
  slug: 'national-semiconductor-corporation',
};

// Cypress collision — Semiconductor is acquired → Infineon (corporate),
// Industries is a self-ref standalone.
const infineon: CompanyRow = {
  uid: 2065,
  name: 'Infineon Technologies AG',
  status: 'corporate',
  parent_uid: 2065,
  slug: 'infineon-technologies-ag',
};
const cypressSemi: CompanyRow = {
  uid: 1903,
  name: 'Cypress Semiconductor',
  status: 'acquired',
  parent_uid: 2065,
  slug: 'cypress-semiconductor',
};
const cypressIndustries: CompanyRow = {
  uid: 116151850,
  name: 'Cypress Industries',
  status: null,
  parent_uid: 116151850,
  slug: 'cypress-industries',
};

// ─── Setup ───────────────────────────────────────────────

beforeEach(() => {
  invalidateManufacturerAliasCache();
  atlasData = [];
  companyData = [];
  aliasData = [];
  atlasError = null;
  atlasSelectCalls = 0;
  companiesRangeCalls = 0;
  aliasesRangeCalls = 0;
});

// ─── Atlas (Chinese P1 — unchanged behavior) ─────────────

describe('resolveManufacturerAlias — Atlas', () => {
  it('matches on name_display', async () => {
    atlasData = [gigadevice];
    const m = await resolveManufacturerAlias('GIGADEVICE 兆易创新');
    expect(m?.canonical).toBe('GIGADEVICE 兆易创新');
    expect(m?.source).toBe('atlas');
    expect(m?.slug).toBe('gigadevice');
  });

  it('matches on name_en case-insensitively', async () => {
    atlasData = [gigadevice];
    expect((await resolveManufacturerAlias('gigadevice'))?.slug).toBe('gigadevice');
  });

  it('matches on name_zh (CJK input)', async () => {
    atlasData = [gigadevice];
    expect((await resolveManufacturerAlias('兆易创新'))?.slug).toBe('gigadevice');
  });

  it('matches on alias entries', async () => {
    atlasData = [gigadevice];
    expect((await resolveManufacturerAlias('GD'))?.canonical).toBe('GIGADEVICE 兆易创新');
  });

  it('returns null for unknown input', async () => {
    atlasData = [gigadevice, isc];
    expect(await resolveManufacturerAlias('Nobody Electronics')).toBeNull();
  });

  it('returns null for empty / whitespace', async () => {
    atlasData = [gigadevice];
    expect(await resolveManufacturerAlias('')).toBeNull();
    expect(await resolveManufacturerAlias('   ')).toBeNull();
  });

  it('populates variants with every known spelling', async () => {
    atlasData = [gigadevice];
    const m = await resolveManufacturerAlias('GD');
    expect(new Set(m!.variants)).toEqual(
      new Set(['GIGADEVICE 兆易创新', 'GIGADEVICE', '兆易创新', 'gigadevice', 'gd', 'gd/兆易创新']),
    );
  });

  it('tolerates null aliases column', async () => {
    atlasData = [{ ...gigadevice, aliases: null }];
    const m = await resolveManufacturerAlias('GIGADEVICE');
    expect(m?.canonical).toBe('GIGADEVICE 兆易创新');
  });

  it('tolerates a legacy JSON-string-encoded aliases column (import bug fallback)', async () => {
    // Pre-fix versions of scripts/atlas-manufacturers-import.mjs wrote
    // JSON.stringify(array) into a JSONB array column, which stored the value
    // as a JSON string. Without defensive parsing, iterating the string would
    // add every character to the variant map.
    const corrupt = {
      ...gigadevice,
      aliases: '["gd","gigadevice","兆易创新"]' as unknown as string[],
    };
    atlasData = [corrupt];
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const m = await resolveManufacturerAlias('GD');
      expect(m?.canonical).toBe('GIGADEVICE 兆易创新');
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('JSON string'));
    } finally {
      warn.mockRestore();
    }
  });

  it('returns null gracefully when Atlas Supabase errors', async () => {
    atlasError = { message: 'boom' };
    expect(await resolveManufacturerAlias('GD')).toBeNull();
  });

  it('caches within TTL', async () => {
    atlasData = [gigadevice];
    await resolveManufacturerAlias('GD');
    await resolveManufacturerAlias('gigadevice');
    await resolveManufacturerAlias('兆易创新');
    expect(atlasSelectCalls).toBe(1);
  });

  it('invalidate forces a refetch', async () => {
    atlasData = [gigadevice];
    await resolveManufacturerAlias('GD');
    invalidateManufacturerAliasCache();
    atlasData = [gigadevice, isc];
    await resolveManufacturerAlias('无锡固电');
    expect(atlasSelectCalls).toBe(2);
  });
});

describe('getAllManufacturerVariants', () => {
  it('returns Map keyed by name_display (Atlas)', async () => {
    atlasData = [gigadevice, isc];
    const all = await getAllManufacturerVariants();
    expect(all.get('GIGADEVICE 兆易创新')?.slug).toBe('gigadevice');
    expect(all.get('ISC 无锡固电')?.slug).toBe('isc');
  });
});

// ─── Western (Decision #149) ──────────────────────────────

describe('resolveManufacturerAlias — Western parent-chain walk', () => {
  it('walks Linear Technology → ADI via parent_uid', async () => {
    companyData = [adi, linearTech];
    aliasData = [{ company_uid: 2136, value: 'LT', context: 'short_name' }];

    const m = await resolveManufacturerAlias('Linear Technology');
    expect(m?.canonical).toBe('Analog Devices Inc');
    expect(m?.source).toBe('western');
    expect(m?.slug).toBe('analog-devices-inc');
    expect(m?.companyUid).toBe(1742);
  });

  it('resolves short_name aliases to the current canonical', async () => {
    companyData = [adi, linearTech];
    aliasData = [
      { company_uid: 2136, value: 'LT', context: 'short_name' },
      { company_uid: 2136, value: 'LTC', context: 'short_name' },
      { company_uid: 2136, value: 'linetech', context: 'also_known_as' },
    ];

    expect((await resolveManufacturerAlias('LT'))?.canonical).toBe('Analog Devices Inc');
    expect((await resolveManufacturerAlias('ltc'))?.canonical).toBe('Analog Devices Inc');
    expect((await resolveManufacturerAlias('linetech'))?.canonical).toBe('Analog Devices Inc');
  });

  it('resolves via acquired_by alias chain when parent_uid is self-ref', async () => {
    // National Semi's parent points to itself (2216) — the acquisition by TI
    // is recorded as an alias row, not a parent pointer. Resolver must follow
    // the acquired_by alias.
    companyData = [ti, nationalSemi];
    aliasData = [
      { company_uid: 2216, value: 'Texas Instruments', context: 'acquired_by' },
      { company_uid: 2216, value: 'National Semi', context: 'short_name' },
    ];

    const m = await resolveManufacturerAlias('National Semiconductor Corporation');
    expect(m?.canonical).toBe('Texas Instruments');
    expect(m?.source).toBe('western');
    expect(m?.companyUid).toBe(2477);
  });

  it('collects variants from every descendant of the canonical', async () => {
    companyData = [adi, linearTech, maxim, hittite];
    aliasData = [
      { company_uid: 2136, value: 'LT', context: 'short_name' },
      { company_uid: 2136, value: 'LTC', context: 'short_name' },
      { company_uid: 2164, value: 'Maxim', context: 'short_name' },
      { company_uid: 2035, value: 'Hittite Microwave', context: 'also_known_as' },
      { company_uid: 1742, value: 'ADI', context: 'short_name' },
    ];

    const m = await resolveManufacturerAlias('ADI');
    expect(m?.canonical).toBe('Analog Devices Inc');
    expect(new Set(m!.variants)).toEqual(
      new Set([
        'Analog Devices Inc',
        'ADI',
        'Linear Technology',
        'LT',
        'LTC',
        'Maxim Integrated Products',
        'Maxim',
        'Hittite Microwave Corp',
        'Hittite Microwave',
      ]),
    );
  });

  it('attaches lineage leaf→root on resolve', async () => {
    companyData = [adi, linearTech];
    aliasData = [{ company_uid: 2136, value: 'LT', context: 'short_name' }];

    const m = await resolveManufacturerAlias('LT');
    expect(m?.lineage).toEqual([
      { uid: 2136, name: 'Linear Technology', status: 'acquired' },
      { uid: 1742, name: 'Analog Devices Inc', status: 'corporate' },
    ]);
  });

  it('lineage for a canonical input is just the canonical', async () => {
    companyData = [adi, linearTech];
    aliasData = [];

    const m = await resolveManufacturerAlias('Analog Devices Inc');
    expect(m?.lineage).toEqual([
      { uid: 1742, name: 'Analog Devices Inc', status: 'corporate' },
    ]);
  });

  it('name-collision resolves to the corporate-canonical side', async () => {
    // "Cypress" is a short_name of Cypress Semiconductor (→ Infineon corporate)
    // AND is a substring of Cypress Industries. Since both routes have the
    // same exact alias "Cypress", only Semiconductor's row registers it here,
    // but even if both claimed the same variant the corporate-canonical side
    // should win. Emulate by pointing cypress_industries' name directly at
    // "Cypress Semiconductor" (artificial collision).
    const collidingIndustries: CompanyRow = { ...cypressIndustries, name: 'Cypress Semiconductor' };
    companyData = [infineon, cypressSemi, collidingIndustries];
    aliasData = [];

    const m = await resolveManufacturerAlias('Cypress Semiconductor');
    // Should resolve via Cypress Semiconductor (uid 1903) whose canonical
    // is Infineon (corporate).
    expect(m?.canonical).toBe('Infineon Technologies AG');
    expect(m?.companyUid).toBe(2065);
  });

  it('returns null for a Western name not in the index', async () => {
    companyData = [adi, linearTech];
    aliasData = [];
    expect(await resolveManufacturerAlias('Acme Widgets Inc')).toBeNull();
  });

  it('caps walk at MAX_PARENT_HOPS to prevent infinite loops', async () => {
    // Build a cycle: A → B → A.
    const a: CompanyRow = { uid: 1, name: 'A', status: 'acquired', parent_uid: 2, slug: 'a' };
    const b: CompanyRow = { uid: 2, name: 'B', status: 'acquired', parent_uid: 1, slug: 'b' };
    companyData = [a, b];
    aliasData = [];
    const m = await resolveManufacturerAlias('A');
    // Should terminate somewhere (loop guard). Doesn't matter which side —
    // this test just asserts no hang / stack overflow.
    expect(m).not.toBeNull();
    expect(m?.source).toBe('western');
  });
});

describe('resolveManufacturerAlias — cross-source', () => {
  it('Atlas hit returns source=atlas, Western hit returns source=western', async () => {
    atlasData = [gigadevice];
    companyData = [adi, linearTech];
    aliasData = [{ company_uid: 2136, value: 'LT', context: 'short_name' }];

    const cn = await resolveManufacturerAlias('兆易创新');
    const us = await resolveManufacturerAlias('Linear Technology');
    expect(cn?.source).toBe('atlas');
    expect(us?.source).toBe('western');
  });

  it('Atlas wins cross-source collision', async () => {
    // Artificially make Atlas and Western share a variant key.
    atlasData = [{ ...gigadevice, aliases: ['shared-name'] }];
    companyData = [
      { uid: 9999, name: 'shared-name', status: 'corporate', parent_uid: 9999, slug: 'shared' },
    ];
    aliasData = [];

    const m = await resolveManufacturerAlias('shared-name');
    expect(m?.source).toBe('atlas');
    expect(m?.slug).toBe('gigadevice');
  });

  it('both Atlas and Western data paginate/load on cold cache', async () => {
    atlasData = [gigadevice];
    companyData = [adi];
    aliasData = [{ company_uid: 1742, value: 'ADI', context: 'short_name' }];

    await resolveManufacturerAlias('ADI');
    expect(atlasSelectCalls).toBe(1);
    expect(companiesRangeCalls).toBeGreaterThan(0);
    expect(aliasesRangeCalls).toBeGreaterThan(0);
  });
});
