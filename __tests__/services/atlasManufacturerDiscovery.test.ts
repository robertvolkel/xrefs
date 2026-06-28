import { resolveDiscoveryScope } from '@/lib/services/atlasManufacturerDiscovery';
import { getAllLogicTables } from '@/lib/logicTables';

const passiveFamilyIds = getAllLogicTables()
  .filter((t) => t.category === 'Passives')
  .map((t) => t.familyId);
const icFamilyIds = getAllLogicTables()
  .filter((t) => t.category === 'Integrated Circuits')
  .map((t) => t.familyId);

describe('resolveDiscoveryScope', () => {
  describe('specific family grain', () => {
    it('resolves "BJTs" to family B6', () => {
      const scope = resolveDiscoveryScope('BJTs');
      expect(scope.kind).toBe('family');
      expect(scope.familyIds).toEqual(['B6']);
    });

    it('resolves "bipolar transistors" to family B6', () => {
      const scope = resolveDiscoveryScope('bipolar transistors');
      expect(scope.kind).toBe('family');
      expect(scope.familyIds).toEqual(['B6']);
    });

    it('resolves a QUALIFIED capacitor ("tantalum capacitors") to a single family, not the supertype', () => {
      const scope = resolveDiscoveryScope('tantalum capacitors');
      expect(scope.kind).toBe('family');
      expect(scope.familyIds).toEqual(['59']); // Tantalum Capacitors
    });

    it('resolves "current sense resistors" to family 54 (qualifier beats bare "resistors")', () => {
      const scope = resolveDiscoveryScope('current sense resistors');
      expect(scope.kind).toBe('family');
      expect(scope.familyIds).toEqual(['54']);
    });
  });

  describe('component supertype grain (category filter)', () => {
    it('resolves bare "capacitors" to the Capacitors supertype', () => {
      const scope = resolveDiscoveryScope('capacitors');
      expect(scope.kind).toBe('supertype');
      expect(scope.categories).toEqual(['Capacitors']);
    });

    it('resolves bare "resistors" to the Resistors supertype, NOT the single chip-resistor family', () => {
      const scope = resolveDiscoveryScope('resistors');
      expect(scope.kind).toBe('supertype');
      expect(scope.categories).toEqual(['Resistors']);
    });

    it('resolves bare "relays" to the Relays supertype (covers EMR + SSR), not just F1', () => {
      const scope = resolveDiscoveryScope('relays');
      expect(scope.kind).toBe('supertype');
      expect(scope.categories).toEqual(['Relays']);
    });

    it('resolves "diodes" and "transistors" to their supertypes', () => {
      expect(resolveDiscoveryScope('diodes')).toMatchObject({ kind: 'supertype', categories: ['Diodes'] });
      expect(resolveDiscoveryScope('transistors')).toMatchObject({ kind: 'supertype', categories: ['Transistors'] });
    });

    it('resolves "voltage regulators" to the Voltage Regulators supertype', () => {
      const scope = resolveDiscoveryScope('voltage regulators');
      expect(scope.kind).toBe('supertype');
      expect(scope.categories).toEqual(['Voltage Regulators']);
    });

    it('resolves an L0 category term ("microcontrollers") to its category', () => {
      const scope = resolveDiscoveryScope('microcontrollers');
      expect(scope.kind).toBe('supertype');
      expect(scope.categories).toEqual(['Microcontrollers']);
    });
  });

  describe('high-level group grain (registry-derived family set)', () => {
    it('resolves "passive components" to the full passive family set', () => {
      const scope = resolveDiscoveryScope('passive components');
      expect(scope.kind).toBe('group');
      expect(scope.familyIds).toEqual(expect.arrayContaining(passiveFamilyIds));
      expect(scope.familyIds).toContain('12'); // MLCC
      expect(scope.familyIds).toContain('52'); // chip resistors
      expect(scope.familyIds).not.toContain('B6'); // not a discrete
    });

    it('resolves "discrete semiconductors" to a group including B6', () => {
      const scope = resolveDiscoveryScope('discrete semiconductors');
      expect(scope.kind).toBe('group');
      expect(scope.familyIds).toContain('B6');
      expect(scope.familyIds).not.toContain('12');
    });

    it('resolves "ICs" to the integrated-circuit family set', () => {
      const scope = resolveDiscoveryScope('ICs');
      expect(scope.kind).toBe('group');
      expect(scope.familyIds).toEqual(expect.arrayContaining(icFamilyIds));
      expect(scope.familyIds).toContain('C1');
    });
  });

  describe('group vs supertype arbitration', () => {
    it('does NOT mistake "logic ics" for the ICs group — it is the Logic ICs supertype', () => {
      const scope = resolveDiscoveryScope('logic ICs');
      expect(scope.kind).toBe('supertype');
      expect(scope.categories).toEqual(['Logic ICs']);
    });
  });

  describe('edge cases', () => {
    it('returns unresolved for an unmappable term', () => {
      expect(resolveDiscoveryScope('gizmos').kind).toBe('unresolved');
    });

    it('returns unresolved for empty input', () => {
      expect(resolveDiscoveryScope('').kind).toBe('unresolved');
      expect(resolveDiscoveryScope(undefined).kind).toBe('unresolved');
    });

    it('resolves "all components" to the all-scope (no filters)', () => {
      const scope = resolveDiscoveryScope('all components');
      expect(scope.kind).toBe('all');
      expect(scope.familyIds).toBeUndefined();
      expect(scope.categories).toBeUndefined();
    });
  });
});
