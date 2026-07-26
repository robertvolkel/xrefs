import {
  routeIntent,
  routeIntentWithClassifier,
} from '@/lib/services/intentRouter';
import { resolvePartTypeFamily } from '@/lib/services/guidedSelectionController';

/**
 * Mutation-grade tests: each assertion is designed to FAIL if the corresponding behavior in
 * intentRouter.ts is broken — the first-match-wins PRECEDENCE (reordering flips the label),
 * the compose-don't-invent family resolution, the loose-MPN gate against type words, and the
 * classifier-fill contract (fires only on a family-bundle intent with a missed family).
 *
 * The router is INPUT-only: a mis-route is a soft failure, so the tests pin the properties the
 * design actually relies on, not incidental wording.
 */

describe('routeIntent — precedence & signals', () => {
  it('returns unknown for empty / whitespace input', () => {
    expect(routeIntent('').intent).toBe('unknown');
    expect(routeIntent('   ').intent).toBe('unknown');
  });

  it('routes an explicit comparison even when a part number is present (comparison outranks part-lookup)', () => {
    const r = routeIntent('compare BC847 vs BC848 for me');
    expect(r.intent).toBe('comparison');
    expect(r.signals).toContain('compare');
    // Guard: BC847/BC848 ARE mentionsMpn hits — so this only passes if comparison is checked FIRST.
  });

  it('routes a real MPN reference in prose to part-lookup', () => {
    const r = routeIntent('find replacements for BC847CLT3G from On Semi');
    expect(r.intent).toBe('part-lookup');
    expect(r.signals).toContain('mentionsMpn');
  });

  it('routes "which manufacturers make <type>" to discovery', () => {
    const r = routeIntent('which manufacturers make capacitors');
    expect(r.intent).toBe('discovery');
    expect(r.signals).toEqual(expect.arrayContaining(['mfrCue', 'namesType']));
  });

  it('routes a maker reference with no component type to mfr-question', () => {
    const r = routeIntent('tell me about the manufacturer Murata');
    expect(r.intent).toBe('mfr-question');
    expect(r.signals).toContain('mfrCue');
  });

  it('routes a greenfield sourcing request to selection and does NOT treat value/package tokens as an MPN', () => {
    const r = routeIntent('I need a 25V X7R capacitor');
    expect(r.intent).toBe('selection');
    expect(r.signals).toContain('selectionIntent');
    expect(r.signals).not.toContain('mentionsMpn'); // 25V / X7R must not read as a part number
  });

  it('routes a bare type-noun drop to selection with its resolved family', () => {
    // "power inductor" is an exact disambiguation-chip label → deterministic family 71.
    expect(resolvePartTypeFamily('power inductor')).toBe('71'); // precondition (non-vacuous)
    const r = routeIntent('power inductor');
    expect(r.intent).toBe('selection');
    expect(r.familyId).toBe('71');
    expect(r.signals).toContain('bareType');
  });

  it('routes an attribute-value question to parametric-question (before theory)', () => {
    const r = routeIntent('what voltages do MLCCs come in?');
    expect(r.intent).toBe('parametric-question');
    expect(r.signals).toContain('paramAttr');
    // Guard: reordering theory above parametric would make this 'theory'.
  });

  it('routes a concept question with no attribute noun to theory', () => {
    const r = routeIntent('how does an MLCC work?');
    expect(r.intent).toBe('theory');
    expect(r.signals).toContain('theory');
  });

  it('falls back to a loose MPN only when the token is not a component type', () => {
    // A short MPN-looking token mentionsMpn skips (len < 5) but looksLikeMpn catches.
    const mpn = routeIntent('LM7');
    expect(mpn.intent).toBe('part-lookup');
    expect(mpn.signals).toContain('looseMpn');

    // A bare component-type word reaches the earlier selection branch (precedence guard).
    const type = routeIntent('Tantalum');
    expect(type.intent).toBe('selection');
    expect(type.signals).not.toContain('looseMpn');

    // Isolates the `!namesType` gate on branch #8: "polymer?" reaches the loose-MPN branch
    // (looksLikeMpn true, no family, not selection/theory), and the gate must KEEP it out of
    // part-lookup because it names a component type. Without the gate this becomes part-lookup.
    const gated = routeIntent('polymer?');
    expect(gated.intent).not.toBe('part-lookup');
    expect(gated.signals).not.toContain('looseMpn');
  });
});

describe('routeIntentWithClassifier — family-fill contract', () => {
  it('fills a missing family via the classifier for a family-bundle intent', async () => {
    // Bare "capacitor" is an ambiguous head → deterministic family is null.
    const pre = routeIntent('I need a capacitor');
    expect(pre.intent).toBe('selection'); // precondition
    expect(pre.familyId).toBeNull(); // precondition — otherwise the test is vacuous

    const classify = jest.fn().mockResolvedValue('12');
    const r = await routeIntentWithClassifier('I need a capacitor', classify);
    expect(classify).toHaveBeenCalledTimes(1);
    expect(r.familyId).toBe('12');
    expect(r.signals).toContain('family:classifier');
  });

  it('does NOT call the classifier when a family already resolved deterministically', async () => {
    expect(routeIntent('power inductor').familyId).toBe('71'); // precondition
    const classify = jest.fn().mockResolvedValue('99');
    const r = await routeIntentWithClassifier('power inductor', classify);
    expect(classify).not.toHaveBeenCalled();
    expect(r.familyId).toBe('71'); // classifier must not override a deterministic hit
  });

  it('does NOT call the classifier for an intent that consumes no family bundle', async () => {
    const pre = routeIntent('tell me about the manufacturer Murata');
    expect(pre.intent).toBe('mfr-question'); // precondition — not in FAMILY_BUNDLE_INTENTS
    const classify = jest.fn().mockResolvedValue('12');
    const r = await routeIntentWithClassifier('tell me about the manufacturer Murata', classify);
    expect(classify).not.toHaveBeenCalled();
    expect(r.familyId).toBeNull();
  });

  it('leaves the route unchanged when the classifier also misses', async () => {
    const classify = jest.fn().mockResolvedValue(null);
    const r = await routeIntentWithClassifier('I need a capacitor', classify);
    expect(classify).toHaveBeenCalledTimes(1);
    expect(r.familyId).toBeNull();
    expect(r.signals).not.toContain('family:classifier');
  });
});
