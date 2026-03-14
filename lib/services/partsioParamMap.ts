/**
 * Parts.io Parameter Mapping
 *
 * Maps parts.io field names → internal attributeId values.
 * Organized per parts.io Class (17 classes confirmed from real API testing).
 * Field names verified against live API responses (Mar 2026).
 *
 * Uses same ParamMapping type from digikeyParamMap.ts for consistency.
 */

import type { ParamMapping, ParamMapEntry } from './digikeyParamMap';
import type { MatchingRule } from '../types';

// ============================================================
// CLASS PARAM MAPS (17 classes)
// ============================================================

/**
 * Capacitors class — Families 12, 58, 59, 60, 61
 * Tested MPNs: GRM188R71E105KA12, TAJB106K016RNJ, UCD1V101MNL1GS, 860020672012
 * NOT IN DB: 13 Mica, 64 Film
 */
const capacitorsParamMap: Record<string, ParamMapEntry> = {
  'Capacitance': {
    attributeId: 'capacitance', attributeName: 'Capacitance', unit: 'µF', sortOrder: 1,
  },
  'Rated (DC) Voltage (URdc)': {
    attributeId: 'voltage_rated', attributeName: 'Voltage Rated', unit: 'V', sortOrder: 2,
  },
  'Dielectric Material': {
    attributeId: 'capacitor_type', attributeName: 'Capacitor Type', sortOrder: 3,
  },
  'Temperature Characteristics Code': {
    attributeId: 'dielectric', attributeName: 'Dielectric / Temp Characteristic', sortOrder: 4,
  },
  'Temperature Coefficient': {
    attributeId: 'temperature_coefficient', attributeName: 'Temperature Coefficient', sortOrder: 5,
  },
  'ESR': {
    attributeId: 'esr', attributeName: 'ESR', unit: 'mΩ', sortOrder: 6,
  },
  'Leakage Current': {
    attributeId: 'leakage_current', attributeName: 'Leakage Current', unit: 'mA', sortOrder: 7,
  },
  'Tan Delta': {
    attributeId: 'dissipation_factor', attributeName: 'Dissipation Factor (tan δ)', sortOrder: 8,
  },
  'Ripple Current': {
    attributeId: 'ripple_current', attributeName: 'Ripple Current', unit: 'mA', sortOrder: 9,
  },
  'Polarity': {
    attributeId: 'polarization', attributeName: 'Polarization', sortOrder: 10,
  },
  'Positive Tolerance': {
    attributeId: 'tolerance', attributeName: 'Tolerance', unit: '%', sortOrder: 11,
  },
  'Height': {
    attributeId: 'height', attributeName: 'Height', unit: 'mm', sortOrder: 12,
  },
  'Reference Standard': {
    attributeId: 'aec_q200', attributeName: 'AEC-Q200 Qualification', sortOrder: 13,
  },
};

/**
 * Resistors class — Families 52-54, 65, 66, 67, 68
 * Tested MPNs: RC0402FR-0710KL, CFR-25JB-52-10K, WSL2512R0100FEA, ERZV07D391, MF-MSMF050, NCP18XH103F03RB
 * NOT IN DB: 55 Chassis Mount
 */
const resistorsParamMap: Record<string, ParamMapEntry> = {
  'Resistance': {
    attributeId: 'resistance', attributeName: 'Resistance', unit: 'Ω', sortOrder: 1,
  },
  'Tolerance': {
    attributeId: 'tolerance', attributeName: 'Tolerance', unit: '%', sortOrder: 2,
  },
  'Rated Power Dissipation (P)': {
    attributeId: 'power_rating', attributeName: 'Power Rating', unit: 'W', sortOrder: 3,
  },
  'Temperature Coefficient': {
    attributeId: 'tcr', attributeName: 'Temperature Coefficient', unit: 'ppm/°C', sortOrder: 4,
  },
  'Working Voltage': {
    attributeId: 'voltage_rated', attributeName: 'Working Voltage', unit: 'V', sortOrder: 5,
  },
  'Technology': {
    attributeId: 'composition', attributeName: 'Composition / Technology', sortOrder: 6,
  },
  'Anti-Sulfur': {
    attributeId: 'anti_sulfur', attributeName: 'Anti-Sulfur', sortOrder: 7,
  },
  'Thermal Sensitivity Index': {
    attributeId: 'b_value', attributeName: 'B-Value (NTC)', sortOrder: 8,
  },
  'Circuit RMS Voltage-Max': {
    attributeId: 'max_voltage', attributeName: 'Maximum Voltage', unit: 'V', sortOrder: 9,
  },
  'Reference Standard': {
    attributeId: 'safety_rating', attributeName: 'Safety Rating', sortOrder: 10,
  },
  'Energy Absorbing Capacity-Max': {
    attributeId: 'energy_rating', attributeName: 'Energy Rating', unit: 'J', sortOrder: 11,
  },
  'Height': {
    attributeId: 'height', attributeName: 'Height', unit: 'mm', sortOrder: 12,
  },
};

/**
 * Inductors class — Families 71, 72
 * Tested MPNs: SRR1280-100M, 0805LS-102XJLB
 */
const inductorsParamMap: Record<string, ParamMapEntry> = {
  'Inductance-Nom (L)': {
    attributeId: 'inductance', attributeName: 'Inductance', unit: 'µH', sortOrder: 1,
  },
  'DC Resistance': {
    attributeId: 'dcr', attributeName: 'DC Resistance', unit: 'Ω', sortOrder: 2,
  },
  'Rated Current-Max': {
    attributeId: 'rated_current', attributeName: 'Rated Current', unit: 'A', sortOrder: 3,
  },
  'Self Resonance Frequency': {
    attributeId: 'srf', attributeName: 'Self-Resonant Frequency', unit: 'MHz', sortOrder: 4,
  },
  'Core Material': {
    attributeId: 'core_material', attributeName: 'Core Material', sortOrder: 5,
  },
  'Shielded': {
    attributeId: 'shielding', attributeName: 'Shielding', sortOrder: 6,
  },
  'Tolerance': {
    attributeId: 'tolerance', attributeName: 'Tolerance', unit: '%', sortOrder: 7,
  },
  'Quality Factor-Min': {
    attributeId: 'q_factor', attributeName: 'Quality Factor (Q)', sortOrder: 8,
  },
  'Inductor Application': {
    attributeId: 'inductor_type', attributeName: 'Inductor Application', sortOrder: 9,
  },
};

/**
 * Filters class (NEW 17th class) — Families 69, 70
 * Tested MPNs: ACM2012-900-2P-T002, BLM18PG121SN1D
 * CM Chokes + Ferrite Beads classified here, NOT under "Inductors"
 */
const filtersParamMap: Record<string, ParamMapEntry> = {
  'Output Impedance': {
    attributeId: 'impedance_100mhz', attributeName: 'Impedance', unit: 'Ω', sortOrder: 1,
  },
  'Rated Current-Max': {
    attributeId: 'rated_current', attributeName: 'Rated Current', unit: 'A', sortOrder: 2,
  },
  'DC Resistance-Max': {
    attributeId: 'dcr', attributeName: 'DC Resistance', unit: 'Ω', sortOrder: 3,
  },
  'Rated Voltage': {
    attributeId: 'voltage_rated', attributeName: 'Rated Voltage', unit: 'V', sortOrder: 4,
  },
  'Number of Functions': {
    attributeId: 'number_of_lines', attributeName: 'Number of Lines', sortOrder: 5,
  },
  'Insulation Resistance-Min': {
    attributeId: 'insulation_voltage', attributeName: 'Insulation Resistance', unit: 'MΩ', sortOrder: 6,
  },
  'Construction': {
    attributeId: 'construction_type', attributeName: 'Construction', sortOrder: 7,
  },
};

/**
 * Diodes class — Families B1, B2, B3, B4
 * Tested MPNs: BAV99, BAT54S, BZX84-C5V1, SMBJ5.0A
 */
const diodesParamMap: Record<string, ParamMapEntry> = {
  'Rep Pk Reverse Voltage-Max': {
    attributeId: 'vrrm', attributeName: 'Repetitive Peak Reverse Voltage', unit: 'V', sortOrder: 1,
  },
  'Forward Voltage-Max': {
    attributeId: 'vf', attributeName: 'Forward Voltage', unit: 'V', sortOrder: 2,
  },
  'Output Current-Max': {
    attributeId: 'io_avg', attributeName: 'Average Forward Current', unit: 'A', sortOrder: 3,
  },
  'Reverse Recovery Time-Max': {
    attributeId: 'trr', attributeName: 'Reverse Recovery Time', unit: 'µs', sortOrder: 4,
  },
  'Power Dissipation-Max': {
    attributeId: 'pd', attributeName: 'Power Dissipation', unit: 'W', sortOrder: 5,
  },
  'Reference Voltage-Nom': {
    attributeId: 'vz', attributeName: 'Zener Voltage', unit: 'V', sortOrder: 6,
  },
  'Dynamic Impedance-Max': {
    attributeId: 'zzt', attributeName: 'Dynamic Impedance', unit: 'Ω', sortOrder: 7,
  },
  'Knee Impedance-Max': {
    attributeId: 'knee_impedance', attributeName: 'Knee Impedance', unit: 'Ω', sortOrder: 8,
  },
  'Voltage Temp Coeff-Max': {
    attributeId: 'vtc', attributeName: 'Voltage Temperature Coefficient', unit: 'mV/°C', sortOrder: 9,
  },
  'Clamping Voltage-Max': {
    attributeId: 'vc', attributeName: 'Clamping Voltage', unit: 'V', sortOrder: 10,
  },
  'Breakdown Voltage-Min': {
    attributeId: 'vbr_min', attributeName: 'Breakdown Voltage (min)', unit: 'V', sortOrder: 11,
  },
  'Breakdown Voltage-Max': {
    attributeId: 'vbr_max', attributeName: 'Breakdown Voltage (max)', unit: 'V', sortOrder: 12,
  },
  'Non-rep Peak Rev Power Dis-Max': {
    attributeId: 'ppk', attributeName: 'Peak Pulse Power', unit: 'W', sortOrder: 13,
  },
  'Leakage Current-Max': {
    attributeId: 'ir_leakage', attributeName: 'Reverse Leakage Current', unit: 'µA', sortOrder: 14,
  },
};

/**
 * Transistors class — Families B5, B6, B7
 * Tested MPNs: IRF540N, 2N2222A, IKW40N120H3
 * NOT useful: B9 JFETs (only Crss — skipped)
 */
const transistorsParamMap: Record<string, ParamMapEntry> = {
  // MOSFETs (B5)
  'DS Breakdown Voltage-Min': {
    attributeId: 'vds_max', attributeName: 'Drain-Source Voltage', unit: 'V', sortOrder: 1,
  },
  'Drain Current-Max (ID)': {
    attributeId: 'id_max', attributeName: 'Continuous Drain Current', unit: 'A', sortOrder: 2,
  },
  'Drain-source On Resistance-Max': {
    attributeId: 'rds_on', attributeName: 'Drain-Source On Resistance', unit: 'Ω', sortOrder: 3,
  },
  'Pulsed Drain Current-Max (IDM)': {
    attributeId: 'id_pulse', attributeName: 'Pulsed Drain Current', unit: 'A', sortOrder: 4,
  },
  'Avalanche Energy Rating (Eas)': {
    attributeId: 'avalanche_energy', attributeName: 'Avalanche Energy', unit: 'mJ', sortOrder: 5,
  },
  // BJTs (B6)
  'DC Current Gain-Min': {
    attributeId: 'hfe', attributeName: 'DC Current Gain (hFE)', sortOrder: 6,
  },
  'VCEsat-Max': {
    attributeId: 'vce_sat', attributeName: 'VCE Saturation', unit: 'V', sortOrder: 7,
  },
  'Transition Frequency-Nom': {
    attributeId: 'ft', attributeName: 'Transition Frequency', unit: 'MHz', sortOrder: 8,
  },
  // BJT switching times (gap-fillers)
  'Turn-on Time': {
    attributeId: 'ton', attributeName: 'Turn-On Time', unit: 'ns', sortOrder: 9,
  },
  'Turn-off Time': {
    attributeId: 'toff', attributeName: 'Turn-Off Time', unit: 'ns', sortOrder: 10,
  },
  // Shared
  'Power Dissipation-Max (Abs)': {
    attributeId: 'pd', attributeName: 'Power Dissipation', unit: 'W', sortOrder: 11,
  },
  'Polarity/Channel Type': {
    attributeId: 'channel_type', attributeName: 'Polarity / Channel Type', sortOrder: 12,
  },
};

/**
 * Trigger Devices class — Family B8 (SCR + TRIAC)
 * Tested MPNs: BT151-500R (SCR), BTA16-600B (TRIAC)
 * BEST gap-fill target: tq, dv/dt, di/dt, i2t, il
 */
const triggerDevicesParamMap: Record<string, ParamMapEntry> = {
  'Repetitive Peak Off-state Voltage': {
    attributeId: 'vdrm', attributeName: 'Repetitive Peak Off-State Voltage', unit: 'V', sortOrder: 1,
  },
  'On-state Current-Max': {
    attributeId: 'on_state_current', attributeName: 'On-State Current', unit: 'A', sortOrder: 2,
  },
  'Non-Repetitive Pk On-state Cur': {
    attributeId: 'itsm', attributeName: 'Surge Current (ITSM)', unit: 'A', sortOrder: 3,
  },
  'DC Gate Trigger Current-Max': {
    attributeId: 'igt', attributeName: 'Gate Trigger Current', unit: 'mA', sortOrder: 4,
  },
  'DC Gate Trigger Voltage-Max': {
    attributeId: 'vgt', attributeName: 'Gate Trigger Voltage', unit: 'V', sortOrder: 5,
  },
  'Holding Current-Max': {
    attributeId: 'ih', attributeName: 'Holding Current', unit: 'mA', sortOrder: 6,
  },
  'Circuit Commutated Turn-off Time-Nom': {
    attributeId: 'tq', attributeName: 'Turn-Off Time (tq)', unit: 'µs', sortOrder: 7,
  },
  'Critical Rate of Rise of Off-State Voltage-Min': {
    attributeId: 'dv_dt', attributeName: 'dV/dt (off-state)', unit: 'V/µs', sortOrder: 8,
  },
  'Critical Rate of Rise of Commutation Voltage-Min': {
    attributeId: 'dv_dt_commutation', attributeName: 'dV/dt (commutation)', unit: 'V/µs', sortOrder: 9,
  },
  'Trigger Device Type': {
    attributeId: 'device_type', attributeName: 'Device Type', sortOrder: 10,
  },
  'On-State Voltage-Max': {
    attributeId: 'vt', attributeName: 'On-State Voltage', unit: 'V', sortOrder: 11,
  },
  'Leakage Current-Max': {
    attributeId: 'idrm', attributeName: 'Off-State Leakage Current', unit: 'mA', sortOrder: 12,
  },
};

/**
 * Amplifier Circuits class — Family C4 (Op-Amps)
 * Tested MPNs: LM358 (Kuwait Semi record)
 * cmrr + avol confirmed; vicm_range/GBW/slew NOT found
 */
const amplifierCircuitsParamMap: Record<string, ParamMapEntry> = {
  'CMRR-Min': {
    attributeId: 'cmrr', attributeName: 'CMRR (min)', unit: 'dB', sortOrder: 1,
  },
  'Voltage Gain-Min': {
    attributeId: 'avol', attributeName: 'Open-Loop Voltage Gain', unit: 'V/mV', sortOrder: 2,
  },
  'Input Offset Voltage-Max': {
    attributeId: 'input_offset_voltage', attributeName: 'Input Offset Voltage', unit: 'µV', sortOrder: 3,
  },
  'Avg Bias Current-Max (IIB)': {
    attributeId: 'input_bias_current', attributeName: 'Input Bias Current', unit: 'nA', sortOrder: 4,
  },
  'Supply Current-Max': {
    attributeId: 'iq', attributeName: 'Quiescent Current', unit: 'mA', sortOrder: 5,
  },
  'Amplifier Type': {
    attributeId: 'device_type', attributeName: 'Amplifier Type', sortOrder: 6,
  },
};

/**
 * Logic class — Family C5
 * Tested MPNs: SN74HC04N
 * logic_family, schmitt_trigger, tpd, drive_current confirmed
 */
const logicParamMap: Record<string, ParamMapEntry> = {
  'Family': {
    attributeId: 'logic_family', attributeName: 'Logic Family', sortOrder: 1,
  },
  'Logic IC Type': {
    attributeId: 'logic_function', attributeName: 'Logic Function', sortOrder: 2,
  },
  'Propagation Delay (tpd)': {
    attributeId: 'tpd', attributeName: 'Propagation Delay', unit: 'ns', sortOrder: 3,
  },
  'Max I(ol)': {
    attributeId: 'drive_current', attributeName: 'Output Drive Current', unit: 'A', sortOrder: 4,
  },
  'Schmitt Trigger': {
    attributeId: 'schmitt_trigger', attributeName: 'Schmitt Trigger Input', sortOrder: 5,
  },
  'Number of Functions': {
    attributeId: 'gate_count', attributeName: 'Number of Gates/Functions', sortOrder: 6,
  },
  'Technology': {
    attributeId: 'technology', attributeName: 'Technology', sortOrder: 7,
  },
  'Supply Voltage-Min (Vsup)': {
    attributeId: 'supply_voltage_min', attributeName: 'Supply Voltage Min', unit: 'V', sortOrder: 8,
  },
  'Supply Voltage-Max (Vsup)': {
    attributeId: 'supply_voltage_max', attributeName: 'Supply Voltage Max', unit: 'V', sortOrder: 9,
  },
};

/**
 * Power Circuits class — Families C1, C2, C6
 * Tested MPNs: LM1117IMPX-3.3, AMS1117-3.3, LM2576D2TR4-5G, TL431AIDBZR
 */
const powerCircuitsParamMap: Record<string, ParamMapEntry> = {
  // LDOs (C1)
  'Dropout Voltage1-Max': {
    attributeId: 'vdropout', attributeName: 'Dropout Voltage', unit: 'V', sortOrder: 1,
  },
  'Line Regulation-Max': {
    attributeId: 'line_regulation', attributeName: 'Line Regulation', unit: '%', sortOrder: 2,
  },
  'Load Regulation-Max': {
    attributeId: 'load_regulation', attributeName: 'Load Regulation', unit: '%', sortOrder: 3,
  },
  'Voltage Tolerance-Max': {
    attributeId: 'vout_accuracy', attributeName: 'Output Voltage Accuracy', unit: '%', sortOrder: 4,
  },
  'Output Voltage1-Nom': {
    attributeId: 'output_voltage', attributeName: 'Output Voltage', unit: 'V', sortOrder: 5,
  },
  'Output Current1-Max': {
    attributeId: 'iout_max', attributeName: 'Output Current', unit: 'A', sortOrder: 6,
  },
  'Input Voltage-Min': {
    attributeId: 'vin_min', attributeName: 'Input Voltage Min', unit: 'V', sortOrder: 7,
  },
  'Input Voltage-Max': {
    attributeId: 'vin_max', attributeName: 'Input Voltage Max', unit: 'V', sortOrder: 8,
  },
  'Adjustability': {
    attributeId: 'output_type', attributeName: 'Output Type (Fixed/Adjustable)', sortOrder: 9,
  },
  // Switching Regs (C2)
  'Switcher Configuration': {
    attributeId: 'topology', attributeName: 'Topology', sortOrder: 10,
  },
  'Control Mode': {
    attributeId: 'control_mode', attributeName: 'Control Mode', sortOrder: 11,
  },
  'Control Technique': {
    attributeId: 'modulation_type', attributeName: 'Modulation Type', sortOrder: 12,
  },
  'Switching Frequency-Max': {
    attributeId: 'fsw', attributeName: 'Switching Frequency', unit: 'kHz', sortOrder: 13,
  },
  // Voltage Refs (C6)
  'Temp Coef of Voltage-Max': {
    attributeId: 'tc', attributeName: 'Temperature Coefficient', unit: 'ppm/°C', sortOrder: 14,
  },
  'Trim/Adjustable Output': {
    attributeId: 'adjustability', attributeName: 'Adjustability', sortOrder: 15,
  },
  'Output Voltage-Nom': {
    attributeId: 'output_voltage', attributeName: 'Output Voltage', unit: 'V', sortOrder: 16,
  },
};

/**
 * Converters class — Families C9, C10
 * Tested MPNs: ADS1115IDGSR, DAC8568ICPW
 */
const convertersParamMap: Record<string, ParamMapEntry> = {
  'Converter Type': {
    attributeId: 'architecture', attributeName: 'Converter Type / Architecture', sortOrder: 1,
  },
  'Number of Bits': {
    attributeId: 'resolution_bits', attributeName: 'Resolution (bits)', sortOrder: 2,
  },
  'Number of Analog In Channels': {
    attributeId: 'channel_count', attributeName: 'Number of Channels', sortOrder: 3,
  },
  'Sample Rate': {
    attributeId: 'sample_rate_sps', attributeName: 'Sample Rate', unit: 'MSPS', sortOrder: 4,
  },
  'Linearity Error-Max (EL)': {
    attributeId: 'inl_lsb', attributeName: 'Integral Non-Linearity', sortOrder: 5,
  },
  'Settling Time-Max': {
    attributeId: 'settling_time_us', attributeName: 'Settling Time', unit: 'µs', sortOrder: 6,
  },
};

/**
 * Drivers And Interfaces class — Families C3, C7
 * Tested MPNs: UCC27211DR, MAX485ESA
 */
const driversAndInterfacesParamMap: Record<string, ParamMapEntry> = {
  'Interface Standard': {
    attributeId: 'protocol', attributeName: 'Interface Protocol', sortOrder: 1,
  },
  'Interface IC Type': {
    attributeId: 'operating_mode', attributeName: 'IC Type / Operating Mode', sortOrder: 2,
  },
  'Transmit Delay-Max': {
    attributeId: 'propagation_delay_tx', attributeName: 'Transmit Delay', unit: 'ns', sortOrder: 3,
  },
  'Receive Delay-Max': {
    attributeId: 'propagation_delay_rx', attributeName: 'Receive Delay', unit: 'ns', sortOrder: 4,
  },
  'Output Characteristics': {
    attributeId: 'output_type', attributeName: 'Output Characteristics', sortOrder: 5,
  },
  'Output Current-Max': {
    attributeId: 'peak_source_current', attributeName: 'Output Current', unit: 'A', sortOrder: 6,
  },
  'High Side Driver': {
    attributeId: 'driver_configuration', attributeName: 'Driver Configuration', sortOrder: 7,
  },
};

/**
 * Signal Circuits class — Family C8 (Timers/Oscillators)
 * Tested MPNs: NE555P, ICM7555IPAZ
 * Marginal: only Technology (CMOS/BIPOLAR) maps to timer_variant
 */
const signalCircuitsParamMap: Record<string, ParamMapEntry> = {
  'Technology': {
    attributeId: 'timer_variant', attributeName: 'Timer Variant (CMOS/Bipolar)', sortOrder: 1,
  },
  'Output Frequency-Max': {
    attributeId: 'output_frequency_hz', attributeName: 'Output Frequency', unit: 'Hz', sortOrder: 2,
  },
  'Supply Voltage-Min (Vsup)': {
    attributeId: 'supply_voltage_min', attributeName: 'Supply Voltage Min', unit: 'V', sortOrder: 3,
  },
  'Supply Voltage-Max (Vsup)': {
    attributeId: 'supply_voltage_max', attributeName: 'Supply Voltage Max', unit: 'V', sortOrder: 4,
  },
};

/**
 * Circuit Protection class — Family D2 (Fuses), also 66 (PTC Fuses via Resistors class)
 * Tested MPNs: 0251001.MXL
 */
const circuitProtectionParamMap: Record<string, ParamMapEntry> = {
  'Rated Current': {
    attributeId: 'current_rating_a', attributeName: 'Rated Current', unit: 'A', sortOrder: 1,
  },
  'Rated Voltage(AC)': {
    attributeId: 'voltage_rating_v', attributeName: 'Rated Voltage (AC)', unit: 'V', sortOrder: 2,
  },
  'Rated Voltage(DC)': {
    attributeId: 'voltage_rating_dc', attributeName: 'Rated Voltage (DC)', unit: 'V', sortOrder: 3,
  },
  'Rated Breaking Capacity': {
    attributeId: 'breaking_capacity_a', attributeName: 'Breaking Capacity', unit: 'A', sortOrder: 4,
  },
  'Blow Characteristic': {
    attributeId: 'speed_class', attributeName: 'Blow Characteristic / Speed', sortOrder: 5,
  },
  'Joule Integral-Nom': {
    attributeId: 'i2t_rating_a2s', attributeName: 'I²t Rating', unit: 'A²s', sortOrder: 6,
  },
  'Trip Time or Delay': {
    attributeId: 'melting_i2t_a2s', attributeName: 'Trip Time', unit: 's', sortOrder: 7,
  },
  'Fuse Size': {
    attributeId: 'package_format', attributeName: 'Fuse Size / Format', sortOrder: 8,
  },
};

/**
 * Optoelectronics class — Family E1 (Optocouplers), F2 (SSR/photoMOS)
 * Tested MPNs: 4N25, CPC1017N
 * SSR photoMOS classified under Optoelectronics, NOT Relays
 */
const optoelectronicsParamMap: Record<string, ParamMapEntry> = {
  'Current Transfer Ratio-Min': {
    attributeId: 'ctr_min_pct', attributeName: 'CTR Minimum', unit: '%', sortOrder: 1,
  },
  'Isolation Voltage-Max': {
    attributeId: 'isolation_voltage_vrms', attributeName: 'Isolation Voltage', unit: 'V', sortOrder: 2,
  },
  'Coll-Emtr Bkdn Voltage-Min': {
    attributeId: 'vceo', attributeName: 'Collector-Emitter Breakdown Voltage', unit: 'V', sortOrder: 3,
  },
  'Dark Current-Max': {
    attributeId: 'output_leakage_iceo_ua', attributeName: 'Dark Current', unit: 'nA', sortOrder: 4,
  },
  'Forward Current-Max': {
    attributeId: 'if_rated_ma', attributeName: 'Forward Current (max)', unit: 'A', sortOrder: 5,
  },
  'Forward Voltage-Max': {
    attributeId: 'input_forward_voltage_vf', attributeName: 'Forward Voltage', unit: 'V', sortOrder: 6,
  },
  'Response Time-Max': {
    attributeId: 'response_time', attributeName: 'Response Time', unit: 's', sortOrder: 7,
  },
  'On-State Current-Max': {
    attributeId: 'output_current_max', attributeName: 'Output Current', unit: 'A', sortOrder: 8,
  },
  'Optoelectronic Device Type': {
    attributeId: 'output_transistor_type', attributeName: 'Output Device Type', sortOrder: 9,
  },
  // SSR fields
  'Output Circuit Type': {
    attributeId: 'output_switch_type', attributeName: 'Output Circuit Type', sortOrder: 10,
  },
  'On-state Resistance-Max': {
    attributeId: 'on_resistance', attributeName: 'On-State Resistance', unit: 'Ω', sortOrder: 11,
  },
};

/**
 * Relays class — Family F1 (EMR only)
 * Tested MPNs: G5V-2-DC5
 * BEST coverage of any Part Type — 40+ fields
 */
const relaysParamMap: Record<string, ParamMapEntry> = {
  'Coil Voltage-Nom': {
    attributeId: 'coil_voltage_vdc', attributeName: 'Coil Voltage (nominal)', unit: 'V', sortOrder: 1,
  },
  'Coil Resistance': {
    attributeId: 'coil_resistance_ohm', attributeName: 'Coil Resistance', unit: 'Ω', sortOrder: 2,
  },
  'Coil Current(DC)-Max': {
    attributeId: 'coil_current', attributeName: 'Coil Current', unit: 'A', sortOrder: 3,
  },
  'Coil Power': {
    attributeId: 'coil_power_mw', attributeName: 'Coil Power', unit: 'mW', sortOrder: 4,
  },
  'Coil Operate Voltage(DC)': {
    attributeId: 'must_operate_voltage_v', attributeName: 'Must Operate Voltage', unit: 'V', sortOrder: 5,
  },
  'Coil Release Voltage(DC)': {
    attributeId: 'must_release_voltage_v', attributeName: 'Must Release Voltage', unit: 'V', sortOrder: 6,
  },
  'Contact Current(DC)-Max': {
    attributeId: 'contact_current_rating_a', attributeName: 'Contact Current Rating', unit: 'A', sortOrder: 7,
  },
  'Contact Voltage(AC)-Max': {
    attributeId: 'contact_voltage_ac', attributeName: 'Contact Voltage (AC)', unit: 'V', sortOrder: 8,
  },
  'Contact Voltage(DC)-Max': {
    attributeId: 'contact_voltage_rating_v', attributeName: 'Contact Voltage (DC)', unit: 'V', sortOrder: 9,
  },
  'Relay Function': {
    attributeId: 'contact_form', attributeName: 'Contact Form', sortOrder: 10,
  },
  'Relay Form': {
    attributeId: 'contact_count', attributeName: 'Contact Count / Form', sortOrder: 11,
  },
  'End Contact Material': {
    attributeId: 'contact_material', attributeName: 'Contact Material', sortOrder: 12,
  },
  'Electrical Life': {
    attributeId: 'electrical_life_ops', attributeName: 'Electrical Life (operations)', sortOrder: 13,
  },
  'Operate Time': {
    attributeId: 'operate_time_ms', attributeName: 'Operate Time', unit: 'ms', sortOrder: 14,
  },
  'Release Time': {
    attributeId: 'release_time_ms', attributeName: 'Release Time', unit: 'ms', sortOrder: 15,
  },
  'Contact Resistance': {
    attributeId: 'contact_resistance', attributeName: 'Contact Resistance', unit: 'mΩ', sortOrder: 16,
  },
  'Insulation Resistance': {
    attributeId: 'insulation_resistance', attributeName: 'Insulation Resistance', unit: 'MΩ', sortOrder: 17,
  },
};

/**
 * Crystals/Resonators class (16th class) — Family D1
 * Tested MPNs: ABM8-16.000MHZ-B2-T
 * Drive Level + Aging are gap-fillers
 */
const crystalsResonatorsParamMap: Record<string, ParamMapEntry> = {
  'Operating Frequency': {
    attributeId: 'nominal_frequency_hz', attributeName: 'Nominal Frequency', unit: 'Hz', sortOrder: 1,
  },
  'Load Capacitance': {
    attributeId: 'load_capacitance_pf', attributeName: 'Load Capacitance', unit: 'pF', sortOrder: 2,
  },
  'Series Resistance': {
    attributeId: 'equivalent_series_resistance_ohm', attributeName: 'Equivalent Series Resistance', unit: 'Ω', sortOrder: 3,
  },
  'Frequency Tolerance': {
    attributeId: 'frequency_tolerance_ppm', attributeName: 'Frequency Tolerance', unit: 'ppm', sortOrder: 4,
  },
  'Frequency Stability': {
    attributeId: 'frequency_stability_ppm', attributeName: 'Frequency Stability', unit: 'ppm', sortOrder: 5,
  },
  'Drive Level': {
    attributeId: 'drive_level_uw', attributeName: 'Drive Level', unit: 'µW', sortOrder: 6,
  },
  'Aging': {
    attributeId: 'aging_ppm_per_year', attributeName: 'Aging', unit: 'ppm/year', sortOrder: 7,
  },
  'Crystal/Resonator Type': {
    attributeId: 'crystal_type', attributeName: 'Crystal / Resonator Type', sortOrder: 8,
  },
};

// ============================================================
// CLASS MAP REGISTRY
// ============================================================

const classParamMaps: Record<string, Record<string, ParamMapEntry>> = {
  'Capacitors': capacitorsParamMap,
  'Resistors': resistorsParamMap,
  'Inductors': inductorsParamMap,
  'Filters': filtersParamMap,
  'Diodes': diodesParamMap,
  'Transistors': transistorsParamMap,
  'Trigger Devices': triggerDevicesParamMap,
  'Amplifier Circuits': amplifierCircuitsParamMap,
  'Logic': logicParamMap,
  'Power Circuits': powerCircuitsParamMap,
  'Converters': convertersParamMap,
  'Drivers And Interfaces': driversAndInterfacesParamMap,
  'Signal Circuits': signalCircuitsParamMap,
  'Circuit Protection': circuitProtectionParamMap,
  'Optoelectronics': optoelectronicsParamMap,
  'Relays': relaysParamMap,
  'Crystals/Resonators': crystalsResonatorsParamMap,
};

// ============================================================
// FAMILY → CLASS MAPPING
// ============================================================

const familyToPartsioClass: Record<string, string> = {
  '12': 'Capacitors',
  '58': 'Capacitors',
  '59': 'Capacitors',
  '60': 'Capacitors',
  '61': 'Capacitors',
  '52': 'Resistors',
  '53': 'Resistors',
  '54': 'Resistors',
  '65': 'Resistors',
  '66': 'Resistors',
  '67': 'Resistors',
  '68': 'Resistors',
  '69': 'Filters',
  '70': 'Filters',
  '71': 'Inductors',
  '72': 'Inductors',
  'B1': 'Diodes',
  'B2': 'Diodes',
  'B3': 'Diodes',
  'B4': 'Diodes',
  'B5': 'Transistors',
  'B6': 'Transistors',
  'B7': 'Transistors',
  'B8': 'Trigger Devices',
  'C1': 'Power Circuits',
  'C2': 'Power Circuits',
  'C6': 'Power Circuits',
  'C3': 'Drivers And Interfaces',
  'C7': 'Drivers And Interfaces',
  'C4': 'Amplifier Circuits',
  'C5': 'Logic',
  'C8': 'Signal Circuits',
  'C9': 'Converters',
  'C10': 'Converters',
  'D1': 'Crystals/Resonators',
  'D2': 'Circuit Protection',
  'E1': 'Optoelectronics',
  'F1': 'Relays',
  'F2': 'Optoelectronics',
  // NOT mapped (no data): 13 Mica, 55 Chassis Mount, 64 Film, B9 JFETs
};

// ============================================================
// EXTRA (UNMAPPED) FIELDS PER CLASS
// Curated from API test responses — fields that exist but aren't
// mapped to our internal schema. Shown in admin panel for discovery.
// ============================================================

const classExtraFields: Record<string, string[]> = {
  'Capacitors': [
    'Length', 'Width', 'Negative Tolerance',
    'Operating Temperature-Max', 'Operating Temperature-Min',
    'Mounting Feature', 'Current Datasheet Url', 'YTEOL', 'Risk Rank',
  ],
  'Resistors': [
    'Package Height', 'Package Length', 'Package Width', 'Construction',
    'Lead Diameter', 'Lead Length',
    'Current Datasheet Url', 'YTEOL', 'Risk Rank',
  ],
  'Inductors': [
    'Test Frequency', 'Saturation Current',
    'Current Datasheet Url', 'YTEOL', 'Risk Rank',
  ],
  'Filters': [
    'Frequency-Max', 'Frequency-Min',
    'Current Datasheet Url', 'YTEOL', 'Risk Rank',
  ],
  'Diodes': [
    'Diode Element Material', 'Configuration', 'Number of Elements',
    'Operating Temperature-Max', 'Operating Temperature-Min',
    'Working Test Current', 'Breakdown Voltage-Nom',
    'Current Datasheet Url', 'YTEOL', 'Risk Rank',
  ],
  'Transistors': [
    'FET Technology', 'Operating Mode',
    'Power Dissipation Ambient-Max', 'Gate-Source Voltage-Max',
    'Operating Temperature-Max', 'Operating Temperature-Min',
    'Current Datasheet Url', 'YTEOL', 'Risk Rank',
  ],
  'Trigger Devices': [
    'Latching Current-Max', 'I²T For Fusing-Max',
    'Operating Temperature-Max', 'Operating Temperature-Min',
    'Current Datasheet Url', 'YTEOL', 'Risk Rank',
  ],
  'Amplifier Circuits': [
    'Architecture', 'Frequency Compensation',
    'CMRR-Nom', 'Bias Current-Max @25C',
    'Supply Voltage-Nom', 'Supply Voltage-Limit-Max',
    'Current Datasheet Url', 'YTEOL', 'Risk Rank',
  ],
  'Logic': [
    'Number of Inputs', 'Load Capacitance (CL)',
    'Prop. Delay@Nom-Sup', 'Power Supply Current-Max (ICC)',
    'Temperature Grade',
    'Current Datasheet Url', 'YTEOL', 'Risk Rank',
  ],
  'Power Circuits': [
    'Regulator Type', 'Dropout Voltage1-Nom',
    'Output Voltage1-Min', 'Output Voltage1-Max',
    'Output Voltage-Min', 'Output Voltage-Max',
    'Current Datasheet Url', 'YTEOL', 'Risk Rank',
  ],
  'Converters': [
    'Output Format', 'Output Bit Code',
    'Analog Input Voltage-Max', 'Analog Input Voltage-Min',
    'Current Datasheet Url', 'YTEOL', 'Risk Rank',
  ],
  'Drivers And Interfaces': [
    'Output Polarity', 'Differential Output', 'Input Characteristics',
    'Out Swing-Min', 'Output Low Current-Max',
    'Current Datasheet Url', 'YTEOL', 'Risk Rank',
  ],
  'Signal Circuits': [
    'Analog IC - Other Type', 'Temperature Grade',
    'Supply Current-Max (Isup)', 'Supply Voltage-Nom (Vsup)',
    'Current Datasheet Url', 'YTEOL', 'Risk Rank',
  ],
  'Circuit Protection': [
    'Circuit Protection Type', 'Mounting Feature', 'Fuse Size',
    'Current Datasheet Url', 'YTEOL', 'Risk Rank',
  ],
  'Optoelectronics': [
    'Current Transfer Ratio-Nom', 'On-State Current-Max',
    'Current Datasheet Url', 'YTEOL', 'Risk Rank',
  ],
  'Relays': [
    'Coil Voltage(DC)-Max', 'End Contact Plating',
    'Mechanical Life', 'Weight',
    'Current Datasheet Url', 'YTEOL', 'Risk Rank',
  ],
  'Crystals/Resonators': [
    'Operating Temperature-Max', 'Operating Temperature-Min',
    'Shunt Capacitance', 'Motional Capacitance',
    'Current Datasheet Url', 'YTEOL', 'Risk Rank',
  ],
};

// ============================================================
// PUBLIC API
// ============================================================

/** Find the param map for a given parts.io Class name */
export function findPartsioParamMap(className: string): Record<string, ParamMapEntry> | null {
  return classParamMaps[className] ?? null;
}

/** Get the parts.io Class name for a family ID */
export function getPartsioClassForFamily(familyId: string): string | null {
  return familyToPartsioClass[familyId] ?? null;
}

/** Reverse lookup: attributeId → parts.io field name, for a given family */
export function reversePartsioParamLookup(familyId: string): Map<string, string> {
  const result = new Map<string, string>();
  const className = familyToPartsioClass[familyId];
  if (!className) return result;

  const map = classParamMaps[className];
  if (!map) return result;

  for (const [fieldName, entry] of Object.entries(map)) {
    const mappings = Array.isArray(entry) ? entry : [entry];
    for (const m of mappings) {
      result.set(m.attributeId, fieldName);
    }
  }
  return result;
}

/**
 * Get all parts.io fields for a family — split into mapped (have attributeId) and unmapped (extras).
 * Used by admin ParamMappingsPanel to show additional discoverable fields.
 */
export function getAllPartsioFields(familyId: string): { mapped: string[]; unmapped: string[] } {
  const className = familyToPartsioClass[familyId];
  if (!className) return { mapped: [], unmapped: [] };

  const map = classParamMaps[className];
  const mapped = map ? Object.keys(map) : [];
  const unmapped = classExtraFields[className] ?? [];

  return { mapped, unmapped };
}

/**
 * Compute parts.io-only coverage: weight from attrs only parts.io covers (not in Digikey).
 * Requires the set of Digikey-mapped attributeIds for comparison.
 */
export function computePartsioCoverage(
  familyId: string,
  rules: MatchingRule[],
  digikeyMappedIds: Set<string>,
): { partsioOnlyWeight: number; totalWeight: number } {
  const pioReverse = reversePartsioParamLookup(familyId);
  let partsioOnlyWeight = 0;
  let totalWeight = 0;

  for (const rule of rules) {
    totalWeight += rule.weight;
    if (!digikeyMappedIds.has(rule.attributeId) && pioReverse.has(rule.attributeId)) {
      partsioOnlyWeight += rule.weight;
    }
  }

  return { partsioOnlyWeight, totalWeight };
}
