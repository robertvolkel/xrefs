import { powerInductorsLogicTable } from './powerInductors';
import { buildDerivedLogicTable } from './deltaBuilder';

/**
 * RF / Signal Inductors Logic Table
 * DigiKey Family ID: 72
 *
 * Derived from: docs/passive_variants_delta.docx
 * Base: Power Inductors (Family 71) — inherits rules with priority changes.
 * Overrides saturation current (demoted), core material (exact match, no ferrite),
 * shielding (application review), SRF (elevated weight).
 * Adds Q factor (primary spec), inductance tolerance, and shielding review.
 *
 * Inductors for signal-frequency operation (kHz to GHz).
 * Parameter priorities invert vs power inductors:
 * - Q factor becomes primary (was demoted in power)
 * - Saturation current is secondary (RF carries small currents)
 * - Core: air/ceramic/thin-film, NOT ferrite (excessive losses at RF)
 */
export const rfSignalInductorsLogicTable = buildDerivedLogicTable(
  powerInductorsLogicTable,
  {
    baseFamilyId: '71',
    familyId: '72',
    familyName: 'RF / Signal Inductors',
    category: 'Passives',
    description: 'Derived from power inductors with RF signal-frequency priority inversions',
    override: [
      {
        attributeId: 'saturation_current',
        weight: 5,
        engineeringReason: 'Demoted for RF applications — signal inductors carry small currents. Still verify, but not a primary concern.',
      },
      {
        attributeId: 'core_material',
        logicType: 'identity',
        upgradeHierarchy: [],
        engineeringReason: 'Air core, ceramic core, or thin-film only. NOT ferrite — ferrite has excessive losses at RF frequencies. Must match exactly.',
      },
      {
        attributeId: 'shielding',
        logicType: 'application_review',
        engineeringReason: 'Shielding trade-offs differ at RF. Shielded inductors may have lower Q due to eddy currents in shield. Verify based on circuit sensitivity and coupling concerns.',
      },
      {
        attributeId: 'srf',
        weight: 8,
        engineeringReason: 'Must be ≥10× operating frequency for stable inductive behavior. Critical for RF — below SRF the inductor becomes capacitive. Higher SRF is always better.',
      },
    ],
    add: [
      {
        attributeId: 'q_factor',
        attributeName: 'Q Factor (Quality Factor)',
        logicType: 'threshold',
        thresholdDirection: 'gte',
        weight: 9,
        engineeringReason: 'PRIMARY specification for RF inductors. Higher Q = lower losses = better selectivity in tuned circuits. Replacement must meet or exceed original Q at the operating frequency.',
        sortOrder: 18,
      },
      {
        attributeId: 'inductance_tolerance',
        attributeName: 'Inductance Tolerance',
        logicType: 'threshold',
        thresholdDirection: 'lte',
        weight: 7,
        engineeringReason: 'Standard: ±2%, ±5%, ±10%. Critical for tuned circuits and filters where inductance directly sets the frequency response. Tighter is always better.',
        sortOrder: 19,
      },
    ],
  }
);
