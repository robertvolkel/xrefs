import { chipResistorsLogicTable } from './chipResistors';
import { buildDerivedLogicTable } from './deltaBuilder';

/**
 * Current Sense Resistors Logic Table
 * DigiKey Family ID: 54
 *
 * Derived from: docs/passive_variants_delta.docx
 * Base: Chip Resistors (Family 52) — inherits all 13 rules.
 * Overrides tolerance and TCR to tighter requirements.
 * Adds 3 rules for current sensing specifics.
 *
 * These are low-value precision resistors (1mΩ–1Ω) for current measurement.
 * Metal strip and reverse-geometry packages preferred for low inductance.
 */
export const currentSenseResistorsLogicTable = buildDerivedLogicTable(
  chipResistorsLogicTable,
  {
    baseFamilyId: '52',
    familyId: '54',
    familyName: 'Current Sense Resistors',
    category: 'Passives',
    description: 'Derived from chip resistors with tightened precision and current-sensing additions',
    override: [
      {
        attributeId: 'tolerance',
        weight: 9,
        engineeringReason: 'Current sense resistors require ≤1% tolerance for accurate measurement. Tighter tolerance is always acceptable.',
      },
      {
        attributeId: 'tcr',
        weight: 8,
        engineeringReason: 'TCR must be ≤50 ppm/°C for measurement stability. Metal strip/element types preferred over thick film.',
      },
    ],
    add: [
      {
        attributeId: 'kelvin_sensing',
        attributeName: 'Kelvin (4-Terminal) Sensing',
        logicType: 'identity_flag',
        weight: 8,
        engineeringReason: 'Separate force/sense pads eliminate lead resistance error. If original has 4-terminal layout, replacement must too.',
        sortOrder: 14,
      },
      {
        attributeId: 'power_rating_pulse',
        attributeName: 'Power Rating (Pulse)',
        logicType: 'threshold',
        thresholdDirection: 'gte',
        weight: 7,
        engineeringReason: 'Short-duration overcurrent surge handling capability. Higher pulse power rating is always acceptable.',
        sortOrder: 15,
      },
      {
        attributeId: 'parasitic_inductance',
        attributeName: 'Inductance (Parasitic)',
        logicType: 'application_review',
        weight: 5,
        engineeringReason: 'Verify for high-frequency current sensing (>100 kHz). Metal strip and reverse-geometry packages have lower parasitic inductance.',
        sortOrder: 16,
      },
    ],
  }
);
