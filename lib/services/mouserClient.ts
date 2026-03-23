/**
 * Mouser Electronics API Client
 *
 * Fetches commercial data (pricing, availability, lifecycle, compliance)
 * for component enrichment. API key auth (query param), batch up to 10 MPNs.
 * All functions are server-side only (uses process.env).
 *
 * NOTE: Mouser provides NO parametric attribute data — only packaging metadata.
 * This client is purely for commercial intelligence (Pillar 2) and compliance (Pillar 3).
 */

import { logApiCall } from './apiUsageLogger';
import {
  getCachedResponse,
  getCachedResponseBatch,
  setCachedResponse,
  isNotFoundSentinel,
  NOT_FOUND_SENTINEL,
  TTL_COMMERCIAL_MS,
  TTL_NOT_FOUND_MS,
} from './partDataCache';

const BASE_URL = 'https://api.mouser.com/api/v1/search/partnumber';

// ============================================================
// RESPONSE TYPES
// ============================================================

export interface MouserPriceBreak {
  Quantity: number;
  Price: string;      // e.g., "$0.73", "€0,56"
  Currency: string;   // e.g., "USD", "EUR"
}

export interface MouserAvailabilityOnOrder {
  Quantity: number;
  Date: string;       // ISO-ish datetime
}

export interface MouserProductCompliance {
  ComplianceName: string;   // e.g., "USHTS", "CNHTS", "TARIC", "ECCN"
  ComplianceValue: string;
}

export interface MouserAlternatePackaging {
  APMfrPN: string;
}

export interface MouserProduct {
  MouserPartNumber: string;
  ManufacturerPartNumber: string;
  Manufacturer: string;
  Description: string;
  Category: string;
  DataSheetUrl?: string;
  ImagePath?: string;
  ProductDetailUrl?: string;
  // Availability
  Availability?: string;
  AvailabilityInStock?: string | null;
  AvailableOnOrder?: string;
  AvailabilityOnOrder?: MouserAvailabilityOnOrder[];
  FactoryStock?: string;
  LeadTime?: string;
  // Lifecycle
  LifecycleStatus?: string | null;
  IsDiscontinued?: string;
  SuggestedReplacement?: string;
  // Pricing
  PriceBreaks: MouserPriceBreak[];
  // Ordering
  Min?: string;
  Mult?: string;
  Reeling?: boolean;
  AlternatePackagings?: MouserAlternatePackaging[] | null;
  // Compliance
  ROHSStatus?: string;
  ProductCompliance?: MouserProductCompliance[];
  // Other
  UnitWeightKg?: { UnitWeight: number };
  InfoMessages?: string[];
  RestrictionMessage?: string;
}

export interface MouserSearchResponse {
  Errors: Array<{ Id: number; Code: string; Message: string; ResourceKey: string; ResourceFormatString: string; PropertyName: string }>;
  SearchResults: {
    NumberOfResult: number;
    Parts: MouserProduct[];
  };
}

// ============================================================
// CONFIGURATION
// ============================================================

export function isMouserConfigured(): boolean {
  return !!process.env.MOUSER_API_KEY;
}

// ============================================================
// IN-MEMORY CACHE (30-min TTL)
// ============================================================

interface CacheEntry {
  product: MouserProduct | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30 * 60 * 1000;

function getCached(mpn: string): MouserProduct | null | undefined {
  const entry = cache.get(mpn.toLowerCase());
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(mpn.toLowerCase());
    return undefined;
  }
  return entry.product;
}

function setCache(mpn: string, product: MouserProduct | null): void {
  cache.set(mpn.toLowerCase(), { product, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ============================================================
// RATE LIMITER (30/min, 1000/day)
// ============================================================

let callsThisMinute = 0;
let callsToday = 0;
let minuteResetAt = Date.now() + 60_000;
let dayResetAt = getStartOfNextDay();

function getStartOfNextDay(): number {
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return tomorrow.getTime();
}

/**
 * Check if daily Mouser API budget is available.
 * Returns false when daily cap (950) reached — callers should skip gracefully.
 */
export function hasMouserBudget(): boolean {
  if (Date.now() > dayResetAt) {
    callsToday = 0;
    dayResetAt = getStartOfNextDay();
  }
  return callsToday < 950;
}

/** Get remaining daily API calls (for admin status display) */
export function getMouserDailyRemaining(): number {
  if (Date.now() > dayResetAt) {
    callsToday = 0;
    dayResetAt = getStartOfNextDay();
  }
  return Math.max(0, 950 - callsToday);
}

/**
 * Acquire a rate-limit slot. Waits if per-minute cap reached.
 * Returns false if daily cap exhausted (caller should skip).
 */
async function acquireRateSlot(): Promise<boolean> {
  const now = Date.now();
  if (now > dayResetAt) {
    callsToday = 0;
    dayResetAt = getStartOfNextDay();
  }
  if (callsToday >= 950) return false;

  if (now > minuteResetAt) {
    callsThisMinute = 0;
    minuteResetAt = now + 60_000;
  }
  if (callsThisMinute >= 28) {
    // Wait for minute window to reset
    const waitMs = minuteResetAt - Date.now() + 100;
    if (waitMs > 0) {
      await new Promise(r => setTimeout(r, waitMs));
    }
    callsThisMinute = 0;
    minuteResetAt = Date.now() + 60_000;
  }

  callsThisMinute++;
  callsToday++;
  return true;
}

// ============================================================
// API FETCH WITH RETRY
// ============================================================

async function mouserFetch(mpnQuery: string): Promise<MouserSearchResponse> {
  const apiKey = process.env.MOUSER_API_KEY!;
  const url = `${BASE_URL}?apiKey=${encodeURIComponent(apiKey)}`;

  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        SearchByPartRequest: {
          mouserPartNumber: mpnQuery,
        },
      }),
    });

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('Retry-After') ?? '3', 10);
      console.warn(`[mouser] Rate limit hit, retrying in ${retryAfter}s...`);
      await new Promise(r => setTimeout(r, retryAfter * 1000));
      continue;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Mouser API error: ${res.status} ${text}`);
    }

    return await res.json();
  }
  throw new Error('Mouser API failed after retries');
}

// ============================================================
// BEST-MATCH SELECTION
// ============================================================

/**
 * Select the best Mouser product for a given MPN from search results.
 * Prefers exact MPN match, then in-stock, then most price breaks.
 */
function selectBestProduct(products: MouserProduct[], targetMpn: string): MouserProduct | null {
  if (products.length === 0) return null;

  const targetLower = targetMpn.toLowerCase();

  // Exact MPN matches only
  const exactMatches = products.filter(
    p => p.ManufacturerPartNumber.toLowerCase() === targetLower,
  );

  const candidates = exactMatches.length > 0 ? exactMatches : products;

  // Score: prefer in-stock + most price breaks
  return candidates.reduce((best, current) => {
    const bestStock = parseInt(best.AvailabilityInStock ?? '0', 10) || 0;
    const currentStock = parseInt(current.AvailabilityInStock ?? '0', 10) || 0;
    const bestHasStock = bestStock > 0;
    const currentHasStock = currentStock > 0;

    if (currentHasStock && !bestHasStock) return current;
    if (!currentHasStock && bestHasStock) return best;

    // Both in-stock or both out — prefer more price breaks
    if (current.PriceBreaks.length > best.PriceBreaks.length) return current;
    // Tie: prefer higher stock
    if (currentStock > bestStock) return current;
    return best;
  });
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Fetch Mouser product details for a single MPN.
 * Returns null if not found, not configured, rate limited, or on error.
 */
export async function getMouserProduct(mpn: string, userId?: string): Promise<MouserProduct | null> {
  if (!isMouserConfigured()) return null;

  // --- L1: in-memory cache ---
  const cached = getCached(mpn);
  if (cached !== undefined) return cached;

  // --- L2: Supabase persistent cache (saves rate limit!) ---
  const l2 = await getCachedResponse<MouserProduct | typeof NOT_FOUND_SENTINEL>('mouser', mpn, 'commercial');
  if (l2) {
    if (isNotFoundSentinel(l2.data)) {
      console.log('[perf] mouser:getProduct L2 HIT (not found)');
      setCache(mpn, null);
      return null;
    }
    console.log('[perf] mouser:getProduct L2 HIT');
    const product = l2.data as MouserProduct;
    setCache(mpn, product); // Promote to L1
    return product;
  }

  // --- L3: Live API call (rate limited) ---
  const hasSlot = await acquireRateSlot();
  if (!hasSlot) {
    console.warn('[mouser] Daily rate limit reached, skipping', mpn);
    return null;
  }

  try {
    const data = await mouserFetch(mpn);

    if (data.Errors?.length > 0) {
      console.warn('[mouser] API errors:', data.Errors);
    }

    const parts = data.SearchResults?.Parts ?? [];
    if (parts.length === 0) {
      setCache(mpn, null);
      setCachedResponse('mouser', mpn, 'commercial', 'commercial', NOT_FOUND_SENTINEL, TTL_NOT_FOUND_MS);
      return null;
    }

    if (userId) {
      await logApiCall({ userId, service: 'mouser', operation: 'batch_search' });
    }

    const best = selectBestProduct(parts, mpn);
    setCache(mpn, best);
    if (best) {
      setCachedResponse('mouser', mpn, 'commercial', 'commercial', best, TTL_COMMERCIAL_MS);
    }
    return best;
  } catch (error) {
    console.warn('[mouser] Lookup failed for', mpn, error);
    return null;
  }
}

/**
 * Fetch Mouser product details for multiple MPNs in batch.
 * Chunks into groups of 10 (Mouser API limit). Returns Map keyed by MPN (lowercased).
 * Checks cache first; only sends uncached MPNs to API.
 */
export async function getMouserProductsBatch(
  mpns: string[],
  userId?: string,
): Promise<Map<string, MouserProduct>> {
  const results = new Map<string, MouserProduct>();
  if (!isMouserConfigured() || mpns.length === 0) return results;

  // --- L1: separate cached from uncached ---
  const afterL1: string[] = [];
  for (const mpn of mpns) {
    const cached = getCached(mpn);
    if (cached !== undefined) {
      if (cached) results.set(mpn.toLowerCase(), cached);
    } else {
      afterL1.push(mpn);
    }
  }

  if (afterL1.length === 0) return results;

  // --- L2: batch check Supabase persistent cache ---
  const l2Results = await getCachedResponseBatch<MouserProduct | typeof NOT_FOUND_SENTINEL>(
    'mouser', afterL1, 'commercial',
  );

  const afterL2: string[] = [];
  for (const mpn of afterL1) {
    const l2Data = l2Results.get(mpn.toLowerCase());
    if (l2Data !== undefined) {
      if (isNotFoundSentinel(l2Data)) {
        setCache(mpn, null); // Promote not-found to L1
      } else {
        const product = l2Data as MouserProduct;
        results.set(mpn.toLowerCase(), product);
        setCache(mpn, product); // Promote to L1
      }
    } else {
      afterL2.push(mpn);
    }
  }

  if (afterL2.length > 0) {
    console.log(`[perf] mouser:batch L1=${mpns.length - afterL1.length} L2=${afterL1.length - afterL2.length} API=${afterL2.length}`);
  }

  if (afterL2.length === 0) return results;

  // --- L3: Live API calls for truly uncached MPNs ---
  let apiCallCount = 0;
  const BATCH_SIZE = 10;
  const chunks: string[][] = [];
  for (let i = 0; i < afterL2.length; i += BATCH_SIZE) {
    chunks.push(afterL2.slice(i, i + BATCH_SIZE));
  }

  for (const chunk of chunks) {
    const hasSlot = await acquireRateSlot();
    if (!hasSlot) {
      console.warn('[mouser] Daily rate limit reached during batch, processed', results.size, 'of', mpns.length);
      for (const mpn of chunk) setCache(mpn, null);
      break;
    }

    try {
      const query = chunk.join('|');
      const data = await mouserFetch(query);
      const parts = data.SearchResults?.Parts ?? [];

      for (const targetMpn of chunk) {
        const targetLower = targetMpn.toLowerCase();
        const matches = parts.filter(
          p => p.ManufacturerPartNumber.toLowerCase() === targetLower,
        );

        if (matches.length > 0) {
          const best = selectBestProduct(matches, targetMpn);
          if (best) {
            results.set(targetLower, best);
            setCache(targetMpn, best);
            setCachedResponse('mouser', targetMpn, 'commercial', 'commercial', best, TTL_COMMERCIAL_MS);
          } else {
            setCache(targetMpn, null);
            setCachedResponse('mouser', targetMpn, 'commercial', 'commercial', NOT_FOUND_SENTINEL, TTL_NOT_FOUND_MS);
          }
        } else {
          setCache(targetMpn, null);
          setCachedResponse('mouser', targetMpn, 'commercial', 'commercial', NOT_FOUND_SENTINEL, TTL_NOT_FOUND_MS);
        }
      }
      if (userId) {
        apiCallCount++;
      }
    } catch (error) {
      console.warn('[mouser] Batch lookup failed for chunk:', chunk, error);
      for (const mpn of chunk) setCache(mpn, null);
    }
  }

  if (userId && apiCallCount > 0) {
    await logApiCall({ userId, service: 'mouser', operation: 'batch_search', requestCount: apiCallCount });
  }

  return results;
}

/**
 * Extract manufacturer MPN from Mouser's SuggestedReplacement field.
 * Mouser format: "595-SN74HCT04N" (numeric prefix + hyphen + manufacturer MPN).
 * Returns null if input is empty or cannot be resolved.
 */
export function resolveMouserSuggestedMpn(mouserPartNumber: string, sourceMpn?: string): string | null {
  if (!mouserPartNumber || !mouserPartNumber.trim()) return null;

  const trimmed = mouserPartNumber.trim();

  // Strip Mouser's numeric manufacturer prefix (e.g., "595-" from "595-SN74HCT04N")
  const stripped = trimmed.replace(/^\d{2,4}-/, '');
  const resolved = stripped || trimmed; // If regex removed everything, use original

  // Skip self-references
  if (sourceMpn && resolved.toLowerCase() === sourceMpn.toLowerCase()) return null;

  return resolved;
}
