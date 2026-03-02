/**
 * Part Data Service — Unified data layer
 *
 * Tries Digikey API first, falls back to mock data.
 * All functions are async and server-side only.
 */

import { SearchResult, PartAttributes, XrefRecommendation, ApplicationContext, RecommendationResult } from '../types';
import { keywordSearch, getProductDetails } from './digikeyClient';
import {
  mapKeywordResponseToSearchResult,
  mapDigikeyProductToAttributes,
} from './digikeyMapper';
import { mockSearch, mockGetAttributes } from '../mockSearchService';
import { mockGetRecommendations } from '../mockXrefService';
import { getLogicTableForSubcategory, enrichRectifierAttributes } from '../logicTables';
import { findReplacements } from './matchingEngine';
import { getContextQuestionsForFamily } from '../contextQuestions';
import { applyContextToLogicTable } from './contextModifier';

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
  if (!isDigikeyConfigured()) {
    return mockSearch(query);
  }

  try {
    const response = await keywordSearch(query, { limit: 10 }, currency);
    const result = mapKeywordResponseToSearchResult(response);

    // If Digikey returned nothing, try mock as fallback
    if (result.type === 'none') {
      const mockResult = mockSearch(query);
      if (mockResult.type !== 'none') return mockResult;
    }

    return result;
  } catch (error) {
    console.warn('Digikey search failed, falling back to mock:', error);
    return mockSearch(query);
  }
}

// ============================================================
// ATTRIBUTES
// ============================================================

export async function getAttributes(mpn: string, currency?: string): Promise<PartAttributes | null> {
  // Always check mock first for instant results on known parts
  const mockAttrs = mockGetAttributes(mpn);

  if (!isDigikeyConfigured()) {
    return mockAttrs ? { ...mockAttrs, dataSource: 'mock' as const } : null;
  }

  try {
    const response = await getProductDetails(mpn, currency);
    if (response.Product) {
      const attrs = mapDigikeyProductToAttributes(response.Product);
      return { ...attrs, dataSource: 'digikey' as const };
    }
    return mockAttrs ? { ...mockAttrs, dataSource: 'mock' as const } : null;
  } catch (error) {
    console.warn('Digikey product details failed, falling back to mock:', error);
    return mockAttrs ? { ...mockAttrs, dataSource: 'mock' as const } : null;
  }
}

// ============================================================
// RECOMMENDATIONS (cross-reference)
// ============================================================

export async function getRecommendations(
  mpn: string,
  attributeOverrides?: Record<string, string>,
  applicationContext?: ApplicationContext,
  currency?: string,
): Promise<RecommendationResult> {
  // Step 1: Get source part attributes
  const sourceAttrs = await getAttributes(mpn, currency);
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

  // Step 2: Check if this family has a logic table (classifier detects variants)
  const logicTable = logicTablePrecheck;

  // No logic table → fall back to hardcoded mock recommendations
  if (!logicTable) {
    const recs = mockGetRecommendations(mpn);
    return { recommendations: recs, sourceAttributes: sourceAttrs, dataSource };
  }

  const familyId = logicTable.familyId;
  const familyName = logicTable.familyName;

  // Step 2b: Apply application context to modify logic table weights/rules
  let effectiveTable = logicTable;
  if (applicationContext) {
    const familyConfig = getContextQuestionsForFamily(logicTable.familyId);
    if (familyConfig) {
      effectiveTable = applyContextToLogicTable(logicTable, applicationContext, familyConfig);
    }
  }

  // Step 3: Try to get candidates from Digikey
  if (isDigikeyConfigured()) {
    try {
      const candidates = await fetchDigikeyCandidates(sourceAttrs, currency);
      if (candidates.length > 0) {
        let recs = findReplacements(effectiveTable, sourceAttrs, candidates);

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

        return { recommendations: recs, sourceAttributes: sourceAttrs, familyId, familyName, dataSource: 'digikey' };
      }
    } catch (error) {
      console.warn('Digikey candidate search failed, falling back to mock:', error);
    }
  }

  // Step 4: Fall back to mock candidates + matching engine
  const recs = mockGetRecommendations(mpn);
  return { recommendations: recs, sourceAttributes: sourceAttrs, familyId, familyName, dataSource };
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
    { limit: 30, categoryId: sourceAttrs.part.digikeyCategoryId },
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
    candidates.push(mapDigikeyProductToAttributes(product));
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
