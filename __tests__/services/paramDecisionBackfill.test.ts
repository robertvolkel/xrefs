import {
  classifyOverrideRows,
  parseBatchId,
  decisionForNoteRow,
  decisionForInvestigationAction,
  type OverrideRow,
} from '@/lib/services/paramDecisionBackfill';

const row = (o: Partial<OverrideRow> & { id: string; created_at: string; is_active: boolean }): OverrideRow => ({
  param_name: 'vr(v)',
  family_id: 'B1',
  attribute_id: 'vrrm',
  attribute_name: 'Repetitive Peak Reverse Voltage',
  change_reason: null,
  created_by: 'user-1',
  ...o,
});

/**
 * THE HIGHEST-RISK BACKFILL LOGIC.
 *
 * The plan's first draft said "every deactivated override is a revoke".
 * Measured against live data that was wrong: 209 of 218 deactivated rows had
 * been superseded by a newer active row (an EDIT); only 9 were genuinely
 * revoked. Backfilling the naive way would have opened the Decision Log
 * announcing 218 revocations that never happened — fabricated history, in the
 * very feature built to stop fabricated history.
 *
 * These tests fail against that naive implementation. That is their purpose.
 */
describe('backfill: deactivated override — edit vs revoke', () => {
  it('a deactivated row WITH a newer active row on the same key is an EDIT', () => {
    const { counts, decisions } = classifyOverrideRows([
      row({ id: 'old', created_at: '2026-05-01T09:00:00Z', is_active: false }),
      row({ id: 'new', created_at: '2026-05-01T10:00:00Z', is_active: true, attribute_id: 'vrwm' }),
    ]);

    expect(counts.edited).toBe(1);
    expect(counts.revoked).toBe(0); // naive impl reports 1 here → red

    const ending = decisions.find((d) => d.decision === 'mapping_edited');
    expect(ending).toBeTruthy();
    // Dated when the change actually happened — the successor's creation —
    // not when the old row happened to be created.
    expect(ending!.decidedAt).toBe('2026-05-01T10:00:00Z');
    expect(ending!.attributeId).toBe('vrwm');
  });

  it('a deactivated row with NOTHING replacing it is a REVOKE', () => {
    const { counts } = classifyOverrideRows([
      row({ id: 'dead', created_at: '2026-05-01T09:00:00Z', is_active: false }),
    ]);
    expect(counts.revoked).toBe(1);
    expect(counts.edited).toBe(0);
  });

  it('separates the two within one mixed set (the live-data shape)', () => {
    const { counts } = classifyOverrideRows([
      // param A: superseded → edit
      row({ id: 'a-old', param_name: 'a', created_at: '2026-05-01T09:00:00Z', is_active: false }),
      row({ id: 'a-new', param_name: 'a', created_at: '2026-05-01T10:00:00Z', is_active: true }),
      // param B: revoked outright
      row({ id: 'b-dead', param_name: 'b', created_at: '2026-05-01T09:00:00Z', is_active: false }),
      // param C: still live, never ended
      row({ id: 'c-live', param_name: 'c', created_at: '2026-05-01T09:00:00Z', is_active: true }),
    ]);

    expect(counts.accepted).toBe(4); // one creation per row, always
    expect(counts.edited).toBe(1);
    expect(counts.revoked).toBe(1);
    // Naive impl: edited=0, revoked=2 → both assertions above go red.
  });

  it('does not treat an active row on a DIFFERENT family as a replacement', () => {
    // Same param name, different family = a different mapping entirely.
    // Ignoring family here would silently downgrade real revokes to edits.
    const { counts } = classifyOverrideRows([
      row({ id: 'b1-dead', family_id: 'B1', created_at: '2026-05-01T09:00:00Z', is_active: false }),
      row({ id: 'b4-live', family_id: 'B4', created_at: '2026-05-01T10:00:00Z', is_active: true }),
    ]);
    expect(counts.revoked).toBe(1);
    expect(counts.edited).toBe(0);
  });

  it('matches keys across NFC/NFD and case, like the runtime helper', () => {
    const { counts } = classifyOverrideRows([
      row({ id: 'old', param_name: '耐压'.normalize('NFD'), created_at: '2026-05-01T09:00:00Z', is_active: false }),
      row({ id: 'new', param_name: '耐压'.normalize('NFC'), created_at: '2026-05-01T10:00:00Z', is_active: true }),
    ]);
    // If the key didn't normalize, these would look like two unrelated params
    // and the dead one would be misreported as a revoke.
    expect(counts.edited).toBe(1);
    expect(counts.revoked).toBe(0);
  });

  it('every row yields its creation decision regardless of later fate', () => {
    const { decisions } = classifyOverrideRows([
      row({ id: 'x', created_at: '2026-05-01T09:00:00Z', is_active: false }),
    ]);
    const created = decisions.filter((d) => d.decision === 'mapping_accepted');
    expect(created).toHaveLength(1);
    expect(created[0].decidedAt).toBe('2026-05-01T09:00:00Z');
    expect(created[0].decidedBy).toBe('user-1');
  });
});

describe('backfill: batch id parsing', () => {
  it('extracts the uuid from a real change_reason', () => {
    expect(
      parseBatchId('Batch-accepted (AI high-confidence) [batch:c5bfc8bd-fd11-488e-adb7-047a9d91d465]'),
    ).toBe('c5bfc8bd-fd11-488e-adb7-047a9d91d465');
  });

  it('returns null for a non-batch reason', () => {
    expect(parseBatchId('AI-assisted ingest triage (L3 family: B1, confidence: high)')).toBeNull();
    expect(parseBatchId(null)).toBeNull();
  });
});

describe('backfill: status and action mapping', () => {
  it('maps note statuses to their own decision', () => {
    expect(decisionForNoteRow('deferred', null)).toBe('deferred');
    expect(decisionForNoteRow('unmappable', null)).toBe('marked_unmappable');
    expect(decisionForNoteRow('wrong_family', null)).toBe('flagged_wrong_family');
    expect(decisionForNoteRow('confirmed_in_family', null)).toBe('confirmed_in_family');
  });

  it('treats a note with no status as note_added, and an empty row as nothing', () => {
    expect(decisionForNoteRow(null, 'looks like a test condition')).toBe('note_added');
    expect(decisionForNoteRow(null, '   ')).toBeNull();
    expect(decisionForNoteRow(null, null)).toBeNull();
  });

  it('does not invent a decision for a dismissed investigation', () => {
    // "Looked and moved on" is not a decision about the parameter.
    expect(decisionForInvestigationAction('dismissed')).toBeNull();
    expect(decisionForInvestigationAction('override_created')).toBe('mapping_accepted');
  });
});
