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
  getCachedResponseBatch,
  setCachedResponse,
  TTL_LIFECYCLE_MS,
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
// SITE / STRATEGY TYPES
// ============================================================
// FC API has two upstream sources: 'fc' (franchised distributors — Digikey,
// Mouser, Arrow, etc.) and 'oems' (independent distributors — surfaces the
// oemstrade.com inventory, where Chinese distributors and brokers tend to
// appear). OEMS is gated behind a quality filter (caller chooses), not a
// budget filter — the API has no per-call cost.

export type FcSite = 'fc' | 'oems';

export type FcFetchSource =
  | 'fc'                         // FC only (default — preserves prior behavior)
  | 'oems'                       // OEMS only
  | 'parallel-both'              // FC + OEMS in parallel, merged
  | 'fc-with-oems-fallback';     // FC first; merge OEMS in if FC empty or obsolete/EOL

export interface GetFindchipsOptions {
  source?: FcFetchSource;
}

// ============================================================
// DISTRIBUTOR NAME NORMALIZATION (shared with mapper)
// ============================================================
// Lives here (rather than in findchipsMapper.ts) so the merge/dedup helper can
// use it without creating a mapper → client → mapper circular import. The
// mapper re-exports this for back-compat.

const DISTRIBUTOR_NAME_MAP: Record<string, string> = {
  'digi-key': 'digikey',
  'digi-key electronics': 'digikey',
  'digikey': 'digikey',
  'mouser electronics': 'mouser',
  'mouser': 'mouser',
  'arrow electronics': 'arrow',
  'arrow': 'arrow',
  'lcsc': 'lcsc',
  'element14 asia-pacific': 'element14',
  'element14': 'element14',
  'newark': 'newark',
  'newark electronics': 'newark',
  'farnell': 'farnell',
  'rs': 'rs',
  'rs components': 'rs',
  'tme': 'tme',
  'avnet': 'avnet',
  'avnet americas': 'avnet',
  'avnet abacus': 'avnet-abacus',
  'avnet asia': 'avnet-asia',
  'future electronics': 'future',
  'rochester electronics': 'rochester',
  'rutronik': 'rutronik',
  'verical': 'verical',
  'chip one stop': 'chip1stop',
  'onlinecomponents.com': 'onlinecomponents',
};

export function normalizeDistributorName(name: string): string {
  const lower = name.toLowerCase().trim();
  if (DISTRIBUTOR_NAME_MAP[lower]) return DISTRIBUTOR_NAME_MAP[lower];
  const stripped = lower
    .replace(/,?\s*(inc\.?|ltd\.?|co\.?|llc|gmbh|pte|limited|corporation|electronics)$/g, '')
    .trim();
  if (DISTRIBUTOR_NAME_MAP[stripped]) return DISTRIBUTOR_NAME_MAP[stripped];
  return stripped.replace(/\s+/g, '-');
}

// ============================================================
// IN-MEMORY L1 CACHE (5-min TTL, source-keyed)
// ============================================================
// Pricing and stock are time-sensitive — we keep this short so users making
// purchasing decisions never see hours-stale numbers. L2 (Supabase) is no
// longer used for FC commercial data; every L1 miss goes live to the API.
//
// Key format: `${mpn.toLowerCase()}::${site}` so FC and OEMS cache
// independently. Caller composes merged results on read; we never have to
// re-fetch one site just because the other turned out to be needed.

interface CacheEntry {
  results: FCDistributorResult[] | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function siteCacheKey(mpn: string, site: FcSite): string {
  return `${mpn.toLowerCase()}::${site}`;
}

function getCachedSite(mpn: string, site: FcSite): FCDistributorResult[] | null | undefined {
  const key = siteCacheKey(mpn, site);
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.results;
}

function setCachedSite(mpn: string, site: FcSite, results: FCDistributorResult[] | null): void {
  cache.set(siteCacheKey(mpn, site), { results, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ============================================================
// MERGE / DEDUP
// ============================================================

/**
 * Merge FC and OEMS distributor result arrays, deduplicating by normalized
 * distributor name. FC entries win on collision (per user choice — franchised
 * pricing trusted over broker pricing). Either input may be null.
 */
export function mergeFcAndOems(
  fc: FCDistributorResult[] | null,
  oems: FCDistributorResult[] | null,
): FCDistributorResult[] | null {
  const fcHas = fc && fc.length > 0;
  const oemsHas = oems && oems.length > 0;
  if (!fcHas && !oemsHas) return fc ?? oems ?? null;
  if (!oemsHas) return fc;
  if (!fcHas) return oems;

  const seen = new Set<string>();
  for (const r of fc!) seen.add(normalizeDistributorName(r.distributor.name));

  const merged: FCDistributorResult[] = [...fc!];
  for (const r of oems!) {
    const key = normalizeDistributorName(r.distributor.name);
    if (!seen.has(key)) {
      merged.push(r);
      seen.add(key);
    }
  }
  return merged;
}

/** True if any FC part entry reports an EOL-class lifecycle code. */
function isFcObsolete(results: FCDistributorResult[] | null): boolean {
  if (!results) return false;
  for (const dist of results) {
    for (const part of dist.parts) {
      const code = part.partLifecycleCode?.toLowerCase();
      if (code === 'obsolete' || code === 'not_recommended') return true;
    }
  }
  return false;
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

async function fcFetch(mpn: string, site: FcSite, exactMatch: boolean = true): Promise<FCSearchResponse> {
  const apiKey = process.env.FINDCHIPS_API_KEY!;
  const params = new URLSearchParams({
    part: mpn,
    apiKey,
    hostedOnly: 'true',
    site,
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
 * Fetch a single site (FC or OEMS) for an MPN. Source-keyed L1 cache (5 min).
 * Caches null results too — avoids hammering the API for MPNs the upstream
 * source doesn't carry. L2 is intentionally not used for FC commercial data.
 */
async function getSiteResults(
  mpn: string,
  userId: string | undefined,
  site: FcSite,
): Promise<FCDistributorResult[] | null> {
  // L1: In-memory cache (per-site)
  const l1 = getCachedSite(mpn, site);
  if (l1 !== undefined) return l1;

  if (!hasFindchipsBudget()) {
    console.warn(`[findchips:${site}] Daily budget exhausted — skipping`);
    return null;
  }

  const slotAcquired = await acquireRateSlot();
  if (!slotAcquired) return null;

  try {
    const response = await fcFetch(mpn, site);

    if (userId) {
      logApiCall({ userId, service: 'findchips', operation: 'batch_search' }).catch(() => {});
    }

    const results = response.response;
    const hasResults = results && results.length > 0 &&
      results.some(r => r.parts && r.parts.length > 0);

    if (hasResults) {
      setCachedSite(mpn, site, results);
      return results;
    }
    setCachedSite(mpn, site, null);
    return null;
  } catch (err) {
    console.error(`[findchips:${site}] API error:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Persist merged distributor count to L2 (lifecycle tier — distributor identity
 * is stable on weeks/months timescale, unlike pricing/stock). Lets the search
 * picker display "N distributors" badges without firing live FC calls.
 * Fire-and-forget; never blocks the caller.
 */
function persistMergedCount(mpn: string, results: FCDistributorResult[] | null): void {
  if (!results || results.length === 0) return;
  const count = results.filter(r => r.parts && r.parts.length > 0).length;
  if (count === 0) return;
  setCachedResponse(
    'findchips',
    mpn.toLowerCase(),
    'fc-distributors',
    'lifecycle',
    { count },
    TTL_LIFECYCLE_MS,
  );
}

/**
 * Fetch FindChips results for a single MPN.
 *
 * Default behavior (`source: 'fc'`) hits franchised distributors only —
 * preserves prior behavior for all existing call sites. Other strategies
 * fold in OEMS (independent distributors / oemstrade.com) for cases where
 * FC is unlikely to have what we need (Chinese-MFR parts, obsolete parts,
 * empty-result MPNs).
 *
 * Returns array of distributor results, or null if not found / unavailable.
 */
export async function getFindchipsResults(
  mpn: string,
  userId?: string,
  opts?: GetFindchipsOptions,
): Promise<FCDistributorResult[] | null> {
  if (!isFindchipsConfigured()) return null;

  const source: FcFetchSource = opts?.source ?? 'fc';
  let merged: FCDistributorResult[] | null;

  if (source === 'fc') {
    merged = await getSiteResults(mpn, userId, 'fc');
  } else if (source === 'oems') {
    merged = await getSiteResults(mpn, userId, 'oems');
  } else if (source === 'parallel-both') {
    const [fc, oems] = await Promise.all([
      getSiteResults(mpn, userId, 'fc'),
      getSiteResults(mpn, userId, 'oems'),
    ]);
    merged = mergeFcAndOems(fc, oems);
  } else {
    // 'fc-with-oems-fallback'
    const fc = await getSiteResults(mpn, userId, 'fc');
    const empty = !fc || fc.length === 0;
    const obsolete = isFcObsolete(fc);
    if (!empty && !obsolete) {
      merged = fc;
    } else {
      const oems = await getSiteResults(mpn, userId, 'oems');
      merged = mergeFcAndOems(fc, oems);
    }
  }

  persistMergedCount(mpn, merged);
  return merged;
}

// ============================================================
// PUBLIC API — Cached distributor counts (no live API calls)
// ============================================================

/**
 * Read cached distributor counts for a list of MPNs. Returns a Map of
 * lowercase MPN → count. MPNs without a cached entry are simply omitted.
 *
 * Used by the search picker to surface "N distributors" badges with zero
 * FindChips API quota cost. Distributor identity is stable on a weeks/months
 * timescale, so the 6-month lifecycle TTL is safe.
 */
export async function getCachedDistributorCounts(
  mpns: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (mpns.length === 0) return result;

  const rows = await getCachedResponseBatch<{ count: number }>(
    'findchips',
    mpns,
    'fc-distributors',
  );

  for (const [mpnLower, payload] of rows.entries()) {
    if (typeof payload?.count === 'number') {
      result.set(mpnLower, payload.count);
    }
  }
  return result;
}

// ============================================================
// PUBLIC API — Batch MPNs
// ============================================================

const BATCH_CONCURRENCY = 5;

export interface GetFindchipsBatchOptions {
  /** Lowercase MPNs that should fire OEMS in parallel with FC (Chinese MFRs). */
  chineseMpns?: Set<string>;
  /** If FC returns no results for an MPN, fall back to OEMS. Default true. */
  fallbackOnEmpty?: boolean;
  /** If FC reports an MPN as obsolete/EOL, also fetch OEMS and merge. Default true. */
  fallbackOnObsolete?: boolean;
}

async function runConcurrent<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    await Promise.all(chunk.map(fn));
  }
}

/**
 * Fetch FindChips results for multiple MPNs in parallel.
 *
 * Two-phase fetch when OEMS gating is in play:
 *   Phase 1: fan out FC for every MPN (concurrency = 5).
 *   Phase 2: for each MPN that's (a) flagged Chinese, (b) FC empty, or
 *            (c) FC reports obsolete/EOL — fan out OEMS, merge into result.
 *
 * Default behavior with no opts: FC only + fallback on empty/obsolete (always
 * a strict superset of pre-OEMS behavior; never worse than today).
 *
 * Returns Map of lowercase MPN → merged distributor results.
 */
export async function getFindchipsResultsBatch(
  mpns: string[],
  userId?: string,
  opts?: GetFindchipsBatchOptions,
): Promise<Map<string, FCDistributorResult[]>> {
  const results = new Map<string, FCDistributorResult[]>();
  if (!isFindchipsConfigured() || mpns.length === 0) return results;

  const chineseSet = opts?.chineseMpns ?? new Set<string>();
  const fallbackOnEmpty = opts?.fallbackOnEmpty ?? true;
  const fallbackOnObsolete = opts?.fallbackOnObsolete ?? true;

  // Phase 1: FC for all MPNs (skip Chinese — they fetch both in parallel below).
  const fcOnly: string[] = [];
  const parallelBoth: string[] = [];
  for (const mpn of mpns) {
    if (chineseSet.has(mpn.toLowerCase())) {
      parallelBoth.push(mpn);
    } else {
      fcOnly.push(mpn);
    }
  }

  // Per-MPN site results, accumulated for merge.
  const fcResults = new Map<string, FCDistributorResult[] | null>();
  const oemsResults = new Map<string, FCDistributorResult[] | null>();

  await runConcurrent(fcOnly, BATCH_CONCURRENCY, async (mpn) => {
    const r = await getSiteResults(mpn, userId, 'fc');
    fcResults.set(mpn.toLowerCase(), r);
  });

  // Chinese MPNs: fire FC + OEMS in parallel from the start.
  await runConcurrent(parallelBoth, BATCH_CONCURRENCY, async (mpn) => {
    const [fc, oems] = await Promise.all([
      getSiteResults(mpn, userId, 'fc'),
      getSiteResults(mpn, userId, 'oems'),
    ]);
    fcResults.set(mpn.toLowerCase(), fc);
    oemsResults.set(mpn.toLowerCase(), oems);
  });

  // Phase 2: OEMS top-up for non-Chinese MPNs that came back empty or obsolete.
  const needsOemsTopUp: string[] = [];
  for (const mpn of fcOnly) {
    const fc = fcResults.get(mpn.toLowerCase()) ?? null;
    const empty = !fc || fc.length === 0;
    const obsolete = isFcObsolete(fc);
    if ((fallbackOnEmpty && empty) || (fallbackOnObsolete && obsolete)) {
      needsOemsTopUp.push(mpn);
    }
  }

  await runConcurrent(needsOemsTopUp, BATCH_CONCURRENCY, async (mpn) => {
    const oems = await getSiteResults(mpn, userId, 'oems');
    oemsResults.set(mpn.toLowerCase(), oems);
  });

  // Merge per-MPN, persist merged distributor count to L2.
  for (const mpn of mpns) {
    const key = mpn.toLowerCase();
    const fc = fcResults.get(key) ?? null;
    const oems = oemsResults.get(key) ?? null;
    const merged = mergeFcAndOems(fc, oems);
    if (merged && merged.length > 0) {
      results.set(key, merged);
      persistMergedCount(mpn, merged);
    }
  }

  return results;
}
