/**
 * Composite Domain Cards — audit scoping tests.
 *
 * Asserts the load-bearing property of the refactor: for v2 composite cards
 * the fact-shaped checks run ONLY on the narrative region. A bogus MFR sitting
 * in the deterministic FACTS region must NOT be flagged (it's correct by
 * construction); the same bogus MFR in the NARRATIVE region MUST be flagged.
 * Legacy v1 prose cards keep the full-text path.
 *
 * Mocks the Supabase service client so the audit's DB reads are deterministic.
 */

// ── mock fixtures (mutated per test if needed) ──
// ZZTOP is a registered MFR that ships ZERO products under the family → a
// positive mention of it is "bogus". EVISUN is the only shipping MFR.
const mfrRows = [
  { name_display: 'ZZTOP Industries', name_en: 'ZZTOP', name_zh: null, aliases: [] as string[] },
  { name_display: 'EVISUN', name_en: 'EVISUN', name_zh: null, aliases: [] as string[] },
];
const productRows = [{ manufacturer: 'EVISUN' }];

jest.mock('../../lib/supabase/service', () => ({
  createServiceClient: jest.fn(() => ({
    from: (table: string) => {
      if (table === 'atlas_manufacturers') {
        return { select: () => Promise.resolve({ data: mfrRows, error: null }) };
      }
      if (table === 'atlas_products') {
        return {
          select: () => ({
            eq: () => ({
              // fetchFamilyMfrCounts paginates via .range()
              range: () => Promise.resolve({ data: productRows, error: null }),
              // fetchMfrMpnSamples uses .in().limit()
              in: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
            }),
          }),
        };
      }
      if (table === 'atlas_dictionary_overrides') {
        return {
          select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }),
        };
      }
      throw new Error(`Unexpected table in mock: ${table}`);
    },
  })),
}));

import { auditFamilyDomainCard } from '@/lib/services/atlasFamilyCardAudit';
import { composeCardText } from '@/lib/services/atlasFamilyCardComposite';

const FAMILY = 'C8'; // any family with a logic table works

describe('auditFamilyDomainCard — composite scoping', () => {
  it('does NOT flag a bogus MFR that appears only in the FACTS region (v2)', async () => {
    const facts = [
      'RULES:',
      '- device_category (Device Category) — identity, weight=10',
      'MFR COHORT (the ONLY manufacturers shipping under family C8 in atlas_products):',
      '- ZZTOP Industries: 999 products — samples: ZZ100, ZZ200',
    ].join('\n');
    const narrative = 'SUB-TYPES — 555 timers and packaged oscillators are architecturally unrelated; never cross device_category.';
    const card = composeCardText(facts, narrative);

    const result = await auditFamilyDomainCard(FAMILY, card);
    expect(result.bogusMfrs).not.toContain('ZZTOP Industries');
    expect(result.bogusMfrs).toHaveLength(0);
  });

  it('DOES flag a bogus MFR that appears in the NARRATIVE region (v2)', async () => {
    const facts = [
      'RULES:',
      '- device_category (Device Category) — identity, weight=10',
      'MFR COHORT:',
      '- EVISUN: 100 products',
    ].join('\n');
    const narrative = 'ZZTOP is a major supplier in this family and should be considered first.';
    const card = composeCardText(facts, narrative);

    const result = await auditFamilyDomainCard(FAMILY, card);
    expect(result.bogusMfrs).toContain('ZZTOP Industries');
  });

  it('skips OMITTED_MFR for v2 cards (renderer includes the cohort by construction)', async () => {
    const facts = 'MFR COHORT:\n- EVISUN: 100 products';
    // Narrative does NOT mention EVISUN — under v1 this could trip OMITTED_MFR.
    const narrative = 'HARD GATE — device_category is never substitutable across 555 vs oscillator.';
    const card = composeCardText(facts, narrative);

    const result = await auditFamilyDomainCard(FAMILY, card);
    expect(result.omittedMfrs).toHaveLength(0);
  });

  it('flags a bogus MFR in a legacy v1 prose card (full-text path, backward compat)', async () => {
    const legacy = 'SUB-TYPES — oscillators. ZZTOP is a major supplier in this family.';
    const result = await auditFamilyDomainCard(FAMILY, legacy);
    expect(result.bogusMfrs).toContain('ZZTOP Industries');
  });
});
