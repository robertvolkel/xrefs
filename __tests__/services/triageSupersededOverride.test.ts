/**
 * Pins SUPERSEDED != REVERTED in the Triage queue.
 *
 * The override write path is deactivate-then-insert: every edit / re-accept of a
 * mapping leaves the previous row behind with is_active=false. Those dead rows were
 * being surfaced as sample-value-less "Reverted" phantoms of params that were, in
 * fact, mapped and working. On live data: 218 inactive overrides, 209 of them merely
 * superseded, only 9 real reverts.
 *
 * The load-bearing asymmetry: hiding too much would silently swallow a REAL revert,
 * so the "no active sibling" case is tested at least as hard as the hiding case.
 */
import { isSupersededOverride } from '@/lib/services/triageQueueCompute';

const ov = (over: Partial<{ isActive: boolean; familyId: string; paramName: string }> = {}) => ({
  isActive: false,
  familyId: 'B5',
  paramName: 'RDS(on)',
  ...over,
});

describe('isSupersededOverride', () => {
  it('HIDES an inactive override when an active one exists for the same family+param', () => {
    // The param was edited / re-accepted. It IS mapped right now. Not a revert.
    const activeKeys = new Set(['B5:rds(on)']);
    expect(isSupersededOverride(ov(), activeKeys)).toBe(true);
  });

  it('KEEPS a genuinely reverted override — no active sibling', () => {
    // This is the case that must never be swallowed: a real revert.
    const activeKeys = new Set<string>();
    expect(isSupersededOverride(ov(), activeKeys)).toBe(false);
  });

  it('never hides an ACTIVE override, even if the key is present', () => {
    // An active override is the live mapping — hiding it would erase a working row.
    const activeKeys = new Set(['B5:rds(on)']);
    expect(isSupersededOverride(ov({ isActive: true }), activeKeys)).toBe(false);
  });

  it('scopes by FAMILY — an active override in a different family does not supersede', () => {
    // Overrides are per-scope. B6's mapping says nothing about B5's.
    const activeKeys = new Set(['B6:rds(on)']);
    expect(isSupersededOverride(ov({ familyId: 'B5' }), activeKeys)).toBe(false);
  });

  it('scopes by PARAM — a different param in the same family does not supersede', () => {
    const activeKeys = new Set(['B5:vgs(th)']);
    expect(isSupersededOverride(ov({ paramName: 'RDS(on)' }), activeKeys)).toBe(false);
  });

  it('normalizes the param key (NFC + lower + trim) — matches how the maps are built', () => {
    // The maps key on normalizeOverrideKey(paramName); a raw-cased/padded name must
    // still match, or a superseded row would leak back in as a phantom revert.
    const activeKeys = new Set(['B5:rds(on)']);
    expect(isSupersededOverride(ov({ paramName: '  RDS(ON)  ' }), activeKeys)).toBe(true);
  });

  it('handles CJK param names (the actual Atlas case)', () => {
    const activeKeys = new Set(['C1:最大输出电流']);
    expect(isSupersededOverride(ov({ familyId: 'C1', paramName: '最大输出电流' }), activeKeys)).toBe(true);
    expect(isSupersededOverride(ov({ familyId: 'C1', paramName: '最大输出电流' }), new Set())).toBe(false);
  });

  it('an L2 category scope behaves like a family scope', () => {
    // family_id is overloaded to carry an L3 familyId OR an L2 category name.
    const activeKeys = new Set(['Microcontrollers:温度范围(℃)']);
    expect(isSupersededOverride(ov({ familyId: 'Microcontrollers', paramName: '温度范围(℃)' }), activeKeys)).toBe(true);
  });
});
