import {
  digikeyProvider,
  atlasProvider,
  partsioProvider,
  findchipsProvider,
  isParametricProvider,
  catalogProviders,
  enrichmentProvider,
  commercialProvider,
  parametricProvider,
  providerById,
  type DataSourceProvider,
} from '@/lib/services/providers';
import { extractPartsioLifecycle } from '@/lib/services/partsioMapper';
import type { PartsioListing } from '@/lib/services/partsioClient';

const ALL = [digikeyProvider, atlasProvider, partsioProvider, findchipsProvider];

describe('provider identity & kinds', () => {
  it('each provider declares a unique id and the expected kind', () => {
    expect(digikeyProvider.id).toBe('digikey');
    expect(digikeyProvider.kind).toBe('catalog');
    expect(atlasProvider.id).toBe('atlas');
    expect(atlasProvider.kind).toBe('catalog');
    expect(partsioProvider.id).toBe('partsio');
    expect(partsioProvider.kind).toBe('enrichment');
    expect(findchipsProvider.id).toBe('findchips');
    expect(findchipsProvider.kind).toBe('commercial');
    expect(new Set(ALL.map((p) => p.id)).size).toBe(4);
  });
});

describe('capability flags match reality', () => {
  it('only Digikey advertises facets + parametric filter', () => {
    expect(digikeyProvider.capabilities.facets).toBe(true);
    expect(digikeyProvider.capabilities.parametricFilter).toBe(true);
    for (const p of [atlasProvider, partsioProvider, findchipsProvider]) {
      expect(p.capabilities.facets).toBe(false);
      expect(p.capabilities.parametricFilter).toBe(false);
    }
  });

  it('Digikey does NOT advertise candidateFetch (deferred island); Atlas does', () => {
    expect(digikeyProvider.capabilities.candidateFetch).toBe(false);
    expect(atlasProvider.capabilities.candidateFetch).toBe(true);
  });

  it('only parts.io advertises equivalents; only FindChips advertises quotes', () => {
    expect(partsioProvider.capabilities.equivalents).toBe(true);
    expect(findchipsProvider.capabilities.quotes).toBe(true);
    expect(digikeyProvider.capabilities.quotes).toBe(false);
  });

  it('isParametricProvider agrees with the capability flags', () => {
    expect(isParametricProvider(digikeyProvider)).toBe(true);
    expect(isParametricProvider(atlasProvider)).toBe(false);
    expect(isParametricProvider(partsioProvider)).toBe(false);
    expect(isParametricProvider(findchipsProvider)).toBe(false);
    // Structural invariant: facets && parametricFilter && catalog <=> isParametricProvider
    for (const p of ALL as DataSourceProvider[]) {
      const expected = p.kind === 'catalog' && p.capabilities.facets && p.capabilities.parametricFilter;
      expect(isParametricProvider(p)).toBe(expected);
    }
  });
});

describe('registry — configured-state filtering + priority (evaluated at call time)', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  function configureAll() {
    process.env.DIGIKEY_CLIENT_ID = 'x';
    process.env.DIGIKEY_CLIENT_SECRET = 'y';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.PARTSIO_API_KEY = 'k';
    process.env.FINDCHIPS_API_KEY = 'k';
  }

  it('catalogProviders() returns [digikey, atlas] in priority order when both configured', () => {
    configureAll();
    expect(catalogProviders().map((p) => p.id)).toEqual(['digikey', 'atlas']);
  });

  it('drops Digikey when it is not configured (graceful degradation to Atlas)', () => {
    configureAll();
    delete process.env.DIGIKEY_CLIENT_ID;
    delete process.env.DIGIKEY_CLIENT_SECRET;
    expect(catalogProviders().map((p) => p.id)).toEqual(['atlas']);
    // parametric capability is lost when Digikey is gone (no facet source)
    expect(parametricProvider()).toBeNull();
  });

  it('parametricProvider() is Digikey when configured', () => {
    configureAll();
    expect(parametricProvider()?.id).toBe('digikey');
  });

  it('enrichment/commercial accessors gate on configuration', () => {
    configureAll();
    expect(enrichmentProvider()?.id).toBe('partsio');
    expect(commercialProvider()?.id).toBe('findchips');
    delete process.env.PARTSIO_API_KEY;
    expect(enrichmentProvider()).toBeNull();
  });

  it('providerById resolves regardless of configured state', () => {
    delete process.env.DIGIKEY_CLIENT_ID;
    expect(providerById('digikey')).toBe(digikeyProvider);
    expect(providerById('findchips')).toBe(findchipsProvider);
  });
});

describe('extractPartsioLifecycle (extracted from partDataService — must stay faithful)', () => {
  it('maps all lifecycle/compliance/trade fields', () => {
    const listing = {
      YTEOL: '3.5',
      'Risk Rank': 42,
      'Country Of Origin': 'CN',
      'Reach Compliance Code': 'COMPLIANT',
      'ECCN Code': 'EAR99',
      'HTS Code': '8541.10',
      'Factory Lead Time': { Weeks: 12 },
    } as unknown as PartsioListing;

    expect(extractPartsioLifecycle(listing)).toEqual({
      yteol: 3.5,
      riskRank: 42,
      countryOfOrigin: 'CN',
      reachCompliance: 'COMPLIANT',
      eccnCode: 'EAR99',
      htsCode: '8541.10',
      factoryLeadTimeWeeks: 12,
    });
  });

  it('omits absent fields (gap-fill semantics rely on undefined, not empty)', () => {
    const listing = { YTEOL: '1.0' } as unknown as PartsioListing;
    expect(extractPartsioLifecycle(listing)).toEqual({ yteol: 1.0 });
  });
});
