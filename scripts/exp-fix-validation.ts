/**
 * THROWAWAY EXPERIMENT — proves the proposed fixes BEFORE any production code changes.
 * Nothing here imports a modified module; the candidate fixes are re-implemented locally and
 * run against the REAL Digikey catalogue, so a claim that fails here never reaches the codebase.
 *
 *   A. Un-banding a gte fetch ([required, ∞) instead of [required, required×10]) — does the
 *      pool stop being 18 exotic parts, and does the BC847 appear?
 *   B. Pool-relative over-spec penalty — does the BC847 rise to the top?
 *   C. ⚠ THE SAFETY TEST — does a 1700 V MOSFET STILL SINK on a 12 V ask? (B changes ranking
 *      for every family; if this fails, B is wrong and must not ship.)
 *   D. Gain — is the data even there, and would `identity_range` actually separate a BC847B
 *      (200–450) from a BC847C (420–800) on a "200–400" ask?
 *   E. The "this constraint wiped out the catalogue" signal — measure real ratios so any
 *      trigger is grounded in data instead of an invented threshold.
 *
 * Run: npx tsx --env-file=.env.local scripts/exp-fix-validation.ts
 */
import { getLogicTable } from '../lib/logicTables';
import { buildSyntheticSource, computeOverSpecPenalty } from '../lib/services/searchConstraints';
import { resolveCategoryIdsForFamily } from '../lib/services/greenfieldParametricFetch';
import {
  getCategoryParametricFacets,
  keywordSearch,
  parametricFilterSearchMulti,
  type ParametricFilterSpec,
  type DigikeyParametricFilter,
} from '../lib/services/digikeyClient';
import { mapKeywordResponseToAttributesByMpn } from '../lib/services/digikeyMapper';
import { findReplacements } from '../lib/services/matchingEngine';
import type { LogicTable, PartAttributes, SearchConstraint } from '../lib/types';

const h = (s: string) => console.log(`\n${'═'.repeat(80)}\n${s}\n${'═'.repeat(80)}`);
const sub = (s: string) => console.log(`\n── ${s}`);

// Digikey facet values are strings like "100mA" / "1.5 A". Reuse the app's own parser shape.
function facetSI(name: string): number | null {
  const m = (name ?? '').trim().match(/^([\d.]+)\s*([munkMG]?)\s*([A-Za-z]*)/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!isFinite(n)) return null;
  const mult: Record<string, number> = { m: 1e-3, u: 1e-6, n: 1e-9, k: 1e3, M: 1e6, G: 1e9, '': 1 };
  return n * (mult[m[2]] ?? 1);
}

/** TODAY: gte ⇒ [v, v×10]. PROPOSED: gte ⇒ [v, ∞). Cap identical (25, ProductCount DESC). */
function pickIds(facet: DigikeyParametricFilter, required: number, mode: 'today' | 'proposed'): string[] {
  const hi = mode === 'today' ? required * 10 : Infinity;
  return (facet.FilterValues ?? [])
    .map(v => ({ v, n: facetSI(v.ValueName) }))
    .filter(x => x.n != null && (x.n as number) >= required && (x.n as number) <= hi)
    .sort((a, b) => (b.v.ProductCount ?? 0) - (a.v.ProductCount ?? 0))
    .slice(0, 25)
    .map(x => x.v.ValueId);
}

/** PROPOSED penalty: penalise over-spec RELATIVE TO THE POOL, not absolutely. */
function poolRelativePenalties(
  logicTable: LogicTable,
  source: PartAttributes,
  pool: PartAttributes[],
): Map<string, number> {
  const gteAttrs = source.parameters.filter(sp => {
    if (sp.numericValue === undefined || sp.numericValue <= 0) return false;
    const r = logicTable.rules.find(x => x.attributeId === sp.parameterId);
    return !!r && r.logicType === 'threshold' && (r.thresholdDirection ?? 'gte') === 'gte';
  });

  // Median candidate/required ratio per constrained attribute, over the pool.
  const medians = new Map<string, number>();
  for (const sp of gteAttrs) {
    const ratios = pool
      .map(c => c.parameters.find(p => p.parameterId === sp.parameterId)?.numericValue)
      .filter((n): n is number => n !== undefined && n > 0)
      .map(n => n / (sp.numericValue as number))
      .sort((a, b) => a - b);
    if (ratios.length) medians.set(sp.parameterId, ratios[Math.floor(ratios.length / 2)]);
  }

  const out = new Map<string, number>();
  for (const c of pool) {
    let penalty = 0;
    for (const sp of gteAttrs) {
      const cn = c.parameters.find(p => p.parameterId === sp.parameterId)?.numericValue;
      const med = medians.get(sp.parameterId);
      if (cn === undefined || cn <= 0 || !med) continue;
      const ratio = cn / (sp.numericValue as number);
      // Only what sits ABOVE what is normal for this pool is a demerit. Being typical = free.
      penalty += Math.max(0, Math.log(ratio / med));
    }
    out.set(c.part.mpn.toLowerCase(), penalty);
  }
  console.log(`     pool medians: ${[...medians].map(([k, v]) => `${k}=${v.toFixed(1)}×`).join(', ')}`);
  return out;
}

const isBC847 = (m: string) => /BC847B/i.test(m.replace(/[^A-Za-z0-9]/g, ''));

async function buildPool(query: string, categoryId: number, familyId: string) {
  const res = await keywordSearch(query, { limit: 50, categoryId });
  const byMpn = mapKeywordResponseToAttributesByMpn(res);
  return [...byMpn.values()].filter(a => a.parameters.length > 0);
}

function rank(
  label: string,
  logicTable: LogicTable,
  source: PartAttributes,
  pool: PartAttributes[],
  penalties: Map<string, number>,
  highlight: (mpn: string) => boolean,
  show = 8,
) {
  const recs = findReplacements(logicTable, source, pool);
  const fails = (r: (typeof recs)[number]) =>
    (r.matchDetails ?? []).filter(d => d.ruleResult === 'fail').length;
  const sorted = [...recs].sort((a, b) => {
    const fd = fails(a) - fails(b);
    if (fd !== 0) return fd;
    const pd = (penalties.get(a.part.mpn.toLowerCase()) ?? 0) - (penalties.get(b.part.mpn.toLowerCase()) ?? 0);
    if (pd !== 0) return pd;
    return b.matchPercentage - a.matchPercentage;
  });
  console.log(`\n  ${label}`);
  sorted.slice(0, show).forEach((r, i) => {
    const p = penalties.get(r.part.mpn.toLowerCase()) ?? 0;
    console.log(
      `    ${String(i + 1).padStart(2)}. ${r.part.mpn.padEnd(20)} penalty=${p.toFixed(2).padStart(5)} ` +
        `fail=${fails(r)} ${highlight(r.part.mpn) ? ' ← TARGET' : ''}`,
    );
  });
  const at = sorted.findIndex(r => highlight(r.part.mpn));
  console.log(`    TARGET rank: ${at >= 0 ? at + 1 : 'ABSENT'} of ${sorted.length}`);
  return { sorted, targetRank: at >= 0 ? at + 1 : -1 };
}

(async () => {
  // ───────────────────────────────── A ─────────────────────────────────
  h('A. UN-BANDING THE FETCH — does the pool stop being 18 exotic parts?');
  const B6 = getLogicTable('B6')!;
  const b6Constraints: SearchConstraint[] = [
    { attribute: 'polarity', value: 'NPN' },
    { attribute: 'vceo_max', value: 9, unit: 'V' },
    { attribute: 'ic_max', value: 2, unit: 'mA' },
  ];
  const b6Synth = buildSyntheticSource(b6Constraints, B6.familyName, [], 'B6')!;
  const b6Cats = await resolveCategoryIdsForFamily('B6');
  const CAT = 276; // the leaf that actually pushes the Ic filter

  const disc = await getCategoryParametricFacets('', CAT);
  const icFacet = disc.facets.find(f => /current - collector/i.test(f.ParameterName ?? ''))!;
  const vceoFacet = disc.facets.find(f => /collector emitter breakdown/i.test(f.ParameterName ?? ''))!;
  const typeFacet = disc.facets.find(f => /transistor type/i.test(f.ParameterName ?? ''))!;
  const npnIds = (typeFacet?.FilterValues ?? []).filter(v => /^NPN$/i.test(v.ValueName)).map(v => v.ValueId);

  for (const mode of ['today', 'proposed'] as const) {
    const filters: ParametricFilterSpec[] = [
      { parameterId: typeFacet.ParameterId, valueIds: npnIds },
      { parameterId: vceoFacet.ParameterId, valueIds: pickIds(vceoFacet, 9, mode) },
      { parameterId: icFacet.ParameterId, valueIds: pickIds(icFacet, 0.002, mode) },
    ];
    const res = await parametricFilterSearchMulti(CAT, filters, { limit: 50 }).catch(() => null);
    const products = [...(res?.ExactMatches ?? []), ...(res?.Products ?? [])];
    const found = products.some(p => isBC847(p.ManufacturerProductNumber ?? ''));
    sub(`${mode.toUpperCase()}  Ic band = ${mode === 'today' ? '2–20 mA' : '2 mA → ∞'}`);
    console.log(`     Ic valueIds: ${filters[2].valueIds.length}   Vceo valueIds: ${filters[1].valueIds.length}`);
    console.log(`     pool size  : ${products.length}`);
    console.log(`     BC847      : ${found ? '✓ PRESENT' : '✗ ABSENT'}`);
    console.log(`     sample     : ${products.slice(0, 5).map(p => p.ManufacturerProductNumber).join(', ')}`);
  }

  // ───────────────────────────────── B ─────────────────────────────────
  h('B. POOL-RELATIVE PENALTY — does the BC847 rise?');
  const b6Pool = await buildPool('npn bjt transistor', CAT, 'B6');
  console.log(`  scored pool: ${b6Pool.length} parts with attributes`);

  const todayPen = new Map<string, number>();
  for (const c of b6Pool) todayPen.set(c.part.mpn.toLowerCase(), computeOverSpecPenalty(B6, b6Synth.source, c));
  rank('TODAY (absolute penalty)', B6, b6Synth.source, b6Pool, todayPen, isBC847);

  sub('PROPOSED (pool-relative)');
  const propPen = poolRelativePenalties(B6, b6Synth.source, b6Pool);
  rank('PROPOSED (pool-relative penalty)', B6, b6Synth.source, b6Pool, propPen, isBC847);

  // ───────────────────────────────── C ─────────────────────────────────
  h('C. ⚠ SAFETY TEST — must a 1700 V MOSFET STILL SINK on a 12 V / 5 A ask?');
  const B5 = getLogicTable('B5')!;
  const b5Constraints: SearchConstraint[] = [
    { attribute: 'channel_type', value: 'N-Channel' },
    { attribute: 'vds_max', value: 12, unit: 'V' },
    { attribute: 'id_max', value: 5, unit: 'A' },
  ];
  const b5Synth = buildSyntheticSource(b5Constraints, B5.familyName, [], 'B5')!;
  const b5Cats = await resolveCategoryIdsForFamily('B5');
  const b5Pool = await buildPool('n-channel mosfet', b5Cats[0], 'B5');
  console.log(`  scored pool: ${b5Pool.length} parts (category ${b5Cats[0]})`);

  const vds = (a: PartAttributes) => a.parameters.find(p => p.parameterId === 'vds_max')?.numericValue ?? 0;
  const overkill = b5Pool.filter(a => vds(a) >= 200).sort((x, y) => vds(y) - vds(x));
  console.log(`  parts rated ≥200 V in pool: ${overkill.length}` +
    (overkill.length ? ` (highest: ${overkill[0].part.mpn} @ ${vds(overkill[0])} V)` : ''));

  if (overkill.length === 0) {
    console.log('  ⚠ no high-voltage part in this pool — the guardrail cannot be tested from it.');
  } else {
    const worst = overkill[0];
    const isWorst = (m: string) => m === worst.part.mpn;
    const b5Today = new Map<string, number>();
    for (const c of b5Pool) b5Today.set(c.part.mpn.toLowerCase(), computeOverSpecPenalty(B5, b5Synth.source, c));
    const r1 = rank(`TODAY — where does the ${vds(worst)} V part land?`, B5, b5Synth.source, b5Pool, b5Today, isWorst, 5);
    sub('PROPOSED');
    const b5Prop = poolRelativePenalties(B5, b5Synth.source, b5Pool);
    const r2 = rank(`PROPOSED — where does the ${vds(worst)} V part land?`, B5, b5Synth.source, b5Pool, b5Prop, isWorst, 5);
    console.log(`\n  ⚠ VERDICT: the ${vds(worst)} V part ranks ${r1.targetRank} today → ${r2.targetRank} proposed (of ${b5Pool.length}).`);
    console.log(`     It must stay near the BOTTOM. If it climbs toward the top, the proposed penalty is WRONG.`);
  }

  // ───────────────────────────────── D ─────────────────────────────────
  h('D. GAIN — is the data there, and would identity_range actually discriminate?');
  const hfeRule = B6.rules.find(r => r.attributeId === 'hfe')!;
  console.log(`  hfe rule TODAY: logicType=${hfeRule.logicType} weight=${hfeRule.weight}`);
  console.log(`  → 'application_review' scores EVERY candidate 50%, so gain cannot separate anything.\n`);
  for (const a of b6Pool.filter(c => /BC847|BC848|BC849/i.test(c.part.mpn)).slice(0, 8)) {
    const g = a.parameters.find(p => p.parameterId === 'hfe');
    console.log(`  ${a.part.mpn.padEnd(20)} hfe=${JSON.stringify(g?.value ?? null)}  numeric=${g?.numericValue ?? '—'}`);
  }
  console.log('\n  Would a 200–400 ask separate them? Needs the raw range string to PARSE.');

  // ───────────────────────────────── F ─────────────────────────────────
  h('F. ⭐ THE DECISIVE TEST — is fixing the FETCH alone enough? (keep TODAY\'s penalty)');
  // The real flow scores keyword-pool ∪ parametric-pool. Rebuild that union with the FIXED
  // (un-banded) parametric fetch, then rank with the UNCHANGED absolute penalty. If the BC847
  // lands at the top, the global ranking change (B) is NOT needed and must not ship — a smaller
  // fix that works beats a bigger one that might break other families.
  const widened: ParametricFilterSpec[] = [
    { parameterId: typeFacet.ParameterId, valueIds: npnIds },
    { parameterId: vceoFacet.ParameterId, valueIds: pickIds(vceoFacet, 9, 'proposed') },
    { parameterId: icFacet.ParameterId, valueIds: pickIds(icFacet, 0.002, 'proposed') },
  ];
  const paraRes = await parametricFilterSearchMulti(CAT, widened, { limit: 50 }).catch(() => null);
  const paraAttrs = paraRes ? [...mapKeywordResponseToAttributesByMpn(paraRes).values()] : [];

  const union = new Map<string, PartAttributes>();
  for (const a of b6Pool) union.set(a.part.mpn.toLowerCase(), a);          // keyword pool
  for (const a of paraAttrs) if (a.parameters.length) union.set(a.part.mpn.toLowerCase(), a); // + parametric
  const unionPool = [...union.values()];
  console.log(`  union pool: ${b6Pool.length} keyword + ${paraAttrs.length} parametric = ${unionPool.length} unique`);

  // Are any of the exotic near-2mA parts STILL in the union? They are what out-ranked the BC847.
  const icOf = (a: PartAttributes) => a.parameters.find(p => p.parameterId === 'ic_max')?.numericValue ?? 0;
  const exotics = unionPool.filter(a => icOf(a) > 0 && icOf(a) <= 0.02).sort((x, y) => icOf(x) - icOf(y));
  console.log(`  parts still rated ≤20 mA (the ones that beat it before): ${exotics.length}` +
    (exotics.length ? ` — e.g. ${exotics.slice(0, 4).map(a => `${a.part.mpn}@${(icOf(a) * 1000).toFixed(0)}mA`).join(', ')}` : ''));

  const unionToday = new Map<string, number>();
  for (const c of unionPool) unionToday.set(c.part.mpn.toLowerCase(), computeOverSpecPenalty(B6, b6Synth.source, c));
  const fOut = rank('FETCH FIXED + TODAY\'S PENALTY UNCHANGED', B6, b6Synth.source, unionPool, unionToday, isBC847, 10);

  sub('…and for comparison, fetch fixed + the PROPOSED pool-relative penalty');
  const unionProp = poolRelativePenalties(B6, b6Synth.source, unionPool);
  const fOut2 = rank('FETCH FIXED + PROPOSED PENALTY', B6, b6Synth.source, unionPool, unionProp, isBC847, 10);

  console.log(`\n  ⇒ BC847 rank: ${fOut.targetRank} (fetch fix only)  vs  ${fOut2.targetRank} (fetch fix + penalty change)`);
  console.log('     If the fetch fix ALONE is good, DO NOT change the penalty. Smaller fix wins.');

  // ───────────────────────────────── G ─────────────────────────────────
  h('G. ⚠ THE ONLY REMAINING RISK — widening the fetch lets HIGH-VOLTAGE parts in. Do they sink?');
  // I am NOT changing the penalty (F proved it unnecessary). But widening a gte band to [v, ∞)
  // means a "12 V" ask now FETCHES 100 V / 600 V / 1700 V MOSFETs too. The absolute over-spec
  // penalty is the only thing keeping them down. If a 600 V part outranks a 30 V part on a 12 V
  // ask, widening is unsafe and needs a cap after all.
  const B5b = getLogicTable('B5')!;
  const b5c: SearchConstraint[] = [
    { attribute: 'channel_type', value: 'N-Channel' },
    { attribute: 'vds_max', value: 12, unit: 'V' },
    { attribute: 'id_max', value: 5, unit: 'A' },
  ];
  const b5s = buildSyntheticSource(b5c, B5b.familyName, [], 'B5')!;
  const b5cats = await resolveCategoryIdsForFamily('B5');
  const B5CAT = b5cats[0];
  const b5disc = await getCategoryParametricFacets('', B5CAT);
  const vdsFacet = b5disc.facets.find(f => /drain.*source voltage|vdss|voltage - rated/i.test(f.ParameterName ?? ''));
  const idFacet = b5disc.facets.find(f => /current - continuous drain|\bid\b/i.test(f.ParameterName ?? ''));
  console.log(`  cat ${B5CAT}: vds facet="${vdsFacet?.ParameterName ?? 'NONE'}" id facet="${idFacet?.ParameterName ?? 'NONE'}"`);

  if (!vdsFacet) {
    console.log('  ⚠ no Vds facet — cannot run this guardrail from the parametric path.');
  } else {
    for (const mode of ['today', 'proposed'] as const) {
      const ids = pickIds(vdsFacet, 12, mode);
      const names = (vdsFacet.FilterValues ?? []).filter(v => ids.includes(v.ValueId)).map(v => v.ValueName);
      const f: ParametricFilterSpec[] = [{ parameterId: vdsFacet.ParameterId, valueIds: ids }];
      if (idFacet) f.push({ parameterId: idFacet.ParameterId, valueIds: pickIds(idFacet, 5, mode) });
      const res = await parametricFilterSearchMulti(B5CAT, f, { limit: 50 }).catch(() => null);
      const pool = res ? [...mapKeywordResponseToAttributesByMpn(res).values()].filter(a => a.parameters.length) : [];
      const vd = (a: PartAttributes) => a.parameters.find(p => p.parameterId === 'vds_max')?.numericValue ?? 0;
      const hv = pool.filter(a => vd(a) >= 100).sort((x, y) => vd(y) - vd(x));
      sub(`${mode.toUpperCase()}  Vds band = ${mode === 'today' ? '12–120 V' : '12 V → ∞'}`);
      console.log(`     Vds values fetched: ${names.slice(0, 12).join(', ')}${names.length > 12 ? ` …+${names.length - 12}` : ''}`);
      console.log(`     pool ${pool.length} parts; rated ≥100 V: ${hv.length}` +
        (hv.length ? ` (highest ${hv[0].part.mpn} @ ${vd(hv[0])} V)` : ''));

      if (mode === 'proposed' && hv.length && pool.length) {
        const pen = new Map<string, number>();
        for (const c of pool) pen.set(c.part.mpn.toLowerCase(), computeOverSpecPenalty(B5b, b5s.source, c));
        const worst = hv[0];
        const r = rank(`     where does the ${vd(worst)} V part land under TODAY'S penalty?`,
          B5b, b5s.source, pool, pen, (m) => m === worst.part.mpn, 5);
        const ok = r.targetRank === -1 || r.targetRank > pool.length / 2;
        console.log(`\n     ⇒ ${ok ? '✓ SAFE' : '✗ UNSAFE'}: the ${vd(worst)} V part ranks ${r.targetRank} of ${pool.length}.`);
        console.log(`        It must stay in the BOTTOM half. If it climbs, widening needs a cap.`);
      }
    }
  }

  // ───────────────────────────────── E ─────────────────────────────────
  h('E. THE "CONSTRAINT WIPED OUT THE CATALOGUE" SIGNAL — measure, do not invent');
  const all = await keywordSearch('', { limit: 1, categoryId: CAT });
  const total = all.ProductsCount ?? 0;
  console.log(`  category ${CAT} holds ${total} parts in total.\n`);
  const probes: Array<[string, number, DigikeyParametricFilter]> = [
    ['ic_max = 2 mA   (the MISREAD — an operating current)', 0.002, icFacet],
    ['ic_max = 100 mA (a REAL rating requirement)', 0.1, icFacet],
    ['ic_max = 1 A    (a REAL rating requirement)', 1, icFacet],
  ];
  for (const [label, req, facet] of probes) {
    const ids = pickIds(facet, req, 'today');
    const res = await parametricFilterSearchMulti(CAT, [{ parameterId: facet.ParameterId, valueIds: ids }], { limit: 1 }).catch(() => null);
    const n = res?.ProductsCount ?? 0;
    const pct = total ? ((n / total) * 100).toFixed(1) : '?';
    console.log(`  ${label}`);
    console.log(`     TODAY's band → ${n} of ${total} parts survive (${pct}%)`);
  }
  console.log('\n  A trigger should key off the SURVIVAL RATE, not a guess about the value.');
})();
