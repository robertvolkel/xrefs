import { LogicTable } from '../types';
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

/** Registry of all logic tables, keyed by family ID */
const logicTableRegistry: Record<string, LogicTable> = {
  '12': mlccLogicTable,
  '52': chipResistorsLogicTable,
  '58': aluminumElectrolyticLogicTable,
  '59': tantalumCapacitorsLogicTable,
  '61': supercapacitorsLogicTable,
  '64': filmCapacitorsLogicTable,
  '67': ntcThermistorLogicTable,
  '68': ptcThermistorLogicTable,
  '69': commonModeChokesLogicTable,
  '70': ferriteBeadsLogicTable,
  '71': powerInductorsLogicTable,
};

/** Map subcategory strings to family IDs */
const subcategoryToFamily: Record<string, string> = {
  // MLCC (Family 12)
  'MLCC': '12',
  'Ceramic': '12',
  'Multilayer Ceramic': '12',
  'Ceramic Capacitor': '12',
  // Chip Resistors (Family 52)
  'Chip Resistor': '52',
  'Thick Film': '52',
  'Thin Film': '52',
  'Resistor': '52',
  'Chip Resistor - Surface Mount': '52',
  // Aluminum Electrolytic (Family 58)
  'Aluminum Electrolytic': '58',
  'Electrolytic': '58',
  'Aluminum Polymer': '58',
  // Tantalum Capacitors (Family 59)
  'Tantalum': '59',
  'Tantalum Capacitor': '59',
  'Tantalum Polymer': '59',
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
  // NTC Thermistors (Family 67)
  'NTC Thermistor': '67',
  'NTC': '67',
  'Thermistor': '67',
  // PTC Thermistors (Family 68)
  'PTC Thermistor': '68',
  'PTC': '68',
  'Resettable Fuse': '68',
  // Common Mode Chokes (Family 69)
  'Common Mode Choke': '69',
  'CMC': '69',
  'Common Mode Filter': '69',
  // Ferrite Beads (Family 70)
  'Ferrite Bead': '70',
  'Ferrite': '70',
  'Ferrite Bead and Chip': '70',
  // Power Inductors (Family 71)
  'Power Inductor': '71',
  'Inductor': '71',
  'Shielded Inductor': '71',
  'Fixed Inductor': '71',
};

export function getLogicTable(familyId: string): LogicTable | null {
  return logicTableRegistry[familyId] ?? null;
}

export function getLogicTableForSubcategory(subcategory: string): LogicTable | null {
  const familyId = subcategoryToFamily[subcategory];
  if (!familyId) return null;
  return getLogicTable(familyId);
}

export function getAllLogicTables(): LogicTable[] {
  return Object.values(logicTableRegistry);
}
