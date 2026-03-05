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
      return { ...attrs, dataSource: 'digikey' as const };
    }
  } catch {
    console.warn('Digikey keyword search fallback also failed for', mpn);
  }

  return mockAttrs ? { ...mockAttrs, dataSource: 'mock' as const } : null;
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
      console.time('[perf] fetchDigikeyCandidates');
      const candidates = await fetchDigikeyCandidates(sourceAttrs, currency);
      console.timeEnd('[perf] fetchDigikeyCandidates');
      console.log(`[perf] candidates found: ${candidates.length}`);
      if (candidates.length > 0) {
        console.time('[perf] findReplacements (scoring)');
        let recs = findReplacements(effectiveTable, sourceAttrs, candidates, preferredManufacturers);
        console.timeEnd('[perf] findReplacements (scoring)');

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

        console.log(`[perf] getRecommendations total: ${(performance.now() - recsStart).toFixed(0)}ms`);
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
