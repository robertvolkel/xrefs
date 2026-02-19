import { LogicTable } from '../types';

/**
 * Varistors / Metal Oxide Varistors (MOVs) Logic Table
 * DigiKey Family ID: 65
 *
 * Derived from: docs/varistors_movs_logic.docx
 * 16 attributes with specific matching rules for cross-reference validation.
 *
 * Critical notes:
 * - MOVs degrade progressively with each surge event (ZnO grain damage).
 * - Clamping voltage ≠ varistor voltage (V₁ₘₐ at 1mA vs Vc at surge current).
 * - Thermal runaway risk: sustained overvoltage → increasing leakage → fire.
 *   Thermal disconnect is essential for safety.
 */
export const varistorsMOVsLogicTable: LogicTable = {
  familyId: '65',
  familyName: 'Varistors / Metal Oxide Varistors (MOVs)',
  category: 'Passives',
  description: 'Hard logic filters for varistor/MOV replacement part validation',
  rules: [
    {
      attributeId: 'varistor_voltage',
      attributeName: 'Varistor Voltage (V₁ₘₐ)',
      logicType: 'identity',
      weight: 10,
      engineeringReason: 'Primary specification at 1mA DC. Common values: 180V, 275V, 320V, 460V AC. Must match exactly — determines clamping threshold.',
      sortOrder: 1,
    },
    {
      attributeId: 'clamping_voltage',
      attributeName: 'Clamping Voltage (Vc)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 9,
      engineeringReason: 'Lower clamping voltage is better for downstream component protection. Specified at peak current (e.g., 710V at 100A 8/20µs).',
      sortOrder: 2,
    },
    {
      attributeId: 'max_continuous_voltage',
      attributeName: 'Maximum Continuous Voltage (AC/DC)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 9,
      engineeringReason: 'Maximum voltage without significant leakage or degradation. Replacement must handle at least the same continuous voltage.',
      sortOrder: 3,
    },
    {
      attributeId: 'energy_rating',
      attributeName: 'Energy Rating (Joules)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 8,
      engineeringReason: 'Maximum single-pulse energy absorption (10/1000µs or 2ms pulse). Range: 0.1J (SMD) to 1000J+ (large disc). Higher is always acceptable.',
      sortOrder: 4,
    },
    {
      attributeId: 'peak_surge_current',
      attributeName: 'Peak Surge Current (8/20µs)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 8,
      engineeringReason: 'Standard lightning surge waveform rating. Range: 50A (SMD) to 70,000A (large disc). Higher is always acceptable.',
      sortOrder: 5,
    },
    {
      attributeId: 'package_case',
      attributeName: 'Package / Form Factor',
      logicType: 'identity',
      weight: 10,
      engineeringReason: 'Radial disc (through-hole), SMD chip, or block/strap. Must match mounting style exactly — not interchangeable without board redesign.',
      sortOrder: 6,
    },
    {
      attributeId: 'disc_diameter',
      attributeName: 'Disc Diameter (Radial)',
      logicType: 'fit',
      weight: 6,
      engineeringReason: 'Common sizes: 5mm, 7mm, 10mm, 14mm, 20mm, 25mm, 32mm, 40mm. Larger disc = better surge handling but must fit physical space.',
      sortOrder: 7,
    },
    {
      attributeId: 'lead_spacing',
      attributeName: 'Lead Spacing / Pitch',
      logicType: 'identity',
      weight: 7,
      engineeringReason: 'Through-hole pitch: 5mm, 7.5mm, 10mm, 12.5mm. Tied to disc diameter. Must match PCB hole pattern.',
      sortOrder: 8,
    },
    {
      attributeId: 'response_time',
      attributeName: 'Response Time',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 5,
      engineeringReason: 'Time to begin clamping after transient. ZnO element: <25ns; with leads: <500ns. SMD faster than through-hole. Lower is better.',
      sortOrder: 9,
    },
    {
      attributeId: 'leakage_current',
      attributeName: 'Leakage Current',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 5,
      engineeringReason: 'At maximum continuous voltage. Standard: <20µA; low-leakage: <1µA. Lower prevents thermal runaway risk.',
      sortOrder: 10,
    },
    {
      attributeId: 'operating_temp',
      attributeName: 'Operating Temp Range',
      logicType: 'threshold',
      thresholdDirection: 'range_superset',
      weight: 7,
      engineeringReason: 'Standard: −40°C to +85°C. Replacement must cover at least the full operating temperature range of the original.',
      sortOrder: 11,
    },
    {
      attributeId: 'surge_pulse_lifetime',
      attributeName: 'Number of Surge Pulses (Lifetime)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 6,
      engineeringReason: 'MOVs degrade with each surge; clamping voltage drifts lower, leakage increases. End-of-life at ≥10% voltage shift. More pulses = longer service life.',
      sortOrder: 12,
    },
    {
      attributeId: 'safety_rating',
      attributeName: 'Safety Rating (UL, IEC)',
      logicType: 'identity_flag',
      weight: 8,
      engineeringReason: 'UL 1449 (SPD) or IEC 61643 certification. If original is certified, replacement must also be certified.',
      sortOrder: 13,
    },
    {
      attributeId: 'thermal_disconnect',
      attributeName: 'Thermal Disconnect / Fuse',
      logicType: 'identity_flag',
      weight: 8,
      engineeringReason: 'Prevents catastrophic failure (fire) if varistor overheats. Required by UL 1449 for certain applications. If original has it, replacement must too.',
      sortOrder: 14,
    },
    {
      attributeId: 'aec_q200',
      attributeName: 'AEC-Q200 Qualification',
      logicType: 'identity_flag',
      weight: 8,
      engineeringReason: 'Required for automotive applications (load dump, inductive spikes, ESD). A non-qualified part cannot replace a qualified one.',
      sortOrder: 15,
    },
    {
      attributeId: 'packaging',
      attributeName: 'Packaging',
      logicType: 'operational',
      weight: 2,
      engineeringReason: 'Tape & Reel for SMD; Ammo Pack or Bulk for through-hole. Must match assembly process requirements.',
      sortOrder: 16,
    },
  ],
};
