/**
 * Part Data Service — Unified data layer
 *
 * Tries Digikey API first, then parts.io gap-fill, then Atlas.
 * Returns null/empty when no real data source has results.
 * All functions are async and server-side only.
 */

import { SearchResult, PartAttributes, XrefRecommendation, ApplicationContext, RecommendationResult } from '../types';
import { keywordSearch, getProductDetails } from './digikeyClient';
import {
  mapKeywordResponseToSearchResult,
  mapDigikeyProductToAttributes,
} from './digikeyMapper';
import { searchAtlasProducts, getAtlasAttributes, fetchAtlasCandidates } from './atlasClient';
import { getLogicTableForSubcategory, enrichRectifierAttributes } from '../logicTables';
import { findReplacements } from './matchingEngine';
import { getContextQuestionsForFamily } from '../contextQuestions';
import { applyContextToLogicTable } from './contextModifier';
import { applyRuleOverrides, applyContextOverrides } from './overrideMerger';
import { isPartsioConfigured, getPartsioProductDetails, extractEquivalentMpns } from './partsioClient';
import { mapPartsioProductToAttributes } from './partsioMapper';

// ============================================================
// PARTS.IO LIFECYCLE METADATA HELPER
// ============================================================

import type { PartsioListing } from './partsioClient';
import type { Part } from '../types';

/** Extract lifecycle & compliance metadata from a parts.io listing into Part fields */
function extractPartsioLifecycle(listing: PartsioListing): Partial<Part> {
  const result: Partial<Part> = {};
  if (listing.YTEOL) result.yteol = parseFloat(listing.YTEOL);
  if (listing['Risk Rank'] != null) result.riskRank = listing['Risk Rank'];
  if (listing['Country Of Origin']) result.countryOfOrigin = listing['Country Of Origin'] as string;
  if (listing['Reach Compliance Code']) result.reachCompliance = listing['Reach Compliance Code'];
  if (listing['ECCN Code']) result.eccnCode = listing['ECCN Code'];
  if (listing['HTS Code']) result.htsCode = listing['HTS Code'];
  const leadTime = listing['Factory Lead Time'] as { Weeks?: number } | undefined;
  if (leadTime?.Weeks) result.factoryLeadTimeWeeks = leadTime.Weeks;
  return result;
}

// ============================================================
// CONFIGURATION CHECK
// ============================================================

function isDigikeyConfigured(): boolean {
  return !!(process.env.DIGIKEY_CLIENT_ID && process.env.DIGIKEY_CLIENT_SECRET);
}

// ============================================================
// SEARCH
// ============================================================

export async function searchParts(query: string, currency?: string): Promise<SearchResult> {
  // Search Digikey + Atlas in parallel, merge results
  const [digikeyResult, atlasResult] = await Promise.all([
    (async (): Promise<SearchResult> => {
      if (!isDigikeyConfigured()) return { type: 'none', matches: [] };
      try {
        const response = await keywordSearch(query, { limit: 10 }, currency);
        return mapKeywordResponseToSearchResult(response);
      } catch (error) {
        console.warn('Digikey search failed:', error);
        return { type: 'none', matches: [] };
      }
    })(),
    searchAtlasProducts(query).catch(() => ({ type: 'none' as const, matches: [] })),
  ]);

  // Merge: Digikey results first, then Atlas, deduplicate by MPN
  const seenMpns = new Set<string>();
  const mergedMatches = [];

  for (const part of digikeyResult.matches ?? []) {
    const key = part.mpn.toLowerCase();
    if (!seenMpns.has(key)) {
      seenMpns.add(key);
      mergedMatches.push(part);
    }
  }
  for (const part of atlasResult.matches ?? []) {
    const key = part.mpn.toLowerCase();
    if (!seenMpns.has(key)) {
      seenMpns.add(key);
      mergedMatches.push(part);
    }
  }

  if (mergedMatches.length > 0) {
    return {
      type: mergedMatches.length === 1 ? 'single' : 'multiple',
      matches: mergedMatches,
    };
  }

  // No results from any source
  return { type: 'none', matches: [] };
}

// ============================================================
// PARTS.IO ENRICHMENT (gap-fill after Digikey)
// ============================================================

/**
 * Enrich Digikey attributes with parts.io data.
 * Digikey values always win — parts.io only fills gaps (missing parameterId).
 */
async function enrichWithPartsio(attrs: PartAttributes): Promise<PartAttributes> {
  if (!isPartsioConfigured()) return attrs;

  try {
    const listing = await getPartsioProductDetails(attrs.part.mpn);
    if (!listing) return attrs;

    const partsioParams = mapPartsioProductToAttributes(listing);

    const existingIds = new Set(attrs.parameters.map(p => p.parameterId));
    const gapFills = partsioParams.filter(p => !existingIds.has(p.parameterId));

    // Enrich Part metadata from parts.io (gap-fill: only set if not already present)
    const lifecycle = extractPartsioLifecycle(listing);
    const enrichedPart = { ...attrs.part };
    let partChanged = false;
    for (const [key, value] of Object.entries(lifecycle)) {
      if ((enrichedPart as Record<string, unknown>)[key] == null) {
        (enrichedPart as Record<string, unknown>)[key] = value;
        partChanged = true;
      }
    }

    if (gapFills.length === 0 && !partChanged) return attrs;

    return {
      ...attrs,
      part: partChanged ? enrichedPart : attrs.part,
      parameters: gapFills.length > 0 ? [...attrs.parameters, ...gapFills] : attrs.parameters,
      enrichedFrom: 'partsio',
    };
  } catch (error) {
    console.warn('Parts.io enrichment failed for', attrs.part.mpn, error);
    return attrs;
  }
}

// ============================================================
// ATTRIBUTES
// ============================================================

export async function getAttributes(mpn: string, currency?: string): Promise<PartAttributes | null> {
  if (isDigikeyConfigured()) {
    try {
      const response = await getProductDetails(mpn, currency);
      if (response.Product) {
        const attrs = mapDigikeyProductToAttributes(response.Product);
        const enriched = await enrichWithPartsio({ ...attrs, dataSource: 'digikey' as const });
        return enriched;
      }
    } catch (error) {
      console.warn('Digikey product details lookup failed for', mpn, '— trying keyword search fallback');
    }

    // Fallback: keyword search by MPN (handles cases where Product Details API
    // doesn't recognize the MPN directly, e.g. NXP's "BC847CW,115")
    try {
      const searchResponse = await keywordSearch(mpn, { limit: 5 }, currency);
      const lowerMpn = mpn.toLowerCase();
      // Try exact match first, then prefix match (e.g. "BC857C" → "BC857C,115")
      const match = searchResponse.Products?.find(
        (p) => p.ManufacturerProductNumber?.toLowerCase() === lowerMpn
      ) ?? searchResponse.Products?.find(
        (p) => p.ManufacturerProductNumber?.toLowerCase().startsWith(lowerMpn)
      );
      if (match) {
        const attrs = mapDigikeyProductToAttributes(match);
        const enriched = await enrichWithPartsio({ ...attrs, dataSource: 'digikey' as const });
        return enriched;
      }
    } catch {
      console.warn('Digikey keyword search fallback also failed for', mpn);
    }
  }

  // Fallback: try Atlas database
  try {
    const atlasAttrs = await getAtlasAttributes(mpn);
    if (atlasAttrs) return atlasAttrs;
  } catch {
    console.warn('Atlas attribute lookup failed for', mpn);
  }

  // Fallback: try parts.io directly (covers parts.io-only candidates like FFF/FE equivalents)
  if (isPartsioConfigured()) {
    try {
      const listing = await getPartsioProductDetails(mpn);
      if (listing) {
        const parameters = mapPartsioProductToAttributes(listing);
        return {
          part: {
            mpn: listing['Manufacturer Part Number'] || mpn,
            manufacturer: listing.Manufacturer || 'Unknown',
            description: listing.Description || '',
            detailedDescription: listing.Description || '',
            status: (listing['Part Life Cycle Code'] || 'Unknown') as PartAttributes['part']['status'],
            category: 'Capacitors',
            subcategory: listing.Category || listing.Class || '',
            datasheetUrl: listing['Current Datasheet Url'],
            ...extractPartsioLifecycle(listing),
          } as Part,
          parameters,
          dataSource: 'partsio' as const,
        };
      }
    } catch {
      console.warn('Parts.io attribute lookup failed for', mpn);
    }
  }

  return null;
}

// ============================================================
// RECOMMENDATIONS (cross-reference)
// ============================================================

export async function getRecommendations(
  mpn: string,
  attributeOverrides?: Record<string, string>,
  applicationContext?: ApplicationContext,
  currency?: string,
  preferredManufacturers?: string[],
): Promise<RecommendationResult> {
  const recsStart = performance.now();

  // Step 1: Get source part attributes
  console.time('[perf] getAttributes');
  const sourceAttrs = await getAttributes(mpn, currency);
  console.timeEnd('[perf] getAttributes');
  if (!sourceAttrs) {
    const emptyAttrs: PartAttributes = { part: { mpn, manufacturer: '', description: '', detailedDescription: '', category: 'Capacitors', subcategory: '', status: 'Active' }, parameters: [] };
    return { recommendations: [], sourceAttributes: emptyAttrs };
  }

  const dataSource = sourceAttrs.dataSource ?? 'mock';

  // Step 1b: Merge user-supplied attribute overrides
  if (attributeOverrides && Object.keys(attributeOverrides).length > 0) {
    const logicTable = getLogicTableForSubcategory(sourceAttrs.part.subcategory, sourceAttrs);
    for (const [attrId, value] of Object.entries(attributeOverrides)) {
      const existing = sourceAttrs.parameters.find(p => p.parameterId === attrId);
      if (existing) {
        existing.value = value;
        existing.numericValue = undefined; // Force re-parse in matching engine
      } else {
        // Get a human-friendly name from the logic table rule if available
        const rule = logicTable?.rules.find(r => r.attributeId === attrId);
        sourceAttrs.parameters.push({
          parameterId: attrId,
          parameterName: rule?.attributeName ?? attrId,
          value,
          sortOrder: 999,
        });
      }
    }
  }

  // Step 1c: Enrich rectifier diodes with inferred recovery_category if missing
  const logicTablePrecheck = getLogicTableForSubcategory(sourceAttrs.part.subcategory, sourceAttrs);
  if (logicTablePrecheck?.familyId === 'B1') {
    enrichRectifierAttributes(sourceAttrs);
  }

  // Step 1d: Enrich switching regulators with topology/architecture from MPN prefix
  if (logicTablePrecheck?.familyId === 'C2') {
    enrichSwitchingRegulatorAttributes(sourceAttrs);
  }

  // Step 1e: Enrich gate drivers with driver_configuration/isolation_type from MPN prefix
  if (logicTablePrecheck?.familyId === 'C3') {
    enrichGateDriverAttributes(sourceAttrs);
  }

  // Step 1f: Enrich op-amps/comparators with device_type from MPN prefix
  if (logicTablePrecheck?.familyId === 'C4') {
    enrichOpampComparatorAttributes(sourceAttrs);
  }

  // Step 1g: Enrich logic ICs with logic_family and logic_function from MPN
  if (logicTablePrecheck?.familyId === 'C5') {
    enrichLogicICAttributes(sourceAttrs);
  }

  // Step 1h: Enrich voltage references with configuration/architecture/output_voltage from MPN
  if (logicTablePrecheck?.familyId === 'C6') {
    enrichVoltageReferenceAttributes(sourceAttrs);
  }

  // Step 1i: Enrich interface ICs with protocol/isolation_type/can_variant from MPN
  if (logicTablePrecheck?.familyId === 'C7') {
    enrichInterfaceICAttributes(sourceAttrs);
  }

  // Step 1j: Enrich timers/oscillators with device_category/output_signal_type/timer_variant from MPN
  if (logicTablePrecheck?.familyId === 'C8') {
    enrichTimerOscillatorAttributes(sourceAttrs);
  }

  // Step 1k: Enrich ADCs with architecture/resolution_bits/interface_type from MPN
  if (logicTablePrecheck?.familyId === 'C9') {
    enrichAdcAttributes(sourceAttrs);
  }

  // Step 1l: Enrich DACs with output_type/resolution_bits/interface_type from MPN
  if (logicTablePrecheck?.familyId === 'C10') {
    enrichDacAttributes(sourceAttrs);
  }

  // Step 1m: Enrich tantalum capacitors with capacitor_type from MPN prefix
  if (logicTablePrecheck?.familyId === '59') {
    enrichTantalumAttributes(sourceAttrs);
  }

  // Step 1n: Enrich crystals with frequency/cut_type/overtone/mounting_type from MPN
  if (logicTablePrecheck?.familyId === 'D1') {
    enrichCrystalAttributes(sourceAttrs);
  }

  // Step 1o: Enrich fuses with speed_class/package_format/mounting_type from MPN
  if (logicTablePrecheck?.familyId === 'D2') {
    enrichFuseAttributes(sourceAttrs);
  }

  // Step 1p: Enrich optocouplers with output_transistor_type/ctr_class/channel_count from MPN
  if (logicTablePrecheck?.familyId === 'E1') {
    enrichOptocouplerAttributes(sourceAttrs);
  }

  // Step 1q: Enrich relays with coil_voltage_vdc/contact_form from MPN
  if (logicTablePrecheck?.familyId === 'F1') {
    enrichRelayAttributes(sourceAttrs);
  }

  // Step 1r: Enrich solid state relays with output_switch_type/firing_mode from MPN
  if (logicTablePrecheck?.familyId === 'F2') {
    enrichSolidStateRelayAttributes(sourceAttrs);
  }

  // Step 2: Check if this family has a logic table (classifier detects variants)
  const logicTable = logicTablePrecheck;

  // No logic table → no recommendations possible
  if (!logicTable) {
    return { recommendations: [], sourceAttributes: sourceAttrs, dataSource };
  }

  const familyId = logicTable.familyId;
  const familyName = logicTable.familyName;

  // Step 2b: Apply admin rule overrides on top of TS base
  const tableWithOverrides = await applyRuleOverrides(logicTable);

  // Step 2c: Apply application context to modify logic table weights/rules
  let effectiveTable = tableWithOverrides;
  if (applicationContext) {
    let familyConfig = getContextQuestionsForFamily(logicTable.familyId);
    if (familyConfig) {
      familyConfig = await applyContextOverrides(familyConfig);
      effectiveTable = applyContextToLogicTable(tableWithOverrides, applicationContext, familyConfig);
    }
  }

  // Step 3: Fetch candidates from Digikey + Atlas + parts.io equivalents in parallel
  console.time('[perf] fetchCandidates');
  let [digikeyCandidates, atlasCandidates, partsioEquivalents] = await Promise.all([
    (async () => {
      if (!isDigikeyConfigured()) return [];
      try {
        return await fetchDigikeyCandidates(sourceAttrs, currency);
      } catch (error) {
        console.warn('Digikey candidate search failed:', error);
        return [];
      }
    })(),
    fetchAtlasCandidates(familyId).catch((error) => {
      console.warn('Atlas candidate fetch failed:', error);
      return [] as PartAttributes[];
    }),
    fetchPartsioEquivalents(mpn).catch((error) => {
      console.warn('Parts.io equivalent fetch failed:', error);
      return [] as PartAttributes[];
    }),
  ]);
  console.timeEnd('[perf] fetchCandidates');

  // Step 3a: Enrich Digikey candidates with parts.io gap-fill (parallel, ~one round-trip)
  if (isPartsioConfigured() && digikeyCandidates.length > 0) {
    console.time('[perf] enrichDigikeyCandidates');
    digikeyCandidates = await Promise.all(digikeyCandidates.map(c => enrichWithPartsio(c)));
    console.timeEnd('[perf] enrichDigikeyCandidates');
  }

  // Build metadata maps BEFORE dedup — survives even when higher-priority source wins
  const equivalenceMap = new Map<string, 'fff' | 'functional'>();
  for (const c of partsioEquivalents) {
    if (c.equivalenceType) {
      equivalenceMap.set(c.part.mpn.toLowerCase(), c.equivalenceType);
    }
  }
  const dataSourceMap = new Map<string, 'digikey' | 'atlas' | 'partsio'>();
  const enrichedFromMap = new Map<string, 'partsio'>();
  for (const c of digikeyCandidates) {
    dataSourceMap.set(c.part.mpn.toLowerCase(), 'digikey');
    if (c.enrichedFrom) enrichedFromMap.set(c.part.mpn.toLowerCase(), c.enrichedFrom);
  }
  for (const c of atlasCandidates) {
    if (!dataSourceMap.has(c.part.mpn.toLowerCase())) dataSourceMap.set(c.part.mpn.toLowerCase(), 'atlas');
  }
  for (const c of partsioEquivalents) {
    if (!dataSourceMap.has(c.part.mpn.toLowerCase())) dataSourceMap.set(c.part.mpn.toLowerCase(), 'partsio');
  }

  // Merge candidates, deduplicate by MPN (prefer Digikey for richer data)
  const seenMpns = new Set<string>();
  const allCandidates: PartAttributes[] = [];
  for (const c of digikeyCandidates) {
    const key = c.part.mpn.toLowerCase();
    if (!seenMpns.has(key)) {
      seenMpns.add(key);
      allCandidates.push(c);
    }
  }
  for (const c of atlasCandidates) {
    const key = c.part.mpn.toLowerCase();
    if (!seenMpns.has(key)) {
      seenMpns.add(key);
      allCandidates.push(c);
    }
  }
  for (const c of partsioEquivalents) {
    const key = c.part.mpn.toLowerCase();
    if (!seenMpns.has(key)) {
      seenMpns.add(key);
      allCandidates.push(c);
    }
  }
  console.log(`[perf] candidates: ${digikeyCandidates.length} Digikey + ${atlasCandidates.length} Atlas + ${partsioEquivalents.length} Parts.io = ${allCandidates.length} total`);

  if (allCandidates.length > 0) {
    console.time('[perf] findReplacements (scoring)');
    let recs = findReplacements(effectiveTable, sourceAttrs, allCandidates, preferredManufacturers);
    console.timeEnd('[perf] findReplacements (scoring)');

    // Propagate dataSource, equivalenceType, and enrichedFrom from pre-dedup maps
    recs = recs.map(rec => ({
      ...rec,
      dataSource: dataSourceMap.get(rec.part.mpn.toLowerCase()),
      equivalenceType: equivalenceMap.get(rec.part.mpn.toLowerCase()),
      enrichedFrom: enrichedFromMap.get(rec.part.mpn.toLowerCase()),
    }));

    // Step 3b: Post-scoring filter for C2 switching regulators —
    // topology and architecture are BLOCKING identity gates. Remove any
    // candidate with a confirmed mismatch so they never appear in results.
    if (familyId === 'C2') {
      recs = filterSwitchingRegulatorMismatches(recs, sourceAttrs);
    }

    // Step 3c: Post-scoring filter for C4 op-amps/comparators —
    // device_type (op-amp vs comparator) is a BLOCKING identity gate.
    if (familyId === 'C4') {
      recs = filterOpampComparatorMismatches(recs, sourceAttrs);
    }

    // Step 3d: Post-scoring filter for C5 logic ICs —
    // logic_function (part number suffix) is a BLOCKING identity gate.
    // '04 ≠ '14 even though both are inverters.
    if (familyId === 'C5') {
      recs = filterLogicICFunctionMismatches(recs, sourceAttrs);
    }

    // Step 3e: Post-scoring filter for C6 voltage references —
    // configuration (series vs shunt) is a BLOCKING identity gate.
    // Series and shunt are architecturally incompatible topologies.
    if (familyId === 'C6') {
      recs = filterVoltageReferenceConfigMismatches(recs, sourceAttrs);
    }

    // Step 3f: Post-scoring filter for C7 interface ICs —
    // protocol (RS-485/CAN/I2C/USB) is a BLOCKING identity gate.
    // No cross-protocol substitution is possible without circuit redesign.
    if (familyId === 'C7') {
      recs = filterInterfaceICProtocolMismatches(recs, sourceAttrs);
    }

    // Step 3g: Post-scoring filter for C8 timers/oscillators —
    // device_category (555/XO/MEMS/TCXO/VCXO/OCXO) is a BLOCKING identity gate.
    // Exception: XO↔MEMS cross-substitution is permitted with review flag.
    if (familyId === 'C8') {
      recs = filterTimerOscillatorCategoryMismatches(recs, sourceAttrs);
    }

    // Step 3h: Post-scoring filter for C9 ADCs —
    // architecture (SAR/Delta-Sigma/Pipeline/Flash) is a BLOCKING identity gate.
    // Cross-architecture candidates are removed before ranking. No exceptions.
    if (familyId === 'C9') {
      recs = filterAdcArchitectureMismatches(recs, sourceAttrs);
    }

    // Step 3i: Post-scoring filter for C10 DACs —
    // output_type (Voltage Output/Current Output) is a BLOCKING identity gate.
    // Cross-type candidates are removed before ranking. No exceptions.
    if (familyId === 'C10') {
      recs = filterDacOutputTypeMismatches(recs, sourceAttrs);
    }

    // Step 3j: Post-scoring filter for D1 crystals —
    // mounting_type (SMD vs Through-Hole) and overtone_order are BLOCKING gates.
    if (familyId === 'D1') {
      recs = filterCrystalMismatches(recs, sourceAttrs);
    }

    // Step 3k: Post-scoring filter for D2 fuses —
    // speed_class and package_format are BLOCKING identity gates.
    if (familyId === 'D2') {
      recs = filterFuseMismatches(recs, sourceAttrs);
    }

    // Step 3l: Post-scoring filter for E1 optocouplers —
    // output_transistor_type and channel_count are BLOCKING identity gates.
    if (familyId === 'E1') {
      recs = filterOptocouplerMismatches(recs, sourceAttrs);
    }

    // Step 3m: Post-scoring filter for F1 relays —
    // contact_form, coil_voltage_vdc, and contact_count are BLOCKING identity gates.
    if (familyId === 'F1') {
      recs = filterRelayMismatches(recs, sourceAttrs);
    }

    // Step 3n: Post-scoring filter for F2 solid state relays —
    // output_switch_type and mounting_type are BLOCKING identity gates.
    if (familyId === 'F2') {
      recs = filterSolidStateRelayMismatches(recs, sourceAttrs);
    }

    // Determine primary dataSource for the result set
    const resultDataSource = digikeyCandidates.length > 0 ? 'digikey' : (atlasCandidates.length > 0 ? 'atlas' : (partsioEquivalents.length > 0 ? 'partsio' : dataSource));

    console.log(`[perf] getRecommendations total: ${(performance.now() - recsStart).toFixed(0)}ms`);
    return { recommendations: recs, sourceAttributes: sourceAttrs, familyId, familyName, dataSource: resultDataSource };
  }

  // Step 4: No candidates found from any source
  return { recommendations: [], sourceAttributes: sourceAttrs, familyId, familyName, dataSource };
}

// ============================================================
// PARTS.IO EQUIVALENT CANDIDATE FETCHER
// ============================================================

/**
 * Fetch FFF and Functional Equivalent candidates from parts.io.
 * Gets the source part listing, extracts equivalent MPNs, then fetches
 * full parametric data for each equivalent.
 * Each candidate has equivalenceType set to 'fff' or 'functional'.
 */
async function fetchPartsioEquivalents(mpn: string): Promise<PartAttributes[]> {
  if (!isPartsioConfigured()) return [];

  // Get source listing (hits 30-min cache if already called during enrichWithPartsio)
  const listing = await getPartsioProductDetails(mpn);
  if (!listing) return [];

  const equivalents = extractEquivalentMpns(listing, mpn, 20);
  if (equivalents.length === 0) return [];

  const fffCount = equivalents.filter(e => e.type === 'fff').length;
  const feCount = equivalents.filter(e => e.type === 'functional').length;
  console.log(`[parts.io] Found ${equivalents.length} equivalents for ${mpn} (${fffCount} FFF, ${feCount} FE)`);

  // Fetch attributes for each equivalent MPN (parallel, with individual error handling)
  const results = await Promise.all(
    equivalents.map(async ({ mpn: eqMpn, type }) => {
      try {
        const eqListing = await getPartsioProductDetails(eqMpn);
        if (!eqListing) return null;

        const parameters = mapPartsioProductToAttributes(eqListing);
        return {
          part: {
            mpn: eqListing['Manufacturer Part Number'] || eqMpn,
            manufacturer: eqListing.Manufacturer || 'Unknown',
            description: eqListing.Description || '',
            detailedDescription: eqListing.Description || '',
            status: (eqListing['Part Life Cycle Code'] || 'Unknown') as PartAttributes['part']['status'],
            subcategory: eqListing.Category || eqListing.Class || '',
            ...extractPartsioLifecycle(eqListing),
          },
          parameters,
          dataSource: 'partsio' as const,
          equivalenceType: type,
        } as PartAttributes;
      } catch {
        return null;
      }
    })
  );

  return results.filter((r): r is PartAttributes => r !== null);
}

// ============================================================
// DIGIKEY CANDIDATE FETCHER
// ============================================================

/**
 * Search Digikey for candidates in the same component family.
 * Builds a keyword string from critical parameters of the source part.
 * Returns mapped PartAttributes[] ready for the matching engine.
 */
async function fetchDigikeyCandidates(
  sourceAttrs: PartAttributes,
  currency?: string,
): Promise<PartAttributes[]> {
  // Build a search query from key parameters
  const keywords = buildCandidateSearchQuery(sourceAttrs);
  if (!keywords) return [];

  const response = await keywordSearch(
    keywords,
    { limit: 20, categoryId: sourceAttrs.part.digikeyCategoryId },
    currency,
  );

  const allProducts = [
    ...(response.ExactMatches ?? []),
    ...(response.Products ?? []),
  ];

  // Deduplicate and exclude the source part itself
  const seen = new Set<string>();
  seen.add(sourceAttrs.part.mpn);

  const candidates: PartAttributes[] = [];
  for (const product of allProducts) {
    const mpn = product.ManufacturerProductNumber;
    if (seen.has(mpn)) continue;
    seen.add(mpn);
    candidates.push({ ...mapDigikeyProductToAttributes(product), dataSource: 'digikey' as const });
  }

  return candidates;
}

// ============================================================
// SWITCHING REGULATOR POST-SCORING FILTER (C2)
// ============================================================

/**
 * Remove candidates with confirmed topology or architecture mismatches.
 * These are BLOCKING identity gates — a buck converter can never substitute
 * for a boost converter, and a controller-only IC can never replace an
 * integrated-switch converter (or vice versa). Candidates with *missing*
 * topology/architecture are kept — the identity rules already flag them
 * as failures in the match details.
 */
function filterSwitchingRegulatorMismatches(
  recs: XrefRecommendation[],
  sourceAttrs: PartAttributes,
): XrefRecommendation[] {
  const srcTopology = sourceAttrs.parameters.find(p => p.parameterId === 'topology')?.value?.toLowerCase();
  const srcArch = sourceAttrs.parameters.find(p => p.parameterId === 'architecture')?.value?.toLowerCase();

  return recs.filter(rec => {
    // Candidate values are in matchDetails (rec.part is a Part, not PartAttributes)
    const candTopology = rec.matchDetails.find(d => d.parameterId === 'topology')?.replacementValue?.toLowerCase();
    const candArch = rec.matchDetails.find(d => d.parameterId === 'architecture')?.replacementValue?.toLowerCase();

    // If source or candidate is missing the value, keep the candidate (rules handle missing data)
    if (srcTopology && candTopology && candTopology !== srcTopology) return false;
    if (srcArch && candArch && candArch !== srcArch) return false;
    return true;
  });
}

// ============================================================
// DIGIKEY CANDIDATE FETCHER
// ============================================================

/** Build a keyword search string from source part attributes.
 *  When a category filter is applied, the subcategory keyword is unnecessary. */
function buildCandidateSearchQuery(sourceAttrs: PartAttributes): string {
  const parts: string[] = [];
  const paramMap = new Map(sourceAttrs.parameters.map(p => [p.parameterId, p]));

  // Capacitance or resistance value
  const cap = paramMap.get('capacitance');
  const res = paramMap.get('resistance');
  if (cap) parts.push(cap.value);
  else if (res) parts.push(res.value);

  // Discrete semiconductors: use voltage class as keyword for category-filtered search.
  // IGBTs, MOSFETs, BJTs, and diodes don't have capacitance/resistance, so without
  // this, the keyword string is empty and the search returns no candidates.
  const voltage = paramMap.get('vds_max') ?? paramMap.get('vces_max') ??
                  paramMap.get('vrrm') ?? paramMap.get('vceo_max') ?? paramMap.get('vdrm');
  if (voltage) {
    const vMatch = voltage.value.match(/(\d+)\s*V/i);
    if (vMatch) parts.push(`${vMatch[1]}V`);
  }

  // LDOs / Voltage Regulators: use output voltage as keyword
  const vout = paramMap.get('output_voltage');
  if (vout) {
    const vMatch = vout.value.match(/(\d+\.?\d*)\s*V/i);
    if (vMatch) parts.push(`${vMatch[1]}V`);
  }

  // Switching Regulators (C2): use topology as keyword to filter candidates
  const topology = paramMap.get('topology');
  if (topology) parts.push(topology.value);

  // Gate Drivers (C3): use driver configuration as keyword to filter candidates
  const driverConfig = paramMap.get('driver_configuration');
  if (driverConfig) parts.push(driverConfig.value);

  // Op-Amps/Comparators (C4): use channels as keyword
  const channels = paramMap.get('channels');
  if (channels) parts.push(channels.value);

  // Logic ICs (C5): use logic function suffix as keyword
  const logicFunction = paramMap.get('logic_function');
  if (logicFunction) parts.push(logicFunction.value);

  // Voltage References (C6): use configuration as keyword
  const vrefConfig = paramMap.get('configuration');
  if (vrefConfig) parts.push(vrefConfig.value);

  // Interface ICs (C7): use protocol as keyword
  const ifProtocol = paramMap.get('protocol');
  if (ifProtocol) parts.push(ifProtocol.value);

  // Timers and Oscillators (C8): use device category and frequency as keywords
  const deviceCat = paramMap.get('device_category');
  if (deviceCat) {
    const catVal = deviceCat.value;
    if (catVal === '555 Timer') parts.push('555 timer');
    else if (catVal === 'TCXO') parts.push('TCXO');
    else if (catVal === 'VCXO') parts.push('VCXO');
    else if (catVal === 'OCXO') parts.push('OCXO');
    else parts.push('oscillator');
  }
  const outputFreq = paramMap.get('output_frequency_hz');
  if (outputFreq) parts.push(outputFreq.value);

  // ADCs (C9): use architecture and resolution as keywords
  const adcArch = paramMap.get('architecture');
  if (adcArch) {
    const archVal = adcArch.value;
    if (archVal === 'SAR') parts.push('SAR ADC');
    else if (archVal === 'Delta-Sigma') parts.push('delta sigma ADC');
    else if (archVal === 'Pipeline') parts.push('pipeline ADC');
    else if (archVal === 'Flash') parts.push('flash ADC');
    else parts.push('ADC');
  }
  const adcRes = paramMap.get('resolution_bits');
  if (adcRes) parts.push(adcRes.value + ' bit');
  const adcInterface = paramMap.get('interface_type');
  if (adcInterface) parts.push(adcInterface.value);

  // DACs (C10): use output type and resolution as keywords
  const dacOutputType = paramMap.get('output_type');
  if (dacOutputType) {
    const otVal = dacOutputType.value;
    if (otVal === 'Current Output') parts.push('current output DAC');
    else parts.push('DAC');
  }
  const dacRes = paramMap.get('resolution_bits');
  if (dacRes && !adcRes) parts.push(dacRes.value + ' bit');
  const dacInterface = paramMap.get('interface_type');
  if (dacInterface && !adcInterface) parts.push(dacInterface.value);

  // Crystals (D1): use nominal frequency and load capacitance as keywords
  const crystalFreq = paramMap.get('nominal_frequency_hz');
  if (crystalFreq && !outputFreq) parts.push(crystalFreq.value);
  const crystalCL = paramMap.get('load_capacitance_pf');
  if (crystalCL) parts.push(crystalCL.value);

  // Fuses (D2): use current rating, voltage, and speed class as keywords
  const fuseCurrentRating = paramMap.get('current_rating_a');
  if (fuseCurrentRating) parts.push(fuseCurrentRating.value);
  const fuseVoltage = paramMap.get('voltage_rating_v');
  if (fuseVoltage && !vout && !voltage) parts.push(fuseVoltage.value);
  const fuseSpeed = paramMap.get('speed_class');
  if (fuseSpeed) parts.push(fuseSpeed.value);
  const fusePackage = paramMap.get('package_format');
  if (fusePackage) parts.push(fusePackage.value);

  // Optocouplers (E1): use output type, isolation voltage, and channel count
  const optoOutputType = paramMap.get('output_transistor_type');
  if (optoOutputType) parts.push(optoOutputType.value);
  const optoIsolation = paramMap.get('isolation_voltage_vrms');
  if (optoIsolation && !voltage) parts.push(optoIsolation.value);
  const optoChannels = paramMap.get('channel_count');
  if (optoChannels) parts.push(optoChannels.value);

  // Relays (F1): use coil voltage, contact form, and contact current rating
  const relayCoilVoltage = paramMap.get('coil_voltage_vdc');
  if (relayCoilVoltage) parts.push(relayCoilVoltage.value);
  const relayContactForm = paramMap.get('contact_form');
  if (relayContactForm) parts.push(relayContactForm.value);
  const relayContactCurrent = paramMap.get('contact_current_rating_a');
  if (relayContactCurrent) parts.push(relayContactCurrent.value);

  // Solid State Relays (F2): use output switch type, load voltage, load current + "SSR"
  const ssrOutputType = paramMap.get('output_switch_type');
  if (ssrOutputType) parts.push(ssrOutputType.value + ' SSR');
  const ssrLoadVoltage = paramMap.get('load_voltage_max_v');
  if (ssrLoadVoltage && !voltage && !vout) parts.push(ssrLoadVoltage.value);
  const ssrLoadCurrent = paramMap.get('load_current_max_a');
  if (ssrLoadCurrent && !relayContactCurrent) parts.push(ssrLoadCurrent.value);
  const ssrFiringMode = paramMap.get('firing_mode');
  if (ssrFiringMode) parts.push(ssrFiringMode.value);

  // Package
  const pkg = paramMap.get('package_case');
  if (pkg) {
    // Extract just the EIA code (e.g., "0603" from "0603 (1608 Metric)")
    const match = pkg.value.match(/\b(\d{4})\b/);
    if (match) parts.push(match[1]);
  }

  // Only add subcategory as keyword if no category filter will be applied
  if (!sourceAttrs.part.digikeyCategoryId && sourceAttrs.part.subcategory) {
    parts.push(sourceAttrs.part.subcategory);
  }

  return parts.join(' ');
}

// ============================================================
// SWITCHING REGULATOR MPN ENRICHMENT (C2)
// ============================================================

interface MpnTopologyHint {
  pattern: RegExp;
  topology?: string;
  manufacturer?: string;
}

/**
 * MPN prefix patterns for switching regulator classification.
 * Used to infer topology when Digikey parametric data is missing it.
 * Patterns are checked in order; first match wins.
 */
const switchingRegMpnPatterns: MpnTopologyHint[] = [
  // TI buck converters/controllers
  { pattern: /^TPS5[4-6]\d/i, topology: 'Buck', manufacturer: 'Texas Instruments' },
  { pattern: /^TPS62\d/i, topology: 'Buck', manufacturer: 'Texas Instruments' },
  { pattern: /^LM5\d{3,4}/i, topology: 'Buck', manufacturer: 'Texas Instruments' },
  { pattern: /^LMR\d/i, topology: 'Buck', manufacturer: 'Texas Instruments' },
  // TI boost converters
  { pattern: /^TPS61\d/i, topology: 'Boost', manufacturer: 'Texas Instruments' },
  { pattern: /^LM267\d/i, topology: 'Boost', manufacturer: 'Texas Instruments' },
  { pattern: /^TPS55\d/i, topology: 'Buck-Boost', manufacturer: 'Texas Instruments' },
  // Maxim (Analog Devices) switching
  { pattern: /^MAX17\d/i, manufacturer: 'Analog Devices' },
  { pattern: /^MAX20\d/i, manufacturer: 'Analog Devices' },
  // Renesas switching
  { pattern: /^ISL85\d/i, manufacturer: 'Renesas' },
  { pattern: /^ISL80\d/i, manufacturer: 'Renesas' },
  // MPS (Monolithic Power Systems)
  { pattern: /^MPQ\d/i, manufacturer: 'Monolithic Power Systems' },
  { pattern: /^MP[1-6]\d/i, manufacturer: 'Monolithic Power Systems' },
  // XLSEMI
  { pattern: /^XL42\d/i, topology: 'Buck', manufacturer: 'XLSEMI' },
  // ON Semi switching
  { pattern: /^MC34\d/i, manufacturer: 'ON Semiconductor' },
  { pattern: /^NCV\d/i, manufacturer: 'ON Semiconductor' },
  // ADI (Linear Technology) switching
  { pattern: /^LT87\d/i, manufacturer: 'Analog Devices' },
  { pattern: /^LT380\d/i, manufacturer: 'Analog Devices' },
  { pattern: /^LT86\d/i, manufacturer: 'Analog Devices' },
  { pattern: /^LTC3\d/i, manufacturer: 'Analog Devices' },
  // Microchip
  { pattern: /^MIC2\d/i, topology: 'Buck', manufacturer: 'Microchip' },
  // ROHM
  { pattern: /^BD9\d/i, manufacturer: 'ROHM' },
];

/**
 * Enrich C2 switching regulator attributes with topology inferred from MPN prefix.
 * Only fills in missing attributes — never overwrites Digikey parametric data.
 * Mutates `attrs.parameters` in place.
 */
function enrichSwitchingRegulatorAttributes(attrs: PartAttributes): void {
  const mpn = attrs.part.mpn;
  const hasTopology = attrs.parameters.some(p => p.parameterId === 'topology');

  // If topology is already present, no enrichment needed
  if (hasTopology) return;

  for (const hint of switchingRegMpnPatterns) {
    if (hint.pattern.test(mpn) && hint.topology) {
      attrs.parameters.push({
        parameterId: 'topology',
        parameterName: 'Topology',
        value: hint.topology,
        sortOrder: 0,
      });
      break;
    }
  }
}

// ============================================================
// GATE DRIVER MPN ENRICHMENT (C3)
// ============================================================

interface GateDriverMpnHint {
  pattern: RegExp;
  driverConfiguration?: string;
  isolationType?: string;
  manufacturer?: string;
}

/**
 * MPN prefix patterns for gate driver classification.
 * Used to infer driver_configuration and isolation_type when Digikey
 * parametric data is missing. Patterns are checked in order; first match wins.
 */
const gateDriverMpnPatterns: GateDriverMpnHint[] = [
  // Infineon half-bridge drivers (IR21xx series)
  { pattern: /^IR21\d/i, driverConfiguration: 'Half-Bridge', isolationType: 'Non-Isolated (Bootstrap)', manufacturer: 'Infineon' },
  // Infineon isolated gate drivers (IRS2xxx series)
  { pattern: /^IRS2\d/i, driverConfiguration: 'Half-Bridge', isolationType: 'Non-Isolated (Bootstrap)', manufacturer: 'Infineon' },
  // TI gate drivers (UCC27xxx series)
  { pattern: /^UCC271\d/i, driverConfiguration: 'Half-Bridge', isolationType: 'Non-Isolated (Bootstrap)', manufacturer: 'Texas Instruments' },
  { pattern: /^UCC272\d/i, driverConfiguration: 'Dual', isolationType: 'Non-Isolated (Bootstrap)', manufacturer: 'Texas Instruments' },
  { pattern: /^UCC27\d/i, isolationType: 'Non-Isolated (Bootstrap)', manufacturer: 'Texas Instruments' },
  // TI LM51xx half-bridge drivers
  { pattern: /^LM510[0-6]/i, driverConfiguration: 'Half-Bridge', isolationType: 'Non-Isolated (Bootstrap)', manufacturer: 'Texas Instruments' },
  // Microchip gate drivers (MCP14xx series)
  { pattern: /^MCP14[0-9]/i, isolationType: 'Non-Isolated (Bootstrap)', manufacturer: 'Microchip' },
  // Skyworks/Silicon Labs isolated gate drivers (Si827x series)
  { pattern: /^Si827\d/i, isolationType: 'Digital Isolator (Capacitive)', manufacturer: 'Skyworks' },
  // ADI isolated gate drivers (ADUM4xxx series)
  { pattern: /^ADUM\d/i, isolationType: 'Digital Isolator (Magnetic)', manufacturer: 'Analog Devices' },
  // ON Semi gate drivers (NCP51xx series)
  { pattern: /^NCP51\d/i, isolationType: 'Non-Isolated (Bootstrap)', manufacturer: 'ON Semiconductor' },
];

/**
 * Enrich C3 gate driver attributes with driver_configuration and isolation_type
 * inferred from MPN prefix. Only fills in missing attributes — never overwrites
 * Digikey parametric data. Mutates `attrs.parameters` in place.
 */
function enrichGateDriverAttributes(attrs: PartAttributes): void {
  const mpn = attrs.part.mpn;
  const hasConfig = attrs.parameters.some(p => p.parameterId === 'driver_configuration');
  const hasIsolation = attrs.parameters.some(p => p.parameterId === 'isolation_type');

  // If both are already present, no enrichment needed
  if (hasConfig && hasIsolation) return;

  for (const hint of gateDriverMpnPatterns) {
    if (!hint.pattern.test(mpn)) continue;

    if (!hasConfig && hint.driverConfiguration) {
      attrs.parameters.push({
        parameterId: 'driver_configuration',
        parameterName: 'Driver Configuration',
        value: hint.driverConfiguration,
        sortOrder: 0,
      });
    }
    if (!hasIsolation && hint.isolationType) {
      attrs.parameters.push({
        parameterId: 'isolation_type',
        parameterName: 'Isolation Type',
        value: hint.isolationType,
        sortOrder: 0,
      });
    }
    break;
  }
}

// ============================================================
// OP-AMP / COMPARATOR POST-SCORING FILTER (C4)
// ============================================================

/**
 * Remove candidates with confirmed device_type mismatches.
 * Device type (op-amp vs comparator vs instrumentation amplifier) is a BLOCKING
 * identity gate — a comparator can never substitute for an op-amp in a feedback
 * loop (no phase compensation → oscillation). Candidates with *missing*
 * device_type are kept — the identity rule already flags them as failures.
 */
function filterOpampComparatorMismatches(
  recs: XrefRecommendation[],
  sourceAttrs: PartAttributes,
): XrefRecommendation[] {
  const srcDeviceType = sourceAttrs.parameters.find(p => p.parameterId === 'device_type')?.value?.toLowerCase();

  return recs.filter(rec => {
    const candDeviceType = rec.matchDetails.find(d => d.parameterId === 'device_type')?.replacementValue?.toLowerCase();
    // If source or candidate is missing, keep (rules handle missing data)
    if (srcDeviceType && candDeviceType && candDeviceType !== srcDeviceType) return false;
    return true;
  });
}

// ============================================================
// OP-AMP / COMPARATOR MPN ENRICHMENT (C4)
// ============================================================

interface OpampMpnHint {
  pattern: RegExp;
  deviceType?: string;
  manufacturer?: string;
}

/**
 * MPN prefix patterns for op-amp/comparator classification.
 * Used to infer device_type when Digikey parametric data doesn't provide it.
 * Patterns are checked in order; first match wins.
 */
const opampMpnPatterns: OpampMpnHint[] = [
  // Comparator-specific prefixes (must come before op-amp prefixes that overlap)
  { pattern: /^LM393/i, deviceType: 'Comparator', manufacturer: 'Texas Instruments' },
  { pattern: /^LM339/i, deviceType: 'Comparator', manufacturer: 'Texas Instruments' },
  { pattern: /^LM311/i, deviceType: 'Comparator', manufacturer: 'Texas Instruments' },
  { pattern: /^LM3302/i, deviceType: 'Comparator', manufacturer: 'Texas Instruments' },
  { pattern: /^MAX9[0-9]{2,3}/i, deviceType: 'Comparator', manufacturer: 'Analog Devices' },
  { pattern: /^ADCMP/i, deviceType: 'Comparator', manufacturer: 'Analog Devices' },
  { pattern: /^TLV3\d/i, deviceType: 'Comparator', manufacturer: 'Texas Instruments' },

  // Instrumentation amplifier prefixes
  { pattern: /^INA\d/i, deviceType: 'Instrumentation Amplifier', manufacturer: 'Texas Instruments' },
  { pattern: /^AD62\d/i, deviceType: 'Instrumentation Amplifier', manufacturer: 'Analog Devices' },

  // Op-amp prefixes
  { pattern: /^LM741/i, deviceType: 'Op-Amp', manufacturer: 'Texas Instruments' },
  { pattern: /^LM324/i, deviceType: 'Op-Amp', manufacturer: 'Texas Instruments' },
  { pattern: /^LM358/i, deviceType: 'Op-Amp', manufacturer: 'Texas Instruments' },
  { pattern: /^TL0[678]\d/i, deviceType: 'Op-Amp', manufacturer: 'Texas Instruments' },
  { pattern: /^NE5532/i, deviceType: 'Op-Amp', manufacturer: 'Texas Instruments' },
  { pattern: /^OPA\d/i, deviceType: 'Op-Amp', manufacturer: 'Texas Instruments' },
  { pattern: /^AD82[02]\d/i, deviceType: 'Op-Amp', manufacturer: 'Analog Devices' },
  { pattern: /^AD8\d/i, deviceType: 'Op-Amp', manufacturer: 'Analog Devices' },
  { pattern: /^LT1\d/i, deviceType: 'Op-Amp', manufacturer: 'Analog Devices' },
  { pattern: /^LT6\d/i, deviceType: 'Op-Amp', manufacturer: 'Analog Devices' },
  { pattern: /^MCP6\d/i, deviceType: 'Op-Amp', manufacturer: 'Microchip' },
  { pattern: /^MCP3\d/i, deviceType: 'Op-Amp', manufacturer: 'Microchip' },
  { pattern: /^MCP601/i, deviceType: 'Op-Amp', manufacturer: 'Microchip' },
  { pattern: /^TSV\d/i, deviceType: 'Op-Amp', manufacturer: 'STMicroelectronics' },
  { pattern: /^TSX\d/i, deviceType: 'Op-Amp', manufacturer: 'STMicroelectronics' },
  { pattern: /^TS27\d/i, deviceType: 'Op-Amp', manufacturer: 'STMicroelectronics' },
  { pattern: /^MAX40\d/i, deviceType: 'Op-Amp', manufacturer: 'Analog Devices' },
  { pattern: /^MAX44\d/i, deviceType: 'Op-Amp', manufacturer: 'Analog Devices' },
  { pattern: /^LMV\d/i, deviceType: 'Op-Amp', manufacturer: 'Texas Instruments' },
  { pattern: /^LMC\d/i, deviceType: 'Op-Amp', manufacturer: 'Texas Instruments' },
  { pattern: /^TLV27\d/i, deviceType: 'Op-Amp', manufacturer: 'Texas Instruments' },
  { pattern: /^TLV171\d/i, deviceType: 'Op-Amp', manufacturer: 'Texas Instruments' },
  { pattern: /^TLC27\d/i, deviceType: 'Op-Amp', manufacturer: 'Texas Instruments' },
  { pattern: /^MC33\d/i, deviceType: 'Op-Amp', manufacturer: 'ON Semiconductor' },
  { pattern: /^ISL28\d/i, deviceType: 'Op-Amp', manufacturer: 'Renesas' },
];

/**
 * Enrich C4 op-amp/comparator attributes with device_type inferred from MPN prefix.
 * Only fills in missing attributes — never overwrites Digikey parametric data.
 * Mutates `attrs.parameters` in place.
 */
function enrichOpampComparatorAttributes(attrs: PartAttributes): void {
  const mpn = attrs.part.mpn;
  const hasDeviceType = attrs.parameters.some(p => p.parameterId === 'device_type');

  if (hasDeviceType) return;

  for (const hint of opampMpnPatterns) {
    if (hint.pattern.test(mpn) && hint.deviceType) {
      attrs.parameters.push({
        parameterId: 'device_type',
        parameterName: 'Device Type (Op-Amp / Comparator / Instrumentation Amplifier)',
        value: hint.deviceType,
        sortOrder: 0,
      });
      break;
    }
  }
}

// ============================================================
// LOGIC IC (C5) POST-SCORING FILTER
// ============================================================

/**
 * Remove candidates with confirmed logic_function mismatches.
 * Logic function (part number suffix like '04, '245, '574) is a BLOCKING
 * identity gate — no cross-function substitution is ever valid. '04 ≠ '14
 * even though both are hex inverters ('14 adds Schmitt trigger inputs).
 * Candidates with *missing* logic_function are kept — the identity rule
 * already flags them as failures in the match details.
 */
function filterLogicICFunctionMismatches(
  recs: XrefRecommendation[],
  sourceAttrs: PartAttributes,
): XrefRecommendation[] {
  const srcFunction = sourceAttrs.parameters.find(p => p.parameterId === 'logic_function')?.value;

  return recs.filter(rec => {
    const candFunction = rec.matchDetails.find(d => d.parameterId === 'logic_function')?.replacementValue;
    // If source or candidate is missing, keep (rules handle missing data)
    if (srcFunction && candFunction && candFunction !== srcFunction) return false;
    return true;
  });
}

// ============================================================
// LOGIC IC (C5) MPN ENRICHMENT
// ============================================================

/**
 * 74-series MPN format: [Manufacturer Prefix]74[Family][Function Suffix][Package/Temp]
 *
 * Examples:
 *   SN74HC04DR      → family=HC,   function=04
 *   74HCT245PW      → family=HCT,  function=245
 *   SN74LVC1G04DBVR → family=LVC,  function=04  (1G = single gate)
 *   NC7SZ04P5X      → family=LVC,  function=04  (NC7SZ series)
 *   SN74AHC1G04DBVR → family=AHC,  function=04  (1G = single gate)
 *   MC74HC04ADR2G   → family=HC,   function=04
 *   CD4049UBE       → family=CD4000, function=4049
 *   CD74HC4049M96   → family=HC,   function=4049
 *   SN7404N         → family=TTL,  function=04  (original 7400 series)
 *   74LS04          → family=LS,   function=04
 */

/**
 * Parse a 74-series MPN to extract logic family and function code.
 * Returns null if the MPN is not a recognized 74-series part.
 */
function parse74SeriesMPN(mpn: string): { family: string; functionCode: string } | null {
  const upper = mpn.toUpperCase();

  // Pattern 1: Standard 74-series — [prefix]74[family][1G|2G]?[function][suffix]
  // Manufacturer prefixes: SN, MC, MM, IDT, NLV, CD, (none)
  const stdMatch = upper.match(
    /(?:SN|MC|MM|IDT|NLV|CD)?74(AHCT|ALVC|VHCT|AHC|ACT|AUP|HCT|LVC|VHC|ALS|ABT|FCT|BCT|HC|AC|LS|AS|F)(?:1G|2G)?(\d{2,5})/
  );
  if (stdMatch) {
    return { family: stdMatch[1], functionCode: stdMatch[2] };
  }

  // Pattern 2: Original TTL — SN74xx or 74xx (no family prefix)
  const ttlMatch = upper.match(/(?:SN)?74(\d{2,5})/);
  if (ttlMatch) {
    // Check it's not already caught by Pattern 1 (i.e., no family letters before digits)
    const beforeDigits = upper.match(/(?:SN)?74([A-Z]*?)(\d{2,5})/);
    if (beforeDigits && beforeDigits[1] === '') {
      return { family: 'TTL', functionCode: ttlMatch[1] };
    }
  }

  // Pattern 3: NC7S / NC7SZ single-gate series (Fairchild/ON Semi)
  // NC7SZ04, NC7S04 → function=04, family=LVC equivalent
  const ncMatch = upper.match(/NC7SZ?(\d{2,4})/);
  if (ncMatch) {
    return { family: 'LVC', functionCode: ncMatch[1] };
  }

  // Pattern 4: CD4000 series (CMOS)
  const cd4Match = upper.match(/CD(4\d{3})/);
  if (cd4Match) {
    return { family: 'CD4000', functionCode: cd4Match[1] };
  }

  return null;
}

/**
 * Enrich C5 logic IC attributes with logic_family and logic_function
 * inferred from MPN. Only fills in missing attributes — never overwrites
 * Digikey parametric data. Mutates `attrs.parameters` in place.
 */
function enrichLogicICAttributes(attrs: PartAttributes): void {
  const parsed = parse74SeriesMPN(attrs.part.mpn);
  if (!parsed) return;

  const hasFamily = attrs.parameters.some(p => p.parameterId === 'logic_family');
  const hasFunction = attrs.parameters.some(p => p.parameterId === 'logic_function');

  if (!hasFamily) {
    attrs.parameters.push({
      parameterId: 'logic_family',
      parameterName: 'Logic Family',
      value: parsed.family,
      sortOrder: 0,
    });
  }

  if (!hasFunction) {
    attrs.parameters.push({
      parameterId: 'logic_function',
      parameterName: 'Logic Function (Part Number Suffix)',
      value: parsed.functionCode,
      sortOrder: 0,
    });
  }

  // Infer schmitt_trigger from function code — '14, '132, '7414 are Schmitt types
  const schmittFunctions = ['14', '132', '7414', '19'];
  const hasSchmitt = attrs.parameters.some(p => p.parameterId === 'schmitt_trigger');
  if (!hasSchmitt && parsed.functionCode && schmittFunctions.includes(parsed.functionCode)) {
    attrs.parameters.push({
      parameterId: 'schmitt_trigger',
      parameterName: 'Schmitt Trigger Input',
      value: 'Yes',
      sortOrder: 0,
    });
  }
}

// ============================================================
// VOLTAGE REFERENCE (C6) POST-SCORING FILTER
// ============================================================

/**
 * Remove candidates with confirmed configuration (series vs shunt) mismatches.
 * Configuration is a BLOCKING identity gate — a series reference actively drives
 * the output pin from an internal error amplifier; a shunt reference clamps in
 * parallel with the load via an external series resistor. These topologies are
 * architecturally incompatible without circuit redesign. Candidates with
 * *missing* configuration are kept — the identity rule already flags them.
 */
function filterVoltageReferenceConfigMismatches(
  recs: XrefRecommendation[],
  sourceAttrs: PartAttributes,
): XrefRecommendation[] {
  const srcConfig = sourceAttrs.parameters.find(p => p.parameterId === 'configuration')?.value?.toLowerCase();

  return recs.filter(rec => {
    const candConfig = rec.matchDetails.find(d => d.parameterId === 'configuration')?.replacementValue?.toLowerCase();
    // If source or candidate is missing, keep (rules handle missing data)
    if (srcConfig && candConfig && candConfig !== srcConfig) return false;
    return true;
  });
}

// ============================================================
// VOLTAGE REFERENCE (C6) MPN ENRICHMENT
// ============================================================

interface VrefMpnHint {
  pattern: RegExp;
  configuration?: string;
  architecture?: string;
  manufacturer?: string;
}

/**
 * MPN prefix patterns for voltage reference classification.
 * Used to infer configuration (series/shunt) and architecture (band-gap/buried Zener)
 * when Digikey parametric data is missing. Patterns are checked in order; first match wins.
 */
const vrefMpnPatterns: VrefMpnHint[] = [
  // Shunt references — TL431 family (most common shunt reference)
  { pattern: /^TL431/i, configuration: 'Shunt', architecture: 'Band-Gap', manufacturer: 'Texas Instruments' },
  { pattern: /^TL432/i, configuration: 'Shunt', architecture: 'Band-Gap', manufacturer: 'Texas Instruments' },
  { pattern: /^TLV431/i, configuration: 'Shunt', architecture: 'Band-Gap', manufacturer: 'Texas Instruments' },
  { pattern: /^KA431/i, configuration: 'Shunt', architecture: 'Band-Gap', manufacturer: 'ON Semiconductor' },
  { pattern: /^NCP431/i, configuration: 'Shunt', architecture: 'Band-Gap', manufacturer: 'ON Semiconductor' },
  { pattern: /^AZ431/i, configuration: 'Shunt', architecture: 'Band-Gap', manufacturer: 'Diodes Inc' },
  { pattern: /^AP431/i, configuration: 'Shunt', architecture: 'Band-Gap', manufacturer: 'Diodes Inc' },
  { pattern: /^TS431/i, configuration: 'Shunt', architecture: 'Band-Gap', manufacturer: 'STMicroelectronics' },
  // Shunt references — LM4040/LM4041 (2-terminal precision shunt)
  { pattern: /^LM4040/i, configuration: 'Shunt', architecture: 'Band-Gap', manufacturer: 'Texas Instruments' },
  { pattern: /^LM4041/i, configuration: 'Shunt', architecture: 'Band-Gap', manufacturer: 'Texas Instruments' },
  // Shunt references — LM385/LM336 (older 2-terminal)
  { pattern: /^LM385/i, configuration: 'Shunt', architecture: 'Band-Gap', manufacturer: 'Texas Instruments' },
  { pattern: /^LM336/i, configuration: 'Shunt', architecture: 'Band-Gap', manufacturer: 'Texas Instruments' },

  // Buried Zener references (precision metrology)
  { pattern: /^LTZ1000/i, configuration: 'Series', architecture: 'Buried Zener', manufacturer: 'Analog Devices' },
  { pattern: /^REF102/i, configuration: 'Series', architecture: 'Buried Zener', manufacturer: 'Texas Instruments' },
  { pattern: /^AD587/i, configuration: 'Series', architecture: 'Buried Zener', manufacturer: 'Analog Devices' },
  { pattern: /^AD588/i, configuration: 'Series', architecture: 'Buried Zener', manufacturer: 'Analog Devices' },
  { pattern: /^AD584/i, configuration: 'Series', architecture: 'Buried Zener', manufacturer: 'Analog Devices' },
  { pattern: /^AD580/i, configuration: 'Series', architecture: 'Buried Zener', manufacturer: 'Analog Devices' },

  // Series band-gap references — TI REF30xx/REF50xx/REF60xx
  { pattern: /^REF30\d/i, configuration: 'Series', architecture: 'Band-Gap', manufacturer: 'Texas Instruments' },
  { pattern: /^REF50\d/i, configuration: 'Series', architecture: 'Band-Gap', manufacturer: 'Texas Instruments' },
  { pattern: /^REF60\d/i, configuration: 'Series', architecture: 'Band-Gap', manufacturer: 'Texas Instruments' },
  // Series band-gap references — ADI ADR3xx/ADR4xx/ADR5xx
  { pattern: /^ADR3\d/i, configuration: 'Series', architecture: 'Band-Gap', manufacturer: 'Analog Devices' },
  { pattern: /^ADR4\d/i, configuration: 'Series', architecture: 'XFET', manufacturer: 'Analog Devices' },
  { pattern: /^ADR5\d/i, configuration: 'Series', architecture: 'Band-Gap', manufacturer: 'Analog Devices' },
  // Series references — ADI LT6654/LT6650
  { pattern: /^LT6654/i, configuration: 'Series', architecture: 'Band-Gap', manufacturer: 'Analog Devices' },
  { pattern: /^LT6650/i, configuration: 'Series', architecture: 'Band-Gap', manufacturer: 'Analog Devices' },
  // Series references — Maxim MAX60xx/MAX63xx/MAX64xx/MAX67xx
  { pattern: /^MAX60\d/i, configuration: 'Series', architecture: 'Band-Gap', manufacturer: 'Analog Devices' },
  { pattern: /^MAX63\d/i, configuration: 'Series', architecture: 'Band-Gap', manufacturer: 'Analog Devices' },
  { pattern: /^MAX64\d/i, configuration: 'Series', architecture: 'Band-Gap', manufacturer: 'Analog Devices' },
  { pattern: /^MAX67\d/i, configuration: 'Series', architecture: 'Band-Gap', manufacturer: 'Analog Devices' },
  // Series references — TI LM4132/LM4140
  { pattern: /^LM4132/i, configuration: 'Series', architecture: 'Band-Gap', manufacturer: 'Texas Instruments' },
  { pattern: /^LM4140/i, configuration: 'Series', architecture: 'Band-Gap', manufacturer: 'Texas Instruments' },
  // Series references — Renesas ISL21xx
  { pattern: /^ISL21\d/i, configuration: 'Series', architecture: 'Band-Gap', manufacturer: 'Renesas' },
  // Series references — Microchip MCP15xx
  { pattern: /^MCP15\d/i, configuration: 'Series', architecture: 'Band-Gap', manufacturer: 'Microchip' },
];

/**
 * Parse output voltage from voltage reference MPN.
 * Returns voltage in volts (e.g., 2.5) or null if not parseable.
 *
 * Patterns:
 *   REF3033  → 3.3V  (last 2 digits ÷ 10)
 *   REF5025  → 2.5V  (last 2 digits ÷ 10)
 *   REF3312  → 1.2V  (last 2 digits ÷ 10)
 *   ADR4550  → 5.0V  (last 3 digits ÷ 100)
 *   ADR3425  → 2.5V  (last 3 digits ÷ 100: 425 → 4.25V)
 *   LM4040A25 / LM4040C20 → extract decimal from suffix
 */
function parseVrefOutputVoltage(mpn: string): number | null {
  const upper = mpn.toUpperCase();

  // REF30xx / REF50xx / REF60xx — last 2 digits after REF30/50/60 ÷ 10
  const refMatch = upper.match(/^REF[356]0(\d{2})/);
  if (refMatch) {
    const v = parseInt(refMatch[1], 10) / 10;
    if (v > 0 && v <= 15) return v;
  }

  // ADR3xxx / ADR4xxx / ADR5xxx — last 3 digits ÷ 100
  const adrMatch = upper.match(/^ADR[345](\d{3})/);
  if (adrMatch) {
    const v = parseInt(adrMatch[1], 10) / 100;
    if (v > 0 && v <= 15) return v;
  }

  // MAX60xx — last 2 digits ÷ 10
  const maxMatch = upper.match(/^MAX60(\d{2})/);
  if (maxMatch) {
    const v = parseInt(maxMatch[1], 10) / 10;
    if (v > 0 && v <= 15) return v;
  }

  // LM4040 / LM4041 — suffix like A25, B10, C20, D50 → voltage
  const lm4040Match = upper.match(/^LM404[01][A-Z]?(\d{1,2})\.?(\d)?/);
  if (lm4040Match) {
    const whole = lm4040Match[1];
    const frac = lm4040Match[2] ?? '';
    const v = parseFloat(`${whole}.${frac}`);
    if (v > 0 && v <= 15) return v;
  }

  return null;
}

/**
 * Enrich C6 voltage reference attributes with configuration, architecture,
 * and output_voltage inferred from MPN prefix. Only fills in missing
 * attributes — never overwrites Digikey parametric data.
 * Mutates `attrs.parameters` in place.
 */
function enrichVoltageReferenceAttributes(attrs: PartAttributes): void {
  const mpn = attrs.part.mpn;
  const hasConfig = attrs.parameters.some(p => p.parameterId === 'configuration');
  const hasArch = attrs.parameters.some(p => p.parameterId === 'architecture');
  const hasVout = attrs.parameters.some(p => p.parameterId === 'output_voltage');

  // MPN pattern enrichment for configuration and architecture
  if (!hasConfig || !hasArch) {
    for (const hint of vrefMpnPatterns) {
      if (!hint.pattern.test(mpn)) continue;

      if (!hasConfig && hint.configuration) {
        attrs.parameters.push({
          parameterId: 'configuration',
          parameterName: 'Reference Type (Series / Shunt)',
          value: hint.configuration,
          sortOrder: 0,
        });
      }
      if (!hasArch && hint.architecture) {
        attrs.parameters.push({
          parameterId: 'architecture',
          parameterName: 'Architecture',
          value: hint.architecture,
          sortOrder: 0,
        });
      }
      break;
    }
  }

  // Output voltage parsing from MPN
  if (!hasVout) {
    const voltage = parseVrefOutputVoltage(mpn);
    if (voltage !== null) {
      attrs.parameters.push({
        parameterId: 'output_voltage',
        parameterName: 'Output Voltage',
        value: `${voltage}V`,
        numericValue: voltage,
        sortOrder: 0,
      });
    }
  }
}

// ============================================================
// INTERFACE IC MPN ENRICHMENT (C7)
// ============================================================

interface InterfaceICMpnHint {
  pattern: RegExp;
  protocol?: string;        // RS-485 | CAN | I2C | USB
  isolationType?: string;   // Isolated
  canVariant?: string;      // CAN FD
  manufacturer?: string;
}

/**
 * MPN prefix patterns for interface IC classification.
 * Infers protocol (RS-485/CAN/I2C/USB), isolation_type, and can_variant
 * when Digikey parametric data is missing. First match wins.
 *
 * CRITICAL: SN65HVD collision — SN65HVD0xx/1xx = RS-485, SN65HVD2xx = CAN.
 */
const interfaceICMpnPatterns: InterfaceICMpnHint[] = [
  // === RS-485 Transceivers ===
  // Maxim RS-485 family
  { pattern: /^MAX48[5-9]/i, protocol: 'RS-485', manufacturer: 'Analog Devices' },
  { pattern: /^MAX49[0-1]/i, protocol: 'RS-485', manufacturer: 'Analog Devices' },
  { pattern: /^MAX308[2-8]/i, protocol: 'RS-485', manufacturer: 'Analog Devices' },
  { pattern: /^MAX309[0-5]/i, protocol: 'RS-485', manufacturer: 'Analog Devices' },
  { pattern: /^MAX347[0-1]/i, protocol: 'RS-485', manufacturer: 'Analog Devices' },
  // ADI RS-485
  { pattern: /^ADM485/i, protocol: 'RS-485', manufacturer: 'Analog Devices' },
  { pattern: /^ADM1485/i, protocol: 'RS-485', manufacturer: 'Analog Devices' },
  { pattern: /^ADM3485/i, protocol: 'RS-485', manufacturer: 'Analog Devices' },
  { pattern: /^ADM4857/i, protocol: 'RS-485', manufacturer: 'Analog Devices' },
  // ADI RS-485 isolated
  { pattern: /^ADM258[2-7]/i, protocol: 'RS-485', isolationType: 'Isolated', manufacturer: 'Analog Devices' },
  // TI RS-485 — SN65HVD0xx/1xx (NOT 2xx — that's CAN!)
  { pattern: /^SN65HVD[01]\d/i, protocol: 'RS-485', manufacturer: 'Texas Instruments' },
  { pattern: /^SN75HVD/i, protocol: 'RS-485', manufacturer: 'Texas Instruments' },
  { pattern: /^SN75176/i, protocol: 'RS-485', manufacturer: 'Texas Instruments' },
  { pattern: /^SN75ALS/i, protocol: 'RS-485', manufacturer: 'Texas Instruments' },
  { pattern: /^THVD/i, protocol: 'RS-485', manufacturer: 'Texas Instruments' },
  // TI RS-485 isolated
  { pattern: /^ISO308[2-6]/i, protocol: 'RS-485', isolationType: 'Isolated', manufacturer: 'Texas Instruments' },
  // MaxLinear RS-485
  { pattern: /^SP485/i, protocol: 'RS-485', manufacturer: 'MaxLinear' },
  { pattern: /^SP3485/i, protocol: 'RS-485', manufacturer: 'MaxLinear' },
  // ADI/LTC RS-485
  { pattern: /^LTC285[0-2]/i, protocol: 'RS-485', manufacturer: 'Analog Devices' },
  { pattern: /^LTC286[2-4]/i, protocol: 'RS-485', manufacturer: 'Analog Devices' },
  // NVE RS-485 isolated
  { pattern: /^IL308[6]/i, protocol: 'RS-485', isolationType: 'Isolated', manufacturer: 'NVE' },
  { pattern: /^IL368[5]/i, protocol: 'RS-485', isolationType: 'Isolated', manufacturer: 'NVE' },

  // === CAN Transceivers ===
  // NXP CAN classical
  { pattern: /^TJA104[0-9]/i, protocol: 'CAN', manufacturer: 'NXP' },
  { pattern: /^TJA105[0-2]/i, protocol: 'CAN', manufacturer: 'NXP' },
  // NXP CAN FD
  { pattern: /^TJA144[1-3]/i, protocol: 'CAN', canVariant: 'CAN FD', manufacturer: 'NXP' },
  { pattern: /^TJA146[2]/i, protocol: 'CAN', canVariant: 'CAN FD', manufacturer: 'NXP' },
  // Microchip CAN classical
  { pattern: /^MCP255[1-7]/i, protocol: 'CAN', manufacturer: 'Microchip' },
  { pattern: /^MCP256[1-2]/i, protocol: 'CAN', manufacturer: 'Microchip' },
  // Microchip CAN FD
  { pattern: /^MCP2558FD/i, protocol: 'CAN', canVariant: 'CAN FD', manufacturer: 'Microchip' },
  { pattern: /^MCP2561FD/i, protocol: 'CAN', canVariant: 'CAN FD', manufacturer: 'Microchip' },
  // TI CAN — SN65HVD2xx (NOT 0xx/1xx — those are RS-485!)
  { pattern: /^SN65HVD2[3-5]\d/i, protocol: 'CAN', manufacturer: 'Texas Instruments' },
  // TI CAN isolated
  { pattern: /^ISO1042/i, protocol: 'CAN', isolationType: 'Isolated', manufacturer: 'Texas Instruments' },
  // TI TCAN — classical and FD variants
  { pattern: /^TCAN104[2-4]/i, protocol: 'CAN', manufacturer: 'Texas Instruments' },
  { pattern: /^TCAN105[1]/i, protocol: 'CAN', manufacturer: 'Texas Instruments' },
  // ADI CAN isolated
  { pattern: /^ADM305[3-5]/i, protocol: 'CAN', isolationType: 'Isolated', manufacturer: 'Analog Devices' },
  // Silicon Labs CAN isolated
  { pattern: /^Si844[1-4]/i, protocol: 'CAN', isolationType: 'Isolated', manufacturer: 'Silicon Labs' },

  // === I2C Bus Buffers / Isolators ===
  { pattern: /^PCA9600/i, protocol: 'I2C', manufacturer: 'NXP' },
  { pattern: /^P82B96/i, protocol: 'I2C', manufacturer: 'NXP' },
  { pattern: /^LTC431[1-6]/i, protocol: 'I2C', manufacturer: 'Analog Devices' },
  // TI I2C isolated
  { pattern: /^ISO154[0-1]/i, protocol: 'I2C', isolationType: 'Isolated', manufacturer: 'Texas Instruments' },
  // ADI I2C isolated
  { pattern: /^ADUM125[0-1]/i, protocol: 'I2C', isolationType: 'Isolated', manufacturer: 'Analog Devices' },

  // === USB ESD / Signal Conditioning ===
  { pattern: /^TPD4S012/i, protocol: 'USB', manufacturer: 'Texas Instruments' },
  { pattern: /^PRTR5V0U/i, protocol: 'USB', manufacturer: 'Nexperia' },
  { pattern: /^USBLC6/i, protocol: 'USB', manufacturer: 'STMicroelectronics' },
];

/**
 * Enrich C7 interface IC attributes with protocol, isolation_type, and
 * can_variant inferred from MPN prefix. Only fills in missing attributes —
 * never overwrites Digikey parametric data.
 */
function enrichInterfaceICAttributes(attrs: PartAttributes): void {
  const mpn = attrs.part.mpn;
  const hasProtocol = attrs.parameters.some(p => p.parameterId === 'protocol');
  const hasIsolation = attrs.parameters.some(p => p.parameterId === 'isolation_type');
  const hasCanVariant = attrs.parameters.some(p => p.parameterId === 'can_variant');

  for (const hint of interfaceICMpnPatterns) {
    if (!hint.pattern.test(mpn)) continue;

    if (!hasProtocol && hint.protocol) {
      attrs.parameters.push({
        parameterId: 'protocol',
        parameterName: 'Protocol / Interface Standard',
        value: hint.protocol,
        sortOrder: 0,
      });
    }
    if (!hasIsolation && hint.isolationType) {
      attrs.parameters.push({
        parameterId: 'isolation_type',
        parameterName: 'Galvanic Isolation Type',
        value: hint.isolationType,
        sortOrder: 0,
      });
    }
    if (!hasCanVariant && hint.canVariant) {
      attrs.parameters.push({
        parameterId: 'can_variant',
        parameterName: 'CAN Standard Variant',
        value: hint.canVariant,
        sortOrder: 0,
      });
    }
    break; // First match wins
  }
}

/**
 * Post-scoring filter for C7 interface ICs — removes confirmed protocol mismatches.
 * Protocol is a BLOCKING identity gate. RS-485, CAN, I2C, and USB are fundamentally
 * incompatible. Candidates with missing protocol are kept (identity rule handles them).
 */
function filterInterfaceICProtocolMismatches(
  recs: XrefRecommendation[],
  sourceAttrs: PartAttributes,
): XrefRecommendation[] {
  const srcProtocol = sourceAttrs.parameters.find(p => p.parameterId === 'protocol')?.value?.toLowerCase();

  return recs.filter(rec => {
    const candProtocol = rec.matchDetails.find(d => d.parameterId === 'protocol')?.replacementValue?.toLowerCase();
    // If source or candidate is missing protocol, keep (rules handle missing data)
    if (srcProtocol && candProtocol && candProtocol !== srcProtocol) return false;
    return true;
  });
}

// ============================================================
// TIMER / OSCILLATOR MPN ENRICHMENT (C8)
// ============================================================

interface TimerOscillatorMpnHint {
  pattern: RegExp;
  deviceCategory?: string;     // '555 Timer' | 'XO' | 'MEMS' | 'TCXO' | 'VCXO' | 'OCXO'
  outputSignalType?: string;   // 'CMOS' | 'LVDS' | 'LVPECL' etc.
  timerVariant?: string;       // 'CMOS' | 'Bipolar' (555 only)
  manufacturer?: string;
}

/**
 * MPN prefix patterns for timer/oscillator classification.
 * Infers device_category, output_signal_type, and timer_variant
 * when Digikey parametric data is missing. First match wins.
 */
const timerOscillatorMpnPatterns: TimerOscillatorMpnHint[] = [
  // === 555 / 556 TIMER ICs ===
  // Bipolar 555 (minimum VCC 4.5V, higher Iq, non-rail-to-rail output)
  { pattern: /^NE555/i, deviceCategory: '555 Timer', timerVariant: 'Bipolar', manufacturer: 'Texas Instruments' },
  { pattern: /^LM555/i, deviceCategory: '555 Timer', timerVariant: 'Bipolar', manufacturer: 'Texas Instruments' },
  { pattern: /^SA555/i, deviceCategory: '555 Timer', timerVariant: 'Bipolar', manufacturer: 'Texas Instruments' },
  { pattern: /^SE555/i, deviceCategory: '555 Timer', timerVariant: 'Bipolar', manufacturer: 'Texas Instruments' },
  // CMOS 555 (supply 2V–18V, rail-to-rail, low Iq)
  { pattern: /^ICM7555/i, deviceCategory: '555 Timer', timerVariant: 'CMOS', manufacturer: 'Renesas' },
  { pattern: /^TLC555/i, deviceCategory: '555 Timer', timerVariant: 'CMOS', manufacturer: 'Texas Instruments' },
  { pattern: /^LMC555/i, deviceCategory: '555 Timer', timerVariant: 'CMOS', manufacturer: 'Texas Instruments' },
  { pattern: /^TS555/i, deviceCategory: '555 Timer', timerVariant: 'CMOS', manufacturer: 'STMicroelectronics' },
  { pattern: /^NA555/i, deviceCategory: '555 Timer', timerVariant: 'CMOS', manufacturer: 'Texas Instruments' },
  // Dual 556 / CMOS 556
  { pattern: /^NE556/i, deviceCategory: '555 Timer', timerVariant: 'Bipolar', manufacturer: 'Texas Instruments' },
  { pattern: /^LM556/i, deviceCategory: '555 Timer', timerVariant: 'Bipolar', manufacturer: 'Texas Instruments' },
  { pattern: /^ICM7556/i, deviceCategory: '555 Timer', timerVariant: 'CMOS', manufacturer: 'Renesas' },

  // === MEMS OSCILLATORS ===
  // SiTime MEMS XO family
  { pattern: /^SiT8008/i, deviceCategory: 'MEMS', manufacturer: 'SiTime' },
  { pattern: /^SiT8021/i, deviceCategory: 'MEMS', manufacturer: 'SiTime' },
  { pattern: /^SiT8209/i, deviceCategory: 'MEMS', manufacturer: 'SiTime' },
  { pattern: /^SiT8918/i, deviceCategory: 'MEMS', manufacturer: 'SiTime' },
  { pattern: /^SiT8924/i, deviceCategory: 'MEMS', manufacturer: 'SiTime' },
  { pattern: /^SiT1602/i, deviceCategory: 'MEMS', manufacturer: 'SiTime' },
  // Microchip MEMS (DSC series)
  { pattern: /^DSC1001/i, deviceCategory: 'MEMS', manufacturer: 'Microchip' },
  { pattern: /^DSC1033/i, deviceCategory: 'MEMS', manufacturer: 'Microchip' },
  { pattern: /^DSC6001/i, deviceCategory: 'MEMS', manufacturer: 'Microchip' },
  { pattern: /^DSC8001/i, deviceCategory: 'MEMS', manufacturer: 'Microchip' },

  // === TCXO (Temperature Compensated) ===
  // Abracon TCXO
  { pattern: /^ASTX/i, deviceCategory: 'TCXO', manufacturer: 'Abracon' },
  // Epson TCXO (TG series)
  { pattern: /^TG5032/i, deviceCategory: 'TCXO', manufacturer: 'Epson' },
  { pattern: /^TG7050/i, deviceCategory: 'TCXO', manufacturer: 'Epson' },
  // IQD TCXO
  { pattern: /^IQXT/i, deviceCategory: 'TCXO', manufacturer: 'IQD' },
  // NDK TCXO (TSX series)
  { pattern: /^TSX-/i, deviceCategory: 'TCXO', manufacturer: 'NDK' },
  // SiTime MEMS TCXO
  { pattern: /^SiT3521/i, deviceCategory: 'TCXO', manufacturer: 'SiTime' },

  // === VCXO (Voltage Controlled) ===
  // SiTime MEMS VCXO
  { pattern: /^SiT3807/i, deviceCategory: 'VCXO', manufacturer: 'SiTime' },
  { pattern: /^SiT3544/i, deviceCategory: 'VCXO', manufacturer: 'SiTime' },
  { pattern: /^SiT9102/i, deviceCategory: 'VCXO', manufacturer: 'SiTime' },
  // Abracon VCXO
  { pattern: /^ASVMX/i, deviceCategory: 'VCXO', manufacturer: 'Abracon' },
  { pattern: /^ABLNO/i, deviceCategory: 'VCXO', manufacturer: 'Abracon' },
  // Crystek VCXO
  { pattern: /^CVHD/i, deviceCategory: 'VCXO', manufacturer: 'Crystek' },
  // Vectron VCXO
  { pattern: /^VX-70[59]/i, deviceCategory: 'VCXO', manufacturer: 'Microchip' },
  // IQD VCXO
  { pattern: /^IQOV/i, deviceCategory: 'VCXO', manufacturer: 'IQD' },

  // === OCXO (Oven Controlled) ===
  // Crystek OCXO
  { pattern: /^OCHD/i, deviceCategory: 'OCXO', manufacturer: 'Crystek' },

  // === Crystal Oscillators (XO) ===
  // Abracon XO
  { pattern: /^ASFL/i, deviceCategory: 'XO', manufacturer: 'Abracon' },
  { pattern: /^ASEM/i, deviceCategory: 'XO', manufacturer: 'Abracon' },
  // ECS XO
  { pattern: /^ECS-\d{4}/i, deviceCategory: 'XO', manufacturer: 'ECS' },
  // Epson XO (SG series)
  { pattern: /^SG-8002/i, deviceCategory: 'XO', manufacturer: 'Epson' },
  { pattern: /^SG-3040/i, deviceCategory: 'XO', manufacturer: 'Epson' },
  { pattern: /^SG-5032/i, deviceCategory: 'XO', manufacturer: 'Epson' },
  // IQD XO
  { pattern: /^IQXO/i, deviceCategory: 'XO', manufacturer: 'IQD' },
  // Fox XO
  { pattern: /^FOX924/i, deviceCategory: 'XO', manufacturer: 'Fox Electronics' },
  // NDK XO (CX series — packaged oscillators, not resonators)
  { pattern: /^CX[35]0\d{2}/i, deviceCategory: 'XO', manufacturer: 'NDK' },
];

/**
 * Enrich C8 timer/oscillator attributes with device_category, timer_variant,
 * and output_signal_type inferred from MPN prefix. Only fills in missing
 * attributes — never overwrites Digikey parametric data.
 *
 * Also attempts suffix-based output signal type enrichment:
 * -C = CMOS, -L = LVDS, -E = LVPECL
 */
function enrichTimerOscillatorAttributes(attrs: PartAttributes): void {
  const mpn = attrs.part.mpn;
  const hasDeviceCategory = attrs.parameters.some(p => p.parameterId === 'device_category');
  const hasTimerVariant = attrs.parameters.some(p => p.parameterId === 'timer_variant');
  const hasOutputSignalType = attrs.parameters.some(p => p.parameterId === 'output_signal_type');

  for (const hint of timerOscillatorMpnPatterns) {
    if (!hint.pattern.test(mpn)) continue;

    if (!hasDeviceCategory && hint.deviceCategory) {
      attrs.parameters.push({
        parameterId: 'device_category',
        parameterName: 'Device Category / Stability Class',
        value: hint.deviceCategory,
        sortOrder: 0,
      });
    }
    if (!hasTimerVariant && hint.timerVariant) {
      attrs.parameters.push({
        parameterId: 'timer_variant',
        parameterName: 'Timer Variant (CMOS vs Bipolar)',
        value: hint.timerVariant,
        sortOrder: 0,
      });
    }
    break; // First match wins
  }

  // Suffix-based output signal type enrichment for oscillators
  if (!hasOutputSignalType) {
    const upperMpn = mpn.toUpperCase();
    if (upperMpn.includes('-L') || upperMpn.endsWith('L')) {
      // Only for oscillator families, not 555 timers
      const cat = attrs.parameters.find(p => p.parameterId === 'device_category')?.value;
      if (cat && cat !== '555 Timer') {
        attrs.parameters.push({
          parameterId: 'output_signal_type',
          parameterName: 'Output Signal Type',
          value: 'LVDS',
          sortOrder: 0,
        });
      }
    } else if (upperMpn.includes('-E') || upperMpn.endsWith('E')) {
      const cat = attrs.parameters.find(p => p.parameterId === 'device_category')?.value;
      if (cat && cat !== '555 Timer') {
        attrs.parameters.push({
          parameterId: 'output_signal_type',
          parameterName: 'Output Signal Type',
          value: 'LVPECL',
          sortOrder: 0,
        });
      }
    }
  }
}

/**
 * Post-scoring filter for C8 timers/oscillators — removes confirmed
 * device_category mismatches. device_category is a BLOCKING identity gate.
 * 555 timers and packaged oscillators are architecturally unrelated.
 * Within oscillators, stability class mismatches are also blocked.
 *
 * Exception: XO↔MEMS cross-substitution is permitted (not filtered).
 * The matching engine will add an Application Review flag for this case.
 */
function filterTimerOscillatorCategoryMismatches(
  recs: XrefRecommendation[],
  sourceAttrs: PartAttributes,
): XrefRecommendation[] {
  const srcCategory = sourceAttrs.parameters.find(p => p.parameterId === 'device_category')?.value;

  return recs.filter(rec => {
    const candCategory = rec.matchDetails.find(d => d.parameterId === 'device_category')?.replacementValue;
    // If source or candidate is missing category, keep (rules handle missing data)
    if (!srcCategory || !candCategory) return true;
    // Exact match always passes
    if (srcCategory === candCategory) return true;
    // XO↔MEMS cross-substitution is the one permitted exception
    const xoMemsSet = new Set(['XO', 'MEMS']);
    if (xoMemsSet.has(srcCategory) && xoMemsSet.has(candCategory)) return true;
    // All other cross-category mismatches are blocked
    return false;
  });
}

/**
 * Post-scoring filter for C9 ADCs — removes confirmed architecture mismatches.
 * architecture is a BLOCKING identity gate. SAR, Delta-Sigma, Pipeline, and
 * Flash converters have fundamentally different latency, noise floor, speed,
 * and power characteristics. No cross-architecture substitution is permitted.
 */
function filterAdcArchitectureMismatches(
  recs: XrefRecommendation[],
  sourceAttrs: PartAttributes,
): XrefRecommendation[] {
  const srcArch = sourceAttrs.parameters.find(p => p.parameterId === 'architecture')?.value;

  return recs.filter(rec => {
    const candArch = rec.matchDetails.find(d => d.parameterId === 'architecture')?.replacementValue;
    // If source or candidate is missing architecture, keep (rules handle missing data)
    if (!srcArch || !candArch) return true;
    // Only exact match passes — no exceptions for ADC architecture
    return srcArch === candArch;
  });
}

// ============================================================
// ADC MPN ENRICHMENT (C9)
// ============================================================

interface AdcMpnHint {
  pattern: RegExp;
  architecture?: string;       // 'SAR' | 'Delta-Sigma' | 'Pipeline' | 'Flash'
  resolutionBits?: string;     // '12' | '16' | '24' etc.
  interfaceType?: string;      // 'SPI' | 'I2C' | 'Parallel'
  manufacturer?: string;
}

/**
 * MPN prefix patterns for ADC classification.
 * Infers architecture, resolution_bits, and interface_type from known MPN families.
 *
 * Source: user-provided MPN list + datasheet verification.
 */
const adcMpnPatterns: AdcMpnHint[] = [
  // === TEXAS INSTRUMENTS — DELTA-SIGMA ===
  { pattern: /^ADS1013/i, architecture: 'Delta-Sigma', resolutionBits: '12', interfaceType: 'I2C', manufacturer: 'Texas Instruments' },
  { pattern: /^ADS1014/i, architecture: 'Delta-Sigma', resolutionBits: '12', interfaceType: 'I2C', manufacturer: 'Texas Instruments' },
  { pattern: /^ADS1015/i, architecture: 'Delta-Sigma', resolutionBits: '12', interfaceType: 'I2C', manufacturer: 'Texas Instruments' },
  { pattern: /^ADS1115/i, architecture: 'Delta-Sigma', resolutionBits: '16', interfaceType: 'I2C', manufacturer: 'Texas Instruments' },
  { pattern: /^ADS1118/i, architecture: 'Delta-Sigma', resolutionBits: '16', interfaceType: 'SPI', manufacturer: 'Texas Instruments' },
  { pattern: /^ADS1119/i, architecture: 'Delta-Sigma', resolutionBits: '16', interfaceType: 'I2C', manufacturer: 'Texas Instruments' },
  { pattern: /^ADS1220/i, architecture: 'Delta-Sigma', resolutionBits: '24', interfaceType: 'SPI', manufacturer: 'Texas Instruments' },
  { pattern: /^ADS123[0-4]/i, architecture: 'Delta-Sigma', resolutionBits: '24', interfaceType: 'SPI', manufacturer: 'Texas Instruments' },
  { pattern: /^ADS124[6-8]/i, architecture: 'Delta-Sigma', resolutionBits: '24', interfaceType: 'SPI', manufacturer: 'Texas Instruments' },
  { pattern: /^ADS1256/i, architecture: 'Delta-Sigma', resolutionBits: '24', interfaceType: 'SPI', manufacturer: 'Texas Instruments' },
  { pattern: /^ADS1259/i, architecture: 'Delta-Sigma', resolutionBits: '24', interfaceType: 'SPI', manufacturer: 'Texas Instruments' },
  { pattern: /^ADS126[1-3]/i, architecture: 'Delta-Sigma', resolutionBits: '32', interfaceType: 'SPI', manufacturer: 'Texas Instruments' },

  // === TEXAS INSTRUMENTS — SAR ===
  { pattern: /^ADS7038/i, architecture: 'SAR', resolutionBits: '12', interfaceType: 'SPI', manufacturer: 'Texas Instruments' },
  { pattern: /^ADS704[1-2]/i, architecture: 'SAR', resolutionBits: '10', interfaceType: 'SPI', manufacturer: 'Texas Instruments' },
  { pattern: /^ADS713[8]/i, architecture: 'SAR', resolutionBits: '12', interfaceType: 'I2C', manufacturer: 'Texas Instruments' },
  { pattern: /^ADS714[2]/i, architecture: 'SAR', resolutionBits: '12', interfaceType: 'I2C', manufacturer: 'Texas Instruments' },
  { pattern: /^ADS7828/i, architecture: 'SAR', resolutionBits: '12', interfaceType: 'I2C', manufacturer: 'Texas Instruments' },
  { pattern: /^ADS784[1]/i, architecture: 'SAR', resolutionBits: '12', interfaceType: 'SPI', manufacturer: 'Texas Instruments' },
  { pattern: /^ADS7844/i, architecture: 'SAR', resolutionBits: '12', interfaceType: 'SPI', manufacturer: 'Texas Instruments' },
  { pattern: /^ADS7924/i, architecture: 'SAR', resolutionBits: '12', interfaceType: 'I2C', manufacturer: 'Texas Instruments' },
  { pattern: /^ADS8165/i, architecture: 'SAR', resolutionBits: '16', interfaceType: 'SPI', manufacturer: 'Texas Instruments' },
  { pattern: /^ADS832[0-9]/i, architecture: 'SAR', resolutionBits: '16', interfaceType: 'SPI', manufacturer: 'Texas Instruments' },
  { pattern: /^ADS836[1]/i, architecture: 'SAR', resolutionBits: '16', interfaceType: 'SPI', manufacturer: 'Texas Instruments' },
  { pattern: /^ADS8364/i, architecture: 'SAR', resolutionBits: '16', interfaceType: 'SPI', manufacturer: 'Texas Instruments' },
  { pattern: /^ADS868[1-8]/i, architecture: 'SAR', resolutionBits: '16', interfaceType: 'SPI', manufacturer: 'Texas Instruments' },
  { pattern: /^ADS869[4-8]/i, architecture: 'SAR', resolutionBits: '16', interfaceType: 'SPI', manufacturer: 'Texas Instruments' },
  { pattern: /^ADS9224/i, architecture: 'SAR', resolutionBits: '16', interfaceType: 'SPI', manufacturer: 'Texas Instruments' },

  // === ANALOG DEVICES — DELTA-SIGMA ===
  { pattern: /^AD7124/i, architecture: 'Delta-Sigma', resolutionBits: '24', interfaceType: 'SPI', manufacturer: 'Analog Devices' },
  { pattern: /^AD717[2-7]/i, architecture: 'Delta-Sigma', resolutionBits: '24', interfaceType: 'SPI', manufacturer: 'Analog Devices' },
  { pattern: /^AD719[0-5]/i, architecture: 'Delta-Sigma', resolutionBits: '24', interfaceType: 'SPI', manufacturer: 'Analog Devices' },
  { pattern: /^AD7779/i, architecture: 'Delta-Sigma', resolutionBits: '24', interfaceType: 'SPI', manufacturer: 'Analog Devices' },

  // === ANALOG DEVICES — SAR ===
  { pattern: /^AD760[6-9]/i, architecture: 'SAR', resolutionBits: '16', interfaceType: 'Parallel', manufacturer: 'Analog Devices' },
  { pattern: /^AD7616/i, architecture: 'SAR', resolutionBits: '16', interfaceType: 'SPI', manufacturer: 'Analog Devices' },
  { pattern: /^AD7689/i, architecture: 'SAR', resolutionBits: '16', interfaceType: 'SPI', manufacturer: 'Analog Devices' },
  { pattern: /^AD7699/i, architecture: 'SAR', resolutionBits: '16', interfaceType: 'SPI', manufacturer: 'Analog Devices' },
  { pattern: /^AD776[8]/i, architecture: 'SAR', resolutionBits: '24', interfaceType: 'SPI', manufacturer: 'Analog Devices' },
  { pattern: /^AD7771/i, architecture: 'SAR', resolutionBits: '24', interfaceType: 'SPI', manufacturer: 'Analog Devices' },

  // === ANALOG DEVICES — PIPELINE ===
  { pattern: /^AD9226/i, architecture: 'Pipeline', resolutionBits: '12', interfaceType: 'Parallel', manufacturer: 'Analog Devices' },
  { pattern: /^AD9234/i, architecture: 'Pipeline', resolutionBits: '12', interfaceType: 'SPI', manufacturer: 'Analog Devices' },
  { pattern: /^AD9250/i, architecture: 'Pipeline', resolutionBits: '14', interfaceType: 'SPI', manufacturer: 'Analog Devices' },
  { pattern: /^AD9268/i, architecture: 'Pipeline', resolutionBits: '16', interfaceType: 'SPI', manufacturer: 'Analog Devices' },

  // === MAXIM (ANALOG DEVICES) — DELTA-SIGMA ===
  { pattern: /^MAX1112[0-1]/i, architecture: 'SAR', resolutionBits: '16', interfaceType: 'SPI', manufacturer: 'Maxim' },
  { pattern: /^MAX1110[0-7]/i, architecture: 'SAR', resolutionBits: '16', interfaceType: 'SPI', manufacturer: 'Maxim' },
  { pattern: /^MAX112[0-9][0-9]/i, architecture: 'Delta-Sigma', resolutionBits: '24', interfaceType: 'SPI', manufacturer: 'Maxim' },

  // === LINEAR TECHNOLOGY (ANALOG DEVICES) — SAR ===
  { pattern: /^LTC186[4-5]/i, architecture: 'SAR', resolutionBits: '16', interfaceType: 'SPI', manufacturer: 'Linear Technology' },
  { pattern: /^LTC238[0-9]/i, architecture: 'SAR', resolutionBits: '20', interfaceType: 'SPI', manufacturer: 'Linear Technology' },
  // LTC2500 and LTC2512 are SAR with digital filter
  { pattern: /^LTC2500/i, architecture: 'SAR', resolutionBits: '32', interfaceType: 'SPI', manufacturer: 'Linear Technology' },
  { pattern: /^LTC2512/i, architecture: 'SAR', resolutionBits: '24', interfaceType: 'SPI', manufacturer: 'Linear Technology' },

  // === MICROCHIP — SAR ===
  { pattern: /^MCP320[1-8]/i, architecture: 'SAR', resolutionBits: '12', interfaceType: 'SPI', manufacturer: 'Microchip' },
  // === MICROCHIP — DELTA-SIGMA ===
  { pattern: /^MCP342[1-4]/i, architecture: 'Delta-Sigma', resolutionBits: '18', interfaceType: 'I2C', manufacturer: 'Microchip' },

  // === CIRRUS LOGIC — DELTA-SIGMA ===
  { pattern: /^CS553[0-6]/i, architecture: 'Delta-Sigma', resolutionBits: '24', interfaceType: 'SPI', manufacturer: 'Cirrus Logic' },
];

/**
 * Enrich C9 ADC attributes with architecture, resolution_bits, and
 * interface_type from MPN prefix patterns when Digikey parametric data
 * is missing or incomplete.
 */
function enrichAdcAttributes(attrs: PartAttributes): void {
  const mpn = attrs.part.mpn;
  const hasArchitecture = attrs.parameters.some(p => p.parameterId === 'architecture');
  const hasResolution = attrs.parameters.some(p => p.parameterId === 'resolution_bits');
  const hasInterface = attrs.parameters.some(p => p.parameterId === 'interface_type');

  for (const hint of adcMpnPatterns) {
    if (!hint.pattern.test(mpn)) continue;

    if (!hasArchitecture && hint.architecture) {
      attrs.parameters.push({
        parameterId: 'architecture',
        parameterName: 'ADC Architecture',
        value: hint.architecture,
        sortOrder: 1,
      });
    }
    if (!hasResolution && hint.resolutionBits) {
      attrs.parameters.push({
        parameterId: 'resolution_bits',
        parameterName: 'Resolution (bits)',
        value: hint.resolutionBits,
        sortOrder: 2,
      });
    }
    if (!hasInterface && hint.interfaceType) {
      attrs.parameters.push({
        parameterId: 'interface_type',
        parameterName: 'Interface Type',
        value: hint.interfaceType,
        sortOrder: 3,
      });
    }
    break; // First match wins
  }
}

// ============================================================
// DAC OUTPUT TYPE POST-SCORING FILTER (C10)
// ============================================================

/**
 * Remove candidates whose output_type doesn't match the source.
 * Voltage-output and current-output DACs are architecturally incompatible —
 * no cross-type substitution is possible. No exceptions.
 */
function filterDacOutputTypeMismatches(
  recs: XrefRecommendation[],
  sourceAttrs: PartAttributes,
): XrefRecommendation[] {
  const srcType = sourceAttrs.parameters.find(p => p.parameterId === 'output_type')?.value;

  return recs.filter(rec => {
    const candType = rec.matchDetails.find(d => d.parameterId === 'output_type')?.replacementValue;
    // If source or candidate is missing output_type, keep (rules handle missing data)
    if (!srcType || !candType) return true;
    // Only exact match passes — no exceptions for DAC output type
    return srcType === candType;
  });
}

// ============================================================
// DAC MPN ENRICHMENT (C10)
// ============================================================

interface DacMpnHint {
  pattern: RegExp;
  outputType?: string;       // 'Voltage Output' | 'Current Output'
  resolutionBits?: string;   // '8' | '10' | '12' | '16' | '18' | '20' | '24' | '32'
  interfaceType?: string;    // 'SPI' | 'I2C' | 'I2S' | 'Parallel'
  manufacturer?: string;
}

/**
 * MPN prefix patterns for DAC classification.
 * Infers output_type, resolution_bits, and interface_type from known MPN families.
 *
 * Source: user-provided MPN list + datasheet verification.
 */
const dacMpnPatterns: DacMpnHint[] = [
  // === TEXAS INSTRUMENTS — VOLTAGE OUTPUT ===
  { pattern: /^DAC8532/i, outputType: 'Voltage Output', resolutionBits: '16', interfaceType: 'SPI', manufacturer: 'Texas Instruments' },
  { pattern: /^DAC856[2-5]/i, outputType: 'Voltage Output', resolutionBits: '12', interfaceType: 'SPI', manufacturer: 'Texas Instruments' },
  { pattern: /^DAC8568/i, outputType: 'Voltage Output', resolutionBits: '16', interfaceType: 'SPI', manufacturer: 'Texas Instruments' },
  { pattern: /^DAC858[0-2]/i, outputType: 'Voltage Output', resolutionBits: '16', interfaceType: 'SPI', manufacturer: 'Texas Instruments' },

  // === TEXAS INSTRUMENTS — CURRENT OUTPUT (4–20 mA) ===
  { pattern: /^DAC876[0-1]/i, outputType: 'Current Output', resolutionBits: '16', interfaceType: 'SPI', manufacturer: 'Texas Instruments' },
  { pattern: /^DAC877[1-5]/i, outputType: 'Current Output', resolutionBits: '16', interfaceType: 'SPI', manufacturer: 'Texas Instruments' },

  // === ANALOG DEVICES — VOLTAGE OUTPUT (AD50xx-AD57xx) ===
  { pattern: /^AD506[1-5]/i, outputType: 'Voltage Output', resolutionBits: '16', interfaceType: 'SPI', manufacturer: 'Analog Devices' },
  { pattern: /^AD507[0-3]/i, outputType: 'Voltage Output', resolutionBits: '16', interfaceType: 'SPI', manufacturer: 'Analog Devices' },
  { pattern: /^AD533[9]/i, outputType: 'Voltage Output', resolutionBits: '16', interfaceType: 'SPI', manufacturer: 'Analog Devices' },
  { pattern: /^AD534[0-1]/i, outputType: 'Voltage Output', resolutionBits: '16', interfaceType: 'SPI', manufacturer: 'Analog Devices' },
  { pattern: /^AD536[0-3]/i, outputType: 'Voltage Output', resolutionBits: '16', interfaceType: 'SPI', manufacturer: 'Analog Devices' },
  { pattern: /^AD542[4-6]/i, outputType: 'Voltage Output', resolutionBits: '8', interfaceType: 'SPI', manufacturer: 'Analog Devices' },
  { pattern: /^AD554[3-6]/i, outputType: 'Voltage Output', resolutionBits: '16', interfaceType: 'SPI', manufacturer: 'Analog Devices' },
  { pattern: /^AD562[0-2]/i, outputType: 'Voltage Output', resolutionBits: '12', interfaceType: 'I2C', manufacturer: 'Analog Devices' },
  { pattern: /^AD562[4-9]/i, outputType: 'Voltage Output', resolutionBits: '12', interfaceType: 'I2C', manufacturer: 'Analog Devices' },
  { pattern: /^AD566[0-8]/i, outputType: 'Voltage Output', resolutionBits: '16', interfaceType: 'I2C', manufacturer: 'Analog Devices' },
  { pattern: /^AD567[6-7]/i, outputType: 'Voltage Output', resolutionBits: '16', interfaceType: 'SPI', manufacturer: 'Analog Devices' },
  { pattern: /^AD5679/i, outputType: 'Voltage Output', resolutionBits: '16', interfaceType: 'SPI', manufacturer: 'Analog Devices' },
  { pattern: /^AD568[0-6]/i, outputType: 'Voltage Output', resolutionBits: '16', interfaceType: 'SPI', manufacturer: 'Analog Devices' },
  { pattern: /^AD569[1-7]/i, outputType: 'Voltage Output', resolutionBits: '12', interfaceType: 'I2C', manufacturer: 'Analog Devices' },

  // === ANALOG DEVICES — PRECISION VOLTAGE OUTPUT ===
  { pattern: /^AD5760/i, outputType: 'Voltage Output', resolutionBits: '16', interfaceType: 'SPI', manufacturer: 'Analog Devices' },
  { pattern: /^AD578[0-1]/i, outputType: 'Voltage Output', resolutionBits: '18', interfaceType: 'SPI', manufacturer: 'Analog Devices' },
  { pattern: /^AD5790/i, outputType: 'Voltage Output', resolutionBits: '20', interfaceType: 'SPI', manufacturer: 'Analog Devices' },
  { pattern: /^AD5791/i, outputType: 'Voltage Output', resolutionBits: '20', interfaceType: 'SPI', manufacturer: 'Analog Devices' },

  // === ANALOG DEVICES — CURRENT OUTPUT ===
  { pattern: /^AD541[0-5]/i, outputType: 'Current Output', resolutionBits: '12', interfaceType: 'SPI', manufacturer: 'Analog Devices' },
  { pattern: /^AD542[0-2]/i, outputType: 'Current Output', resolutionBits: '16', interfaceType: 'SPI', manufacturer: 'Analog Devices' },

  // === LINEAR TECHNOLOGY (ANALOG DEVICES) — VOLTAGE OUTPUT ===
  { pattern: /^LTC260[0-2]/i, outputType: 'Voltage Output', resolutionBits: '16', interfaceType: 'SPI', manufacturer: 'Linear Technology' },
  { pattern: /^LTC260[4-9]/i, outputType: 'Voltage Output', resolutionBits: '16', interfaceType: 'I2C', manufacturer: 'Linear Technology' },
  { pattern: /^LTC262[0-6]/i, outputType: 'Voltage Output', resolutionBits: '12', interfaceType: 'SPI', manufacturer: 'Linear Technology' },
  { pattern: /^LTC262[8]/i, outputType: 'Voltage Output', resolutionBits: '12', interfaceType: 'SPI', manufacturer: 'Linear Technology' },
  { pattern: /^LTC263[0-6]/i, outputType: 'Voltage Output', resolutionBits: '12', interfaceType: 'I2C', manufacturer: 'Linear Technology' },
  { pattern: /^LTC264[0-5]/i, outputType: 'Voltage Output', resolutionBits: '16', interfaceType: 'SPI', manufacturer: 'Linear Technology' },
  { pattern: /^LTC264[8]/i, outputType: 'Voltage Output', resolutionBits: '12', interfaceType: 'SPI', manufacturer: 'Linear Technology' },
  { pattern: /^LTC265[2-8]/i, outputType: 'Voltage Output', resolutionBits: '16', interfaceType: 'SPI', manufacturer: 'Linear Technology' },
  { pattern: /^LTC2662/i, outputType: 'Voltage Output', resolutionBits: '16', interfaceType: 'SPI', manufacturer: 'Linear Technology' },
  { pattern: /^LTC2668/i, outputType: 'Voltage Output', resolutionBits: '16', interfaceType: 'SPI', manufacturer: 'Linear Technology' },
  { pattern: /^LTC2672/i, outputType: 'Voltage Output', resolutionBits: '16', interfaceType: 'SPI', manufacturer: 'Linear Technology' },
  { pattern: /^LTC2688/i, outputType: 'Voltage Output', resolutionBits: '16', interfaceType: 'SPI', manufacturer: 'Linear Technology' },
  { pattern: /^LTC2756/i, outputType: 'Voltage Output', resolutionBits: '18', interfaceType: 'SPI', manufacturer: 'Linear Technology' },
  { pattern: /^LTC2758/i, outputType: 'Voltage Output', resolutionBits: '18', interfaceType: 'SPI', manufacturer: 'Linear Technology' },

  // === MAXIM (ANALOG DEVICES) — VOLTAGE OUTPUT ===
  { pattern: /^MAX521[5-8]/i, outputType: 'Voltage Output', resolutionBits: '16', interfaceType: 'I2C', manufacturer: 'Maxim' },
  { pattern: /^MAX57(19|20|21)/i, outputType: 'Voltage Output', resolutionBits: '20', interfaceType: 'SPI', manufacturer: 'Maxim' },
  { pattern: /^MAX576[2-3]/i, outputType: 'Voltage Output', resolutionBits: '16', interfaceType: 'SPI', manufacturer: 'Maxim' },
  { pattern: /^MAX513[5-7]/i, outputType: 'Voltage Output', resolutionBits: '12', interfaceType: 'SPI', manufacturer: 'Maxim' },

  // === MICROCHIP — VOLTAGE OUTPUT ===
  { pattern: /^MCP470[6]/i, outputType: 'Voltage Output', resolutionBits: '8', interfaceType: 'I2C', manufacturer: 'Microchip' },
  { pattern: /^MCP471[6]/i, outputType: 'Voltage Output', resolutionBits: '10', interfaceType: 'I2C', manufacturer: 'Microchip' },
  { pattern: /^MCP472[6]/i, outputType: 'Voltage Output', resolutionBits: '12', interfaceType: 'I2C', manufacturer: 'Microchip' },
  { pattern: /^MCP481[6]/i, outputType: 'Voltage Output', resolutionBits: '12', interfaceType: 'SPI', manufacturer: 'Microchip' },
  { pattern: /^MCP482[1-2]/i, outputType: 'Voltage Output', resolutionBits: '12', interfaceType: 'SPI', manufacturer: 'Microchip' },
  { pattern: /^MCP491[1-2]/i, outputType: 'Voltage Output', resolutionBits: '10', interfaceType: 'SPI', manufacturer: 'Microchip' },
  { pattern: /^MCP492[1-2]/i, outputType: 'Voltage Output', resolutionBits: '12', interfaceType: 'SPI', manufacturer: 'Microchip' },

  // === AUDIO DACs — TEXAS INSTRUMENTS ===
  { pattern: /^PCM510[0-2]/i, outputType: 'Voltage Output', resolutionBits: '32', interfaceType: 'I2S', manufacturer: 'Texas Instruments' },
  { pattern: /^PCM512[1-2]/i, outputType: 'Voltage Output', resolutionBits: '32', interfaceType: 'I2S', manufacturer: 'Texas Instruments' },
  { pattern: /^PCM514[1-2]/i, outputType: 'Voltage Output', resolutionBits: '32', interfaceType: 'I2S', manufacturer: 'Texas Instruments' },
  { pattern: /^TAS572[0]/i, outputType: 'Voltage Output', resolutionBits: '24', interfaceType: 'I2S', manufacturer: 'Texas Instruments' },
  { pattern: /^TAS575[6]/i, outputType: 'Voltage Output', resolutionBits: '32', interfaceType: 'I2S', manufacturer: 'Texas Instruments' },

  // === AUDIO DACs — CIRRUS LOGIC ===
  { pattern: /^CS434[0-9]/i, outputType: 'Voltage Output', resolutionBits: '24', interfaceType: 'I2S', manufacturer: 'Cirrus Logic' },
  { pattern: /^CS43130/i, outputType: 'Voltage Output', resolutionBits: '32', interfaceType: 'I2S', manufacturer: 'Cirrus Logic' },
];

/**
 * Enrich C10 DAC attributes with output_type, resolution_bits, and
 * interface_type from MPN prefix patterns when Digikey parametric data
 * is missing or incomplete.
 */
function enrichDacAttributes(attrs: PartAttributes): void {
  const mpn = attrs.part.mpn;
  const hasOutputType = attrs.parameters.some(p => p.parameterId === 'output_type');
  const hasResolution = attrs.parameters.some(p => p.parameterId === 'resolution_bits');
  const hasInterface = attrs.parameters.some(p => p.parameterId === 'interface_type');

  for (const hint of dacMpnPatterns) {
    if (!hint.pattern.test(mpn)) continue;

    if (!hasOutputType && hint.outputType) {
      attrs.parameters.push({
        parameterId: 'output_type',
        parameterName: 'Output Type',
        value: hint.outputType,
        sortOrder: 1,
      });
    }
    if (!hasResolution && hint.resolutionBits) {
      attrs.parameters.push({
        parameterId: 'resolution_bits',
        parameterName: 'Resolution (bits)',
        value: hint.resolutionBits,
        sortOrder: 2,
      });
    }
    if (!hasInterface && hint.interfaceType) {
      attrs.parameters.push({
        parameterId: 'interface_type',
        parameterName: 'Interface Type',
        value: hint.interfaceType,
        sortOrder: 3,
      });
    }
    break; // First match wins
  }
}

/** MPN patterns for tantalum Polymer vs MnO2 detection (fallback for non-Digikey sources) */
const tantalumMpnPatterns: { pattern: RegExp; capacitorType: string }[] = [
  // Polymer prefixes
  { pattern: /^T52[015]/i, capacitorType: 'Polymer' },    // KEMET T520/T521/T525
  { pattern: /^T530/i, capacitorType: 'Polymer' },         // KEMET T530
  { pattern: /^255D/i, capacitorType: 'Polymer' },          // Vishay 255D
  { pattern: /^T55/i, capacitorType: 'Polymer' },           // Vishay T55
  { pattern: /^TCJ/i, capacitorType: 'Polymer' },           // AVX TCJ
  { pattern: /^F38/i, capacitorType: 'Polymer' },           // AVX F38
  { pattern: /^\d+TQC/i, capacitorType: 'Polymer' },       // Panasonic POSCAP TQC
  { pattern: /^\d+TDC/i, capacitorType: 'Polymer' },       // Panasonic POSCAP TDC
  { pattern: /^TP[MU]/i, capacitorType: 'Polymer' },        // Panasonic TPM/TPU
  // MnO2 prefixes
  { pattern: /^T49[1-6]/i, capacitorType: 'MnO2' },        // KEMET T491-T496
  { pattern: /^293[DEP]/i, capacitorType: 'MnO2' },         // Vishay 293D/293E/293P
  { pattern: /^593D/i, capacitorType: 'MnO2' },             // Vishay 593D
  { pattern: /^893D/i, capacitorType: 'MnO2' },             // Vishay 893D
  { pattern: /^59[45]D/i, capacitorType: 'MnO2' },          // Vishay 594D/595D
  { pattern: /^TAJ/i, capacitorType: 'MnO2' },              // AVX TAJ
  { pattern: /^TPS/i, capacitorType: 'MnO2' },              // AVX TPS
  { pattern: /^T97/i, capacitorType: 'MnO2' },              // Vishay T97 hi-rel
  { pattern: /^597D/i, capacitorType: 'MnO2' },             // Vishay 597D
];

/** Enrich tantalum capacitor_type from MPN prefix (fallback when Digikey category not available) */
function enrichTantalumAttributes(attrs: PartAttributes): void {
  if (attrs.parameters.some(p => p.parameterId === 'capacitor_type')) return;

  const mpn = attrs.part.mpn;
  for (const hint of tantalumMpnPatterns) {
    if (hint.pattern.test(mpn)) {
      attrs.parameters.push({
        parameterId: 'capacitor_type',
        parameterName: 'Capacitor Type',
        value: hint.capacitorType,
        sortOrder: 4,
      });
      return;
    }
  }
}

// ============================================================
// CRYSTAL (D1) MPN ENRICHMENT
// ============================================================

interface CrystalMpnHint {
  pattern: RegExp;
  frequency?: string;
  cutType?: string;
  packageType?: string;
  mountingType?: string;
  isCeramicResonator?: boolean;
  manufacturer?: string;
}

/**
 * Crystal MPN patterns for enriching attributes from part number.
 * Frequency is typically embedded in the MPN (e.g., ABM8-16.000MHZ-B2-T → 16 MHz).
 * Cut type, package, and mounting are inferred from prefix/suffix conventions.
 *
 * IMPORTANT: CSTCE/CSTLS/CSTNR/AWSCR/ZTT are ceramic resonators (NOT quartz crystals).
 * Packaged oscillators (ASFL, ASEM, SiT8xxx, DSC1xxx) are C8, not D1.
 */
const crystalMpnPatterns: CrystalMpnHint[] = [
  // === CERAMIC RESONATORS (NOT quartz — flag as Application Review) ===
  { pattern: /^CSTCE/i, isCeramicResonator: true, manufacturer: 'Murata' },
  { pattern: /^CSTLS/i, isCeramicResonator: true, manufacturer: 'Murata' },
  { pattern: /^CSTNR/i, isCeramicResonator: true, manufacturer: 'Murata' },
  { pattern: /^AWSCR/i, isCeramicResonator: true, manufacturer: 'Abracon' },
  { pattern: /^ZTT/i, isCeramicResonator: true, manufacturer: 'Murata' },

  // === ABRACON CRYSTALS ===
  { pattern: /^ABM8G?-/i, packageType: '3225', mountingType: 'SMD', manufacturer: 'Abracon' },
  { pattern: /^ABM3-/i, packageType: '5032', mountingType: 'SMD', manufacturer: 'Abracon' },
  { pattern: /^ABM10-/i, packageType: '2016', mountingType: 'SMD', manufacturer: 'Abracon' },
  { pattern: /^ABM8W-/i, packageType: '3225', mountingType: 'SMD', manufacturer: 'Abracon' },
  { pattern: /^ABMM2?-/i, packageType: '2016', mountingType: 'SMD', manufacturer: 'Abracon' },
  { pattern: /^ABMPN-/i, packageType: '1612', mountingType: 'SMD', manufacturer: 'Abracon' },
  { pattern: /^ABMRAD-/i, packageType: '3225', mountingType: 'SMD', manufacturer: 'Abracon' },
  { pattern: /^AB38T2?-/i, cutType: 'Tuning Fork', manufacturer: 'Abracon' },
  { pattern: /^AB26TRQ-/i, cutType: 'Tuning Fork', manufacturer: 'Abracon' },
  { pattern: /^ABS25-/i, cutType: 'Tuning Fork', mountingType: 'SMD', manufacturer: 'Abracon' },
  { pattern: /^ABLS2?-/i, mountingType: 'SMD', manufacturer: 'Abracon' },
  { pattern: /^ABLNO-/i, mountingType: 'SMD', manufacturer: 'Abracon' },

  // === NDK CRYSTALS ===
  { pattern: /^NX2016/i, packageType: '2016', mountingType: 'SMD', manufacturer: 'NDK' },
  { pattern: /^NX3225/i, packageType: '3225', mountingType: 'SMD', manufacturer: 'NDK' },
  { pattern: /^NX5032/i, packageType: '5032', mountingType: 'SMD', manufacturer: 'NDK' },

  // === EPSON CRYSTALS ===
  { pattern: /^FC-135/i, cutType: 'Tuning Fork', mountingType: 'SMD', manufacturer: 'Epson' },
  { pattern: /^FC-12[MD]/i, cutType: 'Tuning Fork', mountingType: 'SMD', manufacturer: 'Epson' },
  { pattern: /^MC-146/i, cutType: 'Tuning Fork', mountingType: 'SMD', manufacturer: 'Epson' },
  { pattern: /^MC-306/i, cutType: 'Tuning Fork', mountingType: 'SMD', manufacturer: 'Epson' },
  { pattern: /^MC-405/i, cutType: 'Tuning Fork', mountingType: 'SMD', manufacturer: 'Epson' },
  { pattern: /^MC-505/i, cutType: 'Tuning Fork', mountingType: 'SMD', manufacturer: 'Epson' },

  // === TXC CRYSTALS ===
  { pattern: /^7M-/i, mountingType: 'SMD', manufacturer: 'TXC' },
  { pattern: /^9C-/i, mountingType: 'SMD', manufacturer: 'TXC' },
  { pattern: /^7[VA]-/i, mountingType: 'SMD', manufacturer: 'TXC' },

  // === KYOCERA / AVX CRYSTALS ===
  { pattern: /^CX2016/i, packageType: '2016', mountingType: 'SMD', manufacturer: 'Kyocera' },
  { pattern: /^CX3225/i, packageType: '3225', mountingType: 'SMD', manufacturer: 'Kyocera' },
  { pattern: /^CX5032/i, packageType: '5032', mountingType: 'SMD', manufacturer: 'Kyocera' },
  { pattern: /^TSX-3225/i, packageType: '3225', mountingType: 'SMD', manufacturer: 'Kyocera' },
  { pattern: /^TSX-2520/i, packageType: '2520', mountingType: 'SMD', manufacturer: 'Kyocera' },
  { pattern: /^TSX-4025/i, packageType: '4025', mountingType: 'SMD', manufacturer: 'Kyocera' },

  // === ECS CRYSTALS ===
  { pattern: /^ECS-\d+/i, mountingType: 'SMD', manufacturer: 'ECS' },

  // === IQD / IQXC CRYSTALS ===
  { pattern: /^IQXC-/i, mountingType: 'SMD', manufacturer: 'IQD' },
  { pattern: /^LFXTAL/i, mountingType: 'SMD', manufacturer: 'IQD' },

  // === MURATA QUARTZ (not ceramic) ===
  { pattern: /^XRCGB/i, packageType: '2016', mountingType: 'SMD', manufacturer: 'Murata' },
  { pattern: /^XRCMD/i, packageType: '2016', mountingType: 'SMD', manufacturer: 'Murata' },
  { pattern: /^XRCPB/i, packageType: '2016', mountingType: 'SMD', manufacturer: 'Murata' },

  // === THROUGH-HOLE CRYSTALS ===
  { pattern: /^HC-?49/i, mountingType: 'Through-Hole' },
];

/** Parse frequency from crystal MPN (returns raw value string like "16 MHz" or "32.768 kHz") */
function parseCrystalFrequency(mpn: string): string | null {
  // Pattern: numeric field followed by MHz or kHz (e.g., ABM8-16.000MHZ, AB38T-32.768KHZ)
  const freqMatch = mpn.match(/(\d+\.?\d*)\s*(MHZ|KHZ)/i);
  if (freqMatch) {
    const value = freqMatch[1];
    const unit = freqMatch[2].toUpperCase();
    if (unit === 'MHZ') return `${value} MHz`;
    if (unit === 'KHZ') return `${value} kHz`;
  }
  return null;
}

/** Enrich crystal attributes from MPN prefix, frequency, and package conventions */
function enrichCrystalAttributes(attrs: PartAttributes): void {
  const mpn = attrs.part.mpn;
  const existingIds = new Set(attrs.parameters.map(p => p.parameterId));

  // Check for ceramic resonator — flag but do not block (it's scored by the engine)
  for (const hint of crystalMpnPatterns) {
    if (hint.isCeramicResonator && hint.pattern.test(mpn)) {
      // Ceramic resonator detected — not a quartz crystal
      // The matching engine will flag Application Review; we just note it here
      if (!existingIds.has('qualification_level')) {
        attrs.parameters.push({
          parameterId: 'qualification_level',
          parameterName: 'Qualification Level',
          value: 'Ceramic Resonator (not quartz crystal — ±0.5% tolerance, 50–100× less accurate)',
          sortOrder: 18,
        });
      }
      return; // Don't enrich further — ceramic resonator, not quartz
    }
  }

  // Parse frequency from MPN
  if (!existingIds.has('nominal_frequency_hz')) {
    const freq = parseCrystalFrequency(mpn);
    if (freq) {
      attrs.parameters.push({
        parameterId: 'nominal_frequency_hz',
        parameterName: 'Nominal Frequency',
        value: freq,
        sortOrder: 1,
      });
      existingIds.add('nominal_frequency_hz');
    }
  }

  // Infer cut type from frequency (32.768 kHz → Tuning Fork, else AT-cut)
  if (!existingIds.has('cut_type')) {
    const freqParam = attrs.parameters.find(p => p.parameterId === 'nominal_frequency_hz');
    const freqVal = freqParam?.value?.toLowerCase() ?? '';
    // Check MPN pattern hints first
    const mpnHint = crystalMpnPatterns.find(h => !h.isCeramicResonator && h.cutType && h.pattern.test(mpn));
    if (mpnHint?.cutType) {
      attrs.parameters.push({
        parameterId: 'cut_type',
        parameterName: 'Crystal Cut Type',
        value: mpnHint.cutType,
        sortOrder: 2,
      });
    } else if (freqVal.includes('32.768') && freqVal.includes('khz')) {
      attrs.parameters.push({
        parameterId: 'cut_type',
        parameterName: 'Crystal Cut Type',
        value: 'Tuning Fork',
        sortOrder: 2,
      });
    } else if (freqVal) {
      attrs.parameters.push({
        parameterId: 'cut_type',
        parameterName: 'Crystal Cut Type',
        value: 'AT-cut',
        sortOrder: 2,
      });
    }
    existingIds.add('cut_type');
  }

  // Infer package type and mounting type from MPN prefix
  for (const hint of crystalMpnPatterns) {
    if (hint.isCeramicResonator) continue;
    if (!hint.pattern.test(mpn)) continue;

    if (hint.packageType && !existingIds.has('package_type')) {
      attrs.parameters.push({
        parameterId: 'package_type',
        parameterName: 'Package / Case',
        value: hint.packageType,
        sortOrder: 10,
      });
      existingIds.add('package_type');
    }
    if (hint.mountingType && !existingIds.has('mounting_type')) {
      attrs.parameters.push({
        parameterId: 'mounting_type',
        parameterName: 'Mounting Type',
        value: hint.mountingType,
        sortOrder: 12,
      });
      existingIds.add('mounting_type');
    }
    break; // Use first match
  }
}

// ============================================================
// CRYSTAL (D1) POST-SCORING FILTER
// ============================================================

/**
 * Post-scoring filter for D1 crystals:
 * - mounting_type (SMD vs Through-Hole) mismatch → BLOCK
 * - overtone_order mismatch (fundamental ↔ overtone) → BLOCK
 */
function filterCrystalMismatches(
  recs: XrefRecommendation[],
  sourceAttrs: PartAttributes,
): XrefRecommendation[] {
  const srcMount = sourceAttrs.parameters.find(p => p.parameterId === 'mounting_type')?.value;
  const srcOvertone = sourceAttrs.parameters.find(p => p.parameterId === 'overtone_order')?.value?.toLowerCase();

  return recs.filter(rec => {
    // Block mounting type mismatch (SMD ↔ Through-Hole)
    const candMount = rec.matchDetails?.find(d => d.parameterId === 'mounting_type');
    if (srcMount && candMount?.replacementValue && srcMount !== candMount.replacementValue) {
      return false;
    }

    // Block overtone order mismatch (fundamental ↔ 3rd/5th overtone)
    const candOvertone = rec.matchDetails?.find(d => d.parameterId === 'overtone_order');
    if (srcOvertone && candOvertone?.replacementValue) {
      const candOvertoneVal = candOvertone.replacementValue.toLowerCase();
      const srcIsFundamental = srcOvertone.includes('fundamental');
      const candIsFundamental = candOvertoneVal.includes('fundamental');
      // Block if one is fundamental and the other is overtone
      if (srcIsFundamental !== candIsFundamental) return false;
      // Block if both are overtone but different order (3rd ≠ 5th)
      if (!srcIsFundamental && !candIsFundamental && srcOvertone !== candOvertoneVal) return false;
    }

    return true;
  });
}

// ============================================================
// D2 FUSES — MPN Enrichment + Post-Scoring Filter
// ============================================================

interface FuseMpnHint {
  pattern: RegExp;
  speedClass?: string;
  packageFormat?: string;
  mountingType?: string;
  manufacturer?: string;
  isPtcResettable?: boolean;
  isThermalCutoff?: boolean;
}

const fuseMpnPatterns: FuseMpnHint[] = [
  // === PTC RESETTABLE FUSES — redirect to Family 66, NOT D2 ===
  { pattern: /^RXEF/i, isPtcResettable: true, manufacturer: 'Littelfuse' },
  { pattern: /^RUEF/i, isPtcResettable: true, manufacturer: 'Littelfuse' },
  { pattern: /^RGEF/i, isPtcResettable: true, manufacturer: 'Littelfuse' },
  { pattern: /^RHEF/i, isPtcResettable: true, manufacturer: 'Littelfuse' },
  { pattern: /^MF-MSMF/i, isPtcResettable: true, manufacturer: 'Bourns' },
  { pattern: /^MF-R/i, isPtcResettable: true, manufacturer: 'Bourns' },
  { pattern: /^0ZC/i, isPtcResettable: true, manufacturer: 'Bel Fuse' },
  { pattern: /^PPTC/i, isPtcResettable: true },
  { pattern: /polyswitch/i, isPtcResettable: true },
  { pattern: /polyfuse/i, isPtcResettable: true },

  // === THERMAL CUTOFFS — not D2, flag as out of scope ===
  { pattern: /^G4A/i, isThermalCutoff: true, manufacturer: 'Microtemp' },
  { pattern: /^SEFUSE/i, isThermalCutoff: true, manufacturer: 'Schott' },

  // === LITTELFUSE CARTRIDGE — 5×20mm ===
  { pattern: /^218\d{3}/i, speedClass: 'Fast-Blow', packageFormat: '5x20mm', mountingType: 'Chassis Mount', manufacturer: 'Littelfuse' },
  { pattern: /^218T/i, speedClass: 'Slow-Blow', packageFormat: '5x20mm', mountingType: 'Chassis Mount', manufacturer: 'Littelfuse' },
  { pattern: /^218P/i, speedClass: 'Fast-Blow', packageFormat: '5x20mm', mountingType: 'Chassis Mount', manufacturer: 'Littelfuse' },

  // === LITTELFUSE CARTRIDGE — 6.3×32mm ===
  { pattern: /^312T/i, speedClass: 'Slow-Blow', packageFormat: '6.3x32mm', mountingType: 'Chassis Mount', manufacturer: 'Littelfuse' },
  { pattern: /^312\d{3}/i, speedClass: 'Fast-Blow', packageFormat: '6.3x32mm', mountingType: 'Chassis Mount', manufacturer: 'Littelfuse' },
  { pattern: /^313T/i, speedClass: 'Slow-Blow', packageFormat: '6.3x32mm', mountingType: 'Chassis Mount', manufacturer: 'Littelfuse' },
  { pattern: /^313\d{3}/i, speedClass: 'Fast-Blow', packageFormat: '6.3x32mm', mountingType: 'Chassis Mount', manufacturer: 'Littelfuse' },

  // === LITTELFUSE SMD ===
  { pattern: /^0451/i, speedClass: 'Fast-Blow', mountingType: 'SMD', manufacturer: 'Littelfuse' },
  { pattern: /^0452/i, speedClass: 'Slow-Blow', mountingType: 'SMD', manufacturer: 'Littelfuse' },
  { pattern: /^0453/i, speedClass: 'Fast-Blow', mountingType: 'SMD', manufacturer: 'Littelfuse' },
  { pattern: /^0454/i, speedClass: 'Fast-Blow', mountingType: 'SMD', manufacturer: 'Littelfuse' },
  { pattern: /^0455/i, speedClass: 'Fast-Blow', mountingType: 'SMD', manufacturer: 'Littelfuse' },
  { pattern: /^0456/i, speedClass: 'Slow-Blow', mountingType: 'SMD', manufacturer: 'Littelfuse' },

  // === SCHURTER ===
  { pattern: /^GSF/i, speedClass: 'Fast-Blow', packageFormat: '5x20mm', mountingType: 'Chassis Mount', manufacturer: 'Schurter' },
  { pattern: /^FST/i, speedClass: 'Slow-Blow', mountingType: 'Chassis Mount', manufacturer: 'Schurter' },
  { pattern: /^PFRA/i, mountingType: 'SMD', manufacturer: 'Schurter' },
  { pattern: /^UST/i, mountingType: 'SMD', manufacturer: 'Schurter' },

  // === BEL FUSE ===
  { pattern: /^GMA/i, speedClass: 'Fast-Blow', packageFormat: '5x20mm', mountingType: 'Chassis Mount', manufacturer: 'Bel Fuse' },
  { pattern: /^GMC/i, speedClass: 'Fast-Blow', packageFormat: '5x20mm', mountingType: 'Chassis Mount', manufacturer: 'Bel Fuse' },
  { pattern: /^GDC/i, speedClass: 'Slow-Blow', packageFormat: '5x20mm', mountingType: 'Chassis Mount', manufacturer: 'Bel Fuse' },
  { pattern: /^MDL/i, speedClass: 'Slow-Blow', packageFormat: '6.3x32mm', mountingType: 'Chassis Mount', manufacturer: 'Bel Fuse' },
  { pattern: /^MDX/i, speedClass: 'Slow-Blow', packageFormat: '6.3x32mm', mountingType: 'Chassis Mount', manufacturer: 'Bel Fuse' },
  { pattern: /^FLQ/i, speedClass: 'Slow-Blow', mountingType: 'Chassis Mount', manufacturer: 'Bel Fuse' },
  { pattern: /^FLA/i, speedClass: 'Slow-Blow', mountingType: 'Chassis Mount', manufacturer: 'Bel Fuse' },
  { pattern: /^5HH/i, speedClass: 'Fast-Blow', mountingType: 'Chassis Mount', manufacturer: 'Bel Fuse' },
  { pattern: /^5SB/i, speedClass: 'Slow-Blow', mountingType: 'Chassis Mount', manufacturer: 'Bel Fuse' },

  // === BOURNS SMD ===
  { pattern: /^SF-?0603/i, packageFormat: '0603', mountingType: 'SMD', manufacturer: 'Bourns' },
  { pattern: /^SF-?0805/i, packageFormat: '0805', mountingType: 'SMD', manufacturer: 'Bourns' },
  { pattern: /^SF-?1206/i, packageFormat: '1206', mountingType: 'SMD', manufacturer: 'Bourns' },
  { pattern: /^SF-?2410/i, packageFormat: '2410', mountingType: 'SMD', manufacturer: 'Bourns' },

  // === AUTOMOTIVE BLADE FUSES ===
  { pattern: /^ATM/i, packageFormat: 'Mini Blade (ATM)', mountingType: 'Blade', manufacturer: 'Automotive' },
  { pattern: /^ATO/i, packageFormat: 'Regular Blade (ATO)', mountingType: 'Blade', manufacturer: 'Automotive' },
  { pattern: /^ATC/i, packageFormat: 'Regular Blade (ATC)', mountingType: 'Blade', manufacturer: 'Automotive' },
  { pattern: /^APX/i, packageFormat: 'Maxi Blade (APX)', mountingType: 'Blade', manufacturer: 'Automotive' },
  { pattern: /^MIDI/i, packageFormat: 'MIDI Blade', mountingType: 'Blade', manufacturer: 'Automotive' },
  { pattern: /^MAXI/i, packageFormat: 'Maxi Blade', mountingType: 'Blade', manufacturer: 'Automotive' },
  { pattern: /^MCASE/i, packageFormat: 'M-CASE', mountingType: 'Blade', manufacturer: 'Automotive' },
  { pattern: /^JCASE/i, packageFormat: 'J-CASE', mountingType: 'Blade', manufacturer: 'Automotive' },

  // === CARTRIDGE VARIANTS ===
  { pattern: /^AGA/i, speedClass: 'Fast-Blow', packageFormat: '6.3x32mm', mountingType: 'Chassis Mount' },
  { pattern: /^AGC/i, speedClass: 'Fast-Blow', packageFormat: '6.3x32mm', mountingType: 'Chassis Mount' },
  { pattern: /^AGX/i, speedClass: 'Fast-Blow', packageFormat: '6.3x32mm', mountingType: 'Chassis Mount' },
  { pattern: /^AGW/i, speedClass: 'Slow-Blow', packageFormat: '6.3x32mm', mountingType: 'Chassis Mount' },
  { pattern: /^F500/i, speedClass: 'Fast-Blow', mountingType: 'Chassis Mount' },
  { pattern: /^F501/i, speedClass: 'Slow-Blow', mountingType: 'Chassis Mount' },
];

/**
 * Enrich fuse attributes from MPN patterns.
 * Infers speed_class, package_format, and mounting_type from part number prefixes.
 * Guards against PTC resettable fuses (Family 66) and thermal cutoffs.
 */
function enrichFuseAttributes(attrs: PartAttributes): void {
  const mpn = attrs.part.mpn;
  const desc = attrs.part.description.toLowerCase();

  // Guard: PTC resettable fuses should be Family 66, not D2
  if (desc.includes('ptc') || desc.includes('resettable') || desc.includes('polyfuse') || desc.includes('polyswitch')) {
    console.warn(`[D2] MPN ${mpn} appears to be PTC resettable (Family 66), not D2 traditional fuse`);
    return;
  }

  // Guard: Thermal cutoffs are out of scope
  if (desc.includes('thermal cutoff') || desc.includes('thermal fuse') || desc.includes('therm-o-disc')) {
    console.warn(`[D2] MPN ${mpn} appears to be a thermal cutoff, not D2 traditional fuse`);
    return;
  }

  const paramMap = new Map(attrs.parameters.map(p => [p.parameterId, p]));

  // Try MPN prefix patterns
  for (const hint of fuseMpnPatterns) {
    if (!hint.pattern.test(mpn)) continue;

    // PTC redirect guard
    if (hint.isPtcResettable) {
      console.warn(`[D2] MPN ${mpn} matched PTC resettable pattern — should be Family 66`);
      return;
    }

    // Thermal cutoff guard
    if (hint.isThermalCutoff) {
      console.warn(`[D2] MPN ${mpn} matched thermal cutoff pattern — out of scope`);
      return;
    }

    // Enrich speed_class if not already present
    if (hint.speedClass && !paramMap.has('speed_class')) {
      attrs.parameters.push({
        parameterId: 'speed_class',
        parameterName: 'Speed Class',
        value: hint.speedClass,
        sortOrder: 0, source: 'mpn_enrichment',
      });
    }

    // Enrich package_format if not already present
    if (hint.packageFormat && !paramMap.has('package_format')) {
      attrs.parameters.push({
        parameterId: 'package_format',
        parameterName: 'Package Format',
        value: hint.packageFormat,
        sortOrder: 0, source: 'mpn_enrichment',
      });
    }

    // Enrich mounting_type if not already present
    if (hint.mountingType && !paramMap.has('mounting_type')) {
      attrs.parameters.push({
        parameterId: 'mounting_type',
        parameterName: 'Mounting Type',
        value: hint.mountingType,
        sortOrder: 0, source: 'mpn_enrichment',
      });
    }

    break; // First match wins
  }

  // Suffix-based speed class inference (generic, only if not set by prefix patterns)
  if (!paramMap.has('speed_class') && !attrs.parameters.find(p => p.parameterId === 'speed_class')) {
    const upperMpn = mpn.toUpperCase();
    if (upperMpn.endsWith('FF') || upperMpn.includes('-FF')) {
      attrs.parameters.push({ parameterId: 'speed_class', parameterName: 'Speed Class', value: 'Very Fast (FF)', sortOrder: 0, source: 'mpn_enrichment' });
    } else if (upperMpn.endsWith('TT') || upperMpn.includes('-TT')) {
      attrs.parameters.push({ parameterId: 'speed_class', parameterName: 'Speed Class', value: 'Very Slow (TT)', sortOrder: 0, source: 'mpn_enrichment' });
    } else if (/[^A-Z]T$/i.test(mpn) || mpn.includes('-T-') || /TD$/i.test(mpn)) {
      attrs.parameters.push({ parameterId: 'speed_class', parameterName: 'Speed Class', value: 'Slow-Blow', sortOrder: 0, source: 'mpn_enrichment' });
    }
  }
}

/**
 * Post-scoring filter for D2 fuses — removes confirmed speed_class and
 * package_format mismatches. These are BLOCKING identity gates that must
 * match exactly; the scoring engine may not catch all string normalization
 * edge cases, so this filter ensures hard rejections.
 */
function filterFuseMismatches(
  recs: XrefRecommendation[],
  sourceAttrs: PartAttributes,
): XrefRecommendation[] {
  const srcSpeed = sourceAttrs.parameters.find(p => p.parameterId === 'speed_class')?.value?.toLowerCase();
  const srcPackage = sourceAttrs.parameters.find(p => p.parameterId === 'package_format')?.value?.toLowerCase();

  return recs.filter(rec => {
    // Block speed_class mismatch (fast ≠ slow)
    if (srcSpeed) {
      const candSpeed = rec.matchDetails?.find(d => d.parameterId === 'speed_class');
      if (candSpeed?.replacementValue) {
        const candSpeedVal = candSpeed.replacementValue.toLowerCase();
        const srcIsFast = srcSpeed.includes('fast') || srcSpeed === 'f' || srcSpeed === 'ff';
        const candIsFast = candSpeedVal.includes('fast') || candSpeedVal === 'f' || candSpeedVal === 'ff';
        const srcIsSlow = srcSpeed.includes('slow') || srcSpeed.includes('time-delay') || srcSpeed === 't' || srcSpeed === 'tt';
        const candIsSlow = candSpeedVal.includes('slow') || candSpeedVal.includes('time-delay') || candSpeedVal === 't' || candSpeedVal === 'tt';
        // Cross-class: one is fast and the other is slow → BLOCK
        if ((srcIsFast && candIsSlow) || (srcIsSlow && candIsFast)) return false;
      }
    }

    // Block package_format mismatch (cartridge ≠ blade ≠ SMD)
    if (srcPackage) {
      const candPackage = rec.matchDetails?.find(d => d.parameterId === 'package_format');
      if (candPackage?.replacementValue) {
        const candPkgVal = candPackage.replacementValue.toLowerCase();
        // Different cartridge sizes
        const srcIsCartridge5x20 = srcPackage.includes('5x20') || srcPackage.includes('5×20');
        const candIsCartridge5x20 = candPkgVal.includes('5x20') || candPkgVal.includes('5×20');
        const srcIsCartridge6x32 = srcPackage.includes('6.3x32') || srcPackage.includes('6.3×32');
        const candIsCartridge6x32 = candPkgVal.includes('6.3x32') || candPkgVal.includes('6.3×32');
        // Blade types
        const srcIsBlade = srcPackage.includes('blade') || srcPackage.includes('atm') || srcPackage.includes('atc') || srcPackage.includes('ato') || srcPackage.includes('apx');
        const candIsBlade = candPkgVal.includes('blade') || candPkgVal.includes('atm') || candPkgVal.includes('atc') || candPkgVal.includes('ato') || candPkgVal.includes('apx');
        // SMD sizes
        const srcIsSmd = /\b(0402|0603|0805|1206|2410)\b/.test(srcPackage);
        const candIsSmd = /\b(0402|0603|0805|1206|2410)\b/.test(candPkgVal);

        // Cross-format: cartridge ↔ blade ↔ SMD
        if (srcIsCartridge5x20 && !candIsCartridge5x20) return false;
        if (srcIsCartridge6x32 && !candIsCartridge6x32) return false;
        if (srcIsBlade && !candIsBlade) return false;
        if (srcIsSmd && !candIsSmd) return false;

        // Within blade: ATM ≠ ATC/ATO ≠ APX (different physical dimensions)
        if (srcIsBlade && candIsBlade) {
          const srcMini = srcPackage.includes('mini') || srcPackage.includes('atm');
          const candMini = candPkgVal.includes('mini') || candPkgVal.includes('atm');
          const srcMaxi = srcPackage.includes('maxi') || srcPackage.includes('apx');
          const candMaxi = candPkgVal.includes('maxi') || candPkgVal.includes('apx');
          if (srcMini !== candMini) return false;
          if (srcMaxi !== candMaxi) return false;
        }
      }
    }

    return true;
  });
}

// ============================================================
// E1: Optocouplers / Photocouplers — MPN Enrichment & Post-Scoring Filter
// ============================================================

/** MPN prefix patterns for optocoupler output type inference */
const optocouplerMpnPatterns: { pattern: RegExp; outputType?: string; channelCount?: string; isDigitalIsolator?: boolean }[] = [
  // Digital isolator redirect guards — NOT optocouplers
  { pattern: /^ADUM\d/i, isDigitalIsolator: true },
  { pattern: /^Si8[4-9]\d/i, isDigitalIsolator: true },
  { pattern: /^Si86\d/i, isDigitalIsolator: true },
  { pattern: /^ISO1\d/i, isDigitalIsolator: true },

  // Logic-output optocouplers (high-speed, VCC required)
  { pattern: /^6N13[5-7]/i, outputType: 'Logic Output' },
  { pattern: /^HCPL-?0[36]/i, outputType: 'Logic Output' },
  { pattern: /^HCPL-?26/i, outputType: 'Logic Output' },
  { pattern: /^HCPL-?31/i, outputType: 'Logic Output' },
  { pattern: /^HCPL-?06/i, outputType: 'Logic Output' },
  { pattern: /^ACPL-?[P3]/i, outputType: 'Logic Output' },
  { pattern: /^ACPL-?06/i, outputType: 'Logic Output' },
  { pattern: /^FOD8/i, outputType: 'Logic Output' },

  // Photodarlington optocouplers (high CTR, slow)
  { pattern: /^MCT2/i, outputType: 'Photodarlington' },
  { pattern: /^H11D/i, outputType: 'Photodarlington' },
  { pattern: /^TLP627/i, outputType: 'Photodarlington' },
  { pattern: /^TLP521/i, outputType: 'Photodarlington' },

  // Phototransistor optocouplers (most common)
  { pattern: /^PC817/i, outputType: 'Phototransistor', channelCount: '1' },
  { pattern: /^PC827/i, outputType: 'Phototransistor', channelCount: '2' },
  { pattern: /^PC837/i, outputType: 'Phototransistor', channelCount: '3' },
  { pattern: /^PC847/i, outputType: 'Phototransistor', channelCount: '4' },
  { pattern: /^4N2[5-8]/i, outputType: 'Phototransistor' },
  { pattern: /^4N3[5-7]/i, outputType: 'Phototransistor' },
  { pattern: /^H11A/i, outputType: 'Phototransistor' },
  { pattern: /^H11AA/i, outputType: 'Phototransistor' },
  { pattern: /^TLP18[5-9]/i, outputType: 'Phototransistor' },
  { pattern: /^TLP29[1-4]/i, outputType: 'Phototransistor' },
  { pattern: /^TLP78[5-9]/i, outputType: 'Phototransistor' },
  { pattern: /^TLP180/i, outputType: 'Phototransistor' },
  { pattern: /^SFH61[5-7]/i, outputType: 'Phototransistor' },
  { pattern: /^SFH6156/i, outputType: 'Phototransistor' },
  { pattern: /^EL817/i, outputType: 'Phototransistor', channelCount: '1' },
  { pattern: /^EL827/i, outputType: 'Phototransistor', channelCount: '2' },
  { pattern: /^EL847/i, outputType: 'Phototransistor', channelCount: '4' },
  { pattern: /^LTV-?817/i, outputType: 'Phototransistor', channelCount: '1' },
  { pattern: /^LTV-?827/i, outputType: 'Phototransistor', channelCount: '2' },
  { pattern: /^LTV-?847/i, outputType: 'Phototransistor', channelCount: '4' },
  { pattern: /^FOD817/i, outputType: 'Phototransistor', channelCount: '1' },
  { pattern: /^CNY17/i, outputType: 'Phototransistor' },
  { pattern: /^CNY65/i, outputType: 'Phototransistor' },
  { pattern: /^VOA300/i, outputType: 'Phototransistor' },
];

/**
 * Enrich optocoupler attributes from MPN patterns.
 * Infers output_transistor_type, ctr_class, channel_count from part number.
 * Guards against digital isolators (ADUM, Si84xx, Si86xx).
 */
function enrichOptocouplerAttributes(attrs: PartAttributes): void {
  const mpn = attrs.part.mpn;
  const desc = attrs.part.description.toLowerCase();

  // Guard: Digital isolators are NOT optocouplers
  if (desc.includes('digital isolator') || desc.includes('magnetic isolator') || desc.includes('capacitive isolator')) {
    console.warn(`[E1] MPN ${mpn} appears to be a digital isolator, not E1 optocoupler`);
    return;
  }

  const paramMap = new Map(attrs.parameters.map(p => [p.parameterId, p]));

  // Try MPN prefix patterns
  for (const hint of optocouplerMpnPatterns) {
    if (!hint.pattern.test(mpn)) continue;

    // Digital isolator redirect guard
    if (hint.isDigitalIsolator) {
      console.warn(`[E1] MPN ${mpn} matched digital isolator pattern — should be C7 Interface ICs`);
      return;
    }

    // Enrich output_transistor_type if not already present
    if (hint.outputType && !paramMap.has('output_transistor_type')) {
      attrs.parameters.push({
        parameterId: 'output_transistor_type',
        parameterName: 'Output Transistor Type',
        value: hint.outputType,
        sortOrder: 0, source: 'mpn_enrichment',
      });
    }

    // Enrich channel_count if not already present
    if (hint.channelCount && !paramMap.has('channel_count')) {
      attrs.parameters.push({
        parameterId: 'channel_count',
        parameterName: 'Channel Count',
        value: hint.channelCount,
        sortOrder: 0, source: 'mpn_enrichment',
      });
    }

    break; // First match wins
  }

  // CTR class inference from trailing letter suffix (PC817A, PC817B, etc.)
  if (!paramMap.has('ctr_class') && !attrs.parameters.find(p => p.parameterId === 'ctr_class')) {
    // Match PC817X, EL817X, LTV-817X patterns where X is a CTR class letter
    const ctrMatch = mpn.match(/(?:PC|EL|LTV-?|FOD)8[1-4]7([A-E])\b/i);
    if (ctrMatch) {
      attrs.parameters.push({
        parameterId: 'ctr_class',
        parameterName: 'CTR Class (Rank)',
        value: ctrMatch[1].toUpperCase(),
        sortOrder: 0, source: 'mpn_enrichment',
      });
    }
  }
}

/**
 * Post-scoring filter for E1 optocouplers — removes confirmed
 * output_transistor_type and channel_count mismatches. These are
 * BLOCKING identity gates that must match exactly.
 */
function filterOptocouplerMismatches(
  recs: XrefRecommendation[],
  sourceAttrs: PartAttributes,
): XrefRecommendation[] {
  const srcOutputType = sourceAttrs.parameters.find(p => p.parameterId === 'output_transistor_type')?.value?.toLowerCase();
  const srcChannelCount = sourceAttrs.parameters.find(p => p.parameterId === 'channel_count')?.value?.toLowerCase();

  return recs.filter(rec => {
    // Block output_transistor_type mismatch (phototransistor ≠ photodarlington ≠ logic-output)
    if (srcOutputType) {
      const candOutput = rec.matchDetails?.find(d => d.parameterId === 'output_transistor_type');
      if (candOutput?.replacementValue) {
        const candVal = candOutput.replacementValue.toLowerCase();
        const srcIsPhototransistor = srcOutputType.includes('phototransistor') || srcOutputType.includes('transistor output');
        const candIsPhototransistor = candVal.includes('phototransistor') || candVal.includes('transistor output');
        const srcIsDarlington = srcOutputType.includes('darlington');
        const candIsDarlington = candVal.includes('darlington');
        const srcIsLogic = srcOutputType.includes('logic') || srcOutputType.includes('cmos') || srcOutputType.includes('ttl');
        const candIsLogic = candVal.includes('logic') || candVal.includes('cmos') || candVal.includes('ttl');

        // Cross-type: one is logic and the other isn't → BLOCK
        if (srcIsLogic !== candIsLogic) return false;
        // Cross-type: phototransistor vs photodarlington → BLOCK
        if (srcIsPhototransistor && candIsDarlington) return false;
        if (srcIsDarlington && candIsPhototransistor) return false;
      }
    }

    // Block channel_count mismatch (single ≠ dual ≠ quad)
    if (srcChannelCount) {
      const candChannel = rec.matchDetails?.find(d => d.parameterId === 'channel_count');
      if (candChannel?.replacementValue) {
        const candChVal = candChannel.replacementValue.toLowerCase();
        // Normalize to numbers for comparison
        const srcNum = srcChannelCount.match(/\d+/)?.[0];
        const candNum = candChVal.match(/\d+/)?.[0];
        if (srcNum && candNum && srcNum !== candNum) return false;
      }
    }

    return true;
  });
}

// ── F1: Electromechanical Relays — MPN enrichment patterns ─────────────

/** Relay MPN prefix patterns for enriching coil_voltage_vdc, contact_form, and mounting_type */
const relayMpnPatterns: { pattern: RegExp; contactForm?: string; mountingType?: string; isSSR?: boolean }[] = [
  // SSR redirect guards — these are NOT F1 EMRs
  { pattern: /^G3(NA|NE|PA|PB|PE|PF|S|MB)/i, isSSR: true },
  { pattern: /^G9(H|EC)/i, isSSR: true },
  { pattern: /^SSR/i, isSSR: true },
  { pattern: /^CRYDOM/i, isSSR: true },
  { pattern: /^SSM/i, isSSR: true },  // Schneider SSR
  { pattern: /^CX\d{3}/i, isSSR: true },  // Crydom CX series

  // Omron — Power relays
  { pattern: /^G2R-1/i, contactForm: 'SPDT' },
  { pattern: /^G2R-2/i, contactForm: 'DPDT' },
  { pattern: /^G2RL-1/i, contactForm: 'SPDT' },
  { pattern: /^G2RL-14/i, contactForm: 'DPDT' },
  { pattern: /^G2RL-2/i, contactForm: 'DPDT' },
  { pattern: /^G5LE-1/i, contactForm: 'SPDT' },
  { pattern: /^G5LE-1A/i, contactForm: 'SPST-NO' },
  { pattern: /^G5Q-1/i, contactForm: 'SPST-NO' },
  { pattern: /^G5Q-1A/i, contactForm: 'SPST-NO' },
  { pattern: /^G7L-1A/i, contactForm: 'SPST-NO' },
  { pattern: /^G7L-2A/i, contactForm: 'DPST-NO' },
  { pattern: /^G7Z/i, contactForm: 'SPST-NO' },
  // Omron — Signal relays
  { pattern: /^G5V-1/i, contactForm: 'SPDT' },
  { pattern: /^G5V-2/i, contactForm: 'DPDT' },
  { pattern: /^G6B-1/i, contactForm: 'SPDT' },
  { pattern: /^G6B-2/i, contactForm: 'DPDT' },
  { pattern: /^G6C-1/i, contactForm: 'SPDT' },
  { pattern: /^G6C-2/i, contactForm: 'DPDT' },
  { pattern: /^G6K-2/i, contactForm: 'DPDT' },
  { pattern: /^G6K-2F/i, contactForm: 'DPDT' },

  // TE / Tyco / Axicom
  { pattern: /^V23084/i },
  { pattern: /^V23092/i },
  { pattern: /^IM\d/i },
  { pattern: /^RT\d/i, contactForm: 'SPDT' },
  { pattern: /^EC2/i, contactForm: 'DPDT' },
  { pattern: /^RTE\d/i },
  { pattern: /^T9A/i, contactForm: 'SPDT' },
  { pattern: /^T9G/i, contactForm: 'DPDT' },

  // Panasonic / Aromat
  { pattern: /^JS\d/i },
  { pattern: /^JW\d/i },
  { pattern: /^TQ\d/i },
  { pattern: /^TXS\d/i },
  { pattern: /^TXD\d/i },
  { pattern: /^DS\d/i },
  { pattern: /^DK\d/i },

  // Fujitsu
  { pattern: /^FTR-F1/i, contactForm: 'SPDT' },
  { pattern: /^FTR-B3/i, contactForm: 'SPST-NO' },
  { pattern: /^FBR\d/i },

  // Hongfa
  { pattern: /^HF115F/i, contactForm: 'SPDT' },
  { pattern: /^HF32F/i, contactForm: 'SPST-NO' },
  { pattern: /^HF3F/i },
  { pattern: /^HF41F/i, contactForm: 'SPDT' },
  { pattern: /^HF46F/i, contactForm: 'DPDT' },

  // Songle / generic PCB relays
  { pattern: /^SRD-\d+VDC/i },
  { pattern: /^SRS-\d+VDC/i },

  // Zettler
  { pattern: /^AZ742/i, contactForm: 'SPDT' },
  { pattern: /^AZ764/i, contactForm: 'SPDT' },
  { pattern: /^AZ943/i, contactForm: 'SPDT' },

  // Chinese generic PCB relays
  { pattern: /^JQX/i },
  { pattern: /^JZC/i },

  // Potter & Brumfield (TE)
  { pattern: /^RY\d/i },
];

/**
 * Enrich relay attributes from MPN patterns.
 * Primary enrichment: coil_voltage_vdc from MPN suffix (most critical).
 * Secondary: contact_form from series model, mounting_type inference.
 */
function enrichRelayAttributes(attrs: PartAttributes): void {
  const mpn = attrs.part.mpn;
  const desc = attrs.part.description.toLowerCase();

  // Guard: Solid-state relays are NOT F1 EMRs
  if (desc.includes('solid state') || desc.includes('ssr')) {
    console.warn(`[F1] MPN ${mpn} appears to be a solid-state relay, not F1 EMR`);
    return;
  }

  const paramMap = new Map(attrs.parameters.map(p => [p.parameterId, p]));

  // Try MPN prefix patterns for contact_form
  for (const hint of relayMpnPatterns) {
    if (!hint.pattern.test(mpn)) continue;

    // SSR redirect guard
    if (hint.isSSR) {
      console.warn(`[F1] MPN ${mpn} matched SSR pattern — should be F2 (not yet implemented)`);
      return;
    }

    // Enrich contact_form if not already present
    if (hint.contactForm && !paramMap.has('contact_form')) {
      attrs.parameters.push({
        parameterId: 'contact_form',
        parameterName: 'Contact Form',
        value: hint.contactForm,
        sortOrder: 0, source: 'mpn_enrichment',
      });
    }

    break; // First match wins
  }

  // Coil voltage from MPN suffix — the most critical enrichment
  // Patterns: -12VDC, -DC12, -12, -012, DC12
  if (!paramMap.has('coil_voltage_vdc') && !attrs.parameters.find(p => p.parameterId === 'coil_voltage_vdc')) {
    const voltageMatch = mpn.match(
      /(?:[-_](\d{1,3})VDC|[-_]DC(\d{1,3})|[-_]0*(\d{1,3})(?:[-_]|$))\b/i
    );
    if (voltageMatch) {
      const volts = voltageMatch[1] || voltageMatch[2] || voltageMatch[3];
      const v = parseInt(volts, 10);
      // Only enrich for standard relay coil voltages
      if ([3, 5, 6, 9, 12, 24, 48, 110].includes(v)) {
        attrs.parameters.push({
          parameterId: 'coil_voltage_vdc',
          parameterName: 'Coil Voltage (VDC)',
          value: `${v}V`,
          numericValue: v,
          unit: 'V',
          sortOrder: 0, source: 'mpn_enrichment',
        });
      }
    }
  }
}

/**
 * Post-scoring filter for F1 relays — removes confirmed
 * contact_form, coil_voltage_vdc, and contact_count mismatches.
 * These are BLOCKING identity gates that must match exactly.
 */
function filterRelayMismatches(
  recs: XrefRecommendation[],
  sourceAttrs: PartAttributes,
): XrefRecommendation[] {
  const srcContactForm = sourceAttrs.parameters.find(p => p.parameterId === 'contact_form')?.value?.toLowerCase();
  const srcCoilVoltage = sourceAttrs.parameters.find(p => p.parameterId === 'coil_voltage_vdc')?.numericValue;
  const srcContactCount = sourceAttrs.parameters.find(p => p.parameterId === 'contact_count')?.value?.toLowerCase();

  return recs.filter(rec => {
    // Block contact_form mismatch (SPST-NO ≠ SPST-NC ≠ SPDT ≠ DPST ≠ DPDT)
    if (srcContactForm) {
      const candForm = rec.matchDetails?.find(d => d.parameterId === 'contact_form');
      if (candForm?.replacementValue) {
        const candVal = candForm.replacementValue.toLowerCase();
        if (srcContactForm !== candVal) return false;
      }
    }

    // Block coil_voltage_vdc mismatch (exact identity — NOT a threshold)
    if (srcCoilVoltage !== undefined) {
      const candVoltage = rec.matchDetails?.find(d => d.parameterId === 'coil_voltage_vdc');
      if (candVoltage?.replacementValue) {
        const candV = parseFloat(candVoltage.replacementValue);
        if (!isNaN(candV) && Math.abs(candV - srcCoilVoltage) > 0.5) return false;
      }
    }

    // Block contact_count mismatch (1P ≠ 2P ≠ 3P ≠ 4P)
    if (srcContactCount) {
      const candCount = rec.matchDetails?.find(d => d.parameterId === 'contact_count');
      if (candCount?.replacementValue) {
        const candVal = candCount.replacementValue.toLowerCase();
        const srcNum = srcContactCount.match(/\d+/)?.[0];
        const candNum = candVal.match(/\d+/)?.[0];
        if (srcNum && candNum && srcNum !== candNum) return false;
      }
    }

    return true;
  });
}

// ── F2: Solid State Relays — MPN enrichment patterns ───────────────────

/** SSR MPN prefix patterns for enriching output_switch_type, firing_mode, and load_voltage_type */
const ssrMpnPatterns: { pattern: RegExp; outputSwitchType?: string; firingMode?: string; loadVoltageType?: string; isEMR?: boolean; isDiscrete?: boolean }[] = [
  // EMR redirect guards — these are NOT F2 SSRs, they are F1 EMRs
  { pattern: /^G5LE/i, isEMR: true },
  { pattern: /^G2R/i, isEMR: true },
  { pattern: /^G2RL/i, isEMR: true },
  { pattern: /^V23084/i, isEMR: true },
  { pattern: /^V23092/i, isEMR: true },
  { pattern: /^HF115F/i, isEMR: true },
  { pattern: /^SRD-/i, isEMR: true },
  { pattern: /^G5Q/i, isEMR: true },
  { pattern: /^G5V/i, isEMR: true },
  { pattern: /^G6K/i, isEMR: true },
  { pattern: /^JS\d/i, isEMR: true },
  { pattern: /^JW\d/i, isEMR: true },
  { pattern: /^FTR/i, isEMR: true },

  // Discrete TRIAC/SCR redirect guards — NOT SSRs
  { pattern: /^BT13[6-9]/i, isDiscrete: true },
  { pattern: /^BT14[0-9]/i, isDiscrete: true },
  { pattern: /^TIC2\d{2}/i, isDiscrete: true },
  { pattern: /^MAC\d/i, isDiscrete: true },
  { pattern: /^BCR\d/i, isDiscrete: true },

  // Crydom / Sensata — DC MOSFET output
  { pattern: /^D24\d/i, outputSwitchType: 'MOSFET', loadVoltageType: 'DC' },
  { pattern: /^D48\d/i, outputSwitchType: 'MOSFET', loadVoltageType: 'DC' },
  { pattern: /^D12\d/i, outputSwitchType: 'MOSFET', loadVoltageType: 'DC' },
  { pattern: /^DC\d{2}/i, outputSwitchType: 'MOSFET', loadVoltageType: 'DC' },
  // Crydom / Sensata — AC TRIAC output
  { pattern: /^CMX\d/i, outputSwitchType: 'TRIAC', loadVoltageType: 'AC' },
  { pattern: /^CX\d{3}/i, outputSwitchType: 'TRIAC', loadVoltageType: 'AC' },
  { pattern: /^HD\d{4}/i, outputSwitchType: 'TRIAC', loadVoltageType: 'AC' },
  { pattern: /^EZ\d/i, outputSwitchType: 'TRIAC', loadVoltageType: 'AC', firingMode: 'Zero-Crossing' },
  { pattern: /^EZD\d/i, outputSwitchType: 'MOSFET', loadVoltageType: 'DC', firingMode: 'Zero-Crossing' },

  // Omron — AC SSRs (TRIAC output, zero-crossing default)
  { pattern: /^G3NA/i, outputSwitchType: 'TRIAC', loadVoltageType: 'AC', firingMode: 'Zero-Crossing' },
  { pattern: /^G3NB/i, outputSwitchType: 'TRIAC', loadVoltageType: 'AC', firingMode: 'Zero-Crossing' },
  { pattern: /^G3MC/i, outputSwitchType: 'TRIAC', loadVoltageType: 'AC' },
  { pattern: /^G3PA/i, outputSwitchType: 'TRIAC', loadVoltageType: 'AC' },
  { pattern: /^G3PE/i, outputSwitchType: 'TRIAC', loadVoltageType: 'AC' },
  { pattern: /^G3MB/i, outputSwitchType: 'TRIAC', loadVoltageType: 'AC' },

  // Carlo Gavazzi — AC (RA/RZ) and DC (RD/RP)
  { pattern: /^RA\d/i, outputSwitchType: 'TRIAC', loadVoltageType: 'AC' },
  { pattern: /^RZ\d/i, outputSwitchType: 'TRIAC', loadVoltageType: 'AC', firingMode: 'Zero-Crossing' },
  { pattern: /^RD\d/i, outputSwitchType: 'MOSFET', loadVoltageType: 'DC' },
  { pattern: /^RP\d/i, outputSwitchType: 'MOSFET', loadVoltageType: 'DC' },

  // Schneider Electric
  { pattern: /^SSM\d/i },

  // Kyotto
  { pattern: /^KSI/i, outputSwitchType: 'TRIAC', loadVoltageType: 'AC' },
  { pattern: /^KSR/i, outputSwitchType: 'TRIAC', loadVoltageType: 'AC', firingMode: 'Random-Fire' },
  { pattern: /^KSD/i, outputSwitchType: 'MOSFET', loadVoltageType: 'DC' },

  // TE Connectivity
  { pattern: /^TD\d/i },

  // Generic / Chinese panel SSRs
  { pattern: /^MGR/i },
  { pattern: /^SAP/i },

  // Littelfuse
  { pattern: /^RSSR/i },
  { pattern: /^MSSR/i },
];

/**
 * Enrich solid state relay attributes from MPN patterns.
 * Primary enrichment: output_switch_type (TRIAC vs MOSFET) from MPN prefix.
 * Secondary: firing_mode (Zero-Crossing vs Random-Fire), load_voltage_type (AC vs DC).
 */
function enrichSolidStateRelayAttributes(attrs: PartAttributes): void {
  const mpn = attrs.part.mpn;
  const desc = attrs.part.description.toLowerCase();
  const paramMap = new Map(attrs.parameters.map(p => [p.parameterId, p]));

  // Try MPN prefix patterns
  for (const hint of ssrMpnPatterns) {
    if (!hint.pattern.test(mpn)) continue;

    // EMR redirect guard
    if (hint.isEMR) {
      console.warn(`[F2] MPN ${mpn} matched EMR pattern — should be F1`);
      return;
    }

    // Discrete semiconductor redirect guard
    if (hint.isDiscrete) {
      console.warn(`[F2] MPN ${mpn} matched discrete TRIAC/SCR pattern — not an SSR (Family B8)`);
      return;
    }

    // Enrich output_switch_type
    if (hint.outputSwitchType && !paramMap.has('output_switch_type')) {
      attrs.parameters.push({
        parameterId: 'output_switch_type',
        parameterName: 'Output Switch Type',
        value: hint.outputSwitchType,
        sortOrder: 0, source: 'mpn_enrichment',
      });
    }

    // Enrich firing_mode
    if (hint.firingMode && !paramMap.has('firing_mode')) {
      attrs.parameters.push({
        parameterId: 'firing_mode',
        parameterName: 'Firing Mode',
        value: hint.firingMode,
        sortOrder: 0, source: 'mpn_enrichment',
      });
    }

    // Enrich load_voltage_type
    if (hint.loadVoltageType && !paramMap.has('load_voltage_type')) {
      attrs.parameters.push({
        parameterId: 'load_voltage_type',
        parameterName: 'Load Voltage Type',
        value: hint.loadVoltageType,
        sortOrder: 0, source: 'mpn_enrichment',
      });
    }

    break; // First match wins
  }

  // Infer output type from description if not enriched from MPN
  if (!paramMap.has('output_switch_type') && !attrs.parameters.find(p => p.parameterId === 'output_switch_type')) {
    if (desc.includes('triac') || desc.includes('scr output')) {
      attrs.parameters.push({
        parameterId: 'output_switch_type',
        parameterName: 'Output Switch Type',
        value: 'TRIAC',
        sortOrder: 0, source: 'mpn_enrichment',
      });
    } else if (desc.includes('mosfet') || (desc.includes('dc') && desc.includes('solid state'))) {
      attrs.parameters.push({
        parameterId: 'output_switch_type',
        parameterName: 'Output Switch Type',
        value: 'MOSFET',
        sortOrder: 0, source: 'mpn_enrichment',
      });
    }
  }

  // Infer firing mode from description if not enriched
  if (!paramMap.has('firing_mode') && !attrs.parameters.find(p => p.parameterId === 'firing_mode')) {
    if (desc.includes('zero cross') || desc.includes('zero-cross') || desc.includes('zc')) {
      attrs.parameters.push({
        parameterId: 'firing_mode',
        parameterName: 'Firing Mode',
        value: 'Zero-Crossing',
        sortOrder: 0, source: 'mpn_enrichment',
      });
    } else if (desc.includes('random') || desc.includes('instant on') || desc.includes('phase angle')) {
      attrs.parameters.push({
        parameterId: 'firing_mode',
        parameterName: 'Firing Mode',
        value: 'Random-Fire',
        sortOrder: 0, source: 'mpn_enrichment',
      });
    }
  }
}

/**
 * Post-scoring filter for F2 solid state relays — removes confirmed
 * output_switch_type and mounting_type mismatches.
 * These are BLOCKING identity gates that must match exactly.
 */
function filterSolidStateRelayMismatches(
  recs: XrefRecommendation[],
  sourceAttrs: PartAttributes,
): XrefRecommendation[] {
  const srcOutputType = sourceAttrs.parameters.find(p => p.parameterId === 'output_switch_type')?.value?.toLowerCase();
  const srcMounting = sourceAttrs.parameters.find(p => p.parameterId === 'mounting_type')?.value?.toLowerCase();

  return recs.filter(rec => {
    // Block output_switch_type mismatch (TRIAC ≠ MOSFET ≠ SCR)
    if (srcOutputType) {
      const candType = rec.matchDetails?.find(d => d.parameterId === 'output_switch_type');
      if (candType?.replacementValue) {
        const candVal = candType.replacementValue.toLowerCase();
        if (srcOutputType !== candVal) return false;
      }
    }

    // Block mounting_type mismatch (PCB ≠ DIN-rail ≠ Panel)
    if (srcMounting) {
      const candMount = rec.matchDetails?.find(d => d.parameterId === 'mounting_type');
      if (candMount?.replacementValue) {
        const candVal = candMount.replacementValue.toLowerCase();
        if (srcMounting !== candVal) return false;
      }
    }

    return true;
  });
}
