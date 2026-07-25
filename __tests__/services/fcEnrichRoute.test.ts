/**
 * POST /api/fc/enrich — maker-aware deferred FindChips enrichment.
 *
 * This route populates the PRICE CHIPS and "Go Buy" links on the replacement
 * suggestion cards (the browser fires it after cards render, via
 * enrichWithFCBatch → triggerFCEnrichment). FindChips indexes by part-number
 * STRING, so one MPN's results mix every maker that sells it — and the
 * maker-blind pick hands back whichever maker won the price/stock tiebreak. On a
 * standard jellybean MPN that means a card's "Go Buy" could open a DIFFERENT
 * company's part. The route now filters each MPN's results to the card's own
 * maker (supplied per-MPN in the request) before building quotes.
 *
 * The transform under test is the REAL one: the mapper and filterFcResultsByMaker
 * are NOT mocked. Only auth and the network fetch (getFindchipsResultsBatch) are
 * stubbed. Mutation bar: revert the route's `filterFcResultsByMaker(...)` to the
 * raw `distResults` and the with-maker cases below must fail (DigiKey's buy link
 * flips back to Rochester's).
 */

import { invokeRoute } from '../helpers/routeHarness';
import type { FCDistributorResult } from '@/lib/services/findchipsClient';

// Multi-maker LM317T shape, mirroring a live FindChips response: DigiKey lists 4
// makers under one MPN and Rochester has the MOST price breaks, so the maker-BLIND
// selectBestPart picks Rochester — i.e. an ST card would link to a Rochester buy.
function offer(maker: string, breaks: number, stock: number) {
  const price = [];
  for (let i = 0; i < breaks; i++) price.push({ quantity: 10 ** i, price: 1 / (i + 1), currency: 'USD' });
  return {
    manufacturer: maker,
    part: 'LM317T',
    price,
    stock,
    buyNowUrl: `https://buy.example/${maker.replace(/\s+/g, '_')}`,
  };
}

const LM317T_RESULTS = [
  {
    distributor: { id: 1, name: 'DigiKey', authorized: true },
    parts: [
      offer('Rochester Electronics LLC', 3, 5),
      offer('STMicroelectronics', 1, 1000),
      offer('Goodwork Semiconductor Co Ltd', 2, 50),
      offer('onsemi', 1, 200),
    ],
  },
  { distributor: { id: 2, name: 'element14', authorized: true }, parts: [offer('STMicroelectronics', 1, 100)] },
  { distributor: { id: 3, name: 'RS', authorized: true }, parts: [offer('STMicroelectronics', 1, 80)] },
  {
    distributor: { id: 4, name: 'Bristol Electronics', authorized: false },
    parts: [offer('Fairchild Semiconductor Corporation', 1, 10), offer('National Semiconductor Corporation', 1, 12)],
  },
] as unknown as FCDistributorResult[];

// Auth: signed-in user. Route only needs { user, error } from requireAuth.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are hoisted above imports
jest.mock('../../lib/supabase/auth-guard', () => require('../helpers/authGuard').adminGuard());

// Network stub only. getFindchipsResultsBatch returns a Map<mpnLower, results[]>,
// exactly what the real client returns; the route + mapper run for real. We spread
// the ACTUAL client so `normalizeDistributorName` (which the mapper imports from
// here) stays real — the mapper's supplier canonicalization is part of the path
// under test.
const batchMock = jest.fn(async () => new Map([['lm317t', LM317T_RESULTS]]));
jest.mock('../../lib/services/findchipsClient', () => ({
  ...jest.requireActual('../../lib/services/findchipsClient'),
  isFindchipsConfigured: () => true,
  hasFindchipsBudget: () => true,
  getFindchipsResultsBatch: (..._args: unknown[]) => batchMock(),
}));

import { POST } from '@/app/api/fc/enrich/route';

interface EnrichResponse {
  success: boolean;
  data?: {
    results: Record<string, { quotes: Array<{ supplier: string; productUrl?: string }>; lifecycle: unknown; compliance: unknown }>;
  };
  error?: string;
}

const digikeyQuote = (quotes: Array<{ supplier: string; productUrl?: string }>) =>
  quotes.find(q => q.supplier.toLowerCase().includes('digikey') || q.supplier.toLowerCase().includes('digi-key'));

describe('POST /api/fc/enrich — maker scoping', () => {
  beforeEach(() => batchMock.mockClear());

  it('with a maker map, an ST card gets ONLY ST distributors and ST buy links (not the cheapest cross-maker offer)', async () => {
    const { status, json } = await invokeRoute<EnrichResponse>(POST, {
      body: { mpns: ['LM317T'], makers: { lm317t: 'STMicroelectronics' } },
    });
    expect(status).toBe(200);
    const quotes = json.data!.results.lm317t.quotes;
    // DigiKey + element14 + RS carry ST; Bristol does not.
    expect(quotes).toHaveLength(3);
    for (const q of quotes) expect(q.productUrl).toContain('STMicroelectronics');
    // Load-bearing: DigiKey's buy link is ST's, NOT Rochester's (the maker-blind winner).
    const dk = digikeyQuote(quotes);
    expect(dk?.productUrl).toContain('STMicroelectronics');
    expect(dk?.productUrl).not.toContain('Rochester');
  });

  it('a short card name (GOODWORK) matches the full FindChips corporate name', async () => {
    const { json } = await invokeRoute<EnrichResponse>(POST, {
      body: { mpns: ['LM317T'], makers: { lm317t: 'GOODWORK' } },
    });
    const quotes = json.data!.results.lm317t.quotes;
    expect(quotes).toHaveLength(1);
    expect(quotes[0].productUrl).toContain('Goodwork');
  });

  it('a maker not present in the results gets NO quotes (shows nothing, never wrong-maker)', async () => {
    const { json } = await invokeRoute<EnrichResponse>(POST, {
      body: { mpns: ['LM317T'], makers: { lm317t: 'HGSEMI' } },
    });
    expect(json.data!.results.lm317t.quotes).toHaveLength(0);
  });

  it('WITHOUT a maker map, behavior is unchanged — all 4 distributors, DigiKey picks the cross-maker best (Rochester)', async () => {
    const { json } = await invokeRoute<EnrichResponse>(POST, {
      body: { mpns: ['LM317T'] },
    });
    const quotes = json.data!.results.lm317t.quotes;
    expect(quotes).toHaveLength(4);
    // Maker-blind: Rochester wins the price-break tiebreak — the exact bug the filter targets.
    expect(digikeyQuote(quotes)?.productUrl).toContain('Rochester');
  });

  it('a maker map that omits THIS mpn leaves that mpn unfiltered (per-MPN scoping, not all-or-nothing)', async () => {
    const { json } = await invokeRoute<EnrichResponse>(POST, {
      body: { mpns: ['LM317T'], makers: { 'some-other-mpn': 'STMicroelectronics' } },
    });
    // No maker for lm317t → unfiltered → Rochester wins, all 4 distributors.
    expect(json.data!.results.lm317t.quotes).toHaveLength(4);
    expect(digikeyQuote(json.data!.results.lm317t.quotes)?.productUrl).toContain('Rochester');
  });

  it('rejects an empty mpns array before any fetch', async () => {
    const { status, json } = await invokeRoute<EnrichResponse>(POST, { body: { mpns: [] } });
    expect(status).toBe(400);
    expect(json.success).toBe(false);
    expect(batchMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/fc/enrich — auth', () => {
  it('blocks an unauthenticated caller before any work', async () => {
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.doMock factory
    jest.doMock('../../lib/supabase/auth-guard', () => require('../helpers/authGuard').forbiddenGuard());
    const fetchSpy = jest.fn();
    jest.doMock('../../lib/services/findchipsClient', () => ({
      isFindchipsConfigured: () => true,
      hasFindchipsBudget: () => true,
      getFindchipsResultsBatch: fetchSpy,
      normalizeDistributorName: (s: string) => s,
    }));
    const { POST: GuardedPOST } = await import('@/app/api/fc/enrich/route');
    const { status } = await invokeRoute(GuardedPOST, { body: { mpns: ['LM317T'] } });
    expect(status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
    jest.resetModules();
  });
});
