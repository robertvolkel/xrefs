import {
  isStarrableRow,
  prepareBatchItems,
  normalizeBatchParamName,
  explanationHasCaveat,
  type StarrableRowInput,
} from '@/lib/services/triageBatchApprove';

// ── isStarrableRow ───────────────────────────────────────────────────────────

function makeRow(overrides: Partial<StarrableRowInput> = {}): StarrableRowInput {
  return {
    suggestion: {
      verdict: 'accept',
      detail: {
        confidence: 'high',
        suggestion: 'accept',
        suggestedAttributeId: 'rds_on',
        suggestedAttributeName: 'On-State Resistance',
      },
    },
    dominantFamily: 'B5',
    dominantCategory: null,
    autoFlag: undefined,
    noteStatus: null,
    acceptedOverride: undefined,
    ...overrides,
  };
}

describe('isStarrableRow', () => {
  it('stars a high-confidence accept with a writable mapping + scope', () => {
    expect(isStarrableRow(makeRow())).toBe(true);
  });

  it('accepts an L2 category scope when no family', () => {
    expect(isStarrableRow(makeRow({ dominantFamily: null, dominantCategory: 'Connectors' }))).toBe(true);
  });

  it('is case-insensitive on confidence', () => {
    expect(isStarrableRow(makeRow({
      suggestion: { verdict: 'accept', detail: { confidence: 'High', suggestion: 'accept', suggestedAttributeId: 'x', suggestedAttributeName: 'X' } },
    }))).toBe(true);
  });

  it('excludes a defer verdict', () => {
    expect(isStarrableRow(makeRow({
      suggestion: { verdict: 'defer', detail: { confidence: 'high', suggestion: 'defer', suggestedAttributeId: 'x', suggestedAttributeName: 'X' } },
    }))).toBe(false);
  });

  it('excludes medium and low confidence', () => {
    for (const confidence of ['medium', 'low']) {
      expect(isStarrableRow(makeRow({
        suggestion: { verdict: 'accept', detail: { confidence, suggestion: 'accept', suggestedAttributeId: 'x', suggestedAttributeName: 'X' } },
      }))).toBe(false);
    }
  });

  it('excludes a row with no generated suggestion detail', () => {
    expect(isStarrableRow(makeRow({ suggestion: undefined }))).toBe(false);
    expect(isStarrableRow(makeRow({ suggestion: { verdict: 'accept', detail: null } }))).toBe(false);
  });

  it('excludes a missing/blank suggested attributeId or attributeName', () => {
    expect(isStarrableRow(makeRow({
      suggestion: { verdict: 'accept', detail: { confidence: 'high', suggestion: 'accept', suggestedAttributeId: '', suggestedAttributeName: 'X' } },
    }))).toBe(false);
    expect(isStarrableRow(makeRow({
      suggestion: { verdict: 'accept', detail: { confidence: 'high', suggestion: 'accept', suggestedAttributeId: 'x', suggestedAttributeName: '   ' } },
    }))).toBe(false);
  });

  it('excludes a row with no scope (no family and no category)', () => {
    expect(isStarrableRow(makeRow({ dominantFamily: null, dominantCategory: null }))).toBe(false);
  });

  it('excludes a foreign-family auto-flagged row', () => {
    expect(isStarrableRow(makeRow({ autoFlag: { suggestedFamily: 'B6', reasoning: 'x', matchingParam: 'y' } }))).toBe(false);
  });

  it('excludes wrong_family / unmappable / deferred parked rows', () => {
    for (const noteStatus of ['wrong_family', 'unmappable', 'deferred']) {
      expect(isStarrableRow(makeRow({ noteStatus }))).toBe(false);
    }
  });

  it('excludes a row that already has an ACTIVE override', () => {
    expect(isStarrableRow(makeRow({ acceptedOverride: { isActive: true } }))).toBe(false);
  });

  it('re-stars a row whose override was reverted (inactive)', () => {
    expect(isStarrableRow(makeRow({ acceptedOverride: { isActive: false } }))).toBe(true);
  });

  it('un-stars a high-confidence row whose explanation asks for a spot-check', () => {
    const explanation = "This is a clean match to the rds_on canonical. One data-quality flag worth noting: the sample values span 1.7 mΩ to 9,500 mΩ — recommend the engineer spot-check the high-end outliers against their source MPNs to confirm unit consistency before committing.";
    expect(isStarrableRow(makeRow({
      suggestion: { verdict: 'accept', detail: { confidence: 'high', suggestion: 'accept', suggestedAttributeId: 'rds_on', suggestedAttributeName: 'On-State Resistance', explanation } },
    }))).toBe(false);
  });

  it('keeps the star on a clean high-confidence explanation with no caveat', () => {
    const explanation = "Direct token match to the previously-accepted 'avalanche_current' canonical.";
    expect(isStarrableRow(makeRow({
      suggestion: { verdict: 'accept', detail: { confidence: 'high', suggestion: 'accept', suggestedAttributeId: 'avalanche_current', suggestedAttributeName: 'Avalanche Current', explanation } },
    }))).toBe(true);
  });

  it('un-stars when the caveat is in reasoning rather than explanation', () => {
    expect(isStarrableRow(makeRow({
      suggestion: { verdict: 'accept', detail: { confidence: 'high', suggestion: 'accept', suggestedAttributeId: 'x', suggestedAttributeName: 'X', reasoning: 'Values look off — verify before accepting.' } },
    }))).toBe(false);
  });

  it('KEEPS the star when the AI says the mapping is "unambiguously" correct', () => {
    // Regression: "ambiguous" used to substring-match "unambiguously" (a
    // maximum-certainty word) and wrongly strip the star.
    const explanation = "Schema-canonical match — 'IO_Max (A)' is unambiguously the average rectified forward current (Io). The unit is amperes and the sample values are physically consistent. Safe to accept.";
    expect(isStarrableRow(makeRow({
      suggestion: { verdict: 'accept', detail: { confidence: 'high', suggestion: 'accept', suggestedAttributeId: 'io_avg', suggestedAttributeName: 'Average Rectified Forward Current', explanation } },
    }))).toBe(true);
  });
});

describe('explanationHasCaveat', () => {
  it('is false for empty / clean text', () => {
    expect(explanationHasCaveat(null, null)).toBe(false);
    expect(explanationHasCaveat('Direct token match to the canonical.', null)).toBe(false);
    expect(explanationHasCaveat('Consistent with standard datasheets; a high-confidence match.', null)).toBe(false);
  });

  it('does NOT match certainty words that contain a marker as a substring', () => {
    expect(explanationHasCaveat("this is unambiguously the correct canonical", null)).toBe(false);
    expect(explanationHasCaveat("the mapping is unambiguous and safe", null)).toBe(false);
  });

  it('does NOT count a NEGATED hedge (positive statement)', () => {
    for (const s of [
      'no ambiguity here; safe to accept',
      'no need to verify — direct match',
      'nothing to spot-check',
      'no caveats, clean mapping',
      'without any outlier concerns',
    ]) {
      expect(explanationHasCaveat(s, null)).toBe(false);
    }
  });

  it('catches genuine (non-negated) inspection / verification / data-quality hedges', () => {
    for (const s of [
      'recommend the engineer spot-check the outliers',
      'please verify the mapping before committing',
      'the values look like a possible transcription error',
      'one data-quality flag: spot-check the high-end values',
      'these numbers are worth checking against the source',
      'double-check this one',
      'recommend the engineer confirm unit consistency to confirm no typo',
    ]) {
      expect(explanationHasCaveat(s, null)).toBe(true);
    }
  });
});

// ── prepareBatchItems ────────────────────────────────────────────────────────

describe('prepareBatchItems', () => {
  it('prepares a clean item, normalizing paramName + preserving the raw', () => {
    const { prepared, skipped, deduped } = prepareBatchItems([
      { familyId: 'B5', paramName: '  Rds(ON)  ', attributeId: 'rds_on', attributeName: 'On-State Resistance', unit: 'mΩ' },
    ]);
    expect(skipped).toHaveLength(0);
    expect(deduped).toBe(0);
    expect(prepared).toHaveLength(1);
    expect(prepared[0]).toMatchObject({
      familyId: 'B5',
      rawParamName: '  Rds(ON)  ',
      paramName: 'rds(on)',
      attributeId: 'rds_on',
      attributeName: 'On-State Resistance',
      unit: 'mΩ',
    });
  });

  it('dedupes two rows that normalize to the same (family, param) key', () => {
    const { prepared, deduped } = prepareBatchItems([
      { familyId: 'B5', paramName: 'Voltage (V)', attributeId: 'v', attributeName: 'Voltage' },
      { familyId: 'B5', paramName: 'voltage (v)  ', attributeId: 'v', attributeName: 'Voltage' },
    ]);
    expect(prepared).toHaveLength(1);
    expect(deduped).toBe(1);
  });

  it('keeps same paramName under DIFFERENT families as distinct rows', () => {
    const { prepared, deduped } = prepareBatchItems([
      { familyId: 'B5', paramName: 'voltage', attributeId: 'v', attributeName: 'Voltage' },
      { familyId: 'C1', paramName: 'voltage', attributeId: 'v', attributeName: 'Voltage' },
    ]);
    expect(prepared).toHaveLength(2);
    expect(deduped).toBe(0);
  });

  it('skips rows missing a required field', () => {
    const { prepared, skipped } = prepareBatchItems([
      { familyId: 'B5', paramName: 'ok', attributeId: 'a', attributeName: 'A' },
      { familyId: '', paramName: 'x', attributeId: 'a', attributeName: 'A' },
      { familyId: 'B5', paramName: '   ', attributeId: 'a', attributeName: 'A' },
      { familyId: 'B5', paramName: 'y', attributeId: '', attributeName: 'A' },
    ]);
    expect(prepared).toHaveLength(1);
    expect(skipped).toHaveLength(3);
  });

  it('normalizeBatchParamName is NFC + lowercase + trim', () => {
    expect(normalizeBatchParamName('  ABC  ')).toBe('abc');
  });
});
