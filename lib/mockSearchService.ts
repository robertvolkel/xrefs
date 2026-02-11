import { SearchResult, PartAttributes } from './types';
import { searchIndex, attributesDatabase } from './mockData';

export function mockSearch(query: string): SearchResult {
  const normalized = query.trim().toUpperCase();

  // Try exact match first
  for (const [key, matches] of Object.entries(searchIndex)) {
    if (key.toUpperCase() === normalized) {
      return {
        type: matches.length === 1 ? 'single' : 'multiple',
        matches,
      };
    }
  }

  // Try partial match
  const partialMatches = Object.entries(searchIndex)
    .filter(([key]) => key.toUpperCase().includes(normalized) || normalized.includes(key.toUpperCase()))
    .flatMap(([, matches]) => matches);

  // Deduplicate by MPN
  const seen = new Set<string>();
  const unique = partialMatches.filter((m) => {
    if (seen.has(m.mpn)) return false;
    seen.add(m.mpn);
    return true;
  });

  if (unique.length === 0) {
    return { type: 'none', matches: [] };
  }
  if (unique.length === 1) {
    return { type: 'single', matches: unique };
  }
  return { type: 'multiple', matches: unique };
}

export function mockGetAttributes(mpn: string): PartAttributes | null {
  return attributesDatabase[mpn] ?? null;
}
