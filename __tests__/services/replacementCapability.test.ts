import { readFileSync } from 'fs';
import path from 'path';
import type { PartAttributes, ParametricAttribute, MatchDetail, XrefRecommendation } from '@/lib/types';
import { countComparedSpecs } from '@/lib/types';
import { countComparableSourceRules } from '@/lib/services/matchingEngine';
import { canLogicMatch } from '@/lib/services/replacementCapability';
import { getLogicTable, getLogicTableForSubcategory } from '@/lib/logicTables';

/**
 * A part with NO usable specifications must not be offered a cross-reference,
 * and a thin comparison must not present itself as a verified one.
 *
 * Every fixture here mirrors a REAL part taken from production data, because
 * the defect this guards is entirely about which real parts fall on which side
 * of the line. Invented shapes would prove nothing — the earlier draft of this
 * fix used a coverage ratio that looked correct and, measured against the same
 * real parts, would have stripped replacements from commodities.
 */

const param = (parameterId: string, value: string): ParametricAttribute => ({
  parameterId,
  parameterName: parameterId,
  value,
  sortOrder: 0,
});

// `getLogicTableForSubcategory(sub, attrs)` runs the variant classifier, which
// reads description/mpn/subcategory — all required fields on a real `Part`. The
// fixture carries them so this suite exercises the same path production does.
const attrs = (
  subcategory: string,
  parameters: ParametricAttribute[],
  part: { mpn?: string; description?: string } = {},
): PartAttributes =>
  ({
    part: { mpn: part.mpn ?? 'FIXTURE-1', description: part.description ?? '', subcategory },
    parameters,
  }) as PartAttributes;

const md = (parameterId: string, sourceValue: string, replacementValue: string): MatchDetail => ({
  parameterId,
  parameterName: parameterId,
  sourceValue,
  replacementValue,
  matchStatus: 'exact',
  ruleResult: 'pass',
});

const rec = (matchDetails: MatchDetail[]): XrefRecommendation =>
  ({ matchDetails }) as XrefRecommendation;

// ── Real parts, real values ────────────────────────────────────────────────
// Digikey publishes zero parameters for this one (150-MNS2N2222AUB-ND); the
// four below are what parts.io gap-fill supplied, verified from the live
// conversation snapshot.
const MNS2N2222AUB = attrs('BJT', [
  param('vce_sat', '1 V'),
  param('pd', '0.5 W'),
  param('channel_type', 'NPN'),
  param('operating_temp', '-65°C ~ 200°C'),
]);

// Two published fields, neither of them a specification anyone can match on.
const ES3GB = attrs('Rectifier Diode', [
  param('msl', '1  (Unlimited)'),
  param('recovery_behavior', 'Consult datasheet'),
]);

// One field, same story.
const MLM205G = attrs('Linear Voltage Regulator', [param('msl', '3  (168 Hours)')]);

// The part Digikey never characterised at all.
const NO_PARAMS_AT_ALL = attrs('MLCC', []);

describe('countComparableSourceRules — how many scored rules the source can answer', () => {
  it('counts only rules the source actually has a value for', () => {
    const b6 = getLogicTable('B6')!;
    // vce_sat and pd are scored B6 rules; channel_type and operating_temp are
    // not scored rules in B6, so they contribute nothing. Verified against the
    // live table, not assumed.
    expect(countComparableSourceRules(MNS2N2222AUB, b6)).toBe(2);
  });

  it('is zero when the published fields map to no scored rule', () => {
    expect(countComparableSourceRules(ES3GB, getLogicTable('B1')!)).toBe(0);
    expect(countComparableSourceRules(MLM205G, getLogicTable('C1')!)).toBe(0);
  });

  it('is zero when there are no parameters at all', () => {
    expect(countComparableSourceRules(NO_PARAMS_AT_ALL, getLogicTable('12')!)).toBe(0);
  });

  it('excludes rules the engine cannot compare, even when the source has the value', () => {
    // application_review / operational rules never compare values. Counting one
    // would report evidence that does not exist — and would flip the gate on
    // for a part whose only "spec" is un-comparable.
    const b1 = getLogicTable('B1')!;
    const uncomparable = b1.rules.filter(
      r => r.logicType === 'application_review' || r.logicType === 'operational',
    );
    expect(uncomparable.length).toBeGreaterThan(0); // control: B1 really has some
    const onlyUncomparable = attrs('Rectifier Diode', uncomparable.map(r => param(r.attributeId, 'x')));
    expect(countComparableSourceRules(onlyUncomparable, b1)).toBe(0);
  });

  it('counts a well-specified part high — the control that proves the pipeline ran', () => {
    const mlcc = getLogicTable('12')!;
    const scored = mlcc.rules.filter(
      r => r.logicType !== 'application_review' && r.logicType !== 'operational',
    );
    const fullySpecified = attrs('MLCC', scored.map(r => param(r.attributeId, 'x')));
    expect(countComparableSourceRules(fullySpecified, mlcc)).toBe(scored.length);
    expect(scored.length).toBeGreaterThan(5);
  });
});

describe('canLogicMatch — the capability gate', () => {
  it('is false when the family is supported but nothing is comparable', () => {
    // Both are supported families — so "unsupported category" is the WRONG
    // explanation for these, and the gate must not be reading that signal.
    expect(getLogicTableForSubcategory('Rectifier Diode')).not.toBeNull();
    expect(getLogicTableForSubcategory('Linear Voltage Regulator')).not.toBeNull();

    expect(canLogicMatch(ES3GB)).toBe(false);
    expect(canLogicMatch(MLM205G)).toBe(false);
    expect(canLogicMatch(NO_PARAMS_AT_ALL)).toBe(false);
  });

  it('is false when the family has no rulebook', () => {
    expect(canLogicMatch(attrs('Flat Flex Ribbon Jumpers, Cables', [param('anything', 'x')]))).toBe(false);
  });

  it('is TRUE at one comparable rule — zero is the gate, not a coverage ratio', () => {
    // MNS2N2222AUB answers 2 of B6's 15 scored rules (13% of rule weight). A
    // ratio cutoff that excluded it would also exclude LL4148 (26%),
    // MAX232DRG4 (17%) and 2SC1815M-GR (17%) — all ordinary parts. Measured
    // across all 174 real source parts in the production logs.
    expect(canLogicMatch(MNS2N2222AUB)).toBe(true);

    const oneRule = attrs('BJT', [param('vce_sat', '1 V')]);
    expect(canLogicMatch(oneRule)).toBe(true);
  });
});

describe('countComparedSpecs — how much of a match percentage is real evidence', () => {
  it('counts only rules where BOTH sides had a published value', () => {
    // Shape taken from the real MNS2N2222AUB → DTC113ZE log entry: 18 rules,
    // one comparison, and a 94% headline.
    const thin = rec([
      md('channel_type', 'N/A', 'NPN'),
      md('package_case', 'N/A', 'SOT-523'),
      md('vceo_max', 'N/A', '50'),
      md('ic_max', 'N/A', 'N/A'),
      md('vce_sat', '1 V', '0.3 V'),
    ]);
    expect(countComparedSpecs(thin)).toEqual({ compared: 1, total: 5 });
  });

  it('counts a healthy comparison high', () => {
    const healthy = rec([
      md('topology', 'Fixed', 'Fixed'),
      md('vout', '5V', '3.3V'),
      md('package_case', 'SOT-23-3', 'SOT-23-3'),
      md('polarity', 'Positive', 'Positive'),
      md('vin_max', '16V', '24V'),
      md('psrr', 'N/A', 'N/A'),
    ]);
    expect(countComparedSpecs(healthy)).toEqual({ compared: 5, total: 6 });
  });

  it('a missing value on EITHER side means no comparison happened', () => {
    expect(countComparedSpecs(rec([md('a', 'N/A', '5V')])).compared).toBe(0);
    expect(countComparedSpecs(rec([md('a', '5V', 'N/A')])).compared).toBe(0);
    expect(countComparedSpecs(rec([md('a', 'N/A', 'N/A')])).compared).toBe(0);
    expect(countComparedSpecs(rec([md('a', '5V', '5V')])).compared).toBe(1);
  });

  it('survives a recommendation with no matchDetails', () => {
    expect(countComparedSpecs({} as XrefRecommendation)).toEqual({ compared: 0, total: 0 });
  });
});

// ── The panel gate ─────────────────────────────────────────────────────────
// usePanelVisibility is a React hook and this suite runs in a node environment
// with no renderer, so the guard is over source. That is enough to catch the
// regression it exists for: the defect was ONE expression, and reverting it
// turns these red.

const ROOT = path.join(__dirname, '..', '..');
const readCode = (rel: string) =>
  readFileSync(path.join(ROOT, rel), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('the Replacements panel opens whenever recommendations exist', () => {
  it('gates on the part having RESOLVED, not on it having parametric data', () => {
    const shell = readCode('components/AppShell.tsx');
    expect(shell).toContain('const sourceResolved = !!appState.sourceAttributes;');
    // The exact expression that hid the panel for six months.
    expect(shell).not.toMatch(/sourceAttributes\?\.parameters\.length\s*\?\?\s*0\)\s*>\s*0/);
    expect(shell).toContain('usePanelVisibility(appState.phase, sourceResolved)');
  });

  it('the visibility hook consumes that, and nothing spec-shaped', () => {
    const hook = readCode('hooks/usePanelVisibility.ts');
    expect(hook).toContain('const showRightPanel = recsRevealed && sourceResolved;');
    expect(hook).not.toContain('hasAttributes');
    expect(hook).not.toContain('parameters');
  });
});

// ── The decline is answered ONCE ───────────────────────────────────────────
// Observed in the browser: typing "Find me replacements" for a part with no
// coverage rendered the user's question TWICE, with two competing assistant
// answers. `handleSearch` posts the user message before `dispatchIntent`, then
// falls through to `handleSearchWithLLM` on a capability miss — which posted it
// again. The model's second answer also contradicted the first and asserted
// that another manufacturer's variant "does have replacement logic enabled", a
// flag it cannot see for a part it never loaded.

describe('a capability decline answers once, not twice', () => {
  const state = readCode('hooks/useAppState.ts');

  it('the LLM path can be told the user message is already recorded', () => {
    expect(state).toMatch(/async \(query: string, alreadyRecorded = false\)/);
    expect(state).toContain('if (!alreadyRecorded) addMessage(\'user\', query);');
    expect(state).toContain("if (!alreadyRecorded) conversationRef.current.push({ role: 'user', content: query });");
  });

  it('every fall-through to the LLM declares the message already posted', () => {
    // Both capability-miss branches post the user message themselves before
    // dispatching. Neither may reach the LLM without saying so.
    expect(state).toContain('await handleSearchWithLLM(query, userMessageRecorded);');
    const flagSets = state.match(/userMessageRecorded = true;/g) ?? [];
    expect(flagSets.length).toBe(2);
    // …and the raw two-argument-less call must not come back.
    expect(state).not.toMatch(/await handleSearchWithLLM\(query\);/);
  });

  it('a complete decline short-circuits the LLM entirely', () => {
    expect(state).toContain('intentAnsweredCompletelyRef.current = true;');
    // Read AND cleared at every consumer, or the next unrelated turn is eaten.
    const clears = state.match(/intentAnsweredCompletelyRef\.current = false;/g) ?? [];
    expect(clears.length).toBe(2);
  });
});
