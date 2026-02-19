import { LogicTable } from '../types';

/**
 * PTC Resettable Fuses (PolyFuses / PRFs) Logic Table
 * DigiKey Family ID: 66
 *
 * Derived from: docs/ptc_resettable_fuses_logic.docx
 * 15 attributes with specific matching rules for cross-reference validation.
 *
 * Critical notes:
 * - Not a true fuse: transitions to high-resistance (current limiter), resets on cool-down.
 * - Vmax is a HARD safety limit — full circuit voltage appears across tripped device.
 *   If tripped voltage exceeds Vmax, device can arc, crack, or fail permanently.
 * - Temperature derating is severe: hold current drops to 60–70% at 50°C, <50% at 85°C+.
 * - Resistance creep: each trip/reset cycle increases initial resistance (50–100% after 100 cycles).
 */
export const ptcResettableFusesLogicTable: LogicTable = {
  familyId: '66',
  familyName: 'PTC Resettable Fuses (PolyFuses)',
  category: 'Passives',
  description: 'Hard logic filters for PTC resettable fuse replacement part validation',
  rules: [
    {
      attributeId: 'hold_current',
      attributeName: 'Hold Current (Ihold)',
      logicType: 'identity',
      weight: 10,
      engineeringReason: 'Primary specification at 25°C ambient. Too low causes nuisance tripping; too high fails to protect. Must match exactly.',
      sortOrder: 1,
    },
    {
      attributeId: 'trip_current',
      attributeName: 'Trip Current (Itrip)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 9,
      engineeringReason: 'Minimum current triggering high-resistance state. Ratio Itrip/Ihold: 1.7–2.5×. Lower trip current = faster protection.',
      sortOrder: 2,
    },
    {
      attributeId: 'max_voltage',
      attributeName: 'Maximum Voltage (Vmax)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 10,
      engineeringReason: 'HARD SAFETY LIMIT. Full circuit voltage appears across tripped device. If exceeded: arcing, cracking, permanent failure. Common: 6V, 9V, 16V, 24V, 30V, 60V, 250V. Most common substitution mistake is voltage mismatch.',
      sortOrder: 3,
    },
    {
      attributeId: 'max_fault_current',
      attributeName: 'Maximum Fault Current (Imax)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 8,
      engineeringReason: 'Maximum safe interruption current during dead short. Range: 5A–100A. Insufficient rating can cause permanent device damage.',
      sortOrder: 4,
    },
    {
      attributeId: 'time_to_trip',
      attributeName: 'Time-to-Trip',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 7,
      engineeringReason: 'Time from fault onset to high-resistance state at specified fault current. Faster is better. Depends on fault magnitude (higher current = faster trip).',
      sortOrder: 5,
    },
    {
      attributeId: 'initial_resistance',
      attributeName: 'Initial Resistance (R₁)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 6,
      engineeringReason: 'Untripped-state resistance. Lower = less voltage drop during normal operation. Critical on low-voltage circuits (USB 5V, 3.3V rails).',
      sortOrder: 6,
    },
    {
      attributeId: 'post_trip_resistance',
      attributeName: 'Post-Trip Resistance (R1max)',
      logicType: 'application_review',
      weight: 5,
      engineeringReason: 'Resistance creeps up after multiple trip/reset cycles (50–100% increase after 100 cycles). Flag if circuit is sensitive to voltage drop (precision sensing, low-voltage).',
      sortOrder: 7,
    },
    {
      attributeId: 'package_case',
      attributeName: 'Package / Form Factor',
      logicType: 'identity',
      weight: 10,
      engineeringReason: 'SMD chip (0402–2920), radial leaded, or strap/battery tab. Must match footprint and mounting style exactly.',
      sortOrder: 8,
    },
    {
      attributeId: 'operating_temp',
      attributeName: 'Operating Temp Range',
      logicType: 'threshold',
      thresholdDirection: 'range_superset',
      weight: 7,
      engineeringReason: 'Standard: −40°C to +85°C. Hold/trip currents derate severely with temperature (60–70% at 50°C). Replacement must cover full range.',
      sortOrder: 9,
    },
    {
      attributeId: 'power_dissipation',
      attributeName: 'Power Dissipation (Tripped State)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 5,
      engineeringReason: 'Lower is better. Specified as Pd at Vmax. High dissipation causes heating of adjacent components on the PCB.',
      sortOrder: 10,
    },
    {
      attributeId: 'height',
      attributeName: 'Height (Seated Max)',
      logicType: 'fit',
      weight: 5,
      engineeringReason: 'Physical clearance verification for enclosures and stacked PCBs.',
      sortOrder: 11,
    },
    {
      attributeId: 'endurance_cycles',
      attributeName: 'Endurance (Trip/Reset Cycles)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 6,
      engineeringReason: 'Number of cycles before hold current or initial resistance drifts outside spec. Typical: 100–1000+. More cycles = longer reliable service.',
      sortOrder: 12,
    },
    {
      attributeId: 'safety_rating',
      attributeName: 'Safety Rating (UL, TUV, CSA)',
      logicType: 'identity_flag',
      weight: 8,
      engineeringReason: 'Required for safety-critical overcurrent protection. UL/CSA/TUV certification must be present if original has it.',
      sortOrder: 13,
    },
    {
      attributeId: 'aec_q200',
      attributeName: 'AEC-Q200 Qualification',
      logicType: 'identity_flag',
      weight: 8,
      engineeringReason: 'Required for automotive applications (USB ports, sensor circuits, communication buses). A non-qualified part cannot replace a qualified one.',
      sortOrder: 14,
    },
    {
      attributeId: 'packaging',
      attributeName: 'Packaging',
      logicType: 'operational',
      weight: 2,
      engineeringReason: 'Tape & Reel for SMD; Ammo Pack or Bulk for leaded. Must match assembly process requirements.',
      sortOrder: 15,
    },
  ],
};
