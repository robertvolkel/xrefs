import type { FCDistributorResult } from '@/lib/services/findchipsClient';
import { filterFcResultsByMaker, mapFCToQuotes } from '@/lib/services/findchipsMapper';

/**
 * Real-shape test for the maker-aware distributor fix.
 *
 * Mirrors an actual FindChips LM317T response (2026-07-24): one distributor (DigiKey) lists many
 * makers under the same MPN; others are single-maker. Each offer's buyNowUrl is tagged with its
 * maker, so we can PROVE the chosen buy link belongs to the card's maker — not to whichever maker
 * happened to win the price/stock tiebreak. The transform under test is exactly what the enrichment
 * paths run: `mapFCToQuotes(filterFcResultsByMaker(results, maker), mpn)`.
 */

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

// DigiKey lists 4 makers; Rochester has the MOST price breaks, so the maker-BLIND selectBestPart
// picks Rochester — i.e. an ST card would link to a Rochester purchase without the fix.
const results = [
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

const quotesFor = (maker: string | undefined) =>
  mapFCToQuotes(filterFcResultsByMaker(results, maker), 'LM317T');

describe('maker-aware FindChips filtering', () => {
  it('an ST card gets ONLY ST distributors, and each buy link is ST (not the cheapest cross-maker offer)', () => {
    const quotes = quotesFor('STMicroelectronics');
    // DigiKey + element14 + RS carry ST; Bristol does not.
    expect(quotes).toHaveLength(3);
    for (const q of quotes) {
      expect(q.productUrl).toContain('STMicroelectronics');
    }
    // The load-bearing assertion: DigiKey's buy link is ST's, NOT Rochester's (which wins the
    // maker-blind price-break tiebreak). Fails if the filter is removed.
    const digikey = quotes.find(q => q.supplier.toLowerCase().includes('digikey') || q.supplier.toLowerCase().includes('digi-key'));
    expect(digikey?.productUrl).toContain('STMicroelectronics');
    expect(digikey?.productUrl).not.toContain('Rochester');
  });

  it('a GOODWORK card gets only the distributor that actually carries Goodwork, with Goodwork buy link', () => {
    const quotes = quotesFor('GOODWORK'); // short card name vs FindChips "Goodwork Semiconductor Co Ltd"
    expect(quotes).toHaveLength(1);
    expect(quotes[0].productUrl).toContain('Goodwork');
  });

  it('a maker not present in the results gets NO distributors (shows nothing, never wrong-maker)', () => {
    expect(quotesFor('HGSEMI')).toHaveLength(0);
  });

  it('with no maker (unknown), behavior is unchanged — all 4 distributors, DigiKey picks the cross-maker best', () => {
    const quotes = quotesFor(undefined);
    expect(quotes).toHaveLength(4);
    const digikey = quotes.find(q => q.supplier.toLowerCase().includes('digikey') || q.supplier.toLowerCase().includes('digi-key'));
    // Maker-blind: Rochester wins the price-break tiebreak — the exact bug the fix targets.
    expect(digikey?.productUrl).toContain('Rochester');
  });

  it('a PRESENT maker that normalizes to nothing filters (→ []), it is NOT treated as "unknown"', () => {
    // "Semiconductor Co Ltd" is all generic-suffix tokens → normalizes to "". It must NOT fall back
    // to the unfiltered set (which would reintroduce the cross-maker buy link) — it matches nothing.
    expect(quotesFor('Semiconductor Co Ltd')).toHaveLength(0);
  });
});
