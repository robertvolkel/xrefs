import { groupRows, type DecisionItem, type Group } from '@/components/admin/AtlasDecisionLogPanel';

const row = (id: string, batchId: string | null): DecisionItem => ({
  id,
  paramName: `param-${id}`,
  paramKey: `param-${id}`,
  familyId: 'B1',
  category: null,
  decision: 'mapping_accepted',
  note: null,
  hasEvidence: false,
  attributeId: 'vrrm',
  attributeName: 'Reverse Voltage',
  overrideId: `ov-${id}`,
  investigationId: null,
  batchId,
  source: batchId ? 'batch' : 'ui',
  decidedBy: 'user-1',
  decidedByName: 'Rob',
  decidedAt: '2026-07-20T09:00:00Z',
});

const asBatch = (g: Group) => {
  if (g.kind !== 'batch') throw new Error('expected a batch group');
  return g;
};

/**
 * A Batch Accept writes ONE ROW PER PARAM — that is deliberate, because
 * per-parameter history is the whole point of the log. But newest-first, a
 * single batch of 55 (a real one in live data) would bury an entire day of
 * other work behind one click. So the rows are stored individually and
 * collapsed only for display.
 */
describe('Decision Log: batch rows collapse for display', () => {
  it('collapses a run of same-batch rows into one group', () => {
    const groups = groupRows(
      [row('a', null), row('b', 'batch-1'), row('c', 'batch-1'), row('d', 'batch-1'), row('e', null)],
      { 'batch-1': 3 },
    );
    expect(groups.map((g) => g.kind)).toEqual(['single', 'batch', 'single']);
    expect(asBatch(groups[1]).rows).toHaveLength(3);
    expect(asBatch(groups[1]).totalInBatch).toBe(3);
  });

  it('reports the batch\'s TRUE size when it straddles a page boundary', () => {
    // The live case: a 55-row batch against a 50-row page. Counting only the
    // rows visible here would render "Batch — 50 parameters" for a batch of
    // 55 — a quietly wrong number, which is the failure mode this whole
    // feature exists to stop producing.
    const rows = Array.from({ length: 50 }, (_, i) => row(`r${i}`, 'big'));
    const groups = groupRows(rows, { big: 55 });
    expect(groups).toHaveLength(1);
    expect(asBatch(groups[0]).totalInBatch).toBe(55);
    expect(asBatch(groups[0]).rows).toHaveLength(50);
  });

  it('falls back to the visible count when the true size is unknown', () => {
    // Never invent a number: with no count from the server, say what is here.
    const groups = groupRows([row('a', 'b1'), row('b', 'b1')], {});
    expect(asBatch(groups[0]).totalInBatch).toBe(2);
  });

  it('does not add a collapse affordance for a single-row batch', () => {
    // A "batch" of one is just a row; wrapping it hides the parameter name
    // behind an expander for no benefit.
    const groups = groupRows([row('a', 'b1'), row('b', null)], { b1: 1 });
    expect(groups.map((g) => g.kind)).toEqual(['single', 'single']);
  });

  it('keeps two different batches separate', () => {
    const groups = groupRows(
      [row('a', 'b1'), row('b', 'b1'), row('c', 'b2'), row('d', 'b2')],
      { b1: 2, b2: 2 },
    );
    expect(groups).toHaveLength(2);
    expect(asBatch(groups[0]).batchId).toBe('b1');
    expect(asBatch(groups[1]).batchId).toBe('b2');
  });

  it('never drops or duplicates a row', () => {
    // The count in the header comes from the server; the rows come from here.
    // If grouping lost one, the two would disagree with nothing to flag it.
    const rows = [row('a', null), row('b', 'b1'), row('c', 'b1'), row('d', null), row('e', 'b2'), row('f', 'b2')];
    const groups = groupRows(rows, {});
    const flat = groups.flatMap((g) => (g.kind === 'single' ? [g.row] : g.rows));
    expect(flat.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('handles an empty page', () => {
    expect(groupRows([], {})).toEqual([]);
  });
});
