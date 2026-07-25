/**
 * Manual proof of the FindChips maker-aware fix — LIVE data, real code paths.
 *
 * Pulls a real FindChips response for a shared/jellybean MPN, then runs the SAME
 * transforms the app runs:
 *   BEFORE (maker-blind, the bug)  = mapFCToQuotes(results)
 *   AFTER  (maker-aware, the fix)  = mapFCToQuotes(filterFcResultsByMaker(results, maker))
 * plus the per-maker distributor count that now drives the search-card badge.
 *
 * No cache / Supabase writes — it fetches FindChips directly and applies the real
 * pure functions. Read the output; you never have to click a distributor site.
 *
 * Run from the repo root:  npx tsx scripts/fc-maker-proof.ts [MPN] [maker]
 *   e.g. npx tsx scripts/fc-maker-proof.ts LM317T
 *        npx tsx scripts/fc-maker-proof.ts 1N4148
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { filterFcResultsByMaker, mapFCToQuotes } from '../lib/services/findchipsMapper';
import { computePerMakerDistributorCounts } from '../lib/services/findchipsDistributorCount';
import type { FCDistributorResult } from '../lib/services/findchipsClient';

// --- load .env.local (FINDCHIPS_API_KEY + anything the imported modules read) ---
function loadEnv(path: string) {
  let raw: string;
  try { raw = readFileSync(path, 'utf8'); } catch { return; }
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = val;
  }
}
loadEnv(join(dirname(fileURLToPath(import.meta.url)), '..', '.env.local'));

const MPN = process.argv[2] || 'LM317T';
const FOCUS_MAKER = process.argv[3];
const BASE_URL = 'https://api.findchips.com/v1/fcl-search';

async function fetchFc(mpn: string): Promise<FCDistributorResult[]> {
  const key = process.env.FINDCHIPS_API_KEY;
  if (!key) throw new Error('FINDCHIPS_API_KEY not found in .env.local');
  const params = new URLSearchParams({ part: mpn, apiKey: key, hostedOnly: 'true', site: 'fc', exactMatch: 'true' });
  const res = await fetch(`${BASE_URL}?${params}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`FindChips API ${res.status}: ${res.statusText}`);
  const json = (await res.json()) as { response?: FCDistributorResult[] };
  return (json.response ?? []).filter((r) => r.parts && r.parts.length > 0);
}

(async () => {
  console.log(`\n=== FindChips maker-scoping proof — MPN: ${MPN} (live) ===\n`);
  const results = await fetchFc(MPN);
  if (results.length === 0) {
    console.log('FindChips returned no franchised distributors for this MPN. Try LM317T, 1N4148, or NE555.');
    return;
  }

  const payload = computePerMakerDistributorCounts(results)!;
  const rawMakers = [...new Set(results.flatMap((r) => r.parts.map((p) => p.manufacturer)).filter(Boolean))];

  console.log(`FindChips lists ONE part number, sold by ${Object.keys(payload.byMaker ?? {}).length} different makers,`);
  console.log(`across ${payload.count} distributors total. A maker-blind card mixed them all together:\n`);
  for (const [m, n] of Object.entries(payload.byMaker ?? {}).sort((a, b) => b[1] - a[1])) {
    console.log(`   • ${m.padEnd(30)} ${n} distributor(s)`);
  }

  const before = mapFCToQuotes(results, MPN)[0];
  console.log(`\n── BEFORE (the bug: maker-blind) ──`);
  console.log(`   Every card showed the same ${payload.count}-distributor count, and the cheapest "Go Buy"`);
  console.log(`   for EVERY card pointed at whichever maker won on price:`);
  console.log(`      ${before?.supplier}  →  ${before?.productUrl}`);

  const toShow = FOCUS_MAKER ? [FOCUS_MAKER] : rawMakers;
  console.log(`\n── AFTER (the fix: maker-aware) ──`);
  console.log(`   Each card shows ONLY its own maker's distributors + buy links:\n`);
  for (const maker of toShow) {
    const scoped = filterFcResultsByMaker(results, maker);
    const top = mapFCToQuotes(scoped, MPN)[0];
    console.log(`   ${maker}`);
    console.log(`      badge: ${scoped.length} distributor(s)`);
    console.log(top
      ? `      cheapest "Go Buy": ${top.supplier}  →  ${top.productUrl}`
      : `      (no confidently-attributable offer → shows nothing, never another maker's)`);
    console.log('');
  }

  console.log(`Read it this way: BEFORE, an "${toShow[0]}" card could link to a DIFFERENT maker's part`);
  console.log(`(whoever was cheapest). AFTER, its "Go Buy" and count are its own — or it shows nothing.\n`);
})().catch((err) => { console.error('\nProof failed:', err.message); process.exit(1); });
