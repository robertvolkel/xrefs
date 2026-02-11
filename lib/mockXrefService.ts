import { XrefRecommendation, PartAttributes } from './types';
import { recommendationsDatabase, attributesDatabase, mlccCandidates } from './mockData';
import { getLogicTableForSubcategory } from './logicTables';
import { findReplacements } from './services/matchingEngine';

/**
 * Get cross-reference recommendations for a part.
 *
 * For MLCC parts: uses the real matching engine with logic table rules.
 * For other families: falls back to hardcoded recommendations.
 */
export function mockGetRecommendations(mpn: string): XrefRecommendation[] {
  const sourceAttrs = attributesDatabase[mpn];
  if (!sourceAttrs) return [];

  // Check if this part's family has a logic table
  const logicTable = getLogicTableForSubcategory(sourceAttrs.part.subcategory);

  if (logicTable) {
    // Use the real matching engine
    const candidates = getCandidatesForFamily(sourceAttrs.part.subcategory);
    return findReplacements(logicTable, sourceAttrs, candidates);
  }

  // Fall back to hardcoded recommendations
  return recommendationsDatabase[mpn] ?? [];
}

/** Get candidate parts for a given family/subcategory */
function getCandidatesForFamily(subcategory: string): PartAttributes[] {
  switch (subcategory) {
    case 'MLCC':
    case 'Ceramic':
    case 'Multilayer Ceramic':
      return mlccCandidates;
    default:
      return [];
  }
}
