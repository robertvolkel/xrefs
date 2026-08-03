import { buildOptimisticFromRec, buildOptimisticFromSummary } from '@/lib/services/optimisticAttributes';
import type { PartSummary, XrefRecommendation, Part, SupplierQuote } from '@/lib/types';

/**
 * The optimistic preview (Decision #257) is what the source panel paints for the
 * ~17s the real fetch takes (measured against the live APIs). The loading-shimmer
 * treatment rests entirely on what this module does and does NOT populate, so
 * those properties are pinned here — there was no test file for it before.
 */

const summary = (over: Partial<PartSummary> = {}): PartSummary => ({
  mpn: 'MNS2N2222AUB',
  manufacturer: 'Microchip Technology',
  description: 'NPN transistor',
  category: 'Transistors',
  ...over,
});

describe('buildOptimisticFromSummary: what the panel does NOT yet know', () => {
  it('leaves every late-arriving field undefined', () => {
    // This is the premise the whole shimmer rule rests on: these fields must be
    // absent (not empty-string, not 0) so isPending() can tell "still loading"
    // apart from "loaded and genuinely empty". If any of these ever start
    // arriving as '' or 0, the corresponding row silently stops shimmering.
    const { part } = buildOptimisticFromSummary(summary());
    expect(part.datasheetUrl).toBeUndefined();
    expect(part.imageUrl).toBeUndefined();
    expect(part.supplierQuotes).toBeUndefined();
    expect(part.yteol).toBeUndefined();
    expect(part.riskRank).toBeUndefined();
    expect(part.countryOfOrigin).toBeUndefined();
    expect(part.rohsStatus).toBeUndefined();
    expect(part.reachCompliance).toBeUndefined();
    expect(part.eccnCode).toBeUndefined();
    expect(part.htsCode).toBeUndefined();
    expect(part.qualificationDomain).toBeUndefined();
  });

  it('produces NO spec rows when the card carries no key parameters', () => {
    // Only Digikey populates keyParameters — Atlas and parts.io cards carry none.
    // That is why the Specs tab needs filler rows: without them it renders a bare
    // table header over blank space for the entire fetch.
    expect(buildOptimisticFromSummary(summary()).parameters).toHaveLength(0);
  });

  it('carries key parameters through when the card has them', () => {
    const attrs = buildOptimisticFromSummary(
      summary({ keyParameters: [{ name: 'Vceo', value: '40 V' }, { name: 'Ic', value: '600 mA' }] }),
    );
    expect(attrs.parameters).toHaveLength(2);
    expect(attrs.parameters[0]).toMatchObject({ parameterName: 'Vceo', value: '40 V', recognized: true });
  });

  it('DOCUMENTED DEFECT: fabricates "Active" when the card has no status', () => {
    // Part.status is required while PartSummary.status is optional, so a part of
    // unknown lifecycle shows a green "Active" chip during the preview window.
    // isPending() correctly reports this as present-not-missing, so the row does
    // NOT shimmer — it asserts a value we do not have. Out of scope for the
    // loading work; this assertion exists so the day someone fixes it, this test
    // fails loudly rather than the fix silently changing panel behaviour.
    expect(buildOptimisticFromSummary(summary()).part.status).toBe('Active');
    expect(buildOptimisticFromSummary(summary({ status: 'Obsolete' })).part.status).toBe('Obsolete');
  });
});

describe('buildOptimisticFromRec: a preview that may ALREADY hold live data', () => {
  const quotes: SupplierQuote[] = [
    { supplier: 'Digi-Key', quantityAvailable: 4200, priceBreaks: [{ quantity: 1, unitPrice: 0.42, currency: 'USD' }] } as SupplierQuote,
  ];

  const rec = (): XrefRecommendation => ({
    part: {
      mpn: 'MMBT2222A',
      manufacturer: 'onsemi',
      description: 'NPN transistor',
      category: 'Transistors',
      subcategory: 'BJT',
      status: 'Active',
      supplierQuotes: quotes,
      datasheetUrl: 'https://example.com/ds.pdf',
    } as Part,
    matchDetails: [
      { parameterId: 'vceo_max', parameterName: 'Vceo', replacementValue: '40 V' },
      { parameterId: 'ic_max', parameterName: 'Ic', replacementValue: 'N/A' },
    ],
  } as unknown as XrefRecommendation);

  it('preserves supplier quotes already on the recommendation card', () => {
    // THIS is why the shimmer must be decided per field, never per section. A
    // section-level "still loading" flag would shimmer over live pricing the user
    // was already looking at one click earlier.
    expect(buildOptimisticFromRec(rec()).part.supplierQuotes).toEqual(quotes);
    expect(buildOptimisticFromRec(rec()).part.datasheetUrl).toBe('https://example.com/ds.pdf');
  });

  it('seeds spec rows from scored match details, skipping N/A', () => {
    const params = buildOptimisticFromRec(rec()).parameters;
    expect(params).toHaveLength(1);
    expect(params[0]).toMatchObject({ parameterId: 'vceo_max', value: '40 V' });
  });
});
