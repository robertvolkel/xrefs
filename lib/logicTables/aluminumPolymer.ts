import { aluminumElectrolyticLogicTable } from './aluminumElectrolytic';
import { buildDerivedLogicTable } from './deltaBuilder';

/**
 * Aluminum Polymer Capacitors Logic Table
 * DigiKey Family ID: 60
 *
 * Derived from: docs/passive_variants_delta.docx
 * Base: Aluminum Electrolytic Capacitors (Family 58) — inherits rules with modifications.
 * Removes lifetime (solid electrolyte — no dry-out failure mode).
 * Overrides ESR and ripple current to elevated importance.
 * Adds conductive polymer type matching.
 *
 * Solid conductive polymer electrolyte replaces liquid electrolyte.
 * Primary advantages: dramatically lower ESR (5–30 mΩ vs 50–500 mΩ liquid),
 * higher ripple current handling, no electrolyte dry-out.
 */
export const aluminumPolymerLogicTable = buildDerivedLogicTable(
  aluminumElectrolyticLogicTable,
  {
    baseFamilyId: '58',
    familyId: '60',
    familyName: 'Aluminum Polymer Capacitors',
    category: 'Passives',
    description: 'Derived from aluminum electrolytic with solid polymer-specific modifications',
    remove: [
      'lifetime',    // Solid electrolyte — no dry-out; failure mode is gradual capacitance loss
      'reforming',   // Not applicable — solid electrolyte doesn't interact with oxide layer (silently skipped if not in base)
    ],
    override: [
      {
        attributeId: 'esr',
        weight: 9,
        engineeringReason: 'ESR is the primary reason for choosing polymer. Typical: 5–30 mΩ vs 50–500 mΩ liquid electrolytic. Lower is always better.',
      },
      {
        attributeId: 'ripple_current',
        weight: 9,
        engineeringReason: 'Aluminum polymer handles significantly higher ripple current due to low ESR. Elevated importance for power supply applications.',
      },
    ],
    add: [
      {
        attributeId: 'polymer_type',
        attributeName: 'Conductive Polymer Type',
        logicType: 'identity',
        weight: 5,
        engineeringReason: 'Different polymer types (PEDOT, polypyrrole) may have different aging characteristics and ESR temperature profiles. Match if specified.',
        sortOrder: 18,
      },
    ],
  }
);
