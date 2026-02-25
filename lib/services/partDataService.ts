/**
 * Part Data Service — Unified data layer
 *
 * Tries Digikey API first, falls back to mock data.
 * All functions are async and server-side only.
 */

import { SearchResult, PartAttributes, ApplicationContext, RecommendationResult } from '../types';
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
        const recs = findReplacements(effectiveTable, sourceAttrs, candidates);
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
                  paramMap.get('vrrm') ?? paramMap.get('vceo_max');
  if (voltage) {
    const vMatch = voltage.value.match(/(\d+)\s*V/i);
    if (vMatch) parts.push(`${vMatch[1]}V`);
  }

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
