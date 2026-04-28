/**
 * Tests for the qualification-domain filter (Decision #155).
 *
 * Covers:
 *   - Murata MLCC MPN-prefix classifier (GRM/GCM/GCJ/GRT/GCH/GJM/KGM).
 *   - Asymmetric aec_q200 attribute upgrade (positive upgrades, negative stays unknown).
 *   - Cross-domain exclusion matrix for the automotive row.
 *   - Non-Murata MFRs → unknown / no_classifier (ambiguous vs missing distinction).
 */

import type { Part } from '@/lib/types';
import {
  classifyQualificationDomain,
  upgradeFromAttributes,
  isDomainCompatible,
  contextExpectedDomains,
} from '@/lib/services/qualificationDomain';
import { murataMlccClassifier } from '@/lib/services/classifiers/murataMlcc';

function mlccPart(overrides: Partial<Part> = {}): Part {
  return {
    mpn: 'GRM188R71E104KA01D',
    manufacturer: 'Murata Electronics',
    description: '',
    detailedDescription: '',
    category: 'Capacitors',
    subcategory: 'Ceramic Capacitors - MLCC',
    status: 'Active',
    ...overrides,
  };
}

describe('Murata MLCC classifier', () => {
  test('GRM series → commercial', () => {
    const result = murataMlccClassifier.classify(mlccPart({ mpn: 'GRM188R71E104KA01D' }));
    expect(result?.domain).toBe('commercial');
    expect(result?.source).toBe('mpn_prefix');
  });

  test('GCM series → automotive_q200', () => {
    const result = murataMlccClassifier.classify(mlccPart({ mpn: 'GCM155R71C104KA55D' }));
    expect(result?.domain).toBe('automotive_q200');
    expect(result?.confidence).toBe('high');
  });

  test('GCJ series → automotive_q200 (soft termination)', () => {
    const result = murataMlccClassifier.classify(mlccPart({ mpn: 'GCJ188R71E104KA12D' }));
    expect(result?.domain).toBe('automotive_q200');
    expect(result?.evidence).toMatch(/soft termination/i);
  });

  test('GRT series → automotive_q200', () => {
    const result = murataMlccClassifier.classify(mlccPart({ mpn: 'GRT188R71E104KA01J' }));
    expect(result?.domain).toBe('automotive_q200');
  });

  test('GCH series → medical_implant', () => {
    const result = murataMlccClassifier.classify(mlccPart({ mpn: 'GCH188R71E104KE01D' }));
    expect(result?.domain).toBe('medical_implant');
    expect(result?.evidence).toMatch(/GHTF/);
  });

  test('GJM series → mil_spec', () => {
    const result = murataMlccClassifier.classify(mlccPart({ mpn: 'GJM1555C1H101JB01D' }));
    expect(result?.domain).toBe('mil_spec');
  });

  test('Unrecognized Murata MPN prefix → unknown with ambiguous_series reason', () => {
    const result = murataMlccClassifier.classify(mlccPart({ mpn: 'ZZZ188R71E104KA01D' }));
    expect(result?.domain).toBe('unknown');
    expect(result?.reason).toBe('ambiguous_series');
  });

  test('Non-Murata MFR returns null from this classifier', () => {
    const result = murataMlccClassifier.classify(mlccPart({ manufacturer: 'TDK Corporation' }));
    expect(result).toBeNull();
  });

  test('Non-MLCC Murata part returns null (e.g. inductor)', () => {
    const result = murataMlccClassifier.classify(mlccPart({
      mpn: 'LQM18PN1R0MGHD',
      subcategory: 'Fixed Inductors',
      category: 'Inductors',
    }));
    expect(result).toBeNull();
  });

  test('REGRESSION — parts.io shape (no category field, subcategory = "Capacitors") still classifies', () => {
    // fetchPartsioEquivalents in partDataService.ts constructs candidate Part
    // objects with subcategory from `eqListing.Category || eqListing.Class`
    // and NO category field at all. Before the fix, this caused GCH candidates
    // from parts.io to classify as `unknown` instead of `medical_implant` —
    // so they survived the automotive exclusion filter.
    const result = murataMlccClassifier.classify({
      mpn: 'GCH188R71E104KE01D',
      manufacturer: 'Murata Manufacturing Co Ltd',
      description: '',
      detailedDescription: '',
      // Deliberately omit `category` — matches parts.io candidate shape
      category: undefined as unknown as Part['category'],
      subcategory: 'Capacitors',
      status: 'Active',
    });
    expect(result?.domain).toBe('medical_implant');
  });

  test('REGRESSION — Murata MLCC MPN prefix wins even with unrelated category', () => {
    // Safety net: if Atlas/parts.io ever mislabels an MLCC's category string,
    // the MPN prefix is authoritative.
    const result = murataMlccClassifier.classify({
      mpn: 'GCM188R71E104KA55D',
      manufacturer: 'Murata Electronics',
      description: '',
      detailedDescription: '',
      category: 'Capacitors',
      subcategory: 'some weird string',
      status: 'Active',
    });
    expect(result?.domain).toBe('automotive_q200');
  });
});

describe('classifyQualificationDomain — registry level', () => {
  test('Known Murata MLCC routes to classifier', () => {
    const result = classifyQualificationDomain(mlccPart({ mpn: 'GCM188R71E104KA55D' }));
    expect(result.domain).toBe('automotive_q200');
  });

  test('Non-registered MFR → unknown with no_classifier reason', () => {
    const result = classifyQualificationDomain(mlccPart({ manufacturer: 'TDK Corporation' }));
    expect(result.domain).toBe('unknown');
    expect(result.reason).toBe('no_classifier');
  });

  test('Missing manufacturer → unknown with no_classifier reason', () => {
    const result = classifyQualificationDomain(mlccPart({ manufacturer: '' }));
    expect(result.domain).toBe('unknown');
    expect(result.reason).toBe('no_classifier');
  });
});

describe('upgradeFromAttributes — asymmetric aec_q200 signal', () => {
  const unknown = { domain: 'unknown' as const, confidence: 'low' as const, source: 'mpn_prefix' as const, reason: 'no_classifier' as const };

  test('aec_q200 = "Yes" upgrades unknown → automotive_q200 (medium confidence)', () => {
    const result = upgradeFromAttributes(unknown, 'Yes');
    expect(result.domain).toBe('automotive_q200');
    expect(result.confidence).toBe('medium');
    expect(result.source).toBe('attribute_flag');
  });

  test('aec_q200 = "true" (lowercase) upgrades', () => {
    const result = upgradeFromAttributes(unknown, 'true');
    expect(result.domain).toBe('automotive_q200');
  });

  test('aec_q200 = "1" upgrades', () => {
    const result = upgradeFromAttributes(unknown, '1');
    expect(result.domain).toBe('automotive_q200');
  });

  test('ASYMMETRY — aec_q200 = "No" stays unknown (does NOT downgrade)', () => {
    const result = upgradeFromAttributes(unknown, 'No');
    expect(result.domain).toBe('unknown');
    expect(result.reason).toBe('no_classifier');
  });

  test('ASYMMETRY — aec_q200 = "false" stays unknown', () => {
    const result = upgradeFromAttributes(unknown, 'false');
    expect(result.domain).toBe('unknown');
  });

  test('aec_q200 missing/empty stays unknown', () => {
    const result = upgradeFromAttributes(unknown, undefined);
    expect(result.domain).toBe('unknown');
  });

  test('Already-classified part is NOT upgraded', () => {
    const base = { domain: 'medical_implant' as const, confidence: 'high' as const, source: 'mpn_prefix' as const };
    const result = upgradeFromAttributes(base, 'Yes');
    expect(result.domain).toBe('medical_implant');
  });
});

describe('isDomainCompatible — automotive row of exclusion matrix', () => {
  const automotiveContext = { familyId: '12', answers: { environment: 'automotive' } };

  test('automotive_q200 under automotive → compatible, no deviation', () => {
    const result = isDomainCompatible(automotiveContext, 'automotive_q200');
    expect(result.compatible).toBe(true);
    expect(result.deviation).toBe(false);
  });

  test('medical_implant under automotive → HARD EXCLUDE', () => {
    const result = isDomainCompatible(automotiveContext, 'medical_implant');
    expect(result.compatible).toBe(false);
    expect(result.reason).toMatch(/cannot substitute/i);
  });

  test('medical_general under automotive → HARD EXCLUDE', () => {
    const result = isDomainCompatible(automotiveContext, 'medical_general');
    expect(result.compatible).toBe(false);
  });

  test('mil_spec under automotive → HARD EXCLUDE', () => {
    const result = isDomainCompatible(automotiveContext, 'mil_spec');
    expect(result.compatible).toBe(false);
  });

  test('space under automotive → HARD EXCLUDE', () => {
    const result = isDomainCompatible(automotiveContext, 'space');
    expect(result.compatible).toBe(false);
  });

  test('commercial under automotive → compatible with deviation flag', () => {
    const result = isDomainCompatible(automotiveContext, 'commercial');
    expect(result.compatible).toBe(true);
    expect(result.deviation).toBe(true);
    expect(result.reason).toMatch(/not AEC-Q200/i);
  });

  test('industrial_harsh under automotive → compatible with deviation flag', () => {
    const result = isDomainCompatible(automotiveContext, 'industrial_harsh');
    expect(result.compatible).toBe(true);
    expect(result.deviation).toBe(true);
  });

  test('unknown under automotive → compatible, no deviation (ranking signal only)', () => {
    const result = isDomainCompatible(automotiveContext, 'unknown');
    expect(result.compatible).toBe(true);
    expect(result.deviation).toBe(false);
  });

  test('Non-automotive context (consumer) → no gating', () => {
    const ctx = { familyId: '12', answers: { environment: 'consumer' } };
    expect(isDomainCompatible(ctx, 'medical_implant').compatible).toBe(true);
    expect(isDomainCompatible(ctx, 'automotive_q200').compatible).toBe(true);
  });

  test('Missing context → no gating', () => {
    expect(isDomainCompatible(null, 'medical_implant').compatible).toBe(true);
  });
});

describe('contextExpectedDomains', () => {
  test('Automotive context expects automotive_q100/q101/q200', () => {
    const set = contextExpectedDomains({ familyId: '12', answers: { environment: 'automotive' } });
    expect(set.has('automotive_q200')).toBe(true);
    expect(set.has('automotive_q100')).toBe(true);
    expect(set.has('automotive_q101')).toBe(true);
    expect(set.has('commercial')).toBe(false);
  });

  test('Non-automotive contexts return empty set (no gating)', () => {
    const set = contextExpectedDomains({ familyId: '12', answers: { environment: 'industrial' } });
    expect(set.size).toBe(0);
  });

  test('Null context returns empty set', () => {
    expect(contextExpectedDomains(null).size).toBe(0);
  });
});

describe('Reported bug — GCH must not survive automotive filter', () => {
  test('Murata GCH188R71E104KE01D classifies medical_implant and is hard-excluded', () => {
    const part = mlccPart({ mpn: 'GCH188R71E104KE01D', manufacturer: 'Murata Manufacturing Co Ltd' });
    const classification = classifyQualificationDomain(part);
    expect(classification.domain).toBe('medical_implant');
    const check = isDomainCompatible(
      { familyId: '12', answers: { environment: 'automotive' } },
      classification.domain,
    );
    expect(check.compatible).toBe(false);
  });

  test('Source GRM188R71E104KA01D classifies commercial (user anchor in UI)', () => {
    const part = mlccPart({ mpn: 'GRM188R71E104KA01D', manufacturer: 'Murata Electronics' });
    const classification = classifyQualificationDomain(part);
    expect(classification.domain).toBe('commercial');
  });
});
