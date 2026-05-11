import { reclassifyByParameterSignals } from '@/lib/services/atlasMapper';

const B1 = { category: 'Diodes' as const, subcategory: 'Rectifier Diode', familyId: 'B1' };

describe('reclassifyByParameterSignals', () => {
  it('keeps B1 when no Type parameter present', () => {
    expect(reclassifyByParameterSignals(B1, [])).toEqual(B1);
    expect(reclassifyByParameterSignals(B1, [{ name: 'Vrrm', value: '600' }])).toEqual(B1);
  });

  it('keeps B1 when Type value is empty', () => {
    expect(reclassifyByParameterSignals(B1, [{ name: 'Type', value: '' }])).toEqual(B1);
    expect(reclassifyByParameterSignals(B1, [{ name: 'Type', value: '   ' }])).toEqual(B1);
  });

  it('reclassifies B1 → B4 on Type=Bi / Uni / Bidirectional / Unidirectional', () => {
    for (const v of ['Bi', 'Uni', 'Bidirectional', 'Unidirectional']) {
      const result = reclassifyByParameterSignals(B1, [{ name: 'Type', value: v }]);
      expect(result.familyId).toBe('B4');
      expect(result.subcategory).toBe('TVS Diode');
    }
  });

  it('reclassifies B1 → B3 on Type=Regulator / Voltage Regulator', () => {
    for (const v of ['Regulator', 'voltage regulator', 'REGULATOR']) {
      const result = reclassifyByParameterSignals(B1, [{ name: 'Type', value: v }]);
      expect(result.familyId).toBe('B3');
      expect(result.subcategory).toBe('Zener Diode');
    }
  });

  it('matches Chinese 类型 key equivalently to English Type', () => {
    const r1 = reclassifyByParameterSignals(B1, [{ name: '类型', value: 'Bi' }]);
    expect(r1.familyId).toBe('B4');
    const r2 = reclassifyByParameterSignals(B1, [{ name: '类型', value: 'Regulator' }]);
    expect(r2.familyId).toBe('B3');
  });

  it('is case-insensitive on the Type key', () => {
    expect(reclassifyByParameterSignals(B1, [{ name: 'TYPE', value: 'Uni' }]).familyId).toBe('B4');
    expect(reclassifyByParameterSignals(B1, [{ name: 'type', value: 'Bi' }]).familyId).toBe('B4');
  });

  it('keeps B1 on non-matching Type values (Standard, Fast, Ultrafast, etc.)', () => {
    for (const v of ['Standard', 'Fast', 'Ultrafast', 'Schottky', 'unknown']) {
      const result = reclassifyByParameterSignals(B1, [{ name: 'Type', value: v }]);
      expect(result).toEqual(B1);
    }
  });

  it('only fires from B1 — non-B1 inputs pass through unchanged', () => {
    const B4 = { category: 'Diodes' as const, subcategory: 'TVS Diode', familyId: 'B4' };
    expect(reclassifyByParameterSignals(B4, [{ name: 'Type', value: 'Regulator' }])).toEqual(B4);

    const C1 = { category: 'Voltage Regulators' as const, subcategory: 'LDO', familyId: 'C1' };
    expect(reclassifyByParameterSignals(C1, [{ name: 'Type', value: 'Regulator' }])).toEqual(C1);
  });

  it('uses the first matching Type entry when multiple are present', () => {
    // Defensive — model.parameters is an array, so duplicates are possible.
    const result = reclassifyByParameterSignals(B1, [
      { name: 'Type', value: 'Regulator' },
      { name: 'Type', value: 'Bi' },
    ]);
    expect(result.familyId).toBe('B3'); // first wins
  });

  // ── Phase 2: foreign-family param-name signatures ─────────────────
  describe('foreign-family param-name signatures (registry-driven)', () => {
    it('reclassifies B1 → B6 when BJT-only params (BVCBO/BVCEO/BVEBO) appear', () => {
      for (const name of ['BVCBO(V)', 'BVCEO(V)', 'BVEBO(V)']) {
        const r = reclassifyByParameterSignals(B1, [{ name, value: '-60' }]);
        expect(r.familyId).toBe('B6');
        expect(r.subcategory).toBe('BJT');
        expect(r.category).toBe('Transistors');
      }
    });

    it('reclassifies B1 → B6 on Ic / @Ic / hFE', () => {
      const r1 = reclassifyByParameterSignals(B1, [{ name: '@Ic(mA)', value: '500' }]);
      expect(r1.familyId).toBe('B6');
      const r2 = reclassifyByParameterSignals(B1, [{ name: 'Ic(mA)', value: '500' }]);
      expect(r2.familyId).toBe('B6');
      const r3 = reclassifyByParameterSignals(B1, [{ name: 'hFE', value: '100' }]);
      expect(r3.familyId).toBe('B6');
    });

    it('reclassifies B1 → B5 on MOSFET-only params', () => {
      const r1 = reclassifyByParameterSignals(B1, [{ name: 'Rds(on)(Ω)', value: '0.025' }]);
      expect(r1.familyId).toBe('B5');
      const r2 = reclassifyByParameterSignals(B1, [{ name: 'Vgs(th)(V)', value: '2.5' }]);
      expect(r2.familyId).toBe('B5');
      const r3 = reclassifyByParameterSignals(B1, [{ name: 'Qg(nC)', value: '40' }]);
      expect(r3.familyId).toBe('B5');
    });

    it('reclassifies B1 → B7 on IGBT-only params', () => {
      const r1 = reclassifyByParameterSignals(B1, [{ name: 'Vce(sat)(V)', value: '2.0' }]);
      expect(r1.familyId).toBe('B7');
      const r2 = reclassifyByParameterSignals(B1, [{ name: 'Eoff(mJ)', value: '1.5' }]);
      expect(r2.familyId).toBe('B7');
    });

    it('reclassifies B1 → B9 on JFET-only Idss param', () => {
      const r = reclassifyByParameterSignals(B1, [{ name: 'Idss(mA)', value: '5' }]);
      expect(r.familyId).toBe('B9');
      expect(r.subcategory).toBe('JFET');
    });

    it('reclassifies B1 → E1 on optocoupler-only params', () => {
      const r1 = reclassifyByParameterSignals(B1, [{ name: 'CTR(%)', value: '50' }]);
      expect(r1.familyId).toBe('E1');
      const r2 = reclassifyByParameterSignals(B1, [{ name: 'Viso(V)', value: '5000' }]);
      expect(r2.familyId).toBe('E1');
    });

    it('does NOT reclassify when the signature matches the current family (no-op)', () => {
      // A correctly-classified BJT carrying BVCBO should stay in B6, not get
      // re-routed to B6 (same family).
      const B6 = { category: 'Transistors' as const, subcategory: 'BJT', familyId: 'B6' };
      const r = reclassifyByParameterSignals(B6, [{ name: 'BVCBO(V)', value: '60' }]);
      expect(r).toEqual(B6);
    });

    it('Phase 1 (Type=Bi) takes precedence over Phase 2 — TVS detection runs first', () => {
      // If a B1 product has both Type=Bi AND a registry-matched param, the
      // Type-value rule should win (it's the more specific signal — TVS is a
      // diode subtype, not a transistor).
      const r = reclassifyByParameterSignals(B1, [
        { name: 'Type', value: 'Bi' },
        { name: 'BVCBO(V)', value: '60' },
      ]);
      expect(r.familyId).toBe('B4');
    });

    it('first matching signature wins when multiple registry patterns hit', () => {
      // Edge case — a row carrying both BJT and MOSFET signatures (shouldn't
      // happen in practice, but the registry order is the tiebreak so the
      // behavior is deterministic).
      const r = reclassifyByParameterSignals(B1, [
        { name: 'BVCBO(V)', value: '60' },
        { name: 'Rds(on)', value: '0.1' },
      ]);
      // BJT entries come before MOSFET entries in the registry — B6 wins.
      expect(r.familyId).toBe('B6');
    });

    it('keeps initial classification when no params match any signature', () => {
      const r = reclassifyByParameterSignals(B1, [
        { name: 'Vrrm(V)', value: '600' },
        { name: 'If(A)', value: '1.0' },
      ]);
      expect(r).toEqual(B1);
    });

    it('handles missing or empty param names defensively', () => {
      const r1 = reclassifyByParameterSignals(B1, [{ name: '', value: 'foo' }]);
      expect(r1).toEqual(B1);
      const r2 = reclassifyByParameterSignals(B1, [{ name: '   ', value: 'foo' }]);
      expect(r2).toEqual(B1);
    });

    it('fires from any starting family, not just B1', () => {
      // A product misclassified as B5 MOSFET that actually carries CTR
      // (optocoupler param) should reclassify to E1.
      const B5 = { category: 'Transistors' as const, subcategory: 'MOSFET', familyId: 'B5' };
      const r = reclassifyByParameterSignals(B5, [{ name: 'CTR(%)', value: '50' }]);
      expect(r.familyId).toBe('E1');
    });
  });
});
