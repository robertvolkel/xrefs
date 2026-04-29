/**
 * Digikey → Internal Type Mapper
 *
 * Converts Digikey API response objects to our internal types
 * (Part, PartAttributes, PartSummary, SearchResult).
 */

import {
  Part,
  PartAttributes,
  ParametricAttribute,
  PriceBreak,
  PartSummary,
  SearchResult,
  ComponentCategory,
  PartStatus,
} from '../types';
import { DigikeyProduct, DigikeyCategory, DigikeyKeywordResponse, DigikeyParameter } from './digikeyClient';
import { getParamMappings, hasCategoryMapping } from './digikeyParamMap';

/** Traverse Digikey's hierarchical category to find the most specific (deepest) name */
function getDeepestCategoryName(category: DigikeyCategory | undefined): string {
  if (!category) return '';
  let current = category;
  while (current.ChildCategories && current.ChildCategories.length > 0) {
    current = current.ChildCategories[0];
  }
  return current.Name;
}

/** Traverse Digikey's hierarchical category to find the most specific (deepest) CategoryId */
function getDeepestCategoryId(category: DigikeyCategory | undefined): number | undefined {
  if (!category) return undefined;
  let current = category;
  while (current.ChildCategories && current.ChildCategories.length > 0) {
    current = current.ChildCategories[0];
  }
  return current.CategoryId;
}

// ============================================================
// CATEGORY MAPPING
// ============================================================

/** Map Digikey category names to our ComponentCategory */
export function mapCategory(categoryName: string): ComponentCategory {
  const lower = categoryName.toLowerCase();
  if (lower.includes('capacitor')) return 'Capacitors';
  if (lower.includes('resistor')) return 'Resistors';
  if (lower.includes('inductor')) return 'Inductors';
  if (lower.includes('thyristor') || lower.includes(' scr') || lower.startsWith('scr') || lower.includes('triac') || lower.includes('diac')) return 'Thyristors';
  if (lower.includes('diode') || lower.includes('rectifier')) return 'Diodes';
  if (lower.includes('transistor') || lower.includes('mosfet') || lower.includes('bjt') || lower.includes('igbt')) return 'Transistors';
  if (lower.includes('connector') || lower.includes('header') || lower.includes('socket')) return 'Connectors';
  if (lower.includes('varistor') || lower.includes('thermistor')) return 'Protection';
  // PTC Resettable Fuses (Family 66) — must come before D2 general 'fuse' check
  if (lower.includes('ptc resettable') || lower.includes('pptc') || lower.includes('polyfuse')) return 'Protection';
  // Traditional Fuses (Family D2) — cartridge, SMD, blade, automotive
  if (lower.includes('fuse')) return 'Protection';
  if (lower.includes('voltage reference')) return 'Voltage References';
  if (lower.includes('voltage regulator') || lower.includes('ldo')) return 'Voltage Regulators';
  if (lower.includes('switching regulator') || lower.includes('switching controller') || lower.includes('dc dc')) return 'Voltage Regulators';
  if (lower.includes('gate driver')) return 'Gate Drivers';
  if (lower.includes('op amp') || lower.includes('buffer amp') || lower.includes('comparator') || lower.includes('instrumentation')) return 'Amplifiers';
  // DACs (Family C10) — voltage-output, current-output, and audio DACs
  if (lower.includes('digital to analog') || (lower.includes('dac') && !lower.includes('diac'))) return 'DACs';
  // ADCs (Family C9) — all architectures in one Digikey category
  if (lower.includes('analog to digital') || (lower.includes('adc') && !lower.includes('ladder'))) return 'ADCs';
  // Optocouplers / Photocouplers (Family E1) — MUST come before any generic 'isolator' check
  if (lower.includes('optoisolator') || lower.includes('optocoupler') || lower.includes('photocoupler')) return 'Optocouplers';
  // Crystals (Family D1) — 2-pin passive quartz resonators, MUST come BEFORE C8 oscillator checks
  // Digikey category "Crystals" under parent "Crystals, Oscillators, Resonators"
  // Guard: "Crystal Oscillator" should route to C8, not D1
  if (lower.includes('crystal') && !lower.includes('oscillator') && !lower.includes('resonator ceramic')) return 'Crystals';
  // Timers and Oscillators (Family C8) — 555 timers + packaged oscillators
  if (lower.includes('programmable timer')) return 'Timers and Oscillators';
  if (lower.includes('555 timer')) return 'Timers and Oscillators';
  if (lower.includes('oscillator') && !lower.includes('local oscillator')) return 'Timers and Oscillators';
  // Interface ICs (Family C7) — MUST come BEFORE Logic ICs 'transceiver' check
  // RS-485/CAN transceivers live in "Drivers, Receivers, Transceivers" with Protocol field
  // I2C isolators live in "Digital Isolators" with Type=I2C
  if (lower.includes('drivers, receivers, transceivers')) return 'Interface ICs';
  if (lower.includes('digital isolator') && !lower.includes('gate driver')) return 'Interface ICs';
  // Logic ICs (Family C5) — 7 Digikey leaf categories
  if (lower.includes('gates and inverters') || lower.includes('flip flop') ||
      lower.includes('latch') || lower.includes('counter') || lower.includes('divider') ||
      lower.includes('shift register') || lower.includes('multiplexer') ||
      lower.includes('decoder') || lower.includes('transceiver')) return 'Logic ICs';
  // Solid State Relays (Family F2) — PCB-mount and industrial-mount SSRs
  if (lower.includes('solid state') && lower.includes('relay')) return 'Relays';
  // Electromechanical Relays (Family F1) — SSR guard prevents misclassification
  if (lower.includes('relay') && !lower.includes('solid state') && !lower.includes('ssr')) return 'Relays';

  // === L0 taxonomy: categories without cross-reference logic tables ===

  // Microcontrollers — "Embedded - Microcontrollers"
  if (lower.includes('microcontroller')) return 'Microcontrollers';
  // Processors — MPU, DSP, FPGA, CPLD, SoC
  if (lower.includes('microprocessor') || lower.includes('fpga') || lower.includes('cpld') ||
      lower.includes('dsp') || lower.includes('system on chip')) return 'Processors';
  // Memory — EEPROM, Flash, SRAM, DRAM, FIFO
  if (lower.includes('memory') || lower.includes('eeprom') || lower.includes('fifo')) return 'Memory';
  // Sensors — MUST come after varistor/thermistor check (NTC/PTC are 'Protection')
  // Includes Digikey leaf names that don't contain 'sensor': "Analog and Digital Output" (temperature),
  // "Linear, Compass (ICs)" (magnetic), "IMUs (Inertial Measurement Units)"
  if (lower.includes('sensor') || lower.includes('transducer') || lower.includes('accelerometer') ||
      lower.includes('gyroscope') || lower.includes('encoder') ||
      lower.includes('imu') || lower.includes('inertial') ||
      lower.includes('compass') || lower === 'analog and digital output') return 'Sensors';
  // RF and Wireless — "RF/IF and RFID", antennas, baluns
  if (lower.includes('rf/') || lower.includes('rf ') || lower.includes('rfid') ||
      lower.includes('wireless') || lower.includes('antenna') || lower.includes('balun')) return 'RF and Wireless';
  // LEDs and Optoelectronics — MUST come after optocoupler check
  if (lower.includes('led') || lower.includes('optoelectronic') || lower.includes('display') ||
      lower.includes('photodiode') || lower.includes('phototransistor') || lower.includes('infrared') ||
      lower.includes('laser')) return 'LEDs and Optoelectronics';
  // Power Supplies — board-mount, external/internal
  if (lower.includes('power supply') || lower.includes('power supplies') ||
      lower.includes('ac dc converter') || lower.includes('ac-dc')) return 'Power Supplies';
  // Transformers
  if (lower.includes('transformer')) return 'Transformers';
  // Switches — physical switches only; guard against 'switching regulator' and 'signal switch'
  if ((lower.includes('switch') || lower.includes('keypad') || lower.includes('pushbutton')) &&
      !lower.includes('switching') && !lower.includes('signal switch') && !lower.includes('analog switch')) return 'Switches';
  // Cables and Wires
  if (lower.includes('cable') || (lower.includes('wire') && !lower.includes('wireless'))) return 'Cables and Wires';
  // Filters — EMI/RFI, SAW, BAW (NOT ferrite beads/CM chokes which are 'Inductors')
  if (lower.includes('filter') && !lower.includes('ferrite') && !lower.includes('common mode')) return 'Filters';
  // Audio — speakers, microphones, buzzers
  if (lower.includes('audio') || lower.includes('speaker') || lower.includes('microphone') ||
      lower.includes('buzzer')) return 'Audio';
  // Motors, Fans, Thermal
  if (lower.includes('motor') || lower.includes('fan') || lower.includes('solenoid') ||
      lower.includes('thermal management')) return 'Motors and Fans';
  // Test and Measurement
  if (lower.includes('test') && lower.includes('measurement')) return 'Test and Measurement';
  // Development Tools — dev boards, kits, programmers, eval boards
  if (lower.includes('development') || lower.includes('programmer') || lower.includes('eval board') ||
      lower.includes('demo board')) return 'Development Tools';
  // Battery Products
  if (lower.includes('battery') || lower.includes('charger')) return 'Battery Products';
  // Circuit Protection catch-all (beyond our varistors/fuses/thermistors)
  if (lower.includes('circuit protection') || lower.includes('surge') || lower.includes('esd')) return 'Protection';

  // Default: ICs covers remaining unclassified integrated circuits
  return 'ICs';
}

/** Infer subcategory from Digikey category name */
export function mapSubcategory(categoryName: string): string {
  const lower = categoryName.toLowerCase();
  if (lower.includes('ceramic capacitor') || lower.includes('mlcc')) return 'MLCC';
  if (lower.includes('aluminum') && lower.includes('polymer')) return 'Aluminum Polymer';
  if (lower.includes('aluminum')) return 'Aluminum Electrolytic';
  if (lower.includes('tantalum')) return 'Tantalum';
  if (lower.includes('supercapacitor') || lower.includes('double layer')) return 'Supercapacitor';
  if (lower.includes('film capacitor')) return 'Film Capacitor';
  if (lower.includes('thick film')) return 'Thick Film';
  if (lower.includes('thin film')) return 'Thin Film';
  if (lower.includes('chip resistor') || lower.includes('surface mount')) {
    if (lower.includes('resistor')) return 'Thick Film';
  }
  // Generic resistor fallback — classifier detects variant (53/54/55) from attributes
  if (lower.includes('resistor')) return 'Resistor';
  if (lower.includes('fixed inductor')) return 'Fixed Inductor';
  if (lower.includes('ferrite bead')) return 'Ferrite Bead and Chip';
  if (lower.includes('common mode choke')) return 'Common Mode Choke';
  if (lower.includes('varistor')) return 'Varistor';
  if (lower.includes('ptc resettable') || lower.includes('polyfuse') || lower.includes('pptc')) return 'PTC Resettable Fuse';
  // Traditional Fuses (Family D2) — must come after PTC resettable check
  if (lower.includes('automotive fuse')) return 'Automotive Fuse';
  if (lower.includes('fuse') && !lower.includes('fuse holder') && !lower.includes('fuse clip') && !lower.includes('fuse block')) return 'Fuse';
  // Optocouplers / Photocouplers (Family E1)
  if (lower.includes('optoisolator') && lower.includes('logic output')) return 'Logic Output Optocoupler';
  if (lower.includes('optoisolator') || lower.includes('optocoupler') || lower.includes('photocoupler')) return 'Optocoupler';
  if (lower.includes('ntc thermistor')) return 'NTC Thermistor';
  if (lower.includes('ptc thermistor')) return 'PTC Thermistor';
  if (lower.includes('schottky')) return 'Schottky Diode';
  if (lower.includes('zener diode array')) return 'Diodes - Zener - Array';
  if (lower.includes('single zener') || lower.includes('zener diode')) return 'Zener Diode';
  if (lower.includes('tvs diode') || lower.includes('tvs -')) return 'TVS Diode';
  if (lower.includes('bridge rectifier')) return 'Diodes - Bridge Rectifiers';
  if (lower.includes('single diode')) return 'Rectifier Diode';
  // Voltage References (Family C6) — must come before voltage regulator checks
  if (lower.includes('voltage reference')) return 'Voltage Reference';
  // Linear Voltage Regulators / LDOs (Family C1)
  if (lower.includes('voltage regulator') && lower.includes('linear')) return 'Linear Voltage Regulator';
  if (lower.includes('ldo')) return 'LDO';
  // Switching Regulators / DC-DC Converters & Controllers (Family C2)
  if (lower.includes('dc dc switching regulator') || (lower.includes('switching regulator') && !lower.includes('linear'))) return 'Switching Regulator';
  if (lower.includes('dc dc switching controller') || lower.includes('switching controller')) return 'DC DC Switching Controller';
  // Op-Amps / Comparators / Instrumentation Amps (Family C4)
  if (lower.includes('comparator')) return 'Comparator';
  if (lower.includes('instrumentation') && (lower.includes('amp') || lower.includes('op amp'))) return 'Instrumentation Amplifier';
  if (lower.includes('op amp') || lower.includes('buffer amp')) return 'Operational Amplifier';
  // Logic ICs (Family C5) — 7 Digikey leaf categories
  if (lower.includes('gates and inverters')) return 'Gates and Inverters';
  if (lower.includes('buffers') && lower.includes('transceivers')) return 'Buffers, Drivers, Receivers, Transceivers';
  if (lower.includes('flip flop')) return 'Flip Flops';
  if (lower.includes('latch') && !lower.includes('latch-up')) return 'Latches';
  if (lower.includes('counter') || lower.includes('divider')) return 'Counters, Dividers';
  if (lower.includes('shift register')) return 'Shift Registers';
  if (lower.includes('multiplexer') || lower.includes('decoder')) return 'Signal Switches, Multiplexers, Decoders';
  // DACs (Family C10) — single Digikey category covers all DAC types
  if (lower.includes('digital to analog') || (lower.includes('dac') && !lower.includes('diac'))) return 'DAC';
  // ADCs (Family C9) — single Digikey category
  if (lower.includes('analog to digital') || (lower.includes('adc') && !lower.includes('ladder'))) return 'ADC';
  // Crystals (Family D1) — discrete quartz resonators, MUST come BEFORE C8 oscillator checks
  if (lower.includes('crystal') && !lower.includes('oscillator') && !lower.includes('resonator ceramic')) return 'Crystal';
  // Timers and Oscillators (Family C8) — two Digikey categories
  if (lower.includes('programmable timer') || lower.includes('555 timer')) return '555 Timer';
  if (lower.includes('tcxo') || lower.includes('temperature compensated')) return 'TCXO';
  if (lower.includes('vcxo') || lower.includes('voltage controlled oscillator')) return 'VCXO';
  if (lower.includes('ocxo') || lower.includes('oven controlled')) return 'OCXO';
  if (lower.includes('oscillator')) return 'Oscillator';
  // Interface ICs (Family C7) — RS-485/CAN transceivers and I2C isolators
  if (lower.includes('drivers, receivers, transceivers')) {
    return 'Interface Transceiver';  // Protocol-specific routing handled by param data
  }
  if (lower.includes('digital isolator') && !lower.includes('gate driver')) {
    return 'I2C/SMBus Interface';
  }
  // Gate Drivers (Family C3) — must be before MOSFET/IGBT checks
  if (lower.includes('isolator') && lower.includes('gate driver')) return 'Isolated Gate Driver';
  if (lower.includes('gate driver')) return 'Gate Driver';
  // Thyristors (Family B8) — must be before transistor/diode fallback checks
  if (lower.includes('triac')) return 'TRIAC';
  if (lower.includes('diac') || lower.includes('sidac')) return 'DIAC';
  if (lower.includes('scr') || lower.includes('thyristor')) return 'SCR';
  // IGBTs (Family B7) — must be before MOSFET check
  if (lower.includes('igbt')) return 'IGBT';
  // MOSFETs (Family B5)
  if (lower.includes('mosfet') || (lower.includes('fet') && !lower.includes('fett'))) {
    if (lower.includes('p-channel') || lower.includes('p-ch')) return 'P-Channel MOSFET';
    if (lower.includes('n-channel') || lower.includes('n-ch')) return 'N-Channel MOSFET';
    if (lower.includes('sic') || lower.includes('silicon carbide')) return 'SiC MOSFET';
    if (lower.includes('gan') || lower.includes('gallium nitride')) return 'GaN FET';
    return 'MOSFET';
  }
  // BJTs (Family B6)
  if (lower.includes('bjt') || (lower.includes('bipolar') && lower.includes('transistor'))) {
    if (lower.includes('pnp')) return 'PNP BJT';
    if (lower.includes('npn')) return 'NPN BJT';
    return 'BJT';
  }
  // General transistor fallback — BJT if not MOSFET/IGBT/JFET
  if (lower.includes('transistor') && !lower.includes('mosfet') && !lower.includes('fet') && !lower.includes('igbt') && !lower.includes('jfet')) {
    if (lower.includes('pnp')) return 'PNP BJT';
    if (lower.includes('npn')) return 'NPN BJT';
    return 'BJT';
  }
  // Solid State Relays (Family F2) — must come before EMR check
  if (lower.includes('solid state') && lower.includes('relay')) {
    if (lower.includes('industrial')) return 'Solid State Relay - Industrial Mount';
    return 'Solid State Relay';
  }
  // Electromechanical Relays (Family F1) — SSR guard prevents misclassification
  if (lower.includes('relay') && !lower.includes('solid state') && !lower.includes('ssr')) {
    if (lower.includes('automotive')) return 'Automotive Relay';
    if (lower.includes('signal')) return 'Signal Relay';
    return 'Power Relay';
  }

  // === L0 subcategories for non-logic-table families ===
  // Microcontrollers
  if (lower.includes('microcontroller')) return 'Microcontroller';
  // Processors
  if (lower.includes('fpga')) return 'FPGA';
  if (lower.includes('cpld')) return 'CPLD';
  if (lower.includes('dsp')) return 'DSP';
  if (lower.includes('microprocessor')) return 'Microprocessor';
  if (lower.includes('system on chip')) return 'SoC';
  // Memory
  if (lower.includes('eeprom')) return 'EEPROM';
  if (lower.includes('flash')) return 'Flash Memory';
  if (lower.includes('sram')) return 'SRAM';
  if (lower.includes('dram')) return 'DRAM';
  if (lower.includes('fifo')) return 'FIFO';
  if (lower.includes('memory')) return 'Memory IC';
  // Sensors
  if (lower.includes('temperature') && lower.includes('sensor')) return 'Temperature Sensor';
  if (lower.includes('pressure') && lower.includes('sensor')) return 'Pressure Sensor';
  if (lower.includes('current') && lower.includes('sensor')) return 'Current Sensor';
  if (lower.includes('magnetic') && lower.includes('sensor')) return 'Magnetic Sensor';
  if (lower.includes('accelerometer')) return 'Accelerometer';
  if (lower.includes('gyroscope')) return 'Gyroscope';
  if (lower.includes('image sensor')) return 'Image Sensor';
  if (lower.includes('sensor') || lower.includes('transducer')) return 'Sensor';
  // RF and Wireless
  if (lower.includes('antenna')) return 'Antenna';
  if (lower.includes('rfid')) return 'RFID';
  if (lower.includes('rf') || lower.includes('wireless')) return 'RF Module';
  // LEDs and Optoelectronics
  if (lower.includes('display')) return 'Display';
  if (lower.includes('led')) return 'LED';
  if (lower.includes('laser')) return 'Laser Diode';
  if (lower.includes('optoelectronic')) return 'Optoelectronic Device';
  // Power Supplies
  if (lower.includes('power supply') || lower.includes('power supplies')) return 'Power Supply';
  if (lower.includes('ac dc') || lower.includes('ac-dc')) return 'AC-DC Converter';
  // Transformers
  if (lower.includes('transformer')) return 'Transformer';
  // Switches
  if (lower.includes('tactile') || lower.includes('pushbutton')) return 'Tactile Switch';
  if (lower.includes('dip switch') || lower.includes('slide')) return 'DIP Switch';
  if (lower.includes('toggle')) return 'Toggle Switch';
  if (lower.includes('rotary')) return 'Rotary Switch';
  if (lower.includes('switch') || lower.includes('keypad')) return 'Switch';
  // Audio
  if (lower.includes('speaker')) return 'Speaker';
  if (lower.includes('microphone')) return 'Microphone';
  if (lower.includes('buzzer')) return 'Buzzer';
  if (lower.includes('audio')) return 'Audio Device';
  // Motors and Fans
  if (lower.includes('fan')) return 'Fan';
  if (lower.includes('motor')) return 'Motor';
  if (lower.includes('solenoid')) return 'Solenoid';
  // Battery Products
  if (lower.includes('battery') || lower.includes('charger')) return 'Battery Product';
  // Development Tools
  if (lower.includes('development') || lower.includes('programmer') || lower.includes('eval')) return 'Development Tool';

  // === Parts.io Class name fallbacks ===
  // These only fire when no more specific Digikey-oriented check matched above.
  // For multi-family classes, map to the most common base family;
  // familyClassifier.ts handles variant detection from attributes.
  if (lower === 'capacitors') return 'MLCC';
  if (lower === 'inductors') return 'Fixed Inductor';
  if (lower === 'filters') return 'Ferrite Bead and Chip';
  if (lower === 'diodes') return 'Rectifier Diode';
  if (lower === 'transistors') return 'MOSFET';
  if (lower === 'trigger devices') return 'SCR';
  if (lower === 'amplifier circuits') return 'Operational Amplifier';
  if (lower === 'power circuits') return 'LDO';
  if (lower === 'converters') return 'ADC';
  if (lower === 'drivers and interfaces') return 'Gate Driver';
  if (lower === 'signal circuits') return 'Oscillator';
  if (lower === 'circuit protection') return 'Varistor';
  if (lower === 'optoelectronics') return 'Optocoupler';
  if (lower === 'crystals/resonators') return 'Crystal';
  if (lower === 'relays') return 'Power Relay';

  return categoryName;
}

/** Map Digikey product status to our PartStatus */
function mapStatus(status: string): PartStatus {
  const lower = status.toLowerCase();
  if (lower.includes('active')) return 'Active';
  if (lower.includes('obsolete')) return 'Obsolete';
  if (lower.includes('discontinued')) return 'Discontinued';
  if (lower.includes('not recommended') || lower.includes('nrnd')) return 'NRND';
  if (lower.includes('last time buy') || lower.includes('ltb')) return 'LastTimeBuy';
  return 'Active';
}

// ============================================================
// NUMERIC VALUE EXTRACTION
// ============================================================

/** Extract a numeric value and unit from a Digikey value string like "1µF", "25V", "0.90mm" */
function extractNumericValue(valueText: string): { numericValue?: number; unit?: string } {
  // Try patterns like "1µF", "25 V", "0.90 mm", "10 kΩ"
  const match = valueText.match(/([\d.]+)\s*([a-zA-ZµΩ°%]+)/);
  if (!match) return {};

  let numericValue = parseFloat(match[1]);
  const rawUnit = match[2];

  // Handle SI prefixes
  if (rawUnit.startsWith('p') || rawUnit.startsWith('pF')) numericValue *= 1e-12;
  else if (rawUnit.startsWith('n') && !rawUnit.startsWith('no')) numericValue *= 1e-9;
  else if (rawUnit.startsWith('µ') || rawUnit.startsWith('u')) numericValue *= 1e-6;
  else if (rawUnit.startsWith('m') && !rawUnit.startsWith('mm') && !rawUnit.startsWith('M')) numericValue *= 1e-3;
  else if (rawUnit.startsWith('k') || rawUnit.startsWith('K')) numericValue *= 1e3;
  else if (rawUnit.startsWith('M') && !rawUnit.startsWith('MSL')) numericValue *= 1e6;

  return { numericValue, unit: rawUnit };
}

// ============================================================
// VALUE TRANSFORMERS (Digikey → our format)
// ============================================================

/** Transform Digikey's "Features" parameter to our "Flexible Termination" Yes/No */
function transformFeaturesToFlexTerm(valueText: string): string {
  const lower = valueText.toLowerCase();
  if (lower.includes('flex') || lower.includes('flexible')) return 'Yes';
  return 'No';
}

/** Check for AEC-Q200 in Digikey "Ratings" or "Features" text → Yes/No */
function transformToAecQ200(valueText: string): string {
  if (valueText.toUpperCase().includes('AEC-Q200')) return 'Yes';
  return 'No';
}

/** Check for anti-sulfur indication in Digikey "Features" text → Yes/No */
function transformToAntiSulfur(valueText: string): string {
  const lower = valueText.toLowerCase();
  if (lower.includes('anti-sulfur') || lower.includes('anti sulfur') || lower.includes('sulphur resistant')) return 'Yes';
  return 'No';
}

/**
 * Extract metric diameter from Digikey "Size / Dimension" field.
 * Patterns: "0.197" Dia (5.00mm)", "0.276" Dia (7.00mm)"
 * Returns the metric mm value string, e.g., "5.00mm"
 */
function transformToDiameter(valueText: string): string {
  // Try metric diameter in parentheses: "Dia (5.00mm)"
  const diaMatch = valueText.match(/Dia\s*\((\d+\.?\d*)\s*mm\)/i);
  if (diaMatch) return `${diaMatch[1]}mm`;
  // Fall back: try any "X.XXmm" in the string after "Dia"
  const diaFallback = valueText.match(/Dia[^(]*?(\d+\.?\d*)\s*mm/i);
  if (diaFallback) return `${diaFallback[1]}mm`;
  return valueText;
}

/**
 * Extract metric body length from Digikey "Size / Dimension" field.
 * Pattern: "0.906" L x 0.453" W (23.00mm x 11.50mm)"
 * Returns the metric length, e.g., "23.00mm"
 */
function transformToBodyLength(valueText: string): string {
  // Try metric dimensions in parentheses: "(23.00mm x 11.50mm)"
  const dimMatch = valueText.match(/\((\d+\.?\d*)\s*mm\s*x\s*\d+\.?\d*\s*mm\)/i);
  if (dimMatch) return `${dimMatch[1]}mm`;
  return valueText;
}

/**
 * Extract dielectric type abbreviation from Digikey "Dielectric Material" field.
 * Pattern: "Polypropylene (PP), Metallized" → "PP"
 *          "Polyester, Metallized" → "PET"
 *          "Polyphenylene Sulfide (PPS)" → "PPS"
 */
function transformToDielectricType(valueText: string): string {
  const lower = valueText.toLowerCase();
  // Try parenthesized abbreviation first: "(PP)", "(PPS)", "(PEN)"
  const abbrMatch = valueText.match(/\(([A-Z]{2,4})\)/);
  if (abbrMatch) return abbrMatch[1];
  // Fallback on material name
  if (lower.includes('polypropylene')) return 'PP';
  if (lower.includes('polyphenylene')) return 'PPS';
  if (lower.includes('polyethylene naphthalate')) return 'PEN';
  if (lower.includes('polyester') || lower.includes('polyethylene terephthalate')) return 'PET';
  return valueText;
}

/**
 * Infer self-healing capability from Digikey "Dielectric Material" field.
 * "Metallized" construction implies self-healing capability.
 */
function transformToSelfHealing(valueText: string): string {
  if (valueText.toLowerCase().includes('metallized')) return 'Yes';
  return 'No';
}

/**
 * Extract safety class (X1/X2/Y1/Y2) from Digikey "Ratings" field.
 * Pattern: "AEC-Q200, X2" → "X2", "X2" → "X2", "-" → "-"
 */
function transformToSafetyRating(valueText: string): string {
  const match = valueText.match(/\b([XY][12])\b/i);
  return match ? match[1].toUpperCase() : valueText;
}

/**
 * Extract recovery category from Digikey "Speed" compound field.
 * Values: "Standard Recovery >500ns, > 200mA (Io)" → "Standard"
 *         "Fast Recovery =< 500ns, > 200mA (Io)" → "Fast"
 *         Contains "ultrafast" → "Ultrafast"
 * Output must match the upgradeHierarchy in rectifierDiodes.ts exactly.
 */
function transformToRecoveryCategory(valueText: string): string {
  const lower = valueText.toLowerCase();
  if (lower.includes('ultrafast') || lower.includes('ultra fast')) return 'Ultrafast';
  if (lower.includes('fast')) return 'Fast';
  if (lower.includes('standard')) return 'Standard';
  return valueText;
}

/**
 * Preserve raw B-value text without SI scaling.
 * NTC B-values like "3380K" — the "K" is Kelvin, not kilo.
 * extractNumericValue would misinterpret this as 3,380,000.
 * This transformer returns the value as-is.
 */
function transformBValue(valueText: string): string {
  return valueText;
}

/**
 * Check for AEC-Q101 (or AEC-Q100) in Digikey text → Yes/No (for discrete semiconductors).
 * Digikey uses "AEC-Q100" for Zener diode categories despite Q101 being the correct
 * discrete semiconductor qualification. Both indicate automotive qualification.
 */
function transformToAecQ101(valueText: string): string {
  const upper = valueText.toUpperCase();
  if (upper.includes('AEC-Q101') || upper.includes('AEC-Q100')) return 'Yes';
  return 'No';
}

/** Normalize Schottky technology from Digikey "Technology" field */
function transformToSchottkyTechnology(valueText: string): string {
  if (valueText.toLowerCase().includes('schottky')) return 'Schottky';
  return valueText;
}

/**
 * Extract semiconductor material from Digikey "Technology" field.
 * "Schottky" → Silicon (default), "SiC (Silicon Carbide) Schottky" → SiC.
 */
function transformToSemiconductorMaterial(valueText: string): string {
  const lower = valueText.toLowerCase();
  if (lower.includes('sic') || lower.includes('silicon carbide')) return 'SiC';
  return 'Silicon';
}

/**
 * Normalize MOSFET "Technology" field to internal technology names.
 * Digikey uses: "MOSFET (Metal Oxide)" for Si, "SiCFET (Silicon Carbide)" for SiC,
 * "GaNFET (Gallium Nitride)" for GaN.
 */
function transformToMosfetTechnology(valueText: string): string {
  const lower = valueText.toLowerCase();
  if (lower.includes('sic') || lower.includes('silicon carbide')) return 'SiC';
  if (lower.includes('gan') || lower.includes('gallium nitride')) return 'GaN';
  return 'Si';
}

/**
 * Normalize TVS "Type" field to internal topology names.
 * Digikey uses "Zener" for traditional clamp TVS and "Steering (Rail to Rail)" for steering arrays.
 */
function transformToTvsTopology(valueText: string): string {
  const lower = valueText.toLowerCase();
  if (lower.includes('steering')) return 'Steering Diode Array';
  if (lower === 'zener') return 'Discrete';
  return valueText;
}

/**
 * Normalize IGBT "IGBT Type" field to internal technology abbreviations.
 * Digikey uses: "Trench Field Stop" → FS, "NPT and Trench" → NPT,
 * "PT" or "Punch-Through" → PT, "-" → empty string.
 */
function transformToIgbtTechnology(valueText: string): string {
  const lower = valueText.toLowerCase();
  if (lower === '-' || lower === '') return '';
  if (lower.includes('field stop') || lower === 'fs') return 'FS';
  if (lower.includes('npt') || lower.includes('non-punch') || lower.includes('non punch')) return 'NPT';
  if (lower.includes('pt') || lower.includes('punch-through') || lower.includes('punch through')) return 'PT';
  // "Trench" alone (without Field Stop) is typically a FS variant
  if (lower === 'trench') return 'FS';
  return valueText;
}

/**
 * Extract Eon (turn-on energy) from Digikey compound "Switching Energy" field.
 * Pattern: "600µJ (on), 580µJ (off)" → "600µJ"
 *          "4.1mJ (on), 960µJ (off)" → "4.1mJ"
 *          "1.4mJ (off)" → "" (no Eon present)
 */
function transformToEon(valueText: string): string {
  const match = valueText.match(/([\d.]+\s*[µumk]?J)\s*\(on\)/i);
  return match ? match[1].trim() : '';
}

/**
 * Extract Eoff (turn-off energy) from Digikey compound "Switching Energy" field.
 * Pattern: "600µJ (on), 580µJ (off)" → "580µJ"
 *          "1.4mJ (off)" → "1.4mJ"
 */
function transformToEoff(valueText: string): string {
  const match = valueText.match(/([\d.]+\s*[µumk]?J)\s*\(off\)/i);
  return match ? match[1].trim() : '';
}

/**
 * Extract td(on) from Digikey compound "Td (on/off) @ 25°C" field.
 * Pattern: "60ns/160ns" → "60ns"
 *          "19.5ns/103ns" → "19.5ns"
 *          "-/360ns" → "" (no td_on present)
 */
function transformToTdOn(valueText: string): string {
  const match = valueText.match(/^([\d.]+\s*[nµum]?s)\s*\//i);
  return match ? match[1].trim() : '';
}

/**
 * Extract td(off) from Digikey compound "Td (on/off) @ 25°C" field.
 * Pattern: "60ns/160ns" → "160ns"
 *          "-/360ns" → "360ns"
 */
function transformToTdOff(valueText: string): string {
  const match = valueText.match(/\/\s*([\d.]+\s*[nµum]?s)/i);
  return match ? match[1].trim() : '';
}

/**
 * Extract gate sensitivity class from TRIAC "Triac Type" or SCR "SCR Type" field.
 * Digikey values observed:
 *   TRIAC: "Alternistor - Snubberless", "Logic - Sensitive Gate", "Standard", "-"
 *   SCR:   "Sensitive Gate", "Standard", "-"
 * Normalizes to: "Standard", "Sensitive", "Logic-Level"
 */
function transformToGateSensitivity(valueText: string): string {
  const lower = valueText.toLowerCase();
  if (lower === '-' || lower === '') return '';
  if (lower.includes('logic')) return 'Logic-Level';
  if (lower.includes('sensitive')) return 'Sensitive';
  if (lower.includes('standard') || lower.includes('alternistor')) return 'Standard';
  return valueText;
}

/**
 * Extract snubberless flag from TRIAC "Triac Type" field.
 * "Alternistor - Snubberless" → "Yes"
 * "Logic - Sensitive Gate" → "No"
 * "Standard" → "No"
 */
function transformToSnubberless(valueText: string): string {
  const lower = valueText.toLowerCase();
  if (lower.includes('snubberless') || lower.includes('alternistor')) return 'Yes';
  return 'No';
}

// ============================================================
// LDO (Family C1) TRANSFORMERS
// ============================================================

/**
 * Extract output capacitor ESR compatibility from LDO Features or description.
 * Ceramic-stable LDOs: "Ceramic Cap Stable", "Any Capacitor", "Internal Compensation"
 * ESR-stabilized: explicit ESR requirement or tantalum recommendation
 */
function transformToOutputCapCompatibility(valueText: string): string {
  const lower = valueText.toLowerCase();
  if (lower.includes('ceramic') && (lower.includes('stable') || lower.includes('compatible'))) return 'Yes';
  if (lower.includes('any cap') || lower.includes('any capacitor') || lower.includes('any-cap')) return 'Yes';
  if (lower.includes('internal compensation') || lower.includes('internally compensated')) return 'Yes';
  if (lower.includes('cmos ldo') || lower.includes('cmos regulator')) return 'Yes';
  if (lower.includes('esr') && (lower.includes('require') || lower.includes('minimum'))) return 'No';
  if (lower.includes('tantalum') && lower.includes('require')) return 'No';
  return valueText;
}

/**
 * Normalize enable pin from LDO "Control Features" field.
 * Digikey values: "Enable", "Enable, Output Discharge", "-"
 * Returns: "Active High" (default for modern LDOs with Enable), "Active Low",
 * or "Absent" (no enable pin — always-on 3-terminal device).
 *
 * NOTE: Digikey "Control Features" only tells us IF an enable pin exists,
 * not its polarity. Polarity (active-high vs active-low) is datasheet-only.
 * When "Enable" is present, we return "Active High" as the dominant default
 * for modern LDOs, but this should be verified from datasheets.
 */
function transformToEnablePin(valueText: string): string {
  const lower = valueText.toLowerCase();
  if (lower === '-' || lower.trim() === '') return 'Absent';
  if (lower.includes('active low') || lower.includes('/en') || lower.includes('shutdown') || lower.includes('shdn')) return 'Active Low';
  if (lower.includes('enable')) return 'Active High';
  if (lower.includes('no enable') || lower.includes('always on') || lower.includes('3-terminal')) return 'Absent';
  return valueText;
}

/**
 * Extract thermal shutdown presence from LDO "Protection Features" field.
 * Digikey values: "Over Current, Over Temperature", "Over Current", "-"
 * Returns: "Yes" if over temperature is mentioned, "No" otherwise.
 */
function transformToThermalShutdown(valueText: string): string {
  const lower = valueText.toLowerCase();
  if (lower.includes('over temperature') || lower.includes('thermal')) return 'Yes';
  if (lower === '-' || lower.trim() === '') return 'No';
  return 'No';
}

/**
 * Extract AEC-Q100 qualification from LDO Qualification field.
 * Similar to AEC-Q101/Q200 transformers but for IC standard.
 */
function transformToAecQ100(valueText: string): string {
  const upper = valueText.toUpperCase();
  if (upper.includes('AEC-Q100')) return 'Yes';
  if (upper.includes('AUTOMOTIVE')) return 'Yes';
  return 'No';
}

// ============================================================
// SWITCHING REGULATOR (Family C2) TRANSFORMERS
// ============================================================

/**
 * Normalize topology from Digikey "Topology" field.
 * Digikey values: "Buck", "Buck, Split Rail", "Boost", "Buck-Boost",
 * "Flyback", "Forward", "SEPIC", "Inverting", "Push-Pull"
 * Normalizes to canonical topology names used in the logic table.
 */
function transformTopology(valueText: string): string {
  const lower = valueText.toLowerCase();
  // Handle compound entries like "Buck, Split Rail" — take the primary topology
  if (lower.startsWith('buck') && !lower.includes('boost')) return 'Buck';
  if (lower.includes('buck-boost') || lower.includes('buck boost')) return 'Buck-Boost';
  if (lower.startsWith('boost')) return 'Boost';
  if (lower.includes('sepic')) return 'SEPIC';
  if (lower.includes('flyback')) return 'Flyback';
  if (lower.includes('forward')) return 'Forward';
  if (lower.includes('inverting')) return 'Inverting';
  if (lower.includes('push-pull') || lower.includes('push pull')) return 'Push-Pull';
  if (lower.includes('resonant') || lower.includes('llc')) return 'Resonant';
  if (lower.includes('half-bridge') || lower.includes('half bridge')) return 'Half-Bridge';
  if (lower.includes('full-bridge') || lower.includes('full bridge')) return 'Full-Bridge';
  return valueText;
}

// ============================================================
// GATE DRIVER (Family C3) TRANSFORMERS
// ============================================================

/**
 * Extract peak source current from compound "Current - Peak Output (Source, Sink)" field.
 * Digikey format: "210mA, 360mA" or "4A, 4A" — source is the first value.
 */
function transformToPeakSource(valueText: string): string {
  const parts = valueText.split(',').map(s => s.trim());
  return parts[0] ?? valueText;
}

/**
 * Extract peak sink current from compound "Current - Peak Output (Source, Sink)" field.
 * Digikey format: "210mA, 360mA" or "4A, 4A" — sink is the second value.
 */
function transformToPeakSink(valueText: string): string {
  const parts = valueText.split(',').map(s => s.trim());
  return parts[1] ?? parts[0] ?? valueText;
}

/**
 * Extract VIH from compound "Logic Voltage - VIL, VIH" field.
 * Digikey format: "0.8V, 3V" — VIH is the second value (input high threshold).
 * For matching, we care about the threshold the logic signal must exceed.
 */
function transformToLogicThreshold(valueText: string): string {
  const parts = valueText.split(',').map(s => s.trim());
  return parts[1] ?? parts[0] ?? valueText;
}

/**
 * Extract max propagation delay from compound "Propagation Delay tpLH / tpHL (Max)" field.
 * Digikey format: "69ns, 79ns" — take the larger (worst-case) value.
 */
function transformToPropDelayMax(valueText: string): string {
  const parts = valueText.split(',').map(s => s.trim());
  if (parts.length < 2) return valueText;
  const v1 = parseFloat(parts[0]);
  const v2 = parseFloat(parts[1]);
  if (isNaN(v1) || isNaN(v2)) return valueText;
  // Return the part with the larger numeric value (preserves unit suffix)
  return v1 >= v2 ? parts[0] : parts[1];
}

/**
 * Extract max rise/fall time from compound "Rise / Fall Time (Typ)" field.
 * Digikey format: "100ns, 50ns" or "7.2ns, 5.5ns" — take the larger (worst-case) value.
 */
function transformToRiseFallMax(valueText: string): string {
  const parts = valueText.split(',').map(s => s.trim());
  if (parts.length < 2) return valueText;
  const v1 = parseFloat(parts[0]);
  const v2 = parseFloat(parts[1]);
  if (isNaN(v1) || isNaN(v2)) return valueText;
  return v1 >= v2 ? parts[0] : parts[1];
}

/**
 * Normalize isolation technology from Digikey "Technology" field.
 * Maps: "Magnetic Coupling" → "Digital Isolator (Magnetic)",
 *        "Capacitive Coupling" → "Digital Isolator (Capacitive)",
 *        "Optocoupler" → "Optocoupler"
 */
function transformToIsolationType(valueText: string): string {
  const lower = valueText.toLowerCase();
  if (lower.includes('magnetic')) return 'Digital Isolator (Magnetic)';
  if (lower.includes('capacitive')) return 'Digital Isolator (Capacitive)';
  if (lower.includes('optocoupler') || lower.includes('opto')) return 'Optocoupler';
  if (lower.includes('transformer')) return 'Transformer';
  return valueText;
}

// ============================================================
// OP-AMP / COMPARATOR (Family C4) TRANSFORMERS
// ============================================================

/**
 * Extract Rail-to-Rail Input from Digikey "Output Type" field.
 * Op-amp Output Type can be "Rail-to-Rail" (means RRO), or "-" (not RRO).
 * There is no separate RRI field — RRI is typically indicated in the description
 * or "Amplifier Type" but not consistently in parametric data.
 * We set "Unknown" as default since Digikey doesn't reliably distinguish RRI.
 */
function transformToRailToRailInput(valueText: string): string {
  const lower = valueText.toLowerCase();
  if (lower.includes('input') && lower.includes('output')) return 'Yes';
  if (lower.includes('input')) return 'Yes';
  // "Rail-to-Rail" alone typically means output only
  return 'Unknown';
}

/**
 * Extract Rail-to-Rail Output from Digikey "Output Type" field.
 * "Rail-to-Rail" → Yes, "-" → No
 */
function transformToRailToRailOutput(valueText: string): string {
  const lower = valueText.toLowerCase();
  if (lower.includes('rail-to-rail') || lower.includes('rail to rail') || lower === 'rro' || lower === 'rri/rro') return 'Yes';
  if (lower === '-' || lower.trim() === '') return 'No';
  return 'No';
}

/**
 * Normalize Digikey "Amplifier Type" to our input_type classification.
 * "CMOS" → "CMOS", "JFET" → "JFET", "Bipolar" → "Bipolar",
 * "Zero-Drift" → "CMOS" (chopper-stabilized devices use CMOS input stages),
 * "Standard (General Purpose)" → depends on device, typically Bipolar.
 */
function transformToInputStageType(valueText: string): string {
  const lower = valueText.toLowerCase();
  if (lower.includes('cmos')) return 'CMOS';
  if (lower.includes('jfet') || lower.includes('j-fet') || lower.includes('bifet')) return 'JFET';
  if (lower.includes('bipolar') || lower.includes('bjt')) return 'Bipolar';
  if (lower.includes('zero-drift') || lower.includes('zero drift') || lower.includes('chopper') || lower.includes('auto-zero')) return 'CMOS';
  // "Standard (General Purpose)" — historically bipolar (LM358, LM741)
  if (lower.includes('general purpose') || lower.includes('standard')) return 'Bipolar';
  if (lower.includes('instrumentation')) return 'Bipolar';
  return valueText;
}

/**
 * Extract CMRR from compound "CMRR, PSRR (Typ)" field.
 * Input: "50dB CMRR, 50dB PSRR" → "50dB"
 */
function transformToCmrr(valueText: string): string {
  if (valueText === '-' || valueText.trim() === '') return valueText;
  const parts = valueText.split(',');
  const cmrrPart = parts.find(p => p.toLowerCase().includes('cmrr'));
  if (cmrrPart) {
    const match = cmrrPart.match(/([\d.]+)\s*dB/i);
    if (match) return `${match[1]} dB`;
  }
  // Fallback: first numeric value
  const match = valueText.match(/([\d.]+)\s*dB/i);
  if (match) return `${match[1]} dB`;
  return valueText;
}

/**
 * Extract PSRR from compound "CMRR, PSRR (Typ)" field.
 * Input: "50dB CMRR, 50dB PSRR" → "50dB"
 */
function transformToPsrr(valueText: string): string {
  if (valueText === '-' || valueText.trim() === '') return valueText;
  const parts = valueText.split(',');
  const psrrPart = parts.find(p => p.toLowerCase().includes('psrr'));
  if (psrrPart) {
    const match = psrrPart.match(/([\d.]+)\s*dB/i);
    if (match) return `${match[1]} dB`;
  }
  // If only one value, use it for both
  if (parts.length === 1) {
    const match = valueText.match(/([\d.]+)\s*dB/i);
    if (match) return `${match[1]} dB`;
  }
  return valueText;
}

/** Apply value transformations based on attributeId */
function transformValue(attributeId: string, valueText: string): string {
  switch (attributeId) {
    case 'flexible_termination':
      return transformFeaturesToFlexTerm(valueText);
    case 'aec_q200':
      return transformToAecQ200(valueText);
    case 'anti_sulfur':
      return transformToAntiSulfur(valueText);
    case 'diameter':
      return transformToDiameter(valueText);
    case 'body_length':
      return transformToBodyLength(valueText);
    case 'dielectric_type':
      return transformToDielectricType(valueText);
    case 'self_healing':
      return transformToSelfHealing(valueText);
    case 'safety_rating':
      return transformToSafetyRating(valueText);
    case 'recovery_category':
      return transformToRecoveryCategory(valueText);
    case 'b_value':
      return transformBValue(valueText);
    case 'aec_q101':
      return transformToAecQ101(valueText);
    case 'schottky_technology':
      return transformToSchottkyTechnology(valueText);
    case 'semiconductor_material':
      return transformToSemiconductorMaterial(valueText);
    case 'technology':
      return transformToMosfetTechnology(valueText);
    case 'configuration':
      return transformToTvsTopology(valueText);
    case 'igbt_technology':
      return transformToIgbtTechnology(valueText);
    case 'eon':
      return transformToEon(valueText);
    case 'eoff':
      return transformToEoff(valueText);
    case 'td_on':
      return transformToTdOn(valueText);
    case 'td_off':
      return transformToTdOff(valueText);
    case 'gate_sensitivity':
      return transformToGateSensitivity(valueText);
    case 'snubberless':
      return transformToSnubberless(valueText);
    // LDO (Family C1) transformers
    case 'output_cap_compatibility':
      return transformToOutputCapCompatibility(valueText);
    case 'enable_pin':
      return transformToEnablePin(valueText);
    case 'aec_q100':
      return transformToAecQ100(valueText);
    case 'thermal_shutdown':
      return transformToThermalShutdown(valueText);
    // Switching Regulator (Family C2) transformers
    case 'topology':
      return transformTopology(valueText);
    // Gate Driver (Family C3) transformers
    case 'peak_source_current':
      return transformToPeakSource(valueText);
    case 'peak_sink_current':
      return transformToPeakSink(valueText);
    case 'input_logic_threshold':
      return transformToLogicThreshold(valueText);
    case 'propagation_delay':
      return transformToPropDelayMax(valueText);
    case 'rise_fall_time':
      return transformToRiseFallMax(valueText);
    case 'isolation_type':
      return transformToIsolationType(valueText);
    // Op-Amp / Comparator (Family C4) transformers
    case 'rail_to_rail_input':
      return transformToRailToRailInput(valueText);
    case 'rail_to_rail_output':
      return transformToRailToRailOutput(valueText);
    case 'input_type':
      return transformToInputStageType(valueText);
    case 'cmrr':
      return transformToCmrr(valueText);
    case 'psrr':
      return transformToPsrr(valueText);
    default:
      return valueText;
  }
}

/** Extract AEC qualifications from Digikey product parameters (scans all known fields) */
function extractQualifications(parameters: DigikeyParameter[]): string[] {
  const qualifications: string[] = [];
  const qualFields = ['Ratings', 'Features', 'Qualification'];
  for (const param of parameters) {
    if (!qualFields.includes(param.ParameterText)) continue;
    const upper = param.ValueText.toUpperCase();
    if (upper.includes('AEC-Q200') && !qualifications.includes('AEC-Q200')) qualifications.push('AEC-Q200');
    if (upper.includes('AEC-Q101') && !qualifications.includes('AEC-Q101')) qualifications.push('AEC-Q101');
    if (upper.includes('AEC-Q100') && !qualifications.includes('AEC-Q100')) qualifications.push('AEC-Q100');
  }
  return qualifications;
}

// ============================================================
// MAIN MAPPERS
// ============================================================

/** Map Digikey StandardPricing to internal PriceBreak[].
 *  v4 API nests pricing under ProductVariations[]; top-level StandardPricing
 *  may be absent. Check both locations.
 */
function mapDigikeyPriceBreaks(product: DigikeyProduct): PriceBreak[] | undefined {
  // Prefer top-level StandardPricing; fall back to first ProductVariation
  const pricing = product.StandardPricing?.length
    ? product.StandardPricing
    : product.ProductVariations?.[0]?.StandardPricing;
  if (!pricing?.length) return undefined;
  return pricing.map(pb => ({
    quantity: pb.BreakQuantity,
    unitPrice: pb.UnitPrice,
    currency: 'USD',
  }));
}

/** Map a DigikeyProduct to our Part type */
export function mapDigikeyProductToPart(product: DigikeyProduct): Part {
  const categoryName = getDeepestCategoryName(product.Category);
  return {
    mpn: product.ManufacturerProductNumber,
    manufacturer: product.Manufacturer?.Name ?? 'Unknown',
    description: product.Description?.ProductDescription ?? '',
    detailedDescription: product.Description?.DetailedDescription ?? '',
    category: mapCategory(categoryName),
    subcategory: mapSubcategory(categoryName),
    status: mapStatus(product.ProductStatus?.Status ?? 'Active'),
    datasheetUrl: product.DatasheetUrl || undefined,
    imageUrl: product.PhotoUrl || undefined,
    unitPrice: product.UnitPrice ?? undefined,
    quantityAvailable: product.QuantityAvailable ?? undefined,
    productUrl: product.ProductUrl || undefined,
    digikeyPartNumber: product.DigiKeyPartNumber || undefined,
    rohsStatus: product.Classifications?.RohsStatus || undefined,
    moistureSensitivityLevel: product.Classifications?.MoistureSensitivityLevel || undefined,
    digikeyCategoryId: getDeepestCategoryId(product.Category),
    digikeyLeafCategory: categoryName,
    qualifications: extractQualifications(product.Parameters ?? []),
    digikeyPriceBreaks: mapDigikeyPriceBreaks(product),
  };
}

/**
 * Placeholder attributes for parameters that Digikey doesn't provide but logic
 * tables expect (typically application_review rules). Keyed by category substring.
 */
const categoryPlaceholders: Record<string, ParametricAttribute[]> = {
  'Ceramic Capacitors': [
    { parameterId: 'dc_bias_derating', parameterName: 'DC Bias Derating', value: 'Consult datasheet', sortOrder: 13 },
  ],
  // Chip resistors: all attributes come from Digikey or are flag-type; no placeholders needed
  'Common Mode Chokes': [
    { parameterId: 'cm_inductance', parameterName: 'Common Mode Inductance', value: 'Consult datasheet', sortOrder: 14 },
  ],
  'Tantalum Capacitors': [
    { parameterId: 'surge_voltage', parameterName: 'Surge / Inrush Voltage', value: 'Consult datasheet', sortOrder: 10 },
    { parameterId: 'dc_bias_derating', parameterName: 'DC Bias Derating', value: 'Consult datasheet', sortOrder: 11 },
  ],
  'Tantalum - Polymer Capacitors': [
    { parameterId: 'surge_voltage', parameterName: 'Surge / Inrush Voltage', value: 'Consult datasheet', sortOrder: 10 },
    { parameterId: 'dc_bias_derating', parameterName: 'DC Bias Derating', value: 'Consult datasheet', sortOrder: 11 },
  ],
  'Aluminum - Polymer Capacitors': [
    { parameterId: 'polarization', parameterName: 'Polarization', value: 'Polar', sortOrder: 3 },
    { parameterId: 'polymer_type', parameterName: 'Conductive Polymer Type', value: 'Consult datasheet', sortOrder: 15 },
  ],
  'Electric Double Layer Capacitors': [
    { parameterId: 'cap_aging', parameterName: 'Capacitance Aging', value: 'Consult datasheet', sortOrder: 12 },
    { parameterId: 'esr_aging', parameterName: 'ESR Aging', value: 'Consult datasheet', sortOrder: 13 },
  ],
  'Varistors': [
    { parameterId: 'clamping_voltage', parameterName: 'Clamping Voltage (Vc)', value: 'Consult datasheet', sortOrder: 9 },
  ],
  'NTC Thermistors': [
    { parameterId: 'rt_curve', parameterName: 'R-T Curve Matching', value: 'Consult datasheet', sortOrder: 9 },
    { parameterId: 'dissipation_constant', parameterName: 'Dissipation Constant', value: 'Consult datasheet', sortOrder: 10 },
  ],
  'PTC Thermistors': [
    { parameterId: 'rt_curve', parameterName: 'R-T Curve Matching', value: 'Consult datasheet', sortOrder: 5 },
  ],
  'Single Diodes': [
    { parameterId: 'recovery_behavior', parameterName: 'Recovery Behavior (Soft vs. Snappy)', value: 'Consult datasheet', sortOrder: 12 },
  ],
  'Bridge Rectifiers': [
    { parameterId: 'recovery_behavior', parameterName: 'Recovery Behavior (Soft vs. Snappy)', value: 'Consult datasheet', sortOrder: 10 },
  ],
  'IGBTs': [
    { parameterId: 'tsc', parameterName: 'Short-Circuit Withstand Time (tsc)', value: 'Consult datasheet', sortOrder: 20 },
  ],
};

/** Get placeholder attributes for a category */
function getPlaceholders(categoryName: string): ParametricAttribute[] {
  const lower = categoryName.toLowerCase();
  for (const [key, placeholders] of Object.entries(categoryPlaceholders)) {
    if (lower.includes(key.toLowerCase())) return placeholders;
  }
  return [];
}

/**
 * Resolve the param map category for a product.
 * Schottky diodes share Digikey categories with standard rectifiers ("Single Diodes")
 * and non-Schottky arrays ("Diode Arrays"), but need different attributeId mappings.
 * This checks the "Technology" parameter and returns a virtual category name for routing.
 */
function resolveParamMapCategory(categoryName: string, parameters: DigikeyParameter[]): string {
  const techParam = parameters?.find(p => p.ParameterText === 'Technology');
  if (techParam && techParam.ValueText.toLowerCase().includes('schottky')) {
    const lowerCat = categoryName.toLowerCase();
    if (lowerCat.includes('single diode')) return 'Schottky Diodes';
    if (lowerCat.includes('diode array')) return 'Schottky Diode Arrays';
  }
  return categoryName;
}

/** Map a DigikeyProduct to our PartAttributes (Part + parametric attributes) */
export function mapDigikeyProductToAttributes(product: DigikeyProduct): PartAttributes {
  const part = mapDigikeyProductToPart(product);
  const categoryName = getDeepestCategoryName(product.Category);
  // Resolve to virtual category for param map routing (Schottky vs standard diodes)
  const paramMapCategory = resolveParamMapCategory(categoryName, product.Parameters ?? []);
  const parameters: ParametricAttribute[] = [];
  const addedIds = new Set<string>();

  if (product.Parameters) {
    // Build a lookup for fallback values (e.g., "Supplier Device Package" when
    // "Package / Case" is "Nonstandard", common for power inductors)
    const paramValueLookup = new Map<string, string>();
    for (const p of product.Parameters) {
      paramValueLookup.set(p.ParameterText, p.ValueText);
    }

    if (hasCategoryMapping(paramMapCategory)) {
      // Category-specific mapping: use curated param map
      for (const param of product.Parameters) {
        const mappings = getParamMappings(paramMapCategory, param.ParameterText);
        if (mappings.length === 0) continue;

        for (const mapping of mappings) {
          // Fall back to "Supplier Device Package" when Package/Case is "Nonstandard"
          let valueText = param.ValueText;
          if (mapping.attributeId === 'package_case' && valueText === 'Nonstandard') {
            const supplierPkg = paramValueLookup.get('Supplier Device Package');
            if (supplierPkg && supplierPkg !== '-') {
              valueText = supplierPkg;
            }
          }

          const transformedValue = transformValue(mapping.attributeId, valueText);
          const { numericValue, unit } = extractNumericValue(valueText);

          parameters.push({
            parameterId: mapping.attributeId,
            parameterName: mapping.attributeName,
            value: transformedValue,
            numericValue,
            unit: mapping.unit ?? unit,
            sortOrder: mapping.sortOrder,
          });
          addedIds.add(mapping.attributeId);
        }
      }

      // Extract MSL from Classifications if not already in Parameters
      if (!addedIds.has('msl') && product.Classifications?.MoistureSensitivityLevel) {
        parameters.push({
          parameterId: 'msl',
          parameterName: 'Moisture Sensitivity Level',
          value: product.Classifications.MoistureSensitivityLevel,
          sortOrder: 10,
        });
        addedIds.add('msl');
      }

      // Add placeholder attributes for params Digikey doesn't provide
      for (const placeholder of getPlaceholders(paramMapCategory)) {
        if (!addedIds.has(placeholder.parameterId)) {
          parameters.push(placeholder);
          addedIds.add(placeholder.parameterId);
        }
      }
    } else {
      // Generic fallback: extract all Digikey parameters as-is
      for (let i = 0; i < product.Parameters.length; i++) {
        const param = product.Parameters[i];
        if (!param.ValueText || param.ValueText === '-') continue;
        const { numericValue, unit } = extractNumericValue(param.ValueText);
        parameters.push({
          parameterId: param.ParameterText.toLowerCase().replace(/[\s/()-]+/g, '_'),
          parameterName: param.ParameterText,
          value: param.ValueText,
          numericValue,
          unit,
          sortOrder: i + 1,
        });
      }
    }
  }

  // TVS polarity enrichment — derive from which channel field is present.
  // Digikey uses "Unidirectional Channels" vs "Bidirectional Channels" field names
  // to indicate polarity. The field value is the channel count (already mapped to num_channels).
  if (product.Parameters && !addedIds.has('polarity')) {
    const hasUni = product.Parameters.some(p => p.ParameterText === 'Unidirectional Channels');
    const hasBi = product.Parameters.some(p => p.ParameterText === 'Bidirectional Channels');
    if (hasUni || hasBi) {
      parameters.push({
        parameterId: 'polarity',
        parameterName: 'Polarity (Unidirectional vs. Bidirectional)',
        value: hasUni ? 'Unidirectional' : 'Bidirectional',
        sortOrder: 1,
      });
      addedIds.add('polarity');
    }
  }

  // IGBT co-packaged diode enrichment — infer from Reverse Recovery Time (trr) presence.
  // IGBTs do NOT have a usable intrinsic body diode. If Digikey lists trr with a
  // non-dash value, the part has a co-packaged antiparallel diode.
  if (product.Parameters && !addedIds.has('co_packaged_diode') &&
      categoryName.toLowerCase().includes('igbt')) {
    const trrParam = product.Parameters.find(p => p.ParameterText === 'Reverse Recovery Time (trr)');
    const hasDiode = trrParam && trrParam.ValueText && trrParam.ValueText !== '-';
    parameters.push({
      parameterId: 'co_packaged_diode',
      parameterName: 'Co-Packaged Antiparallel Diode',
      value: hasDiode ? 'Yes' : 'No',
      sortOrder: 3,
    });
    addedIds.add('co_packaged_diode');
  }

  // Thyristor device_type enrichment — infer SCR/TRIAC/DIAC from Digikey category name.
  // The identity rule on device_type (weight 10) needs explicit values to compare.
  if (!addedIds.has('device_type')) {
    const catLower = categoryName.toLowerCase();
    let deviceType = '';
    if (catLower.includes('triac')) deviceType = 'TRIAC';
    else if (catLower.includes('diac') || catLower.includes('sidac')) deviceType = 'DIAC';
    else if (catLower.includes('scr') || catLower.includes('thyristor')) deviceType = 'SCR';
    if (deviceType) {
      parameters.push({
        parameterId: 'device_type',
        parameterName: 'Device Sub-Type (SCR / TRIAC / DIAC)',
        value: deviceType,
        sortOrder: 1,
      });
      addedIds.add('device_type');
    }
  }

  // Switching regulator architecture enrichment — infer from Digikey category name.
  // "Voltage Regulators - DC DC Switching Regulators" = Integrated Switch
  // "DC DC Switching Controllers" = Controller-Only
  if (!addedIds.has('architecture')) {
    const catLower = categoryName.toLowerCase();
    let architecture = '';
    if (catLower.includes('switching regulator') && !catLower.includes('controller')) architecture = 'Integrated Switch';
    else if (catLower.includes('switching controller')) architecture = 'Controller-Only';
    if (architecture) {
      parameters.push({
        parameterId: 'architecture',
        parameterName: 'Architecture (Integrated Switch / Controller-Only)',
        value: architecture,
        sortOrder: 2,
      });
      addedIds.add('architecture');
    }
  }

  // For C2 adjustable parts: also add output_voltage from Vout Min/Fixed
  // so the vref_check evaluator can compute Vout achievability.
  // For fixed-output parts, Vout Min/Fixed IS the output voltage.
  if (addedIds.has('vref') && !addedIds.has('output_voltage')) {
    const vrefParam = parameters.find(p => p.parameterId === 'vref');
    const outputTypeParam = parameters.find(p => p.parameterId === 'output_type');
    const isFixed = outputTypeParam?.value?.toLowerCase() === 'fixed';
    if (isFixed && vrefParam) {
      // For fixed-output: Vout Min/Fixed is the actual output voltage
      parameters.push({
        parameterId: 'output_voltage',
        parameterName: 'Output Voltage',
        value: vrefParam.value,
        numericValue: vrefParam.numericValue,
        unit: 'V',
        sortOrder: 6,
      });
      addedIds.add('output_voltage');
    }
  }

  // Gate driver isolation_type enrichment — infer from Digikey category name.
  // Non-isolated: "Gate Drivers" category → isolation_type = "Non-Isolated (Bootstrap)"
  // Isolated: "Isolators - Gate Drivers" → isolation_type comes from "Technology" param map
  if (!addedIds.has('isolation_type')) {
    const catLower = categoryName.toLowerCase();
    if (catLower.includes('gate driver') && !catLower.includes('isolator')) {
      parameters.push({
        parameterId: 'isolation_type',
        parameterName: 'Isolation Type',
        value: 'Non-Isolated (Bootstrap)',
        sortOrder: 2,
      });
      addedIds.add('isolation_type');
    }
  }

  // Gate driver driver_configuration enrichment for isolated drivers.
  // Isolated gate drivers (ADUM4120, Si8271) don't have "Driven Configuration" field.
  // Infer from "Number of Channels" — 1 = Single, 2 = Dual.
  if (!addedIds.has('driver_configuration') && categoryName.toLowerCase().includes('gate driver')) {
    const numChannels = product.Parameters?.find(p => p.ParameterText === 'Number of Channels');
    const numDrivers = product.Parameters?.find(p => p.ParameterText === 'Number of Drivers');
    const countStr = numChannels?.ValueText ?? numDrivers?.ValueText;
    if (countStr) {
      const count = parseInt(countStr, 10);
      let config = 'Single';
      if (count === 2) config = 'Dual';
      else if (count === 4) config = 'Full-Bridge';
      parameters.push({
        parameterId: 'driver_configuration',
        parameterName: 'Driver Configuration (Single / Dual / Half-Bridge / Full-Bridge)',
        value: config,
        sortOrder: 1,
      });
      addedIds.add('driver_configuration');
    }
  }

  // Op-amp / Comparator device_type enrichment — infer from Digikey category name.
  // "Instrumentation, Op Amps, Buffer Amps" → look at Amplifier Type param.
  // "Comparators" → device_type = "Comparator".
  // The identity rule on device_type (weight 10, blockOnMissing) needs explicit values.
  if (!addedIds.has('device_type')) {
    const catLower = categoryName.toLowerCase();
    let devType = '';
    if (catLower.includes('comparator')) {
      devType = 'Comparator';
    } else if (catLower.includes('op amp') || catLower.includes('buffer amp') || catLower.includes('instrumentation')) {
      // Check Amplifier Type param to distinguish instrumentation amps
      const ampTypeParam = product.Parameters?.find(p => p.ParameterText === 'Amplifier Type');
      const ampType = ampTypeParam?.ValueText?.toLowerCase() ?? '';
      if (ampType.includes('instrumentation')) {
        devType = 'Instrumentation Amplifier';
      } else {
        devType = 'Op-Amp';
      }
    }
    if (devType) {
      parameters.push({
        parameterId: 'device_type',
        parameterName: 'Device Type (Op-Amp / Comparator / Instrumentation Amplifier)',
        value: devType,
        sortOrder: 1,
      });
      addedIds.add('device_type');
    }
  }

  // Interface IC protocol enrichment — infer from Digikey category + Protocol param.
  // "Drivers, Receivers, Transceivers" has Protocol field (RS422, RS485 / CANbus).
  // "Digital Isolators" with Type=I2C → I2C protocol.
  if (!addedIds.has('protocol')) {
    const catLower = categoryName.toLowerCase();
    if (catLower.includes('drivers, receivers, transceivers')) {
      const protocolParam = product.Parameters?.find(p => p.ParameterText === 'Protocol');
      if (protocolParam) {
        const proto = protocolParam.ValueText.toLowerCase();
        let protocol = '';
        if (proto.includes('rs485') || proto.includes('rs422') || proto.includes('rs-485') || proto.includes('rs-422')) protocol = 'RS-485';
        else if (proto.includes('can')) protocol = 'CAN';
        if (protocol) {
          // Protocol is already mapped via param map, but ensure normalized value
          const existing = parameters.find(p => p.parameterId === 'protocol');
          if (existing) {
            existing.value = protocol;
          }
        }
      }
    } else if (catLower.includes('digital isolator')) {
      const typeParam = product.Parameters?.find(p => p.ParameterText === 'Type');
      if (typeParam?.ValueText?.toLowerCase().includes('i2c')) {
        parameters.push({
          parameterId: 'protocol',
          parameterName: 'Protocol / Interface Standard',
          value: 'I2C',
          sortOrder: 1,
        });
        addedIds.add('protocol');
      }
    }
  }

  // Interface IC isolation_type enrichment for "Digital Isolators" category.
  // "Technology" field provides isolation technology: "Capacitive Coupling" / "Magnetic Coupling".
  // Normalize to our expected values.
  if (addedIds.has('isolation_type') && categoryName.toLowerCase().includes('digital isolator')) {
    const isoParam = parameters.find(p => p.parameterId === 'isolation_type');
    if (isoParam) {
      const tech = isoParam.value.toLowerCase();
      if (tech.includes('capacitive')) isoParam.value = 'Capacitive';
      else if (tech.includes('magnetic')) isoParam.value = 'Transformer';
    }
  }

  // Interface IC operating_mode normalization for "Drivers, Receivers, Transceivers".
  // Digikey "Duplex" field: "Half" → "Half-Duplex", "Full" → "Full-Duplex"
  if (addedIds.has('operating_mode') && categoryName.toLowerCase().includes('drivers, receivers, transceivers')) {
    const modeParam = parameters.find(p => p.parameterId === 'operating_mode');
    if (modeParam) {
      const mode = modeParam.value.toLowerCase();
      if (mode === 'half') modeParam.value = 'Half-Duplex';
      else if (mode === 'full') modeParam.value = 'Full-Duplex';
    }
  }

  // Timer/Oscillator device_category enrichment — infer from Digikey category + Type/Base Resonator params.
  // "Programmable Timers and Oscillators" → 555 Timer.
  // "Oscillators" → check "Type" param: "TCXO", "VCXO", "OCXO", "XO (Standard)".
  // For "XO (Standard)", check "Base Resonator": "MEMS" → MEMS Oscillator, "Crystal" → XO.
  if (!addedIds.has('device_category')) {
    const catLower = categoryName.toLowerCase();
    if (catLower.includes('programmable timer') || catLower.includes('555 timer')) {
      // Enrich timer_variant from "Type" field: "555 Type, Timer/Oscillator (Single)"
      const typeParam = product.Parameters?.find(p => p.ParameterText === 'Type');
      parameters.push({
        parameterId: 'device_category',
        parameterName: 'Device Category / Stability Class',
        value: '555 Timer',
        sortOrder: 1,
      });
      addedIds.add('device_category');
      // Timer variant: check if CMOS based on supply voltage range (2V min = CMOS)
      if (!addedIds.has('timer_variant') && typeParam) {
        const supplyParam = product.Parameters?.find(p => p.ParameterText === 'Voltage - Supply');
        if (supplyParam) {
          const supplyLower = supplyParam.ValueText.toLowerCase();
          // CMOS 555 variants start at 2V; bipolar start at 4.5V
          const variant = supplyLower.includes('2v') || supplyLower.includes('1.') ? 'CMOS' : 'Bipolar';
          parameters.push({
            parameterId: 'timer_variant',
            parameterName: 'Timer Variant (CMOS vs Bipolar)',
            value: variant,
            sortOrder: 5,
          });
          addedIds.add('timer_variant');
        }
      }
    } else if (catLower.includes('oscillator')) {
      const typeParam = product.Parameters?.find(p => p.ParameterText === 'Type');
      const baseResonator = product.Parameters?.find(p => p.ParameterText === 'Base Resonator');
      let deviceCategory = 'XO';
      if (typeParam) {
        const typeValue = typeParam.ValueText;
        if (typeValue.includes('TCXO')) deviceCategory = 'TCXO';
        else if (typeValue.includes('VCXO')) deviceCategory = 'VCXO';
        else if (typeValue.includes('OCXO')) deviceCategory = 'OCXO';
        else if (typeValue.includes('XO') && baseResonator?.ValueText === 'MEMS') deviceCategory = 'MEMS';
      }
      parameters.push({
        parameterId: 'device_category',
        parameterName: 'Device Category / Stability Class',
        value: deviceCategory,
        sortOrder: 1,
      });
      addedIds.add('device_category');
    }
  }

  // Oscillator OE polarity enrichment from "Function" field.
  // "Enable/Disable" → "Active-Low" (most common convention), "Standby (Power Down)" → "Active-Low",
  // "-" or missing → "No Enable" (output always on, no OE pin).
  if (!addedIds.has('oe_polarity') && categoryName.toLowerCase().includes('oscillator')) {
    const funcParam = product.Parameters?.find(p => p.ParameterText === 'Function');
    if (funcParam) {
      const funcValue = funcParam.ValueText;
      if (funcValue === '-' || !funcValue) {
        parameters.push({
          parameterId: 'oe_polarity',
          parameterName: 'Output Enable Polarity',
          value: 'No Enable',
          sortOrder: 4,
        });
      } else {
        // "Enable/Disable" or "Standby (Power Down)" — OE pin exists
        // Polarity (active-high vs active-low) is not determinable from this field alone
        // Mark as present; MPN enrichment or datasheet review needed for polarity
        parameters.push({
          parameterId: 'oe_polarity',
          parameterName: 'Output Enable Polarity',
          value: 'Has Enable',
          sortOrder: 4,
        });
      }
      addedIds.add('oe_polarity');
    }
  }

  // ADC enrichment — normalize architecture, reference_type, channel_count, input_configuration
  if (categoryName.toLowerCase().includes('analog to digital')) {
    // Architecture: Digikey "Sigma-Delta"→"Delta-Sigma", "Pipelined"→"Pipeline"
    const archParam = parameters.find(p => p.parameterId === 'architecture');
    if (archParam) {
      const val = archParam.value;
      if (/sigma.delta/i.test(val)) archParam.value = 'Delta-Sigma';
      else if (/pipeline/i.test(val)) archParam.value = 'Pipeline';
      else if (/flash|folding/i.test(val)) archParam.value = 'Flash';
      else if (/sar|successive/i.test(val)) archParam.value = 'SAR';
    }
    // Reference type: "External, Internal"→"Both"
    const refParam = parameters.find(p => p.parameterId === 'reference_type');
    if (refParam) {
      const lower = refParam.value.toLowerCase();
      if (lower.includes('external') && lower.includes('internal')) refParam.value = 'Both';
      else if (lower.includes('external')) refParam.value = 'External';
      else if (lower.includes('internal')) refParam.value = 'Internal';
    }
    // Channel count: Digikey "2, 4"→"4" (take max — most channels in single-ended mode)
    const chParam = parameters.find(p => p.parameterId === 'channel_count');
    if (chParam) {
      const nums = chParam.value.match(/\d+/g);
      if (nums && nums.length > 1) {
        chParam.value = String(Math.max(...nums.map(Number)));
      }
    }
    // Input configuration: "Differential, Single Ended"→normalize
    const inputParam = parameters.find(p => p.parameterId === 'input_configuration');
    if (inputParam) {
      const lower = inputParam.value.toLowerCase();
      if (lower.includes('pseudo')) inputParam.value = 'Pseudo-Differential';
      else if (lower.includes('differential') && lower.includes('single')) inputParam.value = 'Differential, Single-Ended';
      else if (lower.includes('differential')) inputParam.value = 'Differential';
      else if (lower.includes('single')) inputParam.value = 'Single-Ended';
    }
  }

  // DAC enrichment — normalize output_type, output_buffered, INL/DNL, reference_type, channel_count
  if (categoryName.toLowerCase().includes('digital to analog')) {
    // Output Type compound: "Voltage - Buffered" → output_type + output_buffered
    // Digikey values: "Voltage - Buffered", "Voltage - Unbuffered", "Current - Buffered"
    const outputTypeParam = parameters.find(p => p.parameterId === 'output_type');
    if (outputTypeParam) {
      const val = outputTypeParam.value.toLowerCase();
      if (val.includes('current')) outputTypeParam.value = 'Current Output';
      else outputTypeParam.value = 'Voltage Output';
    }
    const bufferedParam = parameters.find(p => p.parameterId === 'output_buffered');
    if (bufferedParam) {
      const val = bufferedParam.value.toLowerCase();
      if (val.includes('unbuffered')) bufferedParam.value = 'No';
      else if (val.includes('buffered')) bufferedParam.value = 'Yes';
    }
    // INL/DNL compound: "±4, ±0.2" → inl = "±4", dnl = "±0.2"
    // "-, ±1 (Max)" → inl = missing, dnl = "±1"
    const inlParam = parameters.find(p => p.parameterId === 'inl_lsb');
    const dnlParam = parameters.find(p => p.parameterId === 'dnl_lsb');
    if (inlParam && dnlParam && inlParam.value === dnlParam.value) {
      // Both were set to the same raw compound value — need to split
      const raw = inlParam.value;
      const parts = raw.split(',').map(s => s.trim());
      if (parts.length >= 2) {
        inlParam.value = parts[0] === '-' ? '' : parts[0].replace(/\s*\(.*\)/, '');
        dnlParam.value = parts[1] === '-' ? '' : parts[1].replace(/\s*\(.*\)/, '');
      }
      // Remove empty params (INL or DNL not reported)
      if (!inlParam.value) {
        const idx = parameters.indexOf(inlParam);
        if (idx >= 0) parameters.splice(idx, 1);
      }
      if (!dnlParam.value) {
        const idx = parameters.indexOf(dnlParam);
        if (idx >= 0) parameters.splice(idx, 1);
      }
    }
    // Reference type: "External, Internal"→"Both" (same pattern as ADC)
    const refParam = parameters.find(p => p.parameterId === 'reference_type');
    if (refParam) {
      const lower = refParam.value.toLowerCase();
      if (lower.includes('external') && lower.includes('internal')) refParam.value = 'Both';
      else if (lower.includes('external')) refParam.value = 'External';
      else if (lower.includes('internal')) refParam.value = 'Internal';
    }
    // Channel count: Digikey "2, 4"→"4" (take max — most channels available)
    const chParam = parameters.find(p => p.parameterId === 'channel_count');
    if (chParam) {
      const nums = chParam.value.match(/\d+/g);
      if (nums && nums.length > 1) {
        chParam.value = String(Math.max(...nums.map(Number)));
      }
    }
  }

  // Tantalum capacitor_type enrichment — Digikey maintains separate categories:
  // "Tantalum Capacitors" (MnO2) vs "Tantalum - Polymer Capacitors" (Polymer).
  // The identity_upgrade rule on capacitor_type needs explicit values to compare.
  if (!addedIds.has('capacitor_type')) {
    const catLower = categoryName.toLowerCase();
    if (catLower.includes('tantalum')) {
      const isPolymer = catLower.includes('polymer');
      parameters.push({
        parameterId: 'capacitor_type',
        parameterName: 'Capacitor Type',
        value: isPolymer ? 'Polymer' : 'MnO2',
        sortOrder: 4,
      });
      addedIds.add('capacitor_type');
    }
  }

  // Crystal (D1) enrichment — infer overtone_order, cut_type, mounting_type from Digikey fields
  const catLowerForCrystal = categoryName.toLowerCase();
  if (catLowerForCrystal.includes('crystal') && !catLowerForCrystal.includes('oscillator')) {
    // Overtone order from "Type" field: "Fundamental", "3rd Overtone", "5th Overtone"
    if (!addedIds.has('overtone_order')) {
      const typeParam = product.Parameters?.find(p => p.ParameterText === 'Type');
      if (typeParam) {
        const typeVal = typeParam.ValueText.toLowerCase();
        if (typeVal.includes('3rd') || typeVal.includes('third')) {
          parameters.push({ parameterId: 'overtone_order', parameterName: 'Overtone Order', value: '3rd Overtone', sortOrder: 16 });
          addedIds.add('overtone_order');
        } else if (typeVal.includes('5th') || typeVal.includes('fifth')) {
          parameters.push({ parameterId: 'overtone_order', parameterName: 'Overtone Order', value: '5th Overtone', sortOrder: 16 });
          addedIds.add('overtone_order');
        } else if (typeVal.includes('fundamental')) {
          parameters.push({ parameterId: 'overtone_order', parameterName: 'Overtone Order', value: 'Fundamental', sortOrder: 16 });
          addedIds.add('overtone_order');
        }
      }
    }
    // Cut type inferred from frequency: 32.768 kHz → Tuning Fork, >1 MHz → AT-cut
    if (!addedIds.has('cut_type')) {
      const freqParam = parameters.find(p => p.parameterId === 'nominal_frequency_hz');
      const desc = (product.Description?.DetailedDescription ?? '').toLowerCase();
      if (freqParam?.value?.includes('32.768') && freqParam.value.toLowerCase().includes('khz')) {
        parameters.push({ parameterId: 'cut_type', parameterName: 'Crystal Cut Type', value: 'Tuning Fork', sortOrder: 2 });
      } else if (desc.includes('sc-cut') || desc.includes('sc cut')) {
        parameters.push({ parameterId: 'cut_type', parameterName: 'Crystal Cut Type', value: 'SC-cut', sortOrder: 2 });
      } else {
        parameters.push({ parameterId: 'cut_type', parameterName: 'Crystal Cut Type', value: 'AT-cut', sortOrder: 2 });
      }
      addedIds.add('cut_type');
    }
    // Mounting type from package name: HC-49 = Through-Hole, else SMD
    if (!addedIds.has('mounting_type')) {
      const pkg = parameters.find(p => p.parameterId === 'package_type')?.value ?? '';
      const pkgLower = pkg.toLowerCase();
      if (pkgLower.includes('hc-49') || pkgLower.includes('hc49') || pkgLower.includes('through hole') || pkgLower.includes('through-hole')) {
        parameters.push({ parameterId: 'mounting_type', parameterName: 'Mounting Type', value: 'Through-Hole', sortOrder: 12 });
      } else if (pkg) {
        parameters.push({ parameterId: 'mounting_type', parameterName: 'Mounting Type', value: 'SMD', sortOrder: 12 });
      }
      addedIds.add('mounting_type');
    }
  }

  // Tag all parameters with source and sort
  for (const p of parameters) p.source = 'digikey';
  parameters.sort((a, b) => a.sortOrder - b.sortOrder);

  return { part, parameters };
}

/** Map a DigikeyProduct to our lightweight PartSummary */
export function mapDigikeyProductToSummary(product: DigikeyProduct): PartSummary {
  const categoryName = getDeepestCategoryName(product.Category);
  return {
    mpn: product.ManufacturerProductNumber,
    manufacturer: product.Manufacturer?.Name ?? 'Unknown',
    description: product.Description?.ProductDescription ?? '',
    category: mapCategory(categoryName),
    status: mapStatus(product.ProductStatus?.Status ?? 'Active'),
    qualifications: extractQualifications(product.Parameters ?? []),
    dataSource: 'digikey',
    keyParameters: extractKeyParameters(product.Parameters ?? []),
  };
}

/** Pull a small set of likely-distinguishing parameters off a Digikey product.
 *  These are already in the keyword-search payload so this adds no API cost.
 *  Skips noisy/structural fields (categorical packaging, base part number, etc.)
 *  and very long values that would blow out a card. */
const KEY_PARAM_SKIP = new Set<string>([
  'Base Part Number', 'Series', 'Manufacturer', 'Description',
  'Package / Case', 'Packaging', 'Part Status', 'RoHS Status',
  'Lead Free', 'Moisture Sensitivity Level (MSL)', 'Mounting Type',
  'AEC-Q200', 'AEC-Q100', 'AEC-Q101',
]);

function extractKeyParameters(params: DigikeyParameter[]): Array<{ name: string; value: string }> {
  const out: Array<{ name: string; value: string }> = [];
  for (const p of params) {
    const name = p.ParameterText;
    const value = p.ValueText;
    if (!name || !value) continue;
    if (KEY_PARAM_SKIP.has(name)) continue;
    if (value === '-' || value === '*') continue;
    if (value.length > 60) continue;
    out.push({ name, value });
    if (out.length >= 12) break;
  }
  return out;
}

/** Map a DigikeyKeywordResponse to our SearchResult */
export function mapKeywordResponseToSearchResult(
  response: DigikeyKeywordResponse
): SearchResult {
  const allProducts = [
    ...(response.ExactMatches ?? []),
    ...(response.Products ?? []),
  ];

  // Deduplicate by MPN
  const seen = new Set<string>();
  const unique: PartSummary[] = [];
  for (const product of allProducts) {
    const mpn = product.ManufacturerProductNumber;
    if (seen.has(mpn)) continue;
    seen.add(mpn);
    unique.push(mapDigikeyProductToSummary(product));
  }

  if (unique.length === 0) return { type: 'none', matches: [] };
  if (unique.length === 1) return { type: 'single', matches: unique };
  return { type: 'multiple', matches: unique };
}
