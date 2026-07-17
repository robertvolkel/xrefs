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

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { searchParts, getAttributes, getRecommendations } from '../lib/services/partDataService';

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

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      if (VOLATILE_KEYS.has(key)) continue;
      out[key] = normalize((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

function stable(value: unknown): string {
  return JSON.stringify(normalize(value), null, 2);
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

async function main() {
  const [mode, arg1, arg2] = process.argv.slice(2);
  if (mode === 'record' && arg1) {
    await record(arg1);
  } else if (mode === 'diff' && arg1 && arg2) {
    const ok = diff(arg1, arg2);
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
    console.error('Usage: providers-characterize.ts record <label> | diff <a> <b> | selftest <label>');
    process.exit(2);
  }
}

main();
