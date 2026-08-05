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
const TARGET_EMAIL = userFlag > -1 ? process.argv[userFlag + 1] : null;

const { data: profs } = await sb.from('profiles').select('id,email');
const emailById = new Map(profs.map(p => [p.id, p.email]));

let query = sb.from('view_templates').select('*').order('created_at');
if (TARGET_EMAIL) {
  const uid = profs.find(p => p.email === TARGET_EMAIL)?.id;
  if (!uid) { console.error(`user not found: ${TARGET_EMAIL}`); process.exit(1); }
  query = query.eq('user_id', uid);
}
const { data: vts, error: vtErr } = await query;
if (vtErr) { console.error(vtErr); process.exit(1); }

// Group by (user, name); keep the NEWEST of each duplicate group — it is the
// one the account is actively using (is_default + the list's activeViewId).
const byUserName = new Map();
for (const r of vts) {
  const k = `${r.user_id}::${r.name}`;
  if (!byUserName.has(k)) byUserName.set(k, []);
  byUserName.get(k).push(r);
}
const toDelete = [];
const keepFor = new Map(); // user::name -> surviving row
for (const [k, rows] of byUserName) {
  const sorted = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
  keepFor.set(k, sorted[sorted.length - 1]);
  for (const r of sorted.slice(0, -1)) toDelete.push(r);
}

// Refuse to delete anything the user customised.
const customised = toDelete.filter(r => r.updated_at.slice(0, 19) !== r.created_at.slice(0, 19));
if (customised.length) {
  console.error('ABORT: a duplicate has been edited since creation:', customised.map(r => r.id));
  process.exit(1);
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

// Every list in the system, so we can prove nothing else points at the deleted ids.
const { data: allLists, error: lErr } = await sb
  .from('parts_lists').select('id,user_id,name,view_configs');
if (lErr) { console.error(lErr); process.exit(1); }

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
      mo[replacement.id] = { ...(mo[replacement.id] ?? {}), ...mo[k] };
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

// Exactly one default must survive.
const { data: after } = await sb.from('view_templates').select('id,name,is_default,created_at').eq('user_id', uid).order('created_at');
console.log('\nfinal state:');
after.forEach(r => console.log(`  ${r.created_at.slice(0, 10)}  default=${r.is_default}  ${r.name}`));
if (after.filter(r => r.is_default).length !== 1) console.error('WARNING: expected exactly one default view');

const { data: listsAfter } = await sb.from('parts_lists').select('id,name,view_configs').eq('user_id', uid);
const liveIds = new Set(after.map(r => r.id));
for (const l of listsAfter) {
  const vc = l.view_configs; if (!vc) continue;
  const dangling = [vc.activeViewId, vc.defaultViewId].filter(id => id && id !== 'raw' && !liveIds.has(id));
  console.log(`  list ${l.name}: active=${vc.activeViewId} default=${vc.defaultViewId} dangling=${dangling.length ? dangling.join(',') : 'none'}`);
}
