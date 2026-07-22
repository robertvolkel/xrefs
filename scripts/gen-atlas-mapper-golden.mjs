#!/usr/bin/env node
/**
 * Regenerate the golden file for the Atlas ingest mapper test.
 *
 *   node scripts/gen-atlas-mapper-golden.mjs
 *
 * Runs the REAL `mapModel()` from scripts/atlas-ingest.mjs over the committed
 * fixtures and writes what it produced. The test then asserts the mapper still
 * produces exactly that.
 *
 * WHEN A CHANGE IS INTENTIONAL: re-run this, then READ THE DIFF before
 * committing. The diff is the point — it says, in attribute names, exactly what
 * your change did to real product data ("Vrrm moved from raw_vrrm to vrrm").
 * Regenerating without reading it turns the test into a rubber stamp.
 *
 * NOTE: this runs with NO database, so no dictionary overrides are applied.
 * The golden file therefore pins the BASE dictionary behaviour, which is the
 * deterministic part. Override merging is covered separately in the test.
 */
import { readFileSync, writeFileSync } from 'fs';
import { mapModel } from './atlas-ingest.mjs';

const FIXTURES = '__tests__/fixtures/atlasIngestModels.json';
const GOLDEN = '__tests__/fixtures/atlasIngestGolden.json';

/** Replace NaN with a visible sentinel so the golden file cannot lie about it. */
export function encodeNaN(v) {
  if (typeof v === 'number') return Number.isNaN(v) ? '__NaN__' : v;
  if (Array.isArray(v)) return v.map(encodeNaN);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encodeNaN(x)]));
  return v;
}

const fixtures = JSON.parse(readFileSync(FIXTURES, 'utf-8'));
const out = {};

for (const f of fixtures) {
  const r = mapModel(f.model, f.mfr, f.sourceFile);
  out[f.key] = {
    _why: f.why,
    _mpn: f.model.componentName,
    part: r.part,
    classification: r.classification,
    packageValue: r.packageValue,
    // Sorted for a stable diff — key insertion order is an implementation
    // detail and would otherwise produce noise on every unrelated change.
    // NaN is encoded, not serialized: JSON.stringify turns NaN into null, so a
    // raw dump would record "no numeric value" for a parameter the mapper
    // actually produced NaN for — hiding the very case worth seeing. (Real
    // example: storage_temperature "–55 to 125 ℃", an en-dash RANGE that the
    // numeric parser can't reduce to one number.)
    parameters: Object.fromEntries(
      Object.entries(r.parameters)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([k, v]) => [k, encodeNaN(v)]),
    ),
    warnings: [...r.warnings].sort(),
    unmappedParams: [...r.unmappedParams].sort((a, b) => (a.paramName < b.paramName ? -1 : 1)),
  };
}

writeFileSync(GOLDEN, `${JSON.stringify(out, null, 2)}\n`);
const total = Object.values(out).reduce((n, v) => n + Object.keys(v.parameters).length, 0);
console.log(`Wrote ${GOLDEN}: ${Object.keys(out).length} models, ${total} mapped parameters.`);
