/**
 * Shared option arrays for onboarding agent and My Profile settings.
 * Used by OnboardingAgent.tsx (chip labels) and MyProfilePanel.tsx (form options).
 */
import type {
  BusinessRole,
  IndustryVertical,
  ProductionType,
  ProductionVolume,
  ProjectPhase,
  UserGoal,
  CountryCode,
} from '@/lib/types';

// ============================================================
// ROLE OPTIONS (Q1 — single select)
// ============================================================

export const ROLE_OPTIONS: { value: BusinessRole; label: string }[] = [
  { value: 'design_engineer', label: 'Design Engineer' },
  { value: 'procurement_buyer', label: 'Procurement / Buyer' },
  { value: 'supply_chain_manager', label: 'Supply Chain Manager' },
  { value: 'engineering_manager', label: 'Engineering Manager' },
  { value: 'quality_engineer', label: 'Quality Engineer' },
  { value: 'contract_manufacturer', label: 'Contract Manufacturer' },
  { value: 'consultant', label: 'Consultant' },
  { value: 'executive', label: 'Executive' },
  { value: 'other', label: 'Other' },
];

// ============================================================
// INDUSTRY OPTIONS (Q2 — multi select)
// ============================================================

export const INDUSTRY_OPTIONS: { value: IndustryVertical; label: string }[] = [
  { value: 'automotive', label: 'Automotive' },
  { value: 'industrial', label: 'Industrial / Manufacturing' },
  { value: 'consumer_electronics', label: 'Consumer Electronics' },
  { value: 'medical', label: 'Medical' },
  { value: 'aerospace_defense', label: 'Aerospace & Defense' },
  { value: 'telecom_networking', label: 'Telecommunications' },
  { value: 'energy', label: 'Energy' },
  { value: 'other', label: 'Other' },
];

// ============================================================
// PRODUCTION TYPE OPTIONS (Q3 — multi select, max 3)
// ============================================================

export const PRODUCTION_TYPE_OPTIONS: { value: ProductionType; label: string }[] = [
  { value: 'pcb_assemblies', label: 'PCB Assemblies' },
  { value: 'finished_consumer_products', label: 'Finished Consumer Products' },
  { value: 'sub_assemblies_modules', label: 'Sub-Assemblies / Modules' },
  { value: 'prototypes_rnd', label: 'Prototypes / R&D' },
  { value: 'custom_contract_manufacturing', label: 'Custom / Contract Manufacturing' },
  { value: 'other', label: 'Other' },
];

// ============================================================
// VOLUME OPTIONS (Q4 — single select)
// ============================================================

export const VOLUME_OPTIONS: { value: ProductionVolume; label: string }[] = [
  { value: 'prototype', label: 'Prototype / One-off' },
  { value: 'low_volume', label: 'Low volume (< 1K units/yr)' },
  { value: 'mid_volume', label: 'Mid volume (1K \u2013 100K units/yr)' },
  { value: 'high_volume', label: 'High volume (100K+ units/yr)' },
  { value: 'varies', label: 'Varies by project' },
];

// ============================================================
// PROJECT PHASE OPTIONS (Q5 — single select)
// ============================================================

export const PHASE_OPTIONS: { value: ProjectPhase; label: string }[] = [
  { value: 'early_design', label: 'Early Design' },
  { value: 'pre_production_npi', label: 'Pre-Production / NPI' },
  { value: 'volume_production', label: 'Volume Production' },
  { value: 'sustaining_eol', label: 'Sustaining / End-of-Life' },
  { value: 'all_phases', label: 'All phases' },
];

// ============================================================
// GOAL OPTIONS (Q6 — multi select, max 3)
// ============================================================

export const GOAL_OPTIONS: { value: UserGoal; label: string }[] = [
  { value: 'drop_in_replacements', label: 'Finding drop-in replacements fast' },
  { value: 'reduce_bom_cost', label: 'Reducing BOM cost' },
  { value: 'manage_shortages', label: 'Managing shortages and lead times' },
  { value: 'reduce_sole_source', label: 'Reducing sole-source risk' },
  { value: 'qualify_compliance', label: 'Qualifying alternates for compliance' },
  { value: 'supply_chain_resilience', label: 'Improving supply chain resilience' },
  { value: 'streamline_procurement', label: 'Streamlining procurement workflow' },
];

// ============================================================
// CURATED COUNTRIES (used by Manufacturing Locations + Shipping Destinations)
// ============================================================

export const CURATED_COUNTRIES: { code: CountryCode; name: string }[] = [
  // Americas
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'MX', name: 'Mexico' },
  { code: 'BR', name: 'Brazil' },
  // Europe
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'IT', name: 'Italy' },
  { code: 'PL', name: 'Poland' },
  { code: 'SE', name: 'Sweden' },
  // Asia-Pacific
  { code: 'CN', name: 'China' },
  { code: 'TW', name: 'Taiwan' },
  { code: 'JP', name: 'Japan' },
  { code: 'KR', name: 'South Korea' },
  { code: 'IN', name: 'India' },
  { code: 'VN', name: 'Vietnam' },
  { code: 'TH', name: 'Thailand' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'SG', name: 'Singapore' },
  { code: 'PH', name: 'Philippines' },
  { code: 'ID', name: 'Indonesia' },
  // Middle East & Other
  { code: 'IL', name: 'Israel' },
  { code: 'AU', name: 'Australia' },
  { code: 'TR', name: 'Turkey' },
];

/** Look up country name by code */
export function getCountryName(code: CountryCode): string {
  return CURATED_COUNTRIES.find(c => c.code === code)?.name ?? code;
}

/** Look up label for a role value */
export function getRoleLabel(value: BusinessRole): string {
  return ROLE_OPTIONS.find(o => o.value === value)?.label ?? value;
}

/** Look up label for an industry value */
export function getIndustryLabel(value: IndustryVertical): string {
  return INDUSTRY_OPTIONS.find(o => o.value === value)?.label ?? value;
}

/** Look up label for a volume value */
export function getVolumeLabel(value: ProductionVolume): string {
  return VOLUME_OPTIONS.find(o => o.value === value)?.label ?? value;
}

/** Look up label for a phase value */
export function getPhaseLabel(value: ProjectPhase): string {
  return PHASE_OPTIONS.find(o => o.value === value)?.label ?? value;
}

/** Look up label for a goal value */
export function getGoalLabel(value: UserGoal): string {
  return GOAL_OPTIONS.find(o => o.value === value)?.label ?? value;
}

/** Look up label for a production type value */
export function getProductionTypeLabel(value: ProductionType): string {
  return PRODUCTION_TYPE_OPTIONS.find(o => o.value === value)?.label ?? value;
}
