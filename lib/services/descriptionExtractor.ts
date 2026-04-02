/**
 * Atlas Description Extractor
 *
 * Extracts structured attribute values from Atlas product description text
 * using Claude Haiku with quote grounding (anti-hallucination).
 *
 * Two-phase approach:
 * 1. buildSchemaPrompt() — generates the attribute schema for a family
 * 2. parseExtractionResponse() — validates LLM output with quote grounding
 *
 * Used by scripts/atlas-extract-descriptions.mjs for batch processing.
 */

import { getLogicTable } from '../logicTables';
import type { MatchingRule } from '../types';

// ─── Types ────────────────────────────────────────────────

export interface ExtractedAttribute {
  attributeId: string;
  value: string;
  source: string; // exact substring from description (for grounding)
}

export interface ExtractionResult {
  accepted: ExtractedAttribute[];
  rejected: ExtractedAttribute[]; // failed quote grounding
}

// ─── AEC Family Routing ──────────────────────────────────

const PASSIVE_FAMILIES = new Set([
  '12', '13', '52', '53', '54', '55', '58', '59', '60', '61',
  '64', '65', '66', '67', '68', '69', '70', '71', '72', 'D1', 'D2',
]);
const DISCRETE_FAMILIES = new Set([
  'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'E1',
]);
const IC_FAMILIES = new Set([
  'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10',
]);

function getAecAttributeForFamily(familyId: string): { attributeId: string; attributeName: string } | null {
  if (PASSIVE_FAMILIES.has(familyId) || familyId === 'F1') {
    return { attributeId: 'aec_q200', attributeName: 'AEC-Q200 Qualification (Yes/No)' };
  }
  if (DISCRETE_FAMILIES.has(familyId)) {
    return { attributeId: 'aec_q101', attributeName: 'AEC-Q101 Qualification (Yes/No)' };
  }
  if (IC_FAMILIES.has(familyId)) {
    return { attributeId: 'aec_q100', attributeName: 'AEC-Q100 Qualification (Yes/No)' };
  }
  return null;
}

// ─── Unit inference from rule metadata ───────────────────

/** Infer a hint about units/format from the rule's type and engineering reason */
function inferUnitHint(rule: MatchingRule): string {
  const id = rule.attributeId;
  const reason = rule.engineeringReason.toLowerCase();

  // Common unit patterns from attribute IDs and engineering reasons
  if (id.includes('voltage') || id.includes('_v') || id.endsWith('_vdc') || id.endsWith('_vac')) return 'unit: V';
  if (id.includes('current') || id.includes('_a') || id === 'id' || id === 'igss') return 'unit: A';
  if (id.includes('resistance') || id === 'dcr' || id === 'acr' || id === 'esr') return 'unit: Ω';
  if (id.includes('capacitance') || id === 'c0') return 'unit: F';
  if (id.includes('inductance')) return 'unit: H';
  if (id.includes('frequency') || id === 'srf' || id === 'fsw') return 'unit: Hz';
  if (id.includes('power') || id === 'pd') return 'unit: W';
  if (id === 'tolerance') return 'format: ±X%';
  if (id === 'operating_temp' || id.includes('temp')) return 'format: -55°C to +155°C';
  if (id === 'height') return 'unit: mm';
  if (id.includes('time') || id === 'trr' || id === 'tq') return 'unit: s';
  if (id === 'ctr_min' || id === 'ctr_max') return 'unit: %';

  // Try to infer from engineering reason
  if (reason.includes('volt')) return 'unit: V';
  if (reason.includes('ampere') || reason.includes('current')) return 'unit: A';
  if (reason.includes('ohm') || reason.includes('resistance')) return 'unit: Ω';
  if (reason.includes('frequency') || reason.includes('hz')) return 'unit: Hz';

  return '';
}

/** Build a constraint hint for categorical/upgrade attributes */
function inferConstraintHint(rule: MatchingRule): string {
  if (rule.logicType === 'identity_upgrade' && rule.upgradeHierarchy?.length) {
    return `options: ${rule.upgradeHierarchy.join(' / ')}`;
  }
  if (rule.logicType === 'identity_flag') {
    return 'Yes/No';
  }
  return '';
}

// ─── Schema Prompt Builder ───────────────────────────────

/**
 * Build the attribute schema section of the extraction prompt for a family.
 * Returns null if no logic table exists for the family.
 */
export function buildSchemaPrompt(familyId: string): string | null {
  const table = getLogicTable(familyId);
  if (!table) return null;

  const lines: string[] = [];

  for (const rule of table.rules) {
    // Skip application_review and operational — not extractable from descriptions
    if (rule.logicType === 'application_review') continue;

    let hint = inferUnitHint(rule);
    const constraint = inferConstraintHint(rule);
    if (constraint && !hint) hint = constraint;
    else if (constraint) hint = `${hint}, ${constraint}`;

    const hintStr = hint ? `, ${hint}` : '';
    lines.push(`- ${rule.attributeId} (${rule.attributeName}${hintStr})`);
  }

  // Add AEC qualification if not already in rules
  const aec = getAecAttributeForFamily(familyId);
  if (aec && !table.rules.some(r => r.attributeId === aec.attributeId)) {
    lines.push(`- ${aec.attributeId} (${aec.attributeName})`);
  }

  return lines.join('\n');
}

/**
 * Build the full extraction prompt for a product.
 */
export function buildExtractionPrompt(description: string, familyId: string): string | null {
  const schema = buildSchemaPrompt(familyId);
  if (!schema) return null;

  return `Extract attribute values from this electronic component description.
Only extract values explicitly stated in the text. Do not infer or calculate values.
If a value is a range covering an entire product series (not a specific part), skip it.

For each extraction, return the value AND the exact substring from the description it came from.

Schema attributes:
${schema}

Description: "${description}"

Return JSON only, no markdown fences: {"attributeId": {"value": "...", "source": "exact substring from description"}, ...}
If no attributes can be extracted, return: {}`;
}

// ─── Response Parser with Quote Grounding ────────────────

/**
 * Parse and validate Haiku's extraction response.
 * Rejects any extraction where the source substring is not found in the original description.
 */
export function parseExtractionResponse(
  responseText: string,
  originalDescription: string,
  familyId: string,
): ExtractionResult {
  const accepted: ExtractedAttribute[] = [];
  const rejected: ExtractedAttribute[] = [];

  // Get valid attribute IDs for this family
  const table = getLogicTable(familyId);
  if (!table) return { accepted, rejected };

  const validIds = new Set(table.rules.map(r => r.attributeId));
  // Also add AEC
  const aec = getAecAttributeForFamily(familyId);
  if (aec) validIds.add(aec.attributeId);

  // Parse JSON from response (handle markdown fences if present)
  let json: Record<string, { value?: string; source?: string }>;
  try {
    let cleaned = responseText.trim();
    // Strip markdown code fences
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    json = JSON.parse(cleaned);
  } catch {
    // If JSON parsing fails, return empty
    return { accepted, rejected };
  }

  if (!json || typeof json !== 'object') return { accepted, rejected };

  const descLower = originalDescription.toLowerCase();

  for (const [attrId, extraction] of Object.entries(json)) {
    // Skip unknown attribute IDs
    if (!validIds.has(attrId)) continue;

    if (!extraction || typeof extraction !== 'object') continue;
    const { value, source } = extraction;
    if (!value || !source) continue;

    const entry: ExtractedAttribute = { attributeId: attrId, value: String(value), source: String(source) };

    // Quote grounding: verify source is a substring of the original description
    const sourceLower = String(source).toLowerCase();
    if (descLower.includes(sourceLower)) {
      accepted.push(entry);
    } else {
      rejected.push(entry);
    }
  }

  return { accepted, rejected };
}

// ─── Gap-Fill Merge ──────────────────────────────────────

/**
 * Merge extracted attributes into existing parameters, gap-fill only.
 * Returns only the NEW attributes that don't conflict with existing ones.
 *
 * @param existingAttrIds Set of attribute IDs already present on the product
 * @param extracted Validated extracted attributes from LLM
 */
export function mergeExtractedAttributes(
  existingAttrIds: Set<string>,
  extracted: ExtractedAttribute[],
): ExtractedAttribute[] {
  return extracted.filter(attr => !existingAttrIds.has(attr.attributeId));
}
