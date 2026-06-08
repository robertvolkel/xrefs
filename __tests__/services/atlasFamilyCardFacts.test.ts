/**
 * renderCardFacts — asserts engineer-accepted DB dictionary overrides
 * (Triage accepts) flow into the rendered facts dictionary, so a mapping
 * accepted in Triage shows up in the regenerated card with no code edit.
 *
 * Mocks the Supabase service client: the grounding RPCs return empty (no
 * MFRs) and atlas_dictionary_overrides returns one CJK override row.
 */

const overrideRows = [
  { param_name: '测试参数', attribute_id: 'test_override_attr', attribute_name: 'Test Override Attr', unit: 'V' },
  // English override — should NOT appear in the CJK dictionary section.
  { param_name: 'some english param', attribute_id: 'english_attr', attribute_name: 'English Attr', unit: 'A' },
];

jest.mock('../../lib/supabase/service', () => ({
  createServiceClient: jest.fn(() => ({
    from: (table: string) => {
      if (table === 'atlas_dictionary_overrides') {
        // fetchOverrideDictRows: .select().eq().eq().not() → Promise
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.not = () => Promise.resolve({ data: overrideRows, error: null });
        return chain;
      }
      throw new Error(`Unexpected table in mock: ${table}`);
    },
    rpc: (name: string) => {
      if (name === 'get_atlas_family_mfr_grounding') return Promise.resolve({ data: [], error: null });
      if (name === 'get_atlas_family_grounding_counts') {
        return Promise.resolve({ data: [{ product_count: 0, mfr_count: 0 }], error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  })),
}));

import { renderCardFacts } from '@/lib/services/atlasFamilyCardFacts';

describe('renderCardFacts — engineer-accepted override folding', () => {
  it('includes a CJK Triage-accepted override in the facts dictionary + rendered text', async () => {
    const facts = await renderCardFacts('C8');
    expect(
      facts.dict.some((e) => e.chinese === '测试参数' && e.attributeId === 'test_override_attr'),
    ).toBe(true);
    expect(facts.renderedText).toContain('测试参数 → test_override_attr');
  });

  it('does NOT put an English override into the CJK dictionary section', async () => {
    const facts = await renderCardFacts('C8');
    expect(facts.dict.some((e) => e.chinese === 'some english param')).toBe(false);
  });

  it('folds the override unit into the CONVENTIONAL UNITS list', async () => {
    const facts = await renderCardFacts('C8');
    expect(facts.units.some((u) => u.attributeId === 'test_override_attr' && u.unit === 'V')).toBe(true);
  });
});
