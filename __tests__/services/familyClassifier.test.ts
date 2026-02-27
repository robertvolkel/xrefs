import { classifyFamily, enrichRectifierAttributes } from '@/lib/logicTables/familyClassifier';
import { getLogicTableForSubcategory } from '@/lib/logicTables';
import { PartAttributes, ParametricAttribute } from '@/lib/types';

// ============================================================
// HELPERS
// ============================================================

function makePart(overrides: Partial<{
  mpn: string;
  description: string;
  subcategory: string;
}> = {}) {
  return {
    mpn: overrides.mpn ?? 'TEST-001',
    manufacturer: 'TestCo',
    description: overrides.description ?? 'Test part',
    detailedDescription: '',
    category: 'Resistors' as const,
    subcategory: overrides.subcategory ?? 'Chip Resistor',
    status: 'Active' as const,
  };
}

function param(id: string, value: string, numericValue?: number): ParametricAttribute {
  return { parameterId: id, parameterName: id, value, numericValue, sortOrder: 0 };
}

function attrs(
  params: ParametricAttribute[],
  partOverrides: Partial<{ mpn: string; description: string; subcategory: string }> = {}
): PartAttributes {
  return { part: makePart(partOverrides), parameters: params };
}

// ============================================================
// TESTS
// ============================================================

describe('familyClassifier', () => {
  describe('classifyFamily', () => {
    // --- No variant detected: returns base family ---

    it('returns base family ID when no variant matches', () => {
      const a = attrs([param('resistance', '10kΩ', 10000)], { description: 'Standard chip resistor' });
      expect(classifyFamily('52', a)).toBe('52');
    });

    // --- Current Sense Resistors (54) ---

    it('classifies current sense resistor (low value + keyword)', () => {
      const a = attrs(
        [param('resistance', '0.01Ω', 0.01)],
        { description: 'Current Sense Resistors - SMD 0.01ohm 1% 1W' }
      );
      expect(classifyFamily('52', a)).toBe('54');
    });

    it('does NOT classify as current sense when resistance is high', () => {
      const a = attrs(
        [param('resistance', '100Ω', 100)],
        { description: 'Current sense chip resistor 100ohm' }
      );
      // High resistance — even though description says "current sense", value > 1Ω
      // AND sensing keyword required → fails because isLowValue is false
      expect(classifyFamily('52', a)).toBe('52');
    });

    it('does NOT classify as current sense when description lacks sensing keyword', () => {
      const a = attrs(
        [param('resistance', '0.5Ω', 0.5)],
        { description: 'Standard chip resistor 0.5ohm' }
      );
      expect(classifyFamily('52', a)).toBe('52');
    });

    // --- Chassis Mount / High Power Resistors (55) ---

    it('classifies chassis mount resistor by power package', () => {
      const a = attrs(
        [param('package_case', 'TO-220')],
        { description: 'Power resistor 100W' }
      );
      expect(classifyFamily('52', a)).toBe('55');
    });

    it('classifies chassis mount resistor by keyword', () => {
      const a = attrs(
        [param('power_rating', '50W', 50)],
        { description: 'Chassis mount resistor 50W' }
      );
      expect(classifyFamily('52', a)).toBe('55');
    });

    it('classifies high power non-SMD resistor', () => {
      const a = attrs(
        [
          param('power_rating', '10W', 10),
          param('package_case', 'Axial'),
        ],
        { description: 'Wirewound resistor 10W' }
      );
      expect(classifyFamily('52', a)).toBe('55');
    });

    it('does NOT classify high power SMD chip as chassis mount', () => {
      const a = attrs(
        [
          param('power_rating', '5W', 5),
          param('package_case', '2512'),
        ],
        { description: 'Thick film chip resistor 5W' }
      );
      expect(classifyFamily('52', a)).toBe('52');
    });

    // --- Through-Hole Resistors (53) ---

    it('classifies through-hole by mounting type', () => {
      const a = attrs(
        [param('mounting_type', 'Through Hole')],
        { description: 'Metal film resistor' }
      );
      expect(classifyFamily('52', a)).toBe('53');
    });

    it('classifies through-hole by description keyword', () => {
      const a = attrs(
        [],
        { description: 'Through hole carbon film resistor' }
      );
      expect(classifyFamily('52', a)).toBe('53');
    });

    it('classifies axial as through-hole', () => {
      const a = attrs(
        [param('mounting_type', 'Axial')],
        { description: 'Resistor' }
      );
      expect(classifyFamily('52', a)).toBe('53');
    });

    // --- Aluminum Polymer (60, base 58) ---

    it('classifies aluminum polymer from description', () => {
      const a = attrs(
        [],
        { description: 'Aluminum polymer capacitor 100µF', subcategory: 'Aluminum Electrolytic' }
      );
      expect(classifyFamily('58', a)).toBe('60');
    });

    it('classifies aluminum polymer from subcategory', () => {
      const a = attrs(
        [],
        { description: 'Cap 100µF', subcategory: 'Aluminum Polymer' }
      );
      expect(classifyFamily('58', a)).toBe('60');
    });

    it('does NOT classify tantalum polymer as aluminum polymer', () => {
      const a = attrs(
        [],
        { description: 'Tantalum polymer capacitor', subcategory: 'Aluminum Electrolytic' }
      );
      expect(classifyFamily('58', a)).toBe('58');
    });

    // --- Mica Capacitors (13, base 12) ---

    it('classifies mica capacitor from description', () => {
      const a = attrs(
        [],
        { description: 'Silver mica capacitor 100pF', subcategory: 'MLCC' }
      );
      expect(classifyFamily('12', a)).toBe('13');
    });

    it('classifies mica capacitor from dielectric param', () => {
      const a = attrs(
        [param('dielectric', 'Mica')],
        { description: 'Cap 100pF', subcategory: 'MLCC' }
      );
      expect(classifyFamily('12', a)).toBe('13');
    });

    // --- RF/Signal Inductors (72, base 71) ---

    it('classifies RF inductor by description keyword', () => {
      const a = attrs(
        [],
        { description: 'RF inductor 10nH', subcategory: 'Fixed Inductor' }
      );
      expect(classifyFamily('71', a)).toBe('72');
    });

    it('classifies RF inductor by nanohenry range with Q factor', () => {
      const a = attrs(
        [
          param('inductance', '0.0001µH', 0.0001), // 100nH in µH = very low
          param('q_factor', '30', 30),
        ],
        { description: 'Inductor', subcategory: 'Fixed Inductor' }
      );
      // inductance < 0.001 (nH range) + Q factor → RF
      expect(classifyFamily('71', a)).toBe('72');
    });

    it('does NOT classify high-inductance part as RF even with Q factor', () => {
      const a = attrs(
        [
          param('inductance', '10µH', 10),
          param('q_factor', '20', 20),
        ],
        { description: 'Power inductor', subcategory: 'Fixed Inductor' }
      );
      expect(classifyFamily('71', a)).toBe('71');
    });

    // --- Cross-family safety ---

    it('does not run resistor classifiers on non-resistor base family', () => {
      // Even if attributes look like a through-hole resistor, if base is 12 (MLCC), skip
      const a = attrs(
        [param('mounting_type', 'Through Hole')],
        { description: 'Through hole ceramic cap' }
      );
      expect(classifyFamily('12', a)).toBe('12');
    });

    // --- MOSFETs (B5) — standalone family, no variant classifier ---

    it('returns B5 unchanged (standalone family, not a variant)', () => {
      const a = attrs([], { description: 'N-Channel MOSFET 60V 30A' });
      expect(classifyFamily('B5', a)).toBe('B5');
    });

    it('does NOT classify MOSFET keywords under diode base family', () => {
      const a = attrs([], { description: 'N-Channel MOSFET 60V' });
      expect(classifyFamily('B1', a)).toBe('B1'); // MOSFET stays B1 base, not reclassified
    });

    // --- BJTs (B6) — standalone family, no variant classifier ---

    it('returns B6 unchanged (standalone family, not a variant)', () => {
      const a = attrs([], { description: 'NPN Bipolar Transistor 60V 200mA' });
      expect(classifyFamily('B6', a)).toBe('B6');
    });

    it('does NOT classify BJT keywords under diode base family', () => {
      const a = attrs([], { description: 'NPN Bipolar transistor' });
      expect(classifyFamily('B1', a)).toBe('B1'); // stays B1, not reclassified
    });

    // --- IGBTs (B7) — standalone family, no variant classifier ---

    it('returns B7 unchanged (standalone family, not a variant)', () => {
      const a = attrs([], { description: 'IGBT 600V 28A TO-220AB' });
      expect(classifyFamily('B7', a)).toBe('B7');
    });

    it('does NOT classify IGBT keywords under MOSFET base family', () => {
      const a = attrs([], { description: 'IGBT Trench Field Stop 1200V' });
      expect(classifyFamily('B5', a)).toBe('B5'); // stays B5, not reclassified
    });

    // --- Thyristors (B8) — standalone family, no variant classifier ---

    it('returns B8 unchanged (standalone family, not a variant)', () => {
      const a = attrs([], { description: 'TRIAC SENS GATE 600V 4A DPAK' });
      expect(classifyFamily('B8', a)).toBe('B8');
    });

    it('returns B8 unchanged for SCR description', () => {
      const a = attrs([], { description: 'SCR 400V 4A TO-225AA' });
      expect(classifyFamily('B8', a)).toBe('B8');
    });

    it('does NOT classify thyristor keywords under IGBT base family', () => {
      const a = attrs([], { description: 'TRIAC Alternistor Snubberless 600V' });
      expect(classifyFamily('B7', a)).toBe('B7'); // stays B7, not reclassified
    });

    // --- Unknown / unsupported families ---

    it('returns base family ID for families with no classifier rules', () => {
      const a = attrs([], { description: 'Some component' });
      expect(classifyFamily('65', a)).toBe('65'); // Varistors — no variant classifiers
      expect(classifyFamily('99', a)).toBe('99'); // Unknown family
    });
  });

  // ----------------------------------------------------------
  // enrichRectifierAttributes
  // ----------------------------------------------------------
  describe('enrichRectifierAttributes', () => {
    function diodePart(mpn = 'US1M', desc = 'Standard rectifier diode') {
      return {
        mpn,
        manufacturer: 'TestCo',
        description: desc,
        detailedDescription: '',
        category: 'Diodes' as const,
        subcategory: 'Rectifier Diode',
        status: 'Active' as const,
      };
    }

    it('does nothing if recovery_category already present', () => {
      const a: PartAttributes = {
        part: diodePart(),
        parameters: [param('recovery_category', 'Fast')],
      };
      enrichRectifierAttributes(a);
      expect(a.parameters).toHaveLength(1);
      expect(a.parameters[0].value).toBe('Fast');
    });

    it('infers Ultrafast from trr < 100ns', () => {
      const a: PartAttributes = {
        part: diodePart(),
        parameters: [param('trr', '35ns', 35)],
      };
      enrichRectifierAttributes(a);
      const cat = a.parameters.find(p => p.parameterId === 'recovery_category');
      expect(cat?.value).toBe('Ultrafast');
    });

    it('infers Fast from trr 100-500ns', () => {
      const a: PartAttributes = {
        part: diodePart(),
        parameters: [param('trr', '200ns', 200)],
      };
      enrichRectifierAttributes(a);
      const cat = a.parameters.find(p => p.parameterId === 'recovery_category');
      expect(cat?.value).toBe('Fast');
    });

    it('infers Standard from trr >= 500ns', () => {
      const a: PartAttributes = {
        part: diodePart(),
        parameters: [param('trr', '2000ns', 2000)],
      };
      enrichRectifierAttributes(a);
      const cat = a.parameters.find(p => p.parameterId === 'recovery_category');
      expect(cat?.value).toBe('Standard');
    });

    it('infers Ultrafast from description keyword', () => {
      const a: PartAttributes = {
        part: diodePart('US1M', 'Ultrafast recovery rectifier'),
        parameters: [],
      };
      enrichRectifierAttributes(a);
      const cat = a.parameters.find(p => p.parameterId === 'recovery_category');
      expect(cat?.value).toBe('Ultrafast');
    });

    it('infers Fast from description keyword', () => {
      const a: PartAttributes = {
        part: diodePart('FR107', 'Fast recovery rectifier diode'),
        parameters: [],
      };
      enrichRectifierAttributes(a);
      const cat = a.parameters.find(p => p.parameterId === 'recovery_category');
      expect(cat?.value).toBe('Fast');
    });

    it('infers Standard from description keyword', () => {
      const a: PartAttributes = {
        part: diodePart('1N4007', 'General purpose rectifier diode'),
        parameters: [],
      };
      enrichRectifierAttributes(a);
      const cat = a.parameters.find(p => p.parameterId === 'recovery_category');
      expect(cat?.value).toBe('Standard');
    });

    it('does not add parameter when nothing can be inferred', () => {
      const a: PartAttributes = {
        part: diodePart('MYSTERY', 'Some diode'),
        parameters: [],
      };
      enrichRectifierAttributes(a);
      expect(a.parameters.find(p => p.parameterId === 'recovery_category')).toBeUndefined();
    });
  });

  // --- JFET detection (B9, base: B5) ---

  describe('JFET classifier (B9 from B5)', () => {
    it('classifies JFET by description keyword "JFET"', () => {
      const a = attrs([], { description: 'JFET N-CH 35V TO92-3', subcategory: 'FET' });
      expect(classifyFamily('B5', a)).toBe('B9');
    });

    it('classifies JFET by description keyword "J-FET"', () => {
      const a = attrs([], { description: 'N-Channel J-FET Transistor', subcategory: 'FET' });
      expect(classifyFamily('B5', a)).toBe('B9');
    });

    it('classifies JFET by description "junction field effect"', () => {
      const a = attrs([], { description: 'Junction field effect transistor, N-channel', subcategory: 'FET' });
      expect(classifyFamily('B5', a)).toBe('B9');
    });

    it('classifies JFET by description "depletion mode fet"', () => {
      const a = attrs([], { description: 'Depletion mode FET, 25V', subcategory: 'FET' });
      expect(classifyFamily('B5', a)).toBe('B9');
    });

    it('classifies JFET by subcategory containing "jfet"', () => {
      const a = attrs([], { description: 'N-CH 25V', subcategory: 'Transistors - JFETs' });
      expect(classifyFamily('B5', a)).toBe('B9');
    });

    it('classifies JFET by MPN prefix "2SK170"', () => {
      const a = attrs([], { mpn: '2SK170BL', description: 'Transistor', subcategory: 'FET' });
      expect(classifyFamily('B5', a)).toBe('B9');
    });

    it('classifies JFET by MPN prefix "2SJ"', () => {
      const a = attrs([], { mpn: '2SJ74', description: 'Transistor', subcategory: 'FET' });
      expect(classifyFamily('B5', a)).toBe('B9');
    });

    it('classifies JFET by MPN prefix "2N5457"', () => {
      const a = attrs([], { mpn: '2N5457', description: 'Transistor', subcategory: 'FET' });
      expect(classifyFamily('B5', a)).toBe('B9');
    });

    it('classifies JFET by MPN prefix "J113"', () => {
      const a = attrs([], { mpn: 'J113', description: 'Transistor', subcategory: 'FET' });
      expect(classifyFamily('B5', a)).toBe('B9');
    });

    it('classifies JFET by MPN prefix "MPF102"', () => {
      const a = attrs([], { mpn: 'MPF102', description: 'Transistor', subcategory: 'FET' });
      expect(classifyFamily('B5', a)).toBe('B9');
    });

    it('classifies JFET by MPN prefix "BF245"', () => {
      const a = attrs([], { mpn: 'BF245A', description: 'Transistor', subcategory: 'FET' });
      expect(classifyFamily('B5', a)).toBe('B9');
    });

    it('classifies JFET by MPN prefix "IF"', () => {
      const a = attrs([], { mpn: 'IF3602', description: 'Transistor', subcategory: 'FET' });
      expect(classifyFamily('B5', a)).toBe('B9');
    });

    it('does NOT classify MOSFET as JFET', () => {
      const a = attrs([], { mpn: 'IRFZ44N', description: 'N-Channel MOSFET 55V 49A', subcategory: 'FET' });
      expect(classifyFamily('B5', a)).toBe('B5');
    });

    it('does NOT fire when base family is not B5', () => {
      const a = attrs([], { mpn: '2SK170BL', description: 'JFET N-CH', subcategory: 'BJT' });
      expect(classifyFamily('B6', a)).toBe('B6');
    });
  });

  // ----------------------------------------------------------
  // Switching Regulators (C2) — standalone, no variant classifier
  // ----------------------------------------------------------
  describe('Switching Regulators (C2) — registry mapping', () => {
    it('returns C2 unchanged (standalone family)', () => {
      const a = attrs([], { mpn: 'TPS54360DDAR', description: 'Buck converter 60V 3.5A' });
      expect(classifyFamily('C2', a)).toBe('C2');
    });

    it('maps "Switching Regulator" subcategory to C2', () => {
      const a = attrs([], { subcategory: 'Switching Regulator' });
      const lt = getLogicTableForSubcategory('Switching Regulator', a);
      expect(lt).toBeDefined();
      expect(lt!.familyId).toBe('C2');
    });

    it('maps "DC DC Switching Regulator" to C2', () => {
      const a = attrs([], { subcategory: 'DC DC Switching Regulator' });
      const lt = getLogicTableForSubcategory('DC DC Switching Regulator', a);
      expect(lt).toBeDefined();
      expect(lt!.familyId).toBe('C2');
    });

    it('maps "Buck Converter" to C2', () => {
      const a = attrs([], { subcategory: 'Buck Converter' });
      const lt = getLogicTableForSubcategory('Buck Converter', a);
      expect(lt).toBeDefined();
      expect(lt!.familyId).toBe('C2');
    });

    it('maps "Voltage Regulators - DC DC Switching Controllers" to C2', () => {
      const a = attrs([], { subcategory: 'Voltage Regulators - DC DC Switching Controllers' });
      const lt = getLogicTableForSubcategory('Voltage Regulators - DC DC Switching Controllers', a);
      expect(lt).toBeDefined();
      expect(lt!.familyId).toBe('C2');
    });
  });

  // ----------------------------------------------------------
  // GATE DRIVERS (C3) — Standalone family, no variant detection needed
  // ----------------------------------------------------------
  describe('Gate Drivers (C3) — registry mapping', () => {
    it('returns C3 unchanged (standalone family)', () => {
      const a = attrs([], { mpn: 'IR2104', description: 'IC GATE DRVR HALF-BRIDGE 8DIP' });
      expect(classifyFamily('C3', a)).toBe('C3');
    });

    it('maps "Gate Driver" to C3', () => {
      const lt = getLogicTableForSubcategory('Gate Driver');
      expect(lt).toBeDefined();
      expect(lt!.familyId).toBe('C3');
    });

    it('maps "MOSFET Driver" to C3', () => {
      const lt = getLogicTableForSubcategory('MOSFET Driver');
      expect(lt).toBeDefined();
      expect(lt!.familyId).toBe('C3');
    });

    it('maps "Half-Bridge Driver" to C3', () => {
      const lt = getLogicTableForSubcategory('Half-Bridge Driver');
      expect(lt).toBeDefined();
      expect(lt!.familyId).toBe('C3');
    });

    it('maps "Isolated Gate Driver" to C3', () => {
      const lt = getLogicTableForSubcategory('Isolated Gate Driver');
      expect(lt).toBeDefined();
      expect(lt!.familyId).toBe('C3');
    });

    it('maps "Isolators - Gate Drivers" to C3', () => {
      const lt = getLogicTableForSubcategory('Isolators - Gate Drivers');
      expect(lt).toBeDefined();
      expect(lt!.familyId).toBe('C3');
    });

    it('maps "Gate Drivers" (Digikey category name) to C3', () => {
      const lt = getLogicTableForSubcategory('Gate Drivers');
      expect(lt).toBeDefined();
      expect(lt!.familyId).toBe('C3');
    });
  });
});
