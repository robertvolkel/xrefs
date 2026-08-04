import { mapAtlasModel } from '@/lib/services/atlasMapper';

/**
 * B5 MOSFET switching-time suppression (Option 1): rise/fall/turn-on-delay/turn-off-delay/
 * turn-on/turn-off time are display-only, test-dependent, and not comparable — the schema
 * keeps only body_diode_trr and hides the rest (matching the B6 `_tf`/`_ton` convention).
 * The gaia dict maps them to underscore ids (`_tr`/`_tf`/`_td_on`/`_td_off`/`_ton`/`_toff`),
 * which the mapper drops.
 *
 * The load-bearing check: a stem present with BOTH -Typ and a non-preferred suffix (-Max)
 * must NOT leak the -Max value under a raw name via keepLosingValue → storeRawValue. And a
 * non-suppressed gaia spec (qg) must still map, proving the model is really processed.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mjsMapModel: (model: any, mfr: string, sourceFile: string) => any;
beforeAll(async () => {
  const mod = await import('../../scripts/atlas-ingest.mjs');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mjsMapModel = (mod as any).mapModel;
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function b5Model(params: Array<{ name: string; value: string }>): any {
  return {
    componentName: 'TEST-MOSFET',
    datasheetUrl: '',
    description: 'N-Channel MOSFET',
    category: { c1: { name: 'Discrete Semiconductors' }, c2: { name: 'Transistors' }, c3: { name: 'MOSFETs' } },
    parameters: params,
  };
}

const SWITCHING = [
  { name: 'gaia-turn_on_delay_time-Typ', value: '12 ns' },
  { name: 'gaia-turn_on_delay_time-Max', value: '25 ns' }, // non-preferred variant — must not leak
  { name: 'gaia-turn_off_delay_time-Typ', value: '30 ns' },
  { name: 'gaia-turn_on_rise_time-Typ', value: '14 ns' },
  { name: 'gaia-rise_time-Typ', value: '10 ns' },
  { name: 'gaia-fall_time-Typ', value: '9 ns' },
  { name: 'gaia-turn_off_fall_time-Typ', value: '11 ns' },
  { name: 'gaia-turn_on_time-Typ', value: '40 ns' },
  { name: 'gaia-turn_off_time-Typ', value: '45 ns' },
];
const CONTROL = { name: 'gaia-total_gate_charge-Typ', value: '11 nC' }; // maps to qg (shown)

// Any parameterId or name that reveals a switching-time value slipped through.
const LEAK_RE = /rise|fall|delay|turn.?on|turn.?off|\btr\b|\btf\b|\bton\b|\btoff\b|td_on|td_off/i;

describe('B5 MOSFET switching times are fully suppressed', () => {
  for (const [label, run] of [
    ['TS mapAtlasModel', (m: unknown) => mapAtlasModel(m as never, 'TestCo', 't.json')],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ['mjs mapModel', (m: unknown) => mjsMapModel(m as any, 'TestCo', 't.json')],
  ] as const) {
    it(`${label}: no switching-time param leaks (incl. non-preferred -Max), control present`, () => {
      const out = run(b5Model([...SWITCHING, CONTROL]));
      // normalize either mapper's output to a list of {id, name}
      const params = Array.isArray(out.parameters)
        ? out.parameters.map((p: { parameterId: string; parameterName: string }) => ({ id: p.parameterId, name: p.parameterName }))
        : Object.entries(out.parameters).map(([id, v]) => ({ id, name: (v as { parameterName?: string }).parameterName ?? '' }));

      const leaked = params.filter((p: { id: string; name: string }) => LEAK_RE.test(p.id) || LEAK_RE.test(p.name));
      expect(leaked).toEqual([]); // nothing switching-time-shaped survived

      // control: qg must be present (proves the gaia pipeline ran on this model)
      expect(params.some((p: { id: string }) => p.id === 'qg')).toBe(true);
    });
  }
});
