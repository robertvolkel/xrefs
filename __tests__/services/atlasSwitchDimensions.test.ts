import { mapAtlasModel, fromParametersJsonb, toParametersJsonb } from '@/lib/services/atlasMapper';

/**
 * Switch body Width/Length — display-only L2 (Switches) canonicals.
 *
 * Switches have no logic table, so switch_width / switch_length are shown but never
 * scored. No product carries a combined dimensions field (verified 0 of 7,479), so
 * these are the only source of W/L; they must NOT collapse onto `outline` (the combined
 * Dimensions field — mapping both there would also collide).
 *
 * This pins three things: (1) the TS mapper produces the two ids with mm units;
 * (2) the .mjs mapper agrees (the mirror audit only compares dict key-sets, so this is
 * the guard against the two copies drifting); (3) the read path (fromParametersJsonb)
 * resolves their display names via the L2 category dict — the gotcha that bit the
 * gaia-only display-only ids.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mjsMapModel: (model: any, mfr: string, sourceFile: string) => any;
beforeAll(async () => {
  const mod = await import('../../scripts/atlas-ingest.mjs');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mjsMapModel = (mod as any).mapModel;
});

// A category containing 'switch' (not 'switching') that is not an IC/connector → 'Switches'.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function switchModel(): any {
  return {
    componentName: 'TEST-SW',
    datasheetUrl: '',
    description: 'Tactile switch',
    category: { c1: { name: 'Electromechanical' }, c2: { name: 'Switches' }, c3: { name: 'Tactile Switches' } },
    parameters: [
      { name: '开关宽度', value: '1.62mm' },
      { name: '开关长度', value: '12.7mm' },
    ],
  };
}

type Slot = { value?: string; numericValue?: number; unit?: string } | undefined;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function slot(out: any, id: string): Slot {
  const params = out?.parameters;
  if (Array.isArray(params)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = params.find((x: any) => x.parameterId === id);
    return p ? { value: p.value, numericValue: p.numericValue, unit: p.unit } : undefined;
  }
  const p = params?.[id];
  return p ? { value: p.value, numericValue: p.numericValue, unit: p.unit } : undefined;
}

describe('switch dimensions — TS mapper', () => {
  const out = mapAtlasModel(switchModel(), 'TestCo', 'test.json');

  it('maps 开关宽度 → switch_width (mm)', () => {
    const w = slot(out, 'switch_width');
    expect(w).toBeDefined();
    expect(w!.value).toBe('1.62mm');
    expect(w!.numericValue).toBeCloseTo(1.62, 6);
    expect(w!.unit).toBe('mm');
  });

  it('maps 开关长度 → switch_length (mm)', () => {
    const l = slot(out, 'switch_length');
    expect(l).toBeDefined();
    expect(l!.value).toBe('12.7mm');
    expect(l!.numericValue).toBeCloseTo(12.7, 6);
    expect(l!.unit).toBe('mm');
  });

  it('does NOT collapse width/length onto outline', () => {
    expect(slot(out, 'outline')).toBeUndefined();
  });
});

describe('switch dimensions — TS and .mjs agree (anti-drift)', () => {
  it('produce identical switch_width / switch_length', () => {
    const model = switchModel();
    const tsOut = mapAtlasModel(model, 'TestCo', 'test.json');
    const mjsOut = mjsMapModel(model, 'TestCo', 'test.json');
    for (const id of ['switch_width', 'switch_length', 'outline']) {
      expect(slot(mjsOut, id)).toEqual(slot(tsOut, id));
    }
  });
});

describe('switch dimensions — read path resolves display names', () => {
  it('fromParametersJsonb labels the ids via the Switches L2 dict', () => {
    const out = mapAtlasModel(switchModel(), 'TestCo', 'test.json');
    const jsonb = toParametersJsonb(out.parameters);
    const read = fromParametersJsonb(jsonb, null, 'Switches');
    const w = read.find((p) => p.parameterId === 'switch_width');
    const l = read.find((p) => p.parameterId === 'switch_length');
    expect(w).toBeDefined();
    expect(w!.parameterName).toBe('Switch Width');
    expect(w!.recognized).toBe(true);
    expect(l).toBeDefined();
    expect(l!.parameterName).toBe('Switch Length');
    expect(l!.recognized).toBe(true);
  });
});
