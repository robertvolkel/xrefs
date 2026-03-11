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
import { jfetsLogicTable } from './jfets';
import { ldoLogicTable } from './ldo';
import { switchingRegulatorLogicTable } from './switchingRegulator';
import { gateDriverLogicTable } from './gateDriver';
import { opampComparatorLogicTable } from './opampComparator';
import { c5LogicICsLogicTable } from './c5LogicICs';
import { voltageReferenceLogicTable } from './voltageReference';
import { interfaceICsLogicTable } from './interfaceICs';
import { timersOscillatorsLogicTable } from './timersOscillators';
import { adcLogicTable } from './adc';
import { dacLogicTable } from './dac';
// Block D: Frequency Control & Protection
import { d1CrystalsLogicTable } from './d1Crystals';
import { d2FusesLogicTable } from './d2Fuses';
// Block E: Optoelectronics
import { e1OptocouplerLogicTable } from './e1Optocouplers';
// Block F: Relays
import { f1RelayLogicTable } from './f1Relays';
import { f2SolidStateRelayLogicTable } from './f2SolidStateRelays';
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
  'B9': jfetsLogicTable,
  // Block C: Power Management ICs
  'C1': ldoLogicTable,
  'C2': switchingRegulatorLogicTable,
  'C3': gateDriverLogicTable,
  'C4': opampComparatorLogicTable,
  'C5': c5LogicICsLogicTable,
  'C6': voltageReferenceLogicTable,
  'C7': interfaceICsLogicTable,
  'C8': timersOscillatorsLogicTable,
  'C9': adcLogicTable,
  'C10': dacLogicTable,
  // Block D: Frequency Control & Protection
  'D1': d1CrystalsLogicTable,
  'D2': d2FusesLogicTable,
  // Block E: Optoelectronics
  'E1': e1OptocouplerLogicTable,
  // Block F: Relays
  'F1': f1RelayLogicTable,
  'F2': f2SolidStateRelayLogicTable,
};

export { logicTableRegistry };

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
  // JFETs (Family B9)
  'JFET': 'B9',
  'J-FET': 'B9',
  'Junction FET': 'B9',
  'Junction Field-Effect Transistor': 'B9',
  'Transistors - JFETs': 'B9',
  'JFETs': 'B9',
  // --- Block C: Power Management ICs ---
  // Linear Voltage Regulators / LDOs (Family C1)
  'Linear Voltage Regulator': 'C1',
  'LDO': 'C1',
  'Low-Dropout Regulator': 'C1',
  'Voltage Regulator - Linear': 'C1',
  'Voltage Regulators - Linear': 'C1',
  'Voltage Regulators - Linear Regulator': 'C1',
  'Linear Regulator': 'C1',
  // Switching Regulators / DC-DC Converters & Controllers (Family C2)
  'Switching Regulator': 'C2',
  'DC DC Switching Regulator': 'C2',
  'DC DC Switching Controller': 'C2',
  'DC-DC Converter': 'C2',
  'Switching Controller': 'C2',
  'Buck Converter': 'C2',
  'Boost Converter': 'C2',
  'Buck-Boost Converter': 'C2',
  'SEPIC Converter': 'C2',
  'Flyback Converter': 'C2',
  'Forward Converter': 'C2',
  'Voltage Regulators - DC DC Switching Regulators': 'C2',
  'Voltage Regulators - DC DC Switching Controllers': 'C2',
  // Gate Drivers (Family C3)
  'Gate Driver': 'C3',
  'MOSFET Driver': 'C3',
  'IGBT Driver': 'C3',
  'Half-Bridge Driver': 'C3',
  'Half Bridge Driver': 'C3',
  'High-Side Low-Side Driver': 'C3',
  'High-Side/Low-Side Gate Driver': 'C3',
  'Gate Drivers': 'C3',
  'Isolated Gate Driver': 'C3',
  'Non-Isolated Gate Driver': 'C3',
  'Isolators - Gate Drivers': 'C3',
  // Op-Amps / Comparators / Instrumentation Amplifiers (Family C4)
  'Operational Amplifier': 'C4',
  'Op-Amp': 'C4',
  'Op Amp': 'C4',
  'Comparator': 'C4',
  'Voltage Comparator': 'C4',
  'Instrumentation Amplifier': 'C4',
  'Buffer Amplifier': 'C4',
  'Amplifiers - Op Amps': 'C4',
  'Operational Amplifiers': 'C4',
  'Comparators': 'C4',
  'Instrumentation, OP Amp, Buffer Amps': 'C4',
  // Logic ICs — 74-Series Standard Logic (Family C5)
  'Logic Gate': 'C5',
  'Logic IC': 'C5',
  'Logic': 'C5',
  'Buffer': 'C5',
  'Inverter': 'C5',
  'Flip-Flop': 'C5',
  'Flip Flop': 'C5',
  'Latch': 'C5',
  'Counter': 'C5',
  'Shift Register': 'C5',
  'Decoder': 'C5',
  'Multiplexer': 'C5',
  'Bus Transceiver': 'C5',
  'Gates and Inverters': 'C5',
  'Buffers, Drivers, Receivers, Transceivers': 'C5',
  'Flip Flops': 'C5',
  'Latches': 'C5',
  'Counters, Dividers': 'C5',
  'Shift Registers': 'C5',
  'Signal Switches, Multiplexers, Decoders': 'C5',
  'Logic - Gates and Inverters': 'C5',
  'Logic - Buffers, Drivers, Receivers, Transceivers': 'C5',
  'Logic - Flip Flops': 'C5',
  'Logic - Latches': 'C5',
  'Logic - Counters, Dividers': 'C5',
  'Logic - Shift Registers': 'C5',
  'Logic - Signal Switches, Multiplexers, Decoders': 'C5',
  // Voltage References (Family C6)
  'Voltage Reference': 'C6',
  'Voltage References': 'C6',
  'Precision Reference': 'C6',
  'Shunt Reference': 'C6',
  'Series Reference': 'C6',
  'Band-Gap Reference': 'C6',
  'Buried Zener Reference': 'C6',
  'Voltage Reference - Adjustable': 'C6',
  'VREF': 'C6',
  // Interface ICs (Family C7)
  'RS-485 Transceiver': 'C7',
  'RS-485 Interface': 'C7',
  'RS-422 Transceiver': 'C7',
  'RS-485': 'C7',
  'CAN Transceiver': 'C7',
  'CAN Interface': 'C7',
  'CAN Bus Transceiver': 'C7',
  'CAN FD Transceiver': 'C7',
  'I2C Bus Buffer': 'C7',
  'I2C Interface': 'C7',
  'I2C/SMBus Interface': 'C7',
  'SMBus Interface': 'C7',
  'USB Interface': 'C7',
  'USB Transceiver': 'C7',
  'Interface IC': 'C7',
  // Digikey leaf category names (verified Mar 2026)
  'Drivers, Receivers, Transceivers': 'C7',
  'Interface Transceiver': 'C7',
  'Digital Isolators': 'C7',
  // Timers and Oscillators (Family C8)
  '555 Timer': 'C8',
  '556 Timer': 'C8',
  'NE555': 'C8',
  'Timer IC': 'C8',
  'Programmable Timer': 'C8',
  'Crystal Oscillator': 'C8',
  'Oscillator': 'C8',
  'Clock Oscillator': 'C8',
  'MEMS Oscillator': 'C8',
  'Silicon Oscillator': 'C8',
  'Programmable Oscillator': 'C8',
  'TCXO': 'C8',
  'VCXO': 'C8',
  'OCXO': 'C8',
  'Frequency Reference': 'C8',
  // Digikey leaf category names (verified Mar 2026)
  'Programmable Timers and Oscillators': 'C8',
  'Oscillators': 'C8',
  // ADCs — Analog-to-Digital Converters (Family C9)
  'ADC': 'C9',
  'Analog to Digital Converter': 'C9',
  'A/D Converter': 'C9',
  'SAR ADC': 'C9',
  'Delta-Sigma ADC': 'C9',
  'Sigma-Delta ADC': 'C9',
  'Pipeline ADC': 'C9',
  'Flash ADC': 'C9',
  'Data Acquisition': 'C9',
  'Successive Approximation': 'C9',
  // Digikey leaf category name (verified Mar 2026)
  'Analog to Digital Converters (ADCs)': 'C9',
  // --- DACs — Digital-to-Analog Converters (Family C10) ---
  'DAC': 'C10',
  'Digital to Analog Converter': 'C10',
  'D/A Converter': 'C10',
  'Voltage Output DAC': 'C10',
  'Current Output DAC': 'C10',
  'Audio DAC': 'C10',
  'Waveform Generator': 'C10',
  'Digital-to-Analog Converter': 'C10',
  'Data Conversion - DAC': 'C10',
  'Data Conversion - Digital to Analog': 'C10',
  // Digikey leaf category name (verified Mar 2026)
  'Digital to Analog Converters (DACs)': 'C10',
  // --- Block D: Frequency Control ---
  // Crystals — Quartz Resonators (Family D1)
  'Crystal': 'D1',
  'Quartz Crystal': 'D1',
  'Quartz Resonator': 'D1',
  'Crystal Resonator': 'D1',
  'Crystals': 'D1',
  'Tuning Fork Crystal': 'D1',
  'Tuning Fork': 'D1',
  '32.768 kHz Crystal': 'D1',
  // Fuses — Traditional Overcurrent Protection (Family D2)
  'Fuse': 'D2',
  'Cartridge Fuse': 'D2',
  'Glass Fuse': 'D2',
  'Ceramic Fuse': 'D2',
  'SMD Fuse': 'D2',
  'Surface Mount Fuse': 'D2',
  'Blade Fuse': 'D2',
  'Automotive Fuse': 'D2',
  'Fast-Blow Fuse': 'D2',
  'Slow-Blow Fuse': 'D2',
  'Time-Delay Fuse': 'D2',
  'Circuit Protection Fuse': 'D2',
  'Fuses': 'D2',
  'Automotive Fuses': 'D2',
  // --- Block E: Optoelectronics ---
  // Optocouplers / Photocouplers (Family E1)
  'Optocoupler': 'E1',
  'Photocoupler': 'E1',
  'Optoisolator': 'E1',
  'Opto Isolator': 'E1',
  'Optical Isolator': 'E1',
  'Transistor Optocoupler': 'E1',
  'Logic Output Optocoupler': 'E1',
  'Phototransistor Output': 'E1',
  'Photodarlington Output': 'E1',
  'Optoisolators - Transistor, Photovoltaic Output': 'E1',
  'Optoisolators - Logic Output': 'E1',
  // --- Block F: Relays ---
  // Electromechanical Relays — EMR (Family F1)
  'Relay': 'F1',
  'EMR': 'F1',
  'Electromechanical Relay': 'F1',
  'Power Relay': 'F1',
  'Signal Relay': 'F1',
  'Automotive Relay': 'F1',
  'PCB Relay': 'F1',
  'General Purpose Relay': 'F1',
  'SPDT Relay': 'F1',
  'DPDT Relay': 'F1',
  'Form C Relay': 'F1',
  'Normally Open Relay': 'F1',
  // Solid State Relays — SSR (Family F2)
  'Solid State Relay': 'F2',
  'SSR': 'F2',
  'Solid-State Relay': 'F2',
  'SSR AC': 'F2',
  'SSR DC': 'F2',
  'SSR TRIAC': 'F2',
  'SSR MOSFET': 'F2',
  'AC Solid State Relay': 'F2',
  'DC Solid State Relay': 'F2',
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
  'B9': '2026-02-25',
  // Block C: Power Management ICs
  'C1': '2026-02-26',
  'C2': '2026-02-26',
  'C3': '2026-02-26',
  'C4': '2026-02-26',
  'C5': '2026-02-28',
  'C6': '2026-03-01',
  'C7': '2026-03-02',
  'C8': '2026-03-02',
  'C9': '2026-03-02',
  'C10': '2026-03-02',
  // Block D: Frequency Control & Protection
  'D1': '2026-03-10',
  'D2': '2026-03-11',
  // Block E: Optoelectronics
  'E1': '2026-03-11',
  // Block F: Relays
  'F1': '2026-03-11',
  'F2': '2026-03-11',
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
