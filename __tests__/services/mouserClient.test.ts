/**
 * Tests for mouserClient.ts — API client with caching, rate limiting, and batch.
 *
 * We mock fetch and process.env to test the client logic without real API calls.
 */

import {
  isMouserConfigured,
  hasMouserBudget,
  getMouserDailyRemaining,
  getMouserProduct,
  getMouserProductsBatch,
} from '@/lib/services/mouserClient';
import type { MouserSearchResponse } from '@/lib/services/mouserClient';

// ============================================================
// HELPERS
// ============================================================

function makeSearchResponse(parts: Array<Record<string, unknown>> = []): MouserSearchResponse {
  return {
    Errors: [],
    SearchResults: {
      NumberOfResult: parts.length,
      Parts: parts as unknown as MouserSearchResponse['SearchResults']['Parts'],
    },
  };
}

function makeMouserPart(overrides: Record<string, unknown> = {}) {
  return {
    MouserPartNumber: '511-LM317T',
    ManufacturerPartNumber: 'LM317T',
    Manufacturer: 'STMicroelectronics',
    Description: 'Linear Voltage Regulators',
    Category: 'Linear Voltage Regulators',
    PriceBreaks: [{ Quantity: 1, Price: '$0.56', Currency: 'USD' }],
    AvailabilityInStock: '37444',
    LeadTime: '98 Days',
    ...overrides,
  };
}

// ============================================================
// MOCK SETUP
// ============================================================

const originalEnv = process.env;
const mockFetch = jest.fn();

beforeEach(() => {
  jest.resetModules();
  process.env = { ...originalEnv, MOUSER_API_KEY: 'test-key-123' };
  global.fetch = mockFetch;
  mockFetch.mockReset();
});

afterEach(() => {
  process.env = originalEnv;
});

// ============================================================
// isMouserConfigured
// ============================================================

describe('isMouserConfigured', () => {
  it('returns true when API key is set', () => {
    expect(isMouserConfigured()).toBe(true);
  });

  it('returns false when API key is not set', () => {
    delete process.env.MOUSER_API_KEY;
    expect(isMouserConfigured()).toBe(false);
  });
});

// ============================================================
// hasMouserBudget / getMouserDailyRemaining
// ============================================================

describe('rate limiting', () => {
  it('has budget at start of day', () => {
    expect(hasMouserBudget()).toBe(true);
    expect(getMouserDailyRemaining()).toBe(950);
  });
});

// ============================================================
// getMouserProduct
// ============================================================

describe('getMouserProduct', () => {
  it('returns null when not configured', async () => {
    delete process.env.MOUSER_API_KEY;
    const result = await getMouserProduct('LM317T');
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fetches and returns best product for MPN', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(makeSearchResponse([
        makeMouserPart({ AvailabilityInStock: '100', PriceBreaks: [] }),
        makeMouserPart({ AvailabilityInStock: '37444' }),
      ])),
    });

    const result = await getMouserProduct('LM317T');
    expect(result).not.toBeNull();
    expect(result!.AvailabilityInStock).toBe('37444');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Verify POST body
    const call = mockFetch.mock.calls[0];
    expect(call[0]).toContain('apiKey=test-key-123');
    const body = JSON.parse(call[1].body);
    expect(body.SearchByPartRequest.mouserPartNumber).toBe('LM317T');
  });

  it('returns null for no results', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(makeSearchResponse([])),
    });

    const result = await getMouserProduct('NONEXISTENT123');
    expect(result).toBeNull();
  });

  it('caches results (second call does not fetch)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(makeSearchResponse([makeMouserPart()])),
    });

    await getMouserProduct('LM317T-CACHE-TEST');
    const result2 = await getMouserProduct('LM317T-CACHE-TEST');

    expect(result2).not.toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('handles API errors gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    });

    const result = await getMouserProduct('LM317T-ERR');
    expect(result).toBeNull();
  });

  it('retries on 429 rate limit', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Map([['Retry-After', '1']]),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(makeSearchResponse([makeMouserPart()])),
      });

    const result = await getMouserProduct('LM317T-RETRY');
    expect(result).not.toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  }, 10000);

  it('prefers exact MPN match over partial', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(makeSearchResponse([
        makeMouserPart({
          ManufacturerPartNumber: 'LM317T-DG',
          AvailabilityInStock: '99999',
        }),
        makeMouserPart({
          ManufacturerPartNumber: 'LM317T-SELECT',
          AvailabilityInStock: '5000',
          PriceBreaks: [{ Quantity: 1, Price: '$0.56', Currency: 'USD' }],
        }),
      ])),
    });

    // Neither is exact match for 'LM317T-SELECT', so it should pick the exact match
    const result = await getMouserProduct('LM317T-SELECT');
    expect(result!.ManufacturerPartNumber).toBe('LM317T-SELECT');
  });
});

// ============================================================
// getMouserProductsBatch
// ============================================================

describe('getMouserProductsBatch', () => {
  it('returns empty map when not configured', async () => {
    delete process.env.MOUSER_API_KEY;
    const result = await getMouserProductsBatch(['LM317T', 'IRFZ44N']);
    expect(result.size).toBe(0);
  });

  it('batches MPNs into pipe-separated queries', async () => {
    const parts = [
      makeMouserPart({ ManufacturerPartNumber: 'PART-A' }),
      makeMouserPart({ ManufacturerPartNumber: 'PART-B' }),
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(makeSearchResponse(parts)),
    });

    const result = await getMouserProductsBatch(['PART-A', 'PART-B']);
    expect(result.size).toBe(2);
    expect(result.has('part-a')).toBe(true);
    expect(result.has('part-b')).toBe(true);

    // Should be a single API call with pipe-separated
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.SearchByPartRequest.mouserPartNumber).toBe('PART-A|PART-B');
  });

  it('chunks into groups of 10', async () => {
    const mpns = Array.from({ length: 15 }, (_, i) => `PART-${i}`);
    const partsChunk1 = Array.from({ length: 10 }, (_, i) =>
      makeMouserPart({ ManufacturerPartNumber: `PART-${i}` }),
    );
    const partsChunk2 = Array.from({ length: 5 }, (_, i) =>
      makeMouserPart({ ManufacturerPartNumber: `PART-${i + 10}` }),
    );

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(makeSearchResponse(partsChunk1)),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(makeSearchResponse(partsChunk2)),
      });

    const result = await getMouserProductsBatch(mpns);
    expect(result.size).toBe(15);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('returns empty map for empty input', async () => {
    const result = await getMouserProductsBatch([]);
    expect(result.size).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
