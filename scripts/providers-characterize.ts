/**
 * Characterization harness for the data-source connector abstraction.
 *
 * Runs the real engine (searchParts / getAttributes / getRecommendations) against
 * LIVE data sources over a fixed corpus, normalizes out volatile fields (prices,
 * stock, timestamps — which change run-to-run), and records the result. Re-running
 * after a provider-adoption phase and diffing proves the new path returns the SAME
 * parts + parametric data + dataSource/mfrOrigin/certs as today — before its flag
 * is flipped. No "trust"; the diff is the proof.
 *
 * Forces a genuine recompute (PROVIDERS_HARNESS_NO_CACHE=1 + forceRefresh) so a
 * broken new path can't hide behind the shared L2 cache. Commercial data is
 * skipped (skipFindchips) so runs are deterministic; the FindChips seam (Phase 3)
 * is verified separately.
 *
 * Usage (from repo root):
 *   node --env-file=.env.local --import tsx scripts/providers-characterize.ts record <label>
 *   node --env-file=.env.local --import tsx scripts/providers-characterize.ts diff <labelA> <labelB>
 *   node --env-file=.env.local --import tsx scripts/providers-characterize.ts selftest <label>
 *
 * parts.io cases only resolve when on VPN (run this on your local machine to cover them).
 */

process.env.PROVIDERS_HARNESS_NO_CACHE = '1';

// Parts.io's QA endpoint is VPN-gated and slow (8s per-request timeout), which makes
// it a NON-DETERMINISTIC input: two runs can disagree purely on parts.io answering vs
// timing out — not on the code under test. Two OFF-flag runs recorded hours apart were
// observed to differ solely in the recs case for this reason. When a phase does not
// touch the parts.io path (e.g. Phase 2 = PROVIDERS_ATTRS, which only reroutes the
// Digikey/Atlas MPN lookup), set HARNESS_NO_PARTSIO=1 to disable parts.io so the
// off-vs-on diff isolates the actual change. isPartsioConfigured() reads this env var
// at call time, so deleting it here (after --env-file has loaded .env.local) cleanly
// short-circuits every parts.io path. Phase 3 routes parts.io THROUGH the connector and
// will verify it with a deterministic record-and-replay instead of live calls.
if (process.env.HARNESS_NO_PARTSIO === '1') {
  delete process.env.PARTSIO_API_KEY;
  console.log('[harness] HARNESS_NO_PARTSIO=1 — parts.io disabled for this run\n');
}

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { searchParts, getAttributes, getRecommendations } from '../lib/services/partDataService';
import { getPartsioProductDetails } from '../lib/services/partsioClient';

const OUT_DIR = resolve(__dirname, '.characterization');

// ── Corpus ─────────────────────────────────────────────────────────────────
// Keep small + representative. Each case exercises a distinct fetch path.
interface Case {
  name: string;
  run: () => Promise<unknown>;
}

const CORPUS: Case[] = [
  {
    name: 'search:mpn:digikey-mlcc',
    run: () => searchParts('GRM188R71C104KA01D', undefined, undefined, { skipFindchips: true }),
  },
  {
    name: 'search:descriptive:x7r-cap',
    run: () => searchParts('10uF 25V X7R capacitor', undefined, undefined, { skipFindchips: true }),
  },
  {
    name: 'attributes:digikey-mlcc',
    run: () => getAttributes('GRM188R71C104KA01D', undefined, undefined, { skipFindchips: true }),
  },
  {
    name: 'attributes:atlas-isc-schottky',
    run: () =>
      getAttributes('SRF10150CT', undefined, undefined, {
        skipFindchips: true,
        preferredSource: 'atlas',
        manufacturer: 'ISC',
      }),
  },
  {
    name: 'recommendations:digikey-mlcc',
    run: () =>
      getRecommendations('GRM188R71C104KA01D', undefined, undefined, undefined, undefined, undefined, undefined, undefined, {
        skipFindchips: true,
        forceRefresh: true,
      }),
  },
];

// ── Normalization ────────────────────────────────────────────────────────────
// Strip fields that legitimately change run-to-run (price/stock/time). What
// remains is the fetch-path fingerprint the refactor must preserve.
const VOLATILE_KEYS = new Set([
  'fetchedAt',
  'lastChecked',
  'unitPrice',
  'quantityAvailable',
  'supplierQuotes',
  'lifecycleInfo',
  'complianceData',
  'digikeyPriceBreaks',
  'distributorCount',
  'availableOnOrder',
  'leadTime',
  'priceBreaks',
]);

// For the in-process enrich A/B (Phase 3) the client L1 caches pin the upstream
// bytes identical across the off/on pair, so prices/quotes/stock are the SAME on
// both sides and can be verified directly. The only field that still varies is
// the map-time timestamp findchipsMapper stamps onto each quote (`fetchedAt`), so
// strip just the time fields and keep the actual commercial values.
const ENRICH_VOLATILE_KEYS = new Set(['fetchedAt', 'lastChecked']);

function normalize(value: unknown, volatile: Set<string> = VOLATILE_KEYS): unknown {
  if (Array.isArray(value)) return value.map((v) => normalize(v, volatile));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      if (volatile.has(key)) continue;
      out[key] = normalize((value as Record<string, unknown>)[key], volatile);
    }
    return out;
  }
  return value;
}

function stable(value: unknown, volatile: Set<string> = VOLATILE_KEYS): string {
  return JSON.stringify(normalize(value, volatile), null, 2);
}

// ── Modes ─────────────────────────────────────────────────────────────────
async function record(label: string): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  for (const c of CORPUS) {
    const t0 = Date.now();
    try {
      const out = await c.run();
      results[c.name] = stable(out);
      const ms = Date.now() - t0;
      const empty = out == null || (out as { matches?: unknown[] }).matches?.length === 0;
      console.log(`  ✓ ${c.name}  (${ms}ms${empty ? ', EMPTY — source may be unreachable' : ''})`);
    } catch (err) {
      results[c.name] = `__ERROR__ ${err instanceof Error ? err.message : String(err)}`;
      console.log(`  ✗ ${c.name}  ERROR: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const path = resolve(OUT_DIR, `${label}.json`);
  writeFileSync(path, JSON.stringify(results, null, 2));
  console.log(`\nRecorded ${CORPUS.length} cases → ${path}`);
  return results;
}

function load(label: string): Record<string, string> {
  return JSON.parse(readFileSync(resolve(OUT_DIR, `${label}.json`), 'utf8'));
}

function diff(a: string, b: string): boolean {
  const A = load(a);
  const B = load(b);
  const names = [...new Set([...Object.keys(A), ...Object.keys(B)])].sort();
  let allEqual = true;
  for (const name of names) {
    if (A[name] === B[name]) {
      console.log(`  = ${name}`);
    } else {
      allEqual = false;
      console.log(`  ≠ ${name}  DIFFERS`);
      const linesA = (A[name] ?? '').split('\n');
      const linesB = (B[name] ?? '').split('\n');
      let shown = 0;
      for (let i = 0; i < Math.max(linesA.length, linesB.length) && shown < 8; i++) {
        if (linesA[i] !== linesB[i]) {
          console.log(`      L${i + 1}  ${a}: ${(linesA[i] ?? '∅').trim().slice(0, 90)}`);
          console.log(`           ${b}: ${(linesB[i] ?? '∅').trim().slice(0, 90)}`);
          shown++;
        }
      }
    }
  }
  console.log(`\n${allEqual ? '✅ IDENTICAL' : '❌ DIFFERENCES FOUND'} (${a} vs ${b})`);
  return allEqual;
}

// ── Phase 3: in-process enrich A/B ─────────────────────────────────────────
// The parts.io + FindChips enrichment path returns live prices that change
// minute-to-minute, so a cross-process off-vs-on `diff` would show spurious
// differences from the source, not the code. Instead: run getAttributes twice in
// ONE process, toggling only PROVIDERS_ENRICH, after pre-warming both sources
// into their in-memory L1 caches. Both flag states then read identical pinned
// upstream bytes, so any surviving difference is purely the provider swap. This
// exercises parts.io + FindChips FOR REAL (parts.io must be reachable → VPN on),
// and a meaningfulness guard rejects a vacuous "identical because both empty".
interface EnrichCase {
  name: string;
  mpn: string;
  opts?: { skipFindchips?: boolean; preferredSource?: 'digikey' | 'atlas' | 'partsio'; manufacturer?: string };
}
const ENRICH_CORPUS: EnrichCase[] = [
  { name: 'digikey-mlcc', mpn: 'GRM188R71C104KA01D' },
  { name: 'atlas-isc-schottky', mpn: 'SRF10150CT', opts: { preferredSource: 'atlas', manufacturer: 'ISC' } },
];

async function enrichAb(): Promise<boolean> {
  // Isolate Phase 3: hold the Phase-2 lookup flag constant (already proven
  // identical), toggle ONLY PROVIDERS_ENRICH.
  process.env.PROVIDERS_ATTRS = '0';
  if (process.env.HARNESS_NO_PARTSIO === '1') {
    console.log('⚠ HARNESS_NO_PARTSIO=1 is set — the parts.io half of Phase 3 is NOT exercised. Unset it + enable the VPN for a full run.\n');
  }

  let differed = false;
  let meaningful = 0;
  for (const c of ENRICH_CORPUS) {
    // 1. Pre-warm the flaky parts.io endpoint into its L1 cache, retrying through
    //    timeouts, so both flag states below read identical pinned data.
    let warmed = false;
    for (let i = 0; i < 5 && !warmed; i++) {
      try { await getPartsioProductDetails(c.mpn); warmed = true; }
      catch { /* parts.io timeout — retry */ }
    }
    // 2. Warm pass (discard) — runs the real enrich path with the flag off to
    //    populate the FindChips L1 cache (and belt-and-suspenders parts.io).
    process.env.PROVIDERS_ENRICH = '0';
    await getAttributes(c.mpn, undefined, undefined, c.opts);

    // 3. OFF then ON — both are now pure L1 reads (no network, no flakiness).
    process.env.PROVIDERS_ENRICH = '0';
    const off = await getAttributes(c.mpn, undefined, undefined, c.opts);
    process.env.PROVIDERS_ENRICH = '1';
    const on = await getAttributes(c.mpn, undefined, undefined, c.opts);

    // Meaningfulness guard: the comparison is a placebo if enrichment produced
    // nothing (both sides == un-enriched base). Require real parts.io or FC data.
    const contributed = !!(
      on?.enrichedFrom === 'partsio'
      || on?.part.supplierQuotes
      || on?.part.lifecycleInfo
      || on?.part.complianceData
    );
    const warmNote = warmed ? '' : ' (parts.io never warmed — VPN off?)';

    const sOff = stable(off, ENRICH_VOLATILE_KEYS);
    const sOn = stable(on, ENRICH_VOLATILE_KEYS);
    if (sOff !== sOn) {
      differed = true;
      console.log(`  ≠ enrich:${c.name}  DIFFERS${warmNote}`);
      const la = sOff.split('\n'), lb = sOn.split('\n');
      let shown = 0;
      for (let i = 0; i < Math.max(la.length, lb.length) && shown < 8; i++) {
        if (la[i] !== lb[i]) {
          console.log(`      L${i + 1}  off: ${(la[i] ?? '∅').trim().slice(0, 90)}`);
          console.log(`           on:  ${(lb[i] ?? '∅').trim().slice(0, 90)}`);
          shown++;
        }
      }
    } else if (contributed) {
      meaningful++;
      console.log(`  = enrich:${c.name}  (identical, with real enrichment data)`);
    } else {
      console.log(`  ⚠ enrich:${c.name}  identical but NO enrichment data — inconclusive${warmNote}`);
    }
  }

  if (differed) {
    console.log('\n❌ DIFFERENCES FOUND (enrich off vs on)');
    return false;
  }
  if (meaningful === 0) {
    console.log('\n⚠ INCONCLUSIVE — no case produced enrichment data (VPN off, or FindChips/parts.io returned nothing). Not a valid proof.');
    return false;
  }
  console.log(`\n✅ IDENTICAL (enrich off vs on; ${meaningful} case(s) verified with real parts.io + FindChips data)`);
  return true;
}

async function main() {
  const [mode, arg1, arg2] = process.argv.slice(2);
  if (mode === 'record' && arg1) {
    await record(arg1);
  } else if (mode === 'diff' && arg1 && arg2) {
    const ok = diff(arg1, arg2);
    process.exit(ok ? 0 : 1);
  } else if (mode === 'enrich-ab') {
    const ok = await enrichAb();
    process.exit(ok ? 0 : 1);
  } else if (mode === 'selftest' && arg1) {
    // Prove the harness is (a) deterministic and (b) sensitive to change.
    console.log('Recording baseline run A...');
    await record(`${arg1}__A`);
    console.log('Recording baseline run B (no code change — must be IDENTICAL)...');
    await record(`${arg1}__B`);
    console.log('\n[determinism] A vs B:');
    const stable1 = diff(`${arg1}__A`, `${arg1}__B`);
    // Sensitivity: mutate one recorded case and confirm the diff catches it.
    const mutated = load(`${arg1}__B`);
    const firstKey = Object.keys(mutated)[0];
    mutated[firstKey] = (mutated[firstKey] ?? '') + '\n__INJECTED_CHANGE__';
    writeFileSync(resolve(OUT_DIR, `${arg1}__MUT.json`), JSON.stringify(mutated, null, 2));
    console.log('\n[sensitivity] B vs MUT (must report a DIFFERENCE):');
    const caughtChange = !diff(`${arg1}__B`, `${arg1}__MUT`);
    console.log(`\nSELFTEST: determinism=${stable1 ? 'PASS' : 'FAIL'}  sensitivity=${caughtChange ? 'PASS' : 'FAIL'}`);
    process.exit(stable1 && caughtChange ? 0 : 1);
  } else {
    console.error('Usage: providers-characterize.ts record <label> | diff <a> <b> | selftest <label> | enrich-ab');
    process.exit(2);
  }
}

main();
