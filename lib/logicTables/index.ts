import { LogicTable, PartAttributes } from '../types';
import { mlccLogicTable } from './mlcc';
import { chipResistorsLogicTable } from './chipResistors';
import { tantalumCapacitorsLogicTable } from './tantalumCapacitors';
import { powerInductorsLogicTable } from './powerInductors';
import { filmCapacitorsLogicTable } from './filmCapacitors';
import { aluminumElectrolyticLogicTable } from './aluminumElectrolytic';
import { ferriteBeadsLogicTable } from './ferriteBeads';
import { commonModeChokesLogicTable } from './commonModeChokes';
import { supercapacitorsLogicTable } from './supercapacitors';
import { ntcThermistorLogicTable, ptcThermistorLogicTable } from './thermistors';
import { varistorsMOVsLogicTable } from './varistorsMOVs';
import { ptcResettableFusesLogicTable } from './ptcResettableFuses';
import { throughHoleResistorsLogicTable } from './throughHoleResistors';
import { currentSenseResistorsLogicTable } from './currentSenseResistors';
import { chassisMountResistorsLogicTable } from './chassisMountResistors';
import { aluminumPolymerLogicTable } from './aluminumPolymer';
import { micaCapacitorsLogicTable } from './micaCapacitors';
import { rfSignalInductorsLogicTable } from './rfSignalInductors';
import { rectifierDiodesLogicTable } from './rectifierDiodes';
import { schottkyDiodesLogicTable } from './schottkyDiodes';
import { zenerDiodesLogicTable } from './zenerDiodes';
import { tvsDiodesLogicTable } from './tvsDiodes';
import { mosfetsLogicTable } from './mosfets';
import { bjtTransistorsLogicTable } from './bjtTransistors';
import { igbtsLogicTable } from './igbts';
import { thyristorsLogicTable } from './thyristors';
import { classifyFamily } from './familyClassifier';

/** Registry of all logic tables, keyed by family ID */
const logicTableRegistry: Record<string, LogicTable> = {
  '12': mlccLogicTable,
  '13': micaCapacitorsLogicTable,
  '52': chipResistorsLogicTable,
  '53': throughHoleResistorsLogicTable,
  '54': currentSenseResistorsLogicTable,
  '55': chassisMountResistorsLogicTable,
  '58': aluminumElectrolyticLogicTable,
  '59': tantalumCapacitorsLogicTable,
  '60': aluminumPolymerLogicTable,
  '61': supercapacitorsLogicTable,
  '64': filmCapacitorsLogicTable,
  '65': varistorsMOVsLogicTable,
  '66': ptcResettableFusesLogicTable,
  '67': ntcThermistorLogicTable,
  '68': ptcThermistorLogicTable,
  '69': commonModeChokesLogicTable,
  '70': ferriteBeadsLogicTable,
  '71': powerInductorsLogicTable,
  '72': rfSignalInductorsLogicTable,
  // Block B: Discrete Semiconductors
  'B1': rectifierDiodesLogicTable,
  'B2': schottkyDiodesLogicTable,
  'B3': zenerDiodesLogicTable,
  'B4': tvsDiodesLogicTable,
  'B5': mosfetsLogicTable,
  'B6': bjtTransistorsLogicTable,
  'B7': igbtsLogicTable,
  'B8': thyristorsLogicTable,
};

/** Map subcategory strings to family IDs */
const subcategoryToFamily: Record<string, string> = {
  // MLCC (Family 12)
  'MLCC': '12',
  'Ceramic': '12',
  'Multilayer Ceramic': '12',
  'Ceramic Capacitor': '12',
  // Mica Capacitors (Family 13)
  'Mica Capacitor': '13',
  'Silver Mica': '13',
  'Mica': '13',
  // Chip Resistors (Family 52) — also base for families 53, 54, 55 via classifier
  'Chip Resistor': '52',
  'Thick Film': '52',
  'Thin Film': '52',
  'Resistor': '52',
  'Chip Resistor - Surface Mount': '52',
  // Through-Hole Resistors (Family 53) — direct subcategory matches
  'Through Hole Resistor': '53',
  'Axial Resistor': '53',
  // Current Sense Resistors (Family 54) — direct subcategory matches
  'Current Sense Resistor': '54',
  'Current Sense': '54',
  // Chassis Mount Resistors (Family 55) — direct subcategory matches
  'Chassis Mount Resistor': '55',
  'Power Resistor': '55',
  // Aluminum Electrolytic (Family 58) — also base for family 60 via classifier
  'Aluminum Electrolytic': '58',
  'Electrolytic': '58',
  // Tantalum Capacitors (Family 59)
  'Tantalum': '59',
  'Tantalum Capacitor': '59',
  'Tantalum Polymer': '59',
  // Aluminum Polymer Capacitors (Family 60) — direct subcategory matches
  'Aluminum Polymer': '60',
  'Polymer Capacitor': '60',
  // Supercapacitors (Family 61)
  'Supercapacitor': '61',
  'EDLC': '61',
  'Ultracapacitor': '61',
  'Electric Double Layer': '61',
  // Film Capacitors (Family 64)
  'Film Capacitor': '64',
  'Film': '64',
  'Polypropylene': '64',
  'Polyester': '64',
  // Varistors / MOVs (Family 65)
  'Varistor': '65',
  'MOV': '65',
  'Metal Oxide Varistor': '65',
  'TVS - Varistor': '65',
  // PTC Resettable Fuses (Family 66)
  'PTC Resettable Fuse': '66',
  'Resettable Fuse': '66',
  'Polymeric PTC': '66',
  'PolySwitch': '66',
  'PPTC': '66',
  // NTC Thermistors (Family 67)
  'NTC Thermistor': '67',
  'NTC': '67',
  'Thermistor': '67',
  // PTC Thermistors (Family 68)
  'PTC Thermistor': '68',
  'PTC': '68',
  // Common Mode Chokes (Family 69)
  'Common Mode Choke': '69',
  'CMC': '69',
  'Common Mode Filter': '69',
  // Ferrite Beads (Family 70)
  'Ferrite Bead': '70',
  'Ferrite': '70',
  'Ferrite Bead and Chip': '70',
  // Power Inductors (Family 71) — also base for family 72 via classifier
  'Power Inductor': '71',
  'Inductor': '71',
  'Shielded Inductor': '71',
  'Fixed Inductor': '71',
  // RF/Signal Inductors (Family 72) — direct subcategory matches
  'RF Inductor': '72',
  'Signal Inductor': '72',
  'RF Choke': '72',
  // --- Block B: Discrete Semiconductors ---
  // Rectifier Diodes (Family B1)
  'Rectifier Diode': 'B1',
  'Rectifier': 'B1',
  'Diode - Rectifier': 'B1',
  'Diodes - Rectifiers - Single': 'B1',
  'Diodes - Rectifiers - Array': 'B1',
  'Diodes - Bridge Rectifiers': 'B1',
  'Fast Recovery Diode': 'B1',
  'Ultrafast Recovery Diode': 'B1',
  'Standard Recovery Diode': 'B1',
  'Recovery Rectifier': 'B1',
  // Schottky Barrier Diodes (Family B2)
  'Schottky Diode': 'B2',
  'Schottky Rectifier': 'B2',
  'Schottky Barrier Diode': 'B2',
  'SiC Schottky Diode': 'B2',
  'SiC Diode': 'B2',
  'Diodes - Schottky': 'B2',
  // Zener Diodes / Voltage Reference Diodes (Family B3)
  'Zener Diode': 'B3',
  'Voltage Reference Diode': 'B3',
  'Zener': 'B3',
  'Diodes - Zener - Single': 'B3',
  'Diodes - Zener - Array': 'B3',
  'Zener Voltage Regulator': 'B3',
  // TVS Diodes / Transient Voltage Suppressors (Family B4)
  'TVS Diode': 'B4',
  'TVS': 'B4',
  'Transient Voltage Suppressor': 'B4',
  'TVS - Diodes': 'B4',
  'Diodes - TVS': 'B4',
  'ESD Protection Diode': 'B4',
  'ESD Suppressor': 'B4',
  'Surge Suppressor': 'B4',
  // MOSFETs (Family B5)
  'MOSFET': 'B5',
  'Power MOSFET': 'B5',
  'N-Channel MOSFET': 'B5',
  'P-Channel MOSFET': 'B5',
  'SiC MOSFET': 'B5',
  'GaN FET': 'B5',
  'GaN MOSFET': 'B5',
  'FETs - MOSFETs - Single': 'B5',
  'FETs - MOSFETs - Arrays': 'B5',
  // BJTs (Family B6)
  'BJT': 'B6',
  'NPN Transistor': 'B6',
  'PNP Transistor': 'B6',
  'NPN BJT': 'B6',
  'PNP BJT': 'B6',
  'Bipolar Transistor': 'B6',
  'Bipolar Junction Transistor': 'B6',
  'Transistors - Bipolar (BJT) - Single': 'B6',
  'Transistors - Bipolar (BJT) - Array': 'B6',
  'Small Signal Transistor': 'B6',
  'General Purpose Transistor': 'B6',
  // IGBTs (Family B7)
  'IGBT': 'B7',
  'Insulated Gate Bipolar Transistor': 'B7',
  'IGBTs - Single': 'B7',
  'IGBT Module': 'B7',
  'Transistors - IGBTs - Single': 'B7',
  'Transistors - IGBTs - Arrays': 'B7',
  // Thyristors / TRIACs / SCRs (Family B8)
  'SCR': 'B8',
  'Silicon Controlled Rectifier': 'B8',
  'TRIAC': 'B8',
  'Triode AC Switch': 'B8',
  'DIAC': 'B8',
  'SIDAC': 'B8',
  'Thyristor': 'B8',
  'Thyristors - SCRs': 'B8',
  'Thyristors - TRIACs': 'B8',
  'Thyristors - DIACs, SIDACs': 'B8',
};

/** Last-updated dates for each family's logic table (from git history) */
const familyLastUpdated: Record<string, string> = {
  '12': '2026-02-11',
  '13': '2026-02-19',
  '52': '2026-02-11',
  '53': '2026-02-19',
  '54': '2026-02-19',
  '55': '2026-02-19',
  '58': '2026-02-11',
  '59': '2026-02-11',
  '60': '2026-02-19',
  '61': '2026-02-11',
  '64': '2026-02-11',
  '65': '2026-02-19',
  '66': '2026-02-19',
  '67': '2026-02-11',
  '68': '2026-02-11',
  '69': '2026-02-11',
  '70': '2026-02-11',
  '71': '2026-02-20',
  '72': '2026-02-19',
  'B1': '2026-02-19',
  'B2': '2026-02-24',
  'B3': '2026-02-24',
  'B4': '2026-02-24',
  'B5': '2026-02-24',
  'B6': '2026-02-25',
  'B7': '2026-02-25',
  'B8': '2026-02-25',
};

export function getFamilyLastUpdated(familyId: string): string {
  return familyLastUpdated[familyId] ?? 'unknown';
}

export function getLogicTable(familyId: string): LogicTable | null {
  return logicTableRegistry[familyId] ?? null;
}

/**
 * Get the logic table for a part's subcategory.
 * When PartAttributes are provided, the classifier attempts to detect
 * variant families (e.g., current sense resistors within chip resistors).
 */
export function getLogicTableForSubcategory(
  subcategory: string,
  attrs?: PartAttributes
): LogicTable | null {
  const baseFamilyId = subcategoryToFamily[subcategory];
  if (!baseFamilyId) return null;

  if (attrs) {
    const variantId = classifyFamily(baseFamilyId, attrs);
    return getLogicTable(variantId);
  }

  return getLogicTable(baseFamilyId);
}

export function getAllLogicTables(): LogicTable[] {
  return Object.values(logicTableRegistry);
}

/** Check if a subcategory has a logic table */
export function isFamilySupported(subcategory: string): boolean {
  return subcategory in subcategoryToFamily;
}

/** Get human-readable names of all supported families (deduplicated) */
export function getSupportedFamilyNames(): string[] {
  return [...new Set(Object.values(logicTableRegistry).map(t => t.familyName))];
}

export { classifyFamily, enrichRectifierAttributes } from './familyClassifier';
