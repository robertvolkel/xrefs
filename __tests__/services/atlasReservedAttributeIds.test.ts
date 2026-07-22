import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  RESERVED_ATTRIBUTE_IDS,
  RAW_KEY_PREFIX,
  rawIdForParam,
  mapAtlasModel,
} from '@/lib/services/atlasMapper';
import { getAllLogicTables } from '@/lib/logicTables';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { mapModel } = require('../../scripts/atlas-ingest.mjs');

const GENERATED = JSON.parse(
  readFileSync(resolve(process.cwd(), 'lib/services/atlas-reserved-attribute-ids.json'), 'utf-8'),
) as { count: number; ids: string[] };

/**
 * Decision #278 shipped claiming "raw ids appear in no logic table, so scoring
 * is untouched." That was false. `rawIdForParam` joins on underscores, so an
 * unmapped supplier column called "RDS(on)" slugs to exactly `rds_on` — a
 * weight-9 threshold rule — and matchingEngine.ts:23 returns a stored
 * numericValue verbatim with no re-parse or unit check.
 *
 * Measured on the live database (106,000 products, 24.3% of the corpus) before
 * the fix: 6,958 values sat in scoring slots carrying a number produced by a
 * path that never normalized units.
 */
describe('RESERVED_ATTRIBUTE_IDS — raw keys must never occupy a scoring slot', () => {
  it('covers every attributeId across all 43 logic tables', () => {
    const fromRegistry = new Set(
      getAllLogicTables().flatMap(t => (t.rules ?? []).map(r => r.attributeId).filter(Boolean)),
    );
    expect(fromRegistry.size).toBeGreaterThan(400);
    expect([...RESERVED_ATTRIBUTE_IDS].sort()).toEqual([...fromRegistry].sort());
  });

  /**
   * THE STALENESS GATE. scripts/atlas-ingest.mjs is the LIVE ingest path and
   * cannot import TS, so it reads the generated JSON. If someone adds a family
   * or a rule and forgets `npm run atlas:reserved-ids`, the live path would
   * leave that new scoring slot unprotected. This fails instead.
   */
  it('the generated JSON the LIVE ingest path reads is not stale', () => {
    expect(GENERATED.ids.length).toBe(GENERATED.count);
    expect([...GENERATED.ids].sort()).toEqual([...RESERVED_ATTRIBUTE_IDS].sort());
  });

  it('the escape prefix is not itself a reserved id — the escape cannot collide in turn', () => {
    for (const id of RESERVED_ATTRIBUTE_IDS) {
      expect(id.startsWith(RAW_KEY_PREFIX)).toBe(false);
    }
  });

  it('the collision is real: "RDS(on)" slugs onto a weight-9 scoring rule', () => {
    expect(rawIdForParam('RDS(on)')).toBe('rds_on');
    expect(RESERVED_ATTRIBUTE_IDS.has('rds_on')).toBe(true);
  });

  /**
   * TWO different keys reach a reserved slot and they are NOT the same code
   * path — the guard has to sit below both, which is why it lives inside
   * storeRawValue rather than in rawIdForParam.
   *
   *  - `rawIdForParam` (Unicode-preserving) collides for an ASCII name.
   *  - the HISTORICAL ASCII slug, passed in as `preferredId` by the unmapped
   *    branch, collides for a CHINESE name: every CJK character becomes a
   *    separator and is then stripped. This is the route the live data took —
   *    the production rows carried the source column 导通电阻(RDS(on)).
   */
  it('the Chinese spelling reaches the same slot by the OTHER route', () => {
    // rawIdForParam keeps CJK, so on its own it does NOT collide...
    expect(rawIdForParam('导通电阻(RDS(on))')).toBe('导通电阻_rds_on');
    // ...but the historical ASCII slug that the unmapped branch prefers does.
    const historicalSlug = (lower: string) =>
      lower.replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    expect(historicalSlug('导通电阻(rds(on))')).toBe('rds_on');
    expect(RESERVED_ATTRIBUTE_IDS.has('rds_on')).toBe(true);
  });
});

/**
 * Real shape: an unmapped supplier column whose name slugs onto a scoring slot,
 * carrying a prefixed value. Both bugs at once — wrong slot AND wrong scale.
 * Taken from live rows (Siliup/SP40N25TQ carried exactly "80mΩ@10V").
 */
const MODEL_WITH_COLLIDING_UNMAPPED_PARAM = {
  componentName: 'TEST-COLLIDE-1',
  description: 'N-Channel MOSFET',
  datasheetUrl: '',
  category: { c1: { name: 'Discrete Semiconductors' }, c2: { name: 'Transistors' }, c3: { name: 'MOSFET' } },
  parameters: [
    // No dictionary entry — falls through to the raw path and slugs to `rds_on`.
    // This is the LIVE spelling: production rows carried this exact column name
    // with this exact value (Siliup/SP40N25TQ), stored as numericValue 80.
    { name: '导通电阻(RDS(on))', value: '80mΩ@10V' },
  ],
};

describe.each([
  ['mapAtlasModel (TS)', (m: unknown) => {
    const out = mapAtlasModel(m as Parameters<typeof mapAtlasModel>[0], 'TestMfr', 'test.json');
    return Object.fromEntries(out.parameters.map(p => [p.parameterId, p]));
  }],
  ['mapModel (LIVE .mjs)', (m: unknown) => mapModel(m, 'TestMfr', 'test.json').parameters],
])('%s — an unmapped param never lands in a scoring slot', (_label, run) => {
  it('escapes the reserved key instead of occupying it', () => {
    const params = run(MODEL_WITH_COLLIDING_UNMAPPED_PARAM) as Record<string, { value: string; numericValue?: number }>;
    expect(params.rds_on).toBeUndefined();
    expect(params.raw_rds_on).toBeDefined();
    expect(params.raw_rds_on.value).toBe('80mΩ@10V');
  });

  it('normalizes the rescued value to base SI like every winner path', () => {
    const params = run(MODEL_WITH_COLLIDING_UNMAPPED_PARAM) as Record<string, { numericValue?: number }>;
    // 80 mΩ is 0.08 Ω. Storing 80 is a thousand times off on a weight-9 `lte`
    // rule — the part reads as far worse than it is and fails a rule it passes.
    expect(params.raw_rds_on.numericValue).toBeCloseTo(0.08, 9);
  });
});
