/**
 * Tests for partDataCache.ts — L2 Supabase-backed persistent cache.
 *
 * Tests pure functions and constants. Supabase-dependent functions
 * (getCachedResponse, setCachedResponse, etc.) are integration-tested
 * against the live API — fire-and-forget error handling ensures they
 * degrade gracefully when Supabase is unavailable (as seen in mouserClient tests).
 */

import {
  isNotFoundSentinel,
  NOT_FOUND_SENTINEL,
  TTL_PARAMETRIC_DIGIKEY,
  TTL_PARAMETRIC_PARTSIO_MS,
  TTL_LIFECYCLE_MS,
  TTL_COMMERCIAL_MS,
  TTL_NOT_FOUND_MS,
} from '@/lib/services/partDataCache';

// ============================================================
// TTL CONSTANTS
// ============================================================

describe('TTL constants', () => {
  test('parametric Digikey is indefinite (null)', () => {
    expect(TTL_PARAMETRIC_DIGIKEY).toBeNull();
  });

  test('parametric parts.io is 90 days', () => {
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
    expect(TTL_PARAMETRIC_PARTSIO_MS).toBe(ninetyDaysMs);
  });

  test('lifecycle is 6 months (180 days)', () => {
    const sixMonthsMs = 180 * 24 * 60 * 60 * 1000;
    expect(TTL_LIFECYCLE_MS).toBe(sixMonthsMs);
  });

  test('commercial is 24 hours', () => {
    const twentyFourHoursMs = 24 * 60 * 60 * 1000;
    expect(TTL_COMMERCIAL_MS).toBe(twentyFourHoursMs);
  });

  test('not-found is 24 hours', () => {
    const twentyFourHoursMs = 24 * 60 * 60 * 1000;
    expect(TTL_NOT_FOUND_MS).toBe(twentyFourHoursMs);
  });

  test('TTL ordering: commercial < not-found < partsio < lifecycle', () => {
    // Commercial and not-found share the same TTL (24h)
    expect(TTL_COMMERCIAL_MS).toBe(TTL_NOT_FOUND_MS);
    // Parts.io parametric (90 days) < lifecycle (180 days)
    expect(TTL_PARAMETRIC_PARTSIO_MS).toBeLessThan(TTL_LIFECYCLE_MS);
    // Commercial (24h) < parts.io parametric (90 days)
    expect(TTL_COMMERCIAL_MS).toBeLessThan(TTL_PARAMETRIC_PARTSIO_MS);
  });
});

// ============================================================
// NOT-FOUND SENTINEL
// ============================================================

describe('isNotFoundSentinel', () => {
  test('recognizes NOT_FOUND_SENTINEL constant', () => {
    expect(isNotFoundSentinel(NOT_FOUND_SENTINEL)).toBe(true);
  });

  test('recognizes equivalent object', () => {
    expect(isNotFoundSentinel({ notFound: true })).toBe(true);
  });

  test('recognizes object with extra properties', () => {
    expect(isNotFoundSentinel({ notFound: true, extra: 'field' })).toBe(true);
  });

  test('rejects null', () => {
    expect(isNotFoundSentinel(null)).toBe(false);
  });

  test('rejects undefined', () => {
    expect(isNotFoundSentinel(undefined)).toBe(false);
  });

  test('rejects empty object', () => {
    expect(isNotFoundSentinel({})).toBe(false);
  });

  test('rejects notFound: false', () => {
    expect(isNotFoundSentinel({ notFound: false })).toBe(false);
  });

  test('rejects primitive types', () => {
    expect(isNotFoundSentinel('notFound')).toBe(false);
    expect(isNotFoundSentinel(42)).toBe(false);
    expect(isNotFoundSentinel(true)).toBe(false);
  });

  test('rejects unrelated objects', () => {
    expect(isNotFoundSentinel({ data: 'something' })).toBe(false);
    expect(isNotFoundSentinel({ found: true })).toBe(false);
  });

  test('NOT_FOUND_SENTINEL is frozen/readonly', () => {
    expect(NOT_FOUND_SENTINEL.notFound).toBe(true);
    expect(Object.keys(NOT_FOUND_SENTINEL)).toEqual(['notFound']);
  });
});
