/**
 * Tests for pickMfrAwareMatch — the BOM batch-validation disambiguator that
 * prefers a candidate whose MFR canonically matches the user's input.
 *
 * Drives the real resolver with a stubbed Supabase client so the end-to-end
 * behavior (input MFR → resolver → candidate canonical match) is verified.
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

let atlasData: AtlasRow[] = [];
let companyData: CompanyRow[] = [];
let aliasData: AliasRow[] = [];

jest.mock('../../lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    from: (table: string) => {
      if (table === 'atlas_manufacturers') {
        return { select: () => Promise.resolve({ data: atlasData, error: null }) };
      }
      if (table === 'manufacturer_companies') {
        return {
          select: () => ({
            order: () => ({
              range: (from: number, to: number) =>
                Promise.resolve({ data: companyData.slice(from, to + 1), error: null }),
            }),
          }),
        };
      }
      if (table === 'manufacturer_aliases') {
        return {
          select: () => ({
            order: () => ({
              range: (from: number, to: number) =>
                Promise.resolve({ data: aliasData.slice(from, to + 1), error: null }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table in mock: ${table}`);
    },
  })),
}));

import { pickMfrAwareMatch } from '@/lib/services/mfrMatchPicker';
import { invalidateManufacturerAliasCache } from '@/lib/services/manufacturerAliasResolver';
import type { PartSummary } from '@/lib/types';

function mkMatch(mpn: string, manufacturer: string, dataSource?: 'digikey' | 'atlas' | 'partsio'): PartSummary {
  return { mpn, manufacturer, description: '', category: 'ICs', dataSource };
}

// Western fixtures (reusing the Linear Tech → ADI chain).
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
const ti: CompanyRow = {
  uid: 2477,
  name: 'Texas Instruments',
  status: 'corporate',
  parent_uid: 2477,
  slug: 'texas-instruments',
};

beforeEach(() => {
  invalidateManufacturerAliasCache();
  atlasData = [];
  companyData = [];
  aliasData = [];
});

describe('pickMfrAwareMatch', () => {
  it('returns matches[0] when only one match exists', async () => {
    companyData = [adi, linearTech];
    const matches = [mkMatch('LT1086', 'Analog Devices Inc')];
    const picked = await pickMfrAwareMatch(matches, 'Linear Technology');
    expect(picked).toBe(matches[0]);
  });

  it('returns matches[0] when input MFR is blank or missing', async () => {
    companyData = [adi, linearTech];
    const matches = [mkMatch('LT1086', 'Fake Corp'), mkMatch('LT1086', 'Analog Devices Inc')];
    expect(await pickMfrAwareMatch(matches, undefined)).toBe(matches[0]);
    expect(await pickMfrAwareMatch(matches, '')).toBe(matches[0]);
    expect(await pickMfrAwareMatch(matches, '   ')).toBe(matches[0]);
  });

  it('returns matches[0] when input MFR does not resolve to any alias', async () => {
    companyData = [adi, linearTech];
    const matches = [mkMatch('X', 'A'), mkMatch('X', 'B')];
    const picked = await pickMfrAwareMatch(matches, 'Unknown Corp');
    expect(picked).toBe(matches[0]);
  });

  it('prefers the canonically-matching candidate over the first match', async () => {
    companyData = [adi, linearTech, ti];
    const matches = [
      mkMatch('LT1086', 'Texas Instruments'),         // matches[0] — wrong MFR
      mkMatch('LT1086', 'Analog Devices Inc'),         // canonical for input "Linear Technology"
    ];
    const picked = await pickMfrAwareMatch(matches, 'Linear Technology');
    expect(picked).toBe(matches[1]);
    expect(picked.manufacturer).toBe('Analog Devices Inc');
  });

  it('preserves matches[0] when it already canonically matches the input', async () => {
    companyData = [adi, linearTech, ti];
    const matches = [
      mkMatch('LT1086', 'Analog Devices Inc'),         // matches[0] canonically == input (Linear Tech → ADI)
      mkMatch('LT1086', 'Texas Instruments'),
    ];
    const picked = await pickMfrAwareMatch(matches, 'Linear Technology');
    expect(picked).toBe(matches[0]);
  });

  it('falls back to matches[0] when no candidate MFR matches the canonical', async () => {
    companyData = [adi, linearTech, ti];
    const matches = [
      mkMatch('LT1086', 'Texas Instruments'),
      mkMatch('LT1086', 'Some Other Corp'),
    ];
    const picked = await pickMfrAwareMatch(matches, 'Linear Technology');
    expect(picked).toBe(matches[0]); // fallback — input resolves to ADI but no candidate does
  });

  it('works across sources — Atlas manufacturer input picks Atlas candidate', async () => {
    atlasData = [
      {
        slug: 'gigadevice',
        name_display: 'GIGADEVICE 兆易创新',
        name_en: 'GIGADEVICE',
        name_zh: '兆易创新',
        aliases: ['gd'],
      },
    ];
    const matches = [
      mkMatch('GD32F405', 'Random MFR'),
      mkMatch('GD32F405', 'GIGADEVICE 兆易创新'),
    ];
    const picked = await pickMfrAwareMatch(matches, 'GD');
    expect(picked).toBe(matches[1]);
  });

  it('skips candidates with empty manufacturer strings', async () => {
    companyData = [adi, linearTech];
    const matches = [
      mkMatch('LT1086', ''),                            // blank — skipped
      mkMatch('LT1086', 'Analog Devices Inc'),          // preferred
    ];
    const picked = await pickMfrAwareMatch(matches, 'Linear Technology');
    expect(picked).toBe(matches[1]);
  });
});
