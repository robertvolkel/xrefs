import {
  isStarrableRow,
  prepareBatchItems,
  normalizeBatchParamName,
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
