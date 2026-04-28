/**
 * Override Merger — applies database-stored admin overrides on top of
 * hardcoded TypeScript logic tables and context questions.
 *
 * Follows the same remove → override → add pattern as deltaBuilder.ts,
 * but sourced from Supabase at runtime instead of compile-time deltas.
 */

import {
  LogicTable,
  MatchingRule,
  LogicType,
  ThresholdDirection,
  FamilyContextConfig,
  ContextQuestion,
  ContextOption,
  AttributeEffect,
} from '../types';
import { createClient } from '@/lib/supabase/server';

// ── DB Row Types ────────────────────────────────────────────

interface RuleOverrideRow {
  id: string;
  family_id: string;
  attribute_id: string;
  action: 'modify' | 'add' | 'remove';
  weight: number | null;
  logic_type: string | null;
  threshold_direction: string | null;
  upgrade_hierarchy: string[] | null;
  block_on_missing: boolean | null;
  tolerance_percent: number | null;
  value_aliases: string[][] | null;
  engineering_reason: string | null;
  attribute_name: string | null;
  sort_order: number | null;
  change_reason: string;
  created_by: string;
  created_at: string;
}

interface ContextOverrideRow {
  id: string;
  family_id: string;
  question_id: string;
  action: 'modify_question' | 'add_question' | 'disable_question' | 'add_option' | 'modify_option';
  question_text: string | null;
  priority: number | null;
  required: boolean | null;
  option_value: string | null;
  option_label: string | null;
  option_description: string | null;
  attribute_effects: AttributeEffect[] | null;
  change_reason: string;
  created_by: string;
  created_at: string;
}

// ── In-Memory Cache ─────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

const CACHE_TTL_MS = 60_000; // 1 minute
const ruleCache = new Map<string, CacheEntry<RuleOverrideRow[]>>();
const contextCache = new Map<string, CacheEntry<ContextOverrideRow[]>>();

/** Invalidate cache after admin writes */
export function invalidateOverrideCache(familyId?: string): void {
  if (familyId) {
    ruleCache.delete(familyId);
    contextCache.delete(familyId);
  } else {
    ruleCache.clear();
    contextCache.clear();
  }
}

// ── Fetchers ────────────────────────────────────────────────

async function fetchRuleOverrides(familyId: string): Promise<RuleOverrideRow[]> {
  const cached = ruleCache.get(familyId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.data;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('rule_overrides')
      .select('*')
      .eq('family_id', familyId)
      .eq('is_active', true);

    if (error) {
      console.error('[overrideMerger] Failed to fetch rule overrides:', error.message);
      return [];
    }

    const rows = (data ?? []) as RuleOverrideRow[];
    ruleCache.set(familyId, { data: rows, fetchedAt: Date.now() });
    return rows;
  } catch (err) {
    console.error('[overrideMerger] Rule override fetch error:', err);
    return [];
  }
}

async function fetchContextOverrides(familyId: string): Promise<ContextOverrideRow[]> {
  const cached = contextCache.get(familyId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.data;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('context_overrides')
      .select('*')
      .eq('family_id', familyId)
      .eq('is_active', true);

    if (error) {
      console.error('[overrideMerger] Failed to fetch context overrides:', error.message);
      return [];
    }

    const rows = (data ?? []) as ContextOverrideRow[];
    contextCache.set(familyId, { data: rows, fetchedAt: Date.now() });
    return rows;
  } catch (err) {
    console.error('[overrideMerger] Context override fetch error:', err);
    return [];
  }
}

// ── Rule Override Merger ────────────────────────────────────

/**
 * Apply active DB overrides on top of a TypeScript logic table.
 * Returns a new LogicTable — the original is never mutated.
 * Processing order: REMOVE → OVERRIDE → ADD → CLEANUP.
 */
export async function applyRuleOverrides(baseTable: LogicTable): Promise<LogicTable> {
  const overrides = await fetchRuleOverrides(baseTable.familyId);
  if (overrides.length === 0) return baseTable; // fast path

  // Deep clone rules
  let rules: MatchingRule[] = baseTable.rules.map(r => ({ ...r }));

  // 1. REMOVE
  const removes = overrides.filter(o => o.action === 'remove');
  if (removes.length > 0) {
    const removeSet = new Set(removes.map(r => r.attribute_id));
    rules = rules.filter(r => !removeSet.has(r.attributeId));
  }

  // 2. OVERRIDE (modify)
  for (const ov of overrides.filter(o => o.action === 'modify')) {
    const rule = rules.find(r => r.attributeId === ov.attribute_id);
    if (!rule) continue;
    if (ov.weight !== null) rule.weight = ov.weight;
    if (ov.logic_type !== null) rule.logicType = ov.logic_type as LogicType;
    if (ov.threshold_direction !== null) rule.thresholdDirection = ov.threshold_direction as ThresholdDirection;
    if (ov.upgrade_hierarchy !== null) rule.upgradeHierarchy = ov.upgrade_hierarchy;
    if (ov.block_on_missing !== null) rule.blockOnMissing = ov.block_on_missing;
    if (ov.tolerance_percent !== null) rule.tolerancePercent = ov.tolerance_percent;
    if (ov.value_aliases !== null) rule.valueAliases = ov.value_aliases;
    if (ov.engineering_reason !== null) rule.engineeringReason = ov.engineering_reason;
    if (ov.attribute_name !== null) rule.attributeName = ov.attribute_name;
    if (ov.sort_order !== null) rule.sortOrder = ov.sort_order;
  }

  // 3. ADD
  const adds = overrides.filter(o => o.action === 'add');
  if (adds.length > 0) {
    const maxSort = Math.max(...rules.map(r => r.sortOrder), 0);
    for (let i = 0; i < adds.length; i++) {
      const a = adds[i];
      rules.push({
        attributeId: a.attribute_id,
        attributeName: a.attribute_name ?? a.attribute_id,
        logicType: (a.logic_type as LogicType) ?? 'identity',
        weight: a.weight ?? 5,
        engineeringReason: a.engineering_reason ?? '',
        sortOrder: a.sort_order ?? maxSort + i + 1,
        ...(a.threshold_direction ? { thresholdDirection: a.threshold_direction as ThresholdDirection } : {}),
        ...(a.upgrade_hierarchy ? { upgradeHierarchy: a.upgrade_hierarchy } : {}),
        ...(a.block_on_missing != null ? { blockOnMissing: a.block_on_missing } : {}),
        ...(a.tolerance_percent != null ? { tolerancePercent: a.tolerance_percent } : {}),
        ...(a.value_aliases ? { valueAliases: a.value_aliases } : {}),
      });
    }
  }

  // 4. CLEANUP: strip fields that don't belong to the rule's logicType
  //    (same as deltaBuilder.ts lines 79-92)
  for (const rule of rules) {
    if (rule.logicType !== 'identity_upgrade') {
      delete (rule as Partial<MatchingRule>).upgradeHierarchy;
    }
    if (rule.logicType !== 'threshold' && rule.logicType !== 'fit') {
      delete (rule as Partial<MatchingRule>).thresholdDirection;
    }
    if (rule.logicType !== 'identity') {
      delete (rule as Partial<MatchingRule>).tolerancePercent;
    }
    if (rule.logicType !== 'identity' && rule.logicType !== 'identity_upgrade') {
      delete (rule as Partial<MatchingRule>).valueAliases;
    }
  }

  return { ...baseTable, rules };
}

// ── Context Override Merger ─────────────────────────────────

/**
 * Apply active DB overrides on top of a TypeScript context config.
 * Returns a new FamilyContextConfig — the original is never mutated.
 */
export async function applyContextOverrides(
  baseConfig: FamilyContextConfig
): Promise<FamilyContextConfig> {
  // Context configs can span multiple familyIds; fetch for any of them
  const familyId = baseConfig.familyIds[0];
  if (!familyId) return baseConfig;

  const overrides = await fetchContextOverrides(familyId);
  if (overrides.length === 0) return baseConfig; // fast path

  // Deep clone questions
  const questions: ContextQuestion[] = baseConfig.questions.map(q => ({
    ...q,
    options: q.options.map(o => ({
      ...o,
      attributeEffects: [...o.attributeEffects],
    })),
  }));

  // Process each override
  for (const ov of overrides) {
    switch (ov.action) {
      case 'disable_question': {
        const idx = questions.findIndex(q => q.questionId === ov.question_id);
        if (idx >= 0) questions.splice(idx, 1);
        break;
      }

      case 'modify_question': {
        const q = questions.find(q => q.questionId === ov.question_id);
        if (!q) break;
        if (ov.question_text !== null) q.questionText = ov.question_text;
        if (ov.priority !== null) q.priority = ov.priority;
        if (ov.required !== null) q.required = ov.required;
        break;
      }

      case 'add_question': {
        if (questions.find(q => q.questionId === ov.question_id)) break; // already exists
        const newQ: ContextQuestion = {
          questionId: ov.question_id,
          questionText: ov.question_text ?? '',
          priority: ov.priority ?? questions.length + 1,
          required: ov.required ?? false,
          options: [],
        };
        // If option data is provided in the same override, add it
        if (ov.option_value && ov.option_label) {
          newQ.options.push({
            value: ov.option_value,
            label: ov.option_label,
            description: ov.option_description ?? undefined,
            attributeEffects: ov.attribute_effects ?? [],
          });
        }
        questions.push(newQ);
        break;
      }

      case 'add_option': {
        const q = questions.find(q => q.questionId === ov.question_id);
        if (!q || !ov.option_value) break;
        if (q.options.find(o => o.value === ov.option_value)) break; // already exists
        const newOpt: ContextOption = {
          value: ov.option_value,
          label: ov.option_label ?? ov.option_value,
          description: ov.option_description ?? undefined,
          attributeEffects: ov.attribute_effects ?? [],
        };
        q.options.push(newOpt);
        break;
      }

      case 'modify_option': {
        const q = questions.find(q => q.questionId === ov.question_id);
        if (!q || !ov.option_value) break;
        const opt = q.options.find(o => o.value === ov.option_value);
        if (!opt) break;
        if (ov.option_label !== null) opt.label = ov.option_label;
        if (ov.option_description !== null) opt.description = ov.option_description;
        if (ov.attribute_effects !== null) opt.attributeEffects = ov.attribute_effects;
        break;
      }
    }
  }

  return { ...baseConfig, questions };
}
