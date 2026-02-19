import { mlccLogicTable } from './mlcc';
import { buildDerivedLogicTable } from './deltaBuilder';

/**
 * Mica Capacitors Logic Table
 * DigiKey Family ID: 13
 *
 * Derived from: docs/passive_variants_delta.docx
 * Base: MLCC Capacitors (Family 12) — inherits rules with significant simplification.
 * Removes DC bias derating, flexible termination (not applicable to mica).
 * Overrides dielectric to exact Silver Mica match (no Class I/II hierarchy).
 * Adds temperature coefficient matching.
 *
 * Silver mica capacitors for extreme precision, stability, and low loss.
 * Virtually zero DC bias effect, no piezoelectric noise, no flex concerns.
 */
export const micaCapacitorsLogicTable = buildDerivedLogicTable(
  mlccLogicTable,
  {
    baseFamilyId: '12',
    familyId: '13',
    familyName: 'Mica Capacitors (Silver Mica)',
    category: 'Passives',
    description: 'Derived from MLCC with mica-specific simplifications for precision applications',
    remove: [
      'dc_bias_derating',       // Mica has virtually zero DC bias effect
      'flexible_termination',   // Not applicable — through-hole or large SMD packages
      'piezoelectric_noise',    // Mica doesn't exhibit piezoelectric effect (silently skipped if not in base)
    ],
    override: [
      {
        attributeId: 'dielectric',
        attributeName: 'Dielectric Material',
        logicType: 'identity',
        upgradeHierarchy: [],
        engineeringReason: 'Silver Mica dielectric must match exactly. No Class I/II hierarchy applies — mica is a distinct material class.',
      },
      {
        attributeId: 'tolerance',
        engineeringReason: 'Mica capacitors typically have very tight tolerances (≤1%). Precision is a primary reason for choosing mica. Tighter is always acceptable.',
      },
    ],
    add: [
      {
        attributeId: 'temperature_coefficient',
        attributeName: 'Temperature Coefficient',
        logicType: 'threshold',
        thresholdDirection: 'lte',
        weight: 7,
        engineeringReason: 'Typically ±50 ppm/°C or better. Primary reason for choosing mica over ceramic. Lower TC is always better for stability.',
        sortOrder: 15,
      },
    ],
  }
);
