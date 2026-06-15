/**
 * Atlas Mapper — Converts Atlas JSON products to internal PartAttributes format.
 *
 * Responsibilities:
 * 1. Category classification: Atlas c3 name → ComponentCategory + subcategory + familyId
 * 2. Parameter translation: Atlas param names (Chinese + English) → internal attributeId
 * 3. Value normalization: Clean messy values, extract numeric, map status codes
 * 4. Output: PartAttributes objects ready for matching engine or Supabase storage
 *
 * Built incrementally — start with GigaDevice C6/C1, expand per-MFR as needed.
 */

import type { Part, PartAttributes, ParametricAttribute, ComponentCategory, PartStatus } from '../types';
import {
  parseGaiaParam,
  parseGaiaValue,
  humanizeStem,
  GAIA_SKIP_STEMS,
  gaiaFamilyDictionaries,
  gaiaSharedDictionary,
  gaiaL2Dictionaries,
  type GaiaParamMapping,
} from './atlasGaiaDictionaries';
import { getLogicTable } from '../logicTables';
import { getL2ParamMapForCategory, type ParamMapping } from './digikeyParamMap';

/**
 * Belt-and-suspenders guard: ensure no user-facing parameter name ever leaks
 * the "gaia-" prefix from our datasheet-extraction vendor. The happy path
 * already strips it via parseGaiaParam(), so this is a no-op on every
 * dictionary-mapped value. Only fires on the fallback paths where a raw,
 * malformed gaia-prefixed name could otherwise slip through unchanged.
 *
 * Operates ONLY on the leading "gaia-" prefix — does not touch any other
 * substring, so dictionary-mapped names (e.g. "Drain Source Voltage") and
 * matching-engine attributeIds (e.g. "vrrm", "rdc_max") are untouched.
 */
function stripGaiaPrefix(s: string): string {
  return s.replace(/^gaia[-_]/i, '');
}

/**
 * Decode literal byte-escape text (e.g. "(\xe2\x84\x83)" → "(℃)") back to its
 * UTF-8 character. CT MICRO's source file ships paramNames with the UTF-8
 * bytes for special chars (°, µ, ℃, Ω, λ) encoded as LITERAL backslash-x
 * escape-sequence text instead of the actual character. Decoding lets dict
 * entries written with the proper char match a single time. Decision #235
 * closeout — BACKLOG follow-up #1.
 *
 * Mirrored byte-for-byte in scripts/atlas-ingest.mjs.
 */
function decodeLiteralByteEscapes(s: string): string {
  if (!s.includes('\\x')) return s;
  return s.replace(/(?:\\x[0-9a-f]{2})+/gi, (run) => {
    const bytes: number[] = [];
    const re = /\\x([0-9a-f]{2})/gi;
    let m;
    while ((m = re.exec(run)) !== null) bytes.push(parseInt(m[1], 16));
    try {
      const decoded = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes));
      // Reject invalid byte runs (U+FFFD replacement) — keep raw text so
      // an audit can spot the bad source rather than silently substituting.
      return decoded.includes('�') ? run : decoded;
    } catch {
      return run;
    }
  });
}
import { FAMILY_PARAM_SIGNATURES } from './atlasFamilyParamSignatures';

// ─── Atlas JSON Types ─────────────────────────────────────

export interface AtlasManufacturerFile {
  manufacturer: { name: string };
  models: AtlasModel[];
}

export interface AtlasModel {
  componentName: string;
  datasheetUrl: string | null;
  description: string | null;
  category: {
    c1: { name: string };
    c2: { name: string };
    c3: { name: string };
  };
  parameters: Array<{ name: string; value: string }>;
}

// ─── Category Classification ──────────────────────────────

interface FamilyClassification {
  category: ComponentCategory;
  subcategory: string;
  familyId: string | null; // null = uncovered family (stored for search, not scored)
}

/**
 * Post-classification correction: inspects extracted parameters for signals
 * that contradict the c3-based family choice, and re-routes the product to
 * the correct family. Narrow and conservative — only fires on the specific
 * cases we've seen in the data.
 *
 * Why: classifyAtlasCategory looks only at the c3 string. A TVS Diode whose
 * c3 says "Rectifier Diode" lands in B1 silently — no feedback from the
 * parameters dictionary back into family selection. This helper closes that
 * gap for the cases we know about.
 *
 * Adding new rules: keep them narrow (specific param + specific value
 * pattern) so we never reclassify a legitimate B1 rectifier just because
 * it shares a parameter name with another family. When 5+ rules accumulate,
 * lift to a rule table.
 */
export function reclassifyByParameterSignals(
  initial: FamilyClassification,
  parameters: Array<{ name: string; value: string }>,
): FamilyClassification {
  // ─── Phase 1: B1 Type-value signals (Decision #175) ───
  // Narrow rules from the original Decision #175 pass — only fire from B1,
  // only on specific Type values, conservative by design.
  if (initial.familyId === 'B1') {
    let typeVal = '';
    for (const p of parameters) {
      const lname = p.name.toLowerCase().trim();
      if (lname === 'type' || lname === '类型') {
        typeVal = (p.value ?? '').toLowerCase().trim();
        break;
      }
    }
    if (typeVal) {
      // B4 TVS — Bi/Uni or Bidirectional/Unidirectional are unambiguous TVS
      // polarity values; no legitimate B1 rectifier carries these.
      if (/^(bi|uni|bidirectional|unidirectional)$/.test(typeVal)) {
        return { category: 'Diodes', subcategory: 'TVS Diode', familyId: 'B4' };
      }
      // B3 Zener — "Regulator" / "Voltage Regulator" on a diode signals a
      // Zener (zeners are voltage regulators by design); B1 rectifiers don't
      // regulate.
      if (/^(regulator|voltage regulator)$/.test(typeVal)) {
        return { category: 'Diodes', subcategory: 'Zener Diode', familyId: 'B3' };
      }
    }
  }

  // ─── Phase 2: Foreign-family param-name signatures ───
  // Driven by the FAMILY_PARAM_SIGNATURES registry — a parameter name that
  // belongs unambiguously to another family signals upstream misclassification
  // (e.g. BVCBO/BVCEO/BVEBO under B1 = transistor data leaking into the
  // rectifier diode bucket). Re-route to the correct family on the spot so
  // the affected products land in the right place at next ingest.
  //
  // Some signatures (Ic, fT, Vgs(th), Qg, Vce(sat)) are not strictly target-
  // family-unique — the relevant params are shared across families (Ic on
  // BJTs+IGBTs, fT on BJTs+RF MOSFETs, Vgs(th)+Qg on MOSFETs+IGBTs,
  // Vce(sat) on BJTs+IGBTs). Those carry a requiresAlsoMatching cooccurrence
  // guard so they only fire when at least one strictly-unique target-family
  // signal also appears on the same product. The cooccurrence check is
  // applied inside the loop below; per-paramName Triage callers skip
  // cooccurrence-required sigs since they lack product context.
  //
  // Conservatism: signatures are anchored to start-of-paramName and use
  // (?![A-Za-z0-9]) for the trailing boundary (NOT \b — JS regex treats `_`
  // as a word char). Engineers can override per-paramName via
  // atlas_unmapped_param_notes (status='confirmed_in_family') if a false
  // positive emerges; that override only affects the triage UI, not this
  // ingest-time hook — to suppress a registry entry from ingest, edit
  // FAMILY_PARAM_SIGNATURES directly.
  for (const sig of FAMILY_PARAM_SIGNATURES) {
    if (sig.target.familyId === initial.familyId) continue;
    const hit = parameters.some((p) => sig.pattern.test((p.name ?? '').trim()));
    if (!hit) continue;
    // Cooccurrence guard: signatures for params shared across families
    // (e.g. Ic on BJTs + IGBTs; fT on BJTs + RF MOSFETs) only fire when a
    // strictly-unique target-family signal also appears on the same product.
    if (sig.requiresAlsoMatching?.length) {
      const coHit = parameters.some((p) => {
        const pname = (p.name ?? '').trim();
        return sig.requiresAlsoMatching!.some((coPat) => coPat.test(pname));
      });
      if (!coHit) continue;
    }
    return {
      category: sig.target.category,
      subcategory: sig.target.subcategory,
      familyId: sig.target.familyId,
    };
  }

  return initial;
}

/**
 * Maps Atlas c3 category name → internal ComponentCategory + subcategory + familyId.
 * The c3 names in Atlas data largely match Digikey leaf category names.
 */
export function classifyAtlasCategory(c1: string, c2: string, c3: string): FamilyClassification {
  const lower = c3.toLowerCase();

  // Compute c1 flags up front — used by both L3 and L2 guards to prevent
  // cross-domain misclassification (e.g., laser diodes ≠ rectifier diodes,
  // RF amplifiers ≠ op-amps, "discrete" contains "scr" substring).
  const c1lower = c1.toLowerCase();
  const isIC = c1lower.includes('integrated circuit') || c1lower.includes('(ics)');
  const isConnector = c1lower.includes('connector');
  const isOptoOrSensor = c1lower.includes('optoelectronic') || c1lower.includes('sensor');
  const isRF = c1lower.includes('rf') || c1lower.includes('wireless');

  // ─── Passives ───
  if (lower.includes('ceramic capacitor')) return { category: 'Capacitors', subcategory: 'MLCC', familyId: '12' };
  if (lower.includes('aluminum') && lower.includes('polymer')) return { category: 'Capacitors', subcategory: 'Aluminum Polymer', familyId: '60' };
  if (lower.includes('aluminum electrolytic')) return { category: 'Capacitors', subcategory: 'Aluminum Electrolytic', familyId: '58' };
  if (lower.includes('tantalum')) return { category: 'Capacitors', subcategory: 'Tantalum', familyId: '59' };
  if (lower.includes('film capacitor')) return { category: 'Capacitors', subcategory: 'Film Capacitor', familyId: '64' };
  if (lower.includes('chip resistor')) return { category: 'Resistors', subcategory: 'Chip Resistor', familyId: '52' };
  if (lower.includes('fixed inductor')) return { category: 'Inductors', subcategory: 'Fixed Inductor', familyId: '71' };
  if (lower.includes('ferrite bead')) return { category: 'Inductors', subcategory: 'Ferrite Bead', familyId: '70' };
  if (lower.includes('common mode choke')) return { category: 'Inductors', subcategory: 'Common Mode Choke', familyId: '69' };
  if (lower.includes('varistor') || lower.includes('mov')) return { category: 'Protection', subcategory: 'Varistor', familyId: '65' };
  if (lower.includes('ptc resettable') || lower.includes('resettable fuse')) return { category: 'Protection', subcategory: 'PTC Resettable Fuse', familyId: '66' };

  // ─── E1 Optocouplers / Optoisolators ───
  // MUST be checked BEFORE the discrete-semi rules below: Everlight (亿光) and
  // similar opto MFRs ship c3 values like 'Triac, SCR Output Optoisolators'
  // and 'Transistor, Photovoltaic Output Optoisolators' — those would
  // otherwise match the Triac/SCR/Transistor keywords in the discrete block
  // and get misclassified as B8 / B5 / B6. The 'optoisolator' substring is
  // the discriminating signal regardless of what's mentioned before it.
  if (lower.includes('optoisolator') || lower.includes('photocoupler')
      || lower.includes('opto-coupler') || lower.includes('optocoupler')) {
    return { category: 'Optocouplers', subcategory: 'Optocoupler', familyId: 'E1' };
  }

  // ─── F1 EMR / F2 SSR Relays ───
  // SSR checked first — c3 substrings like 'Solid State Relay' are a strict
  // subset of the broader 'relay' match. Without this ordering, HONGFA-style
  // EMR catches would consume SSRs too. Also MUST come BEFORE discrete-semi
  // rules below: some SSR c3 strings contain 'Triac Output' / 'MOSFET Output'
  // that would otherwise route them to B8 / B5.
  if (lower.includes('solid state relay') || lower.includes('photo relay') || lower.includes('photomos')) {
    return { category: 'Relays', subcategory: c3, familyId: 'F2' };
  }
  if (lower.includes('relay') || c1lower.includes('relay')) {
    return { category: 'Relays', subcategory: c3, familyId: 'F1' };
  }

  // ─── Discrete Semiconductors ───
  // Thyristors — use word-boundary for SCR to prevent "discrete" → "di[scr]ete" collision
  if (/\bscr\b/i.test(lower) && !lower.includes('module')) return { category: 'Thyristors', subcategory: 'SCR', familyId: 'B8' };
  if (lower.includes('triac')) return { category: 'Thyristors', subcategory: 'TRIAC', familyId: 'B8' };
  // TVS — check BEFORE generic diodes
  if (lower.includes('tvs')) return { category: 'Diodes', subcategory: 'TVS Diode', familyId: 'B4' };
  // Zener — check BEFORE generic diodes
  if (lower === 'zener' || lower.includes('zener diode')) return { category: 'Diodes', subcategory: 'Zener Diode', familyId: 'B3' };
  // Bridge Rectifiers
  if (lower.includes('bridge rectifier')) return { category: 'Diodes', subcategory: 'Bridge Rectifier', familyId: 'B1' };
  // Generic rectifiers/diodes — skip laser diodes (c1=Optoelectronics) and photodiodes (c1=Sensors)
  if (!isOptoOrSensor && (lower.includes('rectifier') || (lower.includes('diode') && !lower.includes('tvs') && !lower.includes('zener')))) {
    return { category: 'Diodes', subcategory: 'Rectifier Diode', familyId: 'B1' };
  }
  // IGBTs — check BEFORE generic transistors
  if (lower.includes('igbt')) return { category: 'Transistors', subcategory: 'IGBT', familyId: 'B7' };
  // BJTs
  if (lower.includes('bipolar') || lower.includes('bjt')) return { category: 'Transistors', subcategory: 'BJT', familyId: 'B6' };
  // MOSFETs / FETs
  if (lower.includes('mosfet') || lower.includes('fet')) return { category: 'Transistors', subcategory: 'MOSFET', familyId: 'B5' };

  // ─── ICs ───
  // Voltage References — check BEFORE regulators
  if (lower.includes('voltage reference')) return { category: 'Voltage References', subcategory: 'Voltage Reference', familyId: 'C6' };
  // LDOs
  if (lower.includes('low drop out') || lower.includes('ldo') || lower.includes('linear regulator')) {
    return { category: 'Voltage Regulators', subcategory: 'LDO', familyId: 'C1' };
  }
  // Switching Regulators
  if (lower.includes('dc dc') || lower.includes('switching regulator') || lower.includes('switching controller')) {
    return { category: 'Voltage Regulators', subcategory: 'Switching Regulator', familyId: 'C2' };
  }
  // Gate Drivers
  if (lower.includes('gate driver')) return { category: 'Gate Drivers', subcategory: 'Gate Driver', familyId: 'C3' };
  // Op-Amps / Comparators / Amplifiers — skip RF amplifiers
  if (lower.includes('comparator')) return { category: 'Amplifiers', subcategory: 'Comparator', familyId: 'C4' };
  if (!isRF && (lower.includes('amplifier') || lower.includes('op amp') || lower.includes('instrumentation'))) {
    return { category: 'Amplifiers', subcategory: 'Op-Amp', familyId: 'C4' };
  }
  // ADCs
  if (lower.includes('analog to digital') || lower.includes('adc')) return { category: 'ADCs', subcategory: 'ADC', familyId: 'C9' };
  // DACs — guard against DIAC collision
  if ((lower.includes('digital to analog') || lower.includes('dac')) && !lower.includes('diac')) {
    return { category: 'DACs', subcategory: 'DAC', familyId: 'C10' };
  }
  // Interface ICs — check BEFORE Logic ICs (both can have 'transceiver')
  if (lower.includes('drivers, receivers, transceivers')) return { category: 'Interface ICs', subcategory: 'Interface IC', familyId: 'C7' };
  if (lower.includes('digital isolator') && !lower.includes('gate driver')) return { category: 'Interface ICs', subcategory: 'Digital Isolator', familyId: 'C7' };
  // Crystals (D1) — MUST come BEFORE oscillator check (Digikey parent "Crystals, Oscillators, Resonators")
  if (lower.includes('crystal') && !lower.includes('oscillator')) return { category: 'Crystals', subcategory: 'Crystal', familyId: 'D1' };
  // Oscillators
  if (lower.includes('oscillator') && !lower.includes('local oscillator')) return { category: 'Timers and Oscillators', subcategory: 'Oscillator', familyId: 'C8' };
  if (lower.includes('programmable timer') || lower.includes('555')) return { category: 'Timers and Oscillators', subcategory: '555 Timer', familyId: 'C8' };
  // Logic ICs — skip RF multiplexers
  if (lower.includes('gates and inverter') || lower.includes('flip flop') ||
      lower.includes('latch') || lower.includes('counter') || lower.includes('shift register') ||
      (!isRF && lower.includes('multiplexer')) || lower.includes('decoder')) {
    return { category: 'Logic ICs', subcategory: 'Logic IC', familyId: 'C5' };
  }

  // ─── L2 categories (no logic tables, display-only param maps) ───
  // Must come AFTER all L3 checks, BEFORE the generic catch-all.
  // Use c1 guards to prevent cross-domain misclassification.
  // e.g., "AC DC Converters, Offline Switches" has c1="Integrated Circuits" — NOT a physical switch.
  //       "Audio Connectors" has c1="Connectors" — NOT an audio device.
  //       "Female Sockets" contains "soc" substring — NOT a System-on-Chip.

  // IC-only categories: only classify as these when c1 confirms it's an IC
  if (lower.includes('microcontroller') || lower.includes('mcu')) return { category: 'Microcontrollers', subcategory: c3, familyId: null };
  if (isIC && (lower.includes('microprocessor') || lower.includes('system on chip') || /\bsoc\b/.test(lower))) return { category: 'Processors', subcategory: c3, familyId: null };
  if (lower.includes('memory') || lower.includes('eeprom') || lower.includes('flash') || lower.includes('sram') || lower.includes('dram')) return { category: 'Memory', subcategory: c3, familyId: null };
  if (lower.includes('sensor') || lower.includes('accelerometer') || lower.includes('gyroscope') || lower.includes('imu') || lower.includes('thermocouple')) return { category: 'Sensors', subcategory: c3, familyId: null };
  if (lower.includes('rf ') || lower.includes('wireless') || lower.includes('bluetooth') || lower.includes('wifi') || lower.includes('zigbee') || lower.includes('lora')) return { category: 'RF and Wireless', subcategory: c3, familyId: null };
  // LEDs/optoelectronics — not IC LED drivers
  if (!isIC && (lower.includes('led') || lower.includes('photodiode') || lower.includes('laser'))) return { category: 'LEDs and Optoelectronics', subcategory: c3, familyId: null };
  // Physical switches — not IC power switches
  if (!isIC && !isConnector && lower.includes('switch') && !lower.includes('switching')) return { category: 'Switches', subcategory: c3, familyId: null };
  if (lower.includes('transformer')) return { category: 'Transformers', subcategory: c3, familyId: null };
  if (lower.includes('filter') || lower.includes('emi')) return { category: 'Filters', subcategory: c3, familyId: null };
  if (lower.includes('battery') && !lower.includes('management')) return { category: 'Battery Products', subcategory: c3, familyId: null };
  // Motors/Fans — not IC motor drivers
  if (!isIC && (lower.includes('motor') || lower.includes('fan'))) return { category: 'Motors and Fans', subcategory: c3, familyId: null };
  // Audio — not audio connectors
  if (!isConnector && (lower.includes('audio') || lower.includes('speaker') || lower.includes('microphone') || lower.includes('buzzer'))) return { category: 'Audio', subcategory: c3, familyId: null };
  if (lower.includes('power supply') || lower.includes('ac dc') || lower.includes('dc dc')) return { category: 'Power Supplies', subcategory: c3, familyId: null };

  // ─── Uncovered families — ingest for search, no familyId ───
  // Use c1/c2 to pick a reasonable ComponentCategory
  if (c1lower.includes('capacitor')) return { category: 'Capacitors', subcategory: c3, familyId: null };
  if (c1lower.includes('resistor')) return { category: 'Resistors', subcategory: c3, familyId: null };
  if (c1lower.includes('inductor') || c1lower.includes('choke')) return { category: 'Inductors', subcategory: c3, familyId: null };
  if (isConnector) return { category: 'Connectors', subcategory: c3, familyId: null };
  if (c1lower.includes('protection') || c1lower.includes('circuit protection')) return { category: 'Protection', subcategory: c3, familyId: null };
  if (c1lower.includes('diode') || c1lower.includes('discrete')) return { category: 'Diodes', subcategory: c3, familyId: null };
  if (c1lower.includes('switch')) return { category: 'Switches', subcategory: c3, familyId: null };
  if (c1lower.includes('transformer')) return { category: 'Transformers', subcategory: c3, familyId: null };
  if (c1lower.includes('sensor')) return { category: 'Sensors', subcategory: c3, familyId: null };
  if (c1lower.includes('led') || c1lower.includes('optoelectronic')) return { category: 'LEDs and Optoelectronics', subcategory: c3, familyId: null };
  return { category: 'ICs', subcategory: c3, familyId: null };
}

// ─── Parameter Translation Dictionaries ───────────────────

export interface AtlasParamMapping {
  attributeId: string;
  attributeName: string;
  unit?: string;
  sortOrder: number;
}

/**
 * Per-family translation dictionaries mapping Atlas parameter names (Chinese + English)
 * to internal attributeId values. Built incrementally as new MFRs are processed.
 *
 * Key = lowercase Atlas parameter name → AtlasParamMapping
 */
const atlasParamDictionaries: Record<string, Record<string, AtlasParamMapping>> = {
  // ─── C6 Voltage References ────────────────────────────
  C6: {
    'output voltage (v)': { attributeId: 'output_voltage', attributeName: 'Output Voltage', unit: 'V', sortOrder: 2 },
    '输出电压': { attributeId: 'output_voltage', attributeName: 'Output Voltage', unit: 'V', sortOrder: 2 },
    'power supply (v)': { attributeId: 'input_voltage_range', attributeName: 'Input Voltage Range', unit: 'V', sortOrder: 15 },
    '输入电压': { attributeId: 'input_voltage_range', attributeName: 'Input Voltage Range', unit: 'V', sortOrder: 15 },
    'temp drift (ppm/°c)': { attributeId: 'tc', attributeName: 'Temperature Coefficient', unit: 'ppm/°C', sortOrder: 9 },
    '温度系数': { attributeId: 'tc', attributeName: 'Temperature Coefficient', unit: 'ppm/°C', sortOrder: 9 },
    'initial accuracy (%)': { attributeId: 'initial_accuracy', attributeName: 'Initial Accuracy', unit: '%', sortOrder: 8 },
    '精度': { attributeId: 'initial_accuracy', attributeName: 'Initial Accuracy', unit: '%', sortOrder: 8 },
    'current load (ma)': { attributeId: 'output_current', attributeName: 'Output / Load Current', unit: 'mA', sortOrder: 14 },
    '输出电流': { attributeId: 'output_current', attributeName: 'Output / Load Current', unit: 'mA', sortOrder: 14 },
    'noise (uvpp)': { attributeId: 'output_noise', attributeName: 'Output Noise', unit: 'µVpp', sortOrder: 10 },
    'long-term stability (ppm, 1000hours)': { attributeId: 'long_term_stability', attributeName: 'Long-Term Stability', unit: 'ppm/1000h', sortOrder: 11 },
    'operating temperature range (°c)': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 16 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 16 },
    'package': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 18 },
    '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 18 },
    // Shared fields that map to Part identity (not ParametricAttribute)
    '输出类型': { attributeId: 'configuration', attributeName: 'Configuration', sortOrder: 1 },
    '最小阴极电流调节': { attributeId: '_min_cathode_current', attributeName: 'Min Cathode Regulation Current', sortOrder: 90 },
    '商品目录': { attributeId: '_catalog', attributeName: 'Catalog', sortOrder: 99 },
    // 3PEAK English MFR-specific formats
    'output voltage': { attributeId: 'output_voltage', attributeName: 'Output Voltage', unit: 'V', sortOrder: 2 },
    'isink(min)(ma)': { attributeId: '_isink_min', attributeName: 'Min Sink Current', unit: 'mA', sortOrder: 91 },
    'isink(max)(ma)': { attributeId: '_isink_max', attributeName: 'Max Sink Current', unit: 'mA', sortOrder: 92 },
    'accuracy': { attributeId: 'initial_accuracy', attributeName: 'Initial Accuracy', unit: '%', sortOrder: 8 },
    'accuracy(max)': { attributeId: 'initial_accuracy', attributeName: 'Initial Accuracy', unit: '%', sortOrder: 8 },
    'tc(ppm/℃)': { attributeId: 'tc', attributeName: 'Temperature Coefficient', unit: 'ppm/°C', sortOrder: 9 },
    'tc(-40 to 85℃)(ppm/℃)': { attributeId: 'tc', attributeName: 'TC (-40 to 85°C)', unit: 'ppm/°C', sortOrder: 9 },
    'tc(-40 to 125℃)(ppm/℃)': { attributeId: 'tc', attributeName: 'TC (-40 to 125°C)', unit: 'ppm/°C', sortOrder: 9 },
    'output capacitor load(μf)': { attributeId: '_cout_load', attributeName: 'Output Cap Load', unit: 'µF', sortOrder: 93 },
    'vin(min)(v)': { attributeId: '_vin_min', attributeName: 'Min Input Voltage', unit: 'V', sortOrder: 94 },
    'vin(max)(v)': { attributeId: '_vin_max', attributeName: 'Max Input Voltage', unit: 'V', sortOrder: 95 },
    'iq(max)(μa)': { attributeId: '_iq', attributeName: 'Quiescent Current', unit: 'µA', sortOrder: 96 },
    '0.1 to 10hz output voltage noise(uvpp)': { attributeId: 'output_noise', attributeName: '0.1-10Hz Noise', unit: 'µVpp', sortOrder: 10 },
    '10 to 10khz voltage noise(μvrms)': { attributeId: 'output_noise', attributeName: '10-10kHz Noise', unit: 'µVrms', sortOrder: 10 },
    'line regulation(max)(ppm/v)': { attributeId: '_line_reg', attributeName: 'Line Regulation', unit: 'ppm/V', sortOrder: 97 },
    'load regulation(max)(ppm/ma)': { attributeId: '_load_reg', attributeName: 'Load Regulation', unit: 'ppm/mA', sortOrder: 98 },
    'type': { attributeId: '_type', attributeName: 'Type', sortOrder: 90 },
    '类型': { attributeId: '_type', attributeName: 'Type', sortOrder: 90 },
  },

  // ─── C1 LDO Regulators ────────────────────────────────
  C1: {
    '最小输入电压 (v)': { attributeId: 'vin_min', attributeName: 'Min Input Voltage', unit: 'V', sortOrder: 6 },
    '最小输入电压': { attributeId: 'vin_min', attributeName: 'Min Input Voltage', unit: 'V', sortOrder: 6 },
    '最大输入电压 (v)': { attributeId: 'vin_max', attributeName: 'Max Input Voltage', unit: 'V', sortOrder: 5 },
    '最大输入电压': { attributeId: 'vin_max', attributeName: 'Max Input Voltage', unit: 'V', sortOrder: 5 },
    '输出电流 (a)': { attributeId: 'iout_max', attributeName: 'Max Output Current', unit: 'A', sortOrder: 7 },
    '输出电流': { attributeId: 'iout_max', attributeName: 'Max Output Current', unit: 'A', sortOrder: 7 },
    '负载电流(a)': { attributeId: 'iout_max', attributeName: 'Max Output Current', unit: 'A', sortOrder: 7 },
    '最小输出电压 (v)': { attributeId: '_output_voltage_min', attributeName: 'Min Output Voltage', unit: 'V', sortOrder: 2 },
    '最小输出电压': { attributeId: '_output_voltage_min', attributeName: 'Min Output Voltage', unit: 'V', sortOrder: 2 },
    '最大输出电压 (v)': { attributeId: '_output_voltage_max', attributeName: 'Max Output Voltage', unit: 'V', sortOrder: 3 },
    '最大输出电压': { attributeId: '_output_voltage_max', attributeName: 'Max Output Voltage', unit: 'V', sortOrder: 3 },
    '输出电压': { attributeId: 'output_voltage', attributeName: 'Output Voltage', unit: 'V', sortOrder: 2 },
    '典型静态电流 (µa)': { attributeId: 'iq', attributeName: 'Quiescent Current', unit: 'µA', sortOrder: 9 },
    '典型静态电流(ua)': { attributeId: 'iq', attributeName: 'Quiescent Current', unit: 'µA', sortOrder: 9 },
    '典型静态电流': { attributeId: 'iq', attributeName: 'Quiescent Current', unit: 'µA', sortOrder: 9 },
    'psrr (db)': { attributeId: 'psrr', attributeName: 'PSRR', unit: 'dB', sortOrder: 12 },
    '电源纹波抑制比(psrr)': { attributeId: 'psrr', attributeName: 'PSRR', unit: 'dB', sortOrder: 12 },
    '压差电压 (mv)': { attributeId: 'vdropout', attributeName: 'Dropout Voltage', unit: 'mV', sortOrder: 8 },
    '压差电压(mv)': { attributeId: 'vdropout', attributeName: 'Dropout Voltage', unit: 'mV', sortOrder: 8 },
    '压差': { attributeId: 'vdropout', attributeName: 'Dropout Voltage', unit: 'mV', sortOrder: 8 },
    '精度 (±%)': { attributeId: 'vout_accuracy', attributeName: 'Output Voltage Accuracy', unit: '%', sortOrder: 10 },
    '精度': { attributeId: 'vout_accuracy', attributeName: 'Output Voltage Accuracy', unit: '%', sortOrder: 10 },
    '噪声 (µvrms)': { attributeId: '_noise', attributeName: 'Output Noise', unit: 'µVrms', sortOrder: 90 },
    '温度': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 20 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 20 },
    '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 3 },
    '输出类型': { attributeId: 'output_type', attributeName: 'Output Type', sortOrder: 1 },
    '最大工作电压(v)': { attributeId: 'vin_max', attributeName: 'Max Input Voltage', unit: 'V', sortOrder: 5 },
    '最小工作电压(v)': { attributeId: 'vin_min', attributeName: 'Min Input Voltage', unit: 'V', sortOrder: 6 },
    '最大绝对输入电压(v)': { attributeId: '_abs_max_input', attributeName: 'Absolute Max Input Voltage', unit: 'V', sortOrder: 91 },
    '商品目录': { attributeId: '_catalog', attributeName: 'Catalog', sortOrder: 99 },
    // 3PEAK/Convert/MingDa/TECH PUBLIC English MFR-specific formats
    'iout(max) (a)': { attributeId: 'iout_max', attributeName: 'Max Output Current', unit: 'A', sortOrder: 7 },
    'maximum output current(ma)': { attributeId: 'iout_max', attributeName: 'Max Output Current', unit: 'mA', sortOrder: 7 },
    'iout(ma)': { attributeId: 'iout_max', attributeName: 'Max Output Current', unit: 'mA', sortOrder: 7 },
    'vin(max) (v)': { attributeId: 'vin_max', attributeName: 'Max Input Voltage', unit: 'V', sortOrder: 5 },
    'vin(min) (v)': { attributeId: 'vin_min', attributeName: 'Min Input Voltage', unit: 'V', sortOrder: 6 },
    'vin(max)(v)': { attributeId: 'vin_max', attributeName: 'Max Input Voltage', unit: 'V', sortOrder: 5 },
    'vin(min)(v)': { attributeId: 'vin_min', attributeName: 'Min Input Voltage', unit: 'V', sortOrder: 6 },
    'input voltage(v)': { attributeId: 'vin_max', attributeName: 'Input Voltage Range', unit: 'V', sortOrder: 5 },
    'vout(max) (v)': { attributeId: '_output_voltage_max', attributeName: 'Max Output Voltage', unit: 'V', sortOrder: 3 },
    'vout(min) (v)': { attributeId: '_output_voltage_min', attributeName: 'Min Output Voltage', unit: 'V', sortOrder: 2 },
    'vdrop(typ) (mv)': { attributeId: 'vdropout', attributeName: 'Dropout Voltage', unit: 'mV', sortOrder: 8 },
    'dropout(mv)': { attributeId: 'vdropout', attributeName: 'Dropout Voltage', unit: 'mV', sortOrder: 8 },
    'dropput(mv)': { attributeId: 'vdropout', attributeName: 'Dropout Voltage', unit: 'mV', sortOrder: 8 },
    'noise (uvrms)': { attributeId: '_noise', attributeName: 'Output Noise', unit: 'µVrms', sortOrder: 92 },
    'noise(μvrms)': { attributeId: '_noise', attributeName: 'Output Noise', unit: 'µVrms', sortOrder: 92 },
    'psrr(db)': { attributeId: 'psrr', attributeName: 'PSRR', unit: 'dB', sortOrder: 12 },
    'iq(ma)': { attributeId: 'iq', attributeName: 'Quiescent Current', unit: 'mA', sortOrder: 9 },
    'accuracy(max)': { attributeId: 'vout_accuracy', attributeName: 'Output Voltage Accuracy', unit: '%', sortOrder: 10 },
    'temperature range (°c)': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 20 },
    'temperature range(℃)': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 20 },
    'type': { attributeId: '_type', attributeName: 'Type', sortOrder: 90 },
    '类型': { attributeId: '_type', attributeName: 'Type', sortOrder: 90 },
  },

  // ─── C2 Switching Regulators ──────────────────────────
  C2: {
    '最小输入电压 (v)': { attributeId: 'vin_min', attributeName: 'Min Input Voltage', unit: 'V', sortOrder: 5 },
    '最大输入电压 (v)': { attributeId: 'vin_max', attributeName: 'Max Input Voltage', unit: 'V', sortOrder: 4 },
    '输出电流 (a)': { attributeId: 'iout_max', attributeName: 'Max Output Current', unit: 'A', sortOrder: 6 },
    '最小输出电压 (v)': { attributeId: '_output_voltage_min', attributeName: 'Min Output Voltage', unit: 'V', sortOrder: 2 },
    '最大输出电压 (v)': { attributeId: '_output_voltage_max', attributeName: 'Max Output Voltage', unit: 'V', sortOrder: 3 },
    '输出电压': { attributeId: 'output_voltage', attributeName: 'Output Voltage', unit: 'V', sortOrder: 2 },
    '输入电压': { attributeId: '_input_voltage', attributeName: 'Input Voltage', unit: 'V', sortOrder: 4 },
    '输出电流': { attributeId: 'iout_max', attributeName: 'Max Output Current', unit: 'A', sortOrder: 6 },
    '典型静态电流 (µa)': { attributeId: 'iq', attributeName: 'Quiescent Current', unit: 'µA', sortOrder: 9 },
    '典型静态电流(ua)': { attributeId: 'iq', attributeName: 'Quiescent Current', unit: 'µA', sortOrder: 9 },
    '开关频率': { attributeId: 'fsw', attributeName: 'Switching Frequency', unit: 'MHz', sortOrder: 10 },
    '拓扑结构': { attributeId: 'topology', attributeName: 'Topology', sortOrder: 1 },
    '拓扑': { attributeId: 'topology', attributeName: 'Topology', sortOrder: 1 },
    '输出类型': { attributeId: 'output_type', attributeName: 'Output Type', sortOrder: 7 },
    '温度': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 20 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 20 },
    '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 18 },
    '商品目录': { attributeId: '_catalog', attributeName: 'Catalog', sortOrder: 99 },
    // 3PEAK/Convert/TECH PUBLIC English MFR-specific formats
    'vin(max) (v)': { attributeId: 'vin_max', attributeName: 'Max Input Voltage', unit: 'V', sortOrder: 4 },
    'vin(min) (v)': { attributeId: 'vin_min', attributeName: 'Min Input Voltage', unit: 'V', sortOrder: 5 },
    'vin(max)(v)': { attributeId: 'vin_max', attributeName: 'Max Input Voltage', unit: 'V', sortOrder: 4 },
    'vin(min)(v)': { attributeId: 'vin_min', attributeName: 'Min Input Voltage', unit: 'V', sortOrder: 5 },
    'vin(v)': { attributeId: 'vin_max', attributeName: 'Input Voltage Range', unit: 'V', sortOrder: 4 },
    'freq(max) (khz)': { attributeId: 'fsw', attributeName: 'Switching Frequency', unit: 'kHz', sortOrder: 10 },
    'topology': { attributeId: 'topology', attributeName: 'Topology', sortOrder: 1 },
    'control mode': { attributeId: 'control_mode', attributeName: 'Control Mode', sortOrder: 92 },
    'duty cycle (max) (%)': { attributeId: '_duty_max', attributeName: 'Max Duty Cycle', unit: '%', sortOrder: 93 },
    'duty cycle (max)(%)': { attributeId: '_duty_max', attributeName: 'Max Duty Cycle', unit: '%', sortOrder: 93 },
    'source/sink current (a)': { attributeId: '_gate_drive', attributeName: 'Source/Sink Current', unit: 'A', sortOrder: 94 },
    'iout (a)': { attributeId: 'iout_max', attributeName: 'Max Output Current', unit: 'A', sortOrder: 6 },
    'max output current(a)': { attributeId: 'iout_max', attributeName: 'Max Output Current', unit: 'A', sortOrder: 6 },
    // Isw / Peak Switch Current → display-only satellite (sortOrder 91).
    // NOT mapped to iout_max: Isw is the internal switch peak-current rating,
    // a device-physical spec; iout_max is the application-derived deliverable
    // load current. They are related (iout_max ≈ Isw × (1−D) for boost) but
    // not equal — conflating them would overstate deliverable current 2–3x
    // for typical boost configs and pollute C2 matching. Same satellite
    // pattern as B4 _vbr_max.
    'isw(a)': { attributeId: '_isw_peak_a', attributeName: 'Peak Switch Current', unit: 'A', sortOrder: 91 },
    'isw (a)': { attributeId: '_isw_peak_a', attributeName: 'Peak Switch Current', unit: 'A', sortOrder: 91 },
    'isw': { attributeId: '_isw_peak_a', attributeName: 'Peak Switch Current', unit: 'A', sortOrder: 91 },
    'isw_peak': { attributeId: '_isw_peak_a', attributeName: 'Peak Switch Current', unit: 'A', sortOrder: 91 },
    'isw_peak(a)': { attributeId: '_isw_peak_a', attributeName: 'Peak Switch Current', unit: 'A', sortOrder: 91 },
    'isw peak': { attributeId: '_isw_peak_a', attributeName: 'Peak Switch Current', unit: 'A', sortOrder: 91 },
    'peak switch current': { attributeId: '_isw_peak_a', attributeName: 'Peak Switch Current', unit: 'A', sortOrder: 91 },
    'switch current': { attributeId: '_isw_peak_a', attributeName: 'Peak Switch Current', unit: 'A', sortOrder: 91 },
    '开关电流': { attributeId: '_isw_peak_a', attributeName: 'Peak Switch Current', unit: 'A', sortOrder: 91 },
    '峰值开关电流': { attributeId: '_isw_peak_a', attributeName: 'Peak Switch Current', unit: 'A', sortOrder: 91 },
    '内部开关电流': { attributeId: '_isw_peak_a', attributeName: 'Peak Switch Current', unit: 'A', sortOrder: 91 },
    // Vipk / Peak Current-Sense Threshold Voltage → display-only satellite
    // (sortOrder 92). Internal comparator threshold (typically 300 mV in
    // MC34063-family) that triggers switch turn-off when V(Rsense) reaches
    // it. Sets peak switch current via external Rsc = Vipk / Ipeak_desired.
    // Distinct from vref (output regulation reference) and _isw_peak_a
    // (peak current itself). No C2 logic rule consumes this yet — narrow
    // applicability (MC34063-architecture only). Same satellite pattern as
    // _vbr_max / _isw_peak_a / _icc_ma.
    'vipk(mv)': { attributeId: '_ipk_sense_voltage_mv', attributeName: 'Peak Current-Sense Threshold (Vipk)', unit: 'mV', sortOrder: 92 },
    'vipk (mv)': { attributeId: '_ipk_sense_voltage_mv', attributeName: 'Peak Current-Sense Threshold (Vipk)', unit: 'mV', sortOrder: 92 },
    'vipk': { attributeId: '_ipk_sense_voltage_mv', attributeName: 'Peak Current-Sense Threshold (Vipk)', unit: 'mV', sortOrder: 92 },
    'vipk(mv)(typ.)': { attributeId: '_ipk_sense_voltage_mv', attributeName: 'Peak Current-Sense Threshold (Vipk)', unit: 'mV', sortOrder: 92 },
    'vipk(typ.)': { attributeId: '_ipk_sense_voltage_mv', attributeName: 'Peak Current-Sense Threshold (Vipk)', unit: 'mV', sortOrder: 92 },
    'peak sense voltage': { attributeId: '_ipk_sense_voltage_mv', attributeName: 'Peak Current-Sense Threshold (Vipk)', unit: 'mV', sortOrder: 92 },
    'current sense threshold': { attributeId: '_ipk_sense_voltage_mv', attributeName: 'Peak Current-Sense Threshold (Vipk)', unit: 'mV', sortOrder: 92 },
    'isense threshold': { attributeId: '_ipk_sense_voltage_mv', attributeName: 'Peak Current-Sense Threshold (Vipk)', unit: 'mV', sortOrder: 92 },
    'sense voltage': { attributeId: '_ipk_sense_voltage_mv', attributeName: 'Peak Current-Sense Threshold (Vipk)', unit: 'mV', sortOrder: 92 },
    '峰值检测电压': { attributeId: '_ipk_sense_voltage_mv', attributeName: 'Peak Current-Sense Threshold (Vipk)', unit: 'mV', sortOrder: 92 },
    '电流检测阈值': { attributeId: '_ipk_sense_voltage_mv', attributeName: 'Peak Current-Sense Threshold (Vipk)', unit: 'mV', sortOrder: 92 },
    '电流检测电压': { attributeId: '_ipk_sense_voltage_mv', attributeName: 'Peak Current-Sense Threshold (Vipk)', unit: 'mV', sortOrder: 92 },
    'vout (v)': { attributeId: '_output_voltage', attributeName: 'Output Voltage', unit: 'V', sortOrder: 2 },
    'output(v)': { attributeId: '_output_voltage', attributeName: 'Output Voltage', unit: 'V', sortOrder: 2 },
    'channels': { attributeId: '_channels', attributeName: 'Number of Channels', sortOrder: 95 },
    'uvlo on/off (v)': { attributeId: '_uvlo', attributeName: 'UVLO On/Off', unit: 'V', sortOrder: 96 },
    'temperature range(℃)': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 20 },
    'type': { attributeId: '_type', attributeName: 'Type', sortOrder: 90 },
    '类型': { attributeId: '_type', attributeName: 'Type', sortOrder: 90 },
  },

  // ─── C9 ADCs ──────────────────────────────────────────
  C9: {
    'resolution (bits)': { attributeId: 'resolution_bits', attributeName: 'Resolution', unit: 'bits', sortOrder: 2 },
    'max sampling rate (msps)': { attributeId: 'sampling_rate', attributeName: 'Max Sampling Rate', unit: 'MSPS', sortOrder: 3 },
    '采样率': { attributeId: 'sampling_rate', attributeName: 'Max Sampling Rate', unit: 'MSPS', sortOrder: 3 },
    'snr (db)': { attributeId: 'snr', attributeName: 'SNR', unit: 'dB', sortOrder: 10 },
    'thd (db)': { attributeId: 'thd', attributeName: 'THD', unit: 'dB', sortOrder: 11 },
    'inl (ppm/fs)': { attributeId: 'inl', attributeName: 'INL', unit: 'ppm/FS', sortOrder: 12 },
    'supply voltage': { attributeId: 'supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 8 },
    '电压(v)': { attributeId: 'supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 8 },
    'vdd(v)': { attributeId: 'supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 8 },
    'interface type': { attributeId: 'interface', attributeName: 'Interface', sortOrder: 6 },
    '接口': { attributeId: 'interface', attributeName: 'Interface', sortOrder: 6 },
    'input channels differential single ended': { attributeId: 'channel_count', attributeName: 'Input Channels', sortOrder: 4 },
    '通道数': { attributeId: 'channel_count', attributeName: 'Input Channels', sortOrder: 4 },
    'integrated pga': { attributeId: '_pga', attributeName: 'Integrated PGA', sortOrder: 90 },
    'power dissipation': { attributeId: '_power_dissipation', attributeName: 'Power Dissipation', sortOrder: 91 },
    'operating temperature range': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 16 },
    'operating temperature range (°c)': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 16 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 16 },
    'package': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 18 },
    '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 18 },
    // 3PEAK English MFR-specific formats
    "resolution''": { attributeId: 'resolution_bits', attributeName: 'Resolution', unit: 'bits', sortOrder: 2 },
    "resolution'": { attributeId: 'resolution_bits', attributeName: 'Resolution', unit: 'bits', sortOrder: 2 },
    'resolution': { attributeId: 'resolution_bits', attributeName: 'Resolution', unit: 'bits', sortOrder: 2 },
    "vdd(v)\"": { attributeId: 'supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 8 },
    "vdd(v)'": { attributeId: 'supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 8 },
    "ch''": { attributeId: 'channel_count', attributeName: 'Number of Channels', sortOrder: 4 },
    "ch'": { attributeId: 'channel_count', attributeName: 'Number of Channels', sortOrder: 4 },
    'ch': { attributeId: 'channel_count', attributeName: 'Number of Channels', sortOrder: 4 },
    'vin(v)': { attributeId: '_vin', attributeName: 'Input Voltage Range', unit: 'V', sortOrder: 92 },
    'inl(lsb,max)': { attributeId: 'inl_lsb', attributeName: 'INL', unit: 'LSB', sortOrder: 93 },
    'dnl(lsb,max)': { attributeId: 'dnl_lsb', attributeName: 'DNL', unit: 'LSB', sortOrder: 94 },
    'dnl(lsb)': { attributeId: 'dnl_lsb', attributeName: 'DNL', unit: 'LSB', sortOrder: 94 },
    'offset error(lsb, max)': { attributeId: '_offset_error', attributeName: 'Offset Error', unit: 'LSB', sortOrder: 95 },
    'gain error(lsb)': { attributeId: '_gain_error', attributeName: 'Gain Error', unit: 'LSB', sortOrder: 96 },
    'voltage input range(v)': { attributeId: '_input_range', attributeName: 'Input Voltage Range', unit: 'V', sortOrder: 97 },
    'idd(ma)': { attributeId: '_idd', attributeName: 'Supply Current (Idd)', unit: 'mA', sortOrder: 98 },
    'speed(msps)': { attributeId: 'sampling_rate', attributeName: 'Sampling Rate', unit: 'MSPS', sortOrder: 3 },
    'update rate(msps)': { attributeId: 'sampling_rate', attributeName: 'Update Rate', unit: 'MSPS', sortOrder: 3 },
    'sinad(db)': { attributeId: '_sinad', attributeName: 'SINAD', unit: 'dB', sortOrder: 99 },
    'interface': { attributeId: 'interface', attributeName: 'Interface', sortOrder: 6 },
    'clock source': { attributeId: '_clock_source', attributeName: 'Clock Source', sortOrder: 100 },
    'datum': { attributeId: '_reference', attributeName: 'Reference', sortOrder: 101 },
    'vref': { attributeId: '_vref', attributeName: 'Reference Type', sortOrder: 102 },
    'power(mw)': { attributeId: '_power', attributeName: 'Power Consumption', unit: 'mW', sortOrder: 103 },
    'temperature range(℃)': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 16 },
    'insulation rating(vrms)': { attributeId: '_isolation_rating', attributeName: 'Isolation Rating', unit: 'Vrms', sortOrder: 104 },
  },

  // ─── Passives ──────────────────────────────────────────

  // ─── 12 MLCC Capacitors ────────────────────────────────
  '12': {
    '容值': { attributeId: 'capacitance', attributeName: 'Capacitance', sortOrder: 1 },
    '精度': { attributeId: 'tolerance', attributeName: 'Tolerance', sortOrder: 5 },
    '额定电压': { attributeId: 'voltage_rated', attributeName: 'Voltage Rating', unit: 'V', sortOrder: 3 },
    '电介质': { attributeId: 'dielectric', attributeName: 'Dielectric', sortOrder: 4 },
    '介质材料': { attributeId: 'dielectric', attributeName: 'Dielectric', sortOrder: 4 },
    '温度系数tf': { attributeId: 'dielectric', attributeName: 'Dielectric', sortOrder: 4 },
    '封装/外壳': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 2 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 6 },
  },

  // ─── 52 Chip Resistors ─────────────────────────────────
  '52': {
    '阻值': { attributeId: 'resistance', attributeName: 'Resistance', sortOrder: 1 },
    '功率': { attributeId: 'power_rating', attributeName: 'Power Rating', sortOrder: 4 },
    '精度': { attributeId: 'tolerance', attributeName: 'Tolerance', sortOrder: 3 },
    '温度系数': { attributeId: 'tcr', attributeName: 'Temperature Coefficient', unit: 'ppm/°C', sortOrder: 6 },
    '电阻类型': { attributeId: 'composition', attributeName: 'Composition', sortOrder: 7 },
    '技术/工艺': { attributeId: 'composition', attributeName: 'Composition', sortOrder: 7 },
    '工作温度范围': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 8 },
    '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 2 },
  },

  // ─── 58 Aluminum Electrolytic ──────────────────────────
  '58': {
    '容值': { attributeId: 'capacitance', attributeName: 'Capacitance', sortOrder: 1 },
    '额定电压': { attributeId: 'voltage_rated', attributeName: 'Voltage Rating', unit: 'V', sortOrder: 2 },
    '精度': { attributeId: 'tolerance', attributeName: 'Tolerance', sortOrder: 8 },
    '等效串联电阻': { attributeId: 'esr', attributeName: 'ESR', sortOrder: 9 },
    '纹波电流': { attributeId: 'ripple_current', attributeName: 'Ripple Current', sortOrder: 10 },
    '漏泄电流': { attributeId: 'leakage_current', attributeName: 'Leakage Current', sortOrder: 11 },
    '不同温度时的使用寿命': { attributeId: 'lifetime', attributeName: 'Lifetime', sortOrder: 12 },
    '耗散因数': { attributeId: 'dissipation_factor', attributeName: 'Dissipation Factor', sortOrder: 13 },
    '封装/外壳': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 5 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 14 },
  },

  // ─── 59 Tantalum Capacitors ────────────────────────────
  '59': {
    '容值': { attributeId: 'capacitance', attributeName: 'Capacitance', sortOrder: 1 },
    '额定电压': { attributeId: 'voltage_rated', attributeName: 'Voltage Rating', unit: 'V', sortOrder: 2 },
    '精度': { attributeId: 'tolerance', attributeName: 'Tolerance', sortOrder: 5 },
    '等效串联电阻': { attributeId: 'esr', attributeName: 'ESR', sortOrder: 6 },
    '纹波电流': { attributeId: 'ripple_current', attributeName: 'Ripple Current', sortOrder: 7 },
    '漏泄电流': { attributeId: 'leakage_current', attributeName: 'Leakage Current', sortOrder: 8 },
    '耗散因数': { attributeId: 'dissipation_factor', attributeName: 'Dissipation Factor', sortOrder: 9 },
    '封装/外壳': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 3 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 10 },
  },

  // ─── 60 Aluminum Polymer ───────────────────────────────
  '60': {
    '容值': { attributeId: 'capacitance', attributeName: 'Capacitance', sortOrder: 1 },
    '额定电压': { attributeId: 'voltage_rated', attributeName: 'Voltage Rating', unit: 'V', sortOrder: 2 },
    '精度': { attributeId: 'tolerance', attributeName: 'Tolerance', sortOrder: 5 },
    '等效串联电阻': { attributeId: 'esr', attributeName: 'ESR', sortOrder: 6 },
    '纹波电流': { attributeId: 'ripple_current', attributeName: 'Ripple Current', sortOrder: 7 },
    '漏泄电流': { attributeId: 'leakage_current', attributeName: 'Leakage Current', sortOrder: 8 },
    '不同温度时的使用寿命': { attributeId: 'lifetime', attributeName: 'Lifetime', sortOrder: 9 },
    '封装/外壳': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 3 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 10 },
  },

  // ─── 65 Varistors / MOVs ───────────────────────────────
  '65': {
    '压敏电压': { attributeId: 'varistor_voltage', attributeName: 'Varistor Voltage', unit: 'V', sortOrder: 1 },
    '钳位电压': { attributeId: 'clamping_voltage', attributeName: 'Clamping Voltage', unit: 'V', sortOrder: 2 },
    '最大工作电压(dc)': { attributeId: 'max_continuous_voltage', attributeName: 'Max Continuous Voltage', unit: 'V', sortOrder: 3 },
    '额定电压-dc': { attributeId: 'max_continuous_voltage', attributeName: 'Max Continuous Voltage', unit: 'V', sortOrder: 3 },
    '最大工作电压(ac)': { attributeId: '_max_ac_voltage', attributeName: 'Max AC Voltage', unit: 'V', sortOrder: 4 },
    '最大ac电压': { attributeId: '_max_ac_voltage', attributeName: 'Max AC Voltage', unit: 'V', sortOrder: 4 },
    '能量': { attributeId: 'energy_rating', attributeName: 'Energy Rating', unit: 'J', sortOrder: 5 },
    '峰值浪涌电流': { attributeId: 'peak_surge_current', attributeName: 'Peak Surge Current', unit: 'A', sortOrder: 6 },
    '浪涌电流': { attributeId: 'peak_surge_current', attributeName: 'Peak Surge Current', unit: 'A', sortOrder: 6 },
    '静态电容': { attributeId: '_static_capacitance', attributeName: 'Static Capacitance', sortOrder: 90 },
    '结电容': { attributeId: '_static_capacitance', attributeName: 'Static Capacitance', sortOrder: 90 },
    '静态功率': { attributeId: '_static_power', attributeName: 'Static Power', sortOrder: 91 },
    // CREATEK English MFR-specific formats
    'vac(v)': { attributeId: '_max_ac_voltage', attributeName: 'Max AC Voltage', unit: 'V', sortOrder: 4 },
    'vdc(v)': { attributeId: 'max_continuous_voltage', attributeName: 'Max DC Voltage', unit: 'V', sortOrder: 3 },
    'v(1ma)(v)': { attributeId: 'varistor_voltage', attributeName: 'Varistor Voltage (V1mA)', unit: 'V', sortOrder: 1 },
    'ip(a)': { attributeId: 'peak_surge_current', attributeName: 'Peak Surge Current', unit: 'A', sortOrder: 6 },
    'vc(v)': { attributeId: 'clamping_voltage', attributeName: 'Clamping Voltage', unit: 'V', sortOrder: 2 },
    '8/20us(a)': { attributeId: 'peak_surge_current', attributeName: 'Surge Current (8/20µs)', unit: 'A', sortOrder: 6 },
    '10/1000μs(j)': { attributeId: 'energy_rating', attributeName: 'Energy Rating (10/1000µs)', unit: 'J', sortOrder: 5 },
    'rated power(w)': { attributeId: '_rated_power', attributeName: 'Rated Power', unit: 'W', sortOrder: 92 },
    'diameter': { attributeId: '_disc_diameter', attributeName: 'Disc Diameter', unit: 'mm', sortOrder: 93 },
    '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 7 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 8 },
  },

  // ─── 66 PTC Resettable Fuses ───────────────────────────
  '66': {
    '保持电流': { attributeId: 'hold_current', attributeName: 'Hold Current', unit: 'A', sortOrder: 1 },
    '额定电流': { attributeId: 'hold_current', attributeName: 'Hold Current', unit: 'A', sortOrder: 1 },
    '熔断电流': { attributeId: 'trip_current', attributeName: 'Trip Current', unit: 'A', sortOrder: 2 },
    '跳闸电流': { attributeId: 'trip_current', attributeName: 'Trip Current', unit: 'A', sortOrder: 2 },
    '跳闸动作电流(it)': { attributeId: 'trip_current', attributeName: 'Trip Current', unit: 'A', sortOrder: 2 },
    '最大工作电压': { attributeId: 'max_voltage', attributeName: 'Max Voltage', unit: 'V', sortOrder: 3 },
    '最大电压': { attributeId: 'max_voltage', attributeName: 'Max Voltage', unit: 'V', sortOrder: 3 },
    '额定电压-dc': { attributeId: 'max_voltage', attributeName: 'Max Voltage', unit: 'V', sortOrder: 3 },
    '电流-最大值': { attributeId: 'max_fault_current', attributeName: 'Max Fault Current', unit: 'A', sortOrder: 4 },
    '最大电流': { attributeId: 'max_fault_current', attributeName: 'Max Fault Current', unit: 'A', sortOrder: 4 },
    '熔断时间': { attributeId: 'time_to_trip', attributeName: 'Time to Trip', sortOrder: 5 },
    '跳闸动作时间': { attributeId: 'time_to_trip', attributeName: 'Time to Trip', sortOrder: 5 },
    '最大动作时间': { attributeId: 'time_to_trip', attributeName: 'Time to Trip', sortOrder: 5 },
    '电阻-初始(ri)(最小值)': { attributeId: 'initial_resistance', attributeName: 'Initial Resistance', unit: 'Ohm', sortOrder: 6 },
    '初始态阻值(最小值)': { attributeId: 'initial_resistance', attributeName: 'Initial Resistance', unit: 'Ohm', sortOrder: 6 },
    '电阻-跳断后(r1)(最大值)': { attributeId: 'post_trip_resistance', attributeName: 'Post-Trip Resistance', unit: 'Ohm', sortOrder: 7 },
    '跳断后阻值(最大值)': { attributeId: 'post_trip_resistance', attributeName: 'Post-Trip Resistance', unit: 'Ohm', sortOrder: 7 },
    '功率耗散(最大值)': { attributeId: 'power_dissipation', attributeName: 'Power Dissipation', unit: 'W', sortOrder: 8 },
    '消耗功率': { attributeId: 'power_dissipation', attributeName: 'Power Dissipation', unit: 'W', sortOrder: 8 },
    '封装/外壳': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 9 },
    '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 9 },
    // CREATEK English MFR-specific formats
    'vmax(v)': { attributeId: 'max_voltage', attributeName: 'Max Voltage', unit: 'V', sortOrder: 3 },
    'ihold(a)': { attributeId: 'hold_current', attributeName: 'Hold Current', unit: 'A', sortOrder: 1 },
    'itrip(a)': { attributeId: 'trip_current', attributeName: 'Trip Current', unit: 'A', sortOrder: 2 },
    'pd(w)': { attributeId: 'power_dissipation', attributeName: 'Power Dissipation', unit: 'W', sortOrder: 8 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 10 },
  },

  // ─── 67 NTC Thermistors ────────────────────────────────
  '67': {
    '阻值(25℃)': { attributeId: 'resistance_r25', attributeName: 'Resistance @ 25°C', unit: 'Ohm', sortOrder: 1 },
    'b值(25℃/50℃)': { attributeId: 'b_value', attributeName: 'B-Value', unit: 'K', sortOrder: 2 },
    'b值(25℃/75℃)': { attributeId: 'b_value', attributeName: 'B-Value', unit: 'K', sortOrder: 2 },
    'b值(25℃/85℃)': { attributeId: 'b_value', attributeName: 'B-Value', unit: 'K', sortOrder: 2 },
    'b值(25℃/100℃)': { attributeId: 'b_value', attributeName: 'B-Value', unit: 'K', sortOrder: 2 },
    '电阻精度': { attributeId: 'r25_tolerance', attributeName: 'R25 Tolerance', sortOrder: 4 },
    'b值精度': { attributeId: 'b_value_tolerance', attributeName: 'B-Value Tolerance', sortOrder: 5 },
    '功率': { attributeId: 'max_power', attributeName: 'Max Power', unit: 'W', sortOrder: 9 },
    '最大稳态电流(25℃)': { attributeId: '_max_steady_current', attributeName: 'Max Steady-State Current', unit: 'A', sortOrder: 90 },
    '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 6 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 8 },
  },

  // ─── 69 Common Mode Chokes ─────────────────────────────
  '69': {
    '共模阻抗': { attributeId: 'cm_impedance', attributeName: 'CM Impedance', sortOrder: 1 },
    '感值': { attributeId: 'cm_inductance', attributeName: 'CM Inductance', sortOrder: 2 },
    '直流电阻(dcr)': { attributeId: 'dcr', attributeName: 'DC Resistance', unit: 'Ohm', sortOrder: 8 },
    '额定电流': { attributeId: 'rated_current', attributeName: 'Rated Current', unit: 'A', sortOrder: 7 },
    '线路数': { attributeId: 'number_of_lines', attributeName: 'Number of Lines', sortOrder: 4 },
    '测试频率': { attributeId: '_test_frequency', attributeName: 'Test Frequency', sortOrder: 90 },
    '额定电压-dc': { attributeId: 'voltage_rated', attributeName: 'Voltage Rating', unit: 'V', sortOrder: 9 },
    '饱和电流': { attributeId: '_saturation_current', attributeName: 'Saturation Current', unit: 'A', sortOrder: 91 },
    '封装/外壳': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 6 },
    '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 6 },
    '外壳': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 6 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 10 },
    // Traditional-Chinese bare synonyms — defensive coverage for vendors
    // that ship the bare form without unit qualifier. The compound forms
    // 耐電壓(v) / 絕緣阻抗(mω) already exist as accepted overrides; these
    // bare entries catch the same physical specs when the qualifier is absent.
    '耐電壓': { attributeId: 'insulation_voltage', attributeName: 'Insulation Voltage', unit: 'V', sortOrder: 11 },
    '絕緣阻抗': { attributeId: 'insulation_resistance', attributeName: 'Insulation Resistance', unit: 'MOhm', sortOrder: 12 },
  },

  // ─── 70 Ferrite Beads ──────────────────────────────────
  '70': {
    '阻抗@频率': { attributeId: 'impedance_100mhz', attributeName: 'Impedance @ 100MHz', unit: 'Ohm', sortOrder: 1 },
    '阻抗': { attributeId: 'impedance_100mhz', attributeName: 'Impedance @ 100MHz', unit: 'Ohm', sortOrder: 1 },
    '测试频率': { attributeId: '_test_frequency', attributeName: 'Test Frequency', sortOrder: 90 },
    '直流电阻(dcr)': { attributeId: 'dcr', attributeName: 'DC Resistance', unit: 'Ohm', sortOrder: 5 },
    '额定电流': { attributeId: 'rated_current', attributeName: 'Rated Current', unit: 'A', sortOrder: 4 },
    '通道数': { attributeId: 'number_of_lines', attributeName: 'Number of Lines', sortOrder: 6 },
    '误差': { attributeId: 'tolerance', attributeName: 'Tolerance', sortOrder: 7 },
    '精度': { attributeId: 'tolerance', attributeName: 'Tolerance', sortOrder: 7 },
    '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 3 },
    '封装/外壳': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 3 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 8 },
  },

  // ─── 71 Fixed Inductors ────────────────────────────────
  '71': {
    '电感值': { attributeId: 'inductance', attributeName: 'Inductance', sortOrder: 1 },
    '感值': { attributeId: 'inductance', attributeName: 'Inductance', sortOrder: 1 },
    '电感 (μh)': { attributeId: 'inductance', attributeName: 'Inductance', unit: 'uH', sortOrder: 1 },
    '最大工作电压': { attributeId: '_max_voltage', attributeName: 'Max Voltage', unit: 'V', sortOrder: 90 },
    '直流电阻(dcr)': { attributeId: 'dcr', attributeName: 'DC Resistance', unit: 'Ohm', sortOrder: 6 },
    '直流电阻 (mω)typ @25℃': { attributeId: 'dcr', attributeName: 'DC Resistance', unit: 'mOhm', sortOrder: 6 },
    '额定电流': { attributeId: 'rated_current', attributeName: 'Rated Current', unit: 'A', sortOrder: 5 },
    '饱和电流': { attributeId: 'saturation_current', attributeName: 'Saturation Current', unit: 'A', sortOrder: 4 },
    '饱和电流(isat)': { attributeId: 'saturation_current', attributeName: 'Saturation Current', unit: 'A', sortOrder: 4 },
    '饱和电流(a)': { attributeId: 'saturation_current', attributeName: 'Saturation Current', unit: 'A', sortOrder: 4 },
    '测试频率': { attributeId: '_test_frequency', attributeName: 'Test Frequency', sortOrder: 91 },
    '精度': { attributeId: 'tolerance', attributeName: 'Tolerance', sortOrder: 3 },
    '类型': { attributeId: '_type', attributeName: 'Type', sortOrder: 90 },
    '自谐振频率': { attributeId: 'srf', attributeName: 'Self-Resonant Frequency', sortOrder: 8 },
    '屏蔽': { attributeId: 'shielding', attributeName: 'Shielding', sortOrder: 9 },
    '封装/外壳': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 2 },
    '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 2 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 10 },
    '操作溫度': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 10 },
    // Dimension trio — height is a real matching canonical (see powerInductors.ts).
    // length/width have no logic-table canonical; stored deprioritized to preserve data.
    '高(公釐)': { attributeId: 'height', attributeName: 'Height', unit: 'mm', sortOrder: 11 },
    '高': { attributeId: 'height', attributeName: 'Height', unit: 'mm', sortOrder: 11 },
    '长(公釐)': { attributeId: '_length_mm', attributeName: 'Length', unit: 'mm', sortOrder: 91 },
    '長(公釐)': { attributeId: '_length_mm', attributeName: 'Length', unit: 'mm', sortOrder: 91 },
    '宽(公釐)': { attributeId: '_width_mm', attributeName: 'Width', unit: 'mm', sortOrder: 92 },
    '寬(公釐)': { attributeId: '_width_mm', attributeName: 'Width', unit: 'mm', sortOrder: 92 },
  },

  // ─── Discrete Semiconductors ───────────────────────────

  // ─── B1 Rectifier Diodes ───────────────────────────────
  B1: {
    // Chinese
    '反向耐压vr': { attributeId: 'vrrm', attributeName: 'Reverse Voltage (Vrrm)', unit: 'V', sortOrder: 2 },
    '直流反向耐压(vr)': { attributeId: 'vrrm', attributeName: 'Reverse Voltage (Vrrm)', unit: 'V', sortOrder: 2 },
    '反向峰值电压(最大值)': { attributeId: 'vrrm', attributeName: 'Reverse Voltage (Vrrm)', unit: 'V', sortOrder: 2 },
    '平均整流电流': { attributeId: 'io_avg', attributeName: 'Forward Current (Io)', unit: 'A', sortOrder: 4 },
    '整流电流': { attributeId: 'io_avg', attributeName: 'Forward Current (Io)', unit: 'A', sortOrder: 4 },
    '正向电流': { attributeId: 'io_avg', attributeName: 'Forward Current (Io)', unit: 'A', sortOrder: 4 },
    '正向压降vf': { attributeId: 'vf', attributeName: 'Forward Voltage (Vf)', unit: 'V', sortOrder: 5 },
    '正向压降vf max': { attributeId: 'vf', attributeName: 'Forward Voltage (Vf)', unit: 'V', sortOrder: 5 },
    '正向压降(vf)': { attributeId: 'vf', attributeName: 'Forward Voltage (Vf)', unit: 'V', sortOrder: 5 },
    'ifsm - 正向浪涌峰值电流': { attributeId: 'ifsm', attributeName: 'Surge Current (Ifsm)', unit: 'A', sortOrder: 6 },
    '反向恢复时间(trr)': { attributeId: 'trr', attributeName: 'Reverse Recovery Time (trr)', unit: 'ns', sortOrder: 7 },
    '反向漏电流ir': { attributeId: 'ir_leakage', attributeName: 'Reverse Leakage (Ir)', sortOrder: 8 },
    '反向漏电流 ir': { attributeId: 'ir_leakage', attributeName: 'Reverse Leakage (Ir)', sortOrder: 8 },
    '反向电流(ir)': { attributeId: 'ir_leakage', attributeName: 'Reverse Leakage (Ir)', sortOrder: 8 },
    '二极管配置': { attributeId: 'configuration', attributeName: 'Configuration', sortOrder: 10 },
    '结电容': { attributeId: 'cj', attributeName: 'Junction Capacitance', unit: 'pF', sortOrder: 9 },
    // English
    'vrrm(v)': { attributeId: 'vrrm', attributeName: 'Reverse Voltage (Vrrm)', unit: 'V', sortOrder: 2 },
    'vrrmv': { attributeId: 'vrrm', attributeName: 'Reverse Voltage (Vrrm)', unit: 'V', sortOrder: 2 },
    'if(av)(a)': { attributeId: 'io_avg', attributeName: 'Forward Current (Io)', unit: 'A', sortOrder: 4 },
    'if(av)a': { attributeId: 'io_avg', attributeName: 'Forward Current (Io)', unit: 'A', sortOrder: 4 },
    'vf(v)': { attributeId: 'vf', attributeName: 'Forward Voltage (Vf)', unit: 'V', sortOrder: 5 },
    'ifsm(a)': { attributeId: 'ifsm', attributeName: 'Surge Current (Ifsm)', unit: 'A', sortOrder: 6 },
    'trr(ns)': { attributeId: 'trr', attributeName: 'Reverse Recovery Time (trr)', unit: 'ns', sortOrder: 7 },
    'rthjc(℃/w)': { attributeId: '_rth_jc', attributeName: 'Thermal Resistance (Rth j-c)', unit: '°C/W', sortOrder: 90 },
    'packages': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 11 },
    'package': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 11 },
    // CREATEK English MFR-specific formats
    'ir(ua)': { attributeId: 'ir_leakage', attributeName: 'Reverse Leakage (Ir)', unit: 'µA', sortOrder: 8 },
    'ir(ma)': { attributeId: 'ir_leakage', attributeName: 'Reverse Leakage (Ir)', unit: 'mA', sortOrder: 8 },
    'ir max(ua)': { attributeId: 'ir_leakage', attributeName: 'Reverse Leakage (Ir)', unit: 'µA', sortOrder: 8 },
    // YANGJIE-style "IR at VR" naming (reverse leakage at rated reverse voltage)
    'ir@vr(ua)': { attributeId: 'ir_leakage', attributeName: 'Reverse Leakage (Ir)', unit: 'µA', sortOrder: 8 },
    'ir@vr(ma)': { attributeId: 'ir_leakage', attributeName: 'Reverse Leakage (Ir)', unit: 'mA', sortOrder: 8 },
    'ir@vr (ua)': { attributeId: 'ir_leakage', attributeName: 'Reverse Leakage (Ir)', unit: 'µA', sortOrder: 8 },
    'ir@vr': { attributeId: 'ir_leakage', attributeName: 'Reverse Leakage (Ir)', unit: 'µA', sortOrder: 8 },
    'ir @ vr(ua)': { attributeId: 'ir_leakage', attributeName: 'Reverse Leakage (Ir)', unit: 'µA', sortOrder: 8 },
    'if(ma)': { attributeId: 'io_avg', attributeName: 'Forward Current', unit: 'mA', sortOrder: 4 },
    'if(a)': { attributeId: 'io_avg', attributeName: 'Forward Current', unit: 'A', sortOrder: 4 },
    'i(av)(a)': { attributeId: 'io_avg', attributeName: 'Average Forward Current', unit: 'A', sortOrder: 4 },
    'if(av)(v)': { attributeId: 'io_avg', attributeName: 'Average Forward Current', unit: 'A', sortOrder: 4 },
    'io(ma)': { attributeId: 'io_avg', attributeName: 'Forward Current', unit: 'mA', sortOrder: 4 },
    'id* (a)  @25°c': { attributeId: 'io_avg', attributeName: 'Forward Current', unit: 'A', sortOrder: 4 },
    'pd(mw)': { attributeId: '_pd', attributeName: 'Power Dissipation', unit: 'mW', sortOrder: 91 },
    'vf (v)': { attributeId: 'vf', attributeName: 'Forward Voltage (Vf)', unit: 'V', sortOrder: 5 },
    'vrwm(v)': { attributeId: 'vrwm', attributeName: 'Standoff Voltage (Vrwm)', unit: 'V', sortOrder: 2 },
    'polarity': { attributeId: 'configuration', attributeName: 'Configuration', sortOrder: 10 },
    'vds (v)': { attributeId: 'vrrm', attributeName: 'Voltage Rating', unit: 'V', sortOrder: 2 },
    'cj (pf)': { attributeId: 'cj', attributeName: 'Junction Capacitance', unit: 'pF', sortOrder: 9 },
    'qc (nc)': { attributeId: '_qc', attributeName: 'Total Capacitive Charge', unit: 'nC', sortOrder: 92 },
    // Rd / Series (Dynamic) Resistance → display-only satellite. Critical
    // RF-diode spec (PIN diodes for switching, varicaps for tuning) — slope
    // of the V-I curve at the operating point. B1 has no logic rule for
    // this because rectifier matching doesn't care about it. Until an
    // RF-diode family/sub-family is built (see BACKLOG), Rd lives here as
    // a satellite so values display correctly without polluting B1 matching.
    'rd(ω)': { attributeId: '_rd_series_resistance', attributeName: 'Series Resistance (Rd)', unit: 'Ω', sortOrder: 93 },
    'rd(ohm)': { attributeId: '_rd_series_resistance', attributeName: 'Series Resistance (Rd)', unit: 'Ω', sortOrder: 93 },
    'rd (ω)': { attributeId: '_rd_series_resistance', attributeName: 'Series Resistance (Rd)', unit: 'Ω', sortOrder: 93 },
    'rd (ohm)': { attributeId: '_rd_series_resistance', attributeName: 'Series Resistance (Rd)', unit: 'Ω', sortOrder: 93 },
    'rd': { attributeId: '_rd_series_resistance', attributeName: 'Series Resistance (Rd)', unit: 'Ω', sortOrder: 93 },
    'rs(ω)': { attributeId: '_rd_series_resistance', attributeName: 'Series Resistance (Rd)', unit: 'Ω', sortOrder: 93 },
    'rs(ohm)': { attributeId: '_rd_series_resistance', attributeName: 'Series Resistance (Rd)', unit: 'Ω', sortOrder: 93 },
    'rs': { attributeId: '_rd_series_resistance', attributeName: 'Series Resistance (Rd)', unit: 'Ω', sortOrder: 93 },
    'series resistance': { attributeId: '_rd_series_resistance', attributeName: 'Series Resistance (Rd)', unit: 'Ω', sortOrder: 93 },
    'dynamic resistance': { attributeId: '_rd_series_resistance', attributeName: 'Series Resistance (Rd)', unit: 'Ω', sortOrder: 93 },
    '动态电阻': { attributeId: '_rd_series_resistance', attributeName: 'Series Resistance (Rd)', unit: 'Ω', sortOrder: 93 },
    '串联电阻': { attributeId: '_rd_series_resistance', attributeName: 'Series Resistance (Rd)', unit: 'Ω', sortOrder: 93 },
    '封装/外壳': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 11 },
    '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 11 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 12 },
    // "Type" on B1 rectifiers — Standard/Fast/Ultrafast (recovery class) or
    // misclassification escapees. Map to _type (informational, deprioritized).
    'type': { attributeId: '_type', attributeName: 'Type', sortOrder: 90 },
    '类型': { attributeId: '_type', attributeName: 'Type', sortOrder: 90 },
    // Galaxy (银河微) vendor-specific column-naming convention: "<spec> (<unit>) max"
    // pattern used uniformly across all 2,823 of Galaxy's B1 products (2,659
    // rectifiers + 164 bridges). Each spec is published with trailing " max"
    // suffix that no other MFR uses. Without these aliases Galaxy's coverage
    // shows ~0% for B1 (only Configuration mapped via generic alias).
    'vrrm (v) max': { attributeId: 'vrrm', attributeName: 'Reverse Voltage (Vrrm)', unit: 'V', sortOrder: 2 },
    'if (a) max': { attributeId: 'io_avg', attributeName: 'Forward Current (Io)', unit: 'A', sortOrder: 4 },
    'vf (v) max': { attributeId: 'vf', attributeName: 'Forward Voltage (Vf)', unit: 'V', sortOrder: 5 },
    'ifsm (a) max': { attributeId: 'ifsm', attributeName: 'Surge Current (Ifsm)', unit: 'A', sortOrder: 6 },
    'ir (ua) max': { attributeId: 'ir_leakage', attributeName: 'Reverse Leakage (Ir)', unit: 'µA', sortOrder: 8 },
    'trr (ns) max': { attributeId: 'trr', attributeName: 'Reverse Recovery Time (trr)', unit: 'ns', sortOrder: 7 },
    'condition1_if (a)': { attributeId: '_if_test_a', attributeName: 'IF Test Current', unit: 'A', sortOrder: 94 },
    'condition2_vr (v)': { attributeId: '_vr_test_v', attributeName: 'VR Test Voltage', unit: 'V', sortOrder: 95 },
    'aec qualified': { attributeId: 'aec_q101', attributeName: 'AEC-Q101 Qualified', sortOrder: 13 },
    'package outlines': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 11 },
    '最高工作温度': { attributeId: '_operating_temp_max', attributeName: 'Max Operating Temp', unit: '°C', sortOrder: 96 },
    '最低工作温度': { attributeId: '_operating_temp_min', attributeName: 'Min Operating Temp', unit: '°C', sortOrder: 97 },
  },

  // ─── B3 Zener Diodes ───────────────────────────────────
  B3: {
    // Chinese
    '稳压值vz': { attributeId: 'vz', attributeName: 'Zener Voltage', unit: 'V', sortOrder: 1 },
    '标准稳压值': { attributeId: 'vz', attributeName: 'Zener Voltage', unit: 'V', sortOrder: 1 },
    '稳压值(标称值)': { attributeId: 'vz', attributeName: 'Zener Voltage', unit: 'V', sortOrder: 1 },
    '最大稳压值': { attributeId: '_vz_max', attributeName: 'Zener Voltage Max', unit: 'V', sortOrder: 90 },
    '最小稳压值': { attributeId: '_vz_min', attributeName: 'Zener Voltage Min', unit: 'V', sortOrder: 91 },
    '稳压值(范围)': { attributeId: '_vz_range', attributeName: 'Zener Voltage Range', unit: 'V', sortOrder: 92 },
    '功率耗散(最大值)': { attributeId: 'pd', attributeName: 'Power Dissipation', unit: 'W', sortOrder: 3 },
    '功率(pd)': { attributeId: 'pd', attributeName: 'Power Dissipation', unit: 'W', sortOrder: 3 },
    'zzt阻抗': { attributeId: 'zzt', attributeName: 'Zener Impedance (Zzt)', unit: 'Ohm', sortOrder: 4 },
    '阻抗(zzt)': { attributeId: 'zzt', attributeName: 'Zener Impedance (Zzt)', unit: 'Ohm', sortOrder: 4 },
    '反向漏电流ir': { attributeId: 'ir_leakage', attributeName: 'Reverse Leakage (Ir)', sortOrder: 6 },
    '反向电流(ir)': { attributeId: 'ir_leakage', attributeName: 'Reverse Leakage (Ir)', sortOrder: 6 },
    '二极管配置': { attributeId: 'configuration', attributeName: 'Configuration', sortOrder: 10 },
    '基准电压的容限率': { attributeId: 'vz_tolerance', attributeName: 'Vz Tolerance', sortOrder: 2 },
    '正向压降vf max': { attributeId: 'vf', attributeName: 'Forward Voltage (Vf)', unit: 'V', sortOrder: 7 },
    // English
    'zener voltage vz': { attributeId: 'vz', attributeName: 'Zener Voltage', unit: 'V', sortOrder: 1 },
    // Vz Min/Max → existing satellites _vz_min / _vz_max (Chinese keys at
    // lines 777-778). Adds English synonyms so future MFRs auto-route.
    // 'vz' (primary) is the nominal Vz at Izt — the B3 logic table identity
    // match. Min/Max are display-only spec-window bounds.
    'vz(min.)': { attributeId: '_vz_min', attributeName: 'Zener Voltage Min', unit: 'V', sortOrder: 91 },
    'vz(min)': { attributeId: '_vz_min', attributeName: 'Zener Voltage Min', unit: 'V', sortOrder: 91 },
    'vz (min)': { attributeId: '_vz_min', attributeName: 'Zener Voltage Min', unit: 'V', sortOrder: 91 },
    'vz min': { attributeId: '_vz_min', attributeName: 'Zener Voltage Min', unit: 'V', sortOrder: 91 },
    'vz_min': { attributeId: '_vz_min', attributeName: 'Zener Voltage Min', unit: 'V', sortOrder: 91 },
    'vz min(v)': { attributeId: '_vz_min', attributeName: 'Zener Voltage Min', unit: 'V', sortOrder: 91 },
    'zener voltage (min)': { attributeId: '_vz_min', attributeName: 'Zener Voltage Min', unit: 'V', sortOrder: 91 },
    'zener voltage min': { attributeId: '_vz_min', attributeName: 'Zener Voltage Min', unit: 'V', sortOrder: 91 },
    'zener voltage (minimum)': { attributeId: '_vz_min', attributeName: 'Zener Voltage Min', unit: 'V', sortOrder: 91 },
    'vz(max.)': { attributeId: '_vz_max', attributeName: 'Zener Voltage Max', unit: 'V', sortOrder: 90 },
    'vz(max)': { attributeId: '_vz_max', attributeName: 'Zener Voltage Max', unit: 'V', sortOrder: 90 },
    'vz (max)': { attributeId: '_vz_max', attributeName: 'Zener Voltage Max', unit: 'V', sortOrder: 90 },
    'vz max': { attributeId: '_vz_max', attributeName: 'Zener Voltage Max', unit: 'V', sortOrder: 90 },
    'vz_max': { attributeId: '_vz_max', attributeName: 'Zener Voltage Max', unit: 'V', sortOrder: 90 },
    'vz max(v)': { attributeId: '_vz_max', attributeName: 'Zener Voltage Max', unit: 'V', sortOrder: 90 },
    'zener voltage (max)': { attributeId: '_vz_max', attributeName: 'Zener Voltage Max', unit: 'V', sortOrder: 90 },
    'zener voltage max': { attributeId: '_vz_max', attributeName: 'Zener Voltage Max', unit: 'V', sortOrder: 90 },
    'zener voltage (maximum)': { attributeId: '_vz_max', attributeName: 'Zener Voltage Max', unit: 'V', sortOrder: 90 },
    'z power rating': { attributeId: 'pd', attributeName: 'Power Dissipation', unit: 'W', sortOrder: 3 },
    'z voltage tolerance': { attributeId: 'vz_tolerance', attributeName: 'Vz Tolerance', sortOrder: 2 },
    'zener current iz': { attributeId: '_izt', attributeName: 'Test Current (Izt)', unit: 'A', sortOrder: 93 },
    'zener impedance at iz': { attributeId: 'zzt', attributeName: 'Zener Impedance (Zzt)', unit: 'Ohm', sortOrder: 4 },
    'zener impedance at izk': { attributeId: '_zzk', attributeName: 'Knee Impedance (Zzk)', unit: 'Ohm', sortOrder: 94 },
    // IZK (Zener knee current) — display-only satellite. The B3 logic
    // table treats IZK as a test condition documented alongside ZZK
    // rather than an independent matching spec, so this lives as a
    // satellite (underscore prefix) following the same convention as
    // _vz_min / _vz_max / _izt above. Sonnet has historically misclassified
    // "Dynamic Impedance @IZK mA"-named params onto zzk (the impedance)
    // — these dict entries route them to _izk instead. Sample values
    // are typically 0.25–1 mA for low-power Zeners.
    'izk': { attributeId: '_izk', attributeName: 'Zener Knee Current (Izk)', unit: 'mA', sortOrder: 95 },
    'izk(ma)': { attributeId: '_izk', attributeName: 'Zener Knee Current (Izk)', unit: 'mA', sortOrder: 95 },
    'izk (ma)': { attributeId: '_izk', attributeName: 'Zener Knee Current (Izk)', unit: 'mA', sortOrder: 95 },
    'knee current': { attributeId: '_izk', attributeName: 'Zener Knee Current (Izk)', unit: 'mA', sortOrder: 95 },
    'knee current izk': { attributeId: '_izk', attributeName: 'Zener Knee Current (Izk)', unit: 'mA', sortOrder: 95 },
    'dynamic impedance @izk ma': { attributeId: '_izk', attributeName: 'Zener Knee Current (Izk)', unit: 'mA', sortOrder: 95 },
    // CREATEK English MFR-specific formats
    'vz type(v)': { attributeId: 'vz', attributeName: 'Zener Voltage', unit: 'V', sortOrder: 1 },
    'vf (v)': { attributeId: 'vf', attributeName: 'Forward Voltage (Vf)', unit: 'V', sortOrder: 7 },
    'ir max(ua)': { attributeId: 'ir_leakage', attributeName: 'Reverse Leakage (Ir)', unit: 'µA', sortOrder: 6 },
    // YANGJIE-style "IR at VR" naming (reverse leakage at rated reverse voltage)
    'ir@vr(ua)': { attributeId: 'ir_leakage', attributeName: 'Reverse Leakage (Ir)', unit: 'µA', sortOrder: 6 },
    'ir@vr(ma)': { attributeId: 'ir_leakage', attributeName: 'Reverse Leakage (Ir)', unit: 'mA', sortOrder: 6 },
    'ir@vr (ua)': { attributeId: 'ir_leakage', attributeName: 'Reverse Leakage (Ir)', unit: 'µA', sortOrder: 6 },
    'ir@vr': { attributeId: 'ir_leakage', attributeName: 'Reverse Leakage (Ir)', unit: 'µA', sortOrder: 6 },
    'ir @ vr(ua)': { attributeId: 'ir_leakage', attributeName: 'Reverse Leakage (Ir)', unit: 'µA', sortOrder: 6 },
    'pd(w)': { attributeId: 'pd', attributeName: 'Power Dissipation', unit: 'W', sortOrder: 3 },
    '封装/外壳': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 8 },
    '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 8 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 9 },
    // "Type" with values like "Regulator" is informational on a Zener (the
    // family already implies regulator behavior); de-prioritize via _type so
    // it lands under "More" extras rather than cluttering the primary schema.
    'type': { attributeId: '_type', attributeName: 'Type', sortOrder: 90 },
    '类型': { attributeId: '_type', attributeName: 'Type', sortOrder: 90 },
    // Galaxy (银河微) vendor-specific spellings — 2,468 B3 products.
    // 'condition1_it (ma)' already accepted via Triage override (see DB)
    // but kept here for resilience if override is ever revoked.
    'vz (v) nom.': { attributeId: 'vz', attributeName: 'Zener Voltage', unit: 'V', sortOrder: 1 },
    'pd (mw) max': { attributeId: 'pd', attributeName: 'Power Dissipation', unit: 'mW', sortOrder: 3 },
    'condition1_it (ma)': { attributeId: 'izt', attributeName: 'Zener Test Current (Izt)', unit: 'mA', sortOrder: 7 },
    'tolerance': { attributeId: 'vz_tolerance', attributeName: 'Vz Tolerance', sortOrder: 2 },
    'aec qualified': { attributeId: 'aec_q101', attributeName: 'AEC-Q101 Qualified', sortOrder: 12 },
    'package outlines': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 8 },
    '最高工作温度': { attributeId: '_operating_temp_max', attributeName: 'Max Operating Temp', unit: '°C', sortOrder: 96 },
    '最低工作温度': { attributeId: '_operating_temp_min', attributeName: 'Min Operating Temp', unit: '°C', sortOrder: 97 },
  },

  // ─── B4 TVS Diodes ─────────────────────────────────────
  B4: {
    // Chinese
    '极性': { attributeId: 'polarity', attributeName: 'Polarity', sortOrder: 1 },
    '反向断态电压': { attributeId: 'vrwm', attributeName: 'Standoff Voltage (Vrwm)', unit: 'V', sortOrder: 2 },
    '反向截止电压(vrwm)': { attributeId: 'vrwm', attributeName: 'Standoff Voltage (Vrwm)', unit: 'V', sortOrder: 2 },
    '电源电压': { attributeId: 'vrwm', attributeName: 'Standoff Voltage (Vrwm)', unit: 'V', sortOrder: 2 },
    '击穿电压 v(br)-min': { attributeId: 'vbr', attributeName: 'Breakdown Voltage (Vbr)', unit: 'V', sortOrder: 3 },
    '击穿电压': { attributeId: 'vbr', attributeName: 'Breakdown Voltage (Vbr)', unit: 'V', sortOrder: 3 },
    '击穿电压(最大)': { attributeId: '_vbr_max', attributeName: 'Breakdown Voltage Max', unit: 'V', sortOrder: 90 },
    '击穿电压最大': { attributeId: '_vbr_max', attributeName: 'Breakdown Voltage Max', unit: 'V', sortOrder: 90 },
    '击穿电压max': { attributeId: '_vbr_max', attributeName: 'Breakdown Voltage Max', unit: 'V', sortOrder: 90 },
    '最大钳位电压': { attributeId: 'vc', attributeName: 'Clamping Voltage (Vc)', unit: 'V', sortOrder: 4 },
    '功率-峰值脉冲': { attributeId: 'ppk', attributeName: 'Peak Pulse Power', unit: 'W', sortOrder: 5 },
    '峰值脉冲功率(ppp)@10/1000us': { attributeId: 'ppk', attributeName: 'Peak Pulse Power', unit: 'W', sortOrder: 5 },
    '峰值脉冲电流(ipp)': { attributeId: 'ipp', attributeName: 'Peak Pulse Current', unit: 'A', sortOrder: 6 },
    '峰值脉冲电流(ipp)@10/1000us': { attributeId: 'ipp', attributeName: 'Peak Pulse Current', unit: 'A', sortOrder: 6 },
    '结电容': { attributeId: 'cj', attributeName: 'Junction Capacitance', unit: 'pF', sortOrder: 7 },
    '反向漏电流 ir': { attributeId: 'ir_leakage', attributeName: 'Reverse Leakage (Ir)', sortOrder: 8 },
    '反向漏电流(ir)': { attributeId: 'ir_leakage', attributeName: 'Reverse Leakage (Ir)', sortOrder: 8 },
    '通道数': { attributeId: 'num_channels', attributeName: 'Number of Channels', sortOrder: 9 },
    '电路数': { attributeId: 'num_channels', attributeName: 'Number of Channels', sortOrder: 9 },
    '靜電次數': { attributeId: 'esd_pulse_count', attributeName: 'ESD Pulse Count', sortOrder: 11 },
    // English
    'polarity': { attributeId: 'polarity', attributeName: 'Polarity', sortOrder: 1 },
    'operating standoff voltage': { attributeId: 'vrwm', attributeName: 'Standoff Voltage (Vrwm)', unit: 'V', sortOrder: 2 },
    'breakdown voltage vbr': { attributeId: 'vbr', attributeName: 'Breakdown Voltage (Vbr)', unit: 'V', sortOrder: 3 },
    'breakdown voltage (minimum)': { attributeId: 'vbr', attributeName: 'Breakdown Voltage (Vbr)', unit: 'V', sortOrder: 3 },
    'breakdown voltage min': { attributeId: 'vbr', attributeName: 'Breakdown Voltage (Vbr)', unit: 'V', sortOrder: 3 },
    'vbr(min)': { attributeId: 'vbr', attributeName: 'Breakdown Voltage (Vbr)', unit: 'V', sortOrder: 3 },
    'vbr (min)': { attributeId: 'vbr', attributeName: 'Breakdown Voltage (Vbr)', unit: 'V', sortOrder: 3 },
    'v(br) min': { attributeId: 'vbr', attributeName: 'Breakdown Voltage (Vbr)', unit: 'V', sortOrder: 3 },
    'breakdown voltage (maximum)': { attributeId: '_vbr_max', attributeName: 'Breakdown Voltage Max', unit: 'V', sortOrder: 90 },
    'breakdown voltage max': { attributeId: '_vbr_max', attributeName: 'Breakdown Voltage Max', unit: 'V', sortOrder: 90 },
    'vbr(max)': { attributeId: '_vbr_max', attributeName: 'Breakdown Voltage Max', unit: 'V', sortOrder: 90 },
    'vbr (max)': { attributeId: '_vbr_max', attributeName: 'Breakdown Voltage Max', unit: 'V', sortOrder: 90 },
    'v(br) max': { attributeId: '_vbr_max', attributeName: 'Breakdown Voltage Max', unit: 'V', sortOrder: 90 },
    'clamping voltage vc': { attributeId: 'vc', attributeName: 'Clamping Voltage (Vc)', unit: 'V', sortOrder: 4 },
    'power rating': { attributeId: 'ppk', attributeName: 'Peak Pulse Power', unit: 'W', sortOrder: 5 },
    'max peak current ipk': { attributeId: 'ipp', attributeName: 'Peak Pulse Current', unit: 'A', sortOrder: 6 },
    'junction capacitance cj': { attributeId: 'cj', attributeName: 'Junction Capacitance', unit: 'pF', sortOrder: 7 },
    'esd per iec contact': { attributeId: 'esd_rating', attributeName: 'ESD Rating (IEC)', unit: 'kV', sortOrder: 10 },
    'vrwm(v)': { attributeId: 'vrwm', attributeName: 'Standoff Voltage (Vrwm)', unit: 'V', sortOrder: 2 },
    'ir max(ua)': { attributeId: 'ir_leakage', attributeName: 'Reverse Leakage (Ir)', sortOrder: 8 },
    'ir(ua)': { attributeId: 'ir_leakage', attributeName: 'Reverse Leakage (Ir)', unit: 'µA', sortOrder: 8 },
    // CREATEK English MFR-specific formats
    'ipp(a)': { attributeId: 'ipp', attributeName: 'Peak Pulse Current (Ipp)', unit: 'A', sortOrder: 6 },
    'ppp(w)': { attributeId: 'ppk', attributeName: 'Peak Pulse Power (Ppk)', unit: 'W', sortOrder: 5 },
    'vbr min(v)': { attributeId: 'vbr', attributeName: 'Breakdown Voltage (Vbr)', unit: 'V', sortOrder: 3 },
    'vbr max(v)': { attributeId: '_vbr_max', attributeName: 'Breakdown Voltage Max', unit: 'V', sortOrder: 90 },
    'vc max(v)': { attributeId: 'vc', attributeName: 'Clamping Voltage (Vc)', unit: 'V', sortOrder: 4 },
    'dir.': { attributeId: 'polarity', attributeName: 'Polarity', sortOrder: 1 },
    'config.': { attributeId: 'configuration', attributeName: 'Configuration', sortOrder: 13 },
    'c typ.(pf)': { attributeId: 'cj', attributeName: 'Junction Capacitance (Cj)', unit: 'pF', sortOrder: 7 },
    '封装/外壳': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 11 },
    '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 11 },
    // "Size code" — a real synonym for package_case used in some Chinese
    // TVS datasheet headers. Traditional 尺寸代碼 also matches via the
    // trad→simp normalization layer in chineseNormalize.ts.
    '尺寸代码': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 11 },
    // "Inches" — semantically a unit, not a parameter, but appears in card
    // prose as `英时(公釐)` annotations on package_case dimensions. Mapped
    // to package_case to suppress audit noise; not load-bearing for ingest
    // because Atlas params don't carry English/Chinese unit names as
    // standalone fields.
    '英时': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 11 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 12 },
    // "Type" on TVS encodes polarity (Bi/Uni/Bidirectional/Unidirectional) —
    // route to the polarity attribute so it feeds the matching engine. If
    // future ingests show non-polarity Type values on B4, surface via admin
    // override rather than broadening this mapping.
    'type': { attributeId: 'polarity', attributeName: 'Polarity', sortOrder: 1 },
    '类型': { attributeId: 'polarity', attributeName: 'Polarity', sortOrder: 1 },
    // Galaxy (银河微) vendor-specific spellings — 2,359 B4 products. Galaxy
    // splits Vbr into min and max columns and uses trailing-period suffix.
    // 'c (pf) max.' already accepted via Triage override (see DB) but
    // kept here for resilience.
    'vrwm (v) max.': { attributeId: 'vrwm', attributeName: 'Standoff Voltage (Vrwm)', unit: 'V', sortOrder: 2 },
    'vbr (v) min.': { attributeId: 'vbr', attributeName: 'Breakdown Voltage (Vbr)', unit: 'V', sortOrder: 3 },
    'vbr (v) max.': { attributeId: '_vbr_max', attributeName: 'Breakdown Voltage Max', unit: 'V', sortOrder: 90 },
    'ir (ua) max.': { attributeId: 'ir_leakage', attributeName: 'Reverse Leakage (Ir)', unit: 'µA', sortOrder: 8 },
    'vc (v) max.': { attributeId: 'vc', attributeName: 'Clamping Voltage (Vc)', unit: 'V', sortOrder: 4 },
    'ppk (w)': { attributeId: 'ppk', attributeName: 'Peak Pulse Power', unit: 'W', sortOrder: 5 },
    'c (pf) max.': { attributeId: 'cj', attributeName: 'Junction Capacitance', unit: 'pF', sortOrder: 7 },
    // Condition1_IPP (A) on Galaxy is the rated IPP at the waveform in
    // Condition column — semantically the same as the canonical `ipp`.
    // Routes to load-bearing `ipp` so it feeds B4 matching.
    'condition1_ipp (a)': { attributeId: 'ipp', attributeName: 'Peak Pulse Current', unit: 'A', sortOrder: 6 },
    'condition': { attributeId: '_test_condition', attributeName: 'Test Condition', sortOrder: 95 },
    'aec qualified': { attributeId: 'aec_q101', attributeName: 'AEC-Q101 Qualified', sortOrder: 12 },
    'package outlines': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 11 },
    // Routes 最高工作温度 to load-bearing `tj_max` (for TVS the max operating
    // temp IS the junction-temp ceiling — same number on datasheets). Min
    // stays as a satellite, then ingest synthesizes `operating_temp` range.
    '最高工作温度': { attributeId: 'tj_max', attributeName: 'Max Junction Temperature (Tj_max)', unit: '°C', sortOrder: 17 },
    '最低工作温度': { attributeId: '_operating_temp_min', attributeName: 'Min Operating Temp', unit: '°C', sortOrder: 97 },
  },

  // ─── B5 MOSFETs ────────────────────────────────────────
  B5: {
    // Channel type / polarity
    'polarity': { attributeId: 'channel_type', attributeName: 'Channel Type', sortOrder: 1 },
    '极性': { attributeId: 'channel_type', attributeName: 'Channel Type', sortOrder: 1 },
    'cfg.': { attributeId: 'channel_type', attributeName: 'Channel Type', sortOrder: 1 },
    'configuration': { attributeId: '_configuration', attributeName: 'Configuration', sortOrder: 90 },
    // Voltage ratings
    'bvdss (v)': { attributeId: 'vds_max', attributeName: 'Vds Max', unit: 'V', sortOrder: 6 },
    'bv(v)': { attributeId: 'vds_max', attributeName: 'Vds Max', unit: 'V', sortOrder: 6 },
    'vdss(v)': { attributeId: 'vds_max', attributeName: 'Vds Max', unit: 'V', sortOrder: 6 },
    '漏源电压(vdss)': { attributeId: 'vds_max', attributeName: 'Vds Max', unit: 'V', sortOrder: 6 },
    'vgs(±v)': { attributeId: 'vgs_max', attributeName: 'Vgs Max', unit: 'V', sortOrder: 7 },
    'vth(v)-typ.': { attributeId: 'vgs_th', attributeName: 'Gate Threshold (Vth)', unit: 'V', sortOrder: 8 },
    'vth(v)': { attributeId: 'vgs_th', attributeName: 'Gate Threshold (Vth)', unit: 'V', sortOrder: 8 },
    'vth (v)': { attributeId: 'vgs_th', attributeName: 'Gate Threshold (Vth)', unit: 'V', sortOrder: 8 },
    '阈值电压': { attributeId: 'vgs_th', attributeName: 'Gate Threshold (Vth)', unit: 'V', sortOrder: 8 },
    // Min/Max canonical split for MFRs reporting Vth as a range (e.g. KEXIN
    // ships VTH(Min.)/VTH(Max.)). Coexists with the typical-value vgs_th
    // canonical above — the existing B5 logic-table rule (application_review
    // weight 6) doesn't programmatically compare values, so this is a
    // display-only addition. Future logic-table extension would consume
    // these for automated range checks (drive-margin / noise-margin).
    'vth(min.)': { attributeId: 'vgs_th_min', attributeName: 'Gate Threshold Voltage (Min)', unit: 'V', sortOrder: 8 },
    'vth(max.)': { attributeId: 'vgs_th_max', attributeName: 'Gate Threshold Voltage (Max)', unit: 'V', sortOrder: 8 },
    'vgs(th) min': { attributeId: 'vgs_th_min', attributeName: 'Gate Threshold Voltage (Min)', unit: 'V', sortOrder: 8 },
    'vgs(th) max': { attributeId: 'vgs_th_max', attributeName: 'Gate Threshold Voltage (Max)', unit: 'V', sortOrder: 8 },
    'vgs(th)(min)': { attributeId: 'vgs_th_min', attributeName: 'Gate Threshold Voltage (Min)', unit: 'V', sortOrder: 8 },
    'vgs(th)(max)': { attributeId: 'vgs_th_max', attributeName: 'Gate Threshold Voltage (Max)', unit: 'V', sortOrder: 8 },
    // Current ratings
    'id (a)': { attributeId: 'id_max', attributeName: 'Drain Current (Id)', unit: 'A', sortOrder: 9 },
    'id(a) tc=25': { attributeId: 'id_max', attributeName: 'Drain Current (Id)', unit: 'A', sortOrder: 9 },
    'id(a) ta=25': { attributeId: 'id_max', attributeName: 'Drain Current (Id)', unit: 'A', sortOrder: 9 },
    '连续漏极电流': { attributeId: 'id_max', attributeName: 'Drain Current (Id)', unit: 'A', sortOrder: 9 },
    // Power
    'pd (w)': { attributeId: 'pd', attributeName: 'Power Dissipation', unit: 'W', sortOrder: 10 },
    '功率耗散': { attributeId: 'pd', attributeName: 'Power Dissipation', unit: 'W', sortOrder: 10 },
    // Rds(on) — keys with both Ω and ω (Ω lowercases to ω)
    'rds(on)(mΩ max.) 10v': { attributeId: 'rds_on', attributeName: 'Rds(on)', unit: 'mOhm', sortOrder: 11 },
    'rds(on)(mω max.) 10v': { attributeId: 'rds_on', attributeName: 'Rds(on)', unit: 'mOhm', sortOrder: 11 },
    'rds(on) @10vmax (mΩ)': { attributeId: 'rds_on', attributeName: 'Rds(on)', unit: 'mOhm', sortOrder: 11 },
    'rds(on) @10vmax (mω)': { attributeId: 'rds_on', attributeName: 'Rds(on)', unit: 'mOhm', sortOrder: 11 },
    'rds(on) @10vtyp (mΩ)': { attributeId: '_rds_on_typ', attributeName: 'Rds(on) Typ', unit: 'mOhm', sortOrder: 93 },
    'rds(on) @10vtyp (mω)': { attributeId: '_rds_on_typ', attributeName: 'Rds(on) Typ', unit: 'mOhm', sortOrder: 93 },
    'rds(on)(mΩ max.) 4.5v': { attributeId: '_rds_on_4v5', attributeName: 'Rds(on) @4.5V', unit: 'mOhm', sortOrder: 94 },
    'rds(on)(mω max.) 4.5v': { attributeId: '_rds_on_4v5', attributeName: 'Rds(on) @4.5V', unit: 'mOhm', sortOrder: 94 },
    'rds(on) @4.5vtyp (mΩ)': { attributeId: '_rds_on_4v5_typ', attributeName: 'Rds(on) @4.5V Typ', unit: 'mOhm', sortOrder: 95 },
    'rds(on) @4.5vtyp (mω)': { attributeId: '_rds_on_4v5_typ', attributeName: 'Rds(on) @4.5V Typ', unit: 'mOhm', sortOrder: 95 },
    'rds(on) @4.5vmax (mΩ)': { attributeId: '_rds_on_4v5', attributeName: 'Rds(on) @4.5V', unit: 'mOhm', sortOrder: 94 },
    'rds(on) @4.5vmax (mω)': { attributeId: '_rds_on_4v5', attributeName: 'Rds(on) @4.5V', unit: 'mOhm', sortOrder: 94 },
    'rds(on)(mω)max. at vgs =10v': { attributeId: 'rds_on', attributeName: 'Rds(on)', unit: 'mOhm', sortOrder: 11 },
    'rds(on) (mω) 10v typ': { attributeId: '_rds_on_typ', attributeName: 'Rds(on) Typ', unit: 'mOhm', sortOrder: 93 },
    // Additional MOSFET voltage/current variants
    'vds (v)': { attributeId: 'vds_max', attributeName: 'Vds Max', unit: 'V', sortOrder: 6 },
    'vgs(th) (v)': { attributeId: 'vgs_th', attributeName: 'Gate Threshold (Vth)', unit: 'V', sortOrder: 8 },
    'vth(v) typ': { attributeId: 'vgs_th', attributeName: 'Gate Threshold (Vth)', unit: 'V', sortOrder: 8 },
    'id(a)': { attributeId: 'id_max', attributeName: 'Drain Current (Id)', unit: 'A', sortOrder: 9 },
    '晶体管类型': { attributeId: 'channel_type', attributeName: 'Channel Type', sortOrder: 1 },
    '配置': { attributeId: '_configuration', attributeName: 'Configuration', sortOrder: 90 },
    '击穿电压': { attributeId: 'vds_max', attributeName: 'Vds Max', unit: 'V', sortOrder: 6 },
    '栅极源极击穿电压': { attributeId: 'vgs_max', attributeName: 'Vgs Max', unit: 'V', sortOrder: 7 },
    '充电电量': { attributeId: 'qg', attributeName: 'Gate Charge (Qg)', unit: 'nC', sortOrder: 13 },
    '输入电容': { attributeId: 'ciss', attributeName: 'Input Capacitance (Ciss)', unit: 'pF', sortOrder: 14 },
    '反向传输电容crss': { attributeId: 'crss', attributeName: 'Reverse Transfer Capacitance (Crss)', unit: 'pF', sortOrder: 16 },
    '不同 id，vgs时的 rdson(最大值)': { attributeId: 'rds_on', attributeName: 'Rds(on)', unit: 'mOhm', sortOrder: 11 },
    '消耗电流': { attributeId: '_iq', attributeName: 'Quiescent Current', sortOrder: 97 },
    '正向电流': { attributeId: '_body_diode_if', attributeName: 'Body Diode Forward Current', unit: 'A', sortOrder: 98 },
    '正向压降vf max': { attributeId: '_body_diode_vf', attributeName: 'Body Diode Vf', unit: 'V', sortOrder: 99 },
    // Gate charge
    'qg (nc)': { attributeId: 'qg', attributeName: 'Gate Charge (Qg)', unit: 'nC', sortOrder: 13 },
    'qg*  (nc)': { attributeId: 'qg', attributeName: 'Gate Charge (Qg)', unit: 'nC', sortOrder: 13 },
    'qg* (nc)': { attributeId: 'qg', attributeName: 'Gate Charge (Qg)', unit: 'nC', sortOrder: 13 },
    // Capacitances
    'ciss(pf)typ.': { attributeId: 'ciss', attributeName: 'Input Capacitance (Ciss)', unit: 'pF', sortOrder: 14 },
    'ciss (pf)': { attributeId: 'ciss', attributeName: 'Input Capacitance (Ciss)', unit: 'pF', sortOrder: 14 },
    'coss(pf)typ.': { attributeId: 'coss', attributeName: 'Output Capacitance (Coss)', unit: 'pF', sortOrder: 15 },
    'coss (pf)': { attributeId: 'coss', attributeName: 'Output Capacitance (Coss)', unit: 'pF', sortOrder: 15 },
    'crss(pf)typ.': { attributeId: 'crss', attributeName: 'Reverse Transfer Capacitance (Crss)', unit: 'pF', sortOrder: 16 },
    'crss (pf)': { attributeId: 'crss', attributeName: 'Reverse Transfer Capacitance (Crss)', unit: 'pF', sortOrder: 16 },
    // Technology
    'technology': { attributeId: 'technology', attributeName: 'Technology', sortOrder: 2 },
    'tech nology': { attributeId: 'technology', attributeName: 'Technology', sortOrder: 2 },
    // Automotive
    '车规级 工业级': { attributeId: '_automotive_grade', attributeName: 'Automotive Grade', sortOrder: 96 },
    // Convert/CREATEK English MFR-specific formats
    'vds(v)': { attributeId: 'vds_max', attributeName: 'Vds Max', unit: 'V', sortOrder: 6 },
    'vgs(v)': { attributeId: 'vgs_max', attributeName: 'Vgs Max', unit: 'V', sortOrder: 7 },
    'vgs(th)(v)': { attributeId: 'vgs_th', attributeName: 'Gate Threshold (Vth)', unit: 'V', sortOrder: 8 },
    'id(a)  @25°c': { attributeId: 'id_max', attributeName: 'Drain Current (Id)', unit: 'A', sortOrder: 9 },
    'rds(on)@vgs=4.5v(Ω)': { attributeId: 'rds_on', attributeName: 'Rds(on)', unit: 'Ω', sortOrder: 11 },
    'rds(on)@vgs=4.5v(ω)': { attributeId: 'rds_on', attributeName: 'Rds(on)', unit: 'Ω', sortOrder: 11 },
    'rds(on)@vgs=10v(Ω)': { attributeId: 'rds_on', attributeName: 'Rds(on)', unit: 'Ω', sortOrder: 11 },
    'rds(on)@vgs=10v(ω)': { attributeId: 'rds_on', attributeName: 'Rds(on)', unit: 'Ω', sortOrder: 11 },
    'rds(on) (mΩ) 4.5v typ': { attributeId: '_rds_on_4v5_typ', attributeName: 'Rds(on) @4.5V Typ', unit: 'mOhm', sortOrder: 95 },
    'rds(on) (mω) 4.5v typ': { attributeId: '_rds_on_4v5_typ', attributeName: 'Rds(on) @4.5V Typ', unit: 'mOhm', sortOrder: 95 },
    'rd(mΩ) typ': { attributeId: 'rds_on', attributeName: 'Rds(on)', unit: 'mΩ', sortOrder: 11 },
    'rd(mω) typ': { attributeId: 'rds_on', attributeName: 'Rds(on)', unit: 'mΩ', sortOrder: 11 },
    // Package
    'package': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 4 },
    '封装/外壳': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 4 },
    '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 4 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 17 },
    'type': { attributeId: 'channel_type', attributeName: 'Channel Type', sortOrder: 1 },
    '类型': { attributeId: 'channel_type', attributeName: 'Channel Type', sortOrder: 1 },
    // Galaxy (银河微) vendor-specific spellings — 322 B5 products. Galaxy
    // publishes RDS(on) at 4 Vgs test conditions (10V/4.5V/2.5V/1.8V) each
    // with Typ + Max; 10V is the primary canonical, others are satellites.
    'channel polarity': { attributeId: 'channel_type', attributeName: 'Channel Type', sortOrder: 1 },
    'max vgs (v)': { attributeId: 'vgs_max', attributeName: 'Max Vgs', unit: 'V', sortOrder: 7 },
    'vgs (v)max': { attributeId: 'vgs_max', attributeName: 'Max Vgs', unit: 'V', sortOrder: 7 },
    'max id(a)': { attributeId: 'id_max', attributeName: 'Max Id', unit: 'A', sortOrder: 6 },
    'id(a)max': { attributeId: 'id_max', attributeName: 'Max Id', unit: 'A', sortOrder: 6 },
    'max igss(ua)': { attributeId: 'igss', attributeName: 'Igss', unit: 'µA', sortOrder: 8 },
    'igss(ua)max': { attributeId: 'igss', attributeName: 'Igss', unit: 'µA', sortOrder: 8 },
    'max vgs(th) (v)': { attributeId: 'vgs_th', attributeName: 'Vgs(th)', unit: 'V', sortOrder: 9 },
    'vgs(th) (v)max': { attributeId: 'vgs_th', attributeName: 'Vgs(th)', unit: 'V', sortOrder: 9 },
    'max pd(w)': { attributeId: 'pd_max', attributeName: 'Power Dissipation Max', unit: 'W', sortOrder: 10 },
    'pd(w)max': { attributeId: 'pd_max', attributeName: 'Power Dissipation Max', unit: 'W', sortOrder: 10 },
    'min pd(w)': { attributeId: '_pd_min', attributeName: 'Power Dissipation Min', unit: 'W', sortOrder: 96 },
    'v(br)dss (v)min': { attributeId: 'vds_max', attributeName: 'Vds Max', unit: 'V', sortOrder: 5 },
    'rds(on)(mω) @ 25℃ 10v typ': { attributeId: '_rds_on_typ', attributeName: 'Rds(on) @10V Typ', unit: 'mΩ', sortOrder: 93 },
    'rds(on)(mω) @ 25℃ 10v max': { attributeId: 'rds_on', attributeName: 'Rds(on) @10V Max', unit: 'mΩ', sortOrder: 11 },
    'rds(on)(mω) @ 25℃ 4.5v typ': { attributeId: '_rds_on_4v5_typ', attributeName: 'Rds(on) @4.5V Typ', unit: 'mΩ', sortOrder: 95 },
    'rds(on)(mω) @ 25℃ 4.5v max': { attributeId: '_rds_on_4v5', attributeName: 'Rds(on) @4.5V Max', unit: 'mΩ', sortOrder: 94 },
    'rds(on)(mω) @ 25℃ 2.5v typ': { attributeId: '_rds_on_2v5_typ', attributeName: 'Rds(on) @2.5V Typ', unit: 'mΩ', sortOrder: 97 },
    'rds(on)(mω) @ 25℃ 2.5v max': { attributeId: '_rds_on_2v5_max', attributeName: 'Rds(on) @2.5V Max', unit: 'mΩ', sortOrder: 98 },
    'rds(on)(mω) @ 25℃ 1.8v typ': { attributeId: '_rds_on_1v8_typ', attributeName: 'Rds(on) @1.8V Typ', unit: 'mΩ', sortOrder: 99 },
    'rds(on)(mω) @ 25℃ 1.8v max': { attributeId: '_rds_on_1v8_max', attributeName: 'Rds(on) @1.8V Max', unit: 'mΩ', sortOrder: 100 },
    // Galaxy 19-product variant: 10V has NO space between voltage and Typ/Max,
    // and 4.5V/2.5V/1.8V use TAB character instead of space. Edge case but
    // present in ~6% of Galaxy MOSFETs (BL-series).
    'rds(on)(mω) @ 25℃ 10vtyp': { attributeId: '_rds_on_typ', attributeName: 'Rds(on) @10V Typ', unit: 'mΩ', sortOrder: 93 },
    'rds(on)(mω) @ 25℃ 10vmax': { attributeId: 'rds_on', attributeName: 'Rds(on) @10V Max', unit: 'mΩ', sortOrder: 11 },
    'rds(on)(mω) @ 25℃ 4.5v\ttyp': { attributeId: '_rds_on_4v5_typ', attributeName: 'Rds(on) @4.5V Typ', unit: 'mΩ', sortOrder: 95 },
    'rds(on)(mω) @ 25℃ 4.5v\tmax': { attributeId: '_rds_on_4v5', attributeName: 'Rds(on) @4.5V Max', unit: 'mΩ', sortOrder: 94 },
    'rds(on)(mω) @ 25℃ 2.5v\ttyp': { attributeId: '_rds_on_2v5_typ', attributeName: 'Rds(on) @2.5V Typ', unit: 'mΩ', sortOrder: 97 },
    'rds(on)(mω) @ 25℃ 2.5v\tmax': { attributeId: '_rds_on_2v5_max', attributeName: 'Rds(on) @2.5V Max', unit: 'mΩ', sortOrder: 98 },
    'rds(on)(mω) @ 25℃ 1.8v\ttyp': { attributeId: '_rds_on_1v8_typ', attributeName: 'Rds(on) @1.8V Typ', unit: 'mΩ', sortOrder: 99 },
    'rds(on)(mω) @ 25℃ 1.8v\tmax': { attributeId: '_rds_on_1v8_max', attributeName: 'Rds(on) @1.8V Max', unit: 'mΩ', sortOrder: 100 },
    'esd': { attributeId: '_esd_rating', attributeName: 'ESD Rating', sortOrder: 101 },
    'aec qualified': { attributeId: 'aec_q101', attributeName: 'AEC-Q101 Qualified', sortOrder: 12 },
    'package outlines': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 4 },
    '最高工作温度': { attributeId: '_operating_temp_max', attributeName: 'Max Operating Temp', unit: '°C', sortOrder: 102 },
    '最低工作温度': { attributeId: '_operating_temp_min', attributeName: 'Min Operating Temp', unit: '°C', sortOrder: 103 },
  },

  // ─── B6 BJTs ───────────────────────────────────────────
  B6: {
    // Chinese
    '晶体管类型': { attributeId: 'polarity', attributeName: 'Polarity (NPN/PNP)', sortOrder: 1 },
    '极性': { attributeId: 'polarity', attributeName: 'Polarity (NPN/PNP)', sortOrder: 1 },
    '集射极击穿电压(vceo)': { attributeId: 'vceo_max', attributeName: 'Vceo', unit: 'V', sortOrder: 3 },
    '集电极-发射极饱和电压(vce(sat)@ic,ib)': { attributeId: 'vce_sat', attributeName: 'Vce(sat)', unit: 'V', sortOrder: 6 },
    '直流电流增益(hfe@ic,vce)': { attributeId: '_hfe', attributeName: 'DC Current Gain (hFE)', sortOrder: 7 },
    // hFE variants surfaced by the B6 domain-card audit (June 2026): plain
    // form (~615 prod), DC-prefixed single-column Min&Range (~140), and the
    // reversed @Vce,Ic test-condition order (~3). All the same hFE spec → _hfe
    // (deprioritized; values are binned ranges, preserved per the card).
    '直流电流增益(hfe)': { attributeId: '_hfe', attributeName: 'DC Current Gain (hFE)', sortOrder: 7 },
    'dc电流增益(hfe)(min&range)': { attributeId: '_hfe', attributeName: 'DC Current Gain (hFE)', sortOrder: 7 },
    '直流电流增益(hfe@vce,ic)': { attributeId: '_hfe', attributeName: 'DC Current Gain (hFE)', sortOrder: 7 },
    '集电极截止电流(icbo)': { attributeId: '_icbo', attributeName: 'Collector Cutoff Current', sortOrder: 91 },
    '功率(pd)': { attributeId: '_pd', attributeName: 'Power Dissipation', unit: 'W', sortOrder: 8 },
    '特征频率(ft)': { attributeId: 'ft', attributeName: 'Transition Frequency (ft)', unit: 'MHz', sortOrder: 9 },
    'ft(mhz)': { attributeId: 'ft', attributeName: 'Transition Frequency (ft)', unit: 'MHz', sortOrder: 9 },
    'ft (mhz)': { attributeId: 'ft', attributeName: 'Transition Frequency (ft)', unit: 'MHz', sortOrder: 9 },
    'ft': { attributeId: 'ft', attributeName: 'Transition Frequency (ft)', unit: 'MHz', sortOrder: 9 },
    'transition frequency': { attributeId: 'ft', attributeName: 'Transition Frequency (ft)', unit: 'MHz', sortOrder: 9 },
    '集电极电流(ic)': { attributeId: '_ic', attributeName: 'Collector Current (Ic)', unit: 'A', sortOrder: 5 },
    // English
    'transistor polarity': { attributeId: 'polarity', attributeName: 'Polarity (NPN/PNP)', sortOrder: 1 },
    'vceo': { attributeId: 'vceo_max', attributeName: 'Vceo', unit: 'V', sortOrder: 3 },
    'vcbo': { attributeId: '_vcbo', attributeName: 'Vcbo', unit: 'V', sortOrder: 4 },
    'vebo': { attributeId: '_vebo', attributeName: 'Vebo', unit: 'V', sortOrder: 92 },
    'max collector current': { attributeId: '_ic', attributeName: 'Collector Current (Ic)', unit: 'A', sortOrder: 5 },
    'dc collector gain hfe min': { attributeId: '_hfe', attributeName: 'DC Current Gain (hFE)', sortOrder: 7 },
    'dc current gain hfe max': { attributeId: '_hfe_max', attributeName: 'DC Current Gain Max', sortOrder: 93 },
    'power rating': { attributeId: '_pd', attributeName: 'Power Dissipation', unit: 'W', sortOrder: 8 },
    'package case': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 2 },
    // CREATEK English MFR-specific formats
    'polarity': { attributeId: 'polarity', attributeName: 'Polarity (NPN/PNP)', sortOrder: 1 },
    'vcbo(v)': { attributeId: '_vcbo', attributeName: 'Vcbo', unit: 'V', sortOrder: 4 },
    'vceo(v)': { attributeId: 'vceo_max', attributeName: 'Vceo', unit: 'V', sortOrder: 3 },
    'vebo(v)': { attributeId: '_vebo', attributeName: 'Vebo', unit: 'V', sortOrder: 92 },
    'ic(ma)': { attributeId: '_ic', attributeName: 'Collector Current (Ic)', unit: 'mA', sortOrder: 5 },
    '封装/外壳': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 2 },
    '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 2 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 10 },
    'type': { attributeId: 'polarity', attributeName: 'Polarity (NPN/PNP)', sortOrder: 1 },
    '类型': { attributeId: 'polarity', attributeName: 'Polarity (NPN/PNP)', sortOrder: 1 },
    // Galaxy (银河微) vendor-specific spellings — 475 B6 products (364
    // standard BJTs + 111 digital transistors with built-in bias resistors).
    // hFE uses double-space (typo on Galaxy's end) — preserved verbatim.
    // Skipping digital-transistor specifics (R1/R2/Vi(on)/Vi(off)/Gi/VO(ON))
    // — those are a niche subfamily, low matching value, surface later if
    // there's demand. Note: 'polarity' alone already covered above.
    'v(br)ceo (v) min.': { attributeId: 'vceo_max', attributeName: 'Vceo', unit: 'V', sortOrder: 3 },
    'ic (a)': { attributeId: 'ic_max', attributeName: 'Max Ic', unit: 'A', sortOrder: 4 },
    'ic continuous (ma)': { attributeId: 'ic_max', attributeName: 'Max Ic', unit: 'mA', sortOrder: 4 },
    'hfe  min': { attributeId: '_hfe_min', attributeName: 'hFE Min', sortOrder: 92 },
    'hfe  max': { attributeId: '_hfe_max', attributeName: 'hFE Max', sortOrder: 93 },
    'condition1_vce (v)': { attributeId: '_vce_test_v', attributeName: 'VCE Test Voltage', unit: 'V', sortOrder: 94 },
    'condition1_ic (ma)': { attributeId: '_ic_test_ma', attributeName: 'IC Test Current', unit: 'mA', sortOrder: 95 },
    'condition2_ic (ma)': { attributeId: '_ic_test_ma_2', attributeName: 'IC Test Current (2)', unit: 'mA', sortOrder: 96 },
    'condition2_ib (ma)': { attributeId: '_ib_test_ma', attributeName: 'IB Test Current', unit: 'mA', sortOrder: 97 },
    'vce (sat) (v)': { attributeId: 'vce_sat', attributeName: 'Vce(sat)', unit: 'V', sortOrder: 6 },
    'ft (mhz) min.': { attributeId: 'ft', attributeName: 'Transition Frequency', unit: 'MHz', sortOrder: 7 },
    'pd (w) max.': { attributeId: 'pd', attributeName: 'Power Dissipation', unit: 'W', sortOrder: 8 },
    'pd (mw)': { attributeId: 'pd', attributeName: 'Power Dissipation', unit: 'mW', sortOrder: 8 },
    'aec qualified': { attributeId: 'aec_q101', attributeName: 'AEC-Q101 Qualified', sortOrder: 11 },
    'package outlines': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 2 },
    '最高工作温度': { attributeId: '_operating_temp_max', attributeName: 'Max Operating Temp', unit: '°C', sortOrder: 98 },
    '最低工作温度': { attributeId: '_operating_temp_min', attributeName: 'Min Operating Temp', unit: '°C', sortOrder: 99 },
  },

  // ─── B7 IGBTs ──────────────────────────────────────────
  B7: {
    'vces(v)': { attributeId: 'vces_max', attributeName: 'Vces', unit: 'V', sortOrder: 5 },
    'v(br)ces (v)': { attributeId: 'vces_max', attributeName: 'Vces', unit: 'V', sortOrder: 5 },
    'vcesv': { attributeId: 'vces_max', attributeName: 'Vces', unit: 'V', sortOrder: 5 },
    'ic nom(a)': { attributeId: 'ic_max', attributeName: 'Ic (Continuous)', unit: 'A', sortOrder: 6 },
    'ic(a) 100℃': { attributeId: 'ic_max', attributeName: 'Ic (Continuous)', unit: 'A', sortOrder: 6 },
    'ic(a) tj=100℃': { attributeId: 'ic_max', attributeName: 'Ic (Continuous)', unit: 'A', sortOrder: 6 },
    'ica': { attributeId: 'ic_max', attributeName: 'Ic (Continuous)', unit: 'A', sortOrder: 6 },
    'vce (sat)(v)': { attributeId: 'vce_sat', attributeName: 'Vce(sat)', unit: 'V', sortOrder: 7 },
    'vce(sat)(v) @vge=15v': { attributeId: 'vce_sat', attributeName: 'Vce(sat)', unit: 'V', sortOrder: 7 },
    'vce(sat)(v) @vge=15v max': { attributeId: 'vce_sat', attributeName: 'Vce(sat)', unit: 'V', sortOrder: 7 },
    'vce(sat)(v) @vge=15v, 25℃ max': { attributeId: 'vce_sat', attributeName: 'Vce(sat)', unit: 'V', sortOrder: 7 },
    'vce(sat)(v) @vge=15v typ': { attributeId: '_vce_sat_typ', attributeName: 'Vce(sat) Typ', unit: 'V', sortOrder: 91 },
    'vce(sat)(v) @vge=15v, 25℃ typ': { attributeId: '_vce_sat_typ', attributeName: 'Vce(sat) Typ', unit: 'V', sortOrder: 91 },
    'vce(sat)': { attributeId: 'vce_sat', attributeName: 'Vce(sat)', unit: 'V', sortOrder: 7 },
    'vce(sat)v': { attributeId: 'vce_sat', attributeName: 'Vce(sat)', unit: 'V', sortOrder: 7 },
    'eoff(mj)': { attributeId: 'eoff', attributeName: 'Turn-Off Energy (Eoff)', unit: 'mJ', sortOrder: 12 },
    'vge (v)': { attributeId: 'vge_max', attributeName: 'Vge Max', unit: 'V', sortOrder: 8 },
    'vge (th)(v)': { attributeId: 'vgs_th', attributeName: 'Gate Threshold (Vth)', unit: 'V', sortOrder: 9 },
    'vth(v) typ': { attributeId: 'vgs_th', attributeName: 'Gate Threshold (Vth)', unit: 'V', sortOrder: 9 },
    'rthjc(℃/w)': { attributeId: 'rth_jc', attributeName: 'Thermal Resistance (Rth j-c)', unit: '°C/W', sortOrder: 13 },
    'rth(j-c)°c /w': { attributeId: 'rth_jc', attributeName: 'Thermal Resistance (Rth j-c)', unit: '°C/W', sortOrder: 13 },
    'ptot(w)': { attributeId: 'pd', attributeName: 'Power Dissipation', unit: 'W', sortOrder: 10 },
    'pd(w)': { attributeId: 'pd', attributeName: 'Power Dissipation', unit: 'W', sortOrder: 10 },
    'pd(w) 25℃': { attributeId: 'pd', attributeName: 'Power Dissipation', unit: 'W', sortOrder: 10 },
    'tsc (us)': { attributeId: 'tsc', attributeName: 'Short-Circuit Withstand (tsc)', unit: 'us', sortOrder: 14 },
    'switching frequency': { attributeId: '_fsw', attributeName: 'Switching Frequency', sortOrder: 92 },
    'internal circuit': { attributeId: '_internal_circuit', attributeName: 'Internal Circuit', sortOrder: 93 },
    'package': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 4 },
    'packages': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 4 },
    // Convert English MFR-specific formats
    'ic(a)@100℃': { attributeId: 'ic_max', attributeName: 'Ic (Continuous)', unit: 'A', sortOrder: 6 },
    'vth(v)typ': { attributeId: 'vgs_th', attributeName: 'Gate Threshold (Vth)', unit: 'V', sortOrder: 9 },
    'vce(v)_15_typ': { attributeId: '_vce_sat_typ', attributeName: 'Vce(sat) Typ', unit: 'V', sortOrder: 91 },
    'vce(v)_15_max': { attributeId: 'vce_sat', attributeName: 'Vce(sat)', unit: 'V', sortOrder: 7 },
    'vf(v)': { attributeId: '_diode_vf', attributeName: 'Co-packed Diode Vf', unit: 'V', sortOrder: 94 },
    '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 4 },
    '产品外形': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 4 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 15 },
  },

  // ─── B8 SCRs / TRIACs ─────────────────────────────────
  B8: {
    // Techsem English-style
    'vdrm/vrrmv': { attributeId: 'vdrm', attributeName: 'Peak Off-State Voltage (Vdrm)', unit: 'V', sortOrder: 3 },
    'vdrmv': { attributeId: 'vdrm', attributeName: 'Peak Off-State Voltage (Vdrm)', unit: 'V', sortOrder: 3 },
    'vrrm(v)': { attributeId: 'vdrm', attributeName: 'Peak Off-State Voltage (Vdrm)', unit: 'V', sortOrder: 3 },
    'it(av)a': { attributeId: 'on_state_current', attributeName: 'On-State Current', unit: 'A', sortOrder: 4 },
    'it(rms)a': { attributeId: 'on_state_current', attributeName: 'On-State Current', unit: 'A', sortOrder: 4 },
    'it(av)(a)': { attributeId: 'on_state_current', attributeName: 'On-State Current', unit: 'A', sortOrder: 4 },
    'itsmka': { attributeId: 'itsm', attributeName: 'Surge On-State Current (Itsm)', unit: 'kA', sortOrder: 5 },
    'itm(a)': { attributeId: 'itsm', attributeName: 'Surge On-State Current (Itsm)', unit: 'A', sortOrder: 5 },
    'tqμs': { attributeId: 'tq', attributeName: 'Turn-Off Time (tq)', unit: 'us', sortOrder: 9 },
    'tqus': { attributeId: 'tq', attributeName: 'Turn-Off Time (tq)', unit: 'us', sortOrder: 9 },
    'di/dtka/μs': { attributeId: 'di_dt', attributeName: 'di/dt Rating', sortOrder: 10 },
    'di/dtka/us': { attributeId: 'di_dt', attributeName: 'di/dt Rating', sortOrder: 10 },
    'dv/dtkv/μs': { attributeId: 'dv_dt', attributeName: 'dV/dt Rating', sortOrder: 11 },
    'dv/dtkv/us': { attributeId: 'dv_dt', attributeName: 'dV/dt Rating', sortOrder: 11 },
    'vtm(v)': { attributeId: '_vtm', attributeName: 'On-State Voltage', unit: 'V', sortOrder: 90 },
    // Chinese
    '断态峰值电压(vdrm)': { attributeId: 'vdrm', attributeName: 'Peak Off-State Voltage (Vdrm)', unit: 'V', sortOrder: 3 },
    '通态电流(it)': { attributeId: 'on_state_current', attributeName: 'On-State Current', unit: 'A', sortOrder: 4 },
    '额定电流a': { attributeId: 'on_state_current', attributeName: 'On-State Current', unit: 'A', sortOrder: 4 },
    '额定电压v': { attributeId: 'vdrm', attributeName: 'Peak Off-State Voltage (Vdrm)', unit: 'V', sortOrder: 3 },
    '维持电流(ih)': { attributeId: 'ih', attributeName: 'Holding Current', unit: 'A', sortOrder: 7 },
    '保持电流(ih)': { attributeId: 'ih', attributeName: 'Holding Current', unit: 'A', sortOrder: 7 },
    '门极触发电压(vgt)': { attributeId: '_vgt', attributeName: 'Gate Trigger Voltage', unit: 'V', sortOrder: 91 },
    // IGT in µA → display-only satellite (sortOrder 92). The B8 logic table
    // has an `igt` rule (threshold lte, weight 7) but no dict entry currently
    // feeds it. Sensitive-gate TRIACs (CR3AM/CR5AM with 'AM' suffix) genuinely
    // spec IGT in µA range (5-50 µA). We keep µA values out of the `igt`
    // canonical to prevent 1000× magnitude confusion if a future MFR ships
    // standard-gate IGT in mA → `igt`. Same satellite pattern as _vbr_max /
    // _isw_peak_a / _icc_ma / _ipk_sense_voltage_mv.
    'igt(ua)': { attributeId: '_igt_ua', attributeName: 'Gate Trigger Current (µA)', unit: 'µA', sortOrder: 92 },
    'igt(µa)': { attributeId: '_igt_ua', attributeName: 'Gate Trigger Current (µA)', unit: 'µA', sortOrder: 92 },
    'igt (ua)': { attributeId: '_igt_ua', attributeName: 'Gate Trigger Current (µA)', unit: 'µA', sortOrder: 92 },
    'igt (µa)': { attributeId: '_igt_ua', attributeName: 'Gate Trigger Current (µA)', unit: 'µA', sortOrder: 92 },
    'igt_ua': { attributeId: '_igt_ua', attributeName: 'Gate Trigger Current (µA)', unit: 'µA', sortOrder: 92 },
    'gate trigger current(ua)': { attributeId: '_igt_ua', attributeName: 'Gate Trigger Current (µA)', unit: 'µA', sortOrder: 92 },
    'gate trigger current(µa)': { attributeId: '_igt_ua', attributeName: 'Gate Trigger Current (µA)', unit: 'µA', sortOrder: 92 },
    '门极触发电流(µa)': { attributeId: '_igt_ua', attributeName: 'Gate Trigger Current (µA)', unit: 'µA', sortOrder: 92 },
    '门极触发电流(ua)': { attributeId: '_igt_ua', attributeName: 'Gate Trigger Current (µA)', unit: 'µA', sortOrder: 92 },
    // IGT in mA → primary canonical `igt` (consumed by B8 logic rule).
    // Standard-gate TRIACs typically spec IGT in 5-50 mA range.
    'igt(ma)': { attributeId: 'igt', attributeName: 'Gate Trigger Current (IGT)', unit: 'mA', sortOrder: 8 },
    'igt (ma)': { attributeId: 'igt', attributeName: 'Gate Trigger Current (IGT)', unit: 'mA', sortOrder: 8 },
    'gate trigger current(ma)': { attributeId: 'igt', attributeName: 'Gate Trigger Current (IGT)', unit: 'mA', sortOrder: 8 },
    '门极触发电流(igt)': { attributeId: 'igt', attributeName: 'Gate Trigger Current (IGT)', unit: 'mA', sortOrder: 8 },
    '门极触发电流(ma)': { attributeId: 'igt', attributeName: 'Gate Trigger Current (IGT)', unit: 'mA', sortOrder: 8 },
    '可控硅类型': { attributeId: '_device_subtype', attributeName: 'Device Subtype', sortOrder: 92 },
    '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 12 },
    'packages': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 12 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 13 },
  },

  // ─── ICs ───────────────────────────────────────────────

  // ─── C3 Gate Drivers ───────────────────────────────────
  C3: {
    // English (3PEAK)
    '# of channel': { attributeId: 'channels', attributeName: 'Number of Channels', sortOrder: 15 },
    'propagation delay(ns)': { attributeId: 'propagation_delay', attributeName: 'Propagation Delay', unit: 'ns', sortOrder: 9 },
    'rise/fall time(ns)': { attributeId: '_rise_fall_time', attributeName: 'Rise/Fall Time', unit: 'ns', sortOrder: 90 },
    'delay matching(ns)': { attributeId: 'delay_matching', attributeName: 'Delay Matching', unit: 'ns', sortOrder: 11 },
    'max output current(a)': { attributeId: 'output_peak_current', attributeName: 'Output Peak Current', unit: 'A', sortOrder: 8 },
    'peak output current(a)': { attributeId: 'output_peak_current', attributeName: 'Output Peak Current', unit: 'A', sortOrder: 8 },
    'vin(v)': { attributeId: '_vin', attributeName: 'Input Voltage', unit: 'V', sortOrder: 91 },
    'input voltage range(v)': { attributeId: '_vin_range', attributeName: 'Input Voltage Range', unit: 'V', sortOrder: 92 },
    // Chinese (CHIPANALOG)
    'cmti(kv/μs)': { attributeId: '_cmti', attributeName: 'CMTI', unit: 'kV/us', sortOrder: 93 },
    '输出最大拉/灌电流(a)': { attributeId: 'output_peak_current', attributeName: 'Output Peak Current', unit: 'A', sortOrder: 8 },
    '输出电流': { attributeId: 'output_peak_current', attributeName: 'Output Peak Current', unit: 'A', sortOrder: 8 },
    // Output-side UVLO threshold on isolated gate drivers — canonical must match
    // the C3 logic table rule attributeId 'uvlo' (lib/logicTables/gateDriver.ts).
    // Previously routed to 'undervoltage_lockout', an orphan canonical no rule
    // scores against — surfaced by the May 2026 C3 domain-card audit.
    '输出侧uvlo(v)': { attributeId: 'uvlo', attributeName: 'UVLO', unit: 'V', sortOrder: 14 },
    '输出侧建议工作电压(v)': { attributeId: '_recommended_vout', attributeName: 'Recommended Output Voltage', unit: 'V', sortOrder: 94 },
    // Isolated gate drivers (NOVOSENSE NSi6601, TI UCC52xx, etc.) have galvanically separated
    // input/output supplies. Output-side VCC drives the MOSFET/IGBT/SiC gate (matches vdd_range);
    // input-side VCC powers the controller-facing logic (separate canonical input_vdd_range).
    // See lib/logicTables/gateDriver.ts for the rule definitions.
    '输出侧vcc电压(max)(v)': { attributeId: 'vdd_range', attributeName: 'Gate Drive Supply VDD Range', unit: 'V', sortOrder: 8 },
    '输入侧vcc电压(max)(v)': { attributeId: 'input_vdd_range', attributeName: 'Input-Side Logic Supply Range', unit: 'V', sortOrder: 21 },
    // Isolation withstand voltage — safety-critical spec on isolated gate drivers.
    // Conventionally measured in kVrms across all datasheets; no unit suffix on canonical.
    '隔离耐压(kvrms)': { attributeId: 'isolation_voltage', attributeName: 'Isolation Withstand Voltage', unit: 'kVrms', sortOrder: 22 },
    '最大瞬态隔离电压 (vpk)': { attributeId: '_transient_isolation', attributeName: 'Transient Isolation Voltage', unit: 'Vpk', sortOrder: 95 },
    '最大浪涌隔离电压 (kvpk)': { attributeId: '_surge_isolation', attributeName: 'Surge Isolation Voltage', unit: 'kVpk', sortOrder: 96 },
    'esd 性能 hbm/cdm(kv)': { attributeId: '_esd', attributeName: 'ESD Rating', unit: 'kV', sortOrder: 97 },
    '输入电压(max)': { attributeId: '_vin_max', attributeName: 'Input Voltage Max', unit: 'V', sortOrder: 98 },
    '输出驱动电压(min)': { attributeId: '_vout_min', attributeName: 'Output Drive Min', unit: 'V', sortOrder: 99 },
    '输出驱动电压(max)': { attributeId: '_vout_max', attributeName: 'Output Drive Max', unit: 'V', sortOrder: 100 },
    '封装形式': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 3 },
    'package': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 3 },
    '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 3 },
    '温度范围 (℃)': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 16 },
    'junction temperature range(℃)': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 16 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 16 },
    // 3PEAK English MFR-specific formats
    'isolation rating(vrms)': { attributeId: '_isolation_rating', attributeName: 'Isolation Rating', unit: 'Vrms', sortOrder: 101 },
    'output voltage max(v)': { attributeId: '_vout_max', attributeName: 'Max Output Voltage', unit: 'V', sortOrder: 100 },
    'output voltage min(v)': { attributeId: '_vout_min', attributeName: 'Min Output Voltage', unit: 'V', sortOrder: 102 },
  },

  // ─── C4 Op-Amps / Comparators ──────────────────────────
  C4: {
    // Channels
    'ch': { attributeId: 'channels', attributeName: 'Channels', sortOrder: 2 },
    '通道数': { attributeId: 'channels', attributeName: 'Channels', sortOrder: 2 },
    '通道': { attributeId: 'channels', attributeName: 'Channels', sortOrder: 2 },
    // Bandwidth
    'gbwp(mhz)': { attributeId: 'gain_bandwidth', attributeName: 'Gain Bandwidth', unit: 'MHz', sortOrder: 5 },
    'gbwp(mhz)(typ.)': { attributeId: 'gain_bandwidth', attributeName: 'Gain Bandwidth', unit: 'MHz', sortOrder: 5 },
    'bw (mhz)': { attributeId: 'gain_bandwidth', attributeName: 'Gain Bandwidth', unit: 'MHz', sortOrder: 5 },
    'bw(mhz)': { attributeId: 'gain_bandwidth', attributeName: 'Gain Bandwidth', unit: 'MHz', sortOrder: 5 },
    '增益带宽积 (典型值)(mhz)': { attributeId: 'gain_bandwidth', attributeName: 'Gain Bandwidth', unit: 'MHz', sortOrder: 5 },
    // Slew rate
    'slew rate(v/μs)': { attributeId: 'slew_rate', attributeName: 'Slew Rate', unit: 'V/us', sortOrder: 6 },
    'slew rate(v/μs)(typ.)': { attributeId: 'slew_rate', attributeName: 'Slew Rate', unit: 'V/us', sortOrder: 6 },
    '压摆率 (典型值)(v/us)': { attributeId: 'slew_rate', attributeName: 'Slew Rate', unit: 'V/us', sortOrder: 6 },
    // Vos
    'vos(max)(mv)': { attributeId: 'input_offset_voltage', attributeName: 'Input Offset Voltage', unit: 'mV', sortOrder: 7 },
    'vos(max)(μv)': { attributeId: 'input_offset_voltage', attributeName: 'Input Offset Voltage', unit: 'uV', sortOrder: 7 },
    'vos(mv,max)': { attributeId: 'input_offset_voltage', attributeName: 'Input Offset Voltage', unit: 'mV', sortOrder: 7 },
    '输入失调电压@25℃ (max)(mv)': { attributeId: 'input_offset_voltage', attributeName: 'Input Offset Voltage', unit: 'mV', sortOrder: 7 },
    '失调电压(mv)': { attributeId: 'input_offset_voltage', attributeName: 'Input Offset Voltage', unit: 'mV', sortOrder: 7 },
    // Vos drift
    'vos tc(µv/°c)': { attributeId: 'vos_drift', attributeName: 'Vos Drift', unit: 'uV/°C', sortOrder: 8 },
    'vos tc(μv/℃)(typ.)': { attributeId: 'vos_drift', attributeName: 'Vos Drift', unit: 'uV/°C', sortOrder: 8 },
    'vos tc(μv/℃,typ.)': { attributeId: 'vos_drift', attributeName: 'Vos Drift', unit: 'uV/°C', sortOrder: 8 },
    // Supply current
    'iq(typ.)(per ch)': { attributeId: 'iq', attributeName: 'Supply Current', sortOrder: 15 },
    'iq(typ.)(per ch)(μa)': { attributeId: 'iq', attributeName: 'Supply Current', unit: 'uA', sortOrder: 15 },
    'iq(max.)(per ch)': { attributeId: 'iq', attributeName: 'Supply Current', sortOrder: 15 },
    '每通道静态电流(典型值)(μa)': { attributeId: 'iq', attributeName: 'Supply Current', unit: 'uA', sortOrder: 15 },
    // Bias current
    'ibias(pa)': { attributeId: 'input_bias_current', attributeName: 'Input Bias Current', unit: 'pA', sortOrder: 9 },
    'ib(pa,typ.)': { attributeId: 'input_bias_current', attributeName: 'Input Bias Current', unit: 'pA', sortOrder: 9 },
    '偏置电流 (±)(典型值)(pa)': { attributeId: 'input_bias_current', attributeName: 'Input Bias Current', unit: 'pA', sortOrder: 9 },
    // Rail-to-rail
    'rail-rail': { attributeId: 'rail_to_rail', attributeName: 'Rail-to-Rail', sortOrder: 17 },
    '轨到轨': { attributeId: 'rail_to_rail', attributeName: 'Rail-to-Rail', sortOrder: 17 },
    '轨对轨': { attributeId: 'rail_to_rail', attributeName: 'Rail-to-Rail', sortOrder: 17 },
    // CMRR
    'cmrr(db)': { attributeId: 'cmrr', attributeName: 'CMRR', unit: 'dB', sortOrder: 10 },
    // Output type (comparator)
    'output type': { attributeId: 'output_type', attributeName: 'Output Type', sortOrder: 12 },
    '输出类型': { attributeId: 'output_type', attributeName: 'Output Type', sortOrder: 12 },
    // Response time (comparator)
    'tpd+': { attributeId: 'response_time', attributeName: 'Response Time', sortOrder: 13 },
    '传播延迟时间(μs)': { attributeId: 'response_time', attributeName: 'Response Time', sortOrder: 13 },
    // Hysteresis
    'hyst.(mv)': { attributeId: '_hysteresis', attributeName: 'Hysteresis', unit: 'mV', sortOrder: 90 },
    // Supply voltage (stored for reference)
    'vdd(v)': { attributeId: '_supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 14 },
    '工作电压(min)(v)': { attributeId: '_supply_voltage_min', attributeName: 'Supply Voltage Min', unit: 'V', sortOrder: 91 },
    '工作电压 (min)(v)': { attributeId: '_supply_voltage_min', attributeName: 'Supply Voltage Min', unit: 'V', sortOrder: 91 },
    '工作电压(max)(v)': { attributeId: '_supply_voltage_max', attributeName: 'Supply Voltage Max', unit: 'V', sortOrder: 92 },
    '工作电压 (max)(v)': { attributeId: '_supply_voltage_max', attributeName: 'Supply Voltage Max', unit: 'V', sortOrder: 92 },
    // 3PEAK additional English MFR-specific formats
    'en@1khz ( nv/√hz )': { attributeId: '_en', attributeName: 'Voltage Noise Density @1kHz', unit: 'nV/√Hz', sortOrder: 93 },
    'en@1khz( nv/√hz )': { attributeId: '_en', attributeName: 'Voltage Noise Density @1kHz', unit: 'nV/√Hz', sortOrder: 93 },
    'en@1khz(nv/√hz)': { attributeId: '_en', attributeName: 'Voltage Noise Density @1kHz', unit: 'nV/√Hz', sortOrder: 93 },
    'en@1khz(nv/√hz)(typ.)': { attributeId: '_en', attributeName: 'Voltage Noise Density @1kHz', unit: 'nV/√Hz', sortOrder: 93 },
    'en@1mhz ( nv/√hz )': { attributeId: '_en_1mhz', attributeName: 'Voltage Noise @1MHz', unit: 'nV/√Hz', sortOrder: 94 },
    'vn@0.1hz to 10hz(μvpp)': { attributeId: '_vn_pp', attributeName: '0.1-10Hz Voltage Noise', unit: 'µVpp', sortOrder: 95 },
    'vos(max)': { attributeId: 'input_offset_voltage', attributeName: 'Input Offset Voltage', unit: 'mV', sortOrder: 7 },
    'vos(mv)(max)': { attributeId: 'input_offset_voltage', attributeName: 'Input Offset Voltage', unit: 'mV', sortOrder: 7 },
    'vos  (µv, max)': { attributeId: 'input_offset_voltage', attributeName: 'Input Offset Voltage', unit: 'µV', sortOrder: 7 },
    'vos  (mv, max)': { attributeId: 'input_offset_voltage', attributeName: 'Input Offset Voltage', unit: 'mV', sortOrder: 7 },
    'vos tc  (µv/°c, max)': { attributeId: 'vos_drift', attributeName: 'Vos Drift', unit: 'µV/°C', sortOrder: 8 },
    'vos tc  (µv/°c, typ.)': { attributeId: 'vos_drift', attributeName: 'Vos Drift', unit: 'µV/°C', sortOrder: 8 },
    'vos tc (µv/°c)': { attributeId: 'vos_drift', attributeName: 'Vos Drift', unit: 'µV/°C', sortOrder: 8 },
    'gbwp': { attributeId: 'gain_bandwidth', attributeName: 'Gain Bandwidth', unit: 'MHz', sortOrder: 5 },
    'iq(max.)(per ch)(μa)': { attributeId: 'iq', attributeName: 'Supply Current', unit: 'µA', sortOrder: 15 },
    'iq(typ.)(per ch)(ma)': { attributeId: 'iq', attributeName: 'Supply Current', unit: 'mA', sortOrder: 15 },
    'iq per channel(μa)(max)': { attributeId: 'iq', attributeName: 'Supply Current', unit: 'µA', sortOrder: 15 },
    'iq(typ.)(1 channel)(ma)': { attributeId: 'iq', attributeName: 'Supply Current', unit: 'mA', sortOrder: 15 },
    'iq (µa, typ.)': { attributeId: 'iq', attributeName: 'Supply Current', unit: 'µA', sortOrder: 15 },
    'iq (ma, max)': { attributeId: 'iq', attributeName: 'Supply Current', unit: 'mA', sortOrder: 15 },
    'iq(μa,typ.)': { attributeId: 'iq', attributeName: 'Supply Current', unit: 'µA', sortOrder: 15 },
    // ICC / total package supply current → display-only satellite (sortOrder 99).
    // NOT mapped to 'iq' (which is per-channel µA in the C4 logic table) and
    // NOT mapped to the existing 'supply_current' canonical (de-facto used for
    // per-channel µA mappings, despite its name — a separate cleanup tracked
    // in BACKLOG). ICC is the total device supply current in mA, a distinct
    // datasheet spec. Same satellite pattern as B4 _vbr_max and C2 _isw_peak_a.
    'icc(ma)': { attributeId: '_icc_ma', attributeName: 'Total Supply Current (ICC)', unit: 'mA', sortOrder: 99 },
    'icc (ma)': { attributeId: '_icc_ma', attributeName: 'Total Supply Current (ICC)', unit: 'mA', sortOrder: 99 },
    'icc': { attributeId: '_icc_ma', attributeName: 'Total Supply Current (ICC)', unit: 'mA', sortOrder: 99 },
    'icc(typ.)': { attributeId: '_icc_ma', attributeName: 'Total Supply Current (ICC)', unit: 'mA', sortOrder: 99 },
    'icc(typ.)(ma)': { attributeId: '_icc_ma', attributeName: 'Total Supply Current (ICC)', unit: 'mA', sortOrder: 99 },
    'icc(max.)(ma)': { attributeId: '_icc_ma', attributeName: 'Total Supply Current (ICC)', unit: 'mA', sortOrder: 99 },
    'icc(max)': { attributeId: '_icc_ma', attributeName: 'Total Supply Current (ICC)', unit: 'mA', sortOrder: 99 },
    'icc max': { attributeId: '_icc_ma', attributeName: 'Total Supply Current (ICC)', unit: 'mA', sortOrder: 99 },
    'icc typ': { attributeId: '_icc_ma', attributeName: 'Total Supply Current (ICC)', unit: 'mA', sortOrder: 99 },
    'total supply current': { attributeId: '_icc_ma', attributeName: 'Total Supply Current (ICC)', unit: 'mA', sortOrder: 99 },
    'supply current': { attributeId: '_icc_ma', attributeName: 'Total Supply Current (ICC)', unit: 'mA', sortOrder: 99 },
    '总电源电流': { attributeId: '_icc_ma', attributeName: 'Total Supply Current (ICC)', unit: 'mA', sortOrder: 99 },
    '总电流': { attributeId: '_icc_ma', attributeName: 'Total Supply Current (ICC)', unit: 'mA', sortOrder: 99 },
    '电源电流': { attributeId: '_icc_ma', attributeName: 'Total Supply Current (ICC)', unit: 'mA', sortOrder: 99 },
    'iout(ma)': { attributeId: '_iout', attributeName: 'Output Current', unit: 'mA', sortOrder: 96 },
    'sink/source current(ma)(typ.)': { attributeId: '_iout', attributeName: 'Output Current', unit: 'mA', sortOrder: 96 },
    'ib(pa)(typ.)': { attributeId: 'input_bias_current', attributeName: 'Input Bias Current', unit: 'pA', sortOrder: 9 },
    'ib (µa, typ.)': { attributeId: 'input_bias_current', attributeName: 'Input Bias Current', unit: 'µA', sortOrder: 9 },
    'ib (na, typ.)': { attributeId: 'input_bias_current', attributeName: 'Input Bias Current', unit: 'nA', sortOrder: 9 },
    'open loop gain(db)(typ.)': { attributeId: '_avol', attributeName: 'Open Loop Gain', unit: 'dB', sortOrder: 97 },
    'cmrr (db, min)': { attributeId: 'cmrr', attributeName: 'CMRR', unit: 'dB', sortOrder: 10 },
    'common mode voltage  (v)': { attributeId: '_vicm', attributeName: 'Common Mode Voltage Range', unit: 'V', sortOrder: 98 },
    'common mode voltage at vdd=30v (v)': { attributeId: '_vicm', attributeName: 'Common Mode Voltage Range', unit: 'V', sortOrder: 98 },
    'supply voltage(v)(min)': { attributeId: '_supply_voltage_min', attributeName: 'Supply Voltage Min', unit: 'V', sortOrder: 91 },
    'supply voltage(v)(max)': { attributeId: '_supply_voltage_max', attributeName: 'Supply Voltage Max', unit: 'V', sortOrder: 92 },
    'vdd (v)': { attributeId: '_supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 14 },
    'vdd  (v)': { attributeId: '_supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 14 },
    'slew rate': { attributeId: 'slew_rate', attributeName: 'Slew Rate', unit: 'V/us', sortOrder: 6 },
    'slew rate  (v/µs)': { attributeId: 'slew_rate', attributeName: 'Slew Rate', unit: 'V/us', sortOrder: 6 },
    'gain (v/v)': { attributeId: '_gain', attributeName: 'Gain', unit: 'V/V', sortOrder: 99 },
    'gain error (%, max)': { attributeId: '_gain_error', attributeName: 'Gain Error', unit: '%', sortOrder: 100 },
    'gain drift (ppm/℃, max)': { attributeId: '_gain_drift', attributeName: 'Gain Drift', unit: 'ppm/°C', sortOrder: 101 },
    'gmin(v/v)': { attributeId: '_gmin', attributeName: 'Min Stable Gain', unit: 'V/V', sortOrder: 102 },
    'tpd-': { attributeId: 'response_time', attributeName: 'Propagation Delay', sortOrder: 13 },
    'rail-rail in': { attributeId: 'rail_to_rail', attributeName: 'Rail-to-Rail Input', sortOrder: 17 },
    'rail-rail out': { attributeId: 'rail_to_rail', attributeName: 'Rail-to-Rail Output', sortOrder: 17 },
    'temp range (°c)': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 16 },
    'insulation rating(vrms)': { attributeId: '_isolation', attributeName: 'Isolation Rating', unit: 'Vrms', sortOrder: 103 },
    // Package
    'package': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 3 },
    '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 3 },
    '封装形式': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 3 },
    '温度范围 (℃)': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 16 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 16 },
  },

  // ─── C7 Interface ICs ──────────────────────────────────
  C7: {
    // Transceivers (Chinese)
    '总线故障保护(v)': { attributeId: 'bus_fault_protection', attributeName: 'Bus Fault Protection', unit: 'V', sortOrder: 8 },
    'hbm esd总线引脚(±kv)': { attributeId: 'esd_bus_pins', attributeName: 'ESD Rating — Bus Pins', unit: 'kV', sortOrder: 11 },
    '共模输入电压(v)': { attributeId: '_common_mode_range', attributeName: 'Common Mode Range', unit: 'V', sortOrder: 90 },
    '速率(mbps)': { attributeId: 'data_rate', attributeName: 'Data Rate', unit: 'Mbps', sortOrder: 5 },
    'signaling rate (mbps)  速率': { attributeId: 'data_rate', attributeName: 'Data Rate', unit: 'Mbps', sortOrder: 5 },
    '总线可挂节点': { attributeId: '_num_nodes', attributeName: 'Bus Nodes', sortOrder: 91 },
    '通讯模式': { attributeId: 'operating_mode', attributeName: 'Operating Mode', sortOrder: 3 },
    '远程唤醒': { attributeId: '_remote_wakeup', attributeName: 'Remote Wakeup', sortOrder: 93 },
    'supply voltage(s) (v)  供电电压': { attributeId: '_supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 94 },
    'low power current (ua)  低功耗电流': { attributeId: '_low_power_current', attributeName: 'Low Power Current', unit: 'uA', sortOrder: 95 },
    'dominant time-out  显性超时': { attributeId: 'txd_dominant_timeout', attributeName: 'TXD Dominant Timeout', sortOrder: 9 },
    // Digital Isolators (Chinese)
    '隔离等级(vrms)': { attributeId: '_isolation_rating', attributeName: 'Isolation Rating', unit: 'Vrms', sortOrder: 97 },
    '是否集成隔离电源': { attributeId: '_integrated_power', attributeName: 'Integrated Isolated Power', sortOrder: 98 },
    '工作电压范围 (v)': { attributeId: '_supply_voltage_range', attributeName: 'Supply Voltage Range', unit: 'V', sortOrder: 99 },
    '输出模式': { attributeId: '_output_mode', attributeName: 'Output Mode', sortOrder: 100 },
    '通道数': { attributeId: '_channels', attributeName: 'Channels', sortOrder: 101 },
    '反向通道数': { attributeId: '_reverse_channels', attributeName: 'Reverse Channels', sortOrder: 102 },
    '速率 (bps)': { attributeId: 'data_rate', attributeName: 'Data Rate', sortOrder: 5 },
    '默认输出': { attributeId: '_default_output', attributeName: 'Default Output', sortOrder: 103 },
    'cmti(kv/μs)': { attributeId: '_cmti', attributeName: 'CMTI', unit: 'kV/us', sortOrder: 104 },
    '浪涌等级 (kvpk)': { attributeId: '_surge_rating', attributeName: 'Surge Rating', unit: 'kVpk', sortOrder: 105 },
    'esd等级 (单双边,v)': { attributeId: 'esd_bus_pins', attributeName: 'ESD Rating — Bus Pins', sortOrder: 11 },
    'package  封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 3 },
    '封装形式': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 3 },
    '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 3 },
    'package': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 3 },
    // 3PEAK English MFR-specific formats
    'max data rate(mbps)': { attributeId: 'data_rate', attributeName: 'Max Data Rate', unit: 'Mbps', sortOrder: 5 },
    'max data rate(kbps)': { attributeId: 'data_rate', attributeName: 'Max Data Rate', unit: 'kbps', sortOrder: 5 },
    'data rate (max)(kbps)': { attributeId: 'data_rate', attributeName: 'Max Data Rate', unit: 'kbps', sortOrder: 5 },
    'iec-61000-4-2 contact(kv)': { attributeId: 'esd_bus_pins', attributeName: 'ESD Rating — Bus Pins (IEC 61000-4-2)', unit: 'kV', sortOrder: 11 },
    'esd hbm(kv)': { attributeId: 'esd_bus_pins', attributeName: 'ESD Rating — Bus Pins (HBM)', unit: 'kV', sortOrder: 11 },
    'surge voltage capability(vpk)': { attributeId: '_surge_rating', attributeName: 'Surge Voltage', unit: 'Vpk', sortOrder: 105 },
    'cmti(kv/μs)(static)': { attributeId: '_cmti', attributeName: 'CMTI (Static)', unit: 'kV/µs', sortOrder: 104 },
    'cmti(kv/μs)(dynamic)': { attributeId: '_cmti_dynamic', attributeName: 'CMTI (Dynamic)', unit: 'kV/µs', sortOrder: 106 },
    'isolation rating(vrms)': { attributeId: '_isolation_rating', attributeName: 'Isolation Rating', unit: 'Vrms', sortOrder: 97 },
    'isolation rating(v rms)': { attributeId: '_isolation_rating', attributeName: 'Isolation Rating', unit: 'Vrms', sortOrder: 97 },
    'nubmer of channel': { attributeId: '_channels', attributeName: 'Channels', sortOrder: 101 },
    'forward/reverse channels': { attributeId: '_reverse_channels', attributeName: 'Forward/Reverse Channels', sortOrder: 102 },
    'default output': { attributeId: '_default_output', attributeName: 'Default Output', sortOrder: 103 },
    'drivers per package': { attributeId: '_drivers', attributeName: 'Drivers per Package', sortOrder: 107 },
    'receivers per package': { attributeId: '_receivers', attributeName: 'Receivers per Package', sortOrder: 108 },
    'vcc (min)(v)': { attributeId: '_supply_voltage', attributeName: 'Supply Voltage Min', unit: 'V', sortOrder: 94 },
    'vcc(max)(v)': { attributeId: '_supply_voltage', attributeName: 'Supply Voltage Max', unit: 'V', sortOrder: 94 },
    'vcc(v)': { attributeId: '_supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 94 },
    'icc(max)(ma)': { attributeId: '_icc', attributeName: 'Supply Current', unit: 'mA', sortOrder: 109 },
    'protocol': { attributeId: 'protocol', attributeName: 'Protocol', sortOrder: 1 },
    'bus fault protection voltage': { attributeId: 'bus_fault_protection', attributeName: 'Bus Fault Protection', unit: 'V', sortOrder: 8 },
    'bus fault protection voltage(v)': { attributeId: 'bus_fault_protection', attributeName: 'Bus Fault Protection', unit: 'V', sortOrder: 8 },
    'mode': { attributeId: '_operating_mode', attributeName: 'Operating Mode', sortOrder: 92 },
    'vbat(v)': { attributeId: '_vbat', attributeName: 'Battery Voltage', unit: 'V', sortOrder: 110 },
    'operating temperature range(℃)': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 16 },
    '温度范围 (℃)': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 16 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 16 },
  },

  // ─── C5 Logic ICs ──────────────────────────────────────
  C5: {
    '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 3 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 16 },
    // 3PEAK/Convert English MFR-specific formats
    'technology family': { attributeId: 'logic_family', attributeName: 'Logic Family', sortOrder: 1 },
    'function': { attributeId: 'logic_function', attributeName: 'Logic Function', sortOrder: 2 },
    'number of channels': { attributeId: 'gate_count', attributeName: 'Number of Gates', sortOrder: 4 },
    'inputs per channel': { attributeId: '_inputs_per_gate', attributeName: 'Inputs per Gate', sortOrder: 90 },
    'input type': { attributeId: '_input_type', attributeName: 'Input Type', sortOrder: 91 },
    'output type': { attributeId: 'output_type', attributeName: 'Output Type', sortOrder: 5 },
    'supply voltage (min)(v)': { attributeId: 'supply_voltage', attributeName: 'Supply Voltage Min', unit: 'V', sortOrder: 6 },
    'supply voltage (max)(v)': { attributeId: 'supply_voltage', attributeName: 'Supply Voltage Max', unit: 'V', sortOrder: 6 },
    'iol (ma)': { attributeId: 'drive_current', attributeName: 'Output Drive (IOL)', unit: 'mA', sortOrder: 7 },
    'ioh (ma)': { attributeId: 'drive_current', attributeName: 'Output Drive (IOH)', unit: 'mA', sortOrder: 7 },
    'ch': { attributeId: 'gate_count', attributeName: 'Channels', sortOrder: 4 },
    'switch config': { attributeId: '_switch_config', attributeName: 'Switch Configuration', sortOrder: 92 },
    'vdd(v)': { attributeId: 'supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 6 },
    'vih(min)(v)': { attributeId: 'vih', attributeName: 'Input High Voltage', unit: 'V', sortOrder: 8 },
    'vil(max)(v)': { attributeId: 'vil', attributeName: 'Input Low Voltage', unit: 'V', sortOrder: 9 },
    'bw(mhz)': { attributeId: '_bandwidth', attributeName: 'Bandwidth', unit: 'MHz', sortOrder: 93 },
    'ron(Ω)': { attributeId: '_ron', attributeName: 'On-Resistance', unit: 'Ω', sortOrder: 94 },
    'ron(ω)': { attributeId: '_ron', attributeName: 'On-Resistance', unit: 'Ω', sortOrder: 94 },
    'ton(ns)': { attributeId: 'tpd', attributeName: 'Propagation Delay', unit: 'ns', sortOrder: 10 },
    'toff(ns)': { attributeId: '_toff', attributeName: 'Turn-Off Time', unit: 'ns', sortOrder: 95 },
    'leakage current(na)': { attributeId: 'input_leakage', attributeName: 'Leakage Current', unit: 'nA', sortOrder: 96 },
    // I2C-bus interface parts (level shifters, buffers, switches, I/O expanders, repeaters).
    // Distinct from generic fmax (clocked-logic toggle rate) — see c5LogicICs.ts rule.
    // Only the kHz-suffixed variant: the bare '频率(最大)' could be MHz on a non-I2C C5 part,
    // so Triage handles that case if it ever surfaces.
    '频率(最大)(khz)': { attributeId: 'i2c_bus_speed_max_khz', attributeName: 'Max I2C Bus Clock Speed', unit: 'kHz', sortOrder: 24 },
  },

  // ─── C8 Timers / Oscillators ───────────────────────────
  C8: {
    '主频频率': { attributeId: 'output_frequency_hz', attributeName: 'Output Frequency', sortOrder: 2 },
    '输出波形': { attributeId: 'output_signal_type', attributeName: 'Output Signal Type', sortOrder: 5 },
    '供电电压': { attributeId: '_supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 8 },
    '频率稳定性': { attributeId: 'frequency_stability', attributeName: 'Frequency Stability', sortOrder: 6 },
    '频率误差': { attributeId: '_frequency_tolerance', attributeName: 'Frequency Tolerance', sortOrder: 7 },
    '年老化率': { attributeId: '_aging_rate', attributeName: 'Aging Rate', sortOrder: 90 },
    '材质': { attributeId: '_base_resonator', attributeName: 'Base Resonator', sortOrder: 91 },
    '类型': { attributeId: '_osc_type', attributeName: 'Oscillator Type', sortOrder: 92 },
    '控脚功能': { attributeId: '_enable_function', attributeName: 'Enable Function', sortOrder: 93 },
    '封装/外壳': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 3 },
    '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 3 },
    // Bare-form synonym — same pattern as F69 (Decision #205-style):
    // defensive coverage for vendors that ship the term as a single Han
    // run without the slash separator. Maps to the same canonical as
    // '封装/外壳' so card-audit and ingest agree.
    '封装外壳': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 3 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 16 },
  },

  // ─── C10 DACs ──────────────────────────────────────────
  C10: {
    '分辨率': { attributeId: 'resolution_bits', attributeName: 'Resolution', unit: 'bits', sortOrder: 2 },
    'resolution': { attributeId: 'resolution_bits', attributeName: 'Resolution', unit: 'bits', sortOrder: 2 },
    '结构': { attributeId: '_architecture', attributeName: 'Architecture', sortOrder: 90 },
    '输出结构': { attributeId: 'output_type', attributeName: 'Output Type', sortOrder: 1 },
    '接口': { attributeId: 'interface_type', attributeName: 'Interface', sortOrder: 6 },
    '工作电压范围': { attributeId: '_supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 8 },
    '工作电流': { attributeId: '_supply_current', attributeName: 'Supply Current', sortOrder: 91 },
    'dnl(lsb)': { attributeId: 'dnl_lsb', attributeName: 'DNL', unit: 'LSB', sortOrder: 11 },
    'dnl(lsb, max)': { attributeId: 'dnl_lsb', attributeName: 'DNL', unit: 'LSB', sortOrder: 11 },
    'inl': { attributeId: 'inl_lsb', attributeName: 'INL', unit: 'LSB', sortOrder: 10 },
    'ch': { attributeId: 'channel_count', attributeName: 'Channels', sortOrder: 4 },
    'voltage output range(v)': { attributeId: '_output_range', attributeName: 'Output Range', unit: 'V', sortOrder: 92 },
    'offset error(mv, max)': { attributeId: '_offset_error', attributeName: 'Offset Error', unit: 'mV', sortOrder: 93 },
    'gain error (% of fsr, max)': { attributeId: '_gain_error', attributeName: 'Gain Error', sortOrder: 94 },
    'd to a glitch impulse(nv-sec)': { attributeId: '_glitch_impulse', attributeName: 'Glitch Impulse', unit: 'nV-s', sortOrder: 95 },
    'idd(μa/ch, max)(μa)': { attributeId: '_supply_current', attributeName: 'Supply Current', unit: 'uA', sortOrder: 91 },
    'vdd(v)': { attributeId: '_supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 8 },
    'package': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 3 },
    '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 3 },
    // 3PEAK English MFR-specific formats
    "resolution'": { attributeId: 'resolution_bits', attributeName: 'Resolution', unit: 'bits', sortOrder: 2 },
    'update rate(msps)': { attributeId: '_update_rate', attributeName: 'Update Rate', unit: 'MSPS', sortOrder: 96 },
    "ch'": { attributeId: 'channel_count', attributeName: 'Channels', sortOrder: 4 },
    'datum': { attributeId: '_reference', attributeName: 'Reference', sortOrder: 97 },
    'sfdr(db)': { attributeId: '_sfdr', attributeName: 'SFDR', unit: 'dB', sortOrder: 98 },
    "vdd(v)'": { attributeId: '_supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 8 },
    'power(mw)': { attributeId: '_power', attributeName: 'Power Consumption', unit: 'mW', sortOrder: 99 },
    'inl(lsb)': { attributeId: 'inl_lsb', attributeName: 'INL', unit: 'LSB', sortOrder: 10 },
    'temp range(℃)': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 16 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 16 },
  },

  // ─── D1 Crystals — Quartz Resonators ─────────────────────
  D1: {
    '频率': { attributeId: 'nominal_frequency_hz', attributeName: 'Nominal Frequency', sortOrder: 1 },
    '标称频率': { attributeId: 'nominal_frequency_hz', attributeName: 'Nominal Frequency', sortOrder: 1 },
    'frequency': { attributeId: 'nominal_frequency_hz', attributeName: 'Nominal Frequency', sortOrder: 1 },
    'frequency (mhz)': { attributeId: 'nominal_frequency_hz', attributeName: 'Nominal Frequency', unit: 'MHz', sortOrder: 1 },
    'frequency (khz)': { attributeId: 'nominal_frequency_hz', attributeName: 'Nominal Frequency', unit: 'kHz', sortOrder: 1 },
    '负载电容': { attributeId: 'load_capacitance_pf', attributeName: 'Load Capacitance', unit: 'pF', sortOrder: 5 },
    'load capacitance': { attributeId: 'load_capacitance_pf', attributeName: 'Load Capacitance', unit: 'pF', sortOrder: 5 },
    'load capacitance (pf)': { attributeId: 'load_capacitance_pf', attributeName: 'Load Capacitance', unit: 'pF', sortOrder: 5 },
    '频率公差': { attributeId: 'frequency_tolerance_ppm', attributeName: 'Frequency Tolerance', unit: 'ppm', sortOrder: 3 },
    'frequency tolerance': { attributeId: 'frequency_tolerance_ppm', attributeName: 'Frequency Tolerance', unit: 'ppm', sortOrder: 3 },
    'frequency tolerance (ppm)': { attributeId: 'frequency_tolerance_ppm', attributeName: 'Frequency Tolerance', unit: 'ppm', sortOrder: 3 },
    '频率稳定度': { attributeId: 'frequency_stability_ppm', attributeName: 'Frequency Stability', unit: 'ppm', sortOrder: 4 },
    'frequency stability': { attributeId: 'frequency_stability_ppm', attributeName: 'Frequency Stability', unit: 'ppm', sortOrder: 4 },
    'frequency stability (ppm)': { attributeId: 'frequency_stability_ppm', attributeName: 'Frequency Stability', unit: 'ppm', sortOrder: 4 },
    '等效串联电阻': { attributeId: 'equivalent_series_resistance_ohm', attributeName: 'ESR', unit: 'Ω', sortOrder: 6 },
    'esr': { attributeId: 'equivalent_series_resistance_ohm', attributeName: 'ESR', unit: 'Ω', sortOrder: 6 },
    'esr (ohm)': { attributeId: 'equivalent_series_resistance_ohm', attributeName: 'ESR', unit: 'Ω', sortOrder: 6 },
    // Ω→ω gotcha: JS toLowerCase() converts Ω to ω
    'esr (ω)': { attributeId: 'equivalent_series_resistance_ohm', attributeName: 'ESR', unit: 'Ω', sortOrder: 6 },
    '工作温度': { attributeId: 'operating_temp_range', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 13 },
    'operating temperature': { attributeId: 'operating_temp_range', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 13 },
    '封装': { attributeId: 'package_type', attributeName: 'Package / Case', sortOrder: 10 },
    'package': { attributeId: 'package_type', attributeName: 'Package / Case', sortOrder: 10 },
    '安装类型': { attributeId: 'mounting_type', attributeName: 'Mounting Type', sortOrder: 12 },
    'mounting type': { attributeId: 'mounting_type', attributeName: 'Mounting Type', sortOrder: 12 },
    '老化率': { attributeId: 'aging_ppm_per_year', attributeName: 'Aging Rate', unit: 'ppm/year', sortOrder: 9 },
    'aging': { attributeId: 'aging_ppm_per_year', attributeName: 'Aging Rate', unit: 'ppm/year', sortOrder: 9 },
    '驱动电平': { attributeId: 'drive_level_uw', attributeName: 'Drive Level', unit: 'µW', sortOrder: 7 },
    'drive level': { attributeId: 'drive_level_uw', attributeName: 'Drive Level', unit: 'µW', sortOrder: 7 },
    '并联电容': { attributeId: 'shunt_capacitance_pf', attributeName: 'Shunt Capacitance', unit: 'pF', sortOrder: 8 },
    'shunt capacitance': { attributeId: 'shunt_capacitance_pf', attributeName: 'Shunt Capacitance', unit: 'pF', sortOrder: 8 },
  },

  // ─── E1 Optocouplers / Optoisolators ──────────────────────
  // Maps Chinese opto-coupler param vocabulary (Everlight 亿光, Lite-On,
  // Vishay, Toshiba, Sharp variants) to the canonical attributeIds defined
  // in [lib/logicTables/e1Optocouplers.ts](lib/logicTables/e1Optocouplers.ts).
  // Most entries reuse existing E1 logic-table canonicals; a handful of new
  // canonicals are minted for SSR/triac-output optocoupler concepts that the
  // logic table doesn't currently model (zero_cross_circuit, vdrm_v, etc.).
  E1: {
    // Isolation voltage (RMS) — primary safety spec, E1 logic table canonical.
    '隔离电压(rms)': { attributeId: 'isolation_voltage_vrms', attributeName: 'Isolation Voltage', unit: 'Vrms', sortOrder: 1 },
    '隔离电压': { attributeId: 'isolation_voltage_vrms', attributeName: 'Isolation Voltage', unit: 'Vrms', sortOrder: 1 },
    'isolation voltage': { attributeId: 'isolation_voltage_vrms', attributeName: 'Isolation Voltage', unit: 'Vrms', sortOrder: 1 },
    // Channel count.
    '输出通道数': { attributeId: 'channel_count', attributeName: 'Channel Count', sortOrder: 2 },
    '通道数': { attributeId: 'channel_count', attributeName: 'Channel Count', sortOrder: 2 },
    'channel count': { attributeId: 'channel_count', attributeName: 'Channel Count', sortOrder: 2 },
    // Output type (transistor / triac / scr / logic / photovoltaic).
    '输出类型': { attributeId: 'output_transistor_type', attributeName: 'Output Type', sortOrder: 3 },
    'output type': { attributeId: 'output_transistor_type', attributeName: 'Output Type', sortOrder: 3 },
    // LED-side forward voltage (input).
    '正向电压': { attributeId: 'input_forward_voltage_vf', attributeName: 'Forward Voltage (Vf)', unit: 'V', sortOrder: 4 },
    'forward voltage': { attributeId: 'input_forward_voltage_vf', attributeName: 'Forward Voltage (Vf)', unit: 'V', sortOrder: 4 },
    // LED-side forward current (input).
    '正向电流': { attributeId: 'if_rated_ma', attributeName: 'Forward Current (If)', unit: 'mA', sortOrder: 5 },
    'forward current': { attributeId: 'if_rated_ma', attributeName: 'Forward Current (If)', unit: 'mA', sortOrder: 5 },
    // LED-side reverse voltage. NEW canonical — the E1 logic table doesn't
    // model input reverse voltage, but it's a real spec on every optocoupler
    // datasheet. Useful for diagnostics / display.
    '反向电压': { attributeId: 'input_reverse_voltage_v', attributeName: 'Reverse Voltage', unit: 'V', sortOrder: 6 },
    'reverse voltage': { attributeId: 'input_reverse_voltage_v', attributeName: 'Reverse Voltage', unit: 'V', sortOrder: 6 },
    // Vce(sat) — output transistor saturation voltage. E1 canonical.
    // Sample raw form: '集射极饱和电压(Vce(sat)@Ic,IF)' (lowercased before lookup).
    '集射极饱和电压(vce(sat)@ic,if)': { attributeId: 'vce_sat_v', attributeName: 'Vce(sat)', unit: 'V', sortOrder: 7 },
    '集射极饱和电压': { attributeId: 'vce_sat_v', attributeName: 'Vce(sat)', unit: 'V', sortOrder: 7 },
    'vce(sat)': { attributeId: 'vce_sat_v', attributeName: 'Vce(sat)', unit: 'V', sortOrder: 7 },
    // Switching times. Existing E1 canonical 'propagation_delay_us' is the
    // composite tpLH/tpHL spec; rise/fall times are separate datasheet specs
    // worth surfacing distinctly. NEW canonicals.
    '上升时间': { attributeId: 'rise_time_us', attributeName: 'Rise Time', unit: 'µs', sortOrder: 8 },
    'rise time': { attributeId: 'rise_time_us', attributeName: 'Rise Time', unit: 'µs', sortOrder: 8 },
    '下降时间': { attributeId: 'fall_time_us', attributeName: 'Fall Time', unit: 'µs', sortOrder: 9 },
    'fall time': { attributeId: 'fall_time_us', attributeName: 'Fall Time', unit: 'µs', sortOrder: 9 },
    '传播延迟tplh/tphl': { attributeId: 'propagation_delay_us', attributeName: 'Propagation Delay', unit: 'µs', sortOrder: 10 },
    'propagation delay': { attributeId: 'propagation_delay_us', attributeName: 'Propagation Delay', unit: 'µs', sortOrder: 10 },
    // Output current (DC, for transistor-output optocouplers). NEW canonical
    // — distinct from if_rated_ma which is the input LED current.
    '输出电流': { attributeId: 'output_current_ma', attributeName: 'Output Current', unit: 'mA', sortOrder: 11 },
    'output current': { attributeId: 'output_current_ma', attributeName: 'Output Current', unit: 'mA', sortOrder: 11 },
    // Output current (RMS, for triac/SCR-output optocouplers). NEW canonical.
    '输出电流(it(rms))': { attributeId: 'output_current_rms_a', attributeName: 'Output Current (It RMS)', unit: 'A', sortOrder: 12 },
    // Receiver-side voltage (output common-emitter operating voltage).
    // NEW canonical — distinct from supply_voltage_vcc which is for logic-output.
    '接收端电压': { attributeId: 'receiver_voltage_v', attributeName: 'Receiver Voltage', unit: 'V', sortOrder: 13 },
    // Input voltage type (DC / AC). NEW canonical.
    '输入电压类型': { attributeId: 'input_voltage_type', attributeName: 'Input Voltage Type', sortOrder: 14 },
    '输入类型': { attributeId: 'input_voltage_type', attributeName: 'Input Voltage Type', sortOrder: 14 },
    'input type': { attributeId: 'input_voltage_type', attributeName: 'Input Voltage Type', sortOrder: 14 },
    // Triac/SCR output type. NEW canonical (sub-classification of output_transistor_type).
    '可控硅类型': { attributeId: 'triac_type', attributeName: 'Triac Type', sortOrder: 15 },
    // Zero-crossing circuit (yes/no) — for AC-load optocouplers. NEW canonical.
    '过零电路': { attributeId: 'zero_cross_circuit', attributeName: 'Zero-Cross Circuit', sortOrder: 16 },
    'zero crossing': { attributeId: 'zero_cross_circuit', attributeName: 'Zero-Cross Circuit', sortOrder: 16 },
    // Off-state peak voltage (Vdrm) — for triac/SCR-output. NEW canonical.
    '断态峰值电压(vdrm)': { attributeId: 'vdrm_v', attributeName: 'Vdrm', unit: 'V', sortOrder: 17 },
    'vdrm': { attributeId: 'vdrm_v', attributeName: 'Vdrm', unit: 'V', sortOrder: 17 },
    // Static dv/dt — for triac-output optocouplers (false-trigger immunity).
    // NEW canonical.
    '静态dv/dt': { attributeId: 'static_dv_dt_v_us', attributeName: 'Static dv/dt', unit: 'V/µs', sortOrder: 18 },
    'static dv/dt': { attributeId: 'static_dv_dt_v_us', attributeName: 'Static dv/dt', unit: 'V/µs', sortOrder: 18 },
    // Common-mode transient immunity (CMTI) — for digital isolators / logic-output.
    // NEW canonical.
    '共模瞬变抗扰度cmti': { attributeId: 'cmti_kv_us', attributeName: 'CMTI', unit: 'kV/µs', sortOrder: 19 },
    'cmti': { attributeId: 'cmti_kv_us', attributeName: 'CMTI', unit: 'kV/µs', sortOrder: 19 },
    // Data rate — for high-speed Logic-output Optoisolators / digital isolators.
    // Sample values: 10Mbit/s, 5Mbit/s, 1Mbit/s. NEW canonical.
    '数据速率': { attributeId: 'data_rate_mbps', attributeName: 'Data Rate', unit: 'Mbps', sortOrder: 19 },
    'data rate': { attributeId: 'data_rate_mbps', attributeName: 'Data Rate', unit: 'Mbps', sortOrder: 19 },
    // Supply voltage (Vcc) — for logic-output optocouplers. E1 canonical.
    '电源电压': { attributeId: 'supply_voltage_vcc', attributeName: 'Supply Voltage (Vcc)', unit: 'V', sortOrder: 20 },
    'supply voltage': { attributeId: 'supply_voltage_vcc', attributeName: 'Supply Voltage (Vcc)', unit: 'V', sortOrder: 20 },
    // Operating temperature — E1 canonical 'operating_temp_range'.
    '工作温度': { attributeId: 'operating_temp_range', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 21 },
    'operating temperature': { attributeId: 'operating_temp_range', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 21 },
    // Package — reuse existing E1 canonical 'package_type'.
    '封装': { attributeId: 'package_type', attributeName: 'Package / Case', sortOrder: 22 },
    'package': { attributeId: 'package_type', attributeName: 'Package / Case', sortOrder: 22 },
    // CTR — current transfer ratio. E1 canonical (min/max/class variants exist).
    'ctr': { attributeId: 'ctr_min_pct', attributeName: 'CTR (Min)', unit: '%', sortOrder: 23 },
    '电流传输比': { attributeId: 'ctr_min_pct', attributeName: 'CTR (Min)', unit: '%', sortOrder: 23 },

    // ── E1 vendor variants (Decision #235 follow-up, Item 1) ──
    // Triage survey across all E1-touching MFRs (AOTE, Kinglight, MP, CT MICRO,
    // KTP, JJW, etc.) showed thousands of products with paramNames that differ
    // from the existing E1 entries by parenthetical-suffix variation, half-letter
    // case in propagation-delay names, or Greek μ vs Latin u in CMTI units. Adding
    // aliases here is higher-leverage than adding to each individual MFR's
    // override.

    // 正向电流(If) — vendor variant of 正向电流 with (If) parenthetical
    '正向电流(if)': { attributeId: 'if_rated_ma', attributeName: 'Forward Current (If)', unit: 'mA', sortOrder: 5 },
    'forward current (if)': { attributeId: 'if_rated_ma', attributeName: 'Forward Current (If)', unit: 'mA', sortOrder: 5 },

    // VCE(sat) without @Ic,IF condition suffix
    '集射极饱和电压(vce(sat))': { attributeId: 'vce_sat_v', attributeName: 'Vce(sat)', unit: 'V', sortOrder: 7 },
    'vce(sat)': { attributeId: 'vce_sat_v', attributeName: 'Vce(sat)', unit: 'V', sortOrder: 7 },
    'v ceo_max': { attributeId: 'vce_sat_v', attributeName: 'Vce(sat)', unit: 'V', sortOrder: 7 },

    // CTR variants — Chinese-with-(CTR)-suffix and English forms
    '电流传输比(ctr)最小值': { attributeId: 'ctr_min_pct', attributeName: 'CTR (Min)', unit: '%', sortOrder: 23 },
    '电流传输比(ctr)最大值/饱和值': { attributeId: 'ctr_max_pct', attributeName: 'CTR (Max)', unit: '%', sortOrder: 24 },
    'ctr-电流传输比': { attributeId: 'ctr_min_pct', attributeName: 'CTR (Min)', unit: '%', sortOrder: 23 },
    'ctr (max)': { attributeId: 'ctr_max_pct', attributeName: 'CTR (Max)', unit: '%', sortOrder: 24 },
    'ctr (min)': { attributeId: 'ctr_min_pct', attributeName: 'CTR (Min)', unit: '%', sortOrder: 23 },
    'ctr*': { attributeId: 'ctr_min_pct', attributeName: 'CTR (Min)', unit: '%', sortOrder: 23 },

    // 上升时间(tr) variant of existing 上升时间
    '上升时间(tr)': { attributeId: 'rise_time_us', attributeName: 'Rise Time', unit: 'µs', sortOrder: 8 },

    // Propagation delay — separate tpHL/tpLH variants (existing entry is the
    // combined 传播延迟tplh/tphl form). Both map to the same canonical.
    '传播延迟 tphl': { attributeId: 'propagation_delay_us', attributeName: 'Propagation Delay tpHL', unit: 'µs', sortOrder: 10 },
    '传播延迟 tplh': { attributeId: 'propagation_delay_us', attributeName: 'Propagation Delay tpLH', unit: 'µs', sortOrder: 10 },
    'tphl/tplhmax.(µs)': { attributeId: 'propagation_delay_us', attributeName: 'Propagation Delay Max', unit: 'µs', sortOrder: 10 },
    'tphl/tplhmax.(us)': { attributeId: 'propagation_delay_us', attributeName: 'Propagation Delay Max', unit: 'µs', sortOrder: 10 },

    // CMTI — Latin u variant of existing cmti(kv/μs). Different unicode chars
    // so .replace(/\s+/g, ' ') normalization doesn't unify them.
    'cmti(kv/us)': { attributeId: '_cmti_kv_us', attributeName: 'CMTI', unit: 'kV/µs', sortOrder: 91 },
    'cmh/l_min (kv/ms)': { attributeId: '_cmti_kv_us', attributeName: 'CMTI', unit: 'kV/µs', sortOrder: 91 },
    'cmr(v/ns)': { attributeId: '_cmti_kv_us', attributeName: 'CMR', unit: 'V/ns', sortOrder: 91 },

    // Power dissipation — NOT in E1 logic table; catalog only.
    '总功耗(pd)': { attributeId: '_power_dissipation_mw', attributeName: 'Power Dissipation', unit: 'mW', sortOrder: 92 },
    '耗散功率(pd)': { attributeId: '_power_dissipation_mw', attributeName: 'Power Dissipation', unit: 'mW', sortOrder: 92 },
    'radiant flux (mw) typ.': { attributeId: '_radiant_flux_mw', attributeName: 'Radiant Flux', unit: 'mW', sortOrder: 92 },

    // Data rate — high-speed optocoupler spec, catalog (not in E1 logic).
    '传输速率': { attributeId: '_data_rate_mbps', attributeName: 'Data Rate', unit: 'Mbps', sortOrder: 93 },
    '数据速率': { attributeId: '_data_rate_mbps', attributeName: 'Data Rate', unit: 'Mbps', sortOrder: 93 },
    'data rate(mbit/s)': { attributeId: '_data_rate_mbps', attributeName: 'Data Rate', unit: 'Mbps', sortOrder: 93 },
    'data rate (mbit/s)': { attributeId: '_data_rate_mbps', attributeName: 'Data Rate', unit: 'Mbps', sortOrder: 93 },

    // Input threshold current — catalog.
    '输入阈值电流(fh)': { attributeId: '_ift_min_ma', attributeName: 'Input Threshold Current (Min)', unit: 'mA', sortOrder: 94 },
    'iftmax.(ma)': { attributeId: '_ift_max_ma', attributeName: 'Input Threshold Current (Max)', unit: 'mA', sortOrder: 95 },
    'ift max(ma)': { attributeId: '_ift_max_ma', attributeName: 'Input Threshold Current (Max)', unit: 'mA', sortOrder: 95 },
    'ift (ma)': { attributeId: '_ift_max_ma', attributeName: 'Input Threshold Current (Max)', unit: 'mA', sortOrder: 95 },
    'if(on) max. (ma)': { attributeId: '_if_on_max_ma', attributeName: 'IF(ON) Max', unit: 'mA', sortOrder: 95 },
    'if(on) max.(ma)': { attributeId: '_if_on_max_ma', attributeName: 'IF(ON) Max', unit: 'mA', sortOrder: 95 },
    'if-on_max (ma)': { attributeId: '_if_on_max_ma', attributeName: 'IF(ON) Max', unit: 'mA', sortOrder: 95 },
    'if-on_min (ma)': { attributeId: '_if_on_min_ma', attributeName: 'IF(ON) Min', unit: 'mA', sortOrder: 96 },

    // JJW vendor English variants for isolation voltage (existing E1 has these
    // for Chinese; vendor uses padded English forms).
    'viso (vrms)': { attributeId: 'isolation_voltage_vrms', attributeName: 'Isolation Voltage', unit: 'Vrms', sortOrder: 1 },
    'viso (v)': { attributeId: 'isolation_voltage_vrms', attributeName: 'Isolation Voltage', unit: 'Vrms', sortOrder: 1 },
    'viso (rms) (v)': { attributeId: 'isolation_voltage_vrms', attributeName: 'Isolation Voltage', unit: 'Vrms', sortOrder: 1 },
    'viso(rms)(v)': { attributeId: 'isolation_voltage_vrms', attributeName: 'Isolation Voltage', unit: 'Vrms', sortOrder: 1 },
    'v iso_max (vrms)': { attributeId: 'isolation_voltage_vrms', attributeName: 'Isolation Voltage Max', unit: 'Vrms', sortOrder: 1 },
    'vl_min (v)': { attributeId: 'isolation_voltage_vrms', attributeName: 'Isolation Voltage Min', unit: 'V', sortOrder: 1 },

    // Operating temperature range — vendor TOPR variants
    'topr (°c)': { attributeId: 'operating_temp_range', attributeName: 'Operating Temperature Range', unit: '°C', sortOrder: 21 },
    'topr (℃)': { attributeId: 'operating_temp_range', attributeName: 'Operating Temperature Range', unit: '°C', sortOrder: 21 },
    'topr(℃)': { attributeId: 'operating_temp_range', attributeName: 'Operating Temperature Range', unit: '°C', sortOrder: 21 },

    // Vdrm — peak off-state voltage (for triac/SCR-output optocouplers)
    'vdrm (v)': { attributeId: 'vdrm_v', attributeName: 'Vdrm', unit: 'V', sortOrder: 17 },
    'vdrm(v)': { attributeId: 'vdrm_v', attributeName: 'Vdrm', unit: 'V', sortOrder: 17 },

    // Static dv/dt — catalog (TRIAC-output false-trigger immunity)
    'static dv/dt(v/µs) min.': { attributeId: '_static_dv_dt_v_us_min', attributeName: 'Static dv/dt (Min)', unit: 'V/µs', sortOrder: 97 },
    'static dv/dt(v/μs) min.': { attributeId: '_static_dv_dt_v_us_min', attributeName: 'Static dv/dt (Min)', unit: 'V/µs', sortOrder: 97 },
    'static dv/dt(v/us) min.': { attributeId: '_static_dv_dt_v_us_min', attributeName: 'Static dv/dt (Min)', unit: 'V/µs', sortOrder: 97 },
    'static dv/dt(v/µs) typ.': { attributeId: '_static_dv_dt_v_us_typ', attributeName: 'Static dv/dt (Typ)', unit: 'V/µs', sortOrder: 98 },
    'static dv/dt(v/μs) typ.': { attributeId: '_static_dv_dt_v_us_typ', attributeName: 'Static dv/dt (Typ)', unit: 'V/µs', sortOrder: 98 },
    'static dv/dt(v/us) typ.': { attributeId: '_static_dv_dt_v_us_typ', attributeName: 'Static dv/dt (Typ)', unit: 'V/µs', sortOrder: 98 },
    'dv/dt (v/μs)': { attributeId: '_static_dv_dt_v_us_min', attributeName: 'Static dv/dt', unit: 'V/µs', sortOrder: 97 },
    'dv/dt (v/us)': { attributeId: '_static_dv_dt_v_us_min', attributeName: 'Static dv/dt', unit: 'V/µs', sortOrder: 97 },

    // VR_Max — input-side reverse voltage max (existing 反向电压 alias)
    'vr_max (v)': { attributeId: 'input_reverse_voltage_v', attributeName: 'Reverse Voltage Max', unit: 'V', sortOrder: 6 },

    // Light current / IC — output transistor collector current (existing 输出电流)
    'light current (µa) typ.': { attributeId: 'output_current_ma', attributeName: 'Light Current (Typ)', unit: 'µA', sortOrder: 11 },
    'light current (ma)': { attributeId: 'output_current_ma', attributeName: 'Light Current', unit: 'mA', sortOrder: 11 },
    'ic': { attributeId: 'output_current_ma', attributeName: 'Output Current Ic', unit: 'mA', sortOrder: 11 },

    // Switch on/off time — catalog
    'ton_max (ms)': { attributeId: '_ton_max_ms', attributeName: 'Turn-On Time Max', unit: 'ms', sortOrder: 99 },
    'toff_max (ms)': { attributeId: '_toff_max_ms', attributeName: 'Turn-Off Time Max', unit: 'ms', sortOrder: 99 },

    // On-resistance for MOSFET-output (PhotoMOS-style) E1 — catalog
    'ron (ω)': { attributeId: '_ron_ohm', attributeName: 'On Resistance', unit: 'Ω', sortOrder: 100 },

    // Slot width — mechanical for slot-type photointerrupters
    '槽宽': { attributeId: '_slot_width_mm', attributeName: 'Slot Width', unit: 'mm', sortOrder: 101 },

    // IF_Max — forward current absolute max (variant of if_rated_ma)
    'if_max (ma)': { attributeId: 'if_rated_ma', attributeName: 'Forward Current Max', unit: 'mA', sortOrder: 5 },
    'if (ma)': { attributeId: 'if_rated_ma', attributeName: 'Forward Current', unit: 'mA', sortOrder: 5 },
    'if(ma)': { attributeId: 'if_rated_ma', attributeName: 'Forward Current', unit: 'mA', sortOrder: 5 },

    // Wavelength / radiant — catalog for LED-side
    'peakwavelength(nm)': { attributeId: '_peak_wavelength_nm', attributeName: 'Peak Wavelength', unit: 'nm', sortOrder: 102 },
    'peak wavelength (nm)': { attributeId: '_peak_wavelength_nm', attributeName: 'Peak Wavelength', unit: 'nm', sortOrder: 102 },
    'wavelength(nm)': { attributeId: '_peak_wavelength_nm', attributeName: 'Wavelength', unit: 'nm', sortOrder: 102 },
    'vf(v) 20ma': { attributeId: 'input_forward_voltage_vf', attributeName: 'Vf @ 20mA', unit: 'V', sortOrder: 4 },
    'intensity(mw/sr)typ. 20ma': { attributeId: '_intensity_mw_sr', attributeName: 'Intensity @ 20mA', unit: 'mW/sr', sortOrder: 103 },
    'max rating(ma)': { attributeId: '_max_rating_ma', attributeName: 'Max Rating', unit: 'mA', sortOrder: 104 },
    'max rating (ma)': { attributeId: '_max_rating_ma', attributeName: 'Max Rating', unit: 'mA', sortOrder: 104 },

    // CTR class / hysteresis catalog
    'hysteresis ratio': { attributeId: '_hysteresis_ratio', attributeName: 'Hysteresis Ratio', sortOrder: 105 },

    // Vcc / supply variants
    'vcc(v)': { attributeId: 'supply_voltage_vcc', attributeName: 'Supply Voltage (Vcc)', unit: 'V', sortOrder: 20 },
    'supply voltage (v)': { attributeId: 'supply_voltage_vcc', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 20 },
    '工作电压': { attributeId: 'supply_voltage_vcc', attributeName: 'Working Voltage', unit: 'V', sortOrder: 20 },
    '驱动侧工作电压': { attributeId: 'supply_voltage_vcc', attributeName: 'Driver-Side Working Voltage', unit: 'V', sortOrder: 20 },

    // Channel count variants
    'channel': { attributeId: 'channel_count', attributeName: 'Channel Count', sortOrder: 2 },
    '通道数': { attributeId: 'channel_count', attributeName: 'Channel Count', sortOrder: 2 },

    // Input value for opamp-style optocouplers — catalog
    'input': { attributeId: '_input_type', attributeName: 'Input Type', sortOrder: 106 },
    '输入电压': { attributeId: 'supply_voltage_vcc', attributeName: 'Input Voltage', unit: 'V', sortOrder: 20 },

    // Vendor's load voltage / current — for opto-driven applications (catalog)
    '负载电压': { attributeId: '_load_voltage_v', attributeName: 'Load Voltage', unit: 'V', sortOrder: 107 },
    '负载电流': { attributeId: '_load_current_ma', attributeName: 'Load Current', unit: 'mA', sortOrder: 108 },
    '连续负载电流': { attributeId: '_load_current_ma', attributeName: 'Continuous Load Current', unit: 'mA', sortOrder: 108 },
    '直流反向耐压(vr)': { attributeId: 'input_reverse_voltage_v', attributeName: 'DC Reverse Voltage (Vr)', unit: 'V', sortOrder: 6 },
    '正向压降(vf)': { attributeId: 'input_forward_voltage_vf', attributeName: 'Forward Voltage (Vf)', unit: 'V', sortOrder: 4 },
    '正向压降': { attributeId: 'input_forward_voltage_vf', attributeName: 'Forward Voltage', unit: 'V', sortOrder: 4 },

    // Misc collector spec — output transistor (catalog)
    '集电极暗电流': { attributeId: '_iceo_dark_ua', attributeName: 'Collector Dark Current', unit: 'µA', sortOrder: 109 },

    // 过零功能 / firing — overlap with F2 SSR concept (catalog here)
    '过零功能': { attributeId: '_zero_cross', attributeName: 'Zero-Cross Function', sortOrder: 110 },
    '过零': { attributeId: '_zero_cross', attributeName: 'Zero-Cross', sortOrder: 110 },
  },

  // ─── F1 Electromechanical Relays ──────────────────────
  // Seeded from HONGFA's source file (mfr_30_HONGFA_宏发_params.json) which
  // ships ~34 paramNames per product. Most relay MFRs use overlapping
  // Chinese terms (TE, Omron, Panasonic, Songle, Fujitsu). When a new relay
  // MFR drops with a distinct paramName, add it via Triage Accept.
  //
  // AC vs DC switching ratings: HONGFA splits 最大切换电压 and 最大额定切换电流
  // into separate (AC) and (DC) paramNames. Both can co-exist on one product.
  // To avoid JSONB collision on canonical attribute IDs, AC variants map to
  // the F1 logic-table canonical, DC variants map to a _-prefixed catalog
  // attribute. Most general-purpose relays drive AC loads, so canonical
  // values typically reflect the AC rating.
  F1: {
    // ── Coil (supply side) ──
    '线圈工作电压': { attributeId: 'coil_voltage_vdc', attributeName: 'Coil Voltage', unit: 'V', sortOrder: 1 },
    '额定线圈电压': { attributeId: 'coil_voltage_vdc', attributeName: 'Coil Voltage', unit: 'V', sortOrder: 1 },
    '线圈电压': { attributeId: 'coil_voltage_vdc', attributeName: 'Coil Voltage', unit: 'V', sortOrder: 1 },
    'coil voltage': { attributeId: 'coil_voltage_vdc', attributeName: 'Coil Voltage', unit: 'V', sortOrder: 1 },
    'rated coil voltage': { attributeId: 'coil_voltage_vdc', attributeName: 'Coil Voltage', unit: 'V', sortOrder: 1 },
    // Coil voltage type (AC/DC) — NOT in F1 logic table (no rule scores it),
    // but a critical catalog discriminator. Underscore prefix per convention.
    '线圈电压类型': { attributeId: '_coil_voltage_type', attributeName: 'Coil Voltage Type', sortOrder: 2 },
    'coil voltage type': { attributeId: '_coil_voltage_type', attributeName: 'Coil Voltage Type', sortOrder: 2 },
    // Coil power — HONGFA uses both 线圈功率 (categorical e.g. 标准型/standard)
    // and 额定线圈功率 (numeric VA/W). Map both to coil_power_mw; numeric one
    // wins because it gets processed with the unit-bearing form.
    '额定线圈功率': { attributeId: 'coil_power_mw', attributeName: 'Coil Power', unit: 'mW', sortOrder: 3 },
    '线圈功率': { attributeId: 'coil_power_mw', attributeName: 'Coil Power', unit: 'mW', sortOrder: 3 },
    'coil power': { attributeId: 'coil_power_mw', attributeName: 'Coil Power', unit: 'mW', sortOrder: 3 },
    // Coil resistance — F1 logic table canonical (threshold rule for GPIO drive).
    '线圈电阻': { attributeId: 'coil_resistance_ohm', attributeName: 'Coil Resistance', unit: 'Ω', sortOrder: 4 },
    'coil resistance': { attributeId: 'coil_resistance_ohm', attributeName: 'Coil Resistance', unit: 'Ω', sortOrder: 4 },
    // Coil parallel component — value is typically 二极管/diode or N/A.
    // F1 logic table has 'coil_suppress_diode' as a flag attribute.
    '线圈并联元件': { attributeId: 'coil_suppress_diode', attributeName: 'Coil Suppression', sortOrder: 5 },
    'coil suppression': { attributeId: 'coil_suppress_diode', attributeName: 'Coil Suppression', sortOrder: 5 },
    // Coil characteristic (monostable/bistable) — catalog only.
    '线圈特征': { attributeId: '_coil_characteristic', attributeName: 'Coil Characteristic', sortOrder: 6 },
    // Must-operate / must-release voltage — F1 logic canonical.
    '吸合电压': { attributeId: 'must_operate_voltage_v', attributeName: 'Must-Operate Voltage', unit: 'V', sortOrder: 7 },
    'must operate voltage': { attributeId: 'must_operate_voltage_v', attributeName: 'Must-Operate Voltage', unit: 'V', sortOrder: 7 },
    '释放电压': { attributeId: 'must_release_voltage_v', attributeName: 'Must-Release Voltage', unit: 'V', sortOrder: 8 },
    'must release voltage': { attributeId: 'must_release_voltage_v', attributeName: 'Must-Release Voltage', unit: 'V', sortOrder: 8 },

    // ── Contacts (load side) ──
    '触点形式': { attributeId: 'contact_form', attributeName: 'Contact Form', sortOrder: 10 },
    'contact form': { attributeId: 'contact_form', attributeName: 'Contact Form', sortOrder: 10 },
    '触点数': { attributeId: 'contact_count', attributeName: 'Contact Count', sortOrder: 11 },
    'contact count': { attributeId: 'contact_count', attributeName: 'Contact Count', sortOrder: 11 },
    'number of contacts': { attributeId: 'contact_count', attributeName: 'Contact Count', sortOrder: 11 },
    '触点材料': { attributeId: 'contact_material', attributeName: 'Contact Material', sortOrder: 12 },
    'contact material': { attributeId: 'contact_material', attributeName: 'Contact Material', sortOrder: 12 },
    // AC variant maps to F1 canonical; DC variant goes to catalog to avoid collision.
    '最大切换电压(ac)': { attributeId: 'contact_voltage_rating_v', attributeName: 'Max Switching Voltage (AC)', unit: 'V', sortOrder: 13 },
    '最大切换电压': { attributeId: 'contact_voltage_rating_v', attributeName: 'Max Switching Voltage', unit: 'V', sortOrder: 13 },
    '负载电压': { attributeId: 'contact_voltage_rating_v', attributeName: 'Load Voltage', unit: 'V', sortOrder: 13 },
    'max switching voltage': { attributeId: 'contact_voltage_rating_v', attributeName: 'Max Switching Voltage', unit: 'V', sortOrder: 13 },
    '最大切换电压(dc)': { attributeId: '_contact_voltage_dc_v', attributeName: 'Max Switching Voltage (DC)', unit: 'V', sortOrder: 14 },
    '最大额定切换电流(ac)': { attributeId: 'contact_current_rating_a', attributeName: 'Max Switching Current (AC)', unit: 'A', sortOrder: 15 },
    '最大额定切换电流': { attributeId: 'contact_current_rating_a', attributeName: 'Max Switching Current', unit: 'A', sortOrder: 15 },
    '负载电流': { attributeId: 'contact_current_rating_a', attributeName: 'Load Current', unit: 'A', sortOrder: 15 },
    'max switching current': { attributeId: 'contact_current_rating_a', attributeName: 'Max Switching Current', unit: 'A', sortOrder: 15 },
    '最大额定切换电流(dc)': { attributeId: '_contact_current_dc_a', attributeName: 'Max Switching Current (DC)', unit: 'A', sortOrder: 16 },
    // Contact voltage type (AC/DC) — F1 logic canonical (identity_flag rule).
    '触点电压类型': { attributeId: 'contact_voltage_type', attributeName: 'Contact Voltage Type', sortOrder: 17 },
    'contact voltage type': { attributeId: 'contact_voltage_type', attributeName: 'Contact Voltage Type', sortOrder: 17 },
    // Max switching power — VA rating, F1 logic canonical.
    '最大额定切换功率(va)': { attributeId: 'max_switching_power_va', attributeName: 'Max Switching Power', unit: 'VA', sortOrder: 18 },
    '最大切换功率': { attributeId: 'max_switching_power_va', attributeName: 'Max Switching Power', unit: 'VA', sortOrder: 18 },
    'max switching power': { attributeId: 'max_switching_power_va', attributeName: 'Max Switching Power', unit: 'VA', sortOrder: 18 },

    // ── Isolation / dielectric (safety side) ──
    // 介质耐压 = dielectric withstanding voltage (the hi-pot test). F1 logic
    // doesn't model it explicitly, but the safety-critical concept aligns
    // with isolation_voltage_vrms (used by F2 and E1). Mapping here makes
    // the value scorable wherever a future rule references this attr.
    '介质耐压': { attributeId: 'isolation_voltage_vrms', attributeName: 'Dielectric Withstanding Voltage', unit: 'Vrms', sortOrder: 19 },
    '介质耐压(单位：vac)': { attributeId: 'isolation_voltage_vrms', attributeName: 'Dielectric Withstanding Voltage', unit: 'Vrms', sortOrder: 19 },
    'dielectric withstanding voltage': { attributeId: 'isolation_voltage_vrms', attributeName: 'Dielectric Withstanding Voltage', unit: 'Vrms', sortOrder: 19 },

    // ── Timing (operate/release) ──
    '动作时间(单位：ms)': { attributeId: 'operate_time_ms', attributeName: 'Operate Time', unit: 'ms', sortOrder: 20 },
    '动作时间': { attributeId: 'operate_time_ms', attributeName: 'Operate Time', unit: 'ms', sortOrder: 20 },
    'operate time': { attributeId: 'operate_time_ms', attributeName: 'Operate Time', unit: 'ms', sortOrder: 20 },
    '释放时间(单位：ms)': { attributeId: 'release_time_ms', attributeName: 'Release Time', unit: 'ms', sortOrder: 21 },
    '释放时间': { attributeId: 'release_time_ms', attributeName: 'Release Time', unit: 'ms', sortOrder: 21 },
    'release time': { attributeId: 'release_time_ms', attributeName: 'Release Time', unit: 'ms', sortOrder: 21 },
    // Contact bounce — F1 logic canonical.
    '触点回跳时间': { attributeId: 'contact_bounce_ms', attributeName: 'Contact Bounce', unit: 'ms', sortOrder: 22 },
    'contact bounce': { attributeId: 'contact_bounce_ms', attributeName: 'Contact Bounce', unit: 'ms', sortOrder: 22 },

    // ── Endurance ──
    '机械耐久性(单位：次)': { attributeId: 'mechanical_life_ops', attributeName: 'Mechanical Life', unit: 'ops', sortOrder: 23 },
    '机械寿命': { attributeId: 'mechanical_life_ops', attributeName: 'Mechanical Life', unit: 'ops', sortOrder: 23 },
    'mechanical life': { attributeId: 'mechanical_life_ops', attributeName: 'Mechanical Life', unit: 'ops', sortOrder: 23 },
    '电耐久性(单位：次)': { attributeId: 'electrical_life_ops', attributeName: 'Electrical Life', unit: 'ops', sortOrder: 24 },
    '电寿命': { attributeId: 'electrical_life_ops', attributeName: 'Electrical Life', unit: 'ops', sortOrder: 24 },
    'electrical life': { attributeId: 'electrical_life_ops', attributeName: 'Electrical Life', unit: 'ops', sortOrder: 24 },

    // ── Environmental / mechanical ──
    '温度范围': { attributeId: 'operating_temp_range', attributeName: 'Operating Temperature Range', unit: '°C', sortOrder: 25 },
    '工作温度范围': { attributeId: 'operating_temp_range', attributeName: 'Operating Temperature Range', unit: '°C', sortOrder: 25 },
    'operating temperature range': { attributeId: 'operating_temp_range', attributeName: 'Operating Temperature Range', unit: '°C', sortOrder: 25 },
    '安装形式': { attributeId: 'mounting_type', attributeName: 'Mounting Type', sortOrder: 26 },
    'mounting type': { attributeId: 'mounting_type', attributeName: 'Mounting Type', sortOrder: 26 },
    '封装形式': { attributeId: 'package_footprint', attributeName: 'Package', sortOrder: 27 },
    'package footprint': { attributeId: 'package_footprint', attributeName: 'Package', sortOrder: 27 },
    // Sealing type — F1 logic canonical (washable/sealed/flux-proof).
    '密封类型': { attributeId: 'sealing_type', attributeName: 'Sealing Type', sortOrder: 28 },
    'sealing type': { attributeId: 'sealing_type', attributeName: 'Sealing Type', sortOrder: 28 },
    // AEC-Q200 qualification (automotive). F1 logic canonical (identity_flag).
    'aec-q200': { attributeId: 'aec_q200', attributeName: 'AEC-Q200', sortOrder: 29 },
    'aec_q200': { attributeId: 'aec_q200', attributeName: 'AEC-Q200', sortOrder: 29 },

    // ── Catalog-only (underscore prefix; not scored by F1 rules) ──
    '绝缘电阻(单位：mω)': { attributeId: '_insulation_resistance_mohm', attributeName: 'Insulation Resistance', unit: 'MΩ', sortOrder: 90 },
    '绝缘电阻': { attributeId: '_insulation_resistance_mohm', attributeName: 'Insulation Resistance', unit: 'MΩ', sortOrder: 90 },
    'insulation resistance': { attributeId: '_insulation_resistance_mohm', attributeName: 'Insulation Resistance', unit: 'MΩ', sortOrder: 90 },
    '触点间隙(单位：mm)': { attributeId: '_contact_gap_mm', attributeName: 'Contact Gap', unit: 'mm', sortOrder: 91 },
    '触点间隙': { attributeId: '_contact_gap_mm', attributeName: 'Contact Gap', unit: 'mm', sortOrder: 91 },
    '爬电距离(单位：mm)': { attributeId: '_creepage_distance_mm', attributeName: 'Creepage Distance', unit: 'mm', sortOrder: 92 },
    '爬电距离': { attributeId: '_creepage_distance_mm', attributeName: 'Creepage Distance', unit: 'mm', sortOrder: 92 },
    '电气距离(单位：mm)': { attributeId: '_clearance_distance_mm', attributeName: 'Clearance Distance', unit: 'mm', sortOrder: 93 },
    '电气间隙': { attributeId: '_clearance_distance_mm', attributeName: 'Clearance Distance', unit: 'mm', sortOrder: 93 },
    '绝缘等级': { attributeId: '_insulation_class', attributeName: 'Insulation Class', sortOrder: 94 },
    '引出端形式': { attributeId: '_terminal_form', attributeName: 'Terminal Form', sortOrder: 95 },
    '引出端结构形式': { attributeId: '_terminal_structure', attributeName: 'Terminal Structure', sortOrder: 96 },
    '产品应用领域': { attributeId: '_application_field', attributeName: 'Application Field', sortOrder: 97 },
    '产品应用场合': { attributeId: '_application_use', attributeName: 'Application Use', sortOrder: 98 },
    '重量(单位：g)': { attributeId: '_weight_g', attributeName: 'Weight', unit: 'g', sortOrder: 99 },
    '体积(单位：mm3)': { attributeId: '_volume_mm3', attributeName: 'Volume', unit: 'mm³', sortOrder: 100 },
  },

  // ─── F2 Solid State Relays ────────────────────────────
  // Seeded from F2 logic-table canonicals + best-guess Chinese aliases.
  // No HONGFA-equivalent ground-truth source yet — when the first Chinese SSR
  // MFR (e.g. Kyotto, Carlo Gavazzi reseller, generic 国产 SSR vendor) drops,
  // expect the engineer to add MFR-specific aliases via Triage Accept.
  F2: {
    // Output switch type — F2 HARD GATE (TRIAC vs SCR vs MOSFET).
    '输出开关类型': { attributeId: 'output_switch_type', attributeName: 'Output Switch Type', sortOrder: 1 },
    '输出类型': { attributeId: 'output_switch_type', attributeName: 'Output Switch Type', sortOrder: 1 },
    'output switch type': { attributeId: 'output_switch_type', attributeName: 'Output Switch Type', sortOrder: 1 },
    // Firing mode — F2 HARD GATE (zero-crossing vs random-fire).
    '触发模式': { attributeId: 'firing_mode', attributeName: 'Firing Mode', sortOrder: 2 },
    '过零控制': { attributeId: 'firing_mode', attributeName: 'Firing Mode', sortOrder: 2 },
    'firing mode': { attributeId: 'firing_mode', attributeName: 'Firing Mode', sortOrder: 2 },
    'zero crossing': { attributeId: 'firing_mode', attributeName: 'Firing Mode', sortOrder: 2 },
    // Mounting type — PCB / panel / DIN-rail.
    '安装形式': { attributeId: 'mounting_type', attributeName: 'Mounting Type', sortOrder: 3 },
    'mounting type': { attributeId: 'mounting_type', attributeName: 'Mounting Type', sortOrder: 3 },
    // Load voltage type (AC/DC).
    '负载电压类型': { attributeId: 'load_voltage_type', attributeName: 'Load Voltage Type', sortOrder: 4 },
    'load voltage type': { attributeId: 'load_voltage_type', attributeName: 'Load Voltage Type', sortOrder: 4 },
    // Load voltage max — F2 safety-critical threshold.
    '最大负载电压': { attributeId: 'load_voltage_max_v', attributeName: 'Max Load Voltage', unit: 'V', sortOrder: 5 },
    '负载电压': { attributeId: 'load_voltage_max_v', attributeName: 'Load Voltage', unit: 'V', sortOrder: 5 },
    'max load voltage': { attributeId: 'load_voltage_max_v', attributeName: 'Max Load Voltage', unit: 'V', sortOrder: 5 },
    'load voltage': { attributeId: 'load_voltage_max_v', attributeName: 'Load Voltage', unit: 'V', sortOrder: 5 },
    // Load current max — F2 safety-critical threshold.
    '最大负载电流': { attributeId: 'load_current_max_a', attributeName: 'Max Load Current', unit: 'A', sortOrder: 6 },
    '负载电流': { attributeId: 'load_current_max_a', attributeName: 'Load Current', unit: 'A', sortOrder: 6 },
    'max load current': { attributeId: 'load_current_max_a', attributeName: 'Max Load Current', unit: 'A', sortOrder: 6 },
    'load current': { attributeId: 'load_current_max_a', attributeName: 'Load Current', unit: 'A', sortOrder: 6 },
    // Load current min — hidden TRIAC failure mode for low-current loads.
    '最小负载电流': { attributeId: 'load_current_min_a', attributeName: 'Min Load Current', unit: 'A', sortOrder: 7 },
    'min load current': { attributeId: 'load_current_min_a', attributeName: 'Min Load Current', unit: 'A', sortOrder: 7 },
    // Off-state leakage.
    '截止漏电流': { attributeId: 'off_state_leakage_ma', attributeName: 'Off-State Leakage', unit: 'mA', sortOrder: 8 },
    'off-state leakage': { attributeId: 'off_state_leakage_ma', attributeName: 'Off-State Leakage', unit: 'mA', sortOrder: 8 },
    // Input voltage range — F2 control-side spec.
    '输入电压范围': { attributeId: 'input_voltage_range_v', attributeName: 'Input Voltage Range', unit: 'V', sortOrder: 9 },
    '控制电压': { attributeId: 'input_voltage_range_v', attributeName: 'Control Voltage', unit: 'V', sortOrder: 9 },
    'input voltage range': { attributeId: 'input_voltage_range_v', attributeName: 'Input Voltage Range', unit: 'V', sortOrder: 9 },
    // Input current.
    '输入电流': { attributeId: 'input_current_ma', attributeName: 'Input Current', unit: 'mA', sortOrder: 10 },
    'input current': { attributeId: 'input_current_ma', attributeName: 'Input Current', unit: 'mA', sortOrder: 10 },
    // Switching times.
    '导通时间': { attributeId: 'turn_on_time_ms', attributeName: 'Turn-On Time', unit: 'ms', sortOrder: 11 },
    'turn-on time': { attributeId: 'turn_on_time_ms', attributeName: 'Turn-On Time', unit: 'ms', sortOrder: 11 },
    '截止时间': { attributeId: 'turn_off_time_ms', attributeName: 'Turn-Off Time', unit: 'ms', sortOrder: 12 },
    'turn-off time': { attributeId: 'turn_off_time_ms', attributeName: 'Turn-Off Time', unit: 'ms', sortOrder: 12 },
    // dv/dt and di/dt ratings — SCR/TRIAC false-trigger immunity.
    'dv/dt': { attributeId: 'dv_dt_rating_v_us', attributeName: 'dv/dt Rating', unit: 'V/µs', sortOrder: 13 },
    'di/dt': { attributeId: 'di_dt_rating_a_us', attributeName: 'di/dt Rating', unit: 'A/µs', sortOrder: 14 },
    // On-state voltage drop — SSR conduction loss.
    '导通压降': { attributeId: 'on_state_voltage_drop_v', attributeName: 'On-State Voltage Drop', unit: 'V', sortOrder: 15 },
    'on-state voltage drop': { attributeId: 'on_state_voltage_drop_v', attributeName: 'On-State Voltage Drop', unit: 'V', sortOrder: 15 },
    // Built-in snubber / varistor (transient protection).
    '内置缓冲电路': { attributeId: 'built_in_snubber', attributeName: 'Built-In Snubber', sortOrder: 16 },
    'built-in snubber': { attributeId: 'built_in_snubber', attributeName: 'Built-In Snubber', sortOrder: 16 },
    '内置压敏电阻': { attributeId: 'built_in_varistor', attributeName: 'Built-In Varistor', sortOrder: 17 },
    // Isolation voltage — F2 safety canonical (shared with E1 conceptually).
    '隔离电压': { attributeId: 'isolation_voltage_vrms', attributeName: 'Isolation Voltage', unit: 'Vrms', sortOrder: 18 },
    '介质耐压': { attributeId: 'isolation_voltage_vrms', attributeName: 'Dielectric Withstanding Voltage', unit: 'Vrms', sortOrder: 18 },
    'isolation voltage': { attributeId: 'isolation_voltage_vrms', attributeName: 'Isolation Voltage', unit: 'Vrms', sortOrder: 18 },
    // Safety certification (UL/CE/VDE/TÜV).
    '安全认证': { attributeId: 'safety_certification', attributeName: 'Safety Certification', sortOrder: 19 },
    'safety certification': { attributeId: 'safety_certification', attributeName: 'Safety Certification', sortOrder: 19 },
    // Operating temperature.
    '温度范围': { attributeId: 'operating_temp_range', attributeName: 'Operating Temperature Range', unit: '°C', sortOrder: 20 },
    '工作温度范围': { attributeId: 'operating_temp_range', attributeName: 'Operating Temperature Range', unit: '°C', sortOrder: 20 },
    // Package.
    '封装': { attributeId: 'package_footprint', attributeName: 'Package', sortOrder: 21 },
    '封装形式': { attributeId: 'package_footprint', attributeName: 'Package', sortOrder: 21 },
    'package': { attributeId: 'package_footprint', attributeName: 'Package', sortOrder: 21 },
    // Thermal resistance.
    '热阻': { attributeId: 'thermal_resistance_jc', attributeName: 'Thermal Resistance', unit: '°C/W', sortOrder: 22 },
    'thermal resistance': { attributeId: 'thermal_resistance_jc', attributeName: 'Thermal Resistance', unit: '°C/W', sortOrder: 22 },

    // ── APSEMI English vendor convention (Decision #235 follow-up) ──
    // APSEMI ships SSRs (304 products) with English paramNames; the trailing
    // spaces in their source ('Circuit ', 'Voltage - Input ') get stripped by
    // the lookup's .trim() so dict keys match the trimmed form.
    'circuit': { attributeId: '_output_config', attributeName: 'Output Configuration', sortOrder: 90 },
    'voltage - input': { attributeId: 'input_voltage_range_v', attributeName: 'Input Voltage', unit: 'V', sortOrder: 9 },
    'output type': { attributeId: 'load_voltage_type', attributeName: 'Load Voltage Type', sortOrder: 4 },
    'operating temperature': { attributeId: 'operating_temp_range', attributeName: 'Operating Temperature Range', unit: '°C', sortOrder: 20 },
    'device package': { attributeId: 'package_footprint', attributeName: 'Package', sortOrder: 21 },
    'package / case': { attributeId: 'package_footprint', attributeName: 'Package', sortOrder: 21 },
    'supplier device package': { attributeId: 'package_footprint', attributeName: 'Package', sortOrder: 21 },

    // ── APSEMI PhotoMOS subset (37 products with output-MOSFET specs) ──
    // F2 logic table doesn't score these (they belong to B5), but for PhotoMOS
    // SSRs which embed a MOSFET, preserving the data as catalog (underscore
    // prefix) lets the Specs panel show what the vendor publishes.
    'fet type': { attributeId: '_fet_type', attributeName: 'FET Type', sortOrder: 91 },
    'rds on (max) @ id, vgs': { attributeId: '_rds_on_mohm', attributeName: 'Rds(on) Max', unit: 'mΩ', sortOrder: 92 },
    'vgs(th) (max) @ id': { attributeId: '_vgs_th_v', attributeName: 'Vgs(th) Max', unit: 'V', sortOrder: 93 },
    'vgs (max)': { attributeId: '_vgs_max_v', attributeName: 'Vgs Max', unit: 'V', sortOrder: 94 },
    'power dissipation (max)': { attributeId: '_power_dissipation_w', attributeName: 'Power Dissipation Max', unit: 'W', sortOrder: 95 },
    'current - continuous drain (id) @ 25°c': { attributeId: '_id_continuous_a', attributeName: 'Id Continuous @ 25°C', unit: 'A', sortOrder: 96 },
    'drive voltage (max rds on, min rds on)': { attributeId: '_drive_voltage_v', attributeName: 'Drive Voltage', unit: 'V', sortOrder: 97 },

    // ── STEIPU / AOTE / KTP Chinese variants ──
    // Variant of 隔离电压 with explicit unit suffix used by several SSR/opto
    // MFRs. Both forms map to the same canonical.
    '隔离电压(vrms)': { attributeId: 'isolation_voltage_vrms', attributeName: 'Isolation Voltage', unit: 'Vrms', sortOrder: 18 },
    // 触点形式 in SSR scope ≠ relay contact-form. SSRs don't have mechanical
    // contacts but vendors borrow the term to describe output config (SPST-NO
    // = single output, normally-open behavior). Catalog-only here.
    '触点形式': { attributeId: '_output_config', attributeName: 'Contact Configuration', sortOrder: 90 },
    // SSR-side switching ratings
    '最大切换电流': { attributeId: 'load_current_max_a', attributeName: 'Max Switching Current', unit: 'A', sortOrder: 6 },
    '连续负载电流': { attributeId: 'load_current_max_a', attributeName: 'Continuous Load Current', unit: 'A', sortOrder: 6 },
    '导通时间(ton)': { attributeId: 'turn_on_time_ms', attributeName: 'Turn-On Time', unit: 'ms', sortOrder: 11 },
    '截止时间(toff)': { attributeId: 'turn_off_time_ms', attributeName: 'Turn-Off Time', unit: 'ms', sortOrder: 12 },
    '导通电阻': { attributeId: '_on_resistance_ohm', attributeName: 'On Resistance', unit: 'Ω', sortOrder: 98 },
    // 过零功能 = zero-cross function (yes/no). Maps to firing_mode whose values
    // are zero-crossing / random — semantically the same discriminator.
    '过零功能': { attributeId: 'firing_mode', attributeName: 'Zero-Cross Function', sortOrder: 2 },
    // Input variants
    '输入电压': { attributeId: 'input_voltage_range_v', attributeName: 'Input Voltage', unit: 'V', sortOrder: 9 },
    '输入类型': { attributeId: 'load_voltage_type', attributeName: 'Input Type', sortOrder: 4 },
    // Working voltage for SSR control side
    '工作电压': { attributeId: 'input_voltage_range_v', attributeName: 'Working Voltage', unit: 'V', sortOrder: 9 },
  },
};

/**
 * Shared/common parameter names that appear across multiple families.
 * Checked as fallback when no family-specific mapping exists.
 */
const sharedParamDictionary: Record<string, AtlasParamMapping> = {
  '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 18 },
  '封装/外壳': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 18 },
  '主要封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 18 },
  'package': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 18 },
  '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 16 },
  '温度': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 16 },
  'operating temperature range': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 16 },
  'operating temperature range (°c)': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 16 },
  '电压': { attributeId: 'supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 17 },
};

/**
 * Metadata parameter dictionary — cross-family regulatory/compliance/export-control
 * fields that we want preserved in JSONB and lifted onto Part top-level fields,
 * but DON'T want surfaced as ParametricAttribute rows (the Specs panel is for
 * electrical parametrics, not certifications).
 *
 * Flow: ingest resolves a raw key like `ECCN代码` → canonical `eccn_code` →
 * stored in JSONB. `fromParametersJsonb` consults METADATA_ATTRIBUTE_IDS at
 * read time and EXCLUDES these from the ParametricAttribute output. The
 * Overview's read-time lift in `atlasClient.rowToPartAttributes` reads raw
 * JSONB by canonical key and populates `Part.rohsStatus` / `eccnCode` / etc.
 * directly — that's the only display surface for these fields.
 *
 * MIRROR: also defined in scripts/atlas-ingest.mjs as METADATA_PARAMS.
 * Keep the two in lock-step per Decision #174.
 */
const metadataParamDictionary: Record<string, AtlasParamMapping> = {
  // RoHS — EU restriction of hazardous substances
  'rohs': { attributeId: 'rohs', attributeName: 'RoHS', sortOrder: 900 },
  'rohs status': { attributeId: 'rohs', attributeName: 'RoHS', sortOrder: 900 },
  'rohs符合性': { attributeId: 'rohs', attributeName: 'RoHS', sortOrder: 900 },
  'rohs code': { attributeId: 'rohs', attributeName: 'RoHS', sortOrder: 900 },
  'rohs合规': { attributeId: 'rohs', attributeName: 'RoHS', sortOrder: 900 },
  // REACH — EU chemical registration
  'reach': { attributeId: 'reach', attributeName: 'REACH', sortOrder: 901 },
  'reach status': { attributeId: 'reach', attributeName: 'REACH', sortOrder: 901 },
  'reach符合性': { attributeId: 'reach', attributeName: 'REACH', sortOrder: 901 },
  'reach合规': { attributeId: 'reach', attributeName: 'REACH', sortOrder: 901 },
  // ECCN — US export control classification
  'eccn': { attributeId: 'eccn_code', attributeName: 'ECCN Code', sortOrder: 902 },
  'eccn code': { attributeId: 'eccn_code', attributeName: 'ECCN Code', sortOrder: 902 },
  'eccn代码': { attributeId: 'eccn_code', attributeName: 'ECCN Code', sortOrder: 902 },
  // HTS — Harmonized Tariff Schedule
  'hts': { attributeId: 'hts_code', attributeName: 'HTS Code', sortOrder: 903 },
  'hts code': { attributeId: 'hts_code', attributeName: 'HTS Code', sortOrder: 903 },
  'hts代码': { attributeId: 'hts_code', attributeName: 'HTS Code', sortOrder: 903 },
  // MSL — moisture sensitivity level
  'msl': { attributeId: 'msl', attributeName: 'Moisture Sensitivity Level', sortOrder: 904 },
  'moisture sensitivity level': { attributeId: 'msl', attributeName: 'Moisture Sensitivity Level', sortOrder: 904 },
  '湿敏等级': { attributeId: 'msl', attributeName: 'Moisture Sensitivity Level', sortOrder: 904 },
};

/** Canonical attributeIds that are metadata (compliance/export/regulatory).
 *  fromParametersJsonb excludes these from ParametricAttribute output — they
 *  surface via the Part top-level fields populated by atlasClient's read-time
 *  lift, not via the Specs panel's parameter table. */
const METADATA_ATTRIBUTE_IDS: Set<string> = new Set(
  Object.values(metadataParamDictionary).map((m) => m.attributeId),
);

/**
 * Parameter names to always skip (metadata, not parametric data).
 */
const skipParams = new Set([
  'description',
  '品牌',        // brand
  '原始制造商',  // original manufacturer
  '最小包装',    // minimum order quantity
  '包装',        // packaging format
  '包装形式',    // packaging form (longer variant — blister/tube/box buyer concern, not parametric)
  '元件生命周期', // component lifecycle
  '零件状态',    // part status (use 状态/Status instead)
  '原产国家',    // country of origin
  'country of origin',    // English variant (APSEMI)
  '是否无铅',    // lead-free
  '安装类型',    // mounting type
  '引脚数',      // pin count
  '卷盘尺寸',    // reel size
  '脚间距',      // pin pitch
  '长x宽/尺寸',  // dimensions
  '高度',        // height (use package_case instead)
  '存储温度',    // storage temperature
  '印字代码',    // marking code
  '成分',        // composition
  '认证信息',    // certification info
  '商品目录',    // product catalog name
  '系列',        // series name
  '系列名称',    // series name (variant)
  '等级',        // grade/rating
  '特性',        // characteristics (too vague)
  '应用领域',    // application area
  '应用',        // application
  '封装技术',    // packaging technology
  '产品状态',    // product status (variant)
  '序号',        // serial number
  'category_name', // internal category label
  '描述',        // description (Chinese)
  'class',       // product class label
  '印字类型',    // marking type
  '无卤',        // halogen-free
  '是否无铅',    // lead-free (duplicate guard)
  'product status', // English status variant
  'mounting style', // mounting type (English)
  'package type',   // use package_case from family dict instead
  'esd diode',      // MOSFET body diode ESD info (not parametric)
  'l1name',         // upstream taxonomy level-1 NAME (e.g. "Connectors") — not a product attribute
  'l2name',         // upstream taxonomy level-2 NAME (e.g. "Wire-to-Board") — not a product attribute
  'l3name',         // upstream taxonomy level-3 NAME — same shape as l1/l2; preempt
  'frd diode',      // MOSFET body diode FRD info (not parametric)
  'mos type',       // redundant with channel_type
  '安装方式',      // mounting style (Chinese)
  '包装高度',      // package height
  '包装长度',      // package length
  '包装宽度',      // package width
  'rating',        // generic rating label
]);

// ─── Value Normalization ──────────────────────────────────

/** Atlas status codes → internal PartStatus */
const statusMap: Record<string, PartStatus> = {
  'mp': 'Active',
  'mass production': 'Active',
  's': 'Active',        // Sampling — treat as active
  'sampling': 'Active',
  'active': 'Active',
  'eol': 'Obsolete',
  'obsolete': 'Obsolete',
  'discontinued': 'Discontinued',
  'nrnd': 'NRND',
  'ltb': 'LastTimeBuy',
};

/**
 * Kill switch for unit-prefix conversion at storage time. When ON, every
 * Atlas numeric push site multiplies `numericValue` by the SI prefix
 * implied by `unit` so the stored number is base SI — matching Digikey's
 * existing convention (extractNumericValue in digikeyMapper.ts:362-378).
 *
 * When OFF (current default), Atlas continues storing raw display-unit
 * numbers and cross-source matching silently mis-compares any time
 * Atlas's unit differs from Digikey's base-SI numericValue (e.g. Atlas
 * fsw stored as 150 kHz with numericValue=150 vs. Digikey 1.5 MHz with
 * numericValue=1500000 — 1500x off, false fail in every threshold rule).
 *
 * Ship dark first; flip ON only after `scripts/atlas-audit-unit-mismatches.mjs`
 * confirms the (attributeId, unit) combos currently in atlas_dictionary_overrides
 * + in-code dicts truly capture SOURCE units (engineer claims about what the
 * incoming values are), not aspirational target/display units.
 */
export const APPLY_UNIT_PREFIX_TO_NUMERIC = true;

/**
 * Multiplies `numericValue` by the SI prefix implied by `unit` so the
 * stored number is base SI. Lifted from digikeyMapper.ts:362-378 so Atlas
 * and Digikey share one prefix-application convention.
 *
 * Guards against non-prefix unit tokens that share leading characters with
 * SI prefixes: 'mm' (millimeters, not milli-units), 'MSL' (moisture sensitivity
 * level, not mega-units), 'no' (count, not nano).
 *
 * No-op when `unit` is undefined/empty or starts with a non-prefix character
 * (V, A, Ω, °C, %, ppm/°C, nV/√Hz, etc.).
 */
/**
 * Pure SI-prefix conversion — no flag check. Exported for unit testing
 * so the prefix logic stays covered regardless of kill-switch state.
 * Production code should call `applyUnitPrefix` (the gated wrapper) instead.
 */
export function _applyUnitPrefixCore(numericValue: number | undefined, unit: string | undefined): number | undefined {
  if (numericValue === undefined || isNaN(numericValue)) return numericValue;
  if (!unit) return numericValue;
  if (unit.startsWith('p')) return numericValue * 1e-12;
  if (unit.startsWith('n') && !unit.startsWith('no')) return numericValue * 1e-9;
  if (unit.startsWith('µ') || unit.startsWith('μ') || unit.startsWith('u')) return numericValue * 1e-6;  // µ = U+00B5 (micro sign), μ = U+03BC (Greek small mu)
  if (unit.startsWith('m') && !unit.startsWith('mm') && !unit.startsWith('M')) return numericValue * 1e-3;
  if (unit.startsWith('k') || unit.startsWith('K')) return numericValue * 1e3;
  if (unit.startsWith('M') && !unit.startsWith('MSL')) return numericValue * 1e6;
  if (unit.startsWith('G')) return numericValue * 1e9;
  if (unit.startsWith('T')) return numericValue * 1e12;
  return numericValue;
}

export function applyUnitPrefix(numericValue: number | undefined, unit: string | undefined): number | undefined {
  if (!APPLY_UNIT_PREFIX_TO_NUMERIC) return numericValue;
  return _applyUnitPrefixCore(numericValue, unit);
}

/**
 * Parses a value string and extracts BOTH the leading number AND any
 * unit suffix that follows. Mirrors Digikey's extractNumericValue
 * (digikeyMapper.ts:362-378) so Atlas and Digikey converge on the same
 * "value string is source of truth" convention.
 *
 * Examples:
 *   "400kHz"  → { numericValue: 400, parsedUnit: 'kHz' }
 *   "5.8 mΩ"  → { numericValue: 5.8, parsedUnit: 'mΩ' }
 *   "100mA"   → { numericValue: 100, parsedUnit: 'mA' }
 *   "8"       → { numericValue: 8,   parsedUnit: undefined }  ← caller falls back to dict unit
 *   "≤150ns"  → { numericValue: 150, parsedUnit: 'ns' }
 *   "2.7~18V" → { numericValue: 2.7, parsedUnit: undefined }  ← range, only first num used; unit ambiguous, fall back
 *
 * Critical: the parsed unit drives prefix application in
 * applyUnitPrefix, so callers should prefer parsedUnit over dict's
 * declared unit. Dict unit is only the fallback for unit-less values.
 */
export function extractNumericWithPrefix(value: string): { numericValue?: number; parsedUnit?: string } {
  if (isMissingValue(value)) return {};
  const trimmed = value.trim();

  // Range values like "2.7~18V" — unit applies to both sides, but ambiguous which side
  // each part of the range belongs to. Return first number, no parsed unit (caller falls back).
  const rangeMatch = trimmed.match(/^([+-]?\d+\.?\d*)\s*[~–]\s*([+-]?\d+\.?\d*)/);
  if (rangeMatch) return { numericValue: parseFloat(rangeMatch[1]) };

  // ± prefix: "±10V" or "+/-10V"
  const pmMatch = trimmed.match(/^[±]\s*(\d+\.?\d*)\s*([a-zA-ZµΩ°%/√]*)/);
  if (pmMatch) {
    const num = parseFloat(pmMatch[1]);
    const unit = pmMatch[2]?.trim() || undefined;
    return { numericValue: num, parsedUnit: unit };
  }
  const altPmMatch = trimmed.match(/^\+\/-\s*(\d+\.?\d*)\s*([a-zA-ZµΩ°%/√]*)/);
  if (altPmMatch) {
    const num = parseFloat(altPmMatch[1]);
    const unit = altPmMatch[2]?.trim() || undefined;
    return { numericValue: num, parsedUnit: unit };
  }

  // Comparison prefix: "≤150ns", "<100", ">50mA" — number + unit
  const cmpMatch = trimmed.match(/^[≤≥<>=]\s*([+-]?\d+\.?\d*)\s*([a-zA-ZµΩ°%/√]*)/);
  if (cmpMatch) {
    const num = parseFloat(cmpMatch[1]);
    const unit = cmpMatch[2]?.trim() || undefined;
    return { numericValue: num, parsedUnit: unit };
  }

  // Standard: leading number + optional unit suffix
  // Matches "400kHz", "5.8 mΩ", "8.3 mm", "100mA", and "8" (no unit)
  const stdMatch = trimmed.match(/^([+-]?\d+\.?\d*)\s*([a-zA-ZµΩ°%/√]*)/);
  if (stdMatch && stdMatch[1] !== '') {
    const num = parseFloat(stdMatch[1]);
    const unit = stdMatch[2]?.trim() || undefined;
    return { numericValue: num, parsedUnit: unit };
  }

  // Loose fallback — preserves extractNumeric's behavior for values
  // with prefix junk like "@25°C 100mA" or "Typ: 1.5MHz". Returns the
  // first number found but NO parsed unit (caller falls back to dict).
  // Without this, the new pipeline would be stricter than the old
  // extractNumeric and silently drop numericValue for these cases.
  const looseMatch = trimmed.match(/([+-]?\d+\.?\d*)/);
  if (looseMatch) {
    return { numericValue: parseFloat(looseMatch[1]) };
  }

  return {};
}

/**
 * Computes the effective unit for prefix application using the
 * value-string-parsed unit FIRST, dict-declared unit as fallback.
 *
 * This is the safety hinge of the entire unit-conversion design.
 * The dict's `unit` field is the engineer's GUESS about source units;
 * the value string is the GROUND TRUTH from the vendor. When they
 * disagree (e.g. EVISUN ships "400kHz" but dict declares unit='MHz'),
 * the value string wins.
 *
 * Returns undefined only when neither source provides a unit (e.g.
 * pure number with no dict mapping — extractNumeric fallback path).
 */
export function effectiveUnit(parsedUnit: string | undefined, dictUnit: string | undefined): string | undefined {
  return parsedUnit || dictUnit;
}

/**
 * Checks if a raw value is a "missing" placeholder.
 */
function isMissingValue(value: string): boolean {
  const trimmed = value.trim();
  return trimmed === '-' || trimmed === '/' || trimmed === '' || trimmed === 'N/A' || trimmed === 'n/a';
}

/**
 * Extracts the leading numeric value from a string.
 * Handles: "180 @ 3A with Bias", "3ppm/°C", "39dB@ 500 KH", "±10", "+/-10", "2.7~18V"
 */
export function extractNumeric(value: string): number | undefined {
  if (isMissingValue(value)) return undefined;

  const trimmed = value.trim();

  // Handle range values like "2.7~18V" or "-40~125" — take the first value
  const rangeMatch = trimmed.match(/^([+-]?\d+\.?\d*)\s*[~–]\s*([+-]?\d+\.?\d*)/);
  if (rangeMatch) return parseFloat(rangeMatch[1]);

  // Handle ± prefix: "±10" → 10, "+/-10" → 10
  const plusMinusMatch = trimmed.match(/^[±]\s*(\d+\.?\d*)/);
  if (plusMinusMatch) return parseFloat(plusMinusMatch[1]);
  const altPlusMinusMatch = trimmed.match(/^\+\/-\s*(\d+\.?\d*)/);
  if (altPlusMinusMatch) return parseFloat(altPlusMinusMatch[1]);

  // General: extract first number from string
  const numMatch = trimmed.match(/([+-]?\d+\.?\d*)/);
  if (numMatch) return parseFloat(numMatch[1]);

  return undefined;
}

/**
 * Normalizes temperature range strings.
 * "−40℃~85℃" → "-40°C to 85°C"
 * "-40℃ ~ +125℃" → "-40°C to 125°C"
 * "-40~125" → "-40°C to 125°C"
 */
function normalizeTemperatureRange(value: string): string {
  const match = value.match(/([+-−]?\d+)\s*[℃°]?\s*[C]?\s*[~–]\s*\+?([+-−]?\d+)\s*[℃°]?\s*[C]?/);
  if (match) {
    const low = match[1].replace('−', '-');
    const high = match[2].replace('−', '-');
    return `${low}°C to ${high}°C`;
  }
  return value;
}

/**
 * Normalizes a voltage range string.
 * "2.7~18V" → "2.7 V to 18 V"
 */
function normalizeVoltageRange(value: string): string {
  const match = value.match(/(\d+\.?\d*)\s*[~–]\s*(\d+\.?\d*)\s*V?/);
  if (match) {
    return `${match[1]} V to ${match[2]} V`;
  }
  return value;
}

// ─── L2 Category Standard Dictionaries ───────────────────
// Maps Chinese + English Atlas param names → L2 attribute IDs for categories
// without logic tables. Attribute IDs MUST match the L2 param maps in digikeyParamMap.ts.
// Start with common patterns; refine with real Atlas data via Explorer raw params.

const atlasL2ParamDictionaries: Record<string, Record<string, AtlasParamMapping>> = {
  Microcontrollers: {
    '内核': { attributeId: 'core_processor', attributeName: 'Core Processor', sortOrder: 1 },
    'core': { attributeId: 'core_processor', attributeName: 'Core Processor', sortOrder: 1 },
    'core processor': { attributeId: 'core_processor', attributeName: 'Core Processor', sortOrder: 1 },
    '内核位数': { attributeId: 'core_size', attributeName: 'Core Size', sortOrder: 2 },
    'core size': { attributeId: 'core_size', attributeName: 'Core Size', sortOrder: 2 },
    '主频': { attributeId: 'clock_speed', attributeName: 'Clock Speed', unit: 'Hz', sortOrder: 3 },
    '最高主频': { attributeId: 'clock_speed', attributeName: 'Clock Speed', unit: 'Hz', sortOrder: 3 },
    'clock speed': { attributeId: 'clock_speed', attributeName: 'Clock Speed', unit: 'Hz', sortOrder: 3 },
    'speed': { attributeId: 'clock_speed', attributeName: 'Clock Speed', unit: 'Hz', sortOrder: 3 },
    '程序存储器容量': { attributeId: 'program_memory_size', attributeName: 'Program Memory Size', sortOrder: 4 },
    'flash容量': { attributeId: 'program_memory_size', attributeName: 'Program Memory Size', sortOrder: 4 },
    'program memory size': { attributeId: 'program_memory_size', attributeName: 'Program Memory Size', sortOrder: 4 },
    'flash size': { attributeId: 'program_memory_size', attributeName: 'Program Memory Size', sortOrder: 4 },
    '程序存储器类型': { attributeId: 'program_memory_type', attributeName: 'Program Memory Type', sortOrder: 5 },
    'program memory type': { attributeId: 'program_memory_type', attributeName: 'Program Memory Type', sortOrder: 5 },
    '片上ram': { attributeId: 'ram_size', attributeName: 'RAM Size', sortOrder: 6 },
    'ram容量': { attributeId: 'ram_size', attributeName: 'RAM Size', sortOrder: 6 },
    'ram size': { attributeId: 'ram_size', attributeName: 'RAM Size', sortOrder: 6 },
    'sram': { attributeId: 'ram_size', attributeName: 'RAM Size', sortOrder: 6 },
    'eeprom容量': { attributeId: 'eeprom_size', attributeName: 'EEPROM Size', sortOrder: 7 },
    'eeprom size': { attributeId: 'eeprom_size', attributeName: 'EEPROM Size', sortOrder: 7 },
    '连接方式': { attributeId: 'connectivity', attributeName: 'Connectivity', sortOrder: 8 },
    'connectivity': { attributeId: 'connectivity', attributeName: 'Connectivity', sortOrder: 8 },
    '外设': { attributeId: 'peripherals', attributeName: 'Peripherals', sortOrder: 9 },
    'peripherals': { attributeId: 'peripherals', attributeName: 'Peripherals', sortOrder: 9 },
    'io数量': { attributeId: 'io_count', attributeName: 'Number of I/O', sortOrder: 10 },
    'io数': { attributeId: 'io_count', attributeName: 'Number of I/O', sortOrder: 10 },
    'number of i/o': { attributeId: 'io_count', attributeName: 'Number of I/O', sortOrder: 10 },
    'gpio': { attributeId: 'io_count', attributeName: 'Number of I/O', sortOrder: 10 },
    '数据转换器': { attributeId: 'data_converters', attributeName: 'Data Converters', sortOrder: 11 },
    'data converters': { attributeId: 'data_converters', attributeName: 'Data Converters', sortOrder: 11 },
    '振荡器类型': { attributeId: 'oscillator_type', attributeName: 'Oscillator Type', sortOrder: 12 },
    'oscillator type': { attributeId: 'oscillator_type', attributeName: 'Oscillator Type', sortOrder: 12 },
    '供电电压': { attributeId: 'supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 13 },
    '工作电压': { attributeId: 'supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 13 },
    'supply voltage': { attributeId: 'supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 13 },
    'voltage - supply (vcc/vdd)': { attributeId: 'supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 13 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temp Range', sortOrder: 14 },
    'operating temperature': { attributeId: 'operating_temp', attributeName: 'Operating Temp Range', sortOrder: 14 },
    '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 15 },
    'package': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 15 },
    'package / case': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 15 },
  },
  Memory: {
    '存储器类型': { attributeId: 'memory_type', attributeName: 'Memory Type', sortOrder: 1 },
    '类型': { attributeId: 'memory_type', attributeName: 'Memory Type', sortOrder: 1 },
    'memory type': { attributeId: 'memory_type', attributeName: 'Memory Type', sortOrder: 1 },
    '存储器格式': { attributeId: 'memory_format', attributeName: 'Memory Format', sortOrder: 2 },
    '格式': { attributeId: 'memory_format', attributeName: 'Memory Format', sortOrder: 2 },
    'memory format': { attributeId: 'memory_format', attributeName: 'Memory Format', sortOrder: 2 },
    '技术': { attributeId: 'memory_technology', attributeName: 'Technology', sortOrder: 3 },
    'technology': { attributeId: 'memory_technology', attributeName: 'Technology', sortOrder: 3 },
    '存储容量': { attributeId: 'memory_size', attributeName: 'Memory Size', sortOrder: 4 },
    '容量': { attributeId: 'memory_size', attributeName: 'Memory Size', sortOrder: 4 },
    'memory size': { attributeId: 'memory_size', attributeName: 'Memory Size', sortOrder: 4 },
    'capacity': { attributeId: 'memory_size', attributeName: 'Memory Size', sortOrder: 4 },
    '存储器组织': { attributeId: 'memory_organization', attributeName: 'Memory Organization', sortOrder: 5 },
    '架构': { attributeId: 'memory_organization', attributeName: 'Memory Organization', sortOrder: 5 },
    '组织': { attributeId: 'memory_organization', attributeName: 'Memory Organization', sortOrder: 5 },
    'memory organization': { attributeId: 'memory_organization', attributeName: 'Memory Organization', sortOrder: 5 },
    '接口': { attributeId: 'memory_interface', attributeName: 'Interface', sortOrder: 6 },
    '接口类型': { attributeId: 'memory_interface', attributeName: 'Interface', sortOrder: 6 },
    'memory interface': { attributeId: 'memory_interface', attributeName: 'Interface', sortOrder: 6 },
    'interface': { attributeId: 'memory_interface', attributeName: 'Interface', sortOrder: 6 },
    '时钟频率': { attributeId: 'clock_frequency', attributeName: 'Clock Frequency', unit: 'Hz', sortOrder: 7 },
    '速率': { attributeId: 'clock_frequency', attributeName: 'Clock Frequency', unit: 'Hz', sortOrder: 7 },
    '频率': { attributeId: 'clock_frequency', attributeName: 'Clock Frequency', unit: 'Hz', sortOrder: 7 },
    '频率(mhz)': { attributeId: 'clock_frequency', attributeName: 'Clock Frequency', unit: 'MHz', sortOrder: 7 },
    'clock frequency': { attributeId: 'clock_frequency', attributeName: 'Clock Frequency', unit: 'Hz', sortOrder: 7 },
    'speed': { attributeId: 'clock_frequency', attributeName: 'Clock Frequency', unit: 'Hz', sortOrder: 7 },
    '写周期时间': { attributeId: 'write_cycle_time', attributeName: 'Write Cycle Time', sortOrder: 8 },
    'write cycle time': { attributeId: 'write_cycle_time', attributeName: 'Write Cycle Time', sortOrder: 8 },
    '访问时间': { attributeId: 'access_time', attributeName: 'Access Time', sortOrder: 9 },
    'access time': { attributeId: 'access_time', attributeName: 'Access Time', sortOrder: 9 },
    '供电电压': { attributeId: 'supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 10 },
    '工作电压': { attributeId: 'supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 10 },
    '电压': { attributeId: 'supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 10 },
    'supply voltage': { attributeId: 'supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 10 },
    'voltage': { attributeId: 'supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 10 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temp Range', sortOrder: 11 },
    '温度': { attributeId: 'operating_temp', attributeName: 'Operating Temp Range', sortOrder: 11 },
    'operating temperature': { attributeId: 'operating_temp', attributeName: 'Operating Temp Range', sortOrder: 11 },
    'temperature': { attributeId: 'operating_temp', attributeName: 'Operating Temp Range', sortOrder: 11 },
    '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 12 },
    '主要封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 12 },
    'package': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 12 },
  },
  Sensors: {
    '传感器类型': { attributeId: 'sensor_type', attributeName: 'Sensor Type', sortOrder: 1 },
    'sensor type': { attributeId: 'sensor_type', attributeName: 'Sensor Type', sortOrder: 1 },
    '测量': { attributeId: 'measuring', attributeName: 'Measuring', sortOrder: 2 },
    '输出类型': { attributeId: 'output_type', attributeName: 'Output Type / Interface', sortOrder: 3 },
    'output type': { attributeId: 'output_type', attributeName: 'Output Type / Interface', sortOrder: 3 },
    '精度': { attributeId: 'accuracy', attributeName: 'Accuracy', sortOrder: 5 },
    'accuracy': { attributeId: 'accuracy', attributeName: 'Accuracy', sortOrder: 5 },
    '灵敏度': { attributeId: 'sensitivity', attributeName: 'Sensitivity', sortOrder: 6 },
    'sensitivity': { attributeId: 'sensitivity', attributeName: 'Sensitivity', sortOrder: 6 },
    '轴': { attributeId: 'axis', attributeName: 'Axis', sortOrder: 8 },
    'axis': { attributeId: 'axis', attributeName: 'Axis', sortOrder: 8 },
    '测量范围': { attributeId: 'measurement_range', attributeName: 'Measurement Range', sortOrder: 9 },
    '带宽': { attributeId: 'bandwidth', attributeName: 'Bandwidth', unit: 'Hz', sortOrder: 12 },
    'bandwidth': { attributeId: 'bandwidth', attributeName: 'Bandwidth', unit: 'Hz', sortOrder: 12 },
    '响应时间': { attributeId: 'response_time', attributeName: 'Response Time', sortOrder: 13 },
    'response time': { attributeId: 'response_time', attributeName: 'Response Time', sortOrder: 13 },
    '频率': { attributeId: 'frequency', attributeName: 'Frequency', unit: 'Hz', sortOrder: 14 },
    // Optical-sensor-specific (Phototransistors live here; Photodiodes
    // actually route to LEDs and Optoelectronics via the 'photodiode'
    // substring rule, NOT here).
    '峰值波长': { attributeId: 'wavelength_peak', attributeName: 'Wavelength (Peak)', unit: 'nm', sortOrder: 14 },
    'peak wavelength': { attributeId: 'wavelength_peak', attributeName: 'Wavelength (Peak)', unit: 'nm', sortOrder: 14 },
    // 反向电压 stays in Sensors for Phototransistor coverage even though
    // Photodiodes are handled by the LED L2 dict.
    '反向电压': { attributeId: 'reverse_voltage', attributeName: 'Reverse Voltage', unit: 'V', sortOrder: 15 },
    'reverse voltage': { attributeId: 'reverse_voltage', attributeName: 'Reverse Voltage', unit: 'V', sortOrder: 15 },
    // Operating current — for Optical Motion Sensors (IR proximity etc.).
    // New canonical, distinct from supply_voltage.
    '工作电流': { attributeId: 'supply_current', attributeName: 'Supply Current', unit: 'mA', sortOrder: 17 },
    '通道数': { attributeId: 'channel_count', attributeName: 'Number of Channels', sortOrder: 16 },
    '供电电压': { attributeId: 'supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 17 },
    '工作电压': { attributeId: 'supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 17 },
    'supply voltage': { attributeId: 'supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 17 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temp Range', sortOrder: 18 },
    'operating temperature': { attributeId: 'operating_temp', attributeName: 'Operating Temp Range', sortOrder: 18 },
    '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 19 },
    'package': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 19 },
  },
  Connectors: {
    '连接器类型': { attributeId: 'connector_type', attributeName: 'Connector Type', sortOrder: 1 },
    'connector type': { attributeId: 'connector_type', attributeName: 'Connector Type', sortOrder: 1 },
    '触点类型': { attributeId: 'contact_type', attributeName: 'Contact Type', sortOrder: 2 },
    'contact type': { attributeId: 'contact_type', attributeName: 'Contact Type', sortOrder: 2 },
    '针脚数': { attributeId: 'positions', attributeName: 'Number of Positions', sortOrder: 3 },
    'pin数': { attributeId: 'positions', attributeName: 'Number of Positions', sortOrder: 3 },
    '端口数': { attributeId: 'positions', attributeName: 'Number of Positions', sortOrder: 3 },
    '引脚数': { attributeId: 'positions', attributeName: 'Number of Positions', sortOrder: 3 },
    'number of positions': { attributeId: 'positions', attributeName: 'Number of Positions', sortOrder: 3 },
    '行数': { attributeId: 'rows', attributeName: 'Number of Rows', sortOrder: 4 },
    '排数': { attributeId: 'rows', attributeName: 'Number of Rows', sortOrder: 4 },
    '间距': { attributeId: 'pitch', attributeName: 'Pitch', sortOrder: 5 },
    '脚间距': { attributeId: 'pitch', attributeName: 'Pitch', sortOrder: 5 },
    'pitch': { attributeId: 'pitch', attributeName: 'Pitch', sortOrder: 5 },
    '触头镀层': { attributeId: 'contact_finish', attributeName: 'Contact Finish', sortOrder: 6 },
    'contact finish': { attributeId: 'contact_finish', attributeName: 'Contact Finish', sortOrder: 6 },
    '安装类型': { attributeId: 'mounting_type', attributeName: 'Mounting Type', sortOrder: 7 },
    'mounting type': { attributeId: 'mounting_type', attributeName: 'Mounting Type', sortOrder: 7 },
    '高度': { attributeId: 'height_above_board', attributeName: 'Height Above Board', unit: 'mm', sortOrder: 8 },
    '额定电流': { attributeId: 'current_rating', attributeName: 'Current Rating', unit: 'A', sortOrder: 10 },
    'current rating': { attributeId: 'current_rating', attributeName: 'Current Rating', unit: 'A', sortOrder: 10 },
    '额定电压': { attributeId: 'voltage_rating', attributeName: 'Voltage Rating', unit: 'V', sortOrder: 11 },
    'voltage rating': { attributeId: 'voltage_rating', attributeName: 'Voltage Rating', unit: 'V', sortOrder: 11 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temp Range', sortOrder: 12 },
    '工作温度范围': { attributeId: 'operating_temp', attributeName: 'Operating Temp Range', sortOrder: 12 },
    '适用温度': { attributeId: 'operating_temp', attributeName: 'Operating Temp Range', sortOrder: 12 },
    'operating temperature': { attributeId: 'operating_temp', attributeName: 'Operating Temp Range', sortOrder: 12 },
  },
  'LEDs and Optoelectronics': {
    '颜色': { attributeId: 'color', attributeName: 'Color', sortOrder: 1 },
    'color': { attributeId: 'color', attributeName: 'Color', sortOrder: 1 },
    // Synonym used by Everlight (亿光) for color
    '发光颜色': { attributeId: 'color', attributeName: 'Color', sortOrder: 1 },
    'led color': { attributeId: 'color', attributeName: 'Color', sortOrder: 1 },
    '波长': { attributeId: 'wavelength_dominant', attributeName: 'Wavelength (Dominant)', unit: 'nm', sortOrder: 3 },
    '主波长': { attributeId: 'wavelength_dominant', attributeName: 'Wavelength (Dominant)', unit: 'nm', sortOrder: 3 },
    'wavelength': { attributeId: 'wavelength_dominant', attributeName: 'Wavelength (Dominant)', unit: 'nm', sortOrder: 3 },
    // Peak wavelength is a distinct canonical from dominant — Digikey LED L2
    // map at digikeyParamMap.ts:5406 keeps them separate.
    '峰值波长': { attributeId: 'wavelength_peak', attributeName: 'Wavelength (Peak)', unit: 'nm', sortOrder: 4 },
    'peak wavelength': { attributeId: 'wavelength_peak', attributeName: 'Wavelength (Peak)', unit: 'nm', sortOrder: 4 },
    '光强': { attributeId: 'luminous_intensity', attributeName: 'Luminous Intensity', unit: 'mcd', sortOrder: 5 },
    '发光强度': { attributeId: 'luminous_intensity', attributeName: 'Luminous Intensity', unit: 'mcd', sortOrder: 5 },
    'luminous intensity': { attributeId: 'luminous_intensity', attributeName: 'Luminous Intensity', unit: 'mcd', sortOrder: 5 },
    '视角': { attributeId: 'viewing_angle', attributeName: 'Viewing Angle', sortOrder: 6 },
    'viewing angle': { attributeId: 'viewing_angle', attributeName: 'Viewing Angle', sortOrder: 6 },
    // Synonym used by Everlight (亿光) for viewing angle
    '发光角度': { attributeId: 'viewing_angle', attributeName: 'Viewing Angle', sortOrder: 6 },
    'emission angle': { attributeId: 'viewing_angle', attributeName: 'Viewing Angle', sortOrder: 6 },
    '正向电压': { attributeId: 'forward_voltage', attributeName: 'Forward Voltage (Vf)', unit: 'V', sortOrder: 7 },
    '正向压降': { attributeId: 'forward_voltage', attributeName: 'Forward Voltage (Vf)', unit: 'V', sortOrder: 7 },
    'forward voltage': { attributeId: 'forward_voltage', attributeName: 'Forward Voltage (Vf)', unit: 'V', sortOrder: 7 },
    // Suffix-tagged variant used by Everlight ('正向电压(VF)' lowercased)
    '正向电压(vf)': { attributeId: 'forward_voltage', attributeName: 'Forward Voltage (Vf)', unit: 'V', sortOrder: 7 },
    '测试电流': { attributeId: 'test_current', attributeName: 'Test Current', unit: 'mA', sortOrder: 8 },
    'test current': { attributeId: 'test_current', attributeName: 'Test Current', unit: 'mA', sortOrder: 8 },
    // Lens color — already a canonical in digikeyParamMap.ts:5435.
    '透镜颜色': { attributeId: 'lens_color', attributeName: 'Lens Color', sortOrder: 9 },
    'lens color': { attributeId: 'lens_color', attributeName: 'Lens Color', sortOrder: 9 },
    '安装类型': { attributeId: 'mounting_type', attributeName: 'Mounting Type', sortOrder: 11 },
    'mounting type': { attributeId: 'mounting_type', attributeName: 'Mounting Type', sortOrder: 11 },
    '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 12 },
    'package': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 12 },
    // Forward Current (If) — LED operating current. Distinct from B1's
    // io_avg (Average Forward Current) which is for power rectifier diodes;
    // for LEDs the relevant spec is the rated forward current at a defined
    // luminous intensity. New canonical because no logic-table family models
    // LEDs explicitly today.
    '正向电流': { attributeId: 'forward_current', attributeName: 'Forward Current (If)', unit: 'mA', sortOrder: 13 },
    'forward current': { attributeId: 'forward_current', attributeName: 'Forward Current (If)', unit: 'mA', sortOrder: 13 },
    // Synonym used by Everlight on a small subset of LED products
    '工作电流': { attributeId: 'forward_current', attributeName: 'Forward Current (If)', unit: 'mA', sortOrder: 13 },
    // Reverse voltage — Photodiodes route to LEDs and Optoelectronics via the
    // 'photodiode' substring rule (NOT to Sensors), so they need 反向电压 here.
    '反向电压': { attributeId: 'reverse_voltage_v', attributeName: 'Reverse Voltage', unit: 'V', sortOrder: 19 },
    'reverse voltage': { attributeId: 'reverse_voltage_v', attributeName: 'Reverse Voltage', unit: 'V', sortOrder: 19 },
    // Color temperature — relevant for white LEDs (warm/cool white).
    // New canonical.
    '色温': { attributeId: 'color_temperature', attributeName: 'Color Temperature', unit: 'K', sortOrder: 14 },
    'color temperature': { attributeId: 'color_temperature', attributeName: 'Color Temperature', unit: 'K', sortOrder: 14 },
    // Power dissipation — already a canonical at atlasMapper.ts:584. Unit W
    // (matching engine's existing unit); LEDs typically report 0.06W, 0.2W, etc.
    '功率': { attributeId: 'power_dissipation', attributeName: 'Power Dissipation', unit: 'W', sortOrder: 15 },
    // Lamp base type — physical socket/header style (E27, GU10, T1, etc.).
    // New canonical for through-hole / lamp-format LEDs.
    '灯头类型': { attributeId: 'lamp_base_type', attributeName: 'Lamp Base Type', sortOrder: 16 },
    // Diode configuration — array layout, common-anode vs common-cathode.
    // Reuses existing 'configuration' canonical (atlasMapper.ts:295/682/736).
    '二极管配置': { attributeId: 'configuration', attributeName: 'Configuration', sortOrder: 17 },
    'diode configuration': { attributeId: 'configuration', attributeName: 'Configuration', sortOrder: 17 },
    // Operating temperature — uses the established 'operating_temp' canonical
    // (NOT 'operating_temperature'), consistent with 19+ usages elsewhere
    // in atlasMapper.ts.
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 18 },
    'operating temperature': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 18 },
  },
  Switches: {
    '电路': { attributeId: 'circuit', attributeName: 'Circuit', sortOrder: 1 },
    'circuit': { attributeId: 'circuit', attributeName: 'Circuit', sortOrder: 1 },
    '触点形式': { attributeId: 'circuit', attributeName: 'Circuit', sortOrder: 1 },
    '开关功能': { attributeId: 'switch_function', attributeName: 'Switch Function', sortOrder: 2 },
    'switch function': { attributeId: 'switch_function', attributeName: 'Switch Function', sortOrder: 2 },
    '触点额定值': { attributeId: 'contact_rating', attributeName: 'Contact Rating', sortOrder: 3 },
    'contact rating': { attributeId: 'contact_rating', attributeName: 'Contact Rating', sortOrder: 3 },
    '执行器类型': { attributeId: 'actuator_type', attributeName: 'Actuator Type', sortOrder: 4 },
    'actuator type': { attributeId: 'actuator_type', attributeName: 'Actuator Type', sortOrder: 4 },
    '按动力': { attributeId: 'operating_force', attributeName: 'Operating Force', sortOrder: 6 },
    '操作力': { attributeId: 'operating_force', attributeName: 'Operating Force', sortOrder: 6 },
    'operating force': { attributeId: 'operating_force', attributeName: 'Operating Force', sortOrder: 6 },
    '照明': { attributeId: 'illumination', attributeName: 'Illumination', sortOrder: 7 },
    'illumination': { attributeId: 'illumination', attributeName: 'Illumination', sortOrder: 7 },
    '安装类型': { attributeId: 'mounting_type', attributeName: 'Mounting Type', sortOrder: 8 },
    'mounting type': { attributeId: 'mounting_type', attributeName: 'Mounting Type', sortOrder: 8 },
    '长x宽/尺寸': { attributeId: 'outline', attributeName: 'Dimensions', sortOrder: 9 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temp Range', sortOrder: 10 },
    'operating temperature': { attributeId: 'operating_temp', attributeName: 'Operating Temp Range', sortOrder: 10 },
    // Sub-family specific params (DIP, Rocker/Toggle)
    '额定电流-dc': { attributeId: 'current_rating', attributeName: 'Current Rating', unit: 'A', sortOrder: 11 },
    '额定电流': { attributeId: 'current_rating', attributeName: 'Current Rating', unit: 'A', sortOrder: 11 },
    'current rating': { attributeId: 'current_rating', attributeName: 'Current Rating', unit: 'A', sortOrder: 11 },
    '额定电压-dc': { attributeId: 'voltage_rating_dc', attributeName: 'Voltage Rating (DC)', unit: 'V', sortOrder: 12 },
    'voltage rating dc': { attributeId: 'voltage_rating_dc', attributeName: 'Voltage Rating (DC)', unit: 'V', sortOrder: 12 },
    '额定电压-ac': { attributeId: 'voltage_rating_ac', attributeName: 'Voltage Rating (AC)', unit: 'V', sortOrder: 13 },
    'voltage rating ac': { attributeId: 'voltage_rating_ac', attributeName: 'Voltage Rating (AC)', unit: 'V', sortOrder: 13 },
    '触头镀层': { attributeId: 'contact_finish', attributeName: 'Contact Finish', sortOrder: 14 },
    'contact finish': { attributeId: 'contact_finish', attributeName: 'Contact Finish', sortOrder: 14 },
    '颜色-盖帽': { attributeId: 'illumination_color', attributeName: 'Cap Color', sortOrder: 15 },
    '开关位数': { attributeId: 'num_positions', attributeName: 'Number of Positions', sortOrder: 16 },
    'number of positions': { attributeId: 'num_positions', attributeName: 'Number of Positions', sortOrder: 16 },
    '高度': { attributeId: 'actuator_height', attributeName: 'Height', unit: 'mm', sortOrder: 17 },
  },
  'RF and Wireless': {
    '类型': { attributeId: 'type', attributeName: 'Type', sortOrder: 1 },
    'type': { attributeId: 'type', attributeName: 'Type', sortOrder: 1 },
    '协议': { attributeId: 'protocol', attributeName: 'Protocol', sortOrder: 3 },
    'protocol': { attributeId: 'protocol', attributeName: 'Protocol', sortOrder: 3 },
    '调制方式': { attributeId: 'modulation', attributeName: 'Modulation', sortOrder: 4 },
    'modulation': { attributeId: 'modulation', attributeName: 'Modulation', sortOrder: 4 },
    '频率': { attributeId: 'frequency', attributeName: 'Frequency', unit: 'Hz', sortOrder: 5 },
    'frequency': { attributeId: 'frequency', attributeName: 'Frequency', unit: 'Hz', sortOrder: 5 },
    '数据速率': { attributeId: 'data_rate_max', attributeName: 'Data Rate (Max)', sortOrder: 8 },
    'data rate': { attributeId: 'data_rate_max', attributeName: 'Data Rate (Max)', sortOrder: 8 },
    '输出功率': { attributeId: 'output_power', attributeName: 'Output Power', sortOrder: 9 },
    'output power': { attributeId: 'output_power', attributeName: 'Output Power', sortOrder: 9 },
    // Explicit Max/Min variants — followed the existing `_max` convention
    // used in this dict (data_rate_max line 2047) and Power Supplies
    // (output_current_max line 2072). For RF modules with Max + Min spec
    // pairs (e.g. SIMCOM cellular conducted_rf_output_power-Max/Min),
    // these preserve both values instead of collapsing onto `output_power`
    // and losing one. L2-only — display in parts lists; no matching-engine
    // participation (no L3 RF-modules family today).
    '输出功率(最大)': { attributeId: 'output_power_max', attributeName: 'Output Power (Max)', sortOrder: 9 },
    '输出功率(最小)': { attributeId: 'output_power_min', attributeName: 'Output Power (Min)', sortOrder: 9 },
    '最大输出功率': { attributeId: 'output_power_max', attributeName: 'Output Power (Max)', sortOrder: 9 },
    '最小输出功率': { attributeId: 'output_power_min', attributeName: 'Output Power (Min)', sortOrder: 9 },
    'output power (max)': { attributeId: 'output_power_max', attributeName: 'Output Power (Max)', sortOrder: 9 },
    'output power (min)': { attributeId: 'output_power_min', attributeName: 'Output Power (Min)', sortOrder: 9 },
    'max output power': { attributeId: 'output_power_max', attributeName: 'Output Power (Max)', sortOrder: 9 },
    'min output power': { attributeId: 'output_power_min', attributeName: 'Output Power (Min)', sortOrder: 9 },
    '灵敏度': { attributeId: 'sensitivity', attributeName: 'Sensitivity', sortOrder: 10 },
    'sensitivity': { attributeId: 'sensitivity', attributeName: 'Sensitivity', sortOrder: 10 },
    // Cellular-module sensitivity variants. Real datasheets specify
    // receiver sensitivity per (cellular technology, test methodology,
    // statistic) tuple — collapsing them onto a single `sensitivity`
    // canonical silently overwrites all but one value per product on
    // ingest. These explicit canonicals preserve the distinctions so
    // engineers can compare products on the spec they actually care
    // about. As more cellular MFRs/bands surface in ingests, extend this
    // block (Cat-M1, GSM, LTE B1–B40, etc.). L2 — display only; no
    // matching impact until a Cellular Modules L3 family is stood up.
    'cat-nb1 reference sensitivity (max)': { attributeId: 'sensitivity_cat_nb1_max', attributeName: 'Sensitivity (Cat-NB1, Max)', unit: 'dBm', sortOrder: 10 },
    'cat-nb1 reference sensitivity (typ)': { attributeId: 'sensitivity_cat_nb1_typ', attributeName: 'Sensitivity (Cat-NB1, Typ)', unit: 'dBm', sortOrder: 10 },
    'cat-nb1 reference sensitivity (typical)': { attributeId: 'sensitivity_cat_nb1_typ', attributeName: 'Sensitivity (Cat-NB1, Typ)', unit: 'dBm', sortOrder: 10 },
    'conducted receiver sensitivity (max)': { attributeId: 'sensitivity_conducted_max', attributeName: 'Sensitivity (Conducted, Max)', unit: 'dBm', sortOrder: 10 },
    'conducted receiver sensitivity (typ)': { attributeId: 'sensitivity_conducted_typ', attributeName: 'Sensitivity (Conducted, Typ)', unit: 'dBm', sortOrder: 10 },
    'conducted receiver sensitivity (typical)': { attributeId: 'sensitivity_conducted_typ', attributeName: 'Sensitivity (Conducted, Typ)', unit: 'dBm', sortOrder: 10 },
    '增益': { attributeId: 'gain', attributeName: 'Gain', sortOrder: 11 },
    'gain': { attributeId: 'gain', attributeName: 'Gain', sortOrder: 11 },
    '供电电压': { attributeId: 'supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 14 },
    '工作电压': { attributeId: 'supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 14 },
    'supply voltage': { attributeId: 'supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 14 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temp Range', sortOrder: 15 },
    'operating temperature': { attributeId: 'operating_temp', attributeName: 'Operating Temp Range', sortOrder: 15 },
  },
  'Power Supplies': {
    '类型': { attributeId: 'type', attributeName: 'Type', sortOrder: 1 },
    'type': { attributeId: 'type', attributeName: 'Type', sortOrder: 1 },
    '输出路数': { attributeId: 'num_outputs', attributeName: 'Number of Outputs', sortOrder: 2 },
    '输出端数': { attributeId: 'num_outputs', attributeName: 'Number of Outputs', sortOrder: 2 },
    'number of outputs': { attributeId: 'num_outputs', attributeName: 'Number of Outputs', sortOrder: 2 },
    '输入电压': { attributeId: 'input_voltage', attributeName: 'Input Voltage', unit: 'V', sortOrder: 3 },
    '供电电压': { attributeId: 'input_voltage', attributeName: 'Input Voltage', unit: 'V', sortOrder: 3 },
    'input voltage': { attributeId: 'input_voltage', attributeName: 'Input Voltage', unit: 'V', sortOrder: 3 },
    '输出电压': { attributeId: 'output_voltage', attributeName: 'Output Voltage', unit: 'V', sortOrder: 6 },
    'output voltage': { attributeId: 'output_voltage', attributeName: 'Output Voltage', unit: 'V', sortOrder: 6 },
    '输出电流': { attributeId: 'output_current_max', attributeName: 'Output Current (Max)', unit: 'A', sortOrder: 7 },
    'output current': { attributeId: 'output_current_max', attributeName: 'Output Current (Max)', unit: 'A', sortOrder: 7 },
    '功率': { attributeId: 'power_watts', attributeName: 'Power', unit: 'W', sortOrder: 8 },
    '额定功率': { attributeId: 'power_watts', attributeName: 'Power', unit: 'W', sortOrder: 8 },
    '输出功率': { attributeId: 'power_watts', attributeName: 'Power', unit: 'W', sortOrder: 8 },
    'power': { attributeId: 'power_watts', attributeName: 'Power', unit: 'W', sortOrder: 8 },
    '隔离电压': { attributeId: 'isolation_voltage', attributeName: 'Isolation Voltage', sortOrder: 9 },
    'isolation voltage': { attributeId: 'isolation_voltage', attributeName: 'Isolation Voltage', sortOrder: 9 },
    '效率': { attributeId: 'efficiency', attributeName: 'Efficiency', sortOrder: 10 },
    '效率(typ)': { attributeId: 'efficiency', attributeName: 'Efficiency', sortOrder: 10 },
    'efficiency': { attributeId: 'efficiency', attributeName: 'Efficiency', sortOrder: 10 },
    '开关频率': { attributeId: 'switching_frequency', attributeName: 'Switching Frequency', sortOrder: 5 },
    'switching frequency': { attributeId: 'switching_frequency', attributeName: 'Switching Frequency', sortOrder: 5 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temp Range', sortOrder: 11 },
    'operating temperature': { attributeId: 'operating_temp', attributeName: 'Operating Temp Range', sortOrder: 11 },
    '安装类型': { attributeId: 'mounting_type', attributeName: 'Mounting Type', sortOrder: 12 },
    'mounting type': { attributeId: 'mounting_type', attributeName: 'Mounting Type', sortOrder: 12 },
    '高度': { attributeId: 'height', attributeName: 'Height', unit: 'mm', sortOrder: 13 },
  },
  Transformers: {
    '类型': { attributeId: 'type', attributeName: 'Type', sortOrder: 1 },
    'type': { attributeId: 'type', attributeName: 'Type', sortOrder: 1 },
    '变压器类型': { attributeId: 'transformer_type', attributeName: 'Transformer Type', sortOrder: 2 },
    '匝比': { attributeId: 'turns_ratio', attributeName: 'Turns Ratio', sortOrder: 3 },
    'turns ratio': { attributeId: 'turns_ratio', attributeName: 'Turns Ratio', sortOrder: 3 },
    '初级电压': { attributeId: 'primary_voltage', attributeName: 'Primary Voltage', unit: 'V', sortOrder: 4 },
    'primary voltage': { attributeId: 'primary_voltage', attributeName: 'Primary Voltage', unit: 'V', sortOrder: 4 },
    '隔离电压': { attributeId: 'isolation_voltage', attributeName: 'Isolation Voltage', sortOrder: 5 },
    'isolation voltage': { attributeId: 'isolation_voltage', attributeName: 'Isolation Voltage', sortOrder: 5 },
    '电感': { attributeId: 'inductance', attributeName: 'Inductance', sortOrder: 6 },
    'inductance': { attributeId: 'inductance', attributeName: 'Inductance', sortOrder: 6 },
    '频率': { attributeId: 'frequency', attributeName: 'Frequency', unit: 'Hz', sortOrder: 8 },
    'frequency': { attributeId: 'frequency', attributeName: 'Frequency', unit: 'Hz', sortOrder: 8 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temp Range', sortOrder: 9 },
    'operating temperature': { attributeId: 'operating_temp', attributeName: 'Operating Temp Range', sortOrder: 9 },
    '安装类型': { attributeId: 'mounting_type', attributeName: 'Mounting Type', sortOrder: 10 },
    'mounting type': { attributeId: 'mounting_type', attributeName: 'Mounting Type', sortOrder: 10 },
  },
  Filters: {
    '类型': { attributeId: 'type', attributeName: 'Type', sortOrder: 1 },
    'type': { attributeId: 'type', attributeName: 'Type', sortOrder: 1 },
    '滤波器阶数': { attributeId: 'filter_order', attributeName: 'Filter Order', sortOrder: 2 },
    'filter order': { attributeId: 'filter_order', attributeName: 'Filter Order', sortOrder: 2 },
    '技术': { attributeId: 'technology', attributeName: 'Technology', sortOrder: 3 },
    '通道数': { attributeId: 'channel_count', attributeName: 'Number of Channels', sortOrder: 4 },
    '截止频率': { attributeId: 'cutoff_frequency', attributeName: 'Cutoff Frequency', unit: 'Hz', sortOrder: 5 },
    'cutoff frequency': { attributeId: 'cutoff_frequency', attributeName: 'Cutoff Frequency', unit: 'Hz', sortOrder: 5 },
    '衰减': { attributeId: 'attenuation', attributeName: 'Attenuation', sortOrder: 6 },
    'attenuation': { attributeId: 'attenuation', attributeName: 'Attenuation', sortOrder: 6 },
    '插入损耗': { attributeId: 'insertion_loss', attributeName: 'Insertion Loss', sortOrder: 7 },
    'insertion loss': { attributeId: 'insertion_loss', attributeName: 'Insertion Loss', sortOrder: 7 },
    '额定电流': { attributeId: 'current_rating', attributeName: 'Current Rating', unit: 'A', sortOrder: 8 },
    'current rating': { attributeId: 'current_rating', attributeName: 'Current Rating', unit: 'A', sortOrder: 8 },
    '额定电压': { attributeId: 'voltage_rated', attributeName: 'Voltage Rating', unit: 'V', sortOrder: 9 },
    'voltage rating': { attributeId: 'voltage_rated', attributeName: 'Voltage Rating', unit: 'V', sortOrder: 9 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temp Range', sortOrder: 10 },
    'operating temperature': { attributeId: 'operating_temp', attributeName: 'Operating Temp Range', sortOrder: 10 },
    '安装类型': { attributeId: 'mounting_type', attributeName: 'Mounting Type', sortOrder: 11 },
    '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 12 },
    'package': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 12 },
  },
  Processors: {
    '可编程类型': { attributeId: 'programmable_type', attributeName: 'Programmable Type', sortOrder: 1 },
    'programmable type': { attributeId: 'programmable_type', attributeName: 'Programmable Type', sortOrder: 1 },
    '逻辑单元数': { attributeId: 'logic_elements', attributeName: 'Logic Elements/Cells', sortOrder: 3 },
    'logic elements': { attributeId: 'logic_elements', attributeName: 'Logic Elements/Cells', sortOrder: 3 },
    'ram容量': { attributeId: 'total_ram', attributeName: 'Total RAM Bits', sortOrder: 6 },
    'total ram bits': { attributeId: 'total_ram', attributeName: 'Total RAM Bits', sortOrder: 6 },
    'io数量': { attributeId: 'io_count', attributeName: 'Number of I/O', sortOrder: 7 },
    'number of i/o': { attributeId: 'io_count', attributeName: 'Number of I/O', sortOrder: 7 },
    '供电电压': { attributeId: 'supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 9 },
    '工作电压': { attributeId: 'supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 9 },
    'supply voltage': { attributeId: 'supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 9 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temp Range', sortOrder: 11 },
    'operating temperature': { attributeId: 'operating_temp', attributeName: 'Operating Temp Range', sortOrder: 11 },
    '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 12 },
    'package': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 12 },
  },
  Audio: {
    '类型': { attributeId: 'type', attributeName: 'Type', sortOrder: 1 },
    'type': { attributeId: 'type', attributeName: 'Type', sortOrder: 1 },
    '频率': { attributeId: 'frequency', attributeName: 'Frequency', unit: 'Hz', sortOrder: 4 },
    'frequency': { attributeId: 'frequency', attributeName: 'Frequency', unit: 'Hz', sortOrder: 4 },
    '频率范围': { attributeId: 'frequency_range', attributeName: 'Frequency Range', sortOrder: 5 },
    'frequency range': { attributeId: 'frequency_range', attributeName: 'Frequency Range', sortOrder: 5 },
    '阻抗': { attributeId: 'impedance', attributeName: 'Impedance', unit: 'Ohm', sortOrder: 6 },
    'impedance': { attributeId: 'impedance', attributeName: 'Impedance', unit: 'Ohm', sortOrder: 6 },
    '声压级': { attributeId: 'spl', attributeName: 'Sound Pressure Level', sortOrder: 7 },
    'sound pressure level': { attributeId: 'spl', attributeName: 'Sound Pressure Level', sortOrder: 7 },
    '灵敏度': { attributeId: 'sensitivity', attributeName: 'Sensitivity', sortOrder: 8 },
    'sensitivity': { attributeId: 'sensitivity', attributeName: 'Sensitivity', sortOrder: 8 },
    '输出类型': { attributeId: 'output_type', attributeName: 'Output Type', sortOrder: 10 },
    'output type': { attributeId: 'output_type', attributeName: 'Output Type', sortOrder: 10 },
    '额定功率': { attributeId: 'power_rated', attributeName: 'Rated Power', unit: 'W', sortOrder: 11 },
    'rated power': { attributeId: 'power_rated', attributeName: 'Rated Power', unit: 'W', sortOrder: 11 },
    '额定电压': { attributeId: 'voltage_rated', attributeName: 'Rated Voltage', sortOrder: 12 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temp Range', sortOrder: 14 },
    'operating temperature': { attributeId: 'operating_temp', attributeName: 'Operating Temp Range', sortOrder: 14 },
    '安装类型': { attributeId: 'mounting_type', attributeName: 'Mounting Type', sortOrder: 15 },
    'mounting type': { attributeId: 'mounting_type', attributeName: 'Mounting Type', sortOrder: 15 },
  },
  'Battery Products': {
    '电池化学成分': { attributeId: 'chemistry', attributeName: 'Chemistry', sortOrder: 1 },
    'battery chemistry': { attributeId: 'chemistry', attributeName: 'Chemistry', sortOrder: 1 },
    '电池尺寸': { attributeId: 'cell_size', attributeName: 'Cell Size', sortOrder: 2 },
    'cell size': { attributeId: 'cell_size', attributeName: 'Cell Size', sortOrder: 2 },
    '额定电压': { attributeId: 'voltage_rated', attributeName: 'Rated Voltage', unit: 'V', sortOrder: 3 },
    '标称电压': { attributeId: 'voltage_rated', attributeName: 'Rated Voltage', unit: 'V', sortOrder: 3 },
    'rated voltage': { attributeId: 'voltage_rated', attributeName: 'Rated Voltage', unit: 'V', sortOrder: 3 },
    '容量': { attributeId: 'capacity', attributeName: 'Capacity', sortOrder: 4 },
    'capacity': { attributeId: 'capacity', attributeName: 'Capacity', sortOrder: 4 },
  },
  'Motors and Fans': {
    '风扇类型': { attributeId: 'fan_type', attributeName: 'Fan Type', sortOrder: 1 },
    'fan type': { attributeId: 'fan_type', attributeName: 'Fan Type', sortOrder: 1 },
    '额定电压': { attributeId: 'voltage_rated', attributeName: 'Rated Voltage', sortOrder: 2 },
    'rated voltage': { attributeId: 'voltage_rated', attributeName: 'Rated Voltage', sortOrder: 2 },
    '功率': { attributeId: 'power_watts', attributeName: 'Power', unit: 'W', sortOrder: 3 },
    'power': { attributeId: 'power_watts', attributeName: 'Power', unit: 'W', sortOrder: 3 },
    '转速': { attributeId: 'rpm', attributeName: 'Speed (RPM)', sortOrder: 4 },
    'rpm': { attributeId: 'rpm', attributeName: 'Speed (RPM)', sortOrder: 4 },
    '风量': { attributeId: 'airflow', attributeName: 'Air Flow', sortOrder: 5 },
    'air flow': { attributeId: 'airflow', attributeName: 'Air Flow', sortOrder: 5 },
    '噪音': { attributeId: 'noise', attributeName: 'Noise Level', sortOrder: 7 },
    'noise': { attributeId: 'noise', attributeName: 'Noise Level', sortOrder: 7 },
    '轴承类型': { attributeId: 'bearing_type', attributeName: 'Bearing Type', sortOrder: 8 },
    'bearing type': { attributeId: 'bearing_type', attributeName: 'Bearing Type', sortOrder: 8 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temp Range', sortOrder: 12 },
    'operating temperature': { attributeId: 'operating_temp', attributeName: 'Operating Temp Range', sortOrder: 12 },
  },
};

// ─── Dictionary Accessor Functions ────────────────────────

/** Returns the base (TS) dictionary for a family, or undefined if none exists. */
export function getAtlasParamDictionary(familyId: string): Record<string, AtlasParamMapping> | undefined {
  return atlasParamDictionaries[familyId];
}

/** Returns the shared (cross-family) fallback dictionary. */
export function getSharedParamDictionary(): Record<string, AtlasParamMapping> {
  return sharedParamDictionary;
}

/** Returns all family IDs that have a translation dictionary. */
export function getAtlasDictionaryFamilyIds(): string[] {
  return Object.keys(atlasParamDictionaries);
}

/** Returns the L2 category dictionary, or undefined if none exists. */
export function getAtlasL2ParamDictionary(category: string): Record<string, AtlasParamMapping> | undefined {
  return atlasL2ParamDictionaries[category];
}

/** Returns all L2 category names that have a translation dictionary. */
export function getAtlasL2DictionaryCategories(): string[] {
  return Object.keys(atlasL2ParamDictionaries);
}

/** Returns the set of parameter names that should always be skipped. */
export function getSkipParams(): Set<string> {
  return skipParams;
}

// ─── Dictionary Override Merge ────────────────────────────

/** Shape of a dictionary override row from Supabase. */
export interface DictOverrideRow {
  id: string;
  family_id: string;
  param_name: string;
  action: 'modify' | 'add' | 'remove';
  attribute_id: string | null;
  attribute_name: string | null;
  unit: string | null;
  sort_order: number | null;
}

/**
 * Merges DB overrides onto a base dictionary (remove → override → add).
 * Returns a new dictionary object without mutating the base.
 */
export function applyDictOverrides(
  baseDict: Record<string, AtlasParamMapping>,
  overrides: DictOverrideRow[],
): Record<string, AtlasParamMapping> {
  if (overrides.length === 0) return baseDict;

  const merged = { ...baseDict };

  // 1. REMOVE
  for (const ov of overrides) {
    if (ov.action === 'remove') {
      delete merged[ov.param_name];
    }
  }

  // 2. MODIFY — patch fields on existing entries
  for (const ov of overrides) {
    if (ov.action === 'modify' && merged[ov.param_name]) {
      const base = merged[ov.param_name];
      merged[ov.param_name] = {
        attributeId: ov.attribute_id ?? base.attributeId,
        attributeName: ov.attribute_name ?? base.attributeName,
        unit: ov.unit !== null ? ov.unit : base.unit,
        sortOrder: ov.sort_order ?? base.sortOrder,
      };
    }
  }

  // 3. ADD — new entries
  for (const ov of overrides) {
    if (ov.action === 'add' && ov.attribute_id && ov.attribute_name) {
      merged[ov.param_name] = {
        attributeId: ov.attribute_id,
        attributeName: ov.attribute_name,
        ...(ov.unit && { unit: ov.unit }),
        sortOrder: ov.sort_order ?? 50,
      };
    }
  }

  return merged;
}

// ─── Main Mapping Functions ───────────────────────────────

export interface MappedAtlasProduct {
  part: Part;
  parameters: ParametricAttribute[];
  familyId: string | null;
  classification: FamilyClassification;
  /** Warnings generated during mapping (e.g., unmapped params, missing critical values) */
  warnings: string[];
}

/**
 * Maps a single Atlas model to internal types.
 * Returns a MappedAtlasProduct with Part, ParametricAttribute[], familyId, and warnings.
 */
export function mapAtlasModel(
  model: AtlasModel,
  manufacturerName: string,
  sourceFile?: string,
): MappedAtlasProduct {
  const warnings: string[] = [];

  // 1. Classify family — c3-string-based first pass, then post-correct using
  // signals from extracted parameters that contradict the c3 verdict.
  const initialClassification = classifyAtlasCategory(
    model.category.c1.name,
    model.category.c2.name,
    model.category.c3.name,
  );
  const classification = reclassifyByParameterSignals(initialClassification, model.parameters);

  // 2. Resolve status from parameters
  let status: PartStatus = 'Active';
  for (const p of model.parameters) {
    const lowerName = p.name.toLowerCase();
    if (lowerName === '状态' || lowerName === 'status' || lowerName === '零件状态') {
      const mapped = statusMap[p.value.toLowerCase().trim()];
      if (mapped) status = mapped;
    }
  }

  // 3. Build Part identity
  const part: Part = {
    mpn: model.componentName,
    manufacturer: cleanManufacturerName(manufacturerName),
    description: model.description || '',
    detailedDescription: model.description || '',
    category: classification.category,
    subcategory: classification.subcategory,
    status,
    datasheetUrl: model.datasheetUrl || undefined,
    manufacturerCountry: 'CN',
  };

  // 4. Map parameters
  const familyDict = classification.familyId
    ? atlasParamDictionaries[classification.familyId]
    : atlasL2ParamDictionaries[classification.category];
  const gaiaDict = classification.familyId
    ? gaiaFamilyDictionaries[classification.familyId]
    : gaiaL2Dictionaries[classification.category];
  const parameters: ParametricAttribute[] = [];
  const seenAttributeIds = new Set<string>();
  let packageValue: string | undefined;

  // Pre-scan gaia params: stem -> set of suffixes present in THIS product.
  // Used so preferredSuffix acts as a PREFERENCE among available variants, not
  // a hard drop. If only a non-preferred suffix exists for a stem (e.g. dict
  // prefers 'Typ' but the product only ships '-Max'), we still map it —
  // otherwise the value is silently lost AND never surfaced to Triage.
  // (Mirror of scripts/atlas-ingest.mjs.)
  const gaiaStemSuffixes = new Map<string, Set<string>>();
  for (const p of model.parameters) {
    if (isMissingValue(p.value)) continue;
    const g = parseGaiaParam(p.name);
    if (!g) continue;
    if (!gaiaStemSuffixes.has(g.stem)) gaiaStemSuffixes.set(g.stem, new Set());
    gaiaStemSuffixes.get(g.stem)!.add(g.suffix);
  }

  for (const p of model.parameters) {
    if (isMissingValue(p.value)) continue;

    // Normalize: decode literal byte-escape text (CT MICRO `(\xe2\x84\x83)` →
    // `(℃)`), then lowercase + trim + collapse internal whitespace runs.
    // CT MICRO ships paramNames like 'Light Current   (mA)' with multi-space
    // padding; APSEMI ships trailing spaces ('Circuit '). Both need to match
    // dict keys written as single-space normalized form (per the F1/F2
    // additions in Decision #235). The decode lets the SAME dict entry cover
    // CT MICRO's broken-encoding variant without separate registrations.
    const decodedName = decodeLiteralByteEscapes(p.name);
    const lowerName = decodedName.toLowerCase().trim().replace(/\s+/g, ' ');

    // Skip metadata fields — but dictionary entries take priority over skip list
    const hasDictMapping = !!(familyDict?.[lowerName] ?? sharedParamDictionary[lowerName] ?? metadataParamDictionary[lowerName]);
    if (!hasDictMapping && (skipParams.has(decodedName) || skipParams.has(lowerName))) continue;
    // Skip status (already extracted above)
    if (lowerName === '状态' || lowerName === 'status' || lowerName === '零件状态') continue;

    // ── Gaia parameter handling ──────────────────────────────
    const gaia = parseGaiaParam(p.name);
    if (gaia) {
      if (GAIA_SKIP_STEMS.has(gaia.stem)) continue;

      const gaiaMapping: GaiaParamMapping | undefined =
        gaiaDict?.[gaia.stem] ?? gaiaSharedDictionary[gaia.stem];

      if (!gaiaMapping) {
        // Store with auto-humanized name (nothing thrown away)
        if (!seenAttributeIds.has(gaia.stem)) {
          seenAttributeIds.add(gaia.stem);
          const parsed = parseGaiaValue(p.value);
          // parseGaiaValue parses unit from value string ("5.8 mΩ" → unit='mΩ'); no dict fallback exists here.
          parameters.push({
            parameterId: gaia.stem,
            parameterName: humanizeStem(gaia.stem),
            value: parsed.displayValue,
            numericValue: applyUnitPrefix(parsed.numericValue, parsed.unit),
            unit: parsed.unit,
            sortOrder: 200 + parameters.length,
          });
        }
        continue;
      }

      // Suffix preference: skip a non-preferred suffix ONLY if the preferred
      // variant is actually present for this stem; otherwise map the available
      // one (don't silently drop the only value we have).
      if (gaiaMapping.preferredSuffix && gaia.suffix && gaia.suffix !== gaiaMapping.preferredSuffix) {
        const present = gaiaStemSuffixes.get(gaia.stem);
        if (present && present.has(gaiaMapping.preferredSuffix)) {
          continue;
        }
      }

      // Skip internal-only attributes
      if (gaiaMapping.attributeId.startsWith('_')) continue;

      // Deduplicate — first occurrence of each attributeId wins
      if (seenAttributeIds.has(gaiaMapping.attributeId)) continue;
      seenAttributeIds.add(gaiaMapping.attributeId);

      // Parse value (gaia values embed units: "5.8 mΩ", "100 V")
      const parsed = parseGaiaValue(p.value);
      let displayValue = parsed.displayValue;
      const numericValue = parsed.numericValue;
      const unit = gaiaMapping.unit || parsed.unit;

      if (gaiaMapping.attributeId === 'operating_temp') {
        displayValue = normalizeTemperatureRange(p.value);
      }

      if (gaiaMapping.attributeId === 'package_case') {
        packageValue = displayValue;
      }

      // Hybrid: parsed.unit (from value string) wins over gaiaMapping.unit (dict guess).
      const gaiaEffUnit = effectiveUnit(parsed.unit, gaiaMapping.unit);
      parameters.push({
        parameterId: gaiaMapping.attributeId,
        parameterName: gaiaMapping.attributeName,
        value: displayValue,
        numericValue: applyUnitPrefix(numericValue, gaiaEffUnit),
        unit,
        sortOrder: gaiaMapping.sortOrder,
      });
      continue;
    }

    // ── Standard dictionary lookup (Chinese + English) ───────
    // Metadata dict is the third fallback: it normalizes regulatory/compliance
    // keys (rohs, eccn, etc.) to canonical attributeIds so they're stored
    // cleanly in JSONB and don't surface in Triage. fromParametersJsonb then
    // excludes them from the Specs panel — Overview is the only display.
    const mapping = familyDict?.[lowerName]
      ?? sharedParamDictionary[lowerName]
      ?? metadataParamDictionary[lowerName];

    if (!mapping) {
      // Store with raw param name (nothing thrown away)
      const rawId = lowerName.replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
      if (rawId && !seenAttributeIds.has(rawId)) {
        seenAttributeIds.add(rawId);
        parameters.push({
          parameterId: rawId,
          parameterName: stripGaiaPrefix(decodedName.trim()),
          value: p.value.trim(),
          numericValue: extractNumeric(p.value),
          sortOrder: 200 + parameters.length,
        });
      }
      continue;
    }

    // Skip internal-only attributes (prefixed with _)
    if (mapping.attributeId.startsWith('_')) continue;

    // Deduplicate — gaia may have already provided this attributeId
    if (seenAttributeIds.has(mapping.attributeId)) continue;
    seenAttributeIds.add(mapping.attributeId);

    // Normalize value based on attributeId
    let displayValue = p.value.trim();
    // Parse number AND unit from value string first (ground truth from vendor).
    // Fall back to dict-declared unit only when value string is unit-less.
    const { numericValue, parsedUnit } = extractNumericWithPrefix(displayValue);
    const unit = mapping.unit;
    const effUnit = effectiveUnit(parsedUnit, unit);

    if (mapping.attributeId === 'operating_temp') {
      displayValue = normalizeTemperatureRange(displayValue);
    } else if (mapping.attributeId === 'input_voltage_range') {
      displayValue = normalizeVoltageRange(displayValue);
    }

    // Track package for quick-filter column
    if (mapping.attributeId === 'package_case') {
      packageValue = displayValue;
    }

    parameters.push({
      parameterId: mapping.attributeId,
      parameterName: mapping.attributeName,
      value: displayValue,
      numericValue: applyUnitPrefix(numericValue, effUnit),
      unit,
      sortOrder: mapping.sortOrder,
    });
  }

  // 5. Post-mapping enrichment for LDOs: synthesize output_voltage from min/max
  if (classification.familyId === 'C1') {
    const hasOutputVoltage = parameters.some(p => p.parameterId === 'output_voltage');
    if (!hasOutputVoltage) {
      // Try to find min/max output voltage from the raw params
      const minV = model.parameters.find(p => p.name.toLowerCase().includes('最小输出电压'))?.value;
      const maxV = model.parameters.find(p => p.name.toLowerCase().includes('最大输出电压'))?.value;
      if (minV && maxV && !isMissingValue(minV) && !isMissingValue(maxV)) {
        const minNum = extractNumeric(minV);
        const maxNum = extractNumeric(maxV);
        if (minNum !== undefined && maxNum !== undefined) {
          // If min == max, it's a fixed output LDO
          if (minNum === maxNum) {
            parameters.push({
              parameterId: 'output_voltage',
              parameterName: 'Output Voltage',
              value: `${minNum} V`,
              numericValue: minNum,
              unit: 'V',
              sortOrder: 2,
            });
          } else {
            // Adjustable output — store the range
            parameters.push({
              parameterId: 'output_voltage',
              parameterName: 'Output Voltage',
              value: `${minNum} V to ${maxNum} V`,
              numericValue: minNum,
              unit: 'V',
              sortOrder: 2,
            });
            // Infer output_type as Adjustable
            if (!parameters.some(p => p.parameterId === 'output_type')) {
              parameters.push({
                parameterId: 'output_type',
                parameterName: 'Output Type',
                value: 'Adjustable',
                sortOrder: 1,
              });
            }
          }
        }
      }
    }
  }

  // Store package on part for quick filtering
  if (packageValue) {
    (part as Part & { _package?: string })._package = packageValue;
  }

  // Tag all parameters with source
  for (const p of parameters) p.source = 'atlas';

  return {
    part,
    parameters,
    familyId: classification.familyId,
    classification,
    warnings,
  };
}

/**
 * Cleans manufacturer name: removes Chinese characters in parentheses after English name.
 * "GIGADEVICE 兆易创新" → "GigaDevice"
 */
function cleanManufacturerName(raw: string): string {
  // Take the English portion (before Chinese characters)
  const englishPart = raw.match(/^[\x20-\x7E]+/)?.[0]?.trim();
  if (englishPart) return englishPart;
  return raw.trim();
}

/**
 * Converts a MappedAtlasProduct to a PartAttributes (ready for matching engine).
 */
export function toPartAttributes(mapped: MappedAtlasProduct): PartAttributes {
  return {
    part: mapped.part,
    parameters: mapped.parameters,
    dataSource: 'atlas',
  };
}

/**
 * Provenance-tagged stored shape for a single parameter entry in atlas_products.parameters.
 *
 * - source: where this attribute came from
 *     'atlas'      — mapped from the source JSON file (replaceable on re-ingest)
 *     'extraction' — derived by atlas-extract-descriptions LLM (preserved across re-ingest)
 *     'manual'     — admin-edited (preserved across re-ingest)
 * - ingested_at: ISO timestamp the entry was last written
 *
 * Legacy rows (pre-migration) lack `source` and `ingested_at` — readers must treat them as 'atlas'.
 */
export type AtlasParamEntry = {
  value: string;
  numericValue?: number;
  unit?: string;
  source?: 'atlas' | 'extraction' | 'manual';
  ingested_at?: string;
  // Legacy provenance field from pre-migration rows. New code writes `source`;
  // this is read-only and upconverted by mergeAtlasParameters when encountered.
  _source?: 'desc_extract';
};

/**
 * Converts a MappedAtlasProduct to the JSONB format stored in atlas_products.parameters,
 * tagging every entry as source: 'atlas' with the current timestamp.
 *
 * For ingest paths that need to merge with existing extraction/manual entries, see
 * mergeAtlasParameters() — this helper produces the atlas-only contribution.
 */
export function toParametersJsonb(parameters: ParametricAttribute[]): Record<string, AtlasParamEntry> {
  const result: Record<string, AtlasParamEntry> = {};
  const nowIso = new Date().toISOString();
  for (const p of parameters) {
    result[p.parameterId] = {
      value: p.value,
      ...(p.numericValue !== undefined && { numericValue: p.numericValue }),
      ...(p.unit && { unit: p.unit }),
      source: 'atlas',
      ingested_at: nowIso,
    };
  }
  return result;
}

/**
 * Provenance-preserving merge for re-ingest.
 *
 * Behavior:
 *   - 'extraction' and 'manual' entries from `existing` survive untouched.
 *   - Legacy entries with `_source: 'desc_extract'` (pre-migration shape) are
 *     defensively upconverted to `source: 'extraction'` and preserved. The
 *     backfill SHOULD have already migrated these, but we treat defensively in
 *     case a row escaped it.
 *   - 'atlas' entries (and legacy untagged) are replaced wholesale by `newAtlas`.
 *     Atlas keys not present in newAtlas are dropped.
 *
 * Mirrored byte-for-byte from scripts/atlas-ingest.mjs.
 */
export function mergeAtlasParameters(
  existing: Record<string, AtlasParamEntry> | null | undefined,
  newAtlas: Record<string, AtlasParamEntry>,
): Record<string, AtlasParamEntry> {
  const merged: Record<string, AtlasParamEntry> = {};

  if (existing) {
    for (const [key, entry] of Object.entries(existing)) {
      if (!entry || typeof entry !== 'object') continue;
      if (entry.source === 'extraction' || entry.source === 'manual') {
        merged[key] = entry;
        continue;
      }
      if (entry._source === 'desc_extract') {
        const upconverted: AtlasParamEntry = { ...entry, source: 'extraction' };
        delete upconverted._source;
        if (!upconverted.ingested_at) upconverted.ingested_at = new Date().toISOString();
        merged[key] = upconverted;
        continue;
      }
      // source: 'atlas' or legacy untagged → drop, will be replaced by newAtlas
    }
  }

  for (const [key, entry] of Object.entries(newAtlas)) {
    merged[key] = entry;
  }

  return merged;
}

/**
 * Converts JSONB parameters back to ParametricAttribute[] (for query results).
 * Accepts both the new provenance-tagged shape and the legacy untagged shape.
 *
 * Resolves human-readable attributeNames via fallback chain:
 * L3 family dict → L2 category dict → shared dict → logic table rules → L2 param map → humanizeStem()
 */
export function fromParametersJsonb(
  jsonb: Record<string, AtlasParamEntry>,
  familyId?: string | null,
  category?: string | null,
  overrides?: DictOverrideRow[],
): ParametricAttribute[] {
  const result: ParametricAttribute[] = [];
  let sortCounter = 0;

  // Build a lookup map: attributeId → { name, sortOrder } from all available sources
  const nameLookup = new Map<string, { name: string; sortOrder: number }>();

  // 0. Admin dictionary overrides (highest priority — admin-curated names win
  //    over logic-table defaults, and 'add' actions seed entirely new attributeIds
  //    that aren't in any base dict). Filter to overrides relevant to this row's
  //    family/category to avoid cross-family name collisions.
  if (overrides && overrides.length > 0) {
    for (const ov of overrides) {
      if (ov.action === 'remove') continue;
      if (!ov.attribute_id || !ov.attribute_name) continue;
      const matchesScope = ov.family_id === familyId || ov.family_id === category;
      if (!matchesScope) continue;
      nameLookup.set(ov.attribute_id, {
        name: ov.attribute_name,
        sortOrder: ov.sort_order ?? 50,
      });
    }
  }

  // 1. L3 family dictionary (reverse lookup: find entries that map TO each attributeId)
  if (familyId) {
    const dict = atlasParamDictionaries[familyId];
    if (dict) {
      for (const entry of Object.values(dict)) {
        if (!nameLookup.has(entry.attributeId)) {
          nameLookup.set(entry.attributeId, { name: entry.attributeName, sortOrder: entry.sortOrder });
        }
      }
    }
  }

  // 2. L2 category dictionary
  if (category && !familyId) {
    const l2Dict = atlasL2ParamDictionaries[category];
    if (l2Dict) {
      for (const entry of Object.values(l2Dict)) {
        if (!nameLookup.has(entry.attributeId)) {
          nameLookup.set(entry.attributeId, { name: entry.attributeName, sortOrder: entry.sortOrder });
        }
      }
    }
  }

  // 3. Shared dictionary
  for (const entry of Object.values(sharedParamDictionary)) {
    if (!nameLookup.has(entry.attributeId)) {
      nameLookup.set(entry.attributeId, { name: entry.attributeName, sortOrder: entry.sortOrder });
    }
  }

  // 3b. Metadata dictionary — compliance / export-control / regulatory.
  // Registered in nameLookup so legacy rows whose JSONB still has raw English
  // keys (e.g. `rohs`, `eccn`) get canonical names AND so the metadata-skip
  // check below knows the canonical attributeId. The skip in the iteration
  // loop is what prevents these from leaking into the Specs panel.
  for (const entry of Object.values(metadataParamDictionary)) {
    if (!nameLookup.has(entry.attributeId)) {
      nameLookup.set(entry.attributeId, { name: entry.attributeName, sortOrder: entry.sortOrder });
    }
  }

  // 4. Logic table rules (L3 families have human-readable attributeNames)
  if (familyId) {
    const table = getLogicTable(familyId);
    if (table) {
      for (const rule of table.rules) {
        if (!nameLookup.has(rule.attributeId)) {
          nameLookup.set(rule.attributeId, { name: rule.attributeName, sortOrder: rule.sortOrder ?? sortCounter++ });
        }
      }
    }
  }

  // 5. L2 param map (display-only categories)
  if (category && !familyId) {
    const l2Map = getL2ParamMapForCategory(category);
    if (l2Map) {
      for (const entry of Object.values(l2Map)) {
        const mappings: ParamMapping[] = Array.isArray(entry) ? entry : [entry as ParamMapping];
        for (const m of mappings) {
          if (!nameLookup.has(m.attributeId)) {
            nameLookup.set(m.attributeId, { name: m.attributeName, sortOrder: m.sortOrder });
          }
        }
      }
    }
  }

  for (const [attributeId, data] of Object.entries(jsonb)) {
    // Metadata attributes (rohs/reach/eccn_code/hts_code/msl) are surfaced via
    // Part top-level fields populated by atlasClient's read-time lift, NOT via
    // the parametric Specs panel. Skipping them here keeps the Specs panel
    // clean of regulatory/compliance metadata that isn't electrically scored.
    if (METADATA_ATTRIBUTE_IDS.has(attributeId)) continue;

    const lookup = nameLookup.get(attributeId);
    const recognized = !!lookup;
    // Fallback: humanize the attributeId (e.g., rdc_max → Rdc Max)
    const attributeName = lookup?.name ?? stripGaiaPrefix(humanizeStem(attributeId));
    const sortOrder = lookup?.sortOrder ?? sortCounter++;

    result.push({
      parameterId: attributeId,
      parameterName: attributeName,
      value: data.value,
      numericValue: data.numericValue,
      unit: data.unit,
      sortOrder,
      source: 'atlas',
      recognized,
    });
  }

  return result.sort((a, b) => a.sortOrder - b.sortOrder);
}
