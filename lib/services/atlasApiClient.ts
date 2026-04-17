/**
 * Atlas External API Client
 *
 * Fetches manufacturer profiles from the Atlas engineering team's API.
 * Used for enriching manufacturer profile data in atlas_manufacturers.
 *
 * Server-side only — do NOT import from client components.
 *
 * Base URL: https://cn-api.datasheet5.com
 * Auth: Authorization header with shared token (ATLAS_API_TOKEN env var).
 */

// ============================================================
// RESPONSE TYPES
// ============================================================

/** Category node from the API (L1→L2→L3 tree) */
export interface AtlasApiCategory {
  id: number;
  zhName?: string;
  enName?: string;
  /** For partner-scoped categories, the field is `name` instead */
  name?: string;
  partsioClass?: string;
  sub?: AtlasApiCategory[];
}

/** Partner object from the list endpoint */
export interface AtlasApiPartner {
  id: number;
  mfr: string;
  name: string;
  logoUrl: string;
  categories: { id: number; name: string; partsioClass: string }[];
  enabled?: boolean;
  partner?: boolean;
  profile?: boolean;
}

/** Partner detail from the single-partner endpoint */
export interface AtlasApiPartnerDetail {
  id: number;
  mfr: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  homepage: string | null;
  year: string | null;
  contact: string | null;
  stockcode: string | null;
  location: string | null;
  type: string | null;
  products: string | null;
  certs: string | null;
  salesDistChannel: string | null;
  gaiaId: string | null;
  categories: AtlasApiCategory[];
  // Structured JSON fields (may be null)
  coreApplications: unknown;
  globalSalesRep: unknown;
  ecomPlatforms: unknown;
  socialMediaPlatforms: unknown;
  tradeShowPlatforms: unknown;
  industryOrgPlatforms: unknown;
  businessContact: unknown;
  newProducts: unknown;
}

/** Product from the paginated parts endpoint */
export interface AtlasApiPart {
  id: number;
  name: string;
  imageUrl: string;
  description: string;
  category: string;
  partsioClass: string;
  datasheetUrls: string[];
}

/** Paginated parts response */
export interface AtlasApiPartsResponse {
  count: number;
  rows: AtlasApiPart[];
}

// ============================================================
// API ENVELOPE
// ============================================================

interface ApiResponse<T> {
  success: boolean;
  data: T;
  msg?: string;
}

// ============================================================
// CLIENT
// ============================================================

const BASE_URL = 'https://cn-api.datasheet5.com';

function getToken(): string {
  const token = process.env.ATLAS_API_TOKEN;
  if (!token) throw new Error('ATLAS_API_TOKEN not configured');
  return token;
}

async function apiGet<T>(path: string): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: { Authorization: getToken() },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 401) {
    throw new Error('Atlas API: unauthorized (check ATLAS_API_TOKEN)');
  }
  if (!res.ok) {
    throw new Error(`Atlas API ${res.status}: ${await res.text().catch(() => 'unknown')}`);
  }
  const json = (await res.json()) as ApiResponse<T>;
  if (!json.success) {
    throw new Error(`Atlas API error: ${json.msg || 'unknown'}`);
  }
  return json.data;
}

// ============================================================
// PUBLIC FUNCTIONS
// ============================================================

/** Fetch all partners (manufacturers) */
export async function fetchAtlasApiPartners(
  locale: 'en' | 'zh' = 'en',
): Promise<AtlasApiPartner[]> {
  return apiGet<AtlasApiPartner[]>(
    `/api/atlas/partners?locale=${locale}&all=true`,
  );
}

/** Fetch single partner detail (profile) */
export async function fetchAtlasApiPartnerDetail(
  id: number,
  locale: 'en' | 'zh' = 'en',
): Promise<AtlasApiPartnerDetail> {
  return apiGet<AtlasApiPartnerDetail>(
    `/api/atlas/partners/${id}?locale=${locale}`,
  );
}

/** Fetch the global category tree (L1→L2→L3) */
export async function fetchAtlasApiCategories(): Promise<AtlasApiCategory[]> {
  return apiGet<AtlasApiCategory[]>('/api/atlas/categories');
}

/** Fetch paginated products for a partner */
export async function fetchAtlasApiParts(
  partnerId: number,
  opts: { pageSize?: number; currentPage?: number; locale?: 'en' | 'zh'; cat2Id?: number } = {},
): Promise<AtlasApiPartsResponse> {
  const { pageSize = 20, currentPage = 1, locale = 'en', cat2Id } = opts;
  let path = `/api/atlas/partners/${partnerId}/parts?pageSize=${pageSize}&currentPage=${currentPage}&locale=${locale}`;
  if (cat2Id) path += `&cat2Id=${cat2Id}`;
  return apiGet<AtlasApiPartsResponse>(path);
}
