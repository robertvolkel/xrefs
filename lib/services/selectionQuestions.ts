import { getLogicTable } from '../logicTables';
import type { MatchingRule, SelectionAttr } from '../types';

/**
 * Per-family minimum attribute sets for greenfield part selection.
 *
 * Transcribed verbatim from docs/min_attr_sets.md (the verified source of truth):
 *   - tier2 = "Required to Search" — the agent must have these before searching.
 *   - tier3 = "Result Set Discriminators" — asked to narrow a large result set.
 *
 * Every attributeId here is asserted to exist in getLogicTable(familyId) by
 * __tests__/services/selectionQuestions.test.ts (drift guard). When the logic
 * tables or this list change, that test keeps the two in sync.
 */
export const SELECTION_TIERS: Record<string, { tier2: string[]; tier3: string[] }> = {
  // Block A — Passives
  '12': { tier2: ['capacitance', 'package_case', 'voltage_rated', 'dielectric'], tier3: ['tolerance', 'flexible_termination'] },
  '13': { tier2: ['capacitance', 'package_case', 'voltage_rated', 'dielectric'], tier3: ['tolerance', 'temperature_coefficient'] },
  '52': { tier2: ['resistance', 'package_case', 'power_rating'], tier3: ['tolerance', 'tcr'] },
  '53': { tier2: ['resistance', 'mounting_style', 'lead_spacing', 'power_rating'], tier3: ['tolerance', 'composition'] },
  '54': { tier2: ['resistance', 'package_case', 'power_rating', 'kelvin_sensing'], tier3: ['tolerance', 'tcr'] },
  '55': { tier2: ['resistance', 'power_rating', 'mounting_style', 'heatsink_dimensions'], tier3: ['tolerance', 'thermal_resistance'] },
  '58': { tier2: ['capacitance', 'voltage_rated', 'polarization', 'mounting_type', 'diameter', 'lead_spacing'], tier3: ['esr', 'ripple_current', 'lifetime'] },
  '59': { tier2: ['capacitance', 'voltage_rated', 'package_case', 'capacitor_type'], tier3: ['esr', 'failure_mode'] },
  '60': { tier2: ['capacitance', 'voltage_rated', 'polarization', 'mounting_type', 'esr'], tier3: ['ripple_current', 'tolerance'] },
  '61': { tier2: ['capacitance', 'voltage_rated', 'package_case', 'esr'], tier3: ['leakage_current', 'peak_current'] },
  '64': { tier2: ['capacitance', 'package_case', 'lead_spacing', 'voltage_rated_dc', 'safety_rating'], tier3: ['voltage_rated_ac', 'tolerance', 'dielectric_type'] },
  '65': { tier2: ['varistor_voltage', 'max_continuous_voltage', 'package_case'], tier3: ['energy_rating', 'peak_surge_current', 'safety_rating'] },
  '66': { tier2: ['hold_current', 'max_voltage', 'trip_current', 'package_case'], tier3: ['initial_resistance', 'time_to_trip'] },
  '67': { tier2: ['resistance_r25', 'b_value', 'package_case'], tier3: ['r25_tolerance', 'b_value_tolerance'] },
  '68': { tier2: ['resistance_r25', 'curie_temp', 'package_case'], tier3: ['trip_current', 'hold_current'] },
  '69': { tier2: ['cm_impedance', 'package_case', 'rated_current', 'number_of_lines'], tier3: ['dcr', 'application_type'] },
  '70': { tier2: ['impedance_100mhz', 'package_case', 'rated_current'], tier3: ['dcr', 'number_of_lines'] },
  '71': { tier2: ['inductance', 'package_case', 'saturation_current', 'rated_current'], tier3: ['dcr', 'shielding'] },
  '72': { tier2: ['inductance', 'package_case', 'rated_current', 'srf'], tier3: ['q_factor', 'core_material'] },

  // Block B — Discrete Semiconductors
  'B1': { tier2: ['vrrm', 'io_avg', 'recovery_category', 'configuration', 'package_case'], tier3: ['vf', 'trr'] },
  'B2': { tier2: ['vrrm', 'io_avg', 'configuration', 'package_case', 'semiconductor_material'], tier3: ['vf', 'ir_leakage'] },
  'B3': { tier2: ['vz', 'pd', 'configuration', 'pin_configuration', 'package_case'], tier3: ['vz_tolerance', 'zzt'] },
  'B4': { tier2: ['polarity', 'vrwm', 'vc', 'num_channels', 'configuration', 'package_case'], tier3: ['ppk', 'cj'] },
  'B5': { tier2: ['channel_type', 'vds_max', 'id_max', 'package_case'], tier3: ['rds_on', 'vgs_th'] },
  'B6': { tier2: ['polarity', 'vceo_max', 'ic_max', 'package_case'], tier3: ['hfe', 'vce_sat'] },
  'B7': { tier2: ['vces_max', 'ic_max', 'package_case', 'co_packaged_diode'], tier3: ['vce_sat', 'eoff'] },
  'B8': { tier2: ['device_type', 'vdrm', 'on_state_current', 'package_case'], tier3: ['igt', 'ih'] },
  'B9': { tier2: ['channel_type', 'vp', 'idss', 'package_case'], tier3: ['gfs', 'igss'] },

  // Block C — Integrated Circuits
  'C1': { tier2: ['output_type', 'polarity', 'output_voltage', 'iout_max', 'package_case'], tier3: ['vdropout', 'output_cap_compatibility'] },
  'C2': { tier2: ['topology', 'architecture', 'vin_max', 'vout_range', 'iout_max', 'package_case'], tier3: ['fsw', 'control_mode', 'vref'] },
  'C3': { tier2: ['driver_configuration', 'isolation_type', 'peak_source_current', 'peak_sink_current', 'vdd_range', 'package_case'], tier3: ['propagation_delay', 'dead_time_control'] },
  'C4': { tier2: ['device_type', 'channels', 'input_type', 'supply_voltage', 'package_case'], tier3: ['gain_bandwidth', 'vicm_range', 'input_bias_current'] },
  'C5': { tier2: ['logic_function', 'gate_count', 'supply_voltage', 'package_case'], tier3: ['logic_family', 'vih', 'tpd'] },
  'C6': { tier2: ['configuration', 'output_voltage', 'adjustability', 'package_case'], tier3: ['initial_accuracy', 'tc'] },
  'C7': { tier2: ['protocol', 'operating_mode', 'data_rate', 'supply_voltage', 'package_case'], tier3: ['isolation_type', 'bus_fault_protection'] },
  'C8': { tier2: ['device_category', 'output_frequency_hz', 'output_signal_type', 'supply_voltage_range', 'package_case'], tier3: ['initial_tolerance_ppm', 'temp_stability_ppm'] },
  'C9': { tier2: ['architecture', 'resolution_bits', 'interface_type', 'input_configuration', 'channel_count', 'package_case'], tier3: ['sample_rate_sps', 'enob', 'simultaneous_sampling'] },
  'C10': { tier2: ['output_type', 'resolution_bits', 'interface_type', 'output_buffered', 'package_case'], tier3: ['update_rate_sps', 'power_on_reset_state', 'output_voltage_range'] },

  // Block D — Frequency & Protection
  'D1': { tier2: ['nominal_frequency_hz', 'load_capacitance_pf', 'package_type', 'cut_type', 'overtone_order'], tier3: ['equivalent_series_resistance_ohm', 'frequency_tolerance_ppm'] },
  'D2': { tier2: ['current_rating_a', 'voltage_rating_v', 'breaking_capacity_a', 'speed_class', 'package_format'], tier3: ['voltage_type', 'i2t_rating_a2s'] },

  // Block E — Optoelectronics
  'E1': { tier2: ['output_transistor_type', 'isolation_voltage_vrms', 'channel_count', 'package_type'], tier3: ['ctr_min_pct', 'bandwidth_khz'] },

  // Block F — Switching & Electromechanical
  'F1': { tier2: ['coil_voltage_vdc', 'contact_form', 'mounting_type', 'contact_count', 'contact_voltage_rating_v', 'contact_current_rating_a'], tier3: ['package_footprint', 'coil_resistance_ohm'] },
  'F2': { tier2: ['output_switch_type', 'firing_mode', 'mounting_type', 'load_voltage_max_v', 'load_current_max_a', 'input_voltage_range_v'], tier3: ['on_state_voltage_drop_v', 'isolation_voltage_vrms'] },
};

/**
 * Extract a CLOSED option set (for choice buttons), or undefined when there isn't a
 * clean one. Whether a spec is a "choice" is decided SOLELY by this — NOT by logicType.
 * `logicType` describes how the engine scores a match; many numeric specs (output_voltage,
 * nominal_frequency_hz, coil_voltage_vdc) are scored by `identity` exact-match yet are
 * typed VALUES, not pick-lists. Deriving "choice" from logicType mislabels those.
 *
 * Source order: an explicit upgrade hierarchy, else a slash-delimited list inside the
 * rule's attributeName parenthetical (e.g. "Output Type (Fixed / Adjustable / Tracking /
 * Negative)"). Rejects:
 *   - non-parenthetical slashes ("Package / Footprint" — an open set, type it in prose),
 *   - single-character tokens ("Channel Type (N/P)", "Safety Rating (X/Y Class)" → the
 *     parse would invent cryptic/garbage chips like "X", "N"),
 *   - parentheticals carrying a unit/symbol rather than choices ("(Vin Max)", "(Iout Max)").
 * A surviving option must be ≥2 chars and contain a letter.
 */
function parseOptions(rule: MatchingRule): string[] | undefined {
  if (rule.upgradeHierarchy && rule.upgradeHierarchy.length >= 2) return [...rule.upgradeHierarchy];
  const paren = rule.attributeName.match(/\(([^)]*)\)/);
  if (!paren || !paren[1].includes('/')) return undefined;
  const opts = paren[1].split('/').map(s => s.trim()).filter(Boolean);
  const valid = opts.length >= 2 && opts.every(o => o.length >= 2 && /[A-Za-z]/.test(o));
  return valid ? opts : undefined;
}

function toSelectionAttr(attributeId: string, ruleById: Map<string, MatchingRule>): SelectionAttr | null {
  const rule = ruleById.get(attributeId);
  if (!rule) return null;
  const options = parseOptions(rule);
  const attr: SelectionAttr = {
    attributeId,
    label: rule.attributeName,
    input: options ? 'choice' : 'value',
  };
  if (options) attr.options = options;
  return attr;
}

export interface SelectionQuestions {
  tier2: SelectionAttr[];
  tier3: SelectionAttr[];
}

/**
 * Resolve a family's Tier 2 / Tier 3 selection questions against its live logic table.
 * Labels, kinds, and chip options are read from the (runtime-merged) logic-table rules,
 * so variant families inherit base rules. Returns null for an unknown family or one with
 * no selection tiers. IDs that somehow miss a rule are dropped (the guard test prevents this).
 */
export function getSelectionQuestions(familyId: string): SelectionQuestions | null {
  const tiers = SELECTION_TIERS[familyId];
  if (!tiers) return null;
  const table = getLogicTable(familyId);
  if (!table) return null;
  const ruleById = new Map(table.rules.map(r => [r.attributeId, r]));
  const map = (ids: string[]): SelectionAttr[] =>
    ids.map(id => toSelectionAttr(id, ruleById)).filter((a): a is SelectionAttr => a !== null);
  return { tier2: map(tiers.tier2), tier3: map(tiers.tier3) };
}

/**
 * Which selection tier an attribute belongs to for a family, or null.
 * Used by the admin "Attribute Templates" read-only marker.
 */
export function getSelectionTier(familyId: string, attributeId: string): 'tier2' | 'tier3' | null {
  const tiers = SELECTION_TIERS[familyId];
  if (!tiers) return null;
  if (tiers.tier2.includes(attributeId)) return 'tier2';
  if (tiers.tier3.includes(attributeId)) return 'tier3';
  return null;
}
