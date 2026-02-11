import { LogicTable } from '../types';

/**
 * Chip Resistors Logic Table
 * DigiKey Family ID: 52
 *
 * Derived from: docs/chip_resistors_logic.docx
 * 13 attributes with specific matching rules for cross-reference validation.
 */
export const chipResistorsLogicTable: LogicTable = {
  familyId: '52',
  familyName: 'Chip Resistors (Surface Mount)',
  category: 'Passives',
  description: 'Hard logic filters for chip resistor replacement part validation',
  rules: [
    {
      attributeId: 'resistance',
      attributeName: 'Resistance',
      logicType: 'identity',
      weight: 10,
      engineeringReason: 'Resistance must match exactly. A 10kΩ resistor must be replaced by a 10kΩ resistor. Ensure E-series values are normalized before comparison.',
      sortOrder: 1,
    },
    {
      attributeId: 'package_case',
      attributeName: 'Package / Case',
      logicType: 'identity',
      weight: 10,
      engineeringReason: 'The replacement must match the original footprint exactly. 0402, 0603, 0805 etc. have different pad geometries and are not interchangeable without a board redesign.',
      sortOrder: 2,
    },
    {
      attributeId: 'tolerance',
      attributeName: 'Tolerance',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 7,
      engineeringReason: 'A tighter tolerance is always acceptable. ±1% can replace ±5%, but not vice versa. Common: ±5%(J), ±1%(F), ±0.5%(D), ±0.1%(B).',
      sortOrder: 3,
    },
    {
      attributeId: 'power_rating',
      attributeName: 'Power Rating',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 9,
      engineeringReason: 'The replacement must handle at least the same power dissipation. A higher power rating is always safe. Derating curves may differ between manufacturers.',
      sortOrder: 4,
    },
    {
      attributeId: 'voltage_rated',
      attributeName: 'Voltage Rating',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 8,
      engineeringReason: 'The replacement must handle at least the same working voltage. Higher rated voltage is always acceptable.',
      sortOrder: 5,
    },
    {
      attributeId: 'tcr',
      attributeName: 'Temperature Coefficient (TCR)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 6,
      engineeringReason: 'Lower TCR means better stability over temperature. ±25ppm/°C is better than ±100ppm/°C. Critical for precision analog circuits.',
      sortOrder: 6,
    },
    {
      attributeId: 'composition',
      attributeName: 'Composition / Technology',
      logicType: 'identity_upgrade',
      upgradeHierarchy: ['Thin Film', 'Thick Film'],
      weight: 5,
      engineeringReason: 'Thin Film offers better precision, lower noise, and tighter TCR than Thick Film. Upgrading from Thick to Thin Film is always acceptable.',
      sortOrder: 7,
    },
    {
      attributeId: 'operating_temp',
      attributeName: 'Operating Temp Range',
      logicType: 'threshold',
      thresholdDirection: 'range_superset',
      weight: 7,
      engineeringReason: 'The replacement must cover at least the full operating temperature range of the original.',
      sortOrder: 8,
    },
    {
      attributeId: 'height',
      attributeName: 'Height (Seated Max)',
      logicType: 'fit',
      weight: 5,
      engineeringReason: 'Critical for tight enclosures and stacked PCBs. A taller part may not fit.',
      sortOrder: 9,
    },
    {
      attributeId: 'msl',
      attributeName: 'Moisture Sensitivity Level',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 3,
      engineeringReason: 'MSL 1 (unlimited floor life) is best. Lower MSL number is less restrictive and always acceptable.',
      sortOrder: 10,
    },
    {
      attributeId: 'aec_q200',
      attributeName: 'AEC-Q200 Qualification',
      logicType: 'identity_flag',
      weight: 8,
      engineeringReason: 'Required for automotive applications. A non-qualified part cannot replace a qualified one.',
      sortOrder: 11,
    },
    {
      attributeId: 'anti_sulfur',
      attributeName: 'Anti-Sulfur',
      logicType: 'identity_flag',
      weight: 7,
      engineeringReason: 'Anti-sulfur resistors use special electrode materials to resist sulfur corrosion. Required in harsh environments (industrial, automotive). If original has it, replacement must too.',
      sortOrder: 12,
    },
    {
      attributeId: 'packaging',
      attributeName: 'Packaging',
      logicType: 'operational',
      weight: 2,
      engineeringReason: 'Tape & Reel required for automated pick-and-place. Ensure reel width and pitch match feeder specs.',
      sortOrder: 13,
    },
  ],
};
