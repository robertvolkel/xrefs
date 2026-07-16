import {
  SELECTION_TIERS,
  getSelectionQuestions,
  getSelectionTier,
} from '@/lib/services/selectionQuestions';
import { getLogicTable } from '@/lib/logicTables';

/**
 * DRIFT GUARD — the load-bearing test. Every Tier 2 / Tier 3 attributeId in
 * SELECTION_TIERS must exist as a rule in that family's (runtime-merged) logic
 * table. If a logic table renames/removes an attribute, or the tier list drifts,
 * this fails — so the agent's questions and the admin marker can never reference
 * a spec the engine doesn't actually score.
 */
describe('SELECTION_TIERS drift guard', () => {
  it('covers exactly the 43 supported families', () => {
    expect(Object.keys(SELECTION_TIERS)).toHaveLength(43);
  });

  for (const [familyId, tiers] of Object.entries(SELECTION_TIERS)) {
    describe(`family ${familyId}`, () => {
      const table = getLogicTable(familyId);

      it('resolves to a live logic table', () => {
        expect(table).not.toBeNull();
      });

      const ruleIds = new Set((table?.rules ?? []).map(r => r.attributeId));

      it.each(tiers.tier2)('Tier 2 id "%s" exists in the logic table', (id) => {
        expect(ruleIds.has(id)).toBe(true);
      });

      it.each(tiers.tier3)('Tier 3 id "%s" exists in the logic table', (id) => {
        expect(ruleIds.has(id)).toBe(true);
      });

      it('has no attribute in both tiers', () => {
        const overlap = tiers.tier2.filter(id => tiers.tier3.includes(id));
        expect(overlap).toEqual([]);
      });
    });
  }
});

describe('getSelectionQuestions', () => {
  it('returns null for an unknown family', () => {
    expect(getSelectionQuestions('ZZ')).toBeNull();
  });

  it('resolves labels, input kind, and chip options from the logic table (C1 LDO)', () => {
    const q = getSelectionQuestions('C1');
    expect(q).not.toBeNull();
    // Every Tier 2 id maps to a real rule → same count, none dropped.
    expect(q!.tier2.map(a => a.attributeId)).toEqual(SELECTION_TIERS['C1'].tier2);
    const byId = Object.fromEntries(q!.tier2.map(a => [a.attributeId, a]));

    // CHOICE specs: real closed option set → buttons.
    expect(byId.output_type.input).toBe('choice');
    expect(byId.output_type.options).toEqual(['Fixed', 'Adjustable', 'Tracking', 'Negative']);
    expect(byId.polarity.input).toBe('choice');
    expect(byId.polarity.options).toEqual(['Positive', 'Negative']);

    // VALUE specs: typed. output_voltage is scored by identity (exact match) but is a
    // typed number — it must NOT be classified as a choice. (Regression guard: the
    // original code keyed off logicType and mislabeled this as categorical, which
    // produced the text/button mismatch in the live test.)
    expect(byId.output_voltage.input).toBe('value');
    expect(byId.output_voltage.options).toBeUndefined();
    expect(byId.iout_max.input).toBe('value');
    // package_case is an open set → typed in prose, no chips.
    expect(byId.package_case.input).toBe('value');
    expect(byId.package_case.options).toBeUndefined();
  });

  it('does not invent garbage/cryptic chip options (parser false-positive guards)', () => {
    // 64 safety_rating label "Safety Rating (X/Y Class)" must NOT become ["X","Y Class"].
    const film = getSelectionQuestions('64')!;
    const safety = film.tier2.find(a => a.attributeId === 'safety_rating');
    if (safety) {
      expect(safety.input).toBe('value');
      expect(safety.options).toBeUndefined();
    }
    // B9 channel_type "(N/P)" → single-char tokens rejected → typed.
    const jfet = getSelectionQuestions('B9')!;
    expect(jfet.tier2.find(a => a.attributeId === 'channel_type')!.input).toBe('value');
    // B5 channel_type "(N-Channel / P-Channel)" → valid multi-char options → choice.
    const mosfet = getSelectionQuestions('B5')!;
    const b5chan = mosfet.tier2.find(a => a.attributeId === 'channel_type')!;
    expect(b5chan.input).toBe('choice');
    expect(b5chan.options).toEqual(['N-Channel', 'P-Channel']);
  });

  it('numeric-scored specs never become choice buttons (the unit/symbol-parenthetical bug)', () => {
    // These three Tier 2 specs are scored numerically (threshold) but carry a slashed
    // parenthetical that the old parser split into garbage chips:
    //   C4 supply_voltage  "Supply Voltage Range (Single/Dual)" → ["Single","Dual"]
    //   B8 vdrm            "Peak Repetitive Off-State Voltage (VDRM / VRRM)" → ["VDRM","VRRM"]
    //   65 max_continuous_voltage "Maximum Continuous Voltage (AC/DC)" → ["AC","DC"]
    // A numeric-scored rule is a TYPED value — never a pick-list.
    const cases: Array<[string, string]> = [
      ['C4', 'supply_voltage'],
      ['B8', 'vdrm'],
      ['65', 'max_continuous_voltage'],
    ];
    for (const [fam, id] of cases) {
      const attr = getSelectionQuestions(fam)!.tier2.find(a => a.attributeId === id)!;
      expect(attr.input).toBe('value');
      expect(attr.options).toBeUndefined();
    }
    // And a genuine categorical (B8 device_type, identity) still produces real buttons.
    const devType = getSelectionQuestions('B8')!.tier2.find(a => a.attributeId === 'device_type')!;
    expect(devType.input).toBe('choice');
    expect(devType.options).toEqual(['SCR', 'TRIAC', 'DIAC']);
  });

  it('every choice has options and every value has none (all families)', () => {
    for (const familyId of Object.keys(SELECTION_TIERS)) {
      const q = getSelectionQuestions(familyId)!;
      for (const a of [...q.tier2, ...q.tier3]) {
        if (a.input === 'choice') {
          expect(a.options && a.options.length >= 2).toBe(true);
        } else {
          expect(a.options).toBeUndefined();
        }
      }
    }
  });

  it('never drops a Tier 2/Tier 3 id (all resolve to rules)', () => {
    for (const familyId of Object.keys(SELECTION_TIERS)) {
      const q = getSelectionQuestions(familyId)!;
      expect(q.tier2).toHaveLength(SELECTION_TIERS[familyId].tier2.length);
      expect(q.tier3).toHaveLength(SELECTION_TIERS[familyId].tier3.length);
    }
  });
});

describe('getSelectionTier', () => {
  it('classifies tier membership', () => {
    expect(getSelectionTier('C1', 'output_type')).toBe('tier2');
    expect(getSelectionTier('C1', 'vdropout')).toBe('tier3');
    // A spec nobody can answer is asked in no tier. (This used to be `psrr`, which the review
    // promoted to tier 3 — pick something with a durable reason, not an accident of the list.)
    expect(getSelectionTier('C1', 'rth_ja')).toBeNull();
    expect(getSelectionTier('ZZ', 'output_type')).toBeNull();
  });
});
