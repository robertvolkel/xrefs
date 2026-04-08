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

export interface DigikeyKeywordResponse {
  Products: DigikeyProduct[];
  ProductsCount: number;
  ExactMatches: DigikeyProduct[];
}

export interface DigikeyProductDetailResponse {
  Product: DigikeyProduct;
}

export interface DigikeySearchOptions {
  limit?: number;
  offset?: number;
  categoryId?: number;
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

async function digikeyFetch(url: string, options: RequestInit, currency?: string): Promise<Response> {
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { ...options, signal: AbortSignal.timeout(DIGIKEY_TIMEOUT_MS) });
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
  console.time('[perf] digikey:keywordSearch');
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
  }, currency);

  const data = await res.json();
  console.timeEnd('[perf] digikey:keywordSearch');

  if (userId) {
    await logApiCall({ userId, service: 'digikey', operation: 'keyword_search' });
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
    if (!process.env.DIGIKEY_CLIENT_ID || !process.env.DIGIKEY_CLIENT_SECRET) {
      return { service: 'digikey', status: 'unavailable', message: 'Not configured', lastChecked: now };
    }
    // Use cached token if valid; otherwise attempt OAuth handshake
    await getAccessToken();
    return { service: 'digikey', status: 'operational', lastChecked: now };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return { service: 'digikey', status: 'unavailable', message: msg, lastChecked: now };
  }
}
