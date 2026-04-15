/**
 * FindChips (FC) API Client
 *
 * Aggregated distributor pricing, stock, lifecycle, and risk data.
 * Single GET call returns results from ~80 distributors (Digikey, Mouser,
 * Arrow, LCSC, Farnell, RS, TME, etc.). Replaces per-distributor Mouser
 * integration for commercial data.
 *
 * API key auth (query param). All functions are server-side only.
 *
 * Decision #129: FC API replaces Mouser for pricing/stock/lifecycle.
 * Mouser retained solely for SuggestedReplacement lookups (Decision #97).
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

const BASE_URL = 'https://api.findchips.com/v1/fcl-search';

// ============================================================
// RESPONSE TYPES
// ============================================================

export interface FCPrice {
  quantity: number;
  price: number;
  currency: string;
}

export interface FCPart {
  manufacturer: string;
  part: string;
  distributorItemNo?: string;
  description?: string;
  price: FCPrice[];
  buyNowUrl?: string;
  stock: number;
  stockIndicator?: string;
  pbFree?: string;
  rohs?: Record<string, string>;   // e.g., { DEFAULT: "Compliant" }
  custom?: Record<string, string>;  // e.g., { COO: "United States" }
  lastUpdated?: string;
  minimumQuantity?: number;
  packageType?: string;             // "Cut Tape", "Reel", "Each"
  imageUrl?: string;
  mfrId?: string;
  zeroStockTier?: number;
  partLifecycleCode?: string;       // "active", "obsolete", "not_recommended", "transferred"
  mfrPackageCode?: string;
  riskRank?: number;
  rohsSource?: string;
  fuid?: string;
  designRisk?: number;
  productionRisk?: number;
  longTermRisk?: number;
  leadTime?: string;
  rfqUrl?: string;
  dateCode?: string;
  packageMultiple?: number;
}

export interface FCDistributor {
  id: number;
  name: string;
  authorized: boolean;
  logoUrl?: string;
}

export interface FCDistributorResult {
  distributor: FCDistributor;
  parts: FCPart[];
}

interface FCMetadata {
  version: string;
  queryTime: string;
  timeStamp: string;
  lastModified: string;
  message: string;
  numberOfMatches: number;
  requestData?: Record<string, unknown>;
}

interface FCSearchResponse {
  metadata: FCMetadata;
  response: FCDistributorResult[];
}

// ============================================================
// CONFIGURATION
// ============================================================

export function isFindchipsConfigured(): boolean {
  return !!process.env.FINDCHIPS_API_KEY;
}

// ============================================================
// IN-MEMORY L1 CACHE (30-min TTL)
// ============================================================

interface CacheEntry {
  results: FCDistributorResult[] | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30 * 60 * 1000;

function getCached(mpn: string): FCDistributorResult[] | null | undefined {
  const entry = cache.get(mpn.toLowerCase());
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(mpn.toLowerCase());
    return undefined;
  }
  return entry.results;
}

function setCache(mpn: string, results: FCDistributorResult[] | null): void {
  cache.set(mpn.toLowerCase(), { results, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ============================================================
// RATE LIMITER (60/min, 5000/day — adjust based on FC API docs)
// ============================================================

const PER_MINUTE_CAP = 60;
const DAILY_CAP = 5000;

let callsThisMinute = 0;
let callsToday = 0;
let minuteResetAt = Date.now() + 60_000;
let dayResetAt = getStartOfNextDay();

function getStartOfNextDay(): number {
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return tomorrow.getTime();
}

/** Check if daily FindChips API budget is available. */
export function hasFindchipsBudget(): boolean {
  if (Date.now() > dayResetAt) {
    callsToday = 0;
    dayResetAt = getStartOfNextDay();
  }
  return callsToday < DAILY_CAP;
}

/** Get remaining daily API calls (for admin status display). */
export function getFindchipsDailyRemaining(): number {
  if (Date.now() > dayResetAt) {
    callsToday = 0;
    dayResetAt = getStartOfNextDay();
  }
  return Math.max(0, DAILY_CAP - callsToday);
}

/** Acquire a rate-limit slot. Waits if per-minute cap reached. */
async function acquireRateSlot(): Promise<boolean> {
  const now = Date.now();
  if (now > dayResetAt) {
    callsToday = 0;
    dayResetAt = getStartOfNextDay();
  }
  if (callsToday >= DAILY_CAP) return false;

  if (now > minuteResetAt) {
    callsThisMinute = 0;
    minuteResetAt = now + 60_000;
  }
  if (callsThisMinute >= PER_MINUTE_CAP) {
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
// API FETCH
// ============================================================

const FC_TIMEOUT_MS = 10_000;

async function fcFetch(mpn: string, exactMatch: boolean = true): Promise<FCSearchResponse> {
  const apiKey = process.env.FINDCHIPS_API_KEY!;
  const params = new URLSearchParams({
    part: mpn,
    apiKey,
    hostedOnly: 'true',
  });
  if (exactMatch) params.set('exactMatch', 'true');

  const url = `${BASE_URL}?${params.toString()}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FC_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`FindChips API ${res.status}: ${res.statusText}`);
  }

  return res.json() as Promise<FCSearchResponse>;
}

// ============================================================
// PUBLIC API — Single MPN
// ============================================================

/**
 * Fetch FindChips results for a single MPN.
 * Returns array of distributor results, or null if not found / unavailable.
 * Uses 3-level cache: L1 in-memory → L2 Supabase → L3 live API.
 */
export async function getFindchipsResults(
  mpn: string,
  userId?: string,
): Promise<FCDistributorResult[] | null> {
  if (!isFindchipsConfigured()) return null;

  const mpnLower = mpn.toLowerCase();

  // L1: In-memory cache
  const l1 = getCached(mpnLower);
  if (l1 !== undefined) return l1;

  // L2: Supabase persistent cache
  try {
    const l2 = await getCachedResponse<FCDistributorResult[] | typeof NOT_FOUND_SENTINEL>(
      'findchips', mpnLower, 'fc-results',
    );
    if (l2) {
      if (isNotFoundSentinel(l2.data)) {
        setCache(mpnLower, null);
        return null;
      }
      setCache(mpnLower, l2.data as FCDistributorResult[]);
      return l2.data as FCDistributorResult[];
    }
  } catch { /* L2 miss — proceed to API */ }

  // L3: Live API
  if (!hasFindchipsBudget()) {
    console.warn('[findchips] Daily budget exhausted — skipping');
    return null;
  }

  const slotAcquired = await acquireRateSlot();
  if (!slotAcquired) return null;

  const startMs = Date.now();
  try {
    const response = await fcFetch(mpn);
    const elapsedMs = Date.now() - startMs;

    if (userId) {
      logApiCall({ userId, service: 'findchips', operation: 'batch_search' }).catch(() => {});
    }

    const results = response.response;
    const hasResults = results && results.length > 0 &&
      results.some(r => r.parts && r.parts.length > 0);

    if (hasResults) {
      setCache(mpnLower, results);
      setCachedResponse('findchips', mpnLower, 'fc-results', 'commercial', results, TTL_COMMERCIAL_MS);
      return results;
    } else {
      setCache(mpnLower, null);
      setCachedResponse('findchips', mpnLower, 'fc-results', 'commercial', NOT_FOUND_SENTINEL, TTL_NOT_FOUND_MS);
      return null;
    }
  } catch (err) {
    console.error('[findchips] API error:', err instanceof Error ? err.message : err);
    return null;
  }
}

// ============================================================
// PUBLIC API — Batch MPNs
// ============================================================

const BATCH_CONCURRENCY = 5;

/**
 * Fetch FindChips results for multiple MPNs in parallel.
 * Uses individual API calls with concurrency limiting (FC has no batch endpoint).
 * Returns Map of lowercase MPN → distributor results.
 */
export async function getFindchipsResultsBatch(
  mpns: string[],
  userId?: string,
): Promise<Map<string, FCDistributorResult[]>> {
  const results = new Map<string, FCDistributorResult[]>();
  if (!isFindchipsConfigured() || mpns.length === 0) return results;

  const uncached: string[] = [];

  // Check L1 cache first
  for (const mpn of mpns) {
    const l1 = getCached(mpn);
    if (l1 !== undefined) {
      if (l1) results.set(mpn.toLowerCase(), l1);
    } else {
      uncached.push(mpn);
    }
  }

  if (uncached.length === 0) return results;

  // Check L2 cache for remaining
  try {
    const l2Results = await getCachedResponseBatch<FCDistributorResult[] | typeof NOT_FOUND_SENTINEL>(
      'findchips', uncached, 'fc-results',
    );
    const stillUncached: string[] = [];
    for (const mpn of uncached) {
      const l2 = l2Results.get(mpn.toLowerCase());
      if (l2) {
        if (!isNotFoundSentinel(l2)) {
          const data = l2 as FCDistributorResult[];
          results.set(mpn.toLowerCase(), data);
          setCache(mpn, data);
        } else {
          setCache(mpn, null);
        }
      } else {
        stillUncached.push(mpn);
      }
    }
    uncached.length = 0;
    uncached.push(...stillUncached);
  } catch { /* L2 miss — proceed to API */ }

  if (uncached.length === 0) return results;

  // L3: Concurrent API calls with limiter
  const chunks: string[][] = [];
  for (let i = 0; i < uncached.length; i += BATCH_CONCURRENCY) {
    chunks.push(uncached.slice(i, i + BATCH_CONCURRENCY));
  }

  for (const chunk of chunks) {
    const promises = chunk.map(async (mpn) => {
      const r = await getFindchipsResults(mpn, userId);
      if (r) results.set(mpn.toLowerCase(), r);
    });
    await Promise.all(promises);
  }

  return results;
}
