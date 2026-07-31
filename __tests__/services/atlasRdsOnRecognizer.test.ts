import path from 'path';
import { mapAtlasModel } from '@/lib/services/atlasMapper';

/**
 * On-resistance recognizer (B5 MOSFET rds_on) — unit-safe mapping.
 * rds_on is a weight-9 lte rule, so a guessed unit is a 1000× error. The recognizer
 * scores ONLY when the unit is explicitly known (value string, then param name), and
 * routes unit-unknown values to the display-only `rds_on_unverified` (which no rule
 * scores). This test pins the real value cases AND asserts the TS mapper
 * (`mapAtlasModel`) and the .mjs mapper (`mapModel`) produce identical results — the
 * mirror audit only compares dict key-sets, NOT code recognizers, so this is the only
 * guard against the two drifting.
 */

const ROOT = path.resolve(__dirname, '..', '..');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mjsMapModel: (model: any, mfr: string, sourceFile: string) => any;
beforeAll(async () => {
  const mod = await import('../../scripts/atlas-ingest.mjs');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mjsMapModel = (mod as any).mapModel;
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function b5Model(paramName: string, value: string): any {
  return {
    componentName: 'TEST-MOSFET',
    datasheetUrl: '',
    description: 'N-Channel MOSFET',
    category: { c1: { name: 'Discrete Semiconductors' }, c2: { name: 'Transistors' }, c3: { name: 'MOSFETs' } },
    parameters: [{ name: paramName, value }],
  };
}

type Slot = { value?: string; numericValue?: number; unit?: string } | undefined;

// Normalize either mapper's output to attributeId → {value, numericValue, unit}.
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

const CASES: Array<{
  name: string; paramName: string; value: string;
  scored: boolean; num?: number; unit?: string;
}> = [
  { name: 'value carries Ω (ignores @10V)', paramName: '导通电阻(RDS(on))', value: '1.13Ω@10V', scored: true, num: 1.13, unit: 'Ω' },
  { name: 'value carries mΩ (ignores @10V,50A)', paramName: '导通电阻(RDS(on))', value: '1.1mΩ@10V,50A', scored: true, num: 0.0011, unit: 'mΩ' },
  { name: 'bare value, unit in NAME (mΩ)', paramName: 'RDS(on)(mΩ)', value: '4', scored: true, num: 0.004, unit: 'mΩ' },
  { name: 'bare value, unit in NAME (Ω)', paramName: 'RDS(on) (Ω) @VGS=10V', value: '4', scored: true, num: 4, unit: 'Ω' },
  { name: 'bare value, NO unit anywhere → parked', paramName: '导通电阻(RDS(on))', value: '4', scored: false },
];

describe('rds_on recognizer — TS mapper', () => {
  for (const c of CASES) {
    it(c.name, () => {
      const out = mapAtlasModel(b5Model(c.paramName, c.value), 'TestCo', 'test.json');
      const rds = slot(out, 'rds_on');
      const unv = slot(out, 'rds_on_unverified');
      if (c.scored) {
        expect(rds).toBeDefined();
        expect(rds!.numericValue).toBeCloseTo(c.num!, 10);
        expect(rds!.unit).toBe(c.unit);
        expect(unv).toBeUndefined();
      } else {
        // Parked: no scored rds_on; shown under rds_on_unverified with NO number.
        expect(rds).toBeUndefined();
        expect(unv).toBeDefined();
        expect(unv!.numericValue).toBeUndefined();
        expect(unv!.value).toBe('4');
      }
    });
  }
});

describe('rds_on recognizer — TS and .mjs agree (anti-drift)', () => {
  for (const c of CASES) {
    it(c.name, () => {
      const model = b5Model(c.paramName, c.value);
      const tsOut = mapAtlasModel(model, 'TestCo', 'test.json');
      const mjsOut = mjsMapModel(model, 'TestCo', 'test.json');
      for (const id of ['rds_on', 'rds_on_unverified']) {
        expect(slot(mjsOut, id)).toEqual(slot(tsOut, id));
      }
    });
  }
});
