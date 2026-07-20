/**
 * atlas-backfill-param-decisions — reconstruct the Decision Log from the
 * records that already exist.
 *
 *   npm run atlas:backfill-decisions            # DRY RUN (default)
 *   npm run atlas:backfill-decisions -- --apply # actually write
 *
 * Written in TypeScript on purpose: it imports the SAME
 * lib/services/paramDecisionBackfill.ts that the unit tests cover, so the
 * risky edit-vs-revoke logic exists in exactly one place. A .mjs mirror
 * would drift silently — this repo has been bitten by that before.
 *
 * Idempotent: every row it writes carries source='backfill', and it skips
 * anything already present on (param_name, decision, decided_at). Re-running
 * inserts zero rows.
 *
 * HONESTY CONSTRAINTS baked in:
 *  - Reconstructed rows are marked source='backfill' so the UI can show them
 *    as reconstructed rather than observed.
 *  - atlas_unmapped_param_notes is last-write-wins with no history, so it
 *    yields exactly ONE decision per param (its CURRENT state). A param
 *    deferred → reopened → deferred again is unrecoverable beyond its final
 *    state. The script reports this rather than papering over it.
 *  - No timestamp is ever invented: every decided_at comes from a real
 *    created_at / updated_at / ran_at on a source row.
 */

import { createClient } from '@supabase/supabase-js';
import {
  classifyOverrideRows,
  decisionForInvestigationAction,
  decisionForNoteRow,
  canonicalKey,
  type OverrideRow,
  type ReconstructedDecision,
} from '../lib/services/paramDecisionBackfill';

const APPLY = process.argv.includes('--apply');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const sb = createClient(url, key);

/** Page past PostgREST's 1000-row cap. STOPS on error — a failed page must
 *  never silently truncate the backfill into a partial reconstruction. */
async function fetchAll<T>(table: string, cols: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(cols).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    out.push(...(data as T[]));
    if (data.length < 1000) break;
  }
  return out;
}

interface InvestigationRow {
  id: string;
  param_name: string;
  scope_kind: string | null;
  scope_key: string | null;
  action_taken: string | null;
  action_at: string | null;
  ran_by: string;
  ran_at: string;
  raw_response: Record<string, unknown> | null;
  resulting_override_id: string | null;
  reverted_at: string | null;
  reverted_by: string | null;
}

interface NoteRow {
  param_name: string;
  note: string | null;
  status: string | null;
  updated_by: string;
  updated_at: string;
}

async function main() {
  console.log(`\nAtlas Decision Log backfill — ${APPLY ? 'APPLY' : 'DRY RUN'}\n${'='.repeat(60)}`);

  const [overrides, investigations, notes] = await Promise.all([
    fetchAll<OverrideRow>(
      'atlas_dictionary_overrides',
      'id, param_name, family_id, attribute_id, attribute_name, change_reason, created_by, created_at, is_active',
    ),
    fetchAll<InvestigationRow>(
      'atlas_triage_investigations',
      'id, param_name, scope_kind, scope_key, action_taken, action_at, ran_by, ran_at, raw_response, resulting_override_id, reverted_at, reverted_by',
    ),
    fetchAll<NoteRow>('atlas_unmapped_param_notes', 'param_name, note, status, updated_by, updated_at'),
  ]);

  console.log(`sources: ${overrides.length} overrides · ${investigations.length} investigations · ${notes.length} notes`);

  const decisions: ReconstructedDecision[] = [];

  // ── 1. The override chain (accept / edit / revoke) ────────────────────
  const { decisions: overrideDecisions, counts } = classifyOverrideRows(overrides);
  decisions.push(...overrideDecisions);
  console.log(
    `\noverride chain → ${overrideDecisions.length} decisions` +
      `\n   mapping_accepted : ${counts.accepted}` +
      `\n   mapping_edited   : ${counts.edited}   (superseded by a newer active row)` +
      `\n   mapping_revoked  : ${counts.revoked}   (nothing replaced it)`,
  );

  // ── 2. Investigations: attach AI evidence to its decision ─────────────
  // These overlap the override chain (an accept made via the drawer also
  // created an override). We do NOT emit a duplicate accept — instead the
  // evidence is grafted onto the matching override-derived decision, so one
  // decision keeps one row and gains the reasoning behind it.
  const byOverrideId = new Map<string, ReconstructedDecision>();
  for (const d of decisions) if (d.overrideId) byOverrideId.set(d.overrideId, d);

  let evidenceAttached = 0;
  let investigationOnly = 0;
  for (const inv of investigations) {
    if (!inv.action_taken) continue;
    const target = inv.resulting_override_id ? byOverrideId.get(inv.resulting_override_id) : undefined;
    if (target) {
      target.evidence = inv.raw_response ?? null;
      target.investigationId = inv.id;
      evidenceAttached++;
      continue;
    }
    // A status decision (wrong-family / unmappable) made via the drawer —
    // no override row exists, so this IS the only record of it.
    const decision = decisionForInvestigationAction(inv.action_taken);
    if (!decision) continue;
    decisions.push({
      paramName: inv.param_name,
      decision,
      decidedBy: inv.ran_by,
      decidedAt: inv.action_at ?? inv.ran_at,
      familyId: inv.scope_kind === 'family' ? inv.scope_key : null,
      category: inv.scope_kind === 'category' ? inv.scope_key : null,
      investigationId: inv.id,
      evidence: inv.raw_response ?? null,
      note: null,
    } as ReconstructedDecision);
    investigationOnly++;
  }
  console.log(
    `\ninvestigations → ${evidenceAttached} evidence attached to an existing decision, ` +
      `${investigationOnly} standalone`,
  );

  // Reverts recorded on the investigations table become their own decision.
  let reverts = 0;
  for (const inv of investigations) {
    if (!inv.reverted_at || !inv.reverted_by) continue;
    decisions.push({
      paramName: inv.param_name,
      decision: inv.action_taken === 'override_created' ? 'mapping_revoked' : 'confirmed_in_family',
      decidedBy: inv.reverted_by,
      decidedAt: inv.reverted_at,
      overrideId: inv.resulting_override_id,
      investigationId: inv.id,
      note: 'Reverted (reconstructed from the investigation audit row)',
    } as ReconstructedDecision);
    reverts++;
  }
  if (reverts) console.log(`   + ${reverts} revert decisions`);

  // ── 3. Notes: CURRENT status only — no history exists ─────────────────
  // Skip params whose status decision is already represented by an
  // investigation-derived row, so a drawer-made "mark unmappable" isn't
  // counted twice.
  const statusAlready = new Set(
    decisions
      .filter((d) => ['marked_unmappable', 'flagged_wrong_family', 'confirmed_in_family'].includes(d.decision))
      .map((d) => canonicalKey(d.paramName, '')),
  );

  let noteDecisions = 0;
  for (const n of notes) {
    const decision = decisionForNoteRow(n.status, n.note);
    if (!decision) continue;
    if (statusAlready.has(canonicalKey(n.param_name, '')) && decision !== 'deferred' && decision !== 'note_added') {
      continue;
    }
    decisions.push({
      paramName: n.param_name,
      decision,
      decidedBy: n.updated_by,
      decidedAt: n.updated_at,
      note: n.note,
    } as ReconstructedDecision);
    noteDecisions++;
  }
  console.log(`\nnotes → ${noteDecisions} decisions (CURRENT state only — this table keeps no history)`);

  // ── 4. Idempotency: drop anything already backfilled ──────────────────
  const existing = await fetchAll<{ param_name: string; decision: string; decided_at: string }>(
    'atlas_param_decisions',
    'param_name, decision, decided_at',
  );
  const norm = (s: string) => s.normalize('NFC').toLowerCase().trim();

  // BOTH sides must go through toISOString(). Postgres returns
  // "2026-05-06T07:03:15.587+00:00" while JS emits "...587Z" — the same
  // instant as two different strings, so comparing raw text made every
  // existing row look absent and the re-run reported "0 already present"
  // for a fully-populated table.
  const dedupeKey = (paramName: string, decision: string, at: string) =>
    `${norm(paramName)}|${decision}|${new Date(at).toISOString()}`;

  const seen = new Set(existing.map((e) => dedupeKey(e.param_name, e.decision, e.decided_at)));
  const fresh = decisions.filter((d) => !seen.has(dedupeKey(d.paramName, d.decision, d.decidedAt)));

  console.log(`\n${'='.repeat(60)}`);
  console.log(`reconstructed : ${decisions.length}`);
  console.log(`already present: ${decisions.length - fresh.length}`);
  console.log(`TO INSERT      : ${fresh.length}`);

  // Pre-flight: catch key collisions HERE, with the offending params named,
  // rather than as an opaque Postgres unique-violation halfway through the
  // insert. This caught a real bug — pointing every superseded row at the
  // surviving mapping collapsed N distinct edits into N identical events.
  const keyCount = new Map<string, number>();
  for (const d of fresh) {
    const k = `${norm(d.paramName)}|${d.decision}|${new Date(d.decidedAt).toISOString()}`;
    keyCount.set(k, (keyCount.get(k) ?? 0) + 1);
  }
  const collisions = [...keyCount.entries()].filter(([, n]) => n > 1);
  if (collisions.length > 0) {
    console.error(
      `\nABORT: ${collisions.length} duplicate (param, decision, timestamp) keys in the reconstruction.` +
        `\nTwo decisions sharing one key means the logic collapsed distinct events — fix that, don't dedupe here.`,
    );
    for (const [k, n] of collisions.slice(0, 10)) console.error(`   ${n}x  ${k}`);
    process.exit(1);
  }
  console.log('collision check : PASS (no two decisions share a key)');

  // Sanity: never invent a timestamp outside the source data's own range.
  const times = fresh.map((d) => new Date(d.decidedAt).getTime()).filter((t) => !Number.isNaN(t));
  if (times.length) {
    const min = new Date(Math.min(...times)).toISOString();
    const max = new Date(Math.max(...times)).toISOString();
    console.log(`date range     : ${min} → ${max}`);
    if (Math.max(...times) > Date.now() + 60_000) {
      console.error('ABORT: a reconstructed decision is dated in the future.');
      process.exit(1);
    }
  }

  const byType = new Map<string, number>();
  for (const d of fresh) byType.set(d.decision, (byType.get(d.decision) ?? 0) + 1);
  console.log('\nby decision type:');
  for (const [k, v] of [...byType.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${k.padEnd(22)} ${v}`);
  }
  console.log(`\nwith AI evidence attached: ${fresh.filter((d) => d.evidence).length}`);

  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to insert.\n');
    return;
  }

  // ── 5. Write ──────────────────────────────────────────────────────────
  const rows = fresh.map((d) => ({
    param_name: norm(d.paramName),
    param_name_display: d.paramName,
    decision: d.decision,
    decided_by: d.decidedBy,
    decided_at: new Date(d.decidedAt).toISOString(),
    family_id: d.familyId ?? null,
    category: (d as { category?: string | null }).category ?? null,
    note: d.note ?? null,
    evidence: d.evidence ?? null,
    attribute_id: d.attributeId ?? null,
    attribute_name: d.attributeName ?? null,
    override_id: d.overrideId ?? null,
    investigation_id: d.investigationId ?? null,
    batch_id: d.batchId ?? null,
    source: 'backfill',
  }));

  let written = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await sb.from('atlas_param_decisions').insert(chunk);
    if (error) {
      console.error(`\nInsert failed at chunk ${i}: ${error.message}`);
      process.exit(1);
    }
    written += chunk.length;
    process.stdout.write(`\r   written ${written}/${rows.length}`);
  }
  console.log(`\n\nDONE — ${written} decisions written.\n`);
}

main().catch((err) => {
  console.error('\nBackfill failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
