import {
  KNOWN_FAMILY_IDS,
  validateFamilyId,
  detectCanonicalCollision,
  type CrossFamilyCanonicalIndex,
} from '@/lib/services/atlasTriageContext';

describe('KNOWN_FAMILY_IDS', () => {
  it('contains all L3 logic-table family IDs', () => {
    // Sample from each block
    for (const id of ['B1', 'B5', 'B6', 'B7', 'B9', 'C1', 'C4', 'C10', 'D1', 'D2', 'E1', 'F1', 'F2']) {
      expect(KNOWN_FAMILY_IDS.has(id)).toBe(true);
    }
  });

  it('contains numeric passive family IDs', () => {
    // Passives use numeric string IDs ('12' = MLCC, '52' = Chip Resistor, etc.)
    for (const id of ['12', '52', '59', '71']) {
      expect(KNOWN_FAMILY_IDS.has(id)).toBe(true);
    }
  });

  it('contains L2 category names', () => {
    // Decision #178: atlas_dictionary_overrides.family_id accepts L2
    // category names as override scope.
    for (const cat of ['Microcontrollers', 'Sensors', 'Connectors', 'LEDs']) {
      // Each L2 category should be valid IF it has a dict in atlasMapper.
      // We don't hardcode the full list here (it's data-driven), but we
      // verify at least one well-known category is present.
      if (cat === 'Microcontrollers' || cat === 'Sensors' || cat === 'Connectors') {
        expect(KNOWN_FAMILY_IDS.has(cat)).toBe(true);
      }
    }
  });

  it('does NOT contain invented family IDs', () => {
    // The R1(KΩ) hallucination case — verify the validator rejects it.
    for (const fake of ['BJT_DIGITAL', 'B99', 'C99', 'TRANSISTOR_MISC', 'Generic']) {
      expect(KNOWN_FAMILY_IDS.has(fake)).toBe(false);
    }
  });
});

describe('validateFamilyId', () => {
  it('returns true for known L3 family IDs', () => {
    expect(validateFamilyId('B6')).toBe(true);
    expect(validateFamilyId('C2')).toBe(true);
    expect(validateFamilyId('E1')).toBe(true);
  });

  it('returns true for known L2 category names', () => {
    expect(validateFamilyId('Microcontrollers')).toBe(true);
    expect(validateFamilyId('Sensors')).toBe(true);
  });

  it('returns false for invented IDs', () => {
    expect(validateFamilyId('BJT_DIGITAL')).toBe(false);
    expect(validateFamilyId('B99')).toBe(false);
    expect(validateFamilyId('UnknownCategory')).toBe(false);
  });

  it('returns false for null/undefined/empty', () => {
    expect(validateFamilyId(null)).toBe(false);
    expect(validateFamilyId(undefined)).toBe(false);
    expect(validateFamilyId('')).toBe(false);
  });

  it('is case-sensitive — strict match', () => {
    // 'b6' should not match 'B6' (database stores exact casing)
    expect(validateFamilyId('b6')).toBe(false);
    expect(validateFamilyId('microcontrollers')).toBe(false);
  });
});

describe('detectCanonicalCollision', () => {
  const inventory: CrossFamilyCanonicalIndex = [
    { attributeId: 'supply_current', attributeName: 'Supply Current', families: ['C4'] },
    { attributeId: 'output_voltage', attributeName: 'Output Voltage', families: ['C1', 'C2'] },
    { attributeId: 'vbr', attributeName: 'Breakdown Voltage', families: ['B4'] },
    { attributeId: 'ic', attributeName: 'Collector Current', families: ['B6'] },
    { attributeId: 'iout_max', attributeName: 'Max Output Current', families: ['C1', 'C2'] },
  ];

  it('catches the ICC / supply_current_ma case', () => {
    // The actual case from session: proposed 'supply_current_ma' for C4,
    // but 'supply_current' already exists in C4. Since it's same-family,
    // the function should NOT flag it (engineer is just re-affirming).
    // Different family scope (e.g., proposing this for B6) should flag.
    const sameScope = detectCanonicalCollision('supply_current_ma', inventory, 'C4');
    expect(sameScope).toBeNull(); // already in C4 scope

    const otherScope = detectCanonicalCollision('supply_current_ma', inventory, 'B6');
    expect(otherScope).not.toBeNull();
    expect(otherScope?.kind).toBe('near');
    expect(otherScope?.existingId).toBe('supply_current');
  });

  it('catches near-duplicate stems across families', () => {
    const collision = detectCanonicalCollision('output_voltage_max', inventory, 'C9');
    expect(collision?.kind).toBe('near');
    expect(collision?.existingId).toBe('output_voltage');
  });

  it('does NOT flag totally different canonicals', () => {
    expect(detectCanonicalCollision('switching_frequency', inventory, 'C2')).toBeNull();
    expect(detectCanonicalCollision('thermal_resistance', inventory, 'B5')).toBeNull();
  });

  it('does NOT over-fire on tiny shared stems', () => {
    // 'ic' is only 2 chars — should not match 'ic_max' or vice versa
    // (min stem length is 4 to declare collision).
    const fakeProp = detectCanonicalCollision('ic_max', inventory, 'B5');
    expect(fakeProp).toBeNull();
  });

  it('catches exact-name duplicates and tags them kind: exact', () => {
    const exact = detectCanonicalCollision('vbr', inventory, 'B3');
    expect(exact?.kind).toBe('exact');
    expect(exact?.existingId).toBe('vbr');
  });

  it('handles satellite-prefix stripping', () => {
    // Proposed '_supply_current_ma' should still flag against 'supply_current'
    const result = detectCanonicalCollision('_supply_current_ma', inventory, 'B6');
    expect(result?.kind).toBe('near');
    expect(result?.existingId).toBe('supply_current');
  });
});
