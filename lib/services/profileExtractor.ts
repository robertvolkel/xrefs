/**
 * Extracts structured profile fields from a free-form profile prompt using Claude Haiku.
 * Called server-side on profile prompt save — not on every search.
 */
import Anthropic from '@anthropic-ai/sdk';
import type {
  BusinessRole,
  IndustryVertical,
  ProductionType,
  ProductionVolume,
  ProjectPhase,
  UserGoal,
} from '@/lib/types';

interface ExtractedProfileFields {
  businessRole?: BusinessRole;
  industries?: IndustryVertical[];
  productionTypes?: ProductionType[];
  productionVolume?: ProductionVolume;
  projectPhase?: ProjectPhase;
  goals?: UserGoal[];
}

const EXTRACTION_SYSTEM_PROMPT = `You extract structured profile fields from a user's free-form profile description. Return ONLY a JSON object with the fields you can confidently extract. Do not guess — only include fields clearly stated or strongly implied.

Valid values for each field:

businessRole (pick one):
  design_engineer, procurement_buyer, supply_chain_manager, engineering_manager,
  quality_engineer, contract_manufacturer, consultant, executive, other

industries (pick all that apply):
  automotive, aerospace_defense, medical, industrial, consumer_electronics,
  telecom_networking, energy, other

productionTypes (pick all that apply):
  pcb_assemblies, finished_consumer_products, sub_assemblies_modules,
  prototypes_rnd, custom_contract_manufacturing, other

productionVolume (pick one):
  prototype, low_volume, mid_volume, high_volume, varies

projectPhase (pick one):
  early_design, pre_production_npi, volume_production, sustaining_eol, all_phases

goals (pick up to 3):
  drop_in_replacements, reduce_bom_cost, manage_shortages, reduce_sole_source,
  qualify_compliance, supply_chain_resilience, streamline_procurement

Return only valid JSON. No markdown, no explanation.`;

/**
 * Extract structured profile fields from a free-form profile prompt.
 * Uses Claude Haiku for fast, cheap extraction.
 */
export async function extractProfileFields(
  profilePrompt: string,
): Promise<ExtractedProfileFields> {
  if (!profilePrompt?.trim()) return {};

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[profileExtractor] No ANTHROPIC_API_KEY — skipping extraction');
    return {};
  }

  try {
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: profilePrompt },
      ],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('');

    const parsed = JSON.parse(text) as ExtractedProfileFields;
    return validateExtraction(parsed);
  } catch (err) {
    console.error('[profileExtractor] Extraction failed:', err);
    return {};
  }
}

/** Validate that extracted values are from the allowed enums */
function validateExtraction(raw: ExtractedProfileFields): ExtractedProfileFields {
  const result: ExtractedProfileFields = {};

  const validRoles = new Set<string>([
    'design_engineer', 'procurement_buyer', 'supply_chain_manager',
    'engineering_manager', 'quality_engineer', 'contract_manufacturer',
    'consultant', 'executive', 'other',
  ]);
  if (raw.businessRole && validRoles.has(raw.businessRole)) {
    result.businessRole = raw.businessRole;
  }

  const validIndustries = new Set<string>([
    'automotive', 'aerospace_defense', 'medical', 'industrial',
    'consumer_electronics', 'telecom_networking', 'energy', 'other',
  ]);
  if (Array.isArray(raw.industries)) {
    const filtered = raw.industries.filter(v => validIndustries.has(v));
    if (filtered.length > 0) result.industries = filtered as IndustryVertical[];
  }

  const validProdTypes = new Set<string>([
    'pcb_assemblies', 'finished_consumer_products', 'sub_assemblies_modules',
    'prototypes_rnd', 'custom_contract_manufacturing', 'other',
  ]);
  if (Array.isArray(raw.productionTypes)) {
    const filtered = raw.productionTypes.filter(v => validProdTypes.has(v));
    if (filtered.length > 0) result.productionTypes = filtered as ProductionType[];
  }

  const validVolumes = new Set<string>([
    'prototype', 'low_volume', 'mid_volume', 'high_volume', 'varies',
  ]);
  if (raw.productionVolume && validVolumes.has(raw.productionVolume)) {
    result.productionVolume = raw.productionVolume;
  }

  const validPhases = new Set<string>([
    'early_design', 'pre_production_npi', 'volume_production',
    'sustaining_eol', 'all_phases',
  ]);
  if (raw.projectPhase && validPhases.has(raw.projectPhase)) {
    result.projectPhase = raw.projectPhase;
  }

  const validGoals = new Set<string>([
    'drop_in_replacements', 'reduce_bom_cost', 'manage_shortages',
    'reduce_sole_source', 'qualify_compliance', 'supply_chain_resilience',
    'streamline_procurement',
  ]);
  if (Array.isArray(raw.goals)) {
    const filtered = raw.goals.filter(v => validGoals.has(v)).slice(0, 3);
    if (filtered.length > 0) result.goals = filtered as UserGoal[];
  }

  return result;
}
