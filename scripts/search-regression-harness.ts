/* eslint-disable @typescript-eslint/no-explicit-any --
 * This diagnostic is COPIED to a pre-fix worktree and run against a DIFFERENT commit, so it accesses
 * `searchParts` responses STRUCTURALLY rather than through imported types — pinning the exact type
 * would tie it to one commit and defeat the cross-commit comparison. The `any` is deliberate. */
/**
 * SEARCH REGRESSION HARNESS — run the same real queries through `searchParts` on two different
 * commits and diff the answers.
 *
 * WHY THIS EXISTS. Two bugs shipped on June 30 and went unnoticed for a month, because there was
 * nothing that ran a real user query end-to-end and looked at what came back. Unit tests did not
 * catch them: the fixtures were hand-written from what their author ASSUMED the system produces,
 * so they went green while the code was wrong. A test you invent can only prove your code matches
 * your assumption.
 *
 * So this harness invents nothing. The queries are REAL — pulled from `search_history`, the app's
 * own log of what users actually typed — and the assertion is on the OUTCOME (which parts came
 * back, in what order), never on which internal function got called.
 *
 * HOW TO USE (from a clean tree):
 *
 *     npx tsx scripts/search-regression-harness.ts --out /tmp/after.json      # on your branch
 *     git checkout main
 *     npx tsx scripts/search-regression-harness.ts --out /tmp/before.json     # on main
 *     git checkout -
 *     npx tsx scripts/search-regression-diff.ts /tmp/before.json /tmp/after.json
 *
 * (run each with `node --env-file=.env.local --import tsx …` so the API keys load.)
 *
 * ⚠️ IT MUST STAY RUNNABLE ON BOTH COMMITS. That means it may import ONLY the long-stable public
 * surface — `searchParts` and nothing else. Import a type or helper that exists on one side and
 * not the other and the harness stops being a comparison.
 *
 * ⚠️ IT PURGES ITS OWN CACHE ROWS FIRST. Otherwise the older commit answers from a warm production
 * cache while the newer one computes fresh, and the diff shows you catalogue drift instead of the
 * effect of your code. (Cache rows are derived data — they simply recompute on next use.)
 */
import { createClient } from '@supabase/supabase-js';
import { searchParts } from '@/lib/services/partDataService';

// ─────────────────────────────────────────────────────────────────────────────
// THE CORPUS — real queries, grouped by what each group is supposed to PROVE.
// ─────────────────────────────────────────────────────────────────────────────

interface Case {
  /** Free-text id used to line up the two runs. */
  id: string;
  query: string;
  /** Passed straight to `searchParts`. `undefined` for the control groups — that is the point. */
  opts?: { constraints?: Array<{ attribute: string; value: string | number; unit?: string }>; partType?: string; familyId?: string };
  group: 'mpn-control' | 'descriptive-control' | 'spec-search';
  /** Free-text: what a human should look for. Not asserted — read by a person in the diff. */
  expect?: string;
}

const CORPUS: Case[] = [
  // ── GROUP 1 · CONTROL: bare part numbers. ────────────────────────────────────────────────────
  // These MUST come back IDENTICAL. Every piece of this work is gated on "constraints present",
  // and a part-number lookup never carries constraints. I have claimed that repeatedly and never
  // once tested it. Any difference here is a regression, full stop — no judgement call.
  // (All 14 are real queries from search_history.)
  { id: 'mpn-01', group: 'mpn-control', query: 'BC847BLT1G' },
  { id: 'mpn-02', group: 'mpn-control', query: 'BC847CLT3G' },
  { id: 'mpn-03', group: 'mpn-control', query: 'BC847B' },
  { id: 'mpn-04', group: 'mpn-control', query: 'LM358' },
  { id: 'mpn-05', group: 'mpn-control', query: 'IRFZ44N' },
  { id: 'mpn-06', group: 'mpn-control', query: 'BSS138' },
  { id: 'mpn-07', group: 'mpn-control', query: 'CPC1017N' },
  { id: 'mpn-08', group: 'mpn-control', query: 'MCP1703T-5002E/CB' },
  { id: 'mpn-09', group: 'mpn-control', query: 'PSR073UL0800X' },
  { id: 'mpn-10', group: 'mpn-control', query: 'MBR30H100MFST3G' },
  { id: 'mpn-11', group: 'mpn-control', query: 'AON6284A' },
  { id: 'mpn-12', group: 'mpn-control', query: 'TPH1R306PL' },
  { id: 'mpn-13', group: 'mpn-control', query: 'EKY-630ELL681ML25S' },
  { id: 'mpn-14', group: 'mpn-control', query: 'TLC555CDR' },

  // ── GROUP 2 · CONTROL: descriptive, but NO stated specs. ─────────────────────────────────────
  // Also MUST be identical: no constraints ⇒ none of the new code runs. This is the group that
  // catches an accidental change to the plain keyword path.
  { id: 'desc-01', group: 'descriptive-control', query: 'npn bjt transistor' },
  { id: 'desc-02', group: 'descriptive-control', query: 'op amp dual cmos' },
  { id: 'desc-03', group: 'descriptive-control', query: 'mlcc capacitor 0805' },
  { id: 'desc-04', group: 'descriptive-control', query: 'ldo voltage regulator' },
  { id: 'desc-05', group: 'descriptive-control', query: 'schottky diode sod-123' },
  { id: 'desc-06', group: 'descriptive-control', query: 'Bipolar (BJT) Transistor NPN 45 V 100 mA 100MHz 300 mW Surface Mount SOT-23-3 (TO-236)' },

  // ── GROUP 3 · THE CHANGED PATH: a description WITH stated specs. ─────────────────────────────
  // These are EXPECTED to differ — that is the whole point of the work. A human reads the diff and
  // judges whether the change is an improvement. `expect` says what "better" looks like.
  {
    id: 'spec-01-bjt',
    group: 'spec-search',
    query: 'small signal NPN transistor',
    // The canonical query from the backlog. This is the one that regressed on June 30.
    opts: {
      partType: 'NPN transistor',
      familyId: 'B6',
      constraints: [
        { attribute: 'polarity', value: 'NPN' },
        { attribute: 'collector-emitter voltage', value: 9, unit: 'V' },
        { attribute: 'collector current', value: '1-2', unit: 'mA' },
        { attribute: 'dc current gain', value: '200-400' },
      ],
    },
    expect: 'BC847B (gain 200-450) near the TOP. BC847C (gain 420-800) marked BELOW SPEC. BC847A (110) absent or bottom. A 9V ask must NOT exclude the 45V/100mA parts — headroom is free.',
  },
  {
    id: 'spec-02-mosfet',
    group: 'spec-search',
    query: 'N-channel MOSFET',
    // The family where the band-direction bug FIRED (it was inert on BJTs by luck).
    opts: {
      partType: 'N-channel MOSFET',
      familyId: 'B5',
      constraints: [
        { attribute: 'channel type', value: 'N-Channel' },
        { attribute: 'drain-source voltage', value: 30, unit: 'V' },
        { attribute: 'continuous drain current', value: '1-5', unit: 'A' },
      ],
    },
    expect: 'A "1-5 A" LOAD must not band the catalogue to parts RATED under ~5.75 A. Parts rated 10 A / 20 A / 60 A are perfectly valid and must still be present.',
  },
  {
    id: 'spec-03-ldo',
    group: 'spec-search',
    query: 'LDO linear regulator',
    opts: {
      partType: 'LDO regulator',
      familyId: 'C1',
      constraints: [
        { attribute: 'output voltage', value: 3.3, unit: 'V' },
        { attribute: 'output current', value: 500, unit: 'mA' },
      ],
    },
    expect: '3.3V / 500mA LDOs at the top. A part rated for MORE current (1A, 2A) is fine and must not be penalised out.',
  },
  {
    id: 'spec-04-mlcc',
    group: 'spec-search',
    query: 'MLCC ceramic capacitor',
    opts: {
      partType: 'MLCC capacitor',
      familyId: '12',
      constraints: [
        { attribute: 'capacitance', value: 100, unit: 'nF' },
        { attribute: 'voltage rated', value: 50, unit: 'V' },
        { attribute: 'dielectric', value: 'X7R' },
      ],
    },
    expect: 'X7R 100nF parts at the top. A 100V-rated part is FINE for a 50V ask (headroom). Capacitance is an exact match — a 220nF part is NOT a fit.',
  },
];

// ─────────────────────────────────────────────────────────────────────────────

/** What we record per query. Deliberately small: the ANSWER, never the mechanism. */
interface Snapshot {
  id: string;
  group: string;
  query: string;
  expect?: string;
  error?: string;
  matchType?: string;
  totalResults: number;
  /** Present only on the new code — the narrowing question. Absent on main by definition. */
  narrowing?: { attributeId: string; label: string; options: string[]; poolSize: number } | null;
  top: Array<{
    rank: number;
    mpn: string;
    manufacturer: string;
    /** Present only when a spec-vetted search ran (Decision #243). */
    matchScore?: number;
    failCount?: number;
    hardFail?: boolean;
    dataSource?: string;
  }>;
}

/** Wipe this query's L2 search-cache rows so BOTH commits compute fresh and the diff shows code,
 *  not catalogue drift. Search-cache rows are derived — they recompute on next use.
 *
 *  ⚠️ THE COLUMN IS `mpn_lower`, NOT `mpn`. This shipped saying `mpn` — a column that does not exist.
 *  Postgres said so, the code `console.warn`ed and CARRIED ON, and every purge deleted nothing. Both
 *  commits then answered from the SAME cache, so the control groups compared identical rows and
 *  reported "0 of 14 changed" — a pass that was never earned. A failed purge invalidates the entire
 *  comparison, so it now ABORTS. Never warn-and-continue on a step the result depends on. */
async function purgeSearchCacheFor(queries: string[]) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error('✗ ABORT: no Supabase creds — without a purge both commits answer from cache and the diff means nothing.');
    process.exit(2);
  }
  const sb = createClient(url, key);
  let purged = 0;
  for (const q of queries) {
    // Key shape (partDataService): `${VERSION}__${query.toLowerCase()}__${currency}__…`, stored in the
    // `mpn_lower` column. The version prefix differs per commit, so match on the query segment.
    const { data, error } = await sb
      .from('part_data_cache')
      .delete()
      .eq('service', 'search')
      .ilike('mpn_lower', `%${q.toLowerCase()}%`)
      .select('id');
    if (error) {
      console.error(`✗ ABORT: purge failed for ${JSON.stringify(q)}: ${error.message}`);
      process.exit(2);
    }
    purged += data?.length ?? 0;
  }
  console.log(`· purged ${purged} cached search rows (both commits now compute fresh)\n`);
}

async function main() {
  const outIdx = process.argv.indexOf('--out');
  const out = outIdx >= 0 ? process.argv[outIdx + 1] : undefined;
  if (!out) { console.error('usage: search-regression-harness.ts --out <file.json>'); process.exit(1); }

  const only = process.argv.includes('--group') ? process.argv[process.argv.indexOf('--group') + 1] : undefined;
  const cases = only ? CORPUS.filter(c => c.group === only) : CORPUS;

  await purgeSearchCacheFor(cases.map(c => c.query));

  const snapshots: Snapshot[] = [];
  for (const c of cases) {
    process.stdout.write(`  ${c.id.padEnd(14)} ${JSON.stringify(c.query).slice(0, 52).padEnd(54)}`);
    try {
      // skipFindchips: pricing is never cached and is irrelevant to WHICH parts come back.
      // Keeping it out makes the run fast and the diff stable.
      const r: any = await searchParts(c.query, 'USD', undefined, {
        skipFindchips: true,
        ...(c.opts ?? {}),
      } as any);

      const matches = r?.matches ?? [];
      snapshots.push({
        id: c.id,
        group: c.group,
        query: c.query,
        expect: c.expect,
        matchType: r?.matchType,
        totalResults: matches.length,
        narrowing: r?.narrowing ?? null,
        top: matches.slice(0, 12).map((m: any, i: number) => ({
          rank: i + 1,
          mpn: m.mpn,
          manufacturer: m.manufacturer,
          matchScore: m.matchScore,
          failCount: m.failCount,
          hardFail: m.hardFail,
          dataSource: m.dataSource,
        })),
      });
      console.log(` → ${String(matches.length).padStart(3)} results`);
    } catch (e: any) {
      snapshots.push({ id: c.id, group: c.group, query: c.query, expect: c.expect, error: String(e?.message ?? e), totalResults: 0, top: [] });
      console.log(` → ERROR ${e?.message ?? e}`);
    }
  }

  const fs = await import('node:fs/promises');
  await fs.writeFile(out, JSON.stringify({ capturedAt: new Date().toISOString(), snapshots }, null, 2));
  console.log(`\n✓ wrote ${snapshots.length} snapshots → ${out}`);
}

main().catch(e => { console.error(e); process.exit(1); });
