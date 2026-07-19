/**
 * Digikey Product Information API v4 Client
 *
 * Handles OAuth2 token management, keyword search, and product details.
 * All functions are server-side only (uses process.env).
 */

import { logApiCall } from './apiUsageLogger';
import {
  getCachedResponse,
  setCachedResponse,
  setCachedResponseBatch,
  TTL_PARAMETRIC_DIGIKEY,
  TTL_COMMERCIAL_MS,
  type CacheReadResult,
} from './partDataCache';

const BASE_URL = 'https://api.digikey.com';
const TOKEN_URL = `${BASE_URL}/v1/oauth2/token`;
const SEARCH_URL = `${BASE_URL}/products/v4/search/keyword`;
const DETAILS_URL = `${BASE_URL}/products/v4/search`;
const CATEGORIES_URL = `${BASE_URL}/products/v4/search/categories`;

// ============================================================
// DIGIKEY RESPONSE TYPES
// ============================================================

export interface DigikeyCategory {
  CategoryId: number;
  Name: string;
  ProductCount?: number;
  ChildCategories?: DigikeyCategory[];
}

export interface DigikeyPriceBreak {
  BreakQuantity: number;
  UnitPrice: number;
  TotalPrice: number;
}

export interface DigikeyProductVariation {
  DigiKeyProductNumber: string;
  PackageType?: { Id: number; Name: string };
  StandardPricing?: DigikeyPriceBreak[];
}

export interface DigikeyProduct {
  Description: { ProductDescription: string; DetailedDescription: string };
  Manufacturer: { Id: number; Name: string };
  ManufacturerProductNumber: string;
  DigiKeyPartNumber: string;
  UnitPrice: number;
  StandardPricing?: DigikeyPriceBreak[];
  ProductVariations?: DigikeyProductVariation[];
  ProductUrl: string;
  DatasheetUrl: string;
  PhotoUrl: string;
  QuantityAvailable: number;
  ProductStatus: { Id: number; Status: string };
  Parameters: DigikeyParameter[];
  Category: DigikeyCategory;
  Series: { Id: number; Name: string };
  Classifications?: {
    MoistureSensitivityLevel?: string;
    RohsStatus?: string;
  };
}

export interface DigikeyParameter {
  ParameterId: number;
  ParameterText: string;
  ValueId: string;
  ValueText: string;
}

/** One value option of a parametric facet (Decision #238 Step 3). `ValueId` is the value
 *  STRING (e.g. "5.1 V") — it is what the apply-filter request passes as `Id`, not a numeric id. */
export interface DigikeyFilterValue {
  ValueId: string;
  ValueName: string;
  ProductCount: number;
}

/** One parametric facet returned by a category-scoped search (Decision #238 Step 3).
 *  NOTE: facets name the parameter via `ParameterName` (the per-PRODUCT parameter uses
 *  `ParameterText` — same string content, different field). Each facet also carries its
 *  own `Category`, which is the reliable category key (the response product's nested
 *  Category walks ChildCategories[0] blindly and can miss the leaf). */
export interface DigikeyParametricFilter {
  ParameterId: number;
  ParameterName: string;
  ParameterType?: string;
  Category?: { Id: number; Value: string; ProductCount?: number | null };
  FilterValues: DigikeyFilterValue[];
}

export interface DigikeyKeywordResponse {
  Products: DigikeyProduct[];
  ProductsCount: number;
  ExactMatches: DigikeyProduct[];
  /** Faceted filter options — only populated when the request is category-scoped. */
  FilterOptions?: {
    ParametricFilters?: DigikeyParametricFilter[];
  };
}

export interface DigikeyProductDetailResponse {
  Product: DigikeyProduct;
}

export interface DigikeySearchOptions {
  limit?: number;
  offset?: number;
  categoryId?: number;
  /** Override the default request timeout. Only the category-facet discovery call needs this:
   *  it asks Digikey to aggregate an ENTIRE product category, which routinely takes longer than
   *  the 10 s default and then throws (see `digikeyFetch` — a timeout is NOT retried). */
  timeoutMs?: number;
}

// ============================================================
// CONFIG
// ============================================================

/**
 * Single source of truth for "is Digikey usable right now". Relocated here from
 * partDataService so the orchestrator's guards AND the Digikey provider adapter
 * share ONE predicate (the connector abstraction).
 *
 * `DIGIKEY_PROVIDER_DISABLED=1` is the kill-switch (Phase 6): the ONE gate every
 * Digikey guard already funnels through — all three engine entry points, both
 * deferred-island fetchers, the provider adapter's isConfigured (so the registry
 * drops Digikey from catalogProviders() and parametricProvider() returns null),
 * and the health / data-sources routes. There is deliberately NO second
 * registry-only disable check that could drift from this one. Read at CALL time,
 * so toggling the env var takes effect without a restart. Unset in production ⇒
 * identical to the plain creds check.
 */
export function isDigikeyConfigured(): boolean {
  if (process.env.DIGIKEY_PROVIDER_DISABLED === '1') return false;
  return !!(process.env.DIGIKEY_CLIENT_ID && process.env.DIGIKEY_CLIENT_SECRET);
}

// ============================================================
// TOKEN MANAGEMENT
// ============================================================

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getAccessToken(): Promise<string> {
  // Return cached token if still valid (with 30s safety buffer)
  if (cachedToken && Date.now() < tokenExpiresAt - 30_000) {
    return cachedToken;
  }

  const clientId = process.env.DIGIKEY_CLIENT_ID;
  const clientSecret = process.env.DIGIKEY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('DIGIKEY_CLIENT_ID and DIGIKEY_CLIENT_SECRET must be set');
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    signal: AbortSignal.timeout(10_000),
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Digikey OAuth failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in * 1000);

  return cachedToken!;
}

// ============================================================
// HTTP HELPER WITH RETRY
// ============================================================

function buildHeaders(token: string, currency?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
    'X-DIGIKEY-Client-Id': process.env.DIGIKEY_CLIENT_ID!,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  if (currency) {
    headers['X-DIGIKEY-Locale-Currency'] = currency;
  }
  return headers;
}

const DIGIKEY_TIMEOUT_MS = 10_000;

/** The category-facet discovery call asks Digikey to aggregate a whole category and is far
 *  slower than a normal search. At the 10 s default it timed out in 4 of 6 measured attempts —
 *  and a timeout is thrown, never retried (below) — so the caller silently got nothing. */
const DIGIKEY_FACETS_TIMEOUT_MS = 30_000;

async function digikeyFetch(url: string, options: RequestInit, currency?: string, timeoutMs?: number): Promise<Response> {
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs ?? DIGIKEY_TIMEOUT_MS) });
    } catch (error) {
      // Timeout or network error — don't retry, fail fast
      throw new Error(`Digikey request failed: ${error instanceof Error ? error.message : 'timeout'}`);
    }

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('Retry-After') ?? '2', 10);
      console.warn(`Digikey rate limit hit, retrying in ${retryAfter}s...`);
      await new Promise(r => setTimeout(r, retryAfter * 1000));
      continue;
    }

    if (res.status === 401) {
      // Token expired, clear cache and retry
      cachedToken = null;
      tokenExpiresAt = 0;
      if (attempt < MAX_RETRIES - 1) {
        const newToken = await getAccessToken();
        const headers = buildHeaders(newToken, currency);
        options = { ...options, headers };
        continue;
      }
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Digikey API error: ${res.status} ${text}`);
    }

    return res;
  }
  throw new Error('Digikey API failed after retries');
}

// ============================================================
// PRODUCT DETAILS CACHE
// ============================================================

const detailsCache = new Map<string, { data: DigikeyProductDetailResponse; timestamp: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// ============================================================
// PUBLIC API FUNCTIONS
// ============================================================

/** Search for parts by keyword/MPN */
export async function keywordSearch(
  keywords: string,
  options: DigikeySearchOptions = {},
  currency?: string,
  userId?: string,
): Promise<DigikeyKeywordResponse> {
  // performance.now() delta instead of console.time — fan-out fires several keywordSearch
  // calls concurrently, and a shared console.time label collides ("Label already exists").
  const t0 = performance.now();
  const token = await getAccessToken();

  const body = {
    Keywords: keywords,
    Limit: options.limit ?? 10,
    Offset: options.offset ?? 0,
    ...(options.categoryId ? {
      FilterOptionsRequest: {
        CategoryFilter: [{ Id: String(options.categoryId) }],
      },
    } : {}),
  };

  const res = await digikeyFetch(SEARCH_URL, {
    method: 'POST',
    headers: buildHeaders(token, currency),
    body: JSON.stringify(body),
  }, currency, options.timeoutMs);

  const data = await res.json();
  console.log(`[perf] digikey:keywordSearch ${(performance.now() - t0).toFixed(0)}ms`);

  if (userId) {
    await logApiCall({ userId, service: 'digikey', operation: 'keyword_search' });
  }

  return data;
}

/**
 * Parametric-filter widening — DISCOVER step (Decision #238 Step 3).
 *
 * A category-scoped keyword search whose response carries `FilterOptions.ParametricFilters`
 * (the available value facets for that category) — used to learn which discrete values exist
 * for a parameter (e.g. Zener Vz: "4.7 V", "5.1 V", "5.6 V", …) so a ±% band can select the
 * in-band ones. Returns BOTH the facets and the response products (the caller resolves the
 * param-map category from the products to match the right facet). Facets are only populated
 * when `categoryId` is supplied. Caller handles errors (returns empty on failure upstream).
 */
type CategoryFacets = { facets: DigikeyParametricFilter[]; products: DigikeyProduct[] };

/** L1 in-memory facet cache. Process-local, so a cold start still pays one L2 read. */
const facetCache = new Map<string, CategoryFacets>();

/** Bump when the cached shape changes. */
const FACETS_CACHE_VERSION = 'v1';
/** Catalogue STRUCTURE — the parameter names and the values that exist in a category — is a
 *  slowly-changing dimension. Products come and go, so `ProductCount` drifts, but we only use it
 *  to rank which values are mainstream, and that ordering is stable on a 30-day scale. This is
 *  catalogue structure, NOT pricing or stock, so persisting it does not violate the project's
 *  no-caching-commercial-data rule. */
const TTL_FACETS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The parametric facets (every filterable parameter and its possible values) for a category.
 *
 * ⚠️ THIS CALL IS THE SLOWEST THING WE ASK DIGIKEY FOR, and it used to be made fresh on EVERY
 * spec-driven search, with the default 10 s timeout, and a timeout is thrown-not-retried. Measured:
 * it failed 4 of 6 attempts. Both call sites swallowed the error (`.catch(() => null)`), so the
 * search silently fell back to a keyword-only pool — a user asking for a 30 V / 1-5 A MOSFET got
 * three obsolete parts and no indication that anything had gone wrong.
 *
 * Two fixes, both here: CACHE it (structure barely changes), and give it a timeout that fits the
 * work. The empty-keyword call — the one the greenfield fetch makes, covering the whole category —
 * is the only one cached; a keyword-scoped call is per-query and not worth persisting.
 */
/**
 * Strip price and stock before a facet product is retained or persisted.
 *
 * The facet cache's `products` exist ONLY to give the discover step a sample of the category's
 * parametric structure — `findFacetForAttribute` reads a product's `.Category` and `.Parameters`
 * and nothing else. Price/stock on these products is never read, and persisting it to the 30-day
 * L2 tier would violate the project's no-caching-commercial-data rule (Decision #158) and let a
 * future reader mistake a month-old number for live data. So the facet cache never holds it.
 */
function stripCommercialForFacetCache(products: DigikeyProduct[]): DigikeyProduct[] {
  return products.map(p => ({
    ...p,
    UnitPrice: 0,
    QuantityAvailable: 0,
    StandardPricing: undefined,
    ProductVariations: p.ProductVariations?.map(v => ({ ...v, StandardPricing: undefined })),
  }));
}

export async function getCategoryParametricFacets(
  keywords: string,
  categoryId: number,
  currency?: string,
  userId?: string,
): Promise<CategoryFacets> {
  const cacheable = keywords === '';
  const key = `${FACETS_CACHE_VERSION}:${categoryId}:${currency ?? 'USD'}`;

  if (cacheable) {
    const l1 = facetCache.get(key);
    if (l1) return l1;
    const l2 = await getCachedResponse<CategoryFacets>('digikey', `__facets__:${key}`, 'facets');
    if (l2?.data?.facets?.length) {
      facetCache.set(key, l2.data);
      return l2.data;
    }
  }

  const res = await keywordSearch(
    keywords,
    { limit: 1, categoryId, ...(cacheable ? { timeoutMs: DIGIKEY_FACETS_TIMEOUT_MS } : {}) },
    currency,
    userId,
  );
  const out: CategoryFacets = {
    facets: res.FilterOptions?.ParametricFilters ?? [],
    // Strip price/stock up front so nothing commercial reaches L1, L2, or the caller — the facet
    // products are read only for their parametric structure. See stripCommercialForFacetCache.
    products: stripCommercialForFacetCache([...(res.ExactMatches ?? []), ...(res.Products ?? [])]),
  };

  // Only cache a real answer. An empty facet list means the call came back useless; persisting
  // that would bake the outage in for 30 days.
  if (cacheable && out.facets.length > 0) {
    facetCache.set(key, out);
    setCachedResponse('digikey', `__facets__:${key}`, 'facets', 'parametric', out, TTL_FACETS_MS);
  }
  return out;
}

/**
 * Parametric-filter widening — APPLY step (Decision #238 Step 3).
 *
 * Fetch the parts in a category whose `parameterId` value is one of `valueIds`. `valueIds`
 * are the facet `ValueId` STRINGS from the discover step (proven: Digikey's apply filter keys
 * on the value string, e.g. "5.1 V", not a numeric id). Bounds the result to `limit`.
 */
export async function parametricFilterSearch(
  categoryId: number,
  parameterId: number,
  valueIds: string[],
  options: { limit?: number } = {},
  currency?: string,
  userId?: string,
): Promise<DigikeyKeywordResponse> {
  const t0 = performance.now();
  const token = await getAccessToken();

  const body = {
    Keywords: '',
    Limit: options.limit ?? 25,
    Offset: 0,
    FilterOptionsRequest: {
      ParameterFilterRequest: {
        CategoryFilter: { Id: String(categoryId) },
        ParameterFilters: [
          { ParameterId: parameterId, FilterValues: valueIds.map(id => ({ Id: id })) },
        ],
      },
    },
  };

  const res = await digikeyFetch(SEARCH_URL, {
    method: 'POST',
    headers: buildHeaders(token, currency),
    body: JSON.stringify(body),
  }, currency);

  const data = await res.json();
  console.log(`[perf] digikey:parametricFilterSearch ${(performance.now() - t0).toFixed(0)}ms`);

  if (userId) {
    await logApiCall({ userId, service: 'digikey', operation: 'parametric_filter_search' });
  }

  return data;
}

/** One parameter constraint for a multi-parameter parametric filter. `valueIds` are the
 *  facet `ValueId` STRINGS from the discover step (same encoding as `parametricFilterSearch`). */
export interface ParametricFilterSpec {
  parameterId: number;
  valueIds: string[];
}

/**
 * Multi-parameter variant of `parametricFilterSearch` — fetch the parts in a category that
 * satisfy ALL of `filters` at once. Digikey ANDs multiple `ParameterFilters` entries, so this
 * returns the intersection directly (no client-side join, no per-spec cap truncation). This is
 * the foundation of keyword-free greenfield spec search: instead of guessing a keyword, we ask
 * the catalog for the parts matching the user's actual specs. Empty `filters` → category-only
 * fetch. Bounds the result to `limit`.
 */
export async function parametricFilterSearchMulti(
  categoryId: number,
  filters: ParametricFilterSpec[],
  options: { limit?: number } = {},
  currency?: string,
  userId?: string,
): Promise<DigikeyKeywordResponse> {
  const t0 = performance.now();
  const token = await getAccessToken();

  const body = {
    Keywords: '',
    Limit: options.limit ?? 50,
    Offset: 0,
    FilterOptionsRequest: {
      ParameterFilterRequest: {
        CategoryFilter: { Id: String(categoryId) },
        ParameterFilters: filters.map(f => ({
          ParameterId: f.parameterId,
          FilterValues: f.valueIds.map(id => ({ Id: id })),
        })),
      },
    },
  };

  // Same 20-second reality as the facet discovery call: this is a category-wide parametric query,
  // not a keyword lookup, and Digikey takes its time. At the 10 s default it timed out and — since
  // `digikeyFetch` throws rather than retries on timeout — the caller silently got nothing and the
  // search fell back to a keyword-only pool. Measured: this is what still killed the MOSFET search
  // after the facet call was fixed. Unlike the facets, this result is per-query and NOT cached, so
  // it pays the latency every time; that is the cost of an accurate pool.
  const res = await digikeyFetch(SEARCH_URL, {
    method: 'POST',
    headers: buildHeaders(token, currency),
    body: JSON.stringify(body),
  }, currency, DIGIKEY_FACETS_TIMEOUT_MS);

  const data = await res.json();
  console.log(`[perf] digikey:parametricFilterSearchMulti ${(performance.now() - t0).toFixed(0)}ms (${filters.length} params)`);

  if (userId) {
    await logApiCall({ userId, service: 'digikey', operation: 'parametric_filter_search' });
  }

  return data;
}

/** Commercial fields extracted from a DigikeyProduct for short-TTL caching */
interface DigikeyCommercialData {
  UnitPrice: number;
  QuantityAvailable: number;
  ProductStatus: { Id: number; Status: string };
  StandardPricing?: DigikeyPriceBreak[];
  ProductVariations?: DigikeyProductVariation[];
}

/** Extract commercial fields from a DigikeyProduct */
function extractCommercial(product: DigikeyProduct): DigikeyCommercialData {
  return {
    UnitPrice: product.UnitPrice,
    QuantityAvailable: product.QuantityAvailable,
    ProductStatus: product.ProductStatus,
    StandardPricing: product.StandardPricing,
    ProductVariations: product.ProductVariations,
  };
}

/** Apply cached commercial data onto a cached DigikeyProduct */
function applyCommercial(product: DigikeyProduct, commercial: DigikeyCommercialData): DigikeyProduct {
  return {
    ...product,
    UnitPrice: commercial.UnitPrice,
    QuantityAvailable: commercial.QuantityAvailable,
    ProductStatus: commercial.ProductStatus,
    StandardPricing: commercial.StandardPricing,
    ProductVariations: commercial.ProductVariations,
  };
}

/** Get detailed product information including all parametric specs */
export async function getProductDetails(
  productNumber: string,
  currency?: string,
  userId?: string,
): Promise<DigikeyProductDetailResponse> {
  // --- L1: in-memory cache ---
  const cacheKey = currency ? `${productNumber}__${currency}` : productNumber;
  const cached = detailsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log('[perf] digikey:getProductDetails L1 HIT');
    return cached.data;
  }

  // --- L2: Supabase persistent cache ---
  const currencyKey = currency ?? 'USD';
  const l2Parametric = await getCachedResponse<DigikeyProduct>('digikey', productNumber, 'parametric');

  if (l2Parametric) {
    // Parametric hit — check commercial freshness for this currency
    const l2Commercial = await getCachedResponse<DigikeyCommercialData>(
      'digikey', productNumber, `commercial:${currencyKey}`,
    );

    if (l2Commercial) {
      // Full L2 hit — reconstruct from cache, no API call needed
      console.log('[perf] digikey:getProductDetails L2 HIT (parametric + commercial)');
      const product = applyCommercial(l2Parametric.data, l2Commercial.data);
      const data: DigikeyProductDetailResponse = { Product: product };

      // Promote to L1
      detailsCache.set(cacheKey, { data, timestamp: Date.now() });
      return data;
    }

    // Parametric hit but commercial stale — fetch fresh from API
    console.log('[perf] digikey:getProductDetails L2 PARTIAL (parametric hit, commercial miss)');
  }

  // --- L3: Live API call ---
  console.time('[perf] digikey:getProductDetails');
  const token = await getAccessToken();

  const res = await digikeyFetch(
    `${DETAILS_URL}/${encodeURIComponent(productNumber)}/productdetails`,
    {
      method: 'GET',
      headers: buildHeaders(token, currency),
    },
    currency,
  );

  const data: DigikeyProductDetailResponse = await res.json();
  console.timeEnd('[perf] digikey:getProductDetails');

  // Store in L1
  detailsCache.set(cacheKey, { data, timestamp: Date.now() });
  if (detailsCache.size > 200) {
    const oldestKey = detailsCache.keys().next().value;
    if (oldestKey) detailsCache.delete(oldestKey);
  }

  // Store in L2 (fire-and-forget)
  const product = data.Product;
  if (product) {
    // Parametric: full product (indefinite TTL)
    setCachedResponse('digikey', productNumber, 'parametric', 'parametric', product, TTL_PARAMETRIC_DIGIKEY);
    // Commercial: pricing/stock extract (24h TTL)
    setCachedResponse('digikey', productNumber, `commercial:${currencyKey}`, 'commercial', extractCommercial(product), TTL_COMMERCIAL_MS);
  }

  if (userId) {
    await logApiCall({ userId, service: 'digikey', operation: 'product_details' });
  }

  return data;
}

/**
 * Warm the L2 cache from keyword search results. Fire-and-forget.
 * Stores each product's parametric data to L2 so future getProductDetails() calls
 * for those MPNs will be cache hits.
 */
export function warmCacheFromSearchResults(products: DigikeyProduct[]): void {
  if (products.length === 0) return;

  const entries = products
    .filter(p => p.ManufacturerProductNumber)
    .map(p => ({ mpn: p.ManufacturerProductNumber, data: p as unknown }));

  setCachedResponseBatch('digikey', entries, 'parametric', 'parametric', TTL_PARAMETRIC_DIGIKEY);
}

// ============================================================
// CATEGORIES
// ============================================================

let categoriesCache: { data: DigikeyCategory[]; timestamp: number } | null = null;
const CATEGORIES_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/** Fetch the full product category taxonomy from Digikey */
export async function getCategories(): Promise<DigikeyCategory[]> {
  if (categoriesCache && Date.now() - categoriesCache.timestamp < CATEGORIES_CACHE_TTL) {
    return categoriesCache.data;
  }

  const token = await getAccessToken();
  const res = await digikeyFetch(CATEGORIES_URL, {
    method: 'GET',
    headers: buildHeaders(token),
  });

  const data = await res.json();

  // The API may return children as "Children" or "ChildCategories" — normalize
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function normalize(cat: any): DigikeyCategory {
    const children = cat.ChildCategories ?? cat.Children ?? [];
    return {
      CategoryId: cat.CategoryId,
      Name: cat.Name,
      ProductCount: cat.ProductCount ?? 0,
      ChildCategories: children.map(normalize),
    };
  }

  const categories: DigikeyCategory[] = (data.Categories ?? data).map(normalize);
  categoriesCache = { data: categories, timestamp: Date.now() };
  return categories;
}

// ============================================================
// HEALTH CHECK
// ============================================================

import type { ServiceStatusInfo } from '@/lib/types';

export async function checkDigikeyHealth(): Promise<ServiceStatusInfo> {
  const now = new Date().toISOString();
  try {
    // Route through the single gate so the health probe honors the kill-switch
    // (DIGIKEY_PROVIDER_DISABLED) as well as absent credentials — and never pings
    // Digikey when it's disabled.
    if (!isDigikeyConfigured()) {
      return { service: 'digikey', status: 'unavailable', message: 'Not configured or disabled', lastChecked: now };
    }
    // Use cached token if valid; otherwise attempt OAuth handshake
    await getAccessToken();
    return { service: 'digikey', status: 'operational', lastChecked: now };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return { service: 'digikey', status: 'unavailable', message: msg, lastChecked: now };
  }
}
