import { LogicTable } from '../types';

/**
 * Ferrite Beads Logic Table
 * DigiKey Family ID: 70
 *
 * Derived from: docs/ferrite_beads_logic.docx
 * 14 attributes with specific matching rules for cross-reference validation.
 */
export const ferriteBeadsLogicTable: LogicTable = {
  familyId: '70',
  familyName: 'Ferrite Beads (Surface Mount)',
  category: 'Passives',
  description: 'Hard logic filters for ferrite bead replacement part validation',
  rules: [
    {
      attributeId: 'impedance_100mhz',
      attributeName: 'Impedance @ 100MHz',
      logicType: 'identity',
      weight: 10,
      engineeringReason: 'The primary specification of a ferrite bead. Must match the rated impedance at 100MHz. This determines the attenuation of high-frequency noise.',
      sortOrder: 1,
    },
    {
      attributeId: 'impedance_curve',
      attributeName: 'Impedance vs Frequency Curve',
      logicType: 'application_review',
      weight: 8,
      engineeringReason: 'Two beads with the same 100MHz impedance can have very different frequency response shapes. The impedance curve determines effectiveness across the target frequency range. Consult datasheets.',
      sortOrder: 2,
    },
    {
      attributeId: 'package_case',
      attributeName: 'Package / Case',
      logicType: 'identity',
      weight: 10,
      engineeringReason: 'The replacement must match the original footprint exactly. 0201, 0402, 0603, 0805 etc. are not interchangeable.',
      sortOrder: 3,
    },
    {
      attributeId: 'rated_current',
      attributeName: 'Rated Current',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 9,
      engineeringReason: 'The replacement must handle at least the same current. Exceeding rated current causes excessive heating and impedance degradation.',
      sortOrder: 4,
    },
    {
      attributeId: 'dcr',
      attributeName: 'DC Resistance (DCR)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 7,
      engineeringReason: 'Lower DCR means less voltage drop and less power loss. Critical for power supply rail filtering.',
      sortOrder: 5,
    },
    {
      attributeId: 'number_of_lines',
      attributeName: 'Number of Lines',
      logicType: 'identity',
      weight: 6,
      engineeringReason: 'Single-line vs multi-line ferrite beads are not interchangeable. Array types have specific pin configurations.',
      sortOrder: 6,
    },
    {
      attributeId: 'resistance_type',
      attributeName: 'Resistance Type',
      logicType: 'identity',
      weight: 4,
      engineeringReason: 'Resistive vs inductive impedance type affects the frequency response characteristic. Must match for proper EMI filtering.',
      sortOrder: 7,
    },
    {
      attributeId: 'tolerance',
      attributeName: 'Tolerance',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 5,
      engineeringReason: 'A tighter impedance tolerance is always acceptable. Common: ±25%, ±50% (ferrite beads have wide tolerances).',
      sortOrder: 8,
    },
    {
      attributeId: 'operating_temp',
      attributeName: 'Operating Temp Range',
      logicType: 'threshold',
      thresholdDirection: 'range_superset',
      weight: 6,
      engineeringReason: 'The replacement must cover at least the full operating temperature range of the original.',
      sortOrder: 9,
    },
    {
      attributeId: 'height',
      attributeName: 'Height (Seated Max)',
      logicType: 'fit',
      weight: 5,
      engineeringReason: 'Must fit within available vertical clearance on the PCB.',
      sortOrder: 10,
    },
    {
      attributeId: 'voltage_rated',
      attributeName: 'Voltage Rating',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 5,
      engineeringReason: 'The replacement must handle at least the same voltage. Higher rating is always acceptable.',
      sortOrder: 11,
    },
    {
      attributeId: 'signal_integrity',
      attributeName: 'Signal Integrity (S-Parameters)',
      logicType: 'application_review',
      weight: 7,
      engineeringReason: 'For high-speed data lines, S-parameter matching is critical. Insertion loss, return loss, and eye diagram impact must be verified. Consult manufacturer S-parameter data.',
      sortOrder: 12,
    },
    {
      attributeId: 'aec_q200',
      attributeName: 'AEC-Q200 Qualification',
      logicType: 'identity_flag',
      weight: 8,
      engineeringReason: 'Required for automotive applications. A non-qualified part cannot replace a qualified one.',
      sortOrder: 13,
    },
    {
      attributeId: 'packaging',
      attributeName: 'Packaging',
      logicType: 'operational',
      weight: 2,
      engineeringReason: 'Tape & Reel required for automated pick-and-place. Ensure reel width and pitch match feeder specs.',
      sortOrder: 14,
    },
  ],
};
