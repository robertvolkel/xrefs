#!/usr/bin/env node

/**
 * Atlas Ingestion Script
 *
 * Reads Atlas manufacturer JSON files and ingests products into the
 * atlas_products Supabase table, mapping parameters to internal attributeId format.
 *
 * Usage:
 *   node scripts/atlas-ingest.mjs data/atlas/mfr_4_GIGADEVICE*.json [options]
 *
 * Options:
 *   --dry-run         Show mapping results without writing to DB
 *   --family <id>     Only process products matching this family (e.g., C6, C1)
 *   --verbose         Show per-product mapping details
 *   --warnings        Show unmapped parameter warnings
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local.
 * Uses service role key to bypass RLS for admin writes.
 */

import { readFileSync } from 'fs';
import { resolve, basename } from 'path';
import { createClient } from '@supabase/supabase-js';

// ─── Load Gaia dictionaries from shared JSON ────────────
const gaiaData = JSON.parse(readFileSync(resolve(process.cwd(), 'lib/services/atlas-gaia-dicts.json'), 'utf-8'));
const GAIA_SKIP_STEMS = new Set(gaiaData.skipStems);
const GAIA_FAMILIES = gaiaData.families;
const GAIA_SHARED = gaiaData.shared;
const GAIA_L2 = gaiaData.l2Categories || {};

function humanizeStem(stem) {
  return stem.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function parseGaiaParam(name) {
  if (!name.startsWith('gaia-')) return null;
  const rest = name.slice(5);
  for (const suffix of ['-Min', '-Max', '-Typ', '-Nom']) {
    if (rest.endsWith(suffix)) {
      return { stem: rest.slice(0, -suffix.length), suffix: suffix.slice(1) };
    }
  }
  return { stem: rest, suffix: '' };
}

function parseGaiaValue(raw) {
  const trimmed = raw.trim();
  const rangeMatch = trimmed.match(/^([+-−]?\d+\.?\d*)\s*(?:to|~|–|—)\s*\+?([+-−]?\d+\.?\d*)\s*(.*)$/);
  if (rangeMatch) {
    const unit = rangeMatch[3].trim() || undefined;
    return { displayValue: `${rangeMatch[1]} to ${rangeMatch[2]}${unit ? ' ' + unit : ''}`, numericValue: parseFloat(rangeMatch[1].replace('−', '-')), unit };
  }
  const ltMatch = trimmed.match(/^<\s*(\d+\.?\d*)\s*(.*)$/);
  if (ltMatch) return { displayValue: ltMatch[1], numericValue: parseFloat(ltMatch[1]), unit: ltMatch[2].trim() || undefined };
  const pmMatch = trimmed.match(/^[±]\s*(\d+\.?\d*)\s*(.*)$/);
  if (pmMatch) return { displayValue: `±${pmMatch[1]}`, numericValue: parseFloat(pmMatch[1]), unit: pmMatch[2].trim() || undefined };
  const numUnitMatch = trimmed.match(/^([+-]?\d+\.?\d*)\s+(.+)$/);
  if (numUnitMatch) return { displayValue: numUnitMatch[1], numericValue: parseFloat(numUnitMatch[1]), unit: numUnitMatch[2].trim() };
  const numMatch = trimmed.match(/^([+-]?\d+\.?\d*)$/);
  if (numMatch) return { displayValue: trimmed, numericValue: parseFloat(numMatch[1]) };
  return { displayValue: trimmed };
}

// ─── Load environment ─────────────────────────────────────

function loadEnv() {
  try {
    const envPath = resolve(process.cwd(), '.env.local');
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // .env.local not found
  }
}

loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ─── Import Atlas mapper (compile-free via dynamic import of TS) ────

// We can't directly import TypeScript in an .mjs script, so we re-implement
// the critical mapping logic inline. This duplicates some code from atlasMapper.ts
// but keeps the script self-contained and runnable without a TS build step.

// ─── Category Classification (mirrored from atlasMapper.ts) ──────

function classifyAtlasCategory(c1, c2, c3) {
  const lower = c3.toLowerCase();

  // Compute c1 flags up front — used by both L3 and L2 guards
  const c1lower = c1.toLowerCase();
  const isIC = c1lower.includes('integrated circuit') || c1lower.includes('(ics)');
  const isConnector = c1lower.includes('connector');
  const isOptoOrSensor = c1lower.includes('optoelectronic') || c1lower.includes('sensor');
  const isRF = c1lower.includes('rf') || c1lower.includes('wireless');

  // Passives
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

  // Discrete — word-boundary for SCR to prevent "discrete" → "di[scr]ete" collision
  if (/\bscr\b/i.test(lower) && !lower.includes('module')) return { category: 'Thyristors', subcategory: 'SCR', familyId: 'B8' };
  if (lower.includes('triac')) return { category: 'Thyristors', subcategory: 'TRIAC', familyId: 'B8' };
  if (lower.includes('tvs')) return { category: 'Diodes', subcategory: 'TVS Diode', familyId: 'B4' };
  if (lower === 'zener' || lower.includes('zener diode')) return { category: 'Diodes', subcategory: 'Zener Diode', familyId: 'B3' };
  if (lower.includes('bridge rectifier')) return { category: 'Diodes', subcategory: 'Bridge Rectifier', familyId: 'B1' };
  // Generic diodes — skip laser diodes (c1=Optoelectronics) and photodiodes (c1=Sensors)
  if (!isOptoOrSensor && (lower.includes('rectifier') || (lower.includes('diode') && !lower.includes('tvs') && !lower.includes('zener')))) {
    return { category: 'Diodes', subcategory: 'Rectifier Diode', familyId: 'B1' };
  }
  if (lower.includes('igbt')) return { category: 'Transistors', subcategory: 'IGBT', familyId: 'B7' };
  if (lower.includes('bipolar') || lower.includes('bjt')) return { category: 'Transistors', subcategory: 'BJT', familyId: 'B6' };
  if (lower.includes('mosfet') || lower.includes('fet')) return { category: 'Transistors', subcategory: 'MOSFET', familyId: 'B5' };

  // ICs
  if (lower.includes('voltage reference')) return { category: 'Voltage References', subcategory: 'Voltage Reference', familyId: 'C6' };
  if (lower.includes('low drop out') || lower.includes('ldo') || lower.includes('linear regulator')) {
    return { category: 'Voltage Regulators', subcategory: 'LDO', familyId: 'C1' };
  }
  if (lower.includes('dc dc') || lower.includes('switching regulator') || lower.includes('switching controller')) {
    return { category: 'Voltage Regulators', subcategory: 'Switching Regulator', familyId: 'C2' };
  }
  if (lower.includes('gate driver')) return { category: 'Gate Drivers', subcategory: 'Gate Driver', familyId: 'C3' };
  if (lower.includes('comparator')) return { category: 'Amplifiers', subcategory: 'Comparator', familyId: 'C4' };
  // Op-Amps — skip RF amplifiers
  if (!isRF && (lower.includes('amplifier') || lower.includes('op amp') || lower.includes('instrumentation'))) {
    return { category: 'Amplifiers', subcategory: 'Op-Amp', familyId: 'C4' };
  }
  if (lower.includes('analog to digital') || lower.includes('adc')) return { category: 'ADCs', subcategory: 'ADC', familyId: 'C9' };
  if ((lower.includes('digital to analog') || lower.includes('dac')) && !lower.includes('diac')) {
    return { category: 'DACs', subcategory: 'DAC', familyId: 'C10' };
  }
  if (lower.includes('drivers, receivers, transceivers')) return { category: 'Interface ICs', subcategory: 'Interface IC', familyId: 'C7' };
  if (lower.includes('digital isolator') && !lower.includes('gate driver')) return { category: 'Interface ICs', subcategory: 'Digital Isolator', familyId: 'C7' };
  if (lower.includes('oscillator') && !lower.includes('local oscillator')) return { category: 'Timers and Oscillators', subcategory: 'Oscillator', familyId: 'C8' };
  if (lower.includes('programmable timer') || lower.includes('555')) return { category: 'Timers and Oscillators', subcategory: '555 Timer', familyId: 'C8' };
  // Logic ICs — skip RF multiplexers
  if (lower.includes('gates and inverter') || lower.includes('flip flop') ||
      lower.includes('latch') || lower.includes('counter') || lower.includes('shift register') ||
      (!isRF && lower.includes('multiplexer')) || lower.includes('decoder')) {
    return { category: 'Logic ICs', subcategory: 'Logic IC', familyId: 'C5' };
  }

  // L2 categories (no logic tables)
  // Use c1 guards to prevent cross-domain misclassification.
  if (lower.includes('microcontroller') || lower.includes('mcu')) return { category: 'Microcontrollers', subcategory: c3, familyId: null };
  if (isIC && (lower.includes('microprocessor') || lower.includes('system on chip') || /\bsoc\b/.test(lower))) return { category: 'Processors', subcategory: c3, familyId: null };
  if (lower.includes('memory') || lower.includes('eeprom') || lower.includes('flash') || lower.includes('sram') || lower.includes('dram')) return { category: 'Memory', subcategory: c3, familyId: null };
  if (lower.includes('sensor') || lower.includes('accelerometer') || lower.includes('gyroscope') || lower.includes('imu') || lower.includes('thermocouple')) return { category: 'Sensors', subcategory: c3, familyId: null };
  if (lower.includes('rf ') || lower.includes('wireless') || lower.includes('bluetooth') || lower.includes('wifi') || lower.includes('zigbee') || lower.includes('lora')) return { category: 'RF and Wireless', subcategory: c3, familyId: null };
  if (!isIC && (lower.includes('led') || lower.includes('photodiode') || lower.includes('laser'))) return { category: 'LEDs and Optoelectronics', subcategory: c3, familyId: null };
  if (!isIC && !isConnector && lower.includes('switch') && !lower.includes('switching')) return { category: 'Switches', subcategory: c3, familyId: null };
  if (lower.includes('transformer')) return { category: 'Transformers', subcategory: c3, familyId: null };
  if (lower.includes('filter') || lower.includes('emi')) return { category: 'Filters', subcategory: c3, familyId: null };
  if (lower.includes('battery') && !lower.includes('management')) return { category: 'Battery Products', subcategory: c3, familyId: null };
  if (!isIC && (lower.includes('motor') || lower.includes('fan'))) return { category: 'Motors and Fans', subcategory: c3, familyId: null };
  if (!isConnector && (lower.includes('audio') || lower.includes('speaker') || lower.includes('microphone') || lower.includes('buzzer'))) return { category: 'Audio', subcategory: c3, familyId: null };
  if (lower.includes('power supply') || lower.includes('ac dc') || lower.includes('dc dc')) return { category: 'Power Supplies', subcategory: c3, familyId: null };

  // Uncovered — use c1 to pick a reasonable category
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

// Shared across families
const SHARED_PARAMS = {
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

const FAMILY_PARAMS = {
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
    'package': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 18 },
    '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 18 },
    '输出类型': { attributeId: 'configuration', attributeName: 'Configuration', sortOrder: 1 },
    '最小阴极电流调节': { attributeId: '_min_cathode_current', attributeName: 'Min Cathode Current', sortOrder: 90 },
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
  },
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
    '最大绝对输入电压(v)': { attributeId: '_abs_max_input', attributeName: 'Abs Max Input', unit: 'V', sortOrder: 91 },
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
  },
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
    'control mode': { attributeId: '_control_mode', attributeName: 'Control Mode', sortOrder: 92 },
    'duty cycle (max) (%)': { attributeId: '_duty_max', attributeName: 'Max Duty Cycle', unit: '%', sortOrder: 93 },
    'duty cycle (max)(%)': { attributeId: '_duty_max', attributeName: 'Max Duty Cycle', unit: '%', sortOrder: 93 },
    'source/sink current (a)': { attributeId: '_gate_drive', attributeName: 'Source/Sink Current', unit: 'A', sortOrder: 94 },
    'iout (a)': { attributeId: 'iout_max', attributeName: 'Max Output Current', unit: 'A', sortOrder: 6 },
    'max output current(a)': { attributeId: 'iout_max', attributeName: 'Max Output Current', unit: 'A', sortOrder: 6 },
    'vout (v)': { attributeId: '_output_voltage', attributeName: 'Output Voltage', unit: 'V', sortOrder: 2 },
    'output(v)': { attributeId: '_output_voltage', attributeName: 'Output Voltage', unit: 'V', sortOrder: 2 },
    'channels': { attributeId: '_channels', attributeName: 'Number of Channels', sortOrder: 95 },
    'uvlo on/off (v)': { attributeId: '_uvlo', attributeName: 'UVLO On/Off', unit: 'V', sortOrder: 96 },
    'temperature range(℃)': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 20 },
  },
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
    'operating temperature range (°c)': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 16 },
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
    '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 7 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 8 },
    // CREATEK English MFR-specific formats
    'vac(v)': { attributeId: '_max_ac_voltage', attributeName: 'Max AC Voltage', unit: 'V', sortOrder: 4 },
    'vdc(v)': { attributeId: 'max_continuous_voltage', attributeName: 'Max DC Voltage', unit: 'V', sortOrder: 3 },
    'v(1ma)(v)': { attributeId: 'varistor_voltage', attributeName: 'Varistor Voltage (V1mA)', unit: 'V', sortOrder: 1 },
    'ip(a)': { attributeId: 'peak_surge_current', attributeName: 'Peak Surge Current', unit: 'A', sortOrder: 6 },
    'vc(v)': { attributeId: 'clamping_voltage', attributeName: 'Clamping Voltage', unit: 'V', sortOrder: 2 },
    '8/20us(a)': { attributeId: 'peak_surge_current', attributeName: 'Surge Current (8/20µs)', unit: 'A', sortOrder: 6 },
    '10/1000μs(j)': { attributeId: 'energy_rating', attributeName: 'Energy Rating', unit: 'J', sortOrder: 5 },
    'rated power(w)': { attributeId: '_rated_power', attributeName: 'Rated Power', unit: 'W', sortOrder: 92 },
    'diameter': { attributeId: '_disc_diameter', attributeName: 'Disc Diameter', unit: 'mm', sortOrder: 93 },
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
    // CREATEK English MFR-specific formats
    'vmax(v)': { attributeId: 'max_voltage', attributeName: 'Max Voltage', unit: 'V', sortOrder: 3 },
    'ihold(a)': { attributeId: 'hold_current', attributeName: 'Hold Current', unit: 'A', sortOrder: 1 },
    'itrip(a)': { attributeId: 'trip_current', attributeName: 'Trip Current', unit: 'A', sortOrder: 2 },
    'pd(w)': { attributeId: 'power_dissipation', attributeName: 'Power Dissipation', unit: 'W', sortOrder: 8 },
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
    // CREATEK English MFR-specific formats
    'ir(ua)': { attributeId: 'ir_leakage', attributeName: 'Reverse Leakage (Ir)', unit: 'µA', sortOrder: 8 },
    'ir(ma)': { attributeId: 'ir_leakage', attributeName: 'Reverse Leakage (Ir)', unit: 'mA', sortOrder: 8 },
    'ir max(ua)': { attributeId: 'ir_leakage', attributeName: 'Reverse Leakage (Ir)', unit: 'µA', sortOrder: 8 },
    'if(ma)': { attributeId: 'io_avg', attributeName: 'Forward Current', unit: 'mA', sortOrder: 4 },
    'if(a)': { attributeId: 'io_avg', attributeName: 'Forward Current', unit: 'A', sortOrder: 4 },
    'i(av)(a)': { attributeId: 'io_avg', attributeName: 'Average Forward Current', unit: 'A', sortOrder: 4 },
    'if(av)(v)': { attributeId: 'io_avg', attributeName: 'Average Forward Current', unit: 'A', sortOrder: 4 },
    'io(ma)': { attributeId: 'io_avg', attributeName: 'Forward Current', unit: 'mA', sortOrder: 4 },
    'id* (a)  @25°c': { attributeId: 'io_avg', attributeName: 'Forward Current', unit: 'A', sortOrder: 4 },
    'pd(mw)': { attributeId: '_pd', attributeName: 'Power Dissipation', unit: 'mW', sortOrder: 91 },
    'vf (v)': { attributeId: 'vf', attributeName: 'Forward Voltage (Vf)', unit: 'V', sortOrder: 5 },
    'vrwm(v)': { attributeId: 'vrwm', attributeName: 'Standoff Voltage', unit: 'V', sortOrder: 2 },
    'polarity': { attributeId: 'configuration', attributeName: 'Configuration', sortOrder: 10 },
    'vds (v)': { attributeId: 'vrrm', attributeName: 'Voltage Rating', unit: 'V', sortOrder: 2 },
    'cj (pf)': { attributeId: 'cj', attributeName: 'Junction Capacitance', unit: 'pF', sortOrder: 9 },
  },

  // ─── B3 Zener Diodes ───────────────────────────────────
  B3: {
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
    'zener voltage vz': { attributeId: 'vz', attributeName: 'Zener Voltage', unit: 'V', sortOrder: 1 },
    'z power rating': { attributeId: 'pd', attributeName: 'Power Dissipation', unit: 'W', sortOrder: 3 },
    'z voltage tolerance': { attributeId: 'vz_tolerance', attributeName: 'Vz Tolerance', sortOrder: 2 },
    'zener current iz': { attributeId: '_izt', attributeName: 'Test Current (Izt)', unit: 'A', sortOrder: 93 },
    'zener impedance at iz': { attributeId: 'zzt', attributeName: 'Zener Impedance (Zzt)', unit: 'Ohm', sortOrder: 4 },
    'zener impedance at izk': { attributeId: '_zzk', attributeName: 'Knee Impedance (Zzk)', unit: 'Ohm', sortOrder: 94 },
    '封装/外壳': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 8 },
    '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 8 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 9 },
    // CREATEK English MFR-specific formats
    'vz type(v)': { attributeId: 'vz', attributeName: 'Zener Voltage', unit: 'V', sortOrder: 1 },
    'vf (v)': { attributeId: 'vf', attributeName: 'Forward Voltage (Vf)', unit: 'V', sortOrder: 7 },
    'ir max(ua)': { attributeId: 'ir_leakage', attributeName: 'Reverse Leakage (Ir)', unit: 'µA', sortOrder: 6 },
    'pd(w)': { attributeId: 'pd', attributeName: 'Power Dissipation', unit: 'W', sortOrder: 3 },
  },

  // ─── B4 TVS Diodes ─────────────────────────────────────
  B4: {
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
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 12 },
  },

  // ─── B5 MOSFETs ────────────────────────────────────────
  B5: {
    'polarity': { attributeId: 'channel_type', attributeName: 'Channel Type', sortOrder: 1 },
    '极性': { attributeId: 'channel_type', attributeName: 'Channel Type', sortOrder: 1 },
    'cfg.': { attributeId: 'channel_type', attributeName: 'Channel Type', sortOrder: 1 },
    'configuration': { attributeId: '_configuration', attributeName: 'Configuration', sortOrder: 90 },
    'bvdss (v)': { attributeId: 'vds_max', attributeName: 'Vds Max', unit: 'V', sortOrder: 6 },
    'bv(v)': { attributeId: 'vds_max', attributeName: 'Vds Max', unit: 'V', sortOrder: 6 },
    'vdss(v)': { attributeId: 'vds_max', attributeName: 'Vds Max', unit: 'V', sortOrder: 6 },
    '漏源电压(vdss)': { attributeId: 'vds_max', attributeName: 'Vds Max', unit: 'V', sortOrder: 6 },
    'vgs(±v)': { attributeId: 'vgs_max', attributeName: 'Vgs Max', unit: 'V', sortOrder: 7 },
    'vth(v)-typ.': { attributeId: 'vgs_th', attributeName: 'Gate Threshold (Vth)', unit: 'V', sortOrder: 8 },
    'vth(v)': { attributeId: 'vgs_th', attributeName: 'Gate Threshold (Vth)', unit: 'V', sortOrder: 8 },
    'vth (v)': { attributeId: 'vgs_th', attributeName: 'Gate Threshold (Vth)', unit: 'V', sortOrder: 8 },
    '阈值电压': { attributeId: 'vgs_th', attributeName: 'Gate Threshold (Vth)', unit: 'V', sortOrder: 8 },
    'id (a)': { attributeId: 'id_max', attributeName: 'Drain Current (Id)', unit: 'A', sortOrder: 9 },
    'id(a) tc=25': { attributeId: 'id_max', attributeName: 'Drain Current (Id)', unit: 'A', sortOrder: 9 },
    'id(a) ta=25': { attributeId: 'id_max', attributeName: 'Drain Current (Id)', unit: 'A', sortOrder: 9 },
    '连续漏极电流': { attributeId: 'id_max', attributeName: 'Drain Current (Id)', unit: 'A', sortOrder: 9 },
    'pd (w)': { attributeId: 'pd', attributeName: 'Power Dissipation', unit: 'W', sortOrder: 10 },
    '功率耗散': { attributeId: 'pd', attributeName: 'Power Dissipation', unit: 'W', sortOrder: 10 },
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
    'qg (nc)': { attributeId: 'qg', attributeName: 'Gate Charge (Qg)', unit: 'nC', sortOrder: 13 },
    'qg*  (nc)': { attributeId: 'qg', attributeName: 'Gate Charge (Qg)', unit: 'nC', sortOrder: 13 },
    'qg* (nc)': { attributeId: 'qg', attributeName: 'Gate Charge (Qg)', unit: 'nC', sortOrder: 13 },
    'ciss(pf)typ.': { attributeId: 'ciss', attributeName: 'Input Capacitance (Ciss)', unit: 'pF', sortOrder: 14 },
    'ciss (pf)': { attributeId: 'ciss', attributeName: 'Input Capacitance (Ciss)', unit: 'pF', sortOrder: 14 },
    'coss(pf)typ.': { attributeId: 'coss', attributeName: 'Output Capacitance (Coss)', unit: 'pF', sortOrder: 15 },
    'coss (pf)': { attributeId: 'coss', attributeName: 'Output Capacitance (Coss)', unit: 'pF', sortOrder: 15 },
    'crss(pf)typ.': { attributeId: 'crss', attributeName: 'Reverse Transfer Capacitance (Crss)', unit: 'pF', sortOrder: 16 },
    'crss (pf)': { attributeId: 'crss', attributeName: 'Reverse Transfer Capacitance (Crss)', unit: 'pF', sortOrder: 16 },
    'technology': { attributeId: 'technology', attributeName: 'Technology', sortOrder: 2 },
    'tech nology': { attributeId: 'technology', attributeName: 'Technology', sortOrder: 2 },
    '车规级 工业级': { attributeId: '_automotive_grade', attributeName: 'Automotive Grade', sortOrder: 96 },
    'package': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 4 },
    '封装/外壳': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 4 },
    '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 4 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 17 },
    // Convert/CREATEK English MFR-specific formats
    'vds(v)': { attributeId: 'vds_max', attributeName: 'Vds Max', unit: 'V', sortOrder: 6 },
    'vgs(v)': { attributeId: 'vgs_max', attributeName: 'Vgs Max', unit: 'V', sortOrder: 7 },
    'vgs(th)(v)': { attributeId: 'vgs_th', attributeName: 'Gate Threshold (Vth)', unit: 'V', sortOrder: 8 },
    'id(a)  @25°c': { attributeId: 'id_max', attributeName: 'Drain Current (Id)', unit: 'A', sortOrder: 9 },
    'rds(on)@vgs=4.5v(ω)': { attributeId: 'rds_on', attributeName: 'Rds(on)', unit: 'Ω', sortOrder: 11 },
    'rds(on)@vgs=10v(ω)': { attributeId: 'rds_on', attributeName: 'Rds(on)', unit: 'Ω', sortOrder: 11 },
    'rds(on) (mω) 4.5v typ': { attributeId: '_rds_on_4v5_typ', attributeName: 'Rds(on) @4.5V Typ', unit: 'mOhm', sortOrder: 95 },
    'rd(mω) typ': { attributeId: 'rds_on', attributeName: 'Rds(on)', unit: 'mΩ', sortOrder: 11 },
  },

  // ─── B6 BJTs ───────────────────────────────────────────
  B6: {
    '晶体管类型': { attributeId: 'polarity', attributeName: 'Polarity (NPN/PNP)', sortOrder: 1 },
    '极性': { attributeId: 'polarity', attributeName: 'Polarity (NPN/PNP)', sortOrder: 1 },
    '集射极击穿电压(vceo)': { attributeId: 'vceo_max', attributeName: 'Vceo', unit: 'V', sortOrder: 3 },
    '集电极-发射极饱和电压(vce(sat)@ic,ib)': { attributeId: 'vce_sat', attributeName: 'Vce(sat)', unit: 'V', sortOrder: 6 },
    '直流电流增益(hfe@ic,vce)': { attributeId: '_hfe', attributeName: 'DC Current Gain (hFE)', sortOrder: 7 },
    '集电极截止电流(icbo)': { attributeId: '_icbo', attributeName: 'Collector Cutoff Current', sortOrder: 91 },
    '功率(pd)': { attributeId: '_pd', attributeName: 'Power Dissipation', unit: 'W', sortOrder: 8 },
    '特征频率(ft)': { attributeId: 'ft', attributeName: 'Transition Frequency (ft)', unit: 'MHz', sortOrder: 9 },
    '集电极电流(ic)': { attributeId: '_ic', attributeName: 'Collector Current (Ic)', unit: 'A', sortOrder: 5 },
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
    // CREATEK English MFR-specific formats
    'polarity': { attributeId: 'polarity', attributeName: 'Polarity (NPN/PNP)', sortOrder: 1 },
    'vcbo(v)': { attributeId: '_vcbo', attributeName: 'Vcbo', unit: 'V', sortOrder: 4 },
    'vceo(v)': { attributeId: 'vceo_max', attributeName: 'Vceo', unit: 'V', sortOrder: 3 },
    'vebo(v)': { attributeId: '_vebo', attributeName: 'Vebo', unit: 'V', sortOrder: 92 },
    'ic(ma)': { attributeId: '_ic', attributeName: 'Collector Current (Ic)', unit: 'mA', sortOrder: 5 },
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
    // Convert English MFR-specific formats
    'ic(a)@100℃': { attributeId: 'ic_max', attributeName: 'Ic (Continuous)', unit: 'A', sortOrder: 6 },
    'vth(v)typ': { attributeId: 'vgs_th', attributeName: 'Gate Threshold (Vth)', unit: 'V', sortOrder: 9 },
    'vce(v)_15_typ': { attributeId: '_vce_sat_typ', attributeName: 'Vce(sat) Typ', unit: 'V', sortOrder: 91 },
    'vce(v)_15_max': { attributeId: 'vce_sat', attributeName: 'Vce(sat)', unit: 'V', sortOrder: 7 },
    'vf(v)': { attributeId: '_diode_vf', attributeName: 'Co-packed Diode Vf', unit: 'V', sortOrder: 94 },
  },

  // ─── B8 SCRs / TRIACs ─────────────────────────────────
  B8: {
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
    '# of channel': { attributeId: 'channels', attributeName: 'Number of Channels', sortOrder: 15 },
    'propagation delay(ns)': { attributeId: 'propagation_delay', attributeName: 'Propagation Delay', unit: 'ns', sortOrder: 9 },
    'rise/fall time(ns)': { attributeId: '_rise_fall_time', attributeName: 'Rise/Fall Time', unit: 'ns', sortOrder: 90 },
    'delay matching(ns)': { attributeId: 'delay_matching', attributeName: 'Delay Matching', unit: 'ns', sortOrder: 11 },
    'max output current(a)': { attributeId: 'output_peak_current', attributeName: 'Output Peak Current', unit: 'A', sortOrder: 8 },
    'peak output current(a)': { attributeId: 'output_peak_current', attributeName: 'Output Peak Current', unit: 'A', sortOrder: 8 },
    'vin(v)': { attributeId: '_vin', attributeName: 'Input Voltage', unit: 'V', sortOrder: 91 },
    'input voltage range(v)': { attributeId: '_vin_range', attributeName: 'Input Voltage Range', unit: 'V', sortOrder: 92 },
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
    // 3PEAK English MFR-specific formats
    'isolation rating(vrms)': { attributeId: '_isolation_rating', attributeName: 'Isolation Rating', unit: 'Vrms', sortOrder: 101 },
    'output voltage max(v)': { attributeId: '_vout_max', attributeName: 'Max Output Voltage', unit: 'V', sortOrder: 100 },
    'output voltage min(v)': { attributeId: '_vout_min', attributeName: 'Min Output Voltage', unit: 'V', sortOrder: 102 },
  },

  // ─── C4 Op-Amps / Comparators ──────────────────────────
  C4: {
    'ch': { attributeId: 'channels', attributeName: 'Channels', sortOrder: 2 },
    '通道数': { attributeId: 'channels', attributeName: 'Channels', sortOrder: 2 },
    '通道': { attributeId: 'channels', attributeName: 'Channels', sortOrder: 2 },
    'gbwp(mhz)': { attributeId: 'gain_bandwidth', attributeName: 'Gain Bandwidth', unit: 'MHz', sortOrder: 5 },
    'gbwp(mhz)(typ.)': { attributeId: 'gain_bandwidth', attributeName: 'Gain Bandwidth', unit: 'MHz', sortOrder: 5 },
    'bw (mhz)': { attributeId: 'gain_bandwidth', attributeName: 'Gain Bandwidth', unit: 'MHz', sortOrder: 5 },
    'bw(mhz)': { attributeId: 'gain_bandwidth', attributeName: 'Gain Bandwidth', unit: 'MHz', sortOrder: 5 },
    '增益带宽积 (典型值)(mhz)': { attributeId: 'gain_bandwidth', attributeName: 'Gain Bandwidth', unit: 'MHz', sortOrder: 5 },
    'slew rate(v/μs)': { attributeId: 'slew_rate', attributeName: 'Slew Rate', unit: 'V/us', sortOrder: 6 },
    'slew rate(v/μs)(typ.)': { attributeId: 'slew_rate', attributeName: 'Slew Rate', unit: 'V/us', sortOrder: 6 },
    '压摆率 (典型值)(v/us)': { attributeId: 'slew_rate', attributeName: 'Slew Rate', unit: 'V/us', sortOrder: 6 },
    'vos(max)(mv)': { attributeId: 'vos', attributeName: 'Input Offset Voltage', unit: 'mV', sortOrder: 7 },
    'vos(max)(μv)': { attributeId: 'vos', attributeName: 'Input Offset Voltage', unit: 'uV', sortOrder: 7 },
    'vos(mv,max)': { attributeId: 'vos', attributeName: 'Input Offset Voltage', unit: 'mV', sortOrder: 7 },
    '输入失调电压@25℃ (max)(mv)': { attributeId: 'vos', attributeName: 'Input Offset Voltage', unit: 'mV', sortOrder: 7 },
    '失调电压(mv)': { attributeId: 'vos', attributeName: 'Input Offset Voltage', unit: 'mV', sortOrder: 7 },
    'vos tc(µv/°c)': { attributeId: 'vos_drift', attributeName: 'Vos Drift', unit: 'uV/°C', sortOrder: 8 },
    'vos tc(μv/℃)(typ.)': { attributeId: 'vos_drift', attributeName: 'Vos Drift', unit: 'uV/°C', sortOrder: 8 },
    'vos tc(μv/℃,typ.)': { attributeId: 'vos_drift', attributeName: 'Vos Drift', unit: 'uV/°C', sortOrder: 8 },
    'iq(typ.)(per ch)': { attributeId: 'supply_current', attributeName: 'Supply Current', sortOrder: 15 },
    'iq(typ.)(per ch)(μa)': { attributeId: 'supply_current', attributeName: 'Supply Current', unit: 'uA', sortOrder: 15 },
    'iq(max.)(per ch)': { attributeId: 'supply_current', attributeName: 'Supply Current', sortOrder: 15 },
    '每通道静态电流(典型值)(μa)': { attributeId: 'supply_current', attributeName: 'Supply Current', unit: 'uA', sortOrder: 15 },
    'ibias(pa)': { attributeId: 'ibias', attributeName: 'Input Bias Current', unit: 'pA', sortOrder: 9 },
    'ib(pa,typ.)': { attributeId: 'ibias', attributeName: 'Input Bias Current', unit: 'pA', sortOrder: 9 },
    '偏置电流 (±)(典型值)(pa)': { attributeId: 'ibias', attributeName: 'Input Bias Current', unit: 'pA', sortOrder: 9 },
    'rail-rail': { attributeId: 'rail_to_rail', attributeName: 'Rail-to-Rail', sortOrder: 17 },
    '轨到轨': { attributeId: 'rail_to_rail', attributeName: 'Rail-to-Rail', sortOrder: 17 },
    '轨对轨': { attributeId: 'rail_to_rail', attributeName: 'Rail-to-Rail', sortOrder: 17 },
    'cmrr(db)': { attributeId: 'cmrr', attributeName: 'CMRR', unit: 'dB', sortOrder: 10 },
    'output type': { attributeId: 'output_type', attributeName: 'Output Type', sortOrder: 12 },
    '输出类型': { attributeId: 'output_type', attributeName: 'Output Type', sortOrder: 12 },
    'tpd+': { attributeId: 'response_time', attributeName: 'Response Time', sortOrder: 13 },
    '传播延迟时间(μs)': { attributeId: 'response_time', attributeName: 'Response Time', sortOrder: 13 },
    'hyst.(mv)': { attributeId: '_hysteresis', attributeName: 'Hysteresis', unit: 'mV', sortOrder: 90 },
    'vdd(v)': { attributeId: '_supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 14 },
    '工作电压(min)(v)': { attributeId: '_supply_voltage_min', attributeName: 'Supply Voltage Min', unit: 'V', sortOrder: 91 },
    '工作电压 (min)(v)': { attributeId: '_supply_voltage_min', attributeName: 'Supply Voltage Min', unit: 'V', sortOrder: 91 },
    '工作电压(max)(v)': { attributeId: '_supply_voltage_max', attributeName: 'Supply Voltage Max', unit: 'V', sortOrder: 92 },
    '工作电压 (max)(v)': { attributeId: '_supply_voltage_max', attributeName: 'Supply Voltage Max', unit: 'V', sortOrder: 92 },
    'package': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 3 },
    '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 3 },
    '封装形式': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 3 },
    '温度范围 (℃)': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 16 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 16 },
    // 3PEAK English MFR-specific formats
    'en@1khz ( nv/√hz )': { attributeId: '_en', attributeName: 'Voltage Noise @1kHz', unit: 'nV/√Hz', sortOrder: 93 },
    'en@1khz( nv/√hz )': { attributeId: '_en', attributeName: 'Voltage Noise @1kHz', unit: 'nV/√Hz', sortOrder: 93 },
    'en@1khz(nv/√hz)': { attributeId: '_en', attributeName: 'Voltage Noise @1kHz', unit: 'nV/√Hz', sortOrder: 93 },
    'en@1khz(nv/√hz)(typ.)': { attributeId: '_en', attributeName: 'Voltage Noise @1kHz', unit: 'nV/√Hz', sortOrder: 93 },
    'vos(max)': { attributeId: 'vos', attributeName: 'Input Offset Voltage', unit: 'mV', sortOrder: 7 },
    'vos(mv)(max)': { attributeId: 'vos', attributeName: 'Input Offset Voltage', unit: 'mV', sortOrder: 7 },
    'vos  (µv, max)': { attributeId: 'vos', attributeName: 'Input Offset Voltage', unit: 'µV', sortOrder: 7 },
    'vos  (mv, max)': { attributeId: 'vos', attributeName: 'Input Offset Voltage', unit: 'mV', sortOrder: 7 },
    'vos tc  (µv/°c, max)': { attributeId: 'vos_drift', attributeName: 'Vos Drift', unit: 'µV/°C', sortOrder: 8 },
    'vos tc  (µv/°c, typ.)': { attributeId: 'vos_drift', attributeName: 'Vos Drift', unit: 'µV/°C', sortOrder: 8 },
    'vos tc (µv/°c)': { attributeId: 'vos_drift', attributeName: 'Vos Drift', unit: 'µV/°C', sortOrder: 8 },
    'gbwp': { attributeId: 'gain_bandwidth', attributeName: 'Gain Bandwidth', unit: 'MHz', sortOrder: 5 },
    'iq(max.)(per ch)(μa)': { attributeId: 'supply_current', attributeName: 'Supply Current', unit: 'µA', sortOrder: 15 },
    'iq(typ.)(per ch)(ma)': { attributeId: 'supply_current', attributeName: 'Supply Current', unit: 'mA', sortOrder: 15 },
    'iq per channel(μa)(max)': { attributeId: 'supply_current', attributeName: 'Supply Current', unit: 'µA', sortOrder: 15 },
    'iq(typ.)(1 channel)(ma)': { attributeId: 'supply_current', attributeName: 'Supply Current', unit: 'mA', sortOrder: 15 },
    'iq (µa, typ.)': { attributeId: 'supply_current', attributeName: 'Supply Current', unit: 'µA', sortOrder: 15 },
    'iq (ma, max)': { attributeId: 'supply_current', attributeName: 'Supply Current', unit: 'mA', sortOrder: 15 },
    'iq(μa,typ.)': { attributeId: 'supply_current', attributeName: 'Supply Current', unit: 'µA', sortOrder: 15 },
    'iout(ma)': { attributeId: '_iout', attributeName: 'Output Current', unit: 'mA', sortOrder: 94 },
    'sink/source current(ma)(typ.)': { attributeId: '_iout', attributeName: 'Output Current', unit: 'mA', sortOrder: 94 },
    'ib(pa)(typ.)': { attributeId: 'ibias', attributeName: 'Input Bias Current', unit: 'pA', sortOrder: 9 },
    'ib (µa, typ.)': { attributeId: 'ibias', attributeName: 'Input Bias Current', unit: 'µA', sortOrder: 9 },
    'ib (na, typ.)': { attributeId: 'ibias', attributeName: 'Input Bias Current', unit: 'nA', sortOrder: 9 },
    'open loop gain(db)(typ.)': { attributeId: '_avol', attributeName: 'Open Loop Gain', unit: 'dB', sortOrder: 95 },
    'cmrr (db, min)': { attributeId: 'cmrr', attributeName: 'CMRR', unit: 'dB', sortOrder: 10 },
    'common mode voltage  (v)': { attributeId: '_vicm', attributeName: 'Common Mode Voltage Range', unit: 'V', sortOrder: 96 },
    'supply voltage(v)(min)': { attributeId: '_supply_voltage_min', attributeName: 'Supply Voltage Min', unit: 'V', sortOrder: 91 },
    'supply voltage(v)(max)': { attributeId: '_supply_voltage_max', attributeName: 'Supply Voltage Max', unit: 'V', sortOrder: 92 },
    'vdd (v)': { attributeId: '_supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 14 },
    'vdd  (v)': { attributeId: '_supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 14 },
    'slew rate': { attributeId: 'slew_rate', attributeName: 'Slew Rate', unit: 'V/us', sortOrder: 6 },
    'slew rate  (v/µs)': { attributeId: 'slew_rate', attributeName: 'Slew Rate', unit: 'V/us', sortOrder: 6 },
    'gmin(v/v)': { attributeId: '_gmin', attributeName: 'Min Stable Gain', unit: 'V/V', sortOrder: 97 },
    'tpd-': { attributeId: 'response_time', attributeName: 'Propagation Delay', sortOrder: 13 },
    'rail-rail in': { attributeId: 'rail_to_rail', attributeName: 'Rail-to-Rail Input', sortOrder: 17 },
    'rail-rail out': { attributeId: 'rail_to_rail', attributeName: 'Rail-to-Rail Output', sortOrder: 17 },
    'temp range (°c)': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 16 },
    'insulation rating(vrms)': { attributeId: '_isolation', attributeName: 'Isolation Rating', unit: 'Vrms', sortOrder: 98 },
  },

  // ─── C7 Interface ICs ──────────────────────────────────
  C7: {
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
    // 3PEAK English MFR-specific formats
    'max data rate(mbps)': { attributeId: 'data_rate', attributeName: 'Max Data Rate', unit: 'Mbps', sortOrder: 5 },
    'max data rate(kbps)': { attributeId: 'data_rate', attributeName: 'Max Data Rate', unit: 'kbps', sortOrder: 5 },
    'data rate (max)(kbps)': { attributeId: 'data_rate', attributeName: 'Max Data Rate', unit: 'kbps', sortOrder: 5 },
    'iec-61000-4-2 contact(kv)': { attributeId: 'esd_rating', attributeName: 'ESD Rating (IEC)', unit: 'kV', sortOrder: 10 },
    'esd hbm(kv)': { attributeId: 'esd_rating', attributeName: 'ESD HBM', unit: 'kV', sortOrder: 10 },
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
    'operating temperature range(℃)': { attributeId: 'operating_temp', attributeName: 'Operating Temperature', unit: '°C', sortOrder: 16 },
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
    'vdd(v)': { attributeId: 'supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 6 },
    'vih(min)(v)': { attributeId: 'vih', attributeName: 'Input High Voltage', unit: 'V', sortOrder: 8 },
    'vil(max)(v)': { attributeId: 'vil', attributeName: 'Input Low Voltage', unit: 'V', sortOrder: 9 },
    'ron(ω)': { attributeId: '_ron', attributeName: 'On-Resistance', unit: 'Ω', sortOrder: 92 },
    'ton(ns)': { attributeId: 'tpd', attributeName: 'Propagation Delay', unit: 'ns', sortOrder: 10 },
    'toff(ns)': { attributeId: '_toff', attributeName: 'Turn-Off Time', unit: 'ns', sortOrder: 93 },
    'leakage current(na)': { attributeId: 'input_leakage', attributeName: 'Leakage Current', unit: 'nA', sortOrder: 94 },
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
    // 3PEAK English MFR-specific formats
    "resolution'": { attributeId: 'resolution_bits', attributeName: 'Resolution', unit: 'bits', sortOrder: 2 },
    'update rate(msps)': { attributeId: '_update_rate', attributeName: 'Update Rate', unit: 'MSPS', sortOrder: 96 },
    "ch'": { attributeId: 'channel_count', attributeName: 'Channels', sortOrder: 4 },
    'datum': { attributeId: '_reference', attributeName: 'Reference', sortOrder: 97 },
    'sfdr(db)': { attributeId: '_sfdr', attributeName: 'SFDR', unit: 'dB', sortOrder: 98 },
    "vdd(v)'": { attributeId: '_supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 8 },
    'power(mw)': { attributeId: '_power', attributeName: 'Power Consumption', unit: 'mW', sortOrder: 99 },
    'inl(lsb)': { attributeId: 'inl_lsb', attributeName: 'INL', unit: 'LSB', sortOrder: 10 },
  },
};

// ── L2 Category Dictionaries (no logic tables, display-only) ─────────
const L2_PARAMS = {
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
    '存储器格式': { attributeId: 'memory_format', attributeName: 'Memory Format', sortOrder: 2 },
    '格式': { attributeId: 'memory_format', attributeName: 'Memory Format', sortOrder: 2 },
    '技术': { attributeId: 'memory_technology', attributeName: 'Technology', sortOrder: 3 },
    '存储容量': { attributeId: 'memory_size', attributeName: 'Memory Size', sortOrder: 4 },
    '容量': { attributeId: 'memory_size', attributeName: 'Memory Size', sortOrder: 4 },
    '存储器组织': { attributeId: 'memory_organization', attributeName: 'Memory Organization', sortOrder: 5 },
    '架构': { attributeId: 'memory_organization', attributeName: 'Memory Organization', sortOrder: 5 },
    '组织': { attributeId: 'memory_organization', attributeName: 'Memory Organization', sortOrder: 5 },
    '接口': { attributeId: 'memory_interface', attributeName: 'Interface', sortOrder: 6 },
    '接口类型': { attributeId: 'memory_interface', attributeName: 'Interface', sortOrder: 6 },
    '时钟频率': { attributeId: 'clock_frequency', attributeName: 'Clock Frequency', unit: 'Hz', sortOrder: 7 },
    '速率': { attributeId: 'clock_frequency', attributeName: 'Clock Frequency', unit: 'Hz', sortOrder: 7 },
    '频率': { attributeId: 'clock_frequency', attributeName: 'Clock Frequency', unit: 'Hz', sortOrder: 7 },
    '频率(mhz)': { attributeId: 'clock_frequency', attributeName: 'Clock Frequency', unit: 'MHz', sortOrder: 7 },
    '写周期时间': { attributeId: 'write_cycle_time', attributeName: 'Write Cycle Time', sortOrder: 8 },
    '访问时间': { attributeId: 'access_time', attributeName: 'Access Time', sortOrder: 9 },
    '供电电压': { attributeId: 'supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 10 },
    '工作电压': { attributeId: 'supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 10 },
    '电压': { attributeId: 'supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 10 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temp Range', sortOrder: 11 },
    '温度': { attributeId: 'operating_temp', attributeName: 'Operating Temp Range', sortOrder: 11 },
    '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 12 },
  },
  Sensors: {
    '传感器类型': { attributeId: 'sensor_type', attributeName: 'Sensor Type', sortOrder: 1 },
    '测量': { attributeId: 'measuring', attributeName: 'Measuring', sortOrder: 2 },
    '输出类型': { attributeId: 'output_type', attributeName: 'Output Type / Interface', sortOrder: 3 },
    '精度': { attributeId: 'accuracy', attributeName: 'Accuracy', sortOrder: 5 },
    '灵敏度': { attributeId: 'sensitivity', attributeName: 'Sensitivity', sortOrder: 6 },
    '轴': { attributeId: 'axis', attributeName: 'Axis', sortOrder: 8 },
    '测量范围': { attributeId: 'measurement_range', attributeName: 'Measurement Range', sortOrder: 9 },
    '带宽': { attributeId: 'bandwidth', attributeName: 'Bandwidth', unit: 'Hz', sortOrder: 12 },
    '响应时间': { attributeId: 'response_time', attributeName: 'Response Time', sortOrder: 13 },
    '频率': { attributeId: 'frequency', attributeName: 'Frequency', unit: 'Hz', sortOrder: 14 },
    '通道数': { attributeId: 'channel_count', attributeName: 'Number of Channels', sortOrder: 16 },
    '供电电压': { attributeId: 'supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 17 },
    '工作电压': { attributeId: 'supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 17 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temp Range', sortOrder: 18 },
    '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 19 },
    'package': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 19 },
  },
  Connectors: {
    '连接器类型': { attributeId: 'connector_type', attributeName: 'Connector Type', sortOrder: 1 },
    '触点类型': { attributeId: 'contact_type', attributeName: 'Contact Type', sortOrder: 2 },
    '针脚数': { attributeId: 'positions', attributeName: 'Number of Positions', sortOrder: 3 },
    'pin数': { attributeId: 'positions', attributeName: 'Number of Positions', sortOrder: 3 },
    '端口数': { attributeId: 'positions', attributeName: 'Number of Positions', sortOrder: 3 },
    '引脚数': { attributeId: 'positions', attributeName: 'Number of Positions', sortOrder: 3 },
    '行数': { attributeId: 'rows', attributeName: 'Number of Rows', sortOrder: 4 },
    '排数': { attributeId: 'rows', attributeName: 'Number of Rows', sortOrder: 4 },
    '间距': { attributeId: 'pitch', attributeName: 'Pitch', sortOrder: 5 },
    '脚间距': { attributeId: 'pitch', attributeName: 'Pitch', sortOrder: 5 },
    '触头镀层': { attributeId: 'contact_finish', attributeName: 'Contact Finish', sortOrder: 6 },
    '安装类型': { attributeId: 'mounting_type', attributeName: 'Mounting Type', sortOrder: 7 },
    '高度': { attributeId: 'height_above_board', attributeName: 'Height Above Board', unit: 'mm', sortOrder: 8 },
    '额定电流': { attributeId: 'current_rating', attributeName: 'Current Rating', unit: 'A', sortOrder: 10 },
    '额定电压': { attributeId: 'voltage_rating', attributeName: 'Voltage Rating', unit: 'V', sortOrder: 11 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temp Range', sortOrder: 12 },
    '工作温度范围': { attributeId: 'operating_temp', attributeName: 'Operating Temp Range', sortOrder: 12 },
    '适用温度': { attributeId: 'operating_temp', attributeName: 'Operating Temp Range', sortOrder: 12 },
  },
  'LEDs and Optoelectronics': {
    '颜色': { attributeId: 'color', attributeName: 'Color', sortOrder: 1 },
    '波长': { attributeId: 'wavelength_dominant', attributeName: 'Wavelength (Dominant)', unit: 'nm', sortOrder: 3 },
    '主波长': { attributeId: 'wavelength_dominant', attributeName: 'Wavelength (Dominant)', unit: 'nm', sortOrder: 3 },
    '光强': { attributeId: 'luminous_intensity', attributeName: 'Luminous Intensity', unit: 'mcd', sortOrder: 5 },
    '发光强度': { attributeId: 'luminous_intensity', attributeName: 'Luminous Intensity', unit: 'mcd', sortOrder: 5 },
    '视角': { attributeId: 'viewing_angle', attributeName: 'Viewing Angle', sortOrder: 6 },
    '正向电压': { attributeId: 'forward_voltage', attributeName: 'Forward Voltage (Vf)', unit: 'V', sortOrder: 7 },
    '正向压降': { attributeId: 'forward_voltage', attributeName: 'Forward Voltage (Vf)', unit: 'V', sortOrder: 7 },
    '测试电流': { attributeId: 'test_current', attributeName: 'Test Current', unit: 'mA', sortOrder: 8 },
    '安装类型': { attributeId: 'mounting_type', attributeName: 'Mounting Type', sortOrder: 11 },
    '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 12 },
    'package': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 12 },
  },
  Switches: {
    '电路': { attributeId: 'circuit', attributeName: 'Circuit', sortOrder: 1 },
    '触点形式': { attributeId: 'circuit', attributeName: 'Circuit', sortOrder: 1 },
    '开关功能': { attributeId: 'switch_function', attributeName: 'Switch Function', sortOrder: 2 },
    '触点额定值': { attributeId: 'contact_rating', attributeName: 'Contact Rating', sortOrder: 3 },
    '执行器类型': { attributeId: 'actuator_type', attributeName: 'Actuator Type', sortOrder: 4 },
    '按动力': { attributeId: 'operating_force', attributeName: 'Operating Force', sortOrder: 6 },
    '操作力': { attributeId: 'operating_force', attributeName: 'Operating Force', sortOrder: 6 },
    '照明': { attributeId: 'illumination', attributeName: 'Illumination', sortOrder: 7 },
    '安装类型': { attributeId: 'mounting_type', attributeName: 'Mounting Type', sortOrder: 8 },
    '长x宽/尺寸': { attributeId: 'outline', attributeName: 'Dimensions', sortOrder: 9 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temp Range', sortOrder: 10 },
    '额定电流-dc': { attributeId: 'current_rating', attributeName: 'Current Rating', unit: 'A', sortOrder: 11 },
    '额定电流': { attributeId: 'current_rating', attributeName: 'Current Rating', unit: 'A', sortOrder: 11 },
    '额定电压-dc': { attributeId: 'voltage_rating_dc', attributeName: 'Voltage Rating (DC)', unit: 'V', sortOrder: 12 },
    '额定电压-ac': { attributeId: 'voltage_rating_ac', attributeName: 'Voltage Rating (AC)', unit: 'V', sortOrder: 13 },
    '触头镀层': { attributeId: 'contact_finish', attributeName: 'Contact Finish', sortOrder: 14 },
    '颜色-盖帽': { attributeId: 'illumination_color', attributeName: 'Cap Color', sortOrder: 15 },
    '开关位数': { attributeId: 'num_positions', attributeName: 'Number of Positions', sortOrder: 16 },
    '高度': { attributeId: 'actuator_height', attributeName: 'Height', unit: 'mm', sortOrder: 17 },
  },
  'RF and Wireless': {
    '类型': { attributeId: 'type', attributeName: 'Type', sortOrder: 1 },
    '协议': { attributeId: 'protocol', attributeName: 'Protocol', sortOrder: 3 },
    '调制方式': { attributeId: 'modulation', attributeName: 'Modulation', sortOrder: 4 },
    '频率': { attributeId: 'frequency', attributeName: 'Frequency', unit: 'Hz', sortOrder: 5 },
    '数据速率': { attributeId: 'data_rate_max', attributeName: 'Data Rate (Max)', sortOrder: 8 },
    '输出功率': { attributeId: 'output_power', attributeName: 'Output Power', sortOrder: 9 },
    '灵敏度': { attributeId: 'sensitivity', attributeName: 'Sensitivity', sortOrder: 10 },
    '增益': { attributeId: 'gain', attributeName: 'Gain', sortOrder: 11 },
    '供电电压': { attributeId: 'supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 14 },
    '工作电压': { attributeId: 'supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 14 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temp Range', sortOrder: 15 },
  },
  'Power Supplies': {
    '类型': { attributeId: 'type', attributeName: 'Type', sortOrder: 1 },
    '输出路数': { attributeId: 'num_outputs', attributeName: 'Number of Outputs', sortOrder: 2 },
    '输出端数': { attributeId: 'num_outputs', attributeName: 'Number of Outputs', sortOrder: 2 },
    '输入电压': { attributeId: 'input_voltage', attributeName: 'Input Voltage', unit: 'V', sortOrder: 3 },
    '供电电压': { attributeId: 'input_voltage', attributeName: 'Input Voltage', unit: 'V', sortOrder: 3 },
    '开关频率': { attributeId: 'switching_frequency', attributeName: 'Switching Frequency', sortOrder: 5 },
    '输出电压': { attributeId: 'output_voltage', attributeName: 'Output Voltage', unit: 'V', sortOrder: 6 },
    '输出电流': { attributeId: 'output_current_max', attributeName: 'Output Current (Max)', unit: 'A', sortOrder: 7 },
    '功率': { attributeId: 'power_watts', attributeName: 'Power', unit: 'W', sortOrder: 8 },
    '额定功率': { attributeId: 'power_watts', attributeName: 'Power', unit: 'W', sortOrder: 8 },
    '输出功率': { attributeId: 'power_watts', attributeName: 'Power', unit: 'W', sortOrder: 8 },
    '隔离电压': { attributeId: 'isolation_voltage', attributeName: 'Isolation Voltage', sortOrder: 9 },
    '效率': { attributeId: 'efficiency', attributeName: 'Efficiency', sortOrder: 10 },
    '效率(typ)': { attributeId: 'efficiency', attributeName: 'Efficiency', sortOrder: 10 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temp Range', sortOrder: 11 },
    '安装类型': { attributeId: 'mounting_type', attributeName: 'Mounting Type', sortOrder: 12 },
    '高度': { attributeId: 'height', attributeName: 'Height', unit: 'mm', sortOrder: 13 },
  },
  Transformers: {
    '类型': { attributeId: 'type', attributeName: 'Type', sortOrder: 1 },
    '变压器类型': { attributeId: 'transformer_type', attributeName: 'Transformer Type', sortOrder: 2 },
    '匝比': { attributeId: 'turns_ratio', attributeName: 'Turns Ratio', sortOrder: 3 },
    '初级电压': { attributeId: 'primary_voltage', attributeName: 'Primary Voltage', unit: 'V', sortOrder: 4 },
    '隔离电压': { attributeId: 'isolation_voltage', attributeName: 'Isolation Voltage', sortOrder: 5 },
    '电感': { attributeId: 'inductance', attributeName: 'Inductance', sortOrder: 6 },
    '频率': { attributeId: 'frequency', attributeName: 'Frequency', unit: 'Hz', sortOrder: 8 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temp Range', sortOrder: 9 },
    '安装类型': { attributeId: 'mounting_type', attributeName: 'Mounting Type', sortOrder: 10 },
  },
  Filters: {
    '类型': { attributeId: 'type', attributeName: 'Type', sortOrder: 1 },
    '滤波器阶数': { attributeId: 'filter_order', attributeName: 'Filter Order', sortOrder: 2 },
    '技术': { attributeId: 'technology', attributeName: 'Technology', sortOrder: 3 },
    '通道数': { attributeId: 'channel_count', attributeName: 'Number of Channels', sortOrder: 4 },
    '截止频率': { attributeId: 'cutoff_frequency', attributeName: 'Cutoff Frequency', unit: 'Hz', sortOrder: 5 },
    '衰减': { attributeId: 'attenuation', attributeName: 'Attenuation', sortOrder: 6 },
    '插入损耗': { attributeId: 'insertion_loss', attributeName: 'Insertion Loss', sortOrder: 7 },
    '额定电流': { attributeId: 'current_rating', attributeName: 'Current Rating', unit: 'A', sortOrder: 8 },
    '额定电压': { attributeId: 'voltage_rated', attributeName: 'Voltage Rating', unit: 'V', sortOrder: 9 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temp Range', sortOrder: 10 },
    '安装类型': { attributeId: 'mounting_type', attributeName: 'Mounting Type', sortOrder: 11 },
    '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 12 },
    'package': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 12 },
  },
  Processors: {
    '可编程类型': { attributeId: 'programmable_type', attributeName: 'Programmable Type', sortOrder: 1 },
    '逻辑单元数': { attributeId: 'logic_elements', attributeName: 'Logic Elements/Cells', sortOrder: 3 },
    'ram容量': { attributeId: 'total_ram', attributeName: 'Total RAM Bits', sortOrder: 6 },
    'io数量': { attributeId: 'io_count', attributeName: 'Number of I/O', sortOrder: 7 },
    '供电电压': { attributeId: 'supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 9 },
    '工作电压': { attributeId: 'supply_voltage', attributeName: 'Supply Voltage', unit: 'V', sortOrder: 9 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temp Range', sortOrder: 11 },
    '封装': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 12 },
    'package': { attributeId: 'package_case', attributeName: 'Package / Case', sortOrder: 12 },
  },
  Audio: {
    '类型': { attributeId: 'type', attributeName: 'Type', sortOrder: 1 },
    '频率': { attributeId: 'frequency', attributeName: 'Frequency', unit: 'Hz', sortOrder: 4 },
    '频率范围': { attributeId: 'frequency_range', attributeName: 'Frequency Range', sortOrder: 5 },
    '阻抗': { attributeId: 'impedance', attributeName: 'Impedance', unit: 'Ohm', sortOrder: 6 },
    '声压级': { attributeId: 'spl', attributeName: 'Sound Pressure Level', sortOrder: 7 },
    '灵敏度': { attributeId: 'sensitivity', attributeName: 'Sensitivity', sortOrder: 8 },
    '输出类型': { attributeId: 'output_type', attributeName: 'Output Type', sortOrder: 10 },
    '额定功率': { attributeId: 'power_rated', attributeName: 'Rated Power', unit: 'W', sortOrder: 11 },
    '额定电压': { attributeId: 'voltage_rated', attributeName: 'Rated Voltage', sortOrder: 12 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temp Range', sortOrder: 14 },
    '安装类型': { attributeId: 'mounting_type', attributeName: 'Mounting Type', sortOrder: 15 },
  },
  'Battery Products': {
    '电池化学成分': { attributeId: 'chemistry', attributeName: 'Chemistry', sortOrder: 1 },
    '电池尺寸': { attributeId: 'cell_size', attributeName: 'Cell Size', sortOrder: 2 },
    '额定电压': { attributeId: 'voltage_rated', attributeName: 'Rated Voltage', unit: 'V', sortOrder: 3 },
    '标称电压': { attributeId: 'voltage_rated', attributeName: 'Rated Voltage', unit: 'V', sortOrder: 3 },
    '容量': { attributeId: 'capacity', attributeName: 'Capacity', sortOrder: 4 },
  },
  'Motors and Fans': {
    '风扇类型': { attributeId: 'fan_type', attributeName: 'Fan Type', sortOrder: 1 },
    '额定电压': { attributeId: 'voltage_rated', attributeName: 'Rated Voltage', sortOrder: 2 },
    '功率': { attributeId: 'power_watts', attributeName: 'Power', unit: 'W', sortOrder: 3 },
    '转速': { attributeId: 'rpm', attributeName: 'Speed (RPM)', sortOrder: 4 },
    '风量': { attributeId: 'airflow', attributeName: 'Air Flow', sortOrder: 5 },
    '噪音': { attributeId: 'noise', attributeName: 'Noise Level', sortOrder: 7 },
    '轴承类型': { attributeId: 'bearing_type', attributeName: 'Bearing Type', sortOrder: 8 },
    '工作温度': { attributeId: 'operating_temp', attributeName: 'Operating Temp Range', sortOrder: 12 },
  },
};

// Parameters to skip (metadata, not parametric)
const SKIP_PARAMS = new Set([
  'description', '品牌', '原始制造商', '最小包装', '包装', '元件生命周期',
  '零件状态', '原产国家', '是否无铅', '安装类型', '引脚数', '卷盘尺寸',
  '脚间距', '长x宽/尺寸', '高度', '存储温度', '印字代码', '成分', '认证信息',
  '商品目录', '系列', '系列名称', '等级', '特性', '应用领域', '应用', '封装技术',
  '产品状态', '序号', 'category_name', '描述', 'class', '印字类型', '无卤',
  'product status', 'mounting style', 'package type', 'esd diode', 'frd diode', 'mos type',
  '安装方式', '包装高度', '包装长度', '包装宽度', 'rating',
]);

// Status mapping
const STATUS_MAP = {
  'mp': 'Active', 'mass production': 'Active', 's': 'Active', 'sampling': 'Active',
  'active': 'Active', 'eol': 'Obsolete', 'obsolete': 'Obsolete',
  'discontinued': 'Discontinued', 'nrnd': 'NRND', 'ltb': 'LastTimeBuy',
};

// ─── Value helpers ────────────────────────────────────────

function isMissing(value) {
  const t = value.trim();
  return t === '-' || t === '/' || t === '' || t === 'N/A' || t === 'n/a';
}

function extractNumeric(value) {
  if (isMissing(value)) return undefined;
  const t = value.trim();

  const rangeMatch = t.match(/^([+-]?\d+\.?\d*)\s*[~–]\s*([+-]?\d+\.?\d*)/);
  if (rangeMatch) return parseFloat(rangeMatch[1]);

  const pmMatch = t.match(/^[±]\s*(\d+\.?\d*)/);
  if (pmMatch) return parseFloat(pmMatch[1]);
  const altPmMatch = t.match(/^\+\/-\s*(\d+\.?\d*)/);
  if (altPmMatch) return parseFloat(altPmMatch[1]);

  const numMatch = t.match(/([+-]?\d+\.?\d*)/);
  if (numMatch) return parseFloat(numMatch[1]);

  return undefined;
}

function normalizeTemp(value) {
  const match = value.match(/([+-−]?\d+)\s*[℃°]?\s*[C]?\s*[~–]\s*\+?([+-−]?\d+)\s*[℃°]?\s*[C]?/);
  if (match) return `${match[1].replace('−', '-')}°C to ${match[2].replace('−', '-')}°C`;
  return value;
}

function normalizeVoltageRange(value) {
  const match = value.match(/(\d+\.?\d*)\s*[~–]\s*(\d+\.?\d*)\s*V?/);
  if (match) return `${match[1]} V to ${match[2]} V`;
  return value;
}

function cleanManufacturerName(raw) {
  const englishPart = raw.match(/^[\x20-\x7E]+/)?.[0]?.trim();
  return englishPart || raw.trim();
}

// ─── Main mapping function ────────────────────────────────

function mapModel(model, manufacturerName, sourceFile) {
  const warnings = [];

  const classification = classifyAtlasCategory(
    model.category.c1.name,
    model.category.c2.name,
    model.category.c3.name,
  );

  // Resolve status
  let status = 'Active';
  for (const p of model.parameters) {
    const ln = p.name.toLowerCase();
    if (ln === '状态' || ln === 'status' || ln === '零件状态') {
      const mapped = STATUS_MAP[p.value.toLowerCase().trim()];
      if (mapped) status = mapped;
    }
  }

  // Build Part identity
  const part = {
    mpn: model.componentName,
    manufacturer: cleanManufacturerName(manufacturerName),
    description: model.description || '',
    category: classification.category,
    subcategory: classification.subcategory,
    familyId: classification.familyId,
    status,
    datasheetUrl: model.datasheetUrl || null,
  };

  // Map parameters
  const familyDict = classification.familyId
    ? FAMILY_PARAMS[classification.familyId]
    : L2_PARAMS[classification.category];
  const gaiaDict = classification.familyId
    ? GAIA_FAMILIES[classification.familyId]
    : GAIA_L2[classification.category];
  const parameters = {};
  let packageValue = null;

  for (const p of model.parameters) {
    if (isMissing(p.value)) continue;

    const lowerName = p.name.toLowerCase().trim();
    // Dictionary entries take priority over skip list
    const hasDictMapping = !!(familyDict?.[lowerName] ?? SHARED_PARAMS[lowerName]);
    if (!hasDictMapping && (SKIP_PARAMS.has(p.name) || SKIP_PARAMS.has(lowerName))) continue;
    if (lowerName === '状态' || lowerName === 'status' || lowerName === '零件状态') continue;

    // ── Gaia parameter handling ──────────────────────────────
    const gaia = parseGaiaParam(p.name);
    if (gaia) {
      if (GAIA_SKIP_STEMS.has(gaia.stem)) continue;
      const gaiaMapping = gaiaDict?.[gaia.stem] ?? GAIA_SHARED[gaia.stem];
      if (!gaiaMapping) {
        // Store with auto-humanized name (nothing thrown away)
        if (!parameters[gaia.stem]) {
          const parsed = parseGaiaValue(p.value);
          parameters[gaia.stem] = {
            value: parsed.displayValue,
            ...(parsed.numericValue !== undefined && { numericValue: parsed.numericValue }),
            ...(parsed.unit ? { unit: parsed.unit } : {}),
          };
        }
        continue;
      }
      if (gaiaMapping.preferredSuffix && gaia.suffix && gaia.suffix !== gaiaMapping.preferredSuffix) continue;
      if (gaiaMapping.attributeId.startsWith('_')) continue;
      if (parameters[gaiaMapping.attributeId]) continue; // dedup

      const parsed = parseGaiaValue(p.value);
      let displayValue = parsed.displayValue;
      if (gaiaMapping.attributeId === 'operating_temp') displayValue = normalizeTemp(p.value);
      if (gaiaMapping.attributeId === 'package_case') packageValue = displayValue;

      parameters[gaiaMapping.attributeId] = {
        value: displayValue,
        ...(parsed.numericValue !== undefined && { numericValue: parsed.numericValue }),
        ...(gaiaMapping.unit ? { unit: gaiaMapping.unit } : parsed.unit ? { unit: parsed.unit } : {}),
      };
      continue;
    }

    // ── Standard dictionary lookup (Chinese + English) ───────
    const mapping = familyDict?.[lowerName] ?? SHARED_PARAMS[lowerName];
    if (!mapping) {
      // Store with raw param name (nothing thrown away)
      const rawId = lowerName.replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
      if (rawId && !parameters[rawId]) {
        parameters[rawId] = {
          value: p.value.trim(),
          ...(extractNumeric(p.value) !== undefined && { numericValue: extractNumeric(p.value) }),
        };
      }
      continue;
    }

    if (mapping.attributeId.startsWith('_')) continue;
    if (parameters[mapping.attributeId]) continue; // dedup

    let displayValue = p.value.trim();
    const numericValue = extractNumeric(displayValue);

    if (mapping.attributeId === 'operating_temp') displayValue = normalizeTemp(displayValue);
    if (mapping.attributeId === 'input_voltage_range') displayValue = normalizeVoltageRange(displayValue);

    if (mapping.attributeId === 'package_case') packageValue = displayValue;

    parameters[mapping.attributeId] = {
      value: displayValue,
      ...(numericValue !== undefined && { numericValue }),
      ...(mapping.unit && { unit: mapping.unit }),
    };
  }

  // Post-mapping: synthesize output_voltage for LDOs from min/max
  if (classification.familyId === 'C1' && !parameters.output_voltage) {
    const minV = model.parameters.find(p => p.name.toLowerCase().includes('最小输出电压'))?.value;
    const maxV = model.parameters.find(p => p.name.toLowerCase().includes('最大输出电压'))?.value;
    if (minV && maxV && !isMissing(minV) && !isMissing(maxV)) {
      const minNum = extractNumeric(minV);
      const maxNum = extractNumeric(maxV);
      if (minNum !== undefined && maxNum !== undefined) {
        if (minNum === maxNum) {
          parameters.output_voltage = { value: `${minNum} V`, numericValue: minNum, unit: 'V' };
        } else {
          parameters.output_voltage = { value: `${minNum} V to ${maxNum} V`, numericValue: minNum, unit: 'V' };
          if (!parameters.output_type) {
            parameters.output_type = { value: 'Adjustable' };
          }
        }
      }
    }
  }

  return { part, parameters, packageValue, classification, warnings };
}

// ─── CLI ──────────────────────────────────────────────────

const args = process.argv.slice(2);
const files = [];
let dryRun = false;
let familyFilter = null;
let verbose = false;
let showWarnings = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dry-run') { dryRun = true; continue; }
  if (args[i] === '--family') { familyFilter = args[++i]; continue; }
  if (args[i] === '--verbose') { verbose = true; continue; }
  if (args[i] === '--warnings') { showWarnings = true; continue; }
  files.push(args[i]);
}

if (files.length === 0) {
  console.error('Usage: node scripts/atlas-ingest.mjs <json-files...> [--dry-run] [--family C6] [--verbose] [--warnings]');
  process.exit(1);
}

if (!dryRun && (!SUPABASE_URL || !SUPABASE_SERVICE_KEY)) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  console.error('Use --dry-run to test mapping without database connection.');
  process.exit(1);
}

// Create Supabase client (service role bypasses RLS)
const supabase = !dryRun ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY) : null;

async function processFile(filePath) {
  const fileName = basename(filePath);
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`Processing: ${fileName}`);
  console.log(`${'═'.repeat(60)}`);

  const raw = readFileSync(resolve(filePath), 'utf-8');
  const data = JSON.parse(raw);
  const mfrName = data.manufacturer.name;

  let total = 0, mapped = 0, skipped = 0, errors = 0;
  const familyCounts = {};
  const allWarnings = [];
  const batch = [];

  for (const model of data.models) {
    total++;

    try {
      const result = mapModel(model, mfrName, fileName);

      // Apply family filter
      if (familyFilter && result.classification.familyId !== familyFilter) {
        skipped++;
        continue;
      }

      mapped++;
      const fam = result.classification.familyId || '(uncovered)';
      familyCounts[fam] = (familyCounts[fam] || 0) + 1;

      if (verbose) {
        const paramCount = Object.keys(result.parameters).length;
        console.log(`  ${result.part.mpn} → ${fam} (${paramCount} params)`);
      }

      if (showWarnings && result.warnings.length > 0) {
        for (const w of result.warnings) {
          console.log(`    ⚠ ${w}`);
          allWarnings.push(`${result.part.mpn}: ${w}`);
        }
      }

      if (!dryRun) {
        batch.push({
          mpn: result.part.mpn,
          manufacturer: result.part.manufacturer,
          description: result.part.description || null,
          category: result.part.category,
          subcategory: result.part.subcategory,
          family_id: result.classification.familyId,
          status: result.part.status,
          datasheet_url: result.part.datasheetUrl,
          package: result.packageValue,
          parameters: result.parameters,
          atlas_source_file: fileName,
          atlas_raw: model,
          manufacturer_country: 'CN',
        });
      }
    } catch (err) {
      errors++;
      console.error(`  ERROR: ${model.componentName}: ${err.message}`);
    }
  }

  // Upsert batch to Supabase
  if (!dryRun && batch.length > 0) {
    console.log(`\n  Upserting ${batch.length} products to Supabase...`);

    // Batch in chunks of 500
    const CHUNK_SIZE = 500;
    let upserted = 0;
    for (let i = 0; i < batch.length; i += CHUNK_SIZE) {
      const chunk = batch.slice(i, i + CHUNK_SIZE);
      const { error } = await supabase
        .from('atlas_products')
        .upsert(chunk, { onConflict: 'mpn,manufacturer', ignoreDuplicates: false });

      if (error) {
        console.error(`  Supabase error (chunk ${Math.floor(i / CHUNK_SIZE) + 1}): ${error.message}`);
      } else {
        upserted += chunk.length;
      }
    }
    console.log(`  Upserted: ${upserted} products`);
  }

  // Summary
  console.log(`\n  Summary for ${cleanManufacturerName(mfrName)}:`);
  console.log(`    Total models: ${total}`);
  console.log(`    Mapped: ${mapped}${familyFilter ? ` (filtered to ${familyFilter})` : ''}`);
  console.log(`    Skipped: ${skipped}`);
  console.log(`    Errors: ${errors}`);
  console.log(`    By family:`);
  for (const [fam, count] of Object.entries(familyCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`      ${fam}: ${count}`);
  }

  if (allWarnings.length > 0) {
    console.log(`    Unmapped param warnings: ${allWarnings.length}`);
  }

  return { total, mapped, skipped, errors };
}

// Run
(async () => {
  console.log(`Atlas Ingestion${dryRun ? ' (DRY RUN)' : ''}`);
  console.log(`Files: ${files.length}`);
  if (familyFilter) console.log(`Family filter: ${familyFilter}`);

  let grandTotal = 0, grandMapped = 0, grandSkipped = 0, grandErrors = 0;

  for (const file of files) {
    const result = await processFile(file);
    grandTotal += result.total;
    grandMapped += result.mapped;
    grandSkipped += result.skipped;
    grandErrors += result.errors;
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`GRAND TOTAL: ${grandTotal} models, ${grandMapped} mapped, ${grandSkipped} skipped, ${grandErrors} errors`);
  console.log(`${'═'.repeat(60)}`);

  // Run description extraction on newly ingested products
  if (!dryRun && grandMapped > 0 && process.env.ANTHROPIC_API_KEY) {
    console.log(`\nRunning description extraction on ingested products...`);
    const { execSync } = await import('child_process');
    try {
      const familyArg = familyFilter ? `--family ${familyFilter}` : '';
      execSync(`npx tsx scripts/atlas-extract-descriptions.ts ${familyArg} --concurrency 10`, {
        stdio: 'inherit',
        cwd: process.cwd(),
      });
    } catch (err) {
      console.error('Description extraction failed (non-fatal):', err.message);
    }

    console.log(`\nRunning description cleanup on ingested products...`);
    try {
      const familyArg = familyFilter ? `--family ${familyFilter}` : '';
      execSync(`npx tsx scripts/atlas-clean-descriptions.ts ${familyArg} --concurrency 10`, {
        stdio: 'inherit',
        cwd: process.cwd(),
      });
    } catch (err) {
      console.error('Description cleanup failed (non-fatal):', err.message);
    }
  }
})();
