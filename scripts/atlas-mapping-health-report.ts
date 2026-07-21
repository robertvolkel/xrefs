/**
 * Atlas — Mapping Health review worksheet (READ-ONLY).
 *
 * Produces a per-parameter KEEP / REVOKE / UNVERIFIED verdict for the bursts
 * whose wrongness is confirmed by real product values, so a human can action
 * them in the admin UI. Writes nothing: every correction must be clicked in
 * Triage so it lands in the append-only decision log (`recordParamDecision`).
 *
 * Deliberate conservatism, in priority order:
 *   1. A parameter with NO sampled values is never recommended for revoke.
 *      Absence of evidence is not evidence.
 *   2. A suggested destination attribute is emitted ONLY if that attributeId
 *      already exists in this scope's dictionary. Inventing a canonical id is
 *      the documented hallucination failure (see atlas-revoke-bad-canonical.mjs
 *      "re-poisons new rows"); an unmapped parameter returning to the Triage
 *      queue is the safe outcome.
 *   3. Values that leak the column header into the data (vendor bug: a cell
 *      containing the literal parameter name) are discounted, not counted as
 *      categorical evidence — that mistake produced a whole false finding.
 *
 * Usage:
 *   npm run atlas:mapping-health-report
 *   npm run atlas:mapping-health-report -- --json
 */

import { createClient } from '@supabase/supabase-js';
import { profileValues, quantityOf, type Quantity } from '../lib/services/mappingHealthCore';
import { isMissingValue } from '../lib/services/atlasMapper';

const asJson = process.argv.includes('--json');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase env (run via the npm script so --env-file applies)');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * The three bursts confirmed wrong by value evidence, from
 * scripts/atlas-audit-mapping-health.ts plus the falsification pass.
 * Scope, the attribute they all landed on, and whether the scope is an L3
 * family id or an L2 category (that decides how products are queried).
 */
const VERIFIED_BURSTS: Array<{ scope: string; attributeId: string; isFamily: boolean }> = [
  { scope: 'Sensors', attributeId: 'frequency', isFamily: false },
  { scope: 'Sensors', attributeId: 'operating_temp', isFamily: false },
  { scope: 'LEDs and Optoelectronics', attributeId: 'color', isFamily: false },
];

interface OverrideRow {
  id: string;
  family_id: string;
  param_name: string;
  attribute_id: string;
  attribute_name: string | null;
  unit: string | null;
  created_at: string;
  action: string;
}

async function fetchScopeOverrides(scope: string): Promise<OverrideRow[]> {
  const rows: OverrideRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('atlas_dictionary_overrides')
      .select('id, family_id, param_name, attribute_id, attribute_name, unit, created_at, action')
      .eq('is_active', true)
      .eq('family_id', scope)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as OverrideRow[]));
    if ((data ?? []).length < 1000) break;
  }
  return rows;
}

/** Deep sample: page through the scope so every parameter gets real evidence. */
async function sampleScope(scope: string, isFamily: boolean, maxProducts: number) {
  const perParam = new Map<string, { values: string[]; products: number }>();
  let scanned = 0;
  for (let from = 0; from < maxProducts; from += 1000) {
    let q = supabase.from('atlas_products').select('atlas_raw').order('id', { ascending: true }).range(from, from + 999);
    q = isFamily ? q.eq('family_id', scope) : q.eq('category', scope).is('family_id', null);
    const { data, error } = await q;
    if (error) throw new Error(`${scope}: ${error.message}`);
    if (!data?.length) break;
    scanned += data.length;
    for (const row of data) {
      const params = (row as { atlas_raw: { parameters?: Array<{ name: string; value: string }> } }).atlas_raw?.parameters ?? [];
      for (const p of params) {
        if (!p || p.name === undefined || p.value === undefined) continue;
        const key = String(p.name).toLowerCase().trim().replace(/\s+/g, ' ');
        if (!perParam.has(key)) perParam.set(key, { values: [], products: 0 });
        const e = perParam.get(key)!;
        e.products++;
        if (e.values.length < 120) e.values.push(String(p.value));
      }
    }
    if (data.length < 1000) break;
  }
  return { perParam, scanned };
}

/**
 * Drops values that are just the column header repeated into the cell — a real
 * vendor-file bug. Counting them as text made four correct time mappings look
 * like categorical ones.
 */
function realValues(paramName: string, values: readonly string[]): string[] {
  const header = paramName.toLowerCase().trim();
  return values.filter((v) => {
    const s = String(v).trim();
    if (!s || isMissingValue(s)) return false;
    return s.toLowerCase() !== header;
  });
}

type Verdict = 'KEEP' | 'REVOKE' | 'UNVERIFIED';

interface ParamAssessment {
  paramName: string;
  overrideId: string | null;
  source: 'db' | 'built-in';
  /** Was this one of the mappings accepted in the rapid burst, or added separately later? */
  inBurst: boolean;
  createdAt: string | null;
  productCount: number;
  sampleValues: string[];
  observedQuantity: Quantity | 'text' | null;
  verdict: Verdict;
  reason: string;
  suggestedDestination: string | null;
}

/** The quantity an attribute is supposed to hold, from its own declared unit. */
function intendedQuantity(rows: OverrideRow[], attributeId: string): Quantity | null {
  const declared = rows.find((r) => r.attribute_id === attributeId && r.unit)?.unit;
  if (!declared) return null;
  const q = quantityOf(declared);
  return q === 'unknown' ? null : q;
}

async function main() {
  const report: Array<{
    scope: string;
    attributeId: string;
    intended: string;
    totalMapped: number;
    burstSize: number;
    burstSpanSeconds: number;
    productsScanned: number;
    params: ParamAssessment[];
  }> = [];

  for (const { scope, attributeId, isFamily } of VERIFIED_BURSTS) {
    const overrides = await fetchScopeOverrides(scope);
    const members = overrides
      .filter((r) => r.attribute_id === attributeId && r.action !== 'remove')
      .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
    if (!members.length) continue;

    // Which of these landed in the ORIGINAL burst, and which were added later
    // and separately? Without this split the header reported "47 parameters in
    // 5,255,154 seconds" — 60 days — which is not a burst at all. The verdict
    // below is driven by VALUE evidence either way, so a late-added mapping is
    // still judged; but calling it part of a bulk mistake would be false.
    const BURST_WINDOW_MS = 30_000;
    const burstIds = new Set<string>();
    {
      let run = [members[0]];
      const flush = () => { if (run.length >= 3) for (const r of run) burstIds.add(r.id); };
      for (let i = 1; i < members.length; i++) {
        if (+new Date(members[i].created_at) - +new Date(members[i - 1].created_at) <= BURST_WINDOW_MS) run.push(members[i]);
        else { flush(); run = [members[i]]; }
      }
      flush();
    }
    const burstMembers = members.filter((m) => burstIds.has(m.id));

    const { perParam, scanned } = await sampleScope(scope, isFamily, 4000);

    // Every attributeId already in use in this scope — the ONLY pool a
    // suggested destination may be drawn from.
    const existingHere = new Map<string, Quantity>();
    for (const r of overrides) {
      if (!r.attribute_id || r.attribute_id === attributeId) continue;
      const q = r.unit ? quantityOf(r.unit) : 'unknown';
      if (q !== 'unknown' && !existingHere.has(r.attribute_id)) existingHere.set(r.attribute_id, q);
    }

    const intended = intendedQuantity(overrides, attributeId);
    const params: ParamAssessment[] = [];

    for (const m of members) {
      const obs = perParam.get(m.param_name);
      const vals = realValues(m.param_name, obs?.values ?? []);
      const prof = profileValues(vals);
      const numeric = prof.total - prof.categorical;

      let observed: Quantity | 'text' | null = null;
      if (prof.total >= 4) {
        if (prof.categorical / prof.total >= 0.6) observed = 'text';
        else if (numeric > 0 && prof.dominantQuantity && prof.dominantQuantity !== 'unknown') {
          const share = (prof.quantityCounts[prof.dominantQuantity] ?? 0) / numeric;
          if (share >= 0.6) observed = prof.dominantQuantity;
        }
      }

      let verdict: Verdict;
      let reason: string;
      if (!obs || prof.total < 4) {
        verdict = 'UNVERIFIED';
        reason = obs ? `only ${prof.total} usable values found — not enough to judge` : 'no products carry this parameter in the sample';
      } else if (observed === null) {
        verdict = 'UNVERIFIED';
        reason = 'values are mixed; no single kind of value dominates';
      } else if (intended && observed !== intended) {
        verdict = 'REVOKE';
        reason = `holds ${observed === 'text' ? 'text, not a measurement' : observed.replace(/_/g, ' ')} — the spec expects ${intended.replace(/_/g, ' ')}`;
      } else if (intended && observed === intended) {
        verdict = 'KEEP';
        reason = `holds ${observed.replace(/_/g, ' ')}, which is what this spec expects`;
      } else {
        // No declared unit on the attribute (e.g. `color`). A MEASUREMENT
        // landing in a descriptive spec is provable — 607nm is not a colour.
        // Text is NOT: this engine can tell text from a measurement, but it
        // cannot tell the RIGHT text from the wrong text. "载带方式" holds
        // 侧贴/正贴 (tape orientation) and "二极管配置" holds 共阳极/共阴极
        // (common anode/cathode) — both are text, both are plainly not colours,
        // and an earlier version of this rule marked them KEEP purely because
        // they were text. Blessing a wrong mapping is worse than admitting the
        // limit, so text goes to the human.
        if (observed === 'text') {
          verdict = 'UNVERIFIED';
          reason = 'holds text — a measurement could be ruled out automatically, but whether this is the RIGHT text needs a person';
        } else {
          verdict = 'REVOKE';
          reason = `holds ${observed.replace(/_/g, ' ')} — a measurement, which cannot belong in a descriptive spec`;
        }
      }

      let suggested: string | null = null;
      if (verdict === 'REVOKE' && observed && observed !== 'text') {
        for (const [attrId, q] of existingHere) if (q === observed) { suggested = attrId; break; }
      }

      params.push({
        paramName: m.param_name,
        overrideId: m.id,
        source: 'db',
        inBurst: burstIds.has(m.id),
        createdAt: m.created_at,
        productCount: obs?.products ?? 0,
        sampleValues: vals.slice(0, 5),
        observedQuantity: observed,
        verdict,
        reason,
        suggestedDestination: suggested,
      });
    }

    const span = burstMembers.length
      ? (+new Date(burstMembers[burstMembers.length - 1].created_at) - +new Date(burstMembers[0].created_at)) / 1000
      : 0;
    report.push({
      scope,
      attributeId,
      intended: intended ?? 'descriptive (no unit)',
      totalMapped: members.length,
      burstSize: burstMembers.length,
      burstSpanSeconds: span,
      productsScanned: scanned,
      params,
    });
  }

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  let totalRevoke = 0, totalKeep = 0, totalUnverified = 0;
  for (const b of report) {
    console.log(`\n${'═'.repeat(78)}`);
    console.log(`${b.scope}  →  ${b.attributeId}`);
    console.log(
      `${b.totalMapped} parameters point here` +
      (b.burstSize ? ` — ${b.burstSize} of them accepted together in ${b.burstSpanSeconds.toFixed(1)}s` : '') +
      ` · expects ${b.intended} · ${b.productsScanned} products scanned`,
    );
    console.log('═'.repeat(78));
    for (const p of ['REVOKE', 'KEEP', 'UNVERIFIED'] as Verdict[]) {
      const rows = b.params.filter((x) => x.verdict === p);
      if (!rows.length) continue;
      console.log(`\n  ${p} (${rows.length})`);
      for (const r of rows) {
        console.log(`    "${r.paramName.replace(/\n/g, ' ')}"  · ${r.productCount} products${r.inBurst ? '' : '  (added separately, not part of the burst)'}`);
        console.log(`        ${r.reason}`);
        if (r.sampleValues.length) console.log(`        values: ${r.sampleValues.join(' | ')}`);
        if (r.suggestedDestination) console.log(`        an existing spec that fits: ${r.suggestedDestination}`);
        console.log(`        override id: ${r.overrideId}`);
      }
    }
    totalRevoke += b.params.filter((x) => x.verdict === 'REVOKE').length;
    totalKeep += b.params.filter((x) => x.verdict === 'KEEP').length;
    totalUnverified += b.params.filter((x) => x.verdict === 'UNVERIFIED').length;
  }
  console.log(`\n${'═'.repeat(78)}`);
  console.log(`TOTAL   revoke: ${totalRevoke}   keep: ${totalKeep}   unverified (leave alone): ${totalUnverified}`);
  console.log('Nothing was written. Apply changes in the Triage UI so they are logged and undoable.');
}

main().catch((e) => { console.error(e); process.exit(1); });
