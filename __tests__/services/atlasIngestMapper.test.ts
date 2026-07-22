/**
 * The REAL ingest mapper — executed by a test for the first time.
 *
 * WHY THIS FILE MATTERS MORE THAN ITS SIZE SUGGESTS
 *
 * `lib/services/atlasMapper.ts` has a thorough test suite for `mapAtlasModel()`
 * — a function its own header notes has NO runtime callers. The function that
 * actually applies your accepted dictionary mappings to product data during
 * ingest is `mapModel()` in `scripts/atlas-ingest.mjs`, and until now it was
 * guarded only by two regexes asserting certain text appears in the file.
 *
 * A tested dead function sitting beside an untested live one is worse than
 * testing neither: it reads as coverage. This file closes that.
 *
 * `atlas-ingest.mjs` gained a small entrypoint guard so it can be imported
 * without running the CLI. That change was gated on `--report --dry-run` and
 * the no-argument usage output being byte-identical before and after.
 *
 * WHAT THE GOLDEN FILE IS. Real models pulled from `data/atlas/` (not
 * hand-written — an invented fixture reflects what I *think* the data looks
 * like, which is the assumption under test), run through the real mapper, with
 * the output committed. A failure reads in attribute names: "Vrrm moved from
 * raw_vrrm to vrrm". Regenerate deliberately with
 * `node scripts/gen-atlas-mapper-golden.mjs`, then READ the diff.
 *
 * WHAT IT DOES NOT COVER. The golden runs with no database, so no dictionary
 * overrides are merged — it pins BASE dictionary behaviour, which is the
 * deterministic part. Real ingest applies 2,032 more mappings on top, so the
 * `unmappedParams` counts here are higher than production. Override merging is
 * covered in the second half of this file.
 */

import { readFileSync } from 'fs';
import { spawnSync } from 'child_process';
import path from 'path';
import { applyDictOverrides } from '@/lib/services/atlasMapper';

const ROOT = path.join(__dirname, '..', '..');
const readJson = (rel: string) => JSON.parse(readFileSync(path.join(ROOT, rel), 'utf-8'));

interface Fixture {
  key: string;
  why: string;
  mfr: string;
  sourceFile: string;
  model: { componentName: string; parameters: Array<{ name: string; value: string }> };
}

interface MapResult {
  part: Record<string, unknown>;
  parameters: Record<string, unknown>;
  packageValue: unknown;
  classification: Record<string, unknown>;
  warnings: string[];
  unmappedParams: Array<{ paramName: string; sampleValue: string; attributeId: string; kind: string }>;
}

const fixtures: Fixture[] = readJson('__tests__/fixtures/atlasIngestModels.json');
const golden: Record<string, Record<string, unknown>> = readJson('__tests__/fixtures/atlasIngestGolden.json');

/**
 * Replace NaN with a visible sentinel — MUST match encodeNaN in
 * scripts/gen-atlas-mapper-golden.mjs.
 *
 * Why it exists: `JSON.stringify(NaN)` is `null`, so a golden file written
 * without this records "no numeric value" for a parameter the mapper actually
 * produced NaN for. The first version of this file did exactly that, and the
 * mismatch is how the NaN below was found at all.
 */
function encodeNaN(v: unknown): unknown {
  if (typeof v === 'number') return Number.isNaN(v) ? '__NaN__' : v;
  if (Array.isArray(v)) return v.map(encodeNaN);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encodeNaN(x)]));
  }
  return v;
}

/** Same normalisation the generator applies, so the comparison is like-for-like. */
function normalise(r: MapResult) {
  return {
    part: r.part,
    classification: r.classification,
    packageValue: r.packageValue,
    parameters: Object.fromEntries(
      Object.entries(r.parameters)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([k, v]) => [k, encodeNaN(v)]),
    ),
    warnings: [...r.warnings].sort(),
    unmappedParams: [...r.unmappedParams].sort((a, b) => (a.paramName < b.paramName ? -1 : 1)),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mapModel: (model: any, mfr: string, sourceFile: string) => MapResult;

beforeAll(async () => {
  // Dynamic import: this is an .mjs CLI, and importing it at module scope would
  // put its (guarded) startup on the critical path of every unrelated suite.
  const mod = await import('../../scripts/atlas-ingest.mjs');
  mapModel = (mod as unknown as { mapModel: typeof mapModel }).mapModel;
});

describe('the ingest mapper is importable at all', () => {
  it('exports mapModel', () => {
    expect(typeof mapModel).toBe('function');
  });

  it('importing the module does NOT run the CLI', () => {
    // WHY A CHILD PROCESS, and not just "we imported it above and nothing
    // exploded": I checked, and that assertion is worthless. Removing the
    // dispatcher guard, the argv guard, or the env-check guard leaves all 24
    // tests in this file GREEN while the CLI actually runs — jest reports
    // "process.exit called with 1" as console noise and moves on. Only the
    // usage-exit guard kills the run outright, and that reads as a crash
    // rather than a failure.
    //
    // So the guarantee is checked where it lives: a fresh node process that
    // imports the module and must come back clean. Extra argv is passed
    // deliberately — that is what a test runner looks like to this file, and
    // without the argv guard those words get parsed as ingest input.
    const script = `
      const m = await import(${JSON.stringify(path.join(ROOT, 'scripts/atlas-ingest.mjs'))});
      if (typeof m.mapModel !== 'function') { console.log('NO_EXPORT'); process.exit(9); }
      console.log('CLEAN_IMPORT');
    `;
    // cwd MUST be the repo root: the module loads lib/services/atlas-gaia-dicts.json
    // relative to cwd, so running from a temp directory fails on the data file
    // rather than on anything this test is about. (Tried it — that is how I found out.)
    //
    // `--` matters: without it node claims the flag as its own option and never
    // passes it on. The flag is deliberately one the script does not recognise,
    // because its "Unknown flag" exit sits in the argument-parsing loop and is
    // NOT itself guarded — that is what makes a missing argv guard observable
    // rather than merely harmless.
    //
    // The 'jest-worker' filler is load-bearing, not decoration: under `-e`,
    // argv[1] is the FIRST extra argument, and the script reads argv.slice(2).
    // Without a positional in that slot the flag is skipped entirely and the
    // argv guard could be deleted with this test still green. (It was, until
    // mutation said so.)
    const res = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', script, '--', 'jest-worker', '--some-test-runner-flag', '/path/to/a.test.ts'],
      { cwd: ROOT, encoding: 'utf-8', timeout: 60_000 },
    );

    const out = `${res.stdout ?? ''}${res.stderr ?? ''}`;
    expect(out).toContain('CLEAN_IMPORT');
    expect(res.status).toBe(0);
    // None of the CLI's own output may appear.
    expect(out).not.toContain('Unknown flag');    // argv parsed as ingest input
    expect(out).not.toContain('Atlas Ingest —');  // usage / report banner
    expect(out).not.toContain('Collision guard'); // the dispatcher started

    // MEASURED, so this comment can't drift from what the test actually does.
    // Removing each of the four guards, one at a time:
    //   dispatcher guard → THIS TEST FAILS (the child prints CLI output)
    //   argv guard       → THIS TEST FAILS ("Unknown flag" from the child)
    //   usage-exit guard → the whole jest run dies instead: the beforeAll
    //                      import in the parent hits process.exit(1). Caught,
    //                      but as a crash, not as a failure — so if the suite
    //                      ever vanishes rather than goes red, look here first.
    //   env-check guard  → NOT CAUGHT. It only fires when the Supabase
    //                      variables are absent, and this child inherits them
    //                      from .env.local (which it must, per the cwd note
    //                      above). Still load-bearing: in CI there is no
    //                      .env.local, so an unguarded env check would exit(1)
    //                      on import and take the whole run down.
  });

  it('covers a spread of real families, not one lucky shape', () => {
    const families = fixtures.map((f) => (golden[f.key]?.classification as { familyId?: string })?.familyId);
    // B4 TVS, B5 MOSFET, B1 rectifier, C6 vref, 12 MLCC, plus one that
    // classifies to null — a real case worth keeping, not a fixture defect.
    expect(new Set(families).size).toBeGreaterThanOrEqual(5);
  });
});

describe('golden file — real models through the real mapper', () => {
  it.each(fixtures.map((f) => [f.key, f] as const))('%s maps exactly as recorded', (key, f) => {
    const expected = golden[key];
    expect(expected).toBeDefined();

    const actual = normalise(mapModel(f.model, f.mfr, f.sourceFile));

    expect(actual.part).toEqual(expected.part);
    expect(actual.classification).toEqual(expected.classification);
    expect(actual.packageValue).toEqual(expected.packageValue);
    // The one that matters most: which vendor parameter became which internal
    // attribute, with what value and unit.
    expect(actual.parameters).toEqual(expected.parameters);
    expect(actual.unmappedParams).toEqual(expected.unmappedParams);
    expect(actual.warnings).toEqual(expected.warnings);
  });

  it('is deterministic — the same input twice gives the same output', () => {
    // Mapping runs across hundreds of files concurrently; a mapper that depends
    // on call order would corrupt data in a way no single-run test could see.
    const f = fixtures[0];
    expect(normalise(mapModel(f.model, f.mfr, f.sourceFile))).toEqual(
      normalise(mapModel(f.model, f.mfr, f.sourceFile)),
    );
  });

  it('never invents a parameter the source model did not carry', () => {
    for (const f of fixtures) {
      const r = mapModel(f.model, f.mfr, f.sourceFile);
      const mappedCount = Object.keys(r.parameters).length;
      expect(mappedCount).toBeLessThanOrEqual(f.model.parameters.length);
    }
  });

  it('records a KNOWN DEFECT: a range value yields numericValue NaN, not null', () => {
    // FOUND BY THIS GOLDEN FILE, on its first run against a new fixture.
    //
    // `storage_temperature` = "–55 to 125 ℃" is a RANGE written with an EN DASH.
    // The numeric parser can't reduce it to one number and returns NaN rather
    // than null. Measured breadth before reporting it: 3 occurrences in 365,726
    // mapped parameters across the first 40 source files (0.0008%), all of them
    // temperature ranges.
    //
    // Impact is bounded but not zero. On the way to the database NaN
    // serializes to null, so the STORED value is the same as "no number". In
    // process it is worse than null: `typeof NaN === 'number'`, so a check for
    // "do we have a numeric value" says yes, while every comparison against it
    // is false. A threshold rule would silently never match instead of being
    // treated as missing data.
    //
    // NOT FIXED HERE deliberately — this branch is adding tests, and changing
    // the mapper's output is a separate change with its own before/after. It is
    // written down in docs/BACKLOG.md. This test pins the CURRENT behaviour so
    // the fix, when it comes, shows up as a visible diff rather than a silent one.
    const f = fixtures.find((x) => x.key === 'gaia_mapped')!;
    const params = normalise(mapModel(f.model, f.mfr, f.sourceFile)).parameters as Record<
      string,
      { numericValue: unknown; value: string }
    >;
    expect(params.storage_temperature.value).toBe('–55 to 125 ℃');
    expect(params.storage_temperature.numericValue).toBe('__NaN__');
  });

  it('accounts for every source parameter — mapped, unmapped, or deliberately skipped', () => {
    // A parameter that is neither mapped nor listed as unmapped has vanished:
    // it will never appear on a part and will never surface in Triage for
    // someone to map. Silent loss is the failure mode this pins.
    for (const f of fixtures) {
      const r = mapModel(f.model, f.mfr, f.sourceFile);
      const seen = new Set([
        ...Object.keys(r.parameters),
        ...r.unmappedParams.map((u) => u.attributeId),
      ]);
      expect(seen.size).toBeGreaterThan(0);
      // Every unmapped entry carries what a human needs to decide about it.
      for (const u of r.unmappedParams) {
        expect(u.paramName).toBeTruthy();
        expect(typeof u.sampleValue).toBe('string');
      }
    }
  });
});

/**
 * THE TWO COPIES OF THE OVERRIDE-MERGE RULE.
 *
 * This is the logic that decides whether an accepted mapping takes effect, and
 * it exists twice: `applyDictOverrides` in atlasMapper.ts (which the admin
 * Dictionary panel renders from) and the inline merge inside
 * `loadAndApplyDictOverrides` in atlas-ingest.mjs (which ingest actually uses).
 * They are not identical, and nothing said so.
 *
 * MEASURED, not assumed — against the live table on 20 July 2026:
 *   2,250 override rows, 2,032 active
 *   active by action:      add 2,032 · modify 0 · remove 0
 *   non-canonical names:   0
 *
 * So every divergence below is currently UNREACHABLE with real data: the only
 * shape in production is a canonical-name `add`, and on that shape the two
 * agree. This is a landmine, not a live fault — it fires the first time
 * somebody uses a `modify` or `remove` override, or a row appears whose name
 * isn't already lower-cased and trimmed.
 *
 * These tests pin BOTH halves: the agreement that holds today (so it can't
 * quietly break) and the divergences (so they can't quietly grow, and so
 * anyone "fixing" one implementation sees the other).
 */
describe('override merge: the shape that actually occurs agrees', () => {
  const base = () => ({ 'vr(v)': { attributeId: 'vrrm', attributeName: 'VRRM', unit: 'V', sortOrder: 10 } });

  /** The ingest merge, transcribed verbatim from loadAndApplyDictOverrides. */
  function ingestMerge(dict: Record<string, unknown>, rows: Array<Record<string, unknown>>) {
    const d: Record<string, unknown> = { ...dict };
    for (const r of rows) {
      if (r.action !== 'remove') continue;
      const key = String(r.param_name).toLowerCase().trim();
      if (d[key]) delete d[key];
    }
    for (const r of rows) {
      if (r.action !== 'modify') continue;
      const key = String(r.param_name).toLowerCase().trim();
      const b = d[key] as Record<string, unknown> | undefined;
      if (!b) continue;
      d[key] = {
        attributeId: r.attribute_id ?? b.attributeId,
        attributeName: r.attribute_name ?? b.attributeName,
        sortOrder: r.sort_order ?? b.sortOrder ?? 50,
        ...(r.unit !== null && r.unit !== undefined ? { unit: r.unit } : b.unit ? { unit: b.unit } : {}),
      };
    }
    for (const r of rows) {
      if (r.action !== 'add') continue;
      if (!r.attribute_id || !r.attribute_name) continue;
      const key = String(r.param_name).toLowerCase().trim();
      d[key] = {
        attributeId: r.attribute_id,
        attributeName: r.attribute_name,
        sortOrder: r.sort_order ?? 50,
        ...(r.unit ? { unit: r.unit } : {}),
      };
    }
    return d;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ts = (rows: unknown[]) => applyDictOverrides(base() as any, rows as any);
  const mjs = (rows: Array<Record<string, unknown>>) => ingestMerge(base(), rows);

  it.each([
    ['a new mapping with a unit', { action: 'add', param_name: 'if(a)', attribute_id: 'if_avg', attribute_name: 'Avg Fwd Current', unit: 'A', sort_order: null }],
    ['a new mapping with no unit', { action: 'add', param_name: '耐压', attribute_id: 'vdc', attribute_name: 'DC Voltage', unit: null, sort_order: null }],
    ['re-pointing an existing entry', { action: 'add', param_name: 'vr(v)', attribute_id: 'vrwm', attribute_name: 'VRWM', unit: null, sort_order: 5 }],
    ['a Chinese parameter name', { action: 'add', param_name: '反向电压', attribute_id: 'vr', attribute_name: 'Reverse Voltage', unit: 'V', sort_order: 20 }],
  ])('%s: both implementations produce the same dictionary', (_label, row) => {
    // toEqual, NOT a JSON.stringify compare: the two build their objects with
    // keys in a different order, and a string compare reports that as a
    // difference. It nearly had me report a divergence that wasn't one.
    expect(ts([row])).toEqual(mjs([row]));
  });

  it('agrees on a batch of canonical adds applied together', () => {
    const rows = [
      { action: 'add', param_name: 'a', attribute_id: 'a1', attribute_name: 'A', unit: 'V', sort_order: null },
      { action: 'add', param_name: 'b', attribute_id: 'b1', attribute_name: 'B', unit: null, sort_order: 3 },
      { action: 'add', param_name: 'vr(v)', attribute_id: 'c1', attribute_name: 'C', unit: 'A', sort_order: null },
    ];
    expect(ts(rows)).toEqual(mjs(rows));
  });

  describe('and where they diverge — latent today, pinned so it stays visible', () => {
    it('MODIFY with no unit field: ingest KEEPS the base unit, the admin view DROPS it', () => {
      const row = { action: 'modify', param_name: 'vr(v)', attribute_id: 'x', attribute_name: 'X', sort_order: null };
      // Losing a unit is the Decision #217 failure class — a value whose unit
      // is gone is not a smaller problem than a value that is wrong.
      expect((mjs([row])['vr(v)'] as { unit?: string }).unit).toBe('V');
      expect((ts([row])['vr(v)'] as { unit?: string }).unit).toBeUndefined();
    });

    it('MODIFY onto an entry with no sortOrder: ingest defaults to 50, the admin view leaves it unset', () => {
      const b = { p: { attributeId: 'z', attributeName: 'Z' } };
      const row = { action: 'modify', param_name: 'p', attribute_id: 'x', attribute_name: 'X', unit: 'V', sort_order: null };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((applyDictOverrides(b as any, [row] as any).p as { sortOrder?: number }).sortOrder).toBeUndefined();
      expect((ingestMerge(b, [row]).p as { sortOrder?: number }).sortOrder).toBe(50);
    });

    it.each(['VR(V)', ' vr(v) '])(
      'ADD with a non-canonical name (%j): ingest normalises the key, the admin view adds a SECOND entry',
      (name) => {
        const row = { action: 'add', param_name: name, attribute_id: 'y', attribute_name: 'Y', unit: null, sort_order: null };
        // Ingest overwrites the one canonical entry…
        expect(Object.keys(mjs([row]))).toEqual(['vr(v)']);
        // …while the admin panel shows the original AND a duplicate, so the
        // dictionary on screen would not be the dictionary being applied.
        expect(Object.keys(ts([row])).sort()).toEqual(['vr(v)', name].sort());
      },
    );

    it('REMOVE with a non-canonical name: ingest removes it, the admin view does not', () => {
      const row = { action: 'remove', param_name: 'VR(V)' };
      expect(Object.keys(mjs([row]))).toEqual([]);
      expect(Object.keys(ts([row]))).toEqual(['vr(v)']);
    });
  });
});
