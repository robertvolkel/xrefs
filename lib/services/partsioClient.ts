/**
 * Parts.io (SiliconExpert/IHS) API Client
 *
 * Fetches parametric data for component enrichment after Digikey.
 * API key auth (query param), limit=10 with best-record selection.
 * All functions are server-side only (uses process.env).
 */

const BASE_URL = 'http://api.qa.parts.io/solr/partsio/listings';

// ============================================================
// RESPONSE TYPES
// ============================================================

export interface PartsioResponse {
  metadata: {
    queryTime: string;
    numberOfMatches: number;
    requestData: Record<string, string>;
  };
  response: PartsioListing[];
}

export interface PartsioListing {
  uid: number;
  'Manufacturer Part Number': string;
  Manufacturer: string;
  Description: string;
  'Status Code': string;
  'Part Life Cycle Code': string;
  Class: string;
  Category: string;
  Completeness?: number;
  'Current Datasheet Url'?: string;
  'Risk Rank'?: number;
  YTEOL?: string;
  'FFF Equivalent'?: unknown[];
  'Functional Equivalent'?: unknown[];
  [key: string]: unknown;
}

// ============================================================
// CONFIGURATION
// ============================================================

export function isPartsioConfigured(): boolean {
  return !!process.env.PARTSIO_API_KEY;
}

// ============================================================
// IN-MEMORY CACHE (30-min TTL)
// ============================================================

interface CacheEntry {
  listing: PartsioListing | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30 * 60 * 1000;

function getCached(mpn: string): PartsioListing | null | undefined {
  const entry = cache.get(mpn.toLowerCase());
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(mpn.toLowerCase());
    return undefined;
  }
  return entry.listing;
}

function setCache(mpn: string, listing: PartsioListing | null): void {
  cache.set(mpn.toLowerCase(), { listing, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ============================================================
// BEST-RECORD SELECTION
// ============================================================

/** Metadata fields that don't count as parametric data */
const METADATA_FIELDS = new Set([
  'uid', 'Manufacturer Part Number', 'Manufacturer', 'Description',
  'Status Code', 'Part Life Cycle Code', 'Class', 'Category',
  'Completeness', 'Current Datasheet Url', 'Risk Rank', 'YTEOL',
  'FFF Equivalent', 'Functional Equivalent', 'Compliance',
  'IHS Mfr ID', 'Part Region', 'Part Number Region',
  'Essentials Only', 'Pin Count', 'Package Style',
]);

/** Count parametric (non-metadata) fields on a listing */
function countParametricFields(listing: PartsioListing): number {
  let count = 0;
  for (const key of Object.keys(listing)) {
    if (!METADATA_FIELDS.has(key) && listing[key] != null && listing[key] !== '') {
      count++;
    }
  }
  return count;
}

/**
 * Select the most complete record from multiple manufacturer listings.
 * Prefers Completeness score; falls back to parametric field count.
 * Active lifecycle preferred over Obsolete when scores tie.
 */
export function selectBestRecord(listings: PartsioListing[]): PartsioListing | null {
  if (listings.length === 0) return null;
  if (listings.length === 1) return listings[0];

  return listings.reduce((best, current) => {
    const bestScore = best.Completeness ?? countParametricFields(best);
    const currentScore = current.Completeness ?? countParametricFields(current);

    if (currentScore > bestScore) return current;
    if (currentScore === bestScore) {
      // Prefer Active lifecycle on tie
      const bestActive = best['Part Life Cycle Code'] === 'Active';
      const currentActive = current['Part Life Cycle Code'] === 'Active';
      if (currentActive && !bestActive) return current;
    }
    return best;
  });
}

// ============================================================
// API FETCH WITH RETRY
// ============================================================

async function partsioFetch(url: string): Promise<Response> {
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const res = await fetch(url);

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('Retry-After') ?? '2', 10);
      console.warn(`Parts.io rate limit hit, retrying in ${retryAfter}s...`);
      await new Promise(r => setTimeout(r, retryAfter * 1000));
      continue;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Parts.io API error: ${res.status} ${text}`);
    }

    return res;
  }
  throw new Error('Parts.io API failed after retries');
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Fetch the most complete parts.io listing for an MPN.
 * Returns null if not found, not configured, or on error.
 */
export async function getPartsioProductDetails(mpn: string): Promise<PartsioListing | null> {
  if (!isPartsioConfigured()) return null;

  // Check cache
  const cached = getCached(mpn);
  if (cached !== undefined) return cached;

  try {
    const apiKey = process.env.PARTSIO_API_KEY!;
    const params = new URLSearchParams({
      api_key: apiKey,
      exactMatch: 'true',
      limit: '10',
      facets: 'false',
      'Manufacturer Part Number': mpn,
    });

    const url = `${BASE_URL}?${params.toString()}`;
    const res = await partsioFetch(url);
    const data: PartsioResponse = await res.json();

    if (!data.response || data.response.length === 0) {
      setCache(mpn, null);
      return null;
    }

    const best = selectBestRecord(data.response);
    setCache(mpn, best);
    return best;
  } catch (error) {
    console.warn('Parts.io lookup failed for', mpn, error);
    return null;
  }
}
