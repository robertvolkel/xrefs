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
function mapCategory(categoryName: string): ComponentCategory {
  const lower = categoryName.toLowerCase();
  if (lower.includes('capacitor')) return 'Capacitors';
  if (lower.includes('resistor')) return 'Resistors';
  if (lower.includes('inductor')) return 'Inductors';
  if (lower.includes('thyristor') || lower.includes('scr') || lower.includes('triac') || lower.includes('diac')) return 'Thyristors';
  if (lower.includes('diode') || lower.includes('rectifier')) return 'Diodes';
  if (lower.includes('transistor') || lower.includes('mosfet') || lower.includes('bjt') || lower.includes('igbt')) return 'Transistors';
  if (lower.includes('connector') || lower.includes('header') || lower.includes('socket')) return 'Connectors';
  if (lower.includes('varistor') || lower.includes('thermistor') || lower.includes('fuse')) return 'Protection';
  if (lower.includes('voltage regulator') || lower.includes('ldo')) return 'Voltage Regulators';
  if (lower.includes('switching regulator') || lower.includes('switching controller') || lower.includes('dc dc')) return 'Voltage Regulators';
  if (lower.includes('gate driver')) return 'Gate Drivers';
  if (lower.includes('op amp') || lower.includes('buffer amp') || lower.includes('comparator') || lower.includes('instrumentation')) return 'Amplifiers';
  // Logic ICs (Family C5) — 7 Digikey leaf categories
  if (lower.includes('gates and inverters') || lower.includes('flip flop') ||
      lower.includes('latch') || lower.includes('counter') || lower.includes('divider') ||
      lower.includes('shift register') || lower.includes('multiplexer') ||
      lower.includes('decoder') || lower.includes('transceiver')) return 'Logic ICs';
  // Default: ICs covers a huge range
  return 'ICs';
}

/** Infer subcategory from Digikey category name */
function mapSubcategory(categoryName: string): string {
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
  if (lower.includes('fixed inductor')) return 'Fixed Inductor';
  if (lower.includes('ferrite bead')) return 'Ferrite Bead and Chip';
  if (lower.includes('common mode choke')) return 'Common Mode Choke';
  if (lower.includes('varistor')) return 'Varistor';
  if (lower.includes('ptc resettable') || lower.includes('polyfuse') || lower.includes('pptc')) return 'PTC Resettable Fuse';
  if (lower.includes('ntc thermistor')) return 'NTC Thermistor';
  if (lower.includes('ptc thermistor')) return 'PTC Thermistor';
  if (lower.includes('schottky')) return 'Schottky Diode';
  if (lower.includes('zener diode array')) return 'Diodes - Zener - Array';
  if (lower.includes('single zener') || lower.includes('zener diode')) return 'Zener Diode';
  if (lower.includes('tvs diode') || lower.includes('tvs -')) return 'TVS Diode';
  if (lower.includes('bridge rectifier')) return 'Diodes - Bridge Rectifiers';
  if (lower.includes('single diode')) return 'Rectifier Diode';
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
    qualifications: extractQualifications(product.Parameters ?? []),
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

  // Sort by sortOrder
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
  };
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
