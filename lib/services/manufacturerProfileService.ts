import { createClient } from '../supabase/server';
import {
  AtlasManufacturer,
  ManufacturerProfile,
  ManufacturerCertification,
  ManufacturerLocation,
  AuthorizedDistributor,
  DesignResource,
} from '../types';
import { resolveManufacturerAlias } from './manufacturerAliasResolver';
import { getManufacturerProfile as getMockProfile } from '../mockManufacturerData';
import { countryCodeToFlagEmoji } from '../utils/countryFlag';

export type ManufacturerProfileSource = 'atlas' | 'mock';

export interface ManufacturerProfileResult {
  profile: ManufacturerProfile;
  source: ManufacturerProfileSource;
}

interface AtlasManufacturerRow {
  id: number;
  atlas_id: number;
  slug: string;
  name_en: string;
  name_zh: string | null;
  name_display: string;
  aliases: string[] | null;
  partsio_id: number | null;
  partsio_name: string | null;
  website_url: string | null;
  logo_url: string | null;
  headquarters: string | null;
  country: string;
  founded_year: number | null;
  summary: string | null;
  is_second_source: boolean;
  certifications: ManufacturerCertification[] | null;
  manufacturing_locations: ManufacturerLocation[] | null;
  product_categories: string[] | null;
  authorized_distributors: AuthorizedDistributor[] | null;
  compliance_flags: string[] | null;
  design_resources: DesignResource[] | null;
  enabled: boolean;
  contact_info: string | null;
  core_products: string | null;
  stock_code: string | null;
  gaia_id: string | null;
  api_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

function rowToAtlasManufacturer(row: AtlasManufacturerRow): AtlasManufacturer {
  return {
    id: row.id,
    atlasId: row.atlas_id,
    slug: row.slug,
    nameEn: row.name_en,
    nameZh: row.name_zh,
    nameDisplay: row.name_display,
    aliases: Array.isArray(row.aliases) ? row.aliases : [],
    partsioId: row.partsio_id,
    partsioName: row.partsio_name,
    websiteUrl: row.website_url,
    logoUrl: row.logo_url,
    headquarters: row.headquarters,
    country: row.country,
    foundedYear: row.founded_year,
    summary: row.summary,
    isSecondSource: row.is_second_source,
    certifications: Array.isArray(row.certifications) ? row.certifications : [],
    manufacturingLocations: Array.isArray(row.manufacturing_locations) ? row.manufacturing_locations : [],
    productCategories: Array.isArray(row.product_categories) ? row.product_categories : [],
    authorizedDistributors: Array.isArray(row.authorized_distributors) ? row.authorized_distributors : [],
    complianceFlags: Array.isArray(row.compliance_flags) ? row.compliance_flags : [],
    designResources: Array.isArray(row.design_resources) ? row.design_resources : [],
    enabled: row.enabled,
    contactInfo: row.contact_info,
    coreProducts: row.core_products,
    stockCode: row.stock_code,
    gaiaId: row.gaia_id,
    apiSyncedAt: row.api_synced_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapAtlasToManufacturerProfile(row: AtlasManufacturer): ManufacturerProfile {
  let productCategories = row.productCategories ?? [];
  if (productCategories.length === 0 && row.coreProducts) {
    productCategories = row.coreProducts
      .split(/[,;]/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  return {
    id: row.slug,
    name: row.nameEn || row.nameDisplay,
    logoUrl: row.logoUrl ?? undefined,
    headquarters: row.headquarters ?? '—',
    country: row.country,
    countryFlag: countryCodeToFlagEmoji(row.country),
    foundedYear: row.foundedYear ?? undefined,
    isSecondSource: row.isSecondSource,
    productCategories,
    certifications: row.certifications ?? [],
    designResources: row.designResources ?? [],
    manufacturingLocations: row.manufacturingLocations ?? [],
    authorizedDistributors: row.authorizedDistributors ?? [],
    complianceFlags: row.complianceFlags ?? [],
    summary: row.summary ?? '',
    stockCode: row.stockCode ?? undefined,
    websiteUrl: row.websiteUrl ?? undefined,
    contactInfo: (row.contactInfo as string | Record<string, string> | null) ?? undefined,
    partsioName: row.partsioName ?? undefined,
  };
}

// Module-scope 5-min TTL cache keyed by canonical slug (Atlas) or
// `mock:<lowercased-name>` / `null:<lowercased-name>`. Survives across requests
// in the same process — defensive against per-request alias-resolver cold paths
// and per-request `requireAuth()` cost. Soft-invalidated on dev hot-reload.
const PROFILE_CACHE_TTL_MS = 5 * 60_000;
const profileCache = new Map<string, { result: ManufacturerProfileResult | null; expiresAt: number }>();

function cacheGet(key: string): ManufacturerProfileResult | null | undefined {
  const entry = profileCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    profileCache.delete(key);
    return undefined;
  }
  return entry.result;
}

function cacheSet(key: string, result: ManufacturerProfileResult | null): void {
  profileCache.set(key, { result, expiresAt: Date.now() + PROFILE_CACHE_TTL_MS });
}

export async function getProfileForManufacturer(
  name: string,
): Promise<ManufacturerProfileResult | null> {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  const lowerName = trimmed.toLowerCase();

  const alias = await resolveManufacturerAlias(trimmed);
  if (alias && alias.source === 'atlas') {
    const key = `atlas:${alias.slug}`;
    const cached = cacheGet(key);
    if (cached !== undefined) return cached;
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('atlas_manufacturers')
        .select('*')
        .eq('slug', alias.slug)
        .single<AtlasManufacturerRow>();
      if (!error && data) {
        const result: ManufacturerProfileResult = {
          profile: mapAtlasToManufacturerProfile(rowToAtlasManufacturer(data)),
          source: 'atlas',
        };
        cacheSet(key, result);
        return result;
      }
    } catch (e) {
      console.error('manufacturerProfileService: atlas fetch failed', e);
    }
  }

  const mockKey = `mock:${lowerName}`;
  const cachedMock = cacheGet(mockKey);
  if (cachedMock !== undefined) return cachedMock;
  const mock = getMockProfile(trimmed);
  if (mock) {
    const result: ManufacturerProfileResult = { profile: mock, source: 'mock' };
    cacheSet(mockKey, result);
    return result;
  }

  const nullKey = `null:${lowerName}`;
  const cachedNull = cacheGet(nullKey);
  if (cachedNull !== undefined) return cachedNull;
  cacheSet(nullKey, null);
  return null;
}

/** Test/admin escape hatch — clears the profile cache. */
export function invalidateManufacturerProfileCache(): void {
  profileCache.clear();
}
