/**
 * Murata MLCC qualification-domain classifier.
 *
 * Murata publishes an application-suitability matrix per MLCC series. This
 * classifier maps the MPN prefix (first ~3 characters) to the part's
 * qualification domain.
 *
 * Source: Murata's own product documentation + application-suitability matrix.
 * https://www.murata.com/products/capacitor/ceramiccapacitor/mlcc
 *
 * Notes for future editors:
 *   - Only POSITIVE classifications are encoded. If a series isn't listed
 *     here, return `{ domain: 'unknown' }` — the caller handles the asymmetry
 *     (aec_q200 = false never downgrades to commercial).
 *   - Murata MLCC prefixes are generally 3 letters (GRM, GCM, GCJ, GRT, GCH,
 *     GJM, GCG, GMC, KGM, etc.). Order matters in the match below: more
 *     specific prefixes must come first to avoid false-positive routing via
 *     a shorter shared prefix.
 *   - This is Murata MLCCs *only*. Murata's board-mount inductors (LQM,
 *     LQW) or EMI filters use separate MPN spaces and are NOT in scope.
 */

import type { Part, DomainClassification } from '@/lib/types';
import type { MfrClassifier } from '../qualificationDomain';

interface SeriesEntry {
  /** Prefix at the start of the MPN. Case-insensitive. */
  prefix: string;
  domain: DomainClassification['domain'];
  evidence: string;
  confidence: DomainClassification['confidence'];
}

// Order: longest/most-specific prefixes first. `GCJ` must precede `GC` etc.
const SERIES: SeriesEntry[] = [
  // Automotive AEC-Q200
  { prefix: 'GCM', domain: 'automotive_q200', confidence: 'high',
    evidence: 'Murata GCM series — AEC-Q200 automotive (powertrain/safety)' },
  { prefix: 'GCJ', domain: 'automotive_q200', confidence: 'high',
    evidence: 'Murata GCJ series — AEC-Q200 automotive with soft termination' },
  { prefix: 'GRT', domain: 'automotive_q200', confidence: 'high',
    evidence: 'Murata GRT series — AEC-Q200 automotive (infotainment/body)' },
  { prefix: 'KGM', domain: 'automotive_q200', confidence: 'high',
    evidence: 'Murata KGM series — AEC-Q200 automotive' },
  { prefix: 'KCM', domain: 'automotive_q200', confidence: 'high',
    evidence: 'Murata KCM series — AEC-Q200 automotive' },
  // Medical — implantable (GHTF Class D)
  { prefix: 'GCH', domain: 'medical_implant', confidence: 'high',
    evidence: 'Murata GCH series — implantable medical device (GHTF Class D)' },
  // Commercial (general-purpose)
  { prefix: 'GRM', domain: 'commercial', confidence: 'high',
    evidence: 'Murata GRM series — general-purpose commercial MLCC' },
  { prefix: 'GMC', domain: 'commercial', confidence: 'high',
    evidence: 'Murata GMC series — general-purpose commercial MLCC' },
  // Mil-spec / hi-rel
  { prefix: 'GJM', domain: 'mil_spec', confidence: 'medium',
    evidence: 'Murata GJM series — high-reliability / military-adjacent' },
];

function isMurata(mfr: string): boolean {
  const normalized = mfr.trim().toLowerCase();
  return (
    normalized === 'murata' ||
    normalized.startsWith('murata ') ||
    normalized.includes('murata electronics') ||
    normalized.includes('murata manufacturing')
  );
}

/**
 * Known MLCC series prefixes — used both to route classification AND as the
 * proof that a part is an MLCC (vs. a Murata inductor/filter/etc.). Murata's
 * MLCC prefixes don't collide with their inductor prefixes (LQH/LQM/LQW/LQG),
 * EMI filter prefixes (NFM/BLM/DLW), or resonator prefixes (CST*), so a prefix
 * match is authoritative without needing to consult the category field. This
 * matters because parts.io candidates arrive with `subcategory` but no
 * `category`, and Atlas sometimes uses different taxonomy strings.
 */

function isLikelyMlccFromCategory(part: Part): boolean {
  // Used as a secondary allow-path only when no SERIES prefix matches.
  if (part.category === 'Capacitors') return true;
  const sub = (part.subcategory ?? '').toLowerCase();
  return sub.includes('ceramic') || sub.includes('mlcc') || sub.includes('capacitor');
}

export const murataMlccClassifier: MfrClassifier = {
  manufacturerPatterns: [/^murata/i],

  classify(part: Part): DomainClassification | null {
    if (!isMurata(part.manufacturer ?? '')) return null;

    const mpn = (part.mpn ?? '').toUpperCase();
    if (!mpn) return null; // no signal at all → let caller fall through

    // Authoritative path: MPN prefix match. Murata MLCC prefixes are
    // distinct from the rest of the Murata MPN space, so a prefix match
    // confirms both "this is an MLCC" AND "here is the domain."
    for (const entry of SERIES) {
      if (mpn.startsWith(entry.prefix)) {
        return {
          domain: entry.domain,
          confidence: entry.confidence,
          source: 'mpn_prefix',
          evidence: entry.evidence,
        };
      }
    }

    // No prefix match. Only emit `ambiguous_series` (as opposed to letting
    // the caller try the next classifier / attribute-flag upgrade) if we're
    // reasonably sure this IS an MLCC — otherwise a Murata inductor would
    // get flagged "ambiguous MLCC series" which is wrong.
    if (!isLikelyMlccFromCategory(part)) return null;

    return {
      domain: 'unknown',
      confidence: 'low',
      source: 'mpn_prefix',
      reason: 'ambiguous_series',
    };
  },
};
