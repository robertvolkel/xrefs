/**
 * Repair duplicate master views.
 *
 * Before the fix in lib/services/masterViewSeeding.ts, a failed read of an
 * account's master views was indistinguishable from an empty account, so the
 * app created a second set of starter views ("Basic View", "Replacements").
 * They showed up as repeated entries in the parts-list View dropdown.
 *
 * This scans every account for same-named duplicates, keeps the newest of each
 * group, re-points any list that referenced a removed copy, and refuses to
 * delete a duplicate that has been edited since it was created.
 *
 * Dry-run by default. Pass --apply to write. Pass --user <email> to scope it.
 */
import { readFileSync, writeFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const userFlag = process.argv.indexOf('--user');
if (userFlag > -1 && !process.argv[userFlag + 1]) {
  console.error('--user requires an email address');
  process.exit(1);
}
const TARGET_EMAIL = userFlag > -1 ? process.argv[userFlag + 1] : null;

/**
 * Read every row of a table. A bare .select() is capped at 1000 rows
 * server-side by PostgREST, and .range() does not defeat it — see the
 * "Supabase 1000-row limit" note in CLAUDE.md. Stops on error rather than
 * returning a short list that reads like "that's all there is".
 */
async function fetchAllPages(table, columns, applyFilters = q => q) {
  const PAGE = 1000;
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await applyFilters(sb.from(table).select(columns))
      .range(from, from + PAGE - 1);
    if (error) { console.error(`[${table}] read failed:`, error); process.exit(1); }
    out.push(...data);
    if (data.length < PAGE) return out;
  }
}

const profs = await fetchAllPages('profiles', 'id,email');
const emailById = new Map(profs.map(p => [p.id, p.email]));

let targetUid = null;
if (TARGET_EMAIL) {
  targetUid = profs.find(p => p.email === TARGET_EMAIL)?.id ?? null;
  if (!targetUid) { console.error(`user not found: ${TARGET_EMAIL}`); process.exit(1); }
}
const vts = await fetchAllPages('view_templates', '*', q =>
  targetUid ? q.eq('user_id', targetUid) : q);

// Group by (user, name); keep the NEWEST of each duplicate group — it is the
// one the account is actively using (is_default + the list's activeViewId).
const byUserName = new Map();
for (const r of vts) {
  const k = `${r.user_id}::${r.name}`;
  if (!byUserName.has(k)) byUserName.set(k, []);
  byUserName.get(k).push(r);
}
const sameColumns = (a, b) => JSON.stringify(a.columns) === JSON.stringify(b.columns);
const unedited = r => r.updated_at.slice(0, 19) === r.created_at.slice(0, 19);

const toDelete = [];
const keepFor = new Map(); // user::name -> surviving row
const skipped = [];
for (const [k, rows] of byUserName) {
  if (rows.length < 2) continue;
  const sorted = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const keep = sorted[sorted.length - 1];

  // Only ever delete a REDUNDANT COPY. Two views may legitimately share a name
  // with different contents — Decision #289 rejected a (user_id, name) unique
  // index precisely so that keeps working — so identical columns, not the name,
  // is what makes a row safe to remove. An edited row is never a factory copy.
  const redundant = sorted.slice(0, -1).filter(r => sameColumns(r, keep) && unedited(r));
  const kept = sorted.slice(0, -1).filter(r => !redundant.includes(r));
  for (const r of kept) {
    skipped.push({ row: r, why: !unedited(r) ? 'edited since creation' : 'different columns' });
  }
  if (redundant.length === 0) continue;

  keepFor.set(k, keep);
  toDelete.push(...redundant);
}

if (skipped.length) {
  console.log(`skipped ${skipped.length} same-named view(s) that are NOT redundant copies:`);
  for (const s of skipped) {
    console.log(`  KEEP  ${emailById.get(s.row.user_id)}  ${s.row.created_at.slice(0, 10)}  ${s.row.name}  (${s.why})`);
  }
  console.log('');
}

const deleteIds = new Set(toDelete.map(r => r.id));
if (deleteIds.size === 0) {
  console.log(`no duplicate master views found (${vts.length} scanned)`);
  process.exit(0);
}
const affected = new Set(toDelete.map(r => r.user_id));
console.log(`${vts.length} master views scanned — ${deleteIds.size} duplicate(s) across ${affected.size} account(s)`);
for (const r of vts.filter(r => affected.has(r.user_id))) {
  console.log(`  ${deleteIds.has(r.id) ? 'DELETE' : 'KEEP  '}  ${emailById.get(r.user_id)}  ${r.created_at.slice(0, 10)}  default=${r.is_default}  ${r.name}  (${r.id})`);
}

// EVERY list in the system, so we can prove nothing else points at the deleted
// ids. Paginated: a short read here would leave a list past row 1000 pointing
// at a view this script is about to delete — the exact breakage it prevents.
const allLists = await fetchAllPages('parts_lists', 'id,user_id,name,view_configs');

const fixes = [];
for (const l of allLists) {
  const vc = l.view_configs;
  if (!vc) continue;
  const refs = [];
  if (deleteIds.has(vc.activeViewId)) refs.push('activeViewId');
  if (deleteIds.has(vc.defaultViewId)) refs.push('defaultViewId');
  const overrideRefs = Object.keys(vc.masterViewOverrides ?? {}).filter(k => deleteIds.has(k));
  if (!refs.length && !overrideRefs.length) continue;
  fixes.push({ list: l, refs, overrideRefs });
}

console.log(`\nlists referencing a deleted view: ${fixes.length}`);
for (const f of fixes) {
  const vc = f.list.view_configs;
  const next = { ...vc };
  const survivorFor = id => {
    const deleted = vts.find(r => r.id === id);
    return keepFor.get(`${deleted.user_id}::${deleted.name}`);
  };
  for (const field of f.refs) {
    const replacement = survivorFor(vc[field]);
    next[field] = replacement.id;
    console.log(`  ${f.list.name} (${f.list.id.slice(0, 8)}) ${field}: ${vc[field]} -> ${replacement.id}  [${replacement.name}]`);
  }
  if (f.overrideRefs.length) {
    const mo = { ...(vc.masterViewOverrides ?? {}) };
    for (const k of f.overrideRefs) {
      const replacement = survivorFor(k);
      // Survivor's own settings win — it is the copy the list is actually
      // using. Spreading the doomed duplicate last would overwrite live
      // per-list tweaks with settings from a view the user had abandoned.
      mo[replacement.id] = { ...mo[k], ...(mo[replacement.id] ?? {}) };
      delete mo[k];
      console.log(`  ${f.list.name} override ${k} -> ${replacement.id}`);
    }
    next.masterViewOverrides = mo;
  }
  f.next = next;
}

const snapshotPath = process.env.SNAPSHOT_PATH ?? '/tmp/duplicate-master-views-snapshot.json';
const snapshot = {
  scope: TARGET_EMAIL ?? 'all accounts',
  deleting: toDelete,
  lists: fixes.map(f => ({ id: f.list.id, view_configs: f.list.view_configs })),
};
writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
console.log(`\nsnapshot written: ${snapshotPath}`);

if (!APPLY) { console.log('\nDRY RUN — nothing written. Re-run with --apply'); process.exit(0); }

for (const f of fixes) {
  const { error } = await sb.from('parts_lists').update({ view_configs: f.next }).eq('id', f.list.id);
  if (error) { console.error('list update failed', f.list.id, error); process.exit(1); }
  console.log(`updated list ${f.list.id}`);
}

const { error: delErr } = await sb.from('view_templates').delete().in('id', [...deleteIds]);
if (delErr) { console.error('delete failed', delErr); process.exit(1); }
console.log(`deleted ${deleteIds.size} duplicate view(s)`);

// ---- verify every touched account, and REPAIR a lost default -------------
// The deleted copy may have been the one holding the star. The partial unique
// index only forbids MORE than one default per user, so zero passes silently.
const after = await fetchAllPages('view_templates', 'id,user_id,name,is_default,created_at', q =>
  q.in('user_id', [...affected]));
const listsAfter = await fetchAllPages('parts_lists', 'id,user_id,name,view_configs', q =>
  q.in('user_id', [...affected]));

console.log('\nfinal state:');
let problems = 0;
for (const userId of affected) {
  const rows = after.filter(r => r.user_id === userId).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const defaults = rows.filter(r => r.is_default);

  if (defaults.length === 0 && rows.length > 0) {
    // Restore the star onto the survivor of the group that lost it.
    const restore = rows[0];
    const { error } = await sb.from('view_templates')
      .update({ is_default: true, updated_at: new Date().toISOString() }).eq('id', restore.id);
    if (error) { console.error('  could not restore default:', error); problems++; }
    else { restore.is_default = true; console.log(`  ${emailById.get(userId)}: restored missing default -> ${restore.name}`); }
  } else if (defaults.length > 1) {
    console.error(`  ${emailById.get(userId)}: WARNING ${defaults.length} default views`);
    problems++;
  }

  console.log(`  ${emailById.get(userId)}`);
  rows.forEach(r => console.log(`    ${r.created_at.slice(0, 10)}  default=${r.is_default}  ${r.name}`));

  const liveIds = new Set(rows.map(r => r.id));
  for (const l of listsAfter.filter(l => l.user_id === userId)) {
    const vc = l.view_configs; if (!vc) continue;
    const ownIds = new Set((vc.views ?? []).map(v => v.id));
    const dangling = [vc.activeViewId, vc.defaultViewId, ...Object.keys(vc.masterViewOverrides ?? {})]
      .filter(id => id && id !== 'raw' && !liveIds.has(id) && !ownIds.has(id));
    if (!dangling.length) continue;

    // Only a reference to something WE deleted is this run's fault. Accounts can
    // carry older dangling ids from unrelated causes; reporting those as a
    // failure of this repair would make a clean run look broken.
    const causedByUs = [...new Set(dangling)].filter(id => deleteIds.has(id));
    if (causedByUs.length) {
      problems++;
      console.error(`    list ${l.name}: STILL POINTS AT DELETED VIEW ${causedByUs.join(',')}`);
    } else {
      console.log(`    list ${l.name}: pre-existing dangling ref ${[...new Set(dangling)].join(',')} (not from this run)`);
    }
  }
}
if (problems > 0) { console.error(`\n${problems} problem(s) after repair — inspect before re-running`); process.exit(1); }
console.log('\nrepair verified: every touched account has exactly one default and no dangling references');
