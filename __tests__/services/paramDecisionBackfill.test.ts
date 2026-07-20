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

  /**
   * REGRESSION: a param remapped several times.
   *
   * The first implementation pointed every dead row at the first ACTIVE row,
   * so v1/v2/v3 all resolved to v4 — collapsing three edits made on three
   * different days into three identical events sharing v4's timestamp. On
   * live data that produced 33 colliding keys (70 rows) and the insert was
   * rejected by the unique index. The dates were wrong too, which is worse:
   * it would have silently misdated real history.
   */
  it('a param edited three times yields three DISTINCT edits, correctly dated', () => {
    const { counts, decisions } = classifyOverrideRows([
      row({ id: 'v1', created_at: '2026-05-01T09:00:00Z', is_active: false }),
      row({ id: 'v2', created_at: '2026-05-02T09:00:00Z', is_active: false }),
      row({ id: 'v3', created_at: '2026-05-03T09:00:00Z', is_active: false }),
      row({ id: 'v4', created_at: '2026-05-04T09:00:00Z', is_active: true }),
    ]);

    expect(counts.edited).toBe(3);
    expect(counts.revoked).toBe(0);

    // Each edit is dated when it actually happened — the successor's birth.
    const editDates = decisions
      .filter((d) => d.decision === 'mapping_edited')
      .map((d) => d.decidedAt)
      .sort();
    expect(editDates).toEqual([
      '2026-05-02T09:00:00Z',
      '2026-05-03T09:00:00Z',
      '2026-05-04T09:00:00Z',
    ]);

    // And no two decisions collide on the log's unique key.
    const keys = decisions.map((d) => `${d.paramName}|${d.decision}|${d.decidedAt}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('a chain that ends dead: earlier rows are edits, the LAST is the revoke', () => {
    const { counts } = classifyOverrideRows([
      row({ id: 'v1', created_at: '2026-05-01T09:00:00Z', is_active: false }),
      row({ id: 'v2', created_at: '2026-05-02T09:00:00Z', is_active: false }),
    ]);
    // v1 was replaced by v2 (an edit); v2 had nothing after it (a revoke).
    expect(counts.edited).toBe(1);
    expect(counts.revoked).toBe(1);
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

/**
 * Review findings #1 and #6 — both produced WRONG HISTORY that the earlier
 * count-based verification could not see, because the counts were right and
 * only the dates and meanings were wrong.
 */
describe('backfill: revocations are dated when they were revoked', () => {
  it('uses updated_at, not created_at, for a revoke', () => {
    const { decisions } = classifyOverrideRows([
      row({
        id: 'dead',
        created_at: '2026-05-12T03:40:22Z',
        updated_at: '2026-05-27T17:05:44Z', // revoked 15 days later
        is_active: false,
      }),
    ]);
    const revoke = decisions.find((d) => d.decision === 'mapping_revoked')!;
    // The first version reported 2026-05-12T03:40:22Z here — the same instant
    // as the accept — so the log read "Accepted 03:40:22 -> Revoked 03:40:22"
    // for a mapping that lived 15 days.
    expect(revoke.decidedAt).toBe('2026-05-27T17:05:44Z');
    expect(revoke.approximate).toBeFalsy();
  });

  it('never dates a revoke at the same instant as its own accept', () => {
    const { decisions } = classifyOverrideRows([
      row({ id: 'dead', created_at: '2026-05-12T03:40:22Z', updated_at: '2026-05-27T17:05:44Z', is_active: false }),
    ]);
    const accept = decisions.find((d) => d.decision === 'mapping_accepted')!;
    const revoke = decisions.find((d) => d.decision === 'mapping_revoked')!;
    expect(revoke.decidedAt).not.toBe(accept.decidedAt);
    expect(new Date(revoke.decidedAt).getTime()).toBeGreaterThan(new Date(accept.decidedAt).getTime());
  });

  it('marks the date approximate when there is no updated_at to use', () => {
    const { decisions } = classifyOverrideRows([
      row({ id: 'dead', created_at: '2026-05-12T03:40:22Z', updated_at: null, is_active: false }),
    ]);
    const revoke = decisions.find((d) => d.decision === 'mapping_revoked')!;
    expect(revoke.decidedAt).toBe('2026-05-12T03:40:22Z');
    // Falling back is fine; pretending it's exact is not.
    expect(revoke.approximate).toBe(true);
  });
});

describe('backfill: one ordering for sort and successor', () => {
  it('picks the chronologically nearest successor when sub-second precision varies', () => {
    // PostgREST returns whole seconds without a fractional part. ICU collates
    // '.' before '+', so localeCompare ranks '…15+00:00' AFTER '…15.5+00:00'
    // while the instants say the opposite. A sort and a predicate that
    // disagree pick the wrong successor — misdating the edit and attaching
    // the wrong attribute and author to it.
    const { decisions } = classifyOverrideRows([
      row({ id: 'a', created_at: '2026-05-06T07:03:14+00:00', is_active: false }),
      row({ id: 'b', created_at: '2026-05-06T07:03:15+00:00', is_active: false, attribute_id: 'correct' }),
      row({ id: 'c', created_at: '2026-05-06T07:03:15.5+00:00', is_active: true, attribute_id: 'later' }),
    ]);
    const editOfA = decisions.find(
      (d) => d.decision === 'mapping_edited' && d.decidedAt === '2026-05-06T07:03:15+00:00',
    );
    expect(editOfA).toBeTruthy();
    expect(editOfA!.attributeId).toBe('correct');
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
