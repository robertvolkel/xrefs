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
});
