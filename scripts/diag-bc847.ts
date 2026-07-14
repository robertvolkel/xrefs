/**
 * THROWAWAY DIAGNOSTIC — delete after reading.
 *
 * "I need a small signal NPN, 9V, 1-2mA, hFE 200-400" used to return BC847BLT1G. It stopped
 * on June 30. TWO defects are each individually sufficient to explain it, and fixing the wrong
 * one changes global search ranking for nothing:
 *
 *   (4) the parametric fetch reads the 1-2 mA OPERATING current as a MAX RATING and bands the
 *       catalogue to parts rated 2-20 mA. BC847 is rated 100 mA. But if no facet value lands in
 *       that band, pickNumericValueIds returns [] and the filter is SKIPPED — which would clear
 *       defect 4 entirely.
 *   (6) the keyword search runs on the logic table's verbose DISPLAY NAME ("BJTs — NPN & PNP")
 *       against one arbitrary category leaf.
 *
 * Run: npx tsx --env-file=.env.local scripts/diag-bc847.ts
 */
import { getLogicTable } from '../lib/logicTables';
import { buildSyntheticSource, buildGreenfieldQuery } from '../lib/services/searchConstraints';
import {
  resolveCategoryIdsForFamily,
  buildFiltersForCategory,
  pickNumericValueIds,
  fetchGreenfieldParametricProducts,
} from '../lib/services/greenfieldParametricFetch';
import { getCategoryParametricFacets, keywordSearch } from '../lib/services/digikeyClient';
import type { SearchConstraint } from '../lib/types';

const TARGET = 'BC847BLT1G';
const hit = (mpn: string) => mpn.toUpperCase().replace(/[^A-Z0-9]/g, '').includes('BC847B');

const h = (s: string) => console.log(`\n${'─'.repeat(78)}\n${s}\n${'─'.repeat(78)}`);

// What the guided flow actually produces for this request (B6 Tier 2 = polarity, vceo_max,
// ic_max, package_case — the user stated NPN, 9 V, 1-2 mA; gain is Tier 3 and never asked).
const FAMILY = 'B6';
const constraints: SearchConstraint[] = [
  { attribute: 'polarity', value: 'NPN' },
  { attribute: 'vceo_max', value: 9, unit: 'V' },
  { attribute: 'ic_max', value: 2, unit: 'mA' },
];

(async () => {
  const table = getLogicTable(FAMILY)!;
  h('1. WHAT THE GUIDED FLOW SENDS');
  console.log(`  family            : ${FAMILY} — ${table.familyName}`);
  const partType = table.familyName; // pinFamily() uses the display name verbatim
  const query = buildGreenfieldQuery(partType, constraints);
  console.log(`  partType (keyword): ${JSON.stringify(partType)}`);
  console.log(`  final query       : ${JSON.stringify(query)}   ← DEFECT 6 if this returns junk`);
  console.log(`  constraints       : ${constraints.map(c => `${c.attribute}=${c.value}${c.unit ?? ''}`).join(', ')}`);
  console.log(`  gain asked?       : NO — hfe is Tier 3, and Tier 3 is never asked (the narrowing gap)`);

  h('2. SYNTHETIC SOURCE (what the specs normalise to)');
  const synth = buildSyntheticSource(constraints, partType, [], FAMILY);
  if (!synth) { console.log('  ✗ buildSyntheticSource returned null — nothing else can work'); return; }
  for (const p of synth.source.parameters) {
    console.log(`  ${p.parameterId.padEnd(14)} value=${String(p.value).padEnd(10)} numeric=${p.numericValue}`);
  }
  const dropped = constraints.filter(c => !synth.source.parameters.some(p => p.parameterId === c.attribute));
  console.log(dropped.length
    ? `  ⚠ SILENTLY DROPPED: ${dropped.map(c => c.attribute).join(', ')}   ← DEFECT 5`
    : '  (no constraint silently dropped)');

  h('3. CATEGORY RESOLUTION');
  const categoryIds = await resolveCategoryIdsForFamily(FAMILY);
  console.log(`  resolved categories: [${categoryIds.join(', ')}]`);
  console.log(`  keyword search uses: ${categoryIds[0]} (the FIRST leaf only)`);

  h('4. ⭐ DOES THE Ic FILTER ACTUALLY GET PUSHED?  (settles defect 4)');
  const icRule = table.rules.find(r => r.attributeId === 'ic_max')!;
  console.log(`  ic_max rule: logicType=${icRule.logicType} dir=${icRule.thresholdDirection} weight=${icRule.weight}`);
  console.log(`  stated 2 mA + gte + OVERSPEC×10  ⇒  band = 2 mA … 20 mA   (BC847 is rated 100 mA)`);

  for (const categoryId of categoryIds) {
    const discover = await getCategoryParametricFacets('', categoryId, undefined, undefined).catch(() => null);
    if (!discover || !discover.facets.length) { console.log(`  cat ${categoryId}: no facets`); continue; }

    const filters = buildFiltersForCategory(synth.source.parameters, table, discover.facets, discover.products[0]);
    const facetName = (pid: number) =>
      discover.facets.find(f => f.ParameterId === pid)?.ParameterName ?? `#${pid}`;
    console.log(`\n  cat ${categoryId}: ${discover.facets.length} facets → ${filters.length} filter(s) pushed`);
    for (const f of filters) {
      console.log(`     • "${facetName(f.parameterId)}" → ${f.valueIds.length} value(s)`);
    }

    // The specific question: what does the Ic facet look like, and does the band catch anything?
    const icFacet = discover.facets.find(f =>
      /collector.*\(ic\)|current - collector/i.test(f.ParameterName ?? ''));
    if (!icFacet) { console.log(`     (no collector-current facet in this category)`); continue; }
    const ids = pickNumericValueIds(icFacet, 0.002, icRule);
    const pushedForReal = filters.some(f => f.parameterId === icFacet.ParameterId);
    const inBand = (icFacet.FilterValues ?? []).filter(v => ids.includes(v.ValueId)).map(v => v.ValueName);
    console.log(`     Ic facet "${icFacet.ParameterName}" (${(icFacet.FilterValues ?? []).length} values)`);
    console.log(`     pickNumericValueIds(0.002 A, band 2–20 mA) → ${ids.length} value(s): ${inBand.join(', ') || '—'}`);
    console.log(`     ACTUALLY pushed by buildFiltersForCategory? ${pushedForReal ? 'YES' : 'NO'}`);
    console.log(pushedForReal
      ? `     ⇒ ✗ THE Ic FILTER FIRES. The catalogue IS banded to 2–20 mA, so a 100 mA BC847 cannot survive. DEFECT 4 CONFIRMED.`
      : `     ⇒ ✓ the Ic filter is NOT pushed here (facet never matched) — defect 4 does not fire in this category.`);
  }

  h('5. DOES THE KEYWORD POOL CONTAIN THE PART?  (settles defect 6)');
  for (const [label, q] of [['verbose display name (what ships today)', query], ['a clean keyword (the proposed fix)', 'npn bjt transistor']] as const) {
    const res = await keywordSearch(q, { limit: 50, categoryId: categoryIds[0] }).catch(e => { console.log(`  ${label}: ERROR ${e.message}`); return null; });
    if (!res) continue;
    const products = [...(res.ExactMatches ?? []), ...(res.Products ?? [])];
    const rank = products.findIndex(p => hit(p.ManufacturerProductNumber ?? ''));
    console.log(`  ${label}`);
    console.log(`    query=${JSON.stringify(q)} → ${products.length} products`);
    console.log(`    ${TARGET}: ${rank >= 0 ? `✓ FOUND at rank ${rank + 1}` : '✗ ABSENT'}`);
    if (products.length) console.log(`    first 3: ${products.slice(0, 3).map(p => p.ManufacturerProductNumber).join(', ')}`);
  }

  h('6. THE REAL PARAMETRIC POOL (end to end)');
  const para = await fetchGreenfieldParametricProducts(constraints, partType, undefined, undefined, FAMILY, categoryIds);
  const paraRank = para.findIndex(p => hit(p.ManufacturerProductNumber ?? ''));
  console.log(`  parametric pool: ${para.length} products`);
  console.log(`  ${TARGET}: ${paraRank >= 0 ? `✓ FOUND at rank ${paraRank + 1}` : '✗ ABSENT'}`);
  if (para.length) console.log(`  sample: ${para.slice(0, 5).map(p => p.ManufacturerProductNumber).join(', ')}`);

  h('7. ⭐⭐ WHAT THE USER ACTUALLY SEES  (searchParts end-to-end)');
  // The keyword pool CONTAINS BC847 at rank 3 and the parametric pool is only UNIONed in — so
  // if the part is still missing from the final list, something DOWNSTREAM sinks it (the
  // over-spec penalty: ln(100mA / 2mA) = 3.9, a large demerit for being a normal transistor)
  // or the 50-cap is applied before fit-ranking. This is the only section that matters to a user.
  const { searchParts } = await import('../lib/services/partDataService');
  const result = await searchParts(query, undefined, undefined, { partType, constraints });
  const matches = result.matches ?? [];
  const rank = matches.findIndex(m => hit(m.mpn));
  console.log(`  searchParts → ${matches.length} matches`);
  console.log(`  ${TARGET}: ${rank >= 0 ? `✓ present at rank ${rank + 1}` : '✗ ABSENT FROM THE FINAL LIST'}`);
  console.log('\n  top 10 as the user sees them:');
  matches.slice(0, 10).forEach((m, i) => {
    const flag = hit(m.mpn) ? '  ← THE PART' : '';
    console.log(`    ${String(i + 1).padStart(2)}. ${(m.mpn ?? '').padEnd(22)} ${(m.manufacturer ?? '').slice(0, 18).padEnd(20)} fail=${m.failCount ?? '-'} ${m.hardFail ? 'HARDFAIL' : ''}${flag}`);
  });
  if (rank >= 0 && rank >= 10) {
    const m = matches[rank];
    console.log(`\n  …${TARGET} is buried at ${rank + 1}: fail=${m.failCount} hardFail=${m.hardFail} score=${m.matchScore}`);
  }

  h('8. ⭐⭐⭐ WHY IS IT BURIED?  (compute the real sort keys)');
  // Sort (partDataService, search-vetting): fewest fails → Active → most CONFIRMED specs →
  // LEAST OVER-SPEC PENALTY → match %. Every top part has fail=0, so the penalty decides.
  // penalty = Σ ln(candidate / required) over gte thresholds where candidate > required.
  const { getAttributes } = await import('../lib/services/partDataService');
  const { computeOverSpecPenalty } = await import('../lib/services/searchConstraints');
  const probe = ['BC847BLT1G', 'PN5133 PBFREE', 'KSC2223YMTF', '2SC2714-Y'];
  console.log('  penalty = Σ ln(candidate / required) over gte thresholds. LOWER RANKS HIGHER.\n');
  for (const mpn of probe) {
    const attrs = await getAttributes(mpn).catch(() => null);
    if (!attrs) { console.log(`  ${mpn.padEnd(16)} (no attributes)`); continue; }
    const pen = computeOverSpecPenalty(synth.logicTable, synth.source, attrs);
    const ic = attrs.parameters.find(p => p.parameterId === 'ic_max');
    const vceo = attrs.parameters.find(p => p.parameterId === 'vceo_max');
    console.log(`  ${mpn.padEnd(16)} Ic=${String(ic?.value ?? '?').padEnd(9)} Vceo=${String(vceo?.value ?? '?').padEnd(8)} penalty=${pen.toFixed(2)}${mpn.startsWith('BC847') ? '   ← THE PART' : ''}`);
  }
  console.log('\n  If BC847 has the HIGHEST penalty, it is being demoted for the crime of being a');
  console.log('  perfectly normal transistor: rated 100 mA when the circuit draws 2 mA is CORRECT');
  console.log('  ENGINEERING, not over-spec. Headroom on a max-rating is free.');

  h('VERDICT');
  console.log('  §4  parametric Ic filter pushed?  → defect 4');
  console.log('  §5  keyword finds the part?       → defect 6');
  console.log('  §7  does the USER see it?         → the only question that matters');
  console.log('  Fix ONLY the defect that actually fires.\n');
})();
