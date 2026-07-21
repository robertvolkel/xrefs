/**
 * Atlas — Mapping Health audit (READ-ONLY).
 *
 * Answers, from real data: how many parameter mappings does the corpus itself
 * contradict? Writes nothing, mutates nothing.
 *
 * Data source is `atlas_products.atlas_raw` (the raw vendor model, verified
 * 100% populated) — NOT `data/atlas/*.json`, which is gitignored and therefore
 * absent on any machine but the one that did the ingest. A disk-reading audit
 * would report "all clear" on the server purely because it could not see.
 *
 * Usage:
 *   npm run atlas:mapping-health
 *   npm run atlas:mapping-health -- --sample 400   # products sampled per scope
 *   npm run atlas:mapping-health -- --json
 */

import { createClient } from '@supabase/supabase-js';
import {
  detectQuantityClash,
  detectUnitMismatch,
  profileValues,
  type Finding,
  type MappingUnderTest,
} from '../lib/services/mappingHealthCore';
import {
  atlasParamDictionaries,
  getAtlasL2ParamDictionary,
  getAtlasL2DictionaryCategories,
  getSharedParamDictionary,
  type AtlasParamMapping,
} from '../lib/services/atlasMapper';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const flagValue = (name: string, fallback: number) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? Number(args[i + 1]) : fallback;
};
const SAMPLE_PER_SCOPE = flagValue('--sample', 400);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (run via npm script so --env-file applies)');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

interface OverrideRow {
  id: string;
  family_id: string;
  param_name: string;
  action: 'add' | 'modify' | 'remove';
  attribute_id: string | null;
  attribute_name: string | null;
  unit: string | null;
  sort_order: number | null;
}

async function fetchOverrides(): Promise<OverrideRow[]> {
  const rows: OverrideRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('atlas_dictionary_overrides')
      .select('id, family_id, param_name, action, attribute_id, attribute_name, unit, sort_order')
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`override fetch failed: ${error.message}`);
    rows.push(...((data ?? []) as OverrideRow[]));
    if ((data ?? []).length < 1000) break;
  }
  return rows;
}

/** scope -> lowercased param name -> mapping (+ provenance) */
type ResolvedMapping = AtlasParamMapping & { source: 'code' | 'db'; overrideId?: string };
type ScopeDict = Map<string, ResolvedMapping>;

function buildMappingTable(overrides: OverrideRow[]): Map<string, ScopeDict> {
  const table = new Map<string, ScopeDict>();
  const scopeOf = (scope: string): ScopeDict => {
    if (!table.has(scope)) table.set(scope, new Map());
    return table.get(scope)!;
  };

  // 1. In-code family dictionaries
  for (const [familyId, dict] of Object.entries(atlasParamDictionaries)) {
    const s = scopeOf(familyId);
    for (const [param, m] of Object.entries(dict)) s.set(param, { ...m, source: 'code' });
  }
  // 2. In-code L2 (category) dictionaries
  for (const category of getAtlasL2DictionaryCategories()) {
    const s = scopeOf(category);
    for (const [param, m] of Object.entries(getAtlasL2ParamDictionary(category) ?? {})) {
      s.set(param, { ...m, source: 'code' });
    }
  }
  // 3. Shared dictionary — applies to every scope. Held separately so a shared
  //    mapping is not reported once per family (40x duplicate findings).
  const shared = new Map<string, ResolvedMapping>();
  for (const [param, m] of Object.entries(getSharedParamDictionary())) {
    shared.set(param, { ...m, source: 'code' });
  }
  table.set('__shared__', shared);

  // 4. DB overrides, in the same remove -> modify -> add order ingest uses.
  for (const r of overrides) {
    if (r.action !== 'remove') continue;
    scopeOf(r.family_id).delete(String(r.param_name).toLowerCase().trim());
  }
  for (const r of overrides) {
    if (r.action !== 'modify') continue;
    const s = scopeOf(r.family_id);
    const key = String(r.param_name).toLowerCase().trim();
    const base = s.get(key);
    if (!base) continue;
    s.set(key, {
      attributeId: r.attribute_id ?? base.attributeId,
      attributeName: r.attribute_name ?? base.attributeName,
      sortOrder: r.sort_order ?? base.sortOrder ?? 50,
      ...(r.unit !== null && r.unit !== undefined ? { unit: r.unit } : base.unit ? { unit: base.unit } : {}),
      source: 'db',
      overrideId: r.id,
    });
  }
  for (const r of overrides) {
    if (r.action !== 'add') continue;
    if (!r.attribute_id || !r.attribute_name) continue;
    scopeOf(r.family_id).set(String(r.param_name).toLowerCase().trim(), {
      attributeId: r.attribute_id,
      attributeName: r.attribute_name,
      sortOrder: r.sort_order ?? 50,
      ...(r.unit ? { unit: r.unit } : {}),
      source: 'db',
      overrideId: r.id,
    });
  }
  return table;
}

/** Which scopes exist in the product corpus, and how big is each. */
async function fetchScopes(): Promise<Array<{ scope: string; isFamily: boolean; count: number }>> {
  const { data, error } = await supabase.rpc('get_atlas_scope_counts');
  if (!error && data) return data as Array<{ scope: string; isFamily: boolean; count: number }>;
  // No RPC — derive from the dictionaries we already have and count per scope.
  const scopes: Array<{ scope: string; isFamily: boolean; count: number }> = [];
  for (const familyId of Object.keys(atlasParamDictionaries)) {
    const { count } = await supabase
      .from('atlas_products')
      .select('*', { count: 'exact', head: true })
      .eq('family_id', familyId);
    if ((count ?? 0) > 0) scopes.push({ scope: familyId, isFamily: true, count: count ?? 0 });
  }
  for (const category of getAtlasL2DictionaryCategories()) {
    const { count } = await supabase
      .from('atlas_products')
      .select('*', { count: 'exact', head: true })
      .eq('category', category)
      .is('family_id', null);
    if ((count ?? 0) > 0) scopes.push({ scope: category, isFamily: false, count: count ?? 0 });
  }
  return scopes;
}

interface RawParam { name: string; value: string }
interface AtlasRaw { parameters?: RawParam[] }

/** Real values per (scope, lowercased param name), from a sample of products. */
async function sampleValues(
  scopes: Array<{ scope: string; isFamily: boolean; count: number }>,
): Promise<Map<string, Map<string, { values: string[]; products: number }>>> {
  const out = new Map<string, Map<string, { values: string[]; products: number }>>();

  for (const { scope, isFamily } of scopes) {
    let q = supabase.from('atlas_products').select('atlas_raw').order('id', { ascending: true }).limit(SAMPLE_PER_SCOPE);
    q = isFamily ? q.eq('family_id', scope) : q.eq('category', scope).is('family_id', null);
    const { data, error } = await q;
    if (error) {
      console.error(`  ! ${scope}: ${error.message}`);
      continue;
    }
    const perParam = new Map<string, { values: string[]; products: number }>();
    for (const row of data ?? []) {
      const raw = (row as { atlas_raw: AtlasRaw }).atlas_raw;
      for (const p of raw?.parameters ?? []) {
        if (!p || p.name === undefined || p.value === undefined) continue;
        const key = String(p.name).toLowerCase().trim().replace(/\s+/g, ' ');
        if (!perParam.has(key)) perParam.set(key, { values: [], products: 0 });
        const e = perParam.get(key)!;
        e.products++;
        if (e.values.length < 60) e.values.push(String(p.value));
      }
    }
    out.set(scope, perParam);
  }
  return out;
}

async function main() {
  console.log('Atlas Mapping Health — READ-ONLY audit\n');

  const overrides = await fetchOverrides();
  console.log(`active dictionary overrides: ${overrides.length}`);
  const table = buildMappingTable(overrides);
  const shared = table.get('__shared__')!;

  const scopes = await fetchScopes();
  console.log(`scopes present in the corpus: ${scopes.length}`);
  console.log(`sampling up to ${SAMPLE_PER_SCOPE} products per scope...\n`);

  const sampled = await sampleValues(scopes);

  const findings: Finding[] = [];
  let mappingsChecked = 0;
  let mappingsWithEnoughData = 0;

  for (const { scope } of scopes) {
    const dict = table.get(scope);
    const perParam = sampled.get(scope);
    if (!perParam) continue;

    // Every param observed in this scope, resolved the way ingest resolves it:
    // family/L2 dict first, then the shared dictionary.
    const underTest: MappingUnderTest[] = [];
    for (const [paramName, obs] of perParam) {
      const m = dict?.get(paramName) ?? shared.get(paramName);
      if (!m) continue; // unmapped — that is Triage's job, not this audit's
      if (m.attributeId.startsWith('_')) continue; // deliberately parked
      mappingsChecked++;
      if (obs.values.length >= 4) mappingsWithEnoughData++;
      underTest.push({
        scope,
        paramName,
        attributeId: m.attributeId,
        declaredUnit: m.unit ?? null,
        source: m.source,
        overrideId: m.overrideId,
        values: obs.values,
        productCount: obs.products,
      });
    }

    // Rule 3 — declared unit vs this param's own values.
    for (const m of underTest) {
      const f = detectUnitMismatch(m);
      if (f) findings.push(f);
    }
    // Rule 4 — one attribute fed different kinds of value.
    const byAttribute = new Map<string, MappingUnderTest[]>();
    for (const m of underTest) {
      if (!byAttribute.has(m.attributeId)) byAttribute.set(m.attributeId, []);
      byAttribute.get(m.attributeId)!.push(m);
    }
    for (const [attributeId, ms] of byAttribute) {
      const f = detectQuantityClash(scope, attributeId, ms);
      if (f) findings.push(f);
    }
  }

  if (asJson) {
    console.log(JSON.stringify({ findings, mappingsChecked, mappingsWithEnoughData }, null, 2));
    return;
  }

  const byKind = (k: string) => findings.filter((f) => f.kind === k);
  console.log('─'.repeat(72));
  console.log(`mappings checked against real values : ${mappingsChecked}`);
  console.log(`  ...with enough values for a verdict: ${mappingsWithEnoughData}`);
  console.log(`\nFINDINGS: ${findings.length}`);
  console.log(`  unit says one quantity, values another : ${byKind('unit_quantity_mismatch').length}`);
  console.log(`  right quantity, wrong SI prefix        : ${byKind('unit_prefix_mismatch').length}`);
  console.log(`  one attribute fed different quantities : ${byKind('quantity_clash').length}`);
  console.log('─'.repeat(72));

  const order = { certain: 0, likely: 1, review: 2 } as const;
  findings.sort((a, b) => order[a.severity] - order[b.severity] || b.affectedProducts - a.affectedProducts);

  for (const f of findings.slice(0, 40)) {
    console.log(`\n[${f.severity.toUpperCase()}] ${f.scope} → ${f.attributeId}   (${f.affectedProducts} products affected)`);
    console.log(`  ${f.evidence}`);
    for (const p of f.params) {
      const src = p.source === 'db' ? `db:${p.overrideId?.slice(0, 8)}` : 'built-in';
      console.log(`    · "${p.paramName}" [${src}] declares ${p.declaredUnit ?? '(none)'} · values: ${p.sampleValues.slice(0, 4).join(' | ')}`);
    }
  }
  if (findings.length > 40) console.log(`\n... and ${findings.length - 40} more`);

  // Is the flagship example real? Report it explicitly either way.
  const colorFindings = findings.filter((f) => f.attributeId === 'color');
  console.log(`\n${'─'.repeat(72)}\nflagship 'color' example: ${colorFindings.length} finding(s)`);
  for (const f of colorFindings) console.log(`  ${f.scope}: ${f.evidence}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
