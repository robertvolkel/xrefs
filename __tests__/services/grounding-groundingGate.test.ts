import {
  evaluateGroundingGate,
  applyGroundingGate,
  buildGateCorrection,
  isGroundingGateEnabled,
  GATE_SAFE_MESSAGE,
} from '@/lib/services/grounding/groundingGate';
import { DetectOptions } from '@/lib/services/grounding/mpnDetector';
import { emptyVerifiedSet, extendVerifiedSet } from '@/lib/services/grounding/verifiedSet';

// Deterministic detector config — small vocab + one family pattern so tests don't
// depend on the full logic-table-derived vocabulary.
const OPTS: DetectOptions = {
  vocabulary: new Set(['x7r', 'sot-23', 'voltage', 'package']),
  familyPatterns: [/^bc\d/, /^lm\d/],
};

describe('evaluateGroundingGate', () => {
  it('flags a HIGH-confidence (known-family) unverified part', () => {
    const e = evaluateGroundingGate('I would use BC847B for that.', emptyVerifiedSet(), OPTS);
    expect(e.flagged).toBe(true);
    expect(e.enforceable.map((f) => f.normalized)).toContain('bc847b');
  });

  it('does NOT flag a verified part of the same family', () => {
    const verified = extendVerifiedSet(emptyVerifiedSet(), { catalogParts: [{ mpn: 'BC847B' }] });
    const e = evaluateGroundingGate('BC847B is the active part.', verified, OPTS);
    expect(e.flagged).toBe(false);
  });

  it('does NOT enforce on a MEDIUM-only (structural) finding', () => {
    // ZX9981 is mixed letters+digits (medium) but matches no family pattern.
    const e = evaluateGroundingGate('Consider ZX9981 here.', emptyVerifiedSet(), OPTS);
    expect(e.flagged).toBe(false); // medium stays observe-only
    expect(e.all.some((f) => f.confidence === 'medium')).toBe(true);
  });

  it('does NOT flag ordinary vocabulary or values', () => {
    const e = evaluateGroundingGate('An X7R in SOT-23 rated 45V.', emptyVerifiedSet(), OPTS);
    expect(e.flagged).toBe(false);
  });
});

describe('applyGroundingGate', () => {
  const verified = emptyVerifiedSet();

  it('passes a clean reply through untouched, without calling regenerate', async () => {
    const regenerate = jest.fn(async () => 'should not be used');
    const r = await applyGroundingGate('An X7R capacitor works well.', verified, regenerate, OPTS);
    expect(r.action).toBe('allow');
    expect(r.message).toBe('An X7R capacitor works well.');
    expect(regenerate).not.toHaveBeenCalled();
  });

  it('regenerates once and uses the rewrite when it comes back clean', async () => {
    const regenerate = jest.fn(async () => 'I would need to look that part up first.');
    const r = await applyGroundingGate('Use BC847B for that.', verified, regenerate, OPTS);
    expect(regenerate).toHaveBeenCalledTimes(1);
    expect(r.action).toBe('regenerated');
    expect(r.message).toBe('I would need to look that part up first.');
  });

  it('falls back to the safe message when the rewrite still names an unverified part', async () => {
    const regenerate = jest.fn(async () => 'Honestly just grab an LM358 instead.'); // lm358 = HIGH
    const r = await applyGroundingGate('Use BC847B for that.', verified, regenerate, OPTS);
    expect(r.action).toBe('safe_message');
    expect(r.message).toBe(GATE_SAFE_MESSAGE);
  });

  it('falls back to the safe message when regenerate throws', async () => {
    const regenerate = jest.fn(async () => { throw new Error('model error'); });
    const r = await applyGroundingGate('Use BC847B for that.', verified, regenerate, OPTS);
    expect(r.action).toBe('safe_message');
    expect(r.message).toBe(GATE_SAFE_MESSAGE);
  });

  it('falls back to the safe message when regenerate returns empty', async () => {
    const regenerate = jest.fn(async () => '   ');
    const r = await applyGroundingGate('Use BC847B for that.', verified, regenerate, OPTS);
    expect(r.action).toBe('safe_message');
    expect(r.message).toBe(GATE_SAFE_MESSAGE);
  });
});

describe('buildGateCorrection', () => {
  it('names the offending tokens', () => {
    const e = evaluateGroundingGate('Use BC847B or LM358.', emptyVerifiedSet(), OPTS);
    const correction = buildGateCorrection(e.enforceable);
    expect(correction).toContain('BC847B');
    expect(correction).toContain('LM358');
    expect(correction).toContain('part numbers'); // plural
  });
});

describe('isGroundingGateEnabled', () => {
  const original = process.env.GROUNDING_GATE_ENABLED;
  afterEach(() => { process.env.GROUNDING_GATE_ENABLED = original; });

  it('defaults to OFF', () => {
    delete process.env.GROUNDING_GATE_ENABLED;
    expect(isGroundingGateEnabled()).toBe(false);
  });

  it('is ON only for the exact string "true"', () => {
    process.env.GROUNDING_GATE_ENABLED = 'true';
    expect(isGroundingGateEnabled()).toBe(true);
    process.env.GROUNDING_GATE_ENABLED = '1';
    expect(isGroundingGateEnabled()).toBe(false);
  });
});
