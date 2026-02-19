import { chipResistorsLogicTable } from './chipResistors';
import { buildDerivedLogicTable } from './deltaBuilder';

/**
 * Through-Hole Resistors Logic Table
 * DigiKey Family ID: 53
 *
 * Derived from: docs/passive_variants_delta.docx
 * Base: Chip Resistors (Family 52) — inherits all 13 rules.
 * Adds 3 rules for through-hole physical constraints.
 */
export const throughHoleResistorsLogicTable = buildDerivedLogicTable(
  chipResistorsLogicTable,
  {
    baseFamilyId: '52',
    familyId: '53',
    familyName: 'Through-Hole Resistors',
    category: 'Passives',
    description: 'Derived from chip resistors with through-hole mounting additions',
    add: [
      {
        attributeId: 'lead_spacing',
        attributeName: 'Lead Spacing / Pitch',
        logicType: 'identity',
        weight: 7,
        engineeringReason: 'PCB hole pattern must match. Common pitches: 7.5mm, 10mm, 12.5mm, 15mm. Not interchangeable without board rework.',
        sortOrder: 14,
      },
      {
        attributeId: 'mounting_style',
        attributeName: 'Mounting Style',
        logicType: 'identity',
        weight: 9,
        engineeringReason: 'Must be axial through-hole. Cannot substitute SMD for through-hole or vice versa without PCB redesign.',
        sortOrder: 15,
      },
      {
        attributeId: 'body_dimensions',
        attributeName: 'Body Length × Diameter',
        logicType: 'fit',
        weight: 5,
        engineeringReason: 'Physical clearance verification. ¼W ≈ 6mm body, 2W ≈ 15mm+ body. Replacement must fit available board space.',
        sortOrder: 16,
      },
    ],
  }
);
