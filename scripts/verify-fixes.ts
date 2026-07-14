/**
 * VERIFY THE FIXES — by typing into the chat, exactly like a user.
 *
 * ── WHY THIS FILE IS SHAPED THIS WAY (two mistakes already made in it) ─────────────────────────
 *
 * ⚠️ A CHECK THAT ONLY PASSES PROVES NOTHING. Every check must FAIL on the code as it was BEFORE the
 *    fix and PASS after. Run it on both commits. If it passes on both, the fix it claims to prove was
 *    never needed — DELETE THE CHECK, don't keep it for the green tick.
 *
 * ⚠️ TEST AT THE LAYER THE USER TOUCHES. The first version of this file called `searchParts` directly
 *    with hand-written, already-perfect specs. It scored 4/4 on the BROKEN code — because three of the
 *    four bugs live ABOVE that line, in the part that READS YOUR SENTENCE and turns it into specs. Feed
 *    the engine perfect input and you skip the broken component and test the half that always worked.
 *    So this drives `chat()` — the same entry point the app calls when you type in the box.
 *
 * ⚠️ A FAILED CACHE PURGE IS WORSE THAN NO PURGE. The first version purged column `mpn`, which does not
 *    exist (it is `mpn_lower`). Postgres said so; the code warned and carried on; every delete was a
 *    no-op; the OLD code then answered out of the cache the NEW code had just written, and scored a
 *    pass it had not earned. A purge failure now ABORTS the run.
 *
 * OTHER RULES THIS FILE OBEYS:
 *   · It imports ONLY `chat` — the one surface that exists on both commits. Import something that only
 *     exists on the new side and this stops being a comparison and becomes a test of the new code
 *     against itself.
 *   · It asserts on the ANSWER (which parts the user ends up looking at), never on which internal
 *     function ran. A test of the mechanism goes green while the user still gets the wrong parts.
 *   · It PRINTS the parts. If the verdict says PASS and the parts look wrong, believe the parts.
 *
 * ── USAGE ──────────────────────────────────────────────────────────────────────────────────────
 *
 *     npm run verify:fixes
 *
 *   and against the pre-fix code (5ad8ec6 — the commit before the four fixes):
 *
 *     git worktree add /tmp/xrefs-prefix 5ad8ec6
 *     ln -sfn "$PWD/node_modules" /tmp/xrefs-prefix/node_modules
 *     cp .env.local /tmp/xrefs-prefix/ && cp scripts/verify-fixes.ts /tmp/xrefs-prefix/scripts/
 *     cd /tmp/xrefs-prefix && node --env-file=.env.local --import tsx scripts/verify-fixes.ts --label before
 */
import { createClient } from '@supabase/supabase-js';
import { chat } from '@/lib/services/llmOrchestrator';
import { searchParts } from '@/lib/services/partDataService';

interface Match {
  mpn: string;
  manufacturer: string;
  description: string;
  status?: string;
  hardFail?: boolean;
  specFit?: 'fits' | 'below_spec' | 'unconfirmed';
  specsRead?: number;
  specsStated?: number;
}

interface Check {
  id: string;
  /** The claim, in the words it was reported to the user. This is what is on trial. */
  claim: string;
  /** What the code did BEFORE the fix — i.e. what this check must REPRODUCE on the old commit.
   *  If the old commit doesn't do this, the check is not testing the bug. */
  before: string;
  /** What the user types. A real sentence — not a hand-built spec list. */
  say: string;
  /** Replies to any follow-up question the agent asks, in order. Falls back to "any" — which is
   *  what a real user does when they don't care, and what happened on the bench. */
  answers?: string[];

  /**
   * WHICH LAYER THIS CHECK DRIVES. Default 'chat'.
   *
   * 'chat'   — the whole app: routing, guided questions, spec extraction, search. Use it for any bug
   *            that could live in how the user's SENTENCE is read. That is most of them, and calling
   *            the search engine directly instead is how the first version of this file scored 4/4 on
   *            the broken code.
   * 'search' — call `searchParts` with the specs the chat produces. ONLY legitimate when the bug
   *            provably lives BELOW the chat (in scoring or labelling), so the chat cannot mask or
   *            cause it. Say WHY in the check. The specs must be the ones the real chat actually
   *            emitted, copied from a recorded run — never invented, or this stops testing anything.
   */
  via?: 'chat' | 'search';
  /** For `via: 'search'` — the specs, exactly as the real chat emitted them. */
  search?: { query: string; partType: string; familyId: string; constraints: Array<Record<string, unknown>> };
  /** >1 ⇒ RELIABILITY check. Each rep runs in a FRESH PROCESS (see coldRep). A single run cannot
   *  detect a coin flip — diagnosing one from a single sample is how the last regression call went
   *  wrong. */
  reps?: number;
  /** Return null to pass, or a sentence saying what is wrong. */
  judge: (runs: Match[][]) => string | null;
}

// ── shared judging helpers ──────────────────────────────────────────────────────────────────────

/** Names ~10 ohms. Deliberately strict: must NOT match "10K OHM" (next char is K) or "100 OHM"
 *  (next char is 0). Both of those were in the broken output and would fake a pass. */
const isTenOhm = (d: string) => /\b10\s*(ohm|Ω)\b/i.test(d);

/** Pull a current rating out of a Digikey description, e.g. "MOSFET N-CH 30V 5A 6WSON" → 5. */
const ampsIn = (d: string) => {
  const m = /(\d+(?:\.\d+)?)\s*A\b/i.exec(d.replace(/\d+(?:\.\d+)?\s*V\b/gi, ''));
  return m ? parseFloat(m[1]) : null;
};

/** The high-gain bin of a BC847/BC848/BC850-style part is the trailing "C". The whole point of the
 *  "at least 300" ask is that the C bins (gain 420–800) must survive and the A bins (110–220) must
 *  not be presented as fits. */
const isHighGainBin = (mpn: string) => /BC8(4[78]|5[0-9])C/i.test(mpn);

/**
 * DOES THE CARD PRESENT THIS PART AS MEETING THE SPEC?
 *
 * ⚠️ Must work on BOTH the old and the new shape, or the check is worthless. The pre-fix code has no
 * `specFit` field at all — so asserting on `specFit` alone would make this check FAIL on the old
 * commit merely because a field is missing, not because the bug is there. That is a check that can
 * never be wrong, which is the same as a check that proves nothing.
 *
 * Before: two states, derived from `hardFail` (false ⇒ the green "Fits your specs" chip).
 * After:  three states, read from `specFit`.
 * Either way, this answers the only question that matters: is the user being told it fits?
 */
const presentsAsFitting = (m: Match) => (m.specFit ? m.specFit === 'fits' : m.hardFail === false);

// ── THE CHECKS — each one is a sentence a user actually typed ────────────────────────────────────

const CHECKS: Check[] = [
  {
    id: '1 · the 10 ohm resistor',
    claim: '"I need a 10 ohm resistor, 0402, 1%" now returns 10 ohm resistors.',
    before: '20 parts came back and NOT ONE was 10 ohms — they were 0-ohm jumpers, 1K, 4.7K, 10K, '
          + '100K: the POPULAR values a keyword search returns. Eight family names were typo\'d, so '
          + 'the app could not filter the catalogue by value at all.',
    say: 'I need a 10 ohm resistor, 0402, 1%',
    judge: ([ms]) => {
      if (!ms.length) return 'the search returned nothing at all';
      const top = ms.slice(0, 10);
      const hits = top.filter(m => isTenOhm(m.description)).length;
      return hits >= 6 ? null : `only ${hits} of the top ${top.length} are actually 10 ohms (need 6+)`;
    },
  },

  {
    id: '2 · the 30V MOSFET',
    claim: '"a 30V N-channel MOSFET, 1 to 5 amps" now returns real, current MOSFETs.',
    before: 'THREE parts came back — two discontinued, one a bare silicon die (not a usable '
          + 'component). "1 to 5 amps" was thrown away before the search ran: the part that reads '
          + 'your answer had no way to say "a range", so it reported "doesn\'t matter".',
    say: 'I need a 30V N-channel MOSFET that can handle 1 to 5 amps',
    judge: ([ms]) => {
      if (ms.length < 20) return `only ${ms.length} parts came back (need 20+; it used to return 3)`;
      const top = ms.slice(0, 10);
      const active = top.filter(m => !m.status || m.status === 'Active').length;
      if (active < 8) return `only ${active} of the top 10 are Active parts (need 8+)`;
      // The ask is 1–5 A. A part rated BELOW 1 A cannot do the job — if those are on screen, the
      // current spec never reached the search.
      const underRated = top.filter(m => { const a = ampsIn(m.description); return a !== null && a < 1; });
      return underRated.length === 0
        ? null
        : `${underRated.length} of the top 10 are rated under 1 A (${underRated.map(m => m.mpn).join(', ')}) — the current spec was dropped`;
    },
  },

  {
    id: '3 · it works EVERY time',
    claim: 'The catalogue filter no longer times out. It used to be a coin flip.',
    before: 'The call that fetches the catalogue\'s filter options MEASURED at 19.9 seconds against a '
          + '10-second timeout, so it failed about half the time — and the failure was swallowed in '
          + 'silence. The same search would work, then not work, then work.',
    say: 'I need a 30V N-channel MOSFET that can handle 1 to 5 amps',
    // THREE cold runs. A coin flip passes a single run half the time.
    reps: 3,
    judge: (runs) => {
      const counts = runs.map(r => r.length);
      const bad = counts.filter(n => n < 20).length;
      return bad === 0 ? null : `${bad} of ${runs.length} runs came back short (${counts.join(', ')} parts) — still flaky`;
    },
  },

  {
    id: '4 · "gain of at least 300"',
    claim: '"at least 300" is read as a floor, not as "exactly 300" — and the high-gain parts surface.',
    before: 'The chat sends the same spec TWICE (two separate readers each report it). The old code '
          + 'saw two 300s and guessed they were a RANGE — "gain must be between 300 and 300". Every '
          + 'real transistor disagreed with that, so parts got labelled "Below spec", and the actual '
          + 'high-gain parts never surfaced.',
    say: 'I need an NPN transistor in SOT-23 with a DC current gain of at least 300',
    judge: ([ms]) => {
      if (!ms.length) return 'the search returned nothing at all';
      const belowSpec = ms.filter(m => m.hardFail === true).length;
      if (belowSpec > ms.length * 0.9) return `${belowSpec} of ${ms.length} parts are labelled "Below spec" — the floor is being read as an exact value`;

      const top = ms.slice(0, 10);
      const hiGain = top.filter(m => isHighGainBin(m.mpn));
      if (hiGain.length < 2) return `no high-gain parts in the top 10 — the gain spec never reached the search (got: ${ms.slice(0, 4).map(m => m.mpn).join(', ')})`;

      // ⚠️ AN EARLIER VERSION OF THIS CHECK STOPPED HERE — and passed on a broken answer. The
      // BC847C parts were present, but every one of them said "Below spec" while NPN/PNP DUALS sat
      // above them saying "fits". Being on the list is not the same as being presented as correct.
      const wronglyRejected = hiGain.filter(m => m.hardFail === true);
      if (wronglyRejected.length) {
        return `the high-gain parts ARE found but are labelled "Below spec" (${wronglyRejected.map(m => m.mpn).join(', ')}) — they have gain 420–800, which is ≥300`;
      }

      // A dual NPN/PNP complementary pair is not "an NPN transistor". If those rank above the real
      // single NPNs, an unreadable part is beating a readable one — the specs we CAN read get
      // judged, the specs we CANNOT read never fail, so being unreadable is an advantage.
      const dualsAbove = top.slice(0, hiGain.length ? top.indexOf(hiGain[0]) : 0)
        .filter(m => /NPN\/PNP/i.test(m.description));
      return dualsAbove.length === 0
        ? null
        : `${dualsAbove.length} dual NPN/PNP parts outrank the real NPNs (${dualsAbove.slice(0, 3).map(m => m.mpn).join(', ')}) — you asked for an NPN`;
    },
  },

  {
    id: '5 · never say "fits" without checking',
    claim: 'A part whose specs we could not READ is no longer presented as a perfect match.',
    before: '20 of the 50 results for a 1-5 A MOSFET were DUAL MOSFETs rated 0.115-0.95 A — parts '
          + 'that physically cannot carry 1 A — and EVERY ONE was labelled "Fits your specs". A rule '
          + 'only fails when a value DISAGREES, and Digikey names a dual\'s parameters differently, '
          + 'so no rule could read anything, nothing could fail, and the part sailed through. Being '
          + 'unreadable was an advantage.',
    say: 'I need a 30V N-channel MOSFET that can handle 1 to 5 amps',
    // ⚠️ 'search', deliberately. This bug lives BELOW the chat — in how a scored candidate gets
    // LABELLED — so the search layer is where it can be isolated. (Every other check must go through
    // chat(); see the `via` doc. It also means this one check still runs when the Anthropic key is
    // out of credit, which is how it got proven the day it was written.)
    via: 'search',
    search: {
      // Not invented. These are the specs the real chat emitted for the sentence above, copied from
      // a recorded run:  [greenfield] specs [channel_type, vds_max, id_max] · constraints=3 · bands=1
      query: 'N-channel MOSFET',
      partType: 'N-channel MOSFET',
      familyId: 'B5',
      constraints: [
        { attribute: 'channel type', value: 'N-Channel' },
        { attribute: 'drain-source voltage', value: 30, unit: 'V' },
        { attribute: 'continuous drain current', value: '1-5', unit: 'A' },
      ],
    },
    judge: ([ms]) => {
      if (!ms.length) return 'the search returned nothing at all';
      if (!ms.some(m => m.specFit || typeof m.hardFail === 'boolean')) return 'no fit verdict on any card — the search was never spec-vetted, so this check tests nothing';

      // THE LIE: a part rated below 1 A cannot carry the 1 A that was asked for. It must never be
      // presented as meeting the spec. (`presentsAsFitting` reads whichever shape the commit has, so
      // this same line catches the bug on the old code and passes on the new.)
      const lying = ms.filter(m => {
        const a = ampsIn(m.description);
        return a !== null && a < 1 && presentsAsFitting(m);
      });
      if (lying.length) {
        return `${lying.length} parts that CANNOT carry 1 A are presented as fitting (${lying.slice(0, 3).map(m => `${m.mpn} @ ${ampsIn(m.description)}A`).join(', ')})`;
      }

      // The converse must hold too, or "never say fits" would pass. A part we DID read, that DOES
      // meet the ask, must still say so — otherwise the fix has just relabelled everything as
      // unconfirmed and made the app useless in a quieter way.
      const fits = ms.filter(presentsAsFitting);
      if (fits.length < 10) return `only ${fits.length} parts read as fitting — the fix has gone too far and is hiding good parts`;
      const overclaimed = fits.filter(m => typeof m.specsRead === 'number' && typeof m.specsStated === 'number' && m.specsRead < m.specsStated);
      return overclaimed.length === 0
        ? null
        : `${overclaimed.length} parts say "fits" while we read fewer specs than were asked for (${overclaimed[0].mpn}: ${overclaimed[0].specsRead}/${overclaimed[0].specsStated})`;
    },
  },
];

// ── plumbing ────────────────────────────────────────────────────────────────────────────────────

/** Wipe every cached answer this check could read, so the code has to actually COMPUTE it.
 *
 *  ⚠️ THE COLUMN IS `mpn_lower`, NOT `mpn`. Getting this wrong produced a silent no-op delete, which
 *  let the OLD code answer out of the NEW code's cache and score 4 of 4 with every bug still in it.
 *  So a failed purge ABORTS. Never warn-and-carry-on for a step the result depends on.
 *
 *  `cold` also drops the catalogue-filter cache. That cache IS one of the fixes — leave it warm and
 *  the timeout it hides can never re-appear, so the "reliability" run would be testing the cache. */
async function purge(cold = false) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) { console.error('  ✗ ABORT: no database credentials — a run without a purge is meaningless.'); process.exit(2); }
  const sb = createClient(url, key);

  // Every search row. The chat picks its own keywords, so we cannot know which key it will use —
  // and a purge that misses the row it needed to clear is the exact failure this file already had.
  const { error } = await sb.from('part_data_cache').delete().eq('service', 'search').neq('mpn_lower', '__mfr_alias_index__').select('id');
  if (error) { console.error(`  ✗ ABORT: could not purge the search cache: ${error.message}`); process.exit(2); }

  if (cold) {
    const { error: e2 } = await sb.from('part_data_cache').delete().eq('service', 'digikey').eq('variant', 'facets').select('id');
    if (e2) { console.error(`  ✗ ABORT: could not purge the catalogue-filter cache: ${e2.message}`); process.exit(2); }
  }
}

/** Run one check and return the parts the user ends up looking at. */
async function run(c: Check, cold: boolean): Promise<Match[]> {
  if (c.via === 'search') {
    await purge(cold);
    const r: any = await searchParts(c.search!.query, 'USD', undefined, {
      skipFindchips: true,
      partType: c.search!.partType,
      familyId: c.search!.familyId,
      constraints: c.search!.constraints,
    } as any);
    return (r?.matches ?? []) as Match[];
  }
  return askChat(c, cold);
}

/** Type the sentence into the chat, answer any follow-up question, and return the parts the user
 *  ends up looking at. This is the whole app: routing, guided questions, spec extraction, search. */
async function askChat(c: Check, cold: boolean): Promise<Match[]> {
  await purge(cold);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { console.error('  ✗ ABORT: no ANTHROPIC_API_KEY'); process.exit(2); }

  const msgs: Array<{ role: 'user' | 'assistant'; content: string }> = [{ role: 'user', content: c.say }];
  const answers = [...(c.answers ?? [])];
  const said: string[] = [];

  for (let turn = 0; turn < 6; turn++) {
    const r: any = await chat(msgs as any, apiKey);
    const matches = (r?.searchResult?.matches ?? []) as Match[];
    if (matches.length) { (globalThis as any).__turns = said; return matches; }

    // No parts yet ⇒ the agent asked something. Answer it and go round again, like a user would.
    said.push(`agent: ${String(r?.message ?? '').replace(/\s+/g, ' ').slice(0, 88)}`);
    msgs.push({ role: 'assistant', content: String(r?.message ?? '') });
    const reply = answers.shift() ?? 'any';
    said.push(`you:   ${reply}`);
    msgs.push({ role: 'user', content: reply });
  }
  (globalThis as any).__turns = said;
  return [];
}

/** A fresh process — the ONLY way to get a cold in-memory cache. The first draft looped in-process
 *  and every rep after the first printed "L1 HIT": all three "runs" re-read one answer from memory,
 *  so the reliability check exercised nothing and would have passed on the broken code too. */
function coldRep(checkIndex: number): Match[] {
  const { spawnSync } = require('node:child_process') as typeof import('node:child_process');
  const r = spawnSync(
    process.execPath,
    ['--env-file=.env.local', '--import', 'tsx', process.argv[1], '--single', String(checkIndex), '--cold'],
    { encoding: 'utf8', timeout: 300_000, cwd: process.cwd() },
  );
  const line = (r.stdout ?? '').split('\n').find(l => l.startsWith('__MATCHES__'));
  if (!line) { console.log(`     (child produced no result${r.stderr ? `: ${r.stderr.trim().split('\n').pop()}` : ''})`); return []; }
  try { return JSON.parse(line.slice('__MATCHES__'.length)) as Match[]; } catch { return []; }
}

const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s).padEnd(n);

async function main() {
  const li = process.argv.indexOf('--label');
  const label = li >= 0 ? process.argv[li + 1] : 'run';

  // child mode: run one check cold, emit its parts, say nothing else.
  const si = process.argv.indexOf('--single');
  if (si >= 0) {
    let ms: Match[] = [];
    try { ms = await run(CHECKS[Number(process.argv[si + 1])], process.argv.includes('--cold')); } catch { /* an error IS the result: no parts */ }
    console.log(`__MATCHES__${JSON.stringify(ms)}`);
    process.exit(0);
  }

  console.log(`\n${'═'.repeat(98)}`);
  console.log(`  VERIFYING THE FIXES — "${label}"`);
  console.log(`  These type into the CHAT, like a user. Every one must FAIL on the old code, or it proves nothing.`);
  console.log(`${'═'.repeat(98)}`);

  const results: Array<{ id: string; claim: string; pass: boolean; why: string | null }> = [];

  const oi = process.argv.indexOf('--only');
  const only = oi >= 0 ? Number(process.argv[oi + 1]) : null;

  for (const [idx, c] of CHECKS.entries()) {
    if (only !== null && idx + 1 !== only) continue;
    console.log(`\n\n┌─ CHECK ${c.id}${c.via === 'search' ? '   [search layer — see `via`]' : ''}`);
    console.log(`│  YOU TYPE: "${c.say}"`);
    console.log(`│  CLAIM:    ${c.claim}`);
    console.log(`│  BEFORE:   ${c.before}`);
    console.log(`└${'─'.repeat(96)}`);

    const runs: Match[][] = [];
    for (let i = 0; i < (c.reps ?? 1); i++) {
      if ((c.reps ?? 1) > 1) {
        const ms = coldRep(idx);
        runs.push(ms);
        console.log(`   cold run ${i + 1} of ${c.reps} (fresh process): ${ms.length} parts`);
      } else {
        try { runs.push(await run(c, false)); }
        catch (e: any) { console.log(`   ERROR — ${e?.message ?? e}`); runs.push([]); }
      }
    }

    const turns = (globalThis as any).__turns as string[] | undefined;
    if (turns?.length) { console.log('\n   the conversation it took to get there:'); turns.forEach(t => console.log(`     ${t}`)); }

    // ── THE EVIDENCE. Read this before the verdict. ──
    const ms = runs[0];
    console.log(`\n   what you end up looking at (top 10 of ${ms.length}):`);
    if (!ms.length) console.log('     — nothing —');
    else {
      console.log(`     ${pad('#', 3)}${pad('PART', 22)}${pad('MAKER', 16)}${pad('WHAT IT IS', 42)}VERDICT`);
      ms.slice(0, 10).forEach((m, i) => {
        // Falls back to the pre-fix shape so the SAME table is readable on the old commit.
        const v = m.specFit === 'below_spec' ? 'Below spec'
          : m.specFit === 'fits' ? 'fits'
          : m.specFit === 'unconfirmed' ? `unconfirmed (${m.specsRead ?? '?'}/${m.specsStated ?? '?'} read)`
          : m.hardFail === true ? 'Below spec' : m.hardFail === false ? 'fits' : '—';
        console.log(`     ${pad(String(i + 1), 3)}${pad(m.mpn ?? '?', 22)}${pad(m.manufacturer ?? '?', 16)}${pad(m.description ?? '?', 42)}${v}`);
      });
    }

    const why = c.judge(runs);
    results.push({ id: c.id, claim: c.claim, pass: why === null, why });
    console.log(`\n   ${why === null ? '✓  PASS' : `✗  FAIL — ${why}`}`);
  }

  console.log(`\n\n${'═'.repeat(98)}`);
  console.log(`  RESULT — "${label}"`);
  console.log(`${'═'.repeat(98)}`);
  for (const r of results) console.log(`  ${r.pass ? '✓ PASS' : '✗ FAIL'}   ${pad(r.id, 26)} ${r.pass ? r.claim : r.why}`);
  const passed = results.filter(r => r.pass).length;
  console.log(`\n  ${passed} of ${results.length} checks pass.`);
  console.log(`\n  ⚠️  This number MEANS NOTHING on its own. It is only meaningful next to the same number`);
  console.log(`     from the pre-fix code, where these checks are EXPECTED TO FAIL. If a check passes on`);
  console.log(`     BOTH, it is a placebo — it is not testing the bug, and it must be deleted or rewritten.\n`);

  process.exit(passed === results.length ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
