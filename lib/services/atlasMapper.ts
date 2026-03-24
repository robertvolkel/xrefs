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
 * Maps Atlas c3 category name → internal ComponentCategory + subcategory + familyId.
 * The c3 names in Atlas data largely match Digikey leaf category names.
 */
export function classifyAtlasCategory(c1: string, c2: string, c3: string): FamilyClassification {
  const lower = c3.toLowerCase();

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

  // ─── Discrete Semiconductors ───
  // Thyristors — check BEFORE diodes/transistors to avoid false matches
  if (lower.includes('scr') && !lower.includes('module')) return { category: 'Thyristors', subcategory: 'SCR', familyId: 'B8' };
  if (lower.includes('triac')) return { category: 'Thyristors', subcategory: 'TRIAC', familyId: 'B8' };
  // TVS — check BEFORE generic diodes
  if (lower.includes('tvs')) return { category: 'Diodes', subcategory: 'TVS Diode', familyId: 'B4' };
  // Zener — check BEFORE generic diodes
  if (lower === 'zener' || lower.includes('zener diode')) return { category: 'Diodes', subcategory: 'Zener Diode', familyId: 'B3' };
  // Bridge Rectifiers
  if (lower.includes('bridge rectifier')) return { category: 'Diodes', subcategory: 'Bridge Rectifier', familyId: 'B1' };
  // Generic rectifiers/diodes
  if (lower.includes('rectifier') || (lower.includes('diode') && !lower.includes('tvs') && !lower.includes('zener'))) {
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
  // Op-Amps / Comparators / Amplifiers
  if (lower.includes('comparator')) return { category: 'Amplifiers', subcategory: 'Comparator', familyId: 'C4' };
  if (lower.includes('amplifier') || lower.includes('op amp') || lower.includes('instrumentation')) {
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
  // Logic ICs
  if (lower.includes('gates and inverter') || lower.includes('flip flop') ||
      lower.includes('latch') || lower.includes('counter') || lower.includes('shift register') ||
      lower.includes('multiplexer') || lower.includes('decoder')) {
    return { category: 'Logic ICs', subcategory: 'Logic IC', familyId: 'C5' };
  }

  // ─── Uncovered families — ingest for search, no familyId ───
  // Use c1/c2 to pick a reasonable ComponentCategory
  const c1lower = c1.toLowerCase();
  if (c1lower.includes('capacitor')) return { category: 'Capacitors', subcategory: c3, familyId: null };
  if (c1lower.includes('resistor')) return { category: 'Resistors', subcategory: c3, familyId: null };
  if (c1lower.includes('inductor') || c1lower.includes('choke')) return { category: 'Inductors', subcategory: c3, familyId: null };
  if (c1lower.includes('connector')) return { category: 'Connectors', subcategory: c3, familyId: null };
  if (c1lower.includes('protection') || c1lower.includes('circuit protection')) return { category: 'Protection', subcategory: c3, familyId: null };
  if (c1lower.includes('diode') || c1lower.includes('discrete')) return { category: 'Diodes', subcategory: c3, familyId: null };
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
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 10 },
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
    '封装/外壳': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 11 },
    '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 11 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 12 },
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
    'z power rating': { attributeId: 'pd', attributeName: 'Power Dissipation', unit: 'W', sortOrder: 3 },
    'z voltage tolerance': { attributeId: 'vz_tolerance', attributeName: 'Vz Tolerance', sortOrder: 2 },
    'zener current iz': { attributeId: '_izt', attributeName: 'Test Current (Izt)', unit: 'A', sortOrder: 93 },
    'zener impedance at iz': { attributeId: 'zzt', attributeName: 'Zener Impedance (Zzt)', unit: 'Ohm', sortOrder: 4 },
    'zener impedance at izk': { attributeId: '_zzk', attributeName: 'Knee Impedance (Zzk)', unit: 'Ohm', sortOrder: 94 },
    '封装/外壳': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 8 },
    '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 8 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 9 },
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
    // English
    'polarity': { attributeId: 'polarity', attributeName: 'Polarity', sortOrder: 1 },
    'operating standoff voltage': { attributeId: 'vrwm', attributeName: 'Standoff Voltage (Vrwm)', unit: 'V', sortOrder: 2 },
    'breakdown voltage vbr': { attributeId: 'vbr', attributeName: 'Breakdown Voltage (Vbr)', unit: 'V', sortOrder: 3 },
    'clamping voltage vc': { attributeId: 'vc', attributeName: 'Clamping Voltage (Vc)', unit: 'V', sortOrder: 4 },
    'power rating': { attributeId: 'ppk', attributeName: 'Peak Pulse Power', unit: 'W', sortOrder: 5 },
    'max peak current ipk': { attributeId: 'ipp', attributeName: 'Peak Pulse Current', unit: 'A', sortOrder: 6 },
    'junction capacitance cj': { attributeId: 'cj', attributeName: 'Junction Capacitance', unit: 'pF', sortOrder: 7 },
    'esd per iec contact': { attributeId: 'esd_rating', attributeName: 'ESD Rating (IEC)', unit: 'kV', sortOrder: 10 },
    'vrwm(v)': { attributeId: 'vrwm', attributeName: 'Standoff Voltage (Vrwm)', unit: 'V', sortOrder: 2 },
    'ir max(ua)': { attributeId: 'ir_leakage', attributeName: 'Reverse Leakage (Ir)', sortOrder: 8 },
    '封装/外壳': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 11 },
    '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 11 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 12 },
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
    // Package
    'package': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 4 },
    '封装/外壳': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 4 },
    '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 4 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 17 },
  },

  // ─── B6 BJTs ───────────────────────────────────────────
  B6: {
    // Chinese
    '晶体管类型': { attributeId: 'polarity', attributeName: 'Polarity (NPN/PNP)', sortOrder: 1 },
    '极性': { attributeId: 'polarity', attributeName: 'Polarity (NPN/PNP)', sortOrder: 1 },
    '集射极击穿电压(vceo)': { attributeId: 'vceo_max', attributeName: 'Vceo', unit: 'V', sortOrder: 3 },
    '集电极-发射极饱和电压(vce(sat)@ic,ib)': { attributeId: 'vce_sat', attributeName: 'Vce(sat)', unit: 'V', sortOrder: 6 },
    '直流电流增益(hfe@ic,vce)': { attributeId: '_hfe', attributeName: 'DC Current Gain (hFE)', sortOrder: 7 },
    '集电极截止电流(icbo)': { attributeId: '_icbo', attributeName: 'Collector Cutoff Current', sortOrder: 91 },
    '功率(pd)': { attributeId: '_pd', attributeName: 'Power Dissipation', unit: 'W', sortOrder: 8 },
    '特征频率(ft)': { attributeId: 'ft', attributeName: 'Transition Frequency (ft)', unit: 'MHz', sortOrder: 9 },
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
    '封装/外壳': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 2 },
    '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 2 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 10 },
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
    '输出侧uvlo(v)': { attributeId: 'undervoltage_lockout', attributeName: 'UVLO', unit: 'V', sortOrder: 14 },
    '输出侧建议工作电压(v)': { attributeId: '_recommended_vout', attributeName: 'Recommended Output Voltage', unit: 'V', sortOrder: 94 },
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
    'vos(max)(mv)': { attributeId: 'vos', attributeName: 'Input Offset Voltage', unit: 'mV', sortOrder: 7 },
    'vos(max)(μv)': { attributeId: 'vos', attributeName: 'Input Offset Voltage', unit: 'uV', sortOrder: 7 },
    'vos(mv,max)': { attributeId: 'vos', attributeName: 'Input Offset Voltage', unit: 'mV', sortOrder: 7 },
    '输入失调电压@25℃ (max)(mv)': { attributeId: 'vos', attributeName: 'Input Offset Voltage', unit: 'mV', sortOrder: 7 },
    '失调电压(mv)': { attributeId: 'vos', attributeName: 'Input Offset Voltage', unit: 'mV', sortOrder: 7 },
    // Vos drift
    'vos tc(µv/°c)': { attributeId: 'vos_drift', attributeName: 'Vos Drift', unit: 'uV/°C', sortOrder: 8 },
    'vos tc(μv/℃)(typ.)': { attributeId: 'vos_drift', attributeName: 'Vos Drift', unit: 'uV/°C', sortOrder: 8 },
    'vos tc(μv/℃,typ.)': { attributeId: 'vos_drift', attributeName: 'Vos Drift', unit: 'uV/°C', sortOrder: 8 },
    // Supply current
    'iq(typ.)(per ch)': { attributeId: 'supply_current', attributeName: 'Supply Current', sortOrder: 15 },
    'iq(typ.)(per ch)(μa)': { attributeId: 'supply_current', attributeName: 'Supply Current', unit: 'uA', sortOrder: 15 },
    'iq(max.)(per ch)': { attributeId: 'supply_current', attributeName: 'Supply Current', sortOrder: 15 },
    '每通道静态电流(典型值)(μa)': { attributeId: 'supply_current', attributeName: 'Supply Current', unit: 'uA', sortOrder: 15 },
    // Bias current
    'ibias(pa)': { attributeId: 'ibias', attributeName: 'Input Bias Current', unit: 'pA', sortOrder: 9 },
    'ib(pa,typ.)': { attributeId: 'ibias', attributeName: 'Input Bias Current', unit: 'pA', sortOrder: 9 },
    '偏置电流 (±)(典型值)(pa)': { attributeId: 'ibias', attributeName: 'Input Bias Current', unit: 'pA', sortOrder: 9 },
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
    'hbm esd总线引脚(±kv)': { attributeId: 'esd_rating', attributeName: 'ESD Rating', unit: 'kV', sortOrder: 10 },
    '共模输入电压(v)': { attributeId: '_common_mode_range', attributeName: 'Common Mode Range', unit: 'V', sortOrder: 90 },
    '速率(mbps)': { attributeId: 'data_rate', attributeName: 'Data Rate', unit: 'Mbps', sortOrder: 5 },
    'signaling rate (mbps)  速率': { attributeId: 'data_rate', attributeName: 'Data Rate', unit: 'Mbps', sortOrder: 5 },
    '总线可挂节点': { attributeId: '_num_nodes', attributeName: 'Bus Nodes', sortOrder: 91 },
    '通讯模式': { attributeId: '_operating_mode', attributeName: 'Operating Mode', sortOrder: 92 },
    '远程唤醒': { attributeId: '_remote_wakeup', attributeName: 'Remote Wakeup', sortOrder: 93 },
    'supply voltage(s) (v)  供电电压': { attributeId: '_supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 94 },
    'low power current (ua)  低功耗电流': { attributeId: '_low_power_current', attributeName: 'Low Power Current', unit: 'uA', sortOrder: 95 },
    'dominant time-out  显性超时': { attributeId: '_dominant_timeout', attributeName: 'Dominant Timeout', sortOrder: 96 },
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
    'esd等级 (单双边,v)': { attributeId: 'esd_rating', attributeName: 'ESD Rating', sortOrder: 10 },
    'package  封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 3 },
    '封装形式': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 3 },
    '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 3 },
    'package': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 3 },
    '温度范围 (℃)': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 16 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 16 },
  },

  // ─── C5 Logic ICs ──────────────────────────────────────
  // Very little Atlas data for logic ICs — mostly covered by shared dictionary
  C5: {
    '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 3 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 16 },
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
};

/**
 * Shared/common parameter names that appear across multiple families.
 * Checked as fallback when no family-specific mapping exists.
 */
const sharedParamDictionary: Record<string, AtlasParamMapping> = {
  '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 18 },
  '封装/外壳': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 18 },
  'package': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 18 },
  '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 16 },
  '温度': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 16 },
  'operating temperature range': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 16 },
  'operating temperature range (°c)': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 16 },
};

/**
 * Parameter names to always skip (metadata, not parametric data).
 */
const skipParams = new Set([
  'description',
  '品牌',        // brand
  '原始制造商',  // original manufacturer
  '最小包装',    // minimum order quantity
  '包装',        // packaging format
  '元件生命周期', // component lifecycle
  '零件状态',    // part status (use 状态/Status instead)
  '原产国家',    // country of origin
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

  // 1. Classify family
  const classification = classifyAtlasCategory(
    model.category.c1.name,
    model.category.c2.name,
    model.category.c3.name,
  );

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
  const familyDict = classification.familyId ? atlasParamDictionaries[classification.familyId] : undefined;
  const gaiaDict = classification.familyId
    ? gaiaFamilyDictionaries[classification.familyId]
    : gaiaL2Dictionaries[classification.category];
  const parameters: ParametricAttribute[] = [];
  const seenAttributeIds = new Set<string>();
  let packageValue: string | undefined;

  for (const p of model.parameters) {
    if (isMissingValue(p.value)) continue;

    const lowerName = p.name.toLowerCase().trim();

    // Skip metadata fields
    if (skipParams.has(p.name) || skipParams.has(lowerName)) continue;
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
          parameters.push({
            parameterId: gaia.stem,
            parameterName: humanizeStem(gaia.stem),
            value: parsed.displayValue,
            numericValue: parsed.numericValue,
            unit: parsed.unit,
            sortOrder: 200 + parameters.length,
          });
        }
        continue;
      }

      // Check suffix preference — skip if this isn't the preferred suffix
      if (gaiaMapping.preferredSuffix && gaia.suffix && gaia.suffix !== gaiaMapping.preferredSuffix) {
        continue;
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

      parameters.push({
        parameterId: gaiaMapping.attributeId,
        parameterName: gaiaMapping.attributeName,
        value: displayValue,
        numericValue,
        unit,
        sortOrder: gaiaMapping.sortOrder,
      });
      continue;
    }

    // ── Standard dictionary lookup (Chinese + English) ───────
    const mapping = familyDict?.[lowerName] ?? sharedParamDictionary[lowerName];

    if (!mapping) {
      // Store with raw param name (nothing thrown away)
      const rawId = lowerName.replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
      if (rawId && !seenAttributeIds.has(rawId)) {
        seenAttributeIds.add(rawId);
        parameters.push({
          parameterId: rawId,
          parameterName: p.name.trim(),
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
    let numericValue = extractNumeric(displayValue);
    const unit = mapping.unit;

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
      numericValue,
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
 * Converts a MappedAtlasProduct to the JSONB format stored in atlas_products.parameters.
 * Format: { [attributeId]: { value, numericValue?, unit? } }
 */
export function toParametersJsonb(parameters: ParametricAttribute[]): Record<string, { value: string; numericValue?: number; unit?: string }> {
  const result: Record<string, { value: string; numericValue?: number; unit?: string }> = {};
  for (const p of parameters) {
    result[p.parameterId] = {
      value: p.value,
      ...(p.numericValue !== undefined && { numericValue: p.numericValue }),
      ...(p.unit && { unit: p.unit }),
    };
  }
  return result;
}

/**
 * Converts JSONB parameters back to ParametricAttribute[] (for query results).
 * Uses the family-specific dictionary for attributeNames and sortOrder.
 */
export function fromParametersJsonb(
  jsonb: Record<string, { value: string; numericValue?: number; unit?: string }>,
  familyId?: string | null,
): ParametricAttribute[] {
  const result: ParametricAttribute[] = [];
  let sortCounter = 0;

  for (const [attributeId, data] of Object.entries(jsonb)) {
    // Try to find attribute name from family dict
    let attributeName = attributeId;
    let sortOrder = sortCounter++;

    if (familyId) {
      const dict = atlasParamDictionaries[familyId];
      if (dict) {
        const entry = Object.values(dict).find(m => m.attributeId === attributeId);
        if (entry) {
          attributeName = entry.attributeName;
          sortOrder = entry.sortOrder;
        }
      }
    }

    result.push({
      parameterId: attributeId,
      parameterName: attributeName,
      value: data.value,
      numericValue: data.numericValue,
      unit: data.unit,
      sortOrder,
      source: 'atlas',
    });
  }

  return result.sort((a, b) => a.sortOrder - b.sortOrder);
}
