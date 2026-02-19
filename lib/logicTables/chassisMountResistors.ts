import { chipResistorsLogicTable } from './chipResistors';
import { buildDerivedLogicTable } from './deltaBuilder';

/**
 * Chassis Mount / High Power Resistors Logic Table
 * DigiKey Family ID: 55
 *
 * Derived from: docs/passive_variants_delta.docx
 * Base: Chip Resistors (Family 52) — inherits all 13 rules.
 * Overrides power rating to maximum weight (derated at mounting temperature).
 * Adds 3 rules for high-power mounting constraints.
 *
 * Power resistors (5W–500W+) mounted to heatsink or chassis.
 * Packages: TO-220, TO-247, TO-263 (D²PAK), bolt-down, clip mount.
 */
export const chassisMountResistorsLogicTable = buildDerivedLogicTable(
  chipResistorsLogicTable,
  {
    baseFamilyId: '52',
    familyId: '55',
    familyName: 'Chassis Mount / High Power Resistors',
    category: 'Passives',
    description: 'Derived from chip resistors with high-power mounting and thermal additions',
    override: [
      {
        attributeId: 'power_rating',
        weight: 10,
        engineeringReason: 'Power rating must be ≥ original, derated at specific mounting surface temperature (e.g., 50W at 25°C case). Critical for thermal design.',
      },
    ],
    add: [
      {
        attributeId: 'mounting_style',
        attributeName: 'Mounting Style',
        logicType: 'identity',
        weight: 9,
        engineeringReason: 'TO-220, TO-247, TO-263 (D²PAK), bolt-down, or clip mount. Must match exactly for mechanical and thermal compatibility.',
        sortOrder: 14,
      },
      {
        attributeId: 'thermal_resistance',
        attributeName: 'Thermal Resistance (°C/W)',
        logicType: 'threshold',
        thresholdDirection: 'lte',
        weight: 7,
        engineeringReason: 'Lower thermal resistance is better for heat transfer to heatsink/chassis. Directly impacts maximum continuous power.',
        sortOrder: 15,
      },
      {
        attributeId: 'heatsink_dimensions',
        attributeName: 'Heatsink Interface Dimensions',
        logicType: 'fit',
        weight: 8,
        engineeringReason: 'Bolt hole spacing and tab dimensions must match existing heatsink/mounting hardware. Mismatch prevents installation.',
        sortOrder: 16,
      },
    ],
  }
);
