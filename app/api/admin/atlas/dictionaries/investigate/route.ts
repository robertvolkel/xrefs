/**
 * POST /api/admin/atlas/dictionaries/investigate
 *
 * Deep-investigation pass for Atlas Dictionary Triage rows where the
 * per-row /suggest verdict is NOT a confident "accept" — i.e. defers
 * and unscoped rows. The /suggest verdict says "this looks safe / this
 * doesn't"; this route says "here's what to DO about it."
 *
 * Returns a structured DeepAnalysis: one of six action buckets, evidence
 * gathered from atlas_products + cross-scope overrides + nearest-accepted
 * canonicals, plus a primary action button payload the UI renders into
 * the right next-step button (Confirm Wrong Family / Mint Canonical /
 * Mark Unmappable / etc.).
 *
 * Sonnet 4.6, ~3K-token prompt, max 1200 output tokens. 24h in-memory
 * cache keyed on (paramName + scopeKey). Opt-in fire from the UI —
 * not eager — so token spend stays controlled.
 */
import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import {
  getSchemaAttributes,
  fetchAcceptedCanonicals,
  validateFamilyId,
  getCrossFamilyCanonicalSummary,
  detectCanonicalCollision,
  KNOWN_FAMILY_IDS_LIST,
} from '@/lib/services/atlasTriageContext';
import { getFamilyDomainCard } from '@/lib/services/atlasFamilyDomainCards';
import { computeSchemaVersion } from '@/lib/services/atlasSchemaVersion';

type CacheEntry = { value: unknown; expiresAt: number };
const INVESTIGATE_CACHE = new Map<string, CacheEntry>();
const INVESTIGATE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Bump when the tool schema or post-validation logic changes — old
// cached responses use a different shape and must expire.
// v6: migrated to Anthropic tool-use mode with strict enum on family IDs.
const INVESTIGATE_CACHE_VERSION = 'v9';

/**
 * Tool definition for the structured-output investigation verdict.
 *
 * Why tool-use instead of text+JSON.parse:
 *   1. Family ID fields (`actualFamilyId`, `signatureRecommendation.familyId`,
 *      `perProductProposals[].proposedFamilyId`) carry a strict `enum`
 *      constraint listing every valid family ID in the system. Sonnet sees
 *      this as part of the tool definition and is heavily nudged to
 *      comply — the previous text-JSON path let it invent IDs like
 *      `BJT_DIGITAL` freely.
 *   2. No JSON-text-extraction fallbacks needed. The model returns
 *      `tool_use` block with parsed input directly.
 *   3. Schema doubles as in-code documentation of the response contract.
 *
 * Post-validation still runs as a backstop (defense in depth) — if a
 * model somehow returns an out-of-enum value despite the tool definition,
 * the route catches and surfaces it via `validationErrors`.
 */
function buildTriageVerdictTool(): Anthropic.Tool {
  return {
    name: 'submit_triage_verdict',
    description:
      'Submit the structured triage verdict for the parameter under investigation. Use this tool exclusively — do not produce any text response outside the tool call.',
    input_schema: {
      type: 'object' as const,
      required: ['bucket', 'confidence', 'recommendation', 'prose'],
      properties: {
        bucket: {
          type: 'string' as const,
          enum: [
            'new_canonical',
            'disambiguation',
            'wrong_family',
            'unit_mismatch',
            'unscoped_products',
            'unmappable',
          ],
          description: 'The chosen action bucket.',
        },
        confidence: {
          type: 'string' as const,
          enum: ['high', 'medium', 'low'],
        },
        evidence: {
          type: 'object' as const,
          description:
            'Echo back relevant evidence. The route backfills sampleProducts and crossScopeOverrides from raw fetched data, so only nearestAcceptedInScope needs to be populated here.',
          properties: {
            nearestAcceptedInScope: {
              type: 'array' as const,
              items: {
                type: 'object' as const,
                properties: {
                  attributeId: { type: 'string' as const },
                  attributeName: { type: 'string' as const },
                  reasoning: { type: 'string' as const },
                },
              },
            },
          },
        },
        recommendation: {
          type: 'object' as const,
          required: ['summary', 'primaryActionLabel', 'primaryActionPayload'],
          properties: {
            summary: { type: 'string' as const },
            primaryActionLabel: { type: 'string' as const },
            primaryActionPayload: {
              type: 'object' as const,
              description:
                'Bucket-specific payload — only populate fields relevant to the chosen bucket. Family ID fields MUST be from the enumerated list.',
              properties: {
                // new_canonical
                attributeId: { type: 'string' as const },
                attributeName: { type: 'string' as const },
                unit: { type: ['string', 'null'] as ('string' | 'null')[] },
                // unit_mismatch
                existingCanonicalId: { type: 'string' as const },
                newAttributeId: { type: 'string' as const },
                newAttributeName: { type: 'string' as const },
                newUnit: { type: ['string', 'null'] as ('string' | 'null')[] },
                // disambiguation
                primary: {
                  type: 'object' as const,
                  properties: {
                    attributeId: { type: 'string' as const },
                    attributeName: { type: 'string' as const },
                    rationale: { type: 'string' as const },
                  },
                },
                alternative: {
                  type: 'object' as const,
                  properties: {
                    attributeId: { type: 'string' as const },
                    attributeName: { type: 'string' as const },
                    rationale: { type: 'string' as const },
                  },
                },
                // wrong_family — family ID fields are ENUM-CONSTRAINED
                actualFamilyId: {
                  type: 'string' as const,
                  enum: [...KNOWN_FAMILY_IDS_LIST],
                  description:
                    'The family the affected products actually belong to. MUST be one of the enumerated values — do not invent new IDs.',
                },
                signatureRecommendation: {
                  type: 'object' as const,
                  properties: {
                    paramName: { type: 'string' as const },
                    familyId: {
                      type: 'string' as const,
                      enum: [...KNOWN_FAMILY_IDS_LIST],
                      description:
                        'Target family for the FAMILY_PARAM_SIGNATURES entry. MUST be one of the enumerated values.',
                    },
                    reasoning: { type: 'string' as const },
                  },
                },
                // unscoped_products
                perProductProposals: {
                  type: 'array' as const,
                  items: {
                    type: 'object' as const,
                    required: ['mpn', 'proposedFamilyId'],
                    properties: {
                      mpn: { type: 'string' as const },
                      proposedFamilyId: {
                        type: 'string' as const,
                        enum: [...KNOWN_FAMILY_IDS_LIST],
                        description:
                          'Proposed family for this product. MUST be one of the enumerated values.',
                      },
                      reasoning: { type: 'string' as const },
                    },
                  },
                },
              },
            },
            alternativeActionLabel: { type: 'string' as const },
            alternativeActionPayload: { type: 'object' as const },
          },
        },
        prose: {
          type: 'string' as const,
          description: '3-5 sentences in engineer-note voice citing specific evidence.',
        },
      },
    },
  };
}

interface SampleProduct {
  mpn: string;
  description: string | null;
  manufacturer: string;
  category: string | null;
  subcategory: string | null;
  family_id: string | null;
  valueForParam: string | null;
  datasheetUrl: string | null;
  /** Which side of the ingest line this product came from.
   *  'applied' = lives in atlas_products (batch already proceeded).
   *  'pending' = read from the raw source JSON file because the batch
   *  is still in atlas_ingest_batches with status='pending'. */
  origin: 'applied' | 'pending';
}

interface SampleProductsDiag {
  mfrSlugsRequested: number;
  nameVariantsResolved: number;
  nameVariantsList: string[];
  productsScanned: number;
  productsCarryingParam: number;
  productsReturned: number;
  /** Per-origin breakdown so the engineer can see at a glance whether a
   *  pending batch or the applied tier (or both) contributed the affected
   *  products list. Mirrors how the queue itself aggregates from both. */
  appliedCount?: number;
  pendingCount?: number;
  pendingBatchesScanned?: number;
  /** A handful of actual JSONB keys observed across scanned products,
   *  shown when the paramName filter found nothing. Helps diagnose
   *  case / whitespace / normalization mismatches between the queue
   *  aggregation's reported paramName and the live JSONB shape. */
  sampleKeysObserved?: string[];
  matchMode?: 'exact' | 'case_insensitive';
}

/** Aggressive normalization used everywhere we need to match a paramName
 *  against a JSONB / source-file key. Strips case + collapses every
 *  non-letter / non-digit run to a single underscore + trim. Uses Unicode
 *  property escapes (\p{L} = any letter, \p{N} = any digit) so CJK chars,
 *  Greek (Ω, μ), Cyrillic, etc. are preserved (the prior ASCII-only regex
 *  collapsed CJK to a single underscore, causing semantically-different
 *  Chinese paramNames to falsely match — e.g. 输入侧 / 输出侧 both stripped
 *  to nothing). Catches: "T(mm)" ↔ "t_mm", "Rds(on)" ↔ "rds_on",
 *  "阻抗值(Ω)" ↔ "阻抗值_ω". */
function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '');
}

interface CrossScopeOverride {
  familyId: string;
  attributeId: string;
  attributeName: string;
  rawParam: string;
}

interface SampleValueDistribution {
  numeric: number;
  categorical: number;
  mixed: number;
  units: string[];
}

/** Resolve a set of MFR slugs to every known name variant
 *  (display/en/zh/aliases, plus whitespace-split tokens). atlas_products
 *  uses English-only manufacturer ("Sunlord") while atlas_manufacturers
 *  carries the combined form ("Sunlord 顺络"); without the split we'd
 *  miss every applied row. */
async function resolveMfrNameVariants(mfrSlugs: string[]): Promise<Set<string>> {
  const names = new Set<string>();
  if (mfrSlugs.length === 0) return names;
  const supabase = createServiceClient();
  const { data: mfrRows } = await supabase
    .from('atlas_manufacturers')
    .select('name_display, name_en, name_zh, aliases')
    .in('slug', mfrSlugs);
  const addVariant = (v: string | null | undefined) => {
    if (!v) return;
    const trimmed = v.trim();
    if (trimmed) names.add(trimmed);
    for (const tok of trimmed.split(/\s+/)) {
      const t = tok.trim();
      if (t) names.add(t);
    }
  };
  for (const r of mfrRows ?? []) {
    addVariant(r.name_display as string | null);
    addVariant(r.name_en as string | null);
    addVariant(r.name_zh as string | null);
    for (const a of ((r.aliases as string[] | null) ?? [])) addVariant(a);
  }
  return names;
}

/** Pull products carrying this paramName from atlas_products (i.e. already
 *  applied batches). Returns up to `limit` matches plus per-pass diagnostics
 *  so the caller can fold them into the combined diag. */
async function fetchAppliedSampleProducts(
  paramName: string,
  names: Set<string>,
  scopeKind: 'family' | 'category' | 'none',
  scopeKey: string | null,
  limit: number,
): Promise<{
  products: SampleProduct[];
  productsScanned: number;
  productsCarryingParam: number;
  matchMode: 'exact' | 'case_insensitive';
  sampleKeysObserved?: string[];
}> {
  if (names.size === 0 || limit <= 0) {
    return { products: [], productsScanned: 0, productsCarryingParam: 0, matchMode: 'exact' };
  }
  const supabase = createServiceClient();

  // Pull enough rows that we're likely to find at least `limit` carriers of
  // this paramName, even when a fraction of the MFR's SKUs use it. Filter
  // by scope to avoid the random sample landing on unrelated families
  // (e.g. Sunlord ships both inductors and capacitors).
  const SCAN_LIMIT = 500;
  let scanQuery = supabase
    .from('atlas_products')
    .select('mpn, description, manufacturer, category, subcategory, family_id, parameters, datasheet_url')
    .in('manufacturer', [...names])
    .limit(SCAN_LIMIT);
  if (scopeKind === 'family' && scopeKey) {
    scanQuery = scanQuery.eq('family_id', scopeKey);
  } else if (scopeKind === 'category' && scopeKey) {
    scanQuery = scanQuery.eq('category', scopeKey);
  }
  const { data, error } = await scanQuery;
  if (error) {
    console.error('fetchAppliedSampleProducts query error:', error);
    return { products: [], productsScanned: 0, productsCarryingParam: 0, matchMode: 'exact' };
  }
  const productsScanned = data?.length ?? 0;
  if (!data || data.length === 0) {
    return { products: [], productsScanned: 0, productsCarryingParam: 0, matchMode: 'exact' };
  }

  // First pass: exact-key match.
  let matching = data.filter((r) => {
    const params = r.parameters as Record<string, unknown> | null;
    return !!params && Object.prototype.hasOwnProperty.call(params, paramName);
  });
  let matchMode: 'exact' | 'case_insensitive' = 'exact';

  // Fallback: aggressive normalization.
  if (matching.length === 0) {
    const target = normalizeKey(paramName);
    matching = data.filter((r) => {
      const params = r.parameters as Record<string, unknown> | null;
      if (!params) return false;
      for (const k of Object.keys(params)) {
        if (normalizeKey(k) === target) return true;
      }
      return false;
    });
    matchMode = 'case_insensitive';
  }

  let sampleKeysObserved: string[] | undefined;
  if (matching.length === 0) {
    const keysSeen = new Set<string>();
    for (const r of data.slice(0, 5)) {
      const params = r.parameters as Record<string, unknown> | null;
      if (!params) continue;
      for (const k of Object.keys(params)) {
        keysSeen.add(k);
        if (keysSeen.size >= 30) break;
      }
      if (keysSeen.size >= 30) break;
    }
    sampleKeysObserved = [...keysSeen];
  }

  const resolveActualKey = (params: Record<string, unknown>): string | null => {
    if (Object.prototype.hasOwnProperty.call(params, paramName)) return paramName;
    const target = normalizeKey(paramName);
    for (const k of Object.keys(params)) {
      if (normalizeKey(k) === target) return k;
    }
    return null;
  };

  const products: SampleProduct[] = matching.slice(0, limit).map((r) => {
    const params = r.parameters as Record<string, unknown> | null;
    const actualKey = params ? resolveActualKey(params) : null;
    const raw = actualKey && params ? params[actualKey] : null;
    let valueForParam: string | null = null;
    if (raw && typeof raw === 'object' && 'value' in raw) {
      const v = (raw as { value: unknown }).value;
      valueForParam = v == null ? null : String(v);
    } else if (raw != null) {
      valueForParam = String(raw);
    }
    return {
      mpn: r.mpn as string,
      description: (r.description as string | null) ?? null,
      manufacturer: r.manufacturer as string,
      category: (r.category as string | null) ?? null,
      subcategory: (r.subcategory as string | null) ?? null,
      family_id: (r.family_id as string | null) ?? null,
      valueForParam,
      datasheetUrl: (r.datasheet_url as string | null) ?? null,
      origin: 'applied',
    };
  });

  return {
    products,
    productsScanned,
    productsCarryingParam: matching.length,
    matchMode,
    sampleKeysObserved,
  };
}

/** Pull products carrying this paramName from PENDING ingest batches by
 *  reading the raw source JSON files off disk. The Triage queue surfaces
 *  unmapped params the moment a batch is uploaded — long before it's
 *  applied — but the products don't enter atlas_products until Proceed.
 *  Reading the source file is the only way to give the engineer concrete
 *  affected products + datasheet URLs for pre-apply triage. */
async function fetchPendingSampleProducts(
  paramName: string,
  affectedBatchIds: string[],
  limit: number,
): Promise<{ products: SampleProduct[]; pendingBatchesScanned: number }> {
  if (affectedBatchIds.length === 0 || limit <= 0) {
    return { products: [], pendingBatchesScanned: 0 };
  }
  const supabase = createServiceClient();
  // Only consider pending — applied batches are already covered by
  // fetchAppliedSampleProducts (which sees the post-apply atlas_products
  // rows). Querying both here would double-count.
  const { data: batches, error } = await supabase
    .from('atlas_ingest_batches')
    .select('batch_id, source_file, manufacturer, status')
    .in('batch_id', affectedBatchIds)
    .eq('status', 'pending');
  if (error || !batches || batches.length === 0) {
    return { products: [], pendingBatchesScanned: 0 };
  }

  const target = normalizeKey(paramName);
  const products: SampleProduct[] = [];

  for (const batch of batches) {
    if (products.length >= limit) break;
    const sourceFile = batch.source_file as string;
    if (!sourceFile) continue;
    const filePath = path.resolve(process.cwd(), 'data/atlas', sourceFile);
    let raw: string;
    try {
      raw = await fs.readFile(filePath, 'utf-8');
    } catch (err) {
      console.error('fetchPendingSampleProducts: failed to read', filePath, err);
      continue;
    }
    let parsed: { manufacturer?: { name?: string }; models?: unknown[] };
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.error('fetchPendingSampleProducts: failed to parse', filePath, err);
      continue;
    }
    const mfrName =
      (parsed.manufacturer?.name as string | undefined) ?? (batch.manufacturer as string);
    for (const m of (parsed.models ?? []) as Array<Record<string, unknown>>) {
      if (products.length >= limit) break;
      const paramList = (m.parameters as Array<{ name?: unknown; value?: unknown }> | undefined) ?? [];
      let matchedValue: string | null = null;
      for (const p of paramList) {
        if (typeof p.name !== 'string') continue;
        if (normalizeKey(p.name) === target) {
          matchedValue = p.value == null ? null : String(p.value);
          break;
        }
      }
      if (matchedValue === null && !paramList.some((p) => typeof p.name === 'string' && normalizeKey(p.name) === target)) {
        continue;
      }
      const cat = m.category as { c1?: { name?: string }; c2?: { name?: string }; c3?: { name?: string } } | undefined;
      products.push({
        mpn: (m.componentName as string) ?? '',
        description: (m.description as string | null) ?? null,
        manufacturer: mfrName,
        category: cat?.c1?.name ?? null,
        subcategory: cat?.c3?.name ?? cat?.c2?.name ?? null,
        family_id: null,
        valueForParam: matchedValue,
        datasheetUrl: (m.datasheetUrl as string | null) ?? null,
        origin: 'pending',
      });
    }
  }

  return { products, pendingBatchesScanned: batches.length };
}

/** Pull up to 5 products that carry this paramName for the given MFR set
 *  AND/OR the given pending-batch ids. Mixes applied and pending so the
 *  engineer sees both sides when a param spans batches at different
 *  lifecycle states. */
async function fetchSampleProducts(
  paramName: string,
  mfrSlugs: string[],
  scopeKind: 'family' | 'category' | 'none',
  scopeKey: string | null,
  affectedBatchIds: string[],
): Promise<{ products: SampleProduct[]; diag: SampleProductsDiag }> {
  const diag: SampleProductsDiag = {
    mfrSlugsRequested: mfrSlugs.length,
    nameVariantsResolved: 0,
    nameVariantsList: [],
    productsScanned: 0,
    productsCarryingParam: 0,
    productsReturned: 0,
    appliedCount: 0,
    pendingCount: 0,
    pendingBatchesScanned: 0,
  };

  try {
    const names = await resolveMfrNameVariants(mfrSlugs);
    diag.nameVariantsResolved = names.size;
    diag.nameVariantsList = [...names];

    const TOTAL_LIMIT = 5;

    // Pass 1 — applied tier. Always fires; reports diag fields back so the
    // engineer-facing diagnostic stays accurate for the applied path.
    const applied = await fetchAppliedSampleProducts(
      paramName,
      names,
      scopeKind,
      scopeKey,
      TOTAL_LIMIT,
    );
    diag.productsScanned = applied.productsScanned;
    diag.productsCarryingParam = applied.productsCarryingParam;
    diag.matchMode = applied.matchMode;
    if (applied.sampleKeysObserved) diag.sampleKeysObserved = applied.sampleKeysObserved;
    diag.appliedCount = applied.products.length;

    // Pass 2 — pending tier. Fills any remaining slots from raw source JSON
    // for batches still in status='pending'. Common case for newly-uploaded
    // MFRs (e.g. INPAQ pre-Proceed) where atlas_products has zero rows yet.
    const remaining = TOTAL_LIMIT - applied.products.length;
    const pending = await fetchPendingSampleProducts(paramName, affectedBatchIds, remaining);
    diag.pendingCount = pending.products.length;
    diag.pendingBatchesScanned = pending.pendingBatchesScanned;

    const products = [...applied.products, ...pending.products];
    diag.productsReturned = products.length;
    return { products, diag };
  } catch (err) {
    console.error('fetchSampleProducts exception:', err);
    return { products: [], diag };
  }
}

/** Find dictionary overrides accepted under OTHER family/category scopes
 *  with an exact paramName match. Reveals cross-family/cross-L2 reuse
 *  candidates: "this same param was accepted as X under family Y — same
 *  concept applies here?" */
async function fetchCrossScopeOverrides(
  paramName: string,
  currentScope: string | null,
): Promise<CrossScopeOverride[]> {
  try {
    const supabase = createServiceClient();
    let query = supabase
      .from('atlas_dictionary_overrides')
      .select('family_id, attribute_id, attribute_name, param_name')
      .ilike('param_name', paramName.toLowerCase())
      .eq('is_active', true)
      .not('attribute_id', 'is', null)
      .limit(10);

    if (currentScope) {
      query = query.neq('family_id', currentScope);
    }

    const { data, error } = await query;
    if (error || !data) return [];
    return data.map((r) => ({
      familyId: r.family_id as string,
      attributeId: r.attribute_id as string,
      attributeName: (r.attribute_name as string) ?? (r.attribute_id as string),
      rawParam: r.param_name as string,
    }));
  } catch {
    return [];
  }
}

/** Classify sample values into numeric/categorical buckets and extract
 *  trailing-unit hints (e.g. "1.5kΩ" → units include 'Ω'; "100mm" → 'mm').
 *  Cheap heuristic — Sonnet uses this to spot unit/format mismatches. */
function classifySampleValues(samples: string[]): SampleValueDistribution {
  let numeric = 0;
  let categorical = 0;
  const units = new Set<string>();
  for (const s of samples) {
    const trimmed = s.trim();
    if (!trimmed) continue;
    // Numeric with optional unit suffix (e.g. "0.45V", "120uA", "1.5kΩ", "100mm²").
    const m = trimmed.match(/^([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)\s*([a-zA-Z%µμΩ°·\/²³]+)?$/);
    if (m) {
      numeric++;
      if (m[2]) units.add(m[2]);
    } else {
      categorical++;
    }
  }
  return {
    numeric,
    categorical,
    mixed: numeric > 0 && categorical > 0 ? Math.min(numeric, categorical) : 0,
    units: [...units],
  };
}

function buildPrompt(args: {
  paramName: string;
  scopeKind: 'family' | 'category' | 'none';
  scopeKey: string | null;
  schemaList: string;
  acceptedList: string;
  sampleProducts: SampleProduct[];
  crossScopeOverrides: CrossScopeOverride[];
  sampleValues: string[];
  distribution: SampleValueDistribution;
  /** Pre-resolved domain card text (caller awaited getFamilyDomainCard).
   *  buildPrompt stays sync so it remains easy to test. */
  domainCard: string | undefined;
}): string {
  const productsList =
    args.sampleProducts.length > 0
      ? args.sampleProducts
          .map(
            (p) =>
              `- [${p.origin}] ${p.manufacturer} ${p.mpn} (family=${p.family_id ?? 'null'}, category=${p.category ?? 'null'}/${p.subcategory ?? 'null'}): ${p.description ?? '(no description)'} — value: ${p.valueForParam ?? 'null'}`,
          )
          .join('\n')
      : '(no affected products available)';

  const crossList =
    args.crossScopeOverrides.length > 0
      ? args.crossScopeOverrides
          .map(
            (c) =>
              `- in scope "${c.familyId}", paramName "${c.rawParam}" was accepted as attributeId "${c.attributeId}" (${c.attributeName})`,
          )
          .join('\n')
      : '(no cross-scope hits)';

  const distroLine = `numeric=${args.distribution.numeric}, categorical=${args.distribution.categorical}, mixed=${args.distribution.mixed}, units=[${args.distribution.units.join(', ') || 'none detected'}]`;

  const scopeLine =
    args.scopeKind === 'none'
      ? 'NO SCOPE RESOLVED — these products have neither a family_id nor a category. The override cannot be saved until upstream classification is fixed.'
      : `Scope: ${args.scopeKind} = "${args.scopeKey}"`;

  const domainSection = args.domainCard
    ? `\n${args.scopeKey} DOMAIN CONTEXT — sub-types, common confusions, conventional units, foreign-family indicators (use this to disambiguate same-named canonicals and avoid inventing duplicates):\n${args.domainCard}\n`
    : '';

  return `You are an electronics component parameter triage assistant. Your job is to look at a Chinese/English parameter name that the engineer has NOT been able to confidently accept yet, gather the evidence below, and produce a structured next-action verdict. The engineer is overwhelmed and needs ONE concrete next step, not generic "investigate this" advice.

${scopeLine}
${domainSection}
Schema attributes in this scope (canonical attributeIds with weighted matching rules):
${args.schemaList}

Previously-accepted attributeIds in this same scope (oldest paramName shown for each — strongest signal of what concept each canonical was minted for):
${args.acceptedList}

Top affected products (top 5 sample products carrying this paramName):
${productsList}

Cross-scope override hits (this exact paramName was accepted as the following attributeId in OTHER scopes):
${crossList}

Sample values for this paramName: ${args.sampleValues.length > 0 ? args.sampleValues.join(', ') : '(none provided)'}
Value distribution: ${distroLine}

Decide ONE bucket from the following six. Each bucket maps to a specific next action the engineer can take with one click:

- "new_canonical" — The param represents a real spec that is not in the schema list AND has no good match in the previously-accepted canonicals. Sample values are coherent and reveal what the spec is. Action: propose a new attributeId, attributeName, and unit. Engineer reviews + commits the override.

- "disambiguation" — Two or more plausible canonicals fit the param. The product context or sample values lean toward one. Action: propose the two best options (primary + alternative), each with rationale, so the engineer can pick.

- "wrong_family" — The affected products are misclassified. The param name + sample values clearly belong to a different family than the one assigned. Action: confirm wrong-family AND recommend a specific entry to add to FAMILY_PARAM_SIGNATURES (paramName + correct family) so future ingests reclassify automatically.

- "unit_mismatch" — The concept matches an existing canonical, but the unit/format differs (e.g. existing canonical is "wire_gauge" assuming AWG, but values are mm² CSA). Action: propose a unit-specific variant attributeId (e.g. "wire_csa_mm2"). Engineer commits as a separate canonical.

- "unscoped_products" — The scope is "none" above. Action: for each affected product, propose what family_id it should have based on MPN pattern + description. Engineer reviews per-product proposals. (This bucket only applies when scope is none.)

- "unmappable" — Truly unique noise: MFR-internal code, marketing copy, datasheet metadata, etc. No matching engine rule could ever consume this. Action: mark unmappable; the row drops from the queue.

CRITICAL RULES:
- Choose exactly ONE bucket. Pick the one with the strongest evidence.
- If scope is "none", you MUST pick "unscoped_products" or "unmappable" — the other buckets require a resolvable scope.
- For "wrong_family", be specific: state which family the products actually belong to (e.g. "B6 — these are BJTs") and which specific paramName + family pair should be added to FAMILY_PARAM_SIGNATURES.
- For "new_canonical" and "unit_mismatch", invent specific attributeIds (e.g. "reverse_current_ua", not "current") and explain why no existing canonical fits.
- BEFORE picking "new_canonical", CHECK the cross-scope override hits and the cross-family canonical inventory: if a canonical with the SAME concept already exists in another family (e.g., \`isolation_voltage\` exists in L2 Power Supplies / Transformers for the same physical spec), PROPOSE THAT EXISTING attributeId verbatim in primaryActionPayload — do NOT mint a unit-suffixed variant like \`isolation_voltage_kvrms\` just to dodge a name collision. Reusing the existing canonical name across families is the correct outcome; the unit is conventional and implied. The engineer will accept the override, and the family's logic table will get a rule added separately so the matching engine consumes the value.
- primaryActionLabel MUST embed the specific proposed attributeId in backticks so the engineer can see what they're committing to. Format: \`Create new canonical \`<attributeId>\`\` (new_canonical), \`Mint \`<newAttributeId>\` (unit variant)\` (unit_mismatch), \`Map to \`<attributeId>\`\` (disambiguation). NEVER use a generic label like "Create new canonical attribute" — always include the actual ID.
- Confidence: "high" iff one bucket is clearly correct given the evidence. "medium" if you're choosing between two close calls. "low" if evidence is genuinely thin.
- Prose: 3-5 sentences in engineer-note voice. Cite the specific evidence (MPNs, sample values, cross-scope hits). Concrete, not generic.

FAMILY ID CONSTRAINT — HARD ENUMERATED LIST:
When populating ANY family ID field (actualFamilyId, signatureRecommendation.familyId, perProductProposals[].proposedFamilyId), you MUST choose from this exact list. Do NOT invent new IDs. If none of these fit, use bucket "unmappable" instead.

Valid family IDs: ${KNOWN_FAMILY_IDS_LIST.join(', ')}

(L3 IDs like B5/C2 are component families with logic tables. L2 names like "Microcontrollers"/"Sensors" are broader category buckets used as override scopes per Decision #178. Both are valid as family ID values.)

Return your verdict using the submit_triage_verdict tool. Field shapes per bucket:

new_canonical → primaryActionPayload: { attributeId, attributeName, unit }
disambiguation → primaryActionPayload: { primary: { attributeId, attributeName, rationale }, alternative: { attributeId, attributeName, rationale } }
wrong_family → primaryActionPayload: { actualFamilyId, signatureRecommendation: { paramName, familyId, reasoning } }   // BOTH actualFamilyId AND signatureRecommendation.familyId must be from the enum list
unit_mismatch → primaryActionPayload: { existingCanonicalId, newAttributeId, newAttributeName, newUnit }
unscoped_products → primaryActionPayload: { perProductProposals: [{ mpn, proposedFamilyId, reasoning }] }   // each proposedFamilyId must be from the enum list
unmappable → primaryActionPayload: {}

Do NOT respond with text — submit the verdict via the tool call only.`;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'No API key configured' }, { status: 500 });
    }

    const body = await request.json();
    const paramName = body.paramName as string;
    const samples = (body.samples as string[]) ?? [];
    const familyId = (body.familyId as string | null) ?? null;
    const dominantCategory = (body.dominantCategory as string | null) ?? null;
    const mfrSlugs = (body.affectedManufacturerSlugs as string[]) ?? [];
    const affectedBatchIds = (body.affectedBatchIds as string[]) ?? [];
    const forceRefresh = body.forceRefresh === true;

    if (!paramName) {
      return NextResponse.json({ success: false, error: 'paramName required' }, { status: 400 });
    }

    // Resolve override scope. Family beats category (consistent with
    // getOverrideScope on the client). Both null = unscoped row, which is
    // a valid input — the AI handles it with bucket=unscoped_products.
    const scopeKind: 'family' | 'category' | 'none' = familyId
      ? 'family'
      : dominantCategory
        ? 'category'
        : 'none';
    const scopeKey = scopeKind === 'family' ? familyId : scopeKind === 'category' ? dominantCategory : null;

    // Cache by (paramName + scope). Sample values don't materially change
    // the verdict — they shape the prose but not the bucket — so we omit
    // them from the cache key (same approach as /suggest).
    //
    // We do NOT persist an audit row here. Decision (May 2026): only
    // engineer DECISIONS get audit rows, not every Investigate click.
    // Otherwise an engineer firing Investigate 7 times while iterating
    // on a tricky param creates 7 orphan "Pending" log entries that
    // never resolve. The decision endpoint
    // [POST /api/admin/atlas/triage-investigations] takes the analysis
    // payload at action-time and writes a single complete row.
    const cacheKey = `${INVESTIGATE_CACHE_VERSION}::${scopeKey ?? '__none__'}::${paramName}`;
    // Resolve current schema + card versions for staleness signaling
    // (returned on both cache-hit and miss branches so the client can
    // store them with the cached analysis).
    const currentSchemaVersion = scopeKind === 'family' ? computeSchemaVersion(scopeKey) : null;
    let currentCardVersion: string | null = null;
    if (scopeKind === 'family' && scopeKey) {
      try {
        const supabase = createServiceClient();
        const { data: cardRow } = await supabase
          .from('atlas_family_domain_cards')
          .select('updated_at')
          .eq('family_id', scopeKey)
          .eq('status', 'active')
          .maybeSingle();
        if (cardRow?.updated_at) currentCardVersion = cardRow.updated_at as string;
      } catch {
        // Fail-open
      }
    }

    if (forceRefresh) INVESTIGATE_CACHE.delete(cacheKey);
    const cached = forceRefresh ? null : INVESTIGATE_CACHE.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      const cachedPayload = cached.value as { analysis: unknown };
      return NextResponse.json({
        success: true,
        analysis: cachedPayload.analysis,
        cached: true,
        currentCardVersion,
        currentSchemaVersion,
      });
    }

    // Gather context in parallel.
    const [schemaAttrs, acceptedCanonicals, sampleProductsResult, crossScopeOverrides] = await Promise.all([
      Promise.resolve(scopeKey ? getSchemaAttributes(scopeKey) : []),
      scopeKey ? fetchAcceptedCanonicals(scopeKey) : Promise.resolve([]),
      fetchSampleProducts(paramName, mfrSlugs, scopeKind, scopeKey, affectedBatchIds),
      fetchCrossScopeOverrides(paramName, scopeKey),
    ]);
    const sampleProducts = sampleProductsResult.products;
    const sampleProductsDiag = sampleProductsResult.diag;

    const distribution = classifySampleValues(samples);

    // Include engineering reason per attribute so the model can disambiguate
    // same-named canonicals (e.g., distinguish output-side `vdd_range` from
    // a generic VCC reading on an isolated driver's input side). Without
    // this, prior /investigate runs proposed unit-suffixed variants like
    // `isolation_voltage_kvrms` because the existing `isolation_voltage`
    // looked like a generic label. L2 entries have no engineering reason
    // and render with id+name only.
    const schemaList =
      schemaAttrs.length > 0
        ? schemaAttrs.map((a) => {
            const head = `- ${a.attributeId}: ${a.attributeName}${a.unit ? ` (${a.unit})` : ''}`;
            return a.engineeringReason ? `${head}\n    Reason: ${a.engineeringReason}` : head;
          }).join('\n')
        : '(no schema attributes available)';
    const acceptedList =
      acceptedCanonicals.length > 0
        ? acceptedCanonicals
            .map(
              (c) =>
                `- ${c.attributeId}: ${c.attributeName}${c.unit ? ` (${c.unit})` : ''} — originally accepted for "${c.exampleRawParam}"`,
            )
            .join('\n')
        : '(none yet)';

    // Resolve the per-family domain card (DB-active row OR TS fallback).
    // Only for family-scope rows — L2 category rows don't get cards.
    const domainCard = scopeKind === 'family' ? await getFamilyDomainCard(scopeKey) : undefined;

    const prompt = buildPrompt({
      paramName,
      scopeKind,
      scopeKey,
      schemaList,
      acceptedList,
      sampleProducts,
      crossScopeOverrides,
      sampleValues: samples.slice(0, 20),
      distribution,
      domainCard,
    });

    const client = new Anthropic({ apiKey });
    const triageTool = buildTriageVerdictTool();
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      // 1600 was set when the prompt added pending-tier source-file
      // evidence + [applied|pending] origin tagging. Tool-use mode
      // skips the JSON instructions in the prompt, so the model has
      // slightly more headroom — but keep 1600 to avoid truncation
      // on complex disambiguation responses.
      max_tokens: 1600,
      system: prompt,
      messages: [{ role: 'user', content: `Investigate parameter: "${paramName}"` }],
      tools: [triageTool],
      tool_choice: { type: 'tool', name: 'submit_triage_verdict' },
    });

    // Extract the tool_use block. With `tool_choice` forcing this tool,
    // Sonnet must return a tool_use content block; if it somehow doesn't,
    // surface the failure to the engineer rather than guessing.
    const toolUseBlock = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'submit_triage_verdict',
    );

    if (!toolUseBlock) {
      const truncated = response.stop_reason === 'max_tokens';
      console.error(
        'investigate tool-use missing:',
        'stop_reason:', response.stop_reason,
        'content_types:', response.content.map((b) => b.type).join(','),
      );
      return NextResponse.json(
        {
          success: false,
          error: truncated
            ? 'AI response was truncated (hit max_tokens). Try again.'
            : 'AI did not invoke the submit_triage_verdict tool.',
          stopReason: response.stop_reason,
        },
        { status: 502 },
      );
    }

    const parsed = toolUseBlock.input as Record<string, unknown>;

    // ── Post-validation backstop ──────────────────────────────────────
    //
    // With tool-use mode + family-ID enum constraints, Sonnet should
    // virtually never return out-of-set values. This block remains as
    // belt-and-suspenders: if the model somehow slips through (or if a
    // future schema loosening introduces a gap), surface the issue via
    // `validationErrors` so the UI suppresses the action button.

    const validationErrors: Array<{ kind: 'unknown_family' | 'duplicate_canonical'; detail: string }> = [];

    const rec = (parsed.recommendation as Record<string, unknown> | undefined) ?? {};
    const payload = (rec.primaryActionPayload as Record<string, unknown> | undefined) ?? {};

    // (1a) wrong_family bucket: `actualFamilyId` AND
    //      `signatureRecommendation.familyId` both must be valid.
    const invalidFamilyIds = new Set<string>();
    const actualFamilyId = payload.actualFamilyId;
    if (typeof actualFamilyId === 'string' && actualFamilyId && !validateFamilyId(actualFamilyId)) {
      invalidFamilyIds.add(actualFamilyId);
    }
    const sigRec = payload.signatureRecommendation as Record<string, unknown> | undefined;
    const sigFamilyId = sigRec?.familyId;
    if (typeof sigFamilyId === 'string' && sigFamilyId && !validateFamilyId(sigFamilyId)) {
      invalidFamilyIds.add(sigFamilyId);
    }
    if (invalidFamilyIds.size > 0) {
      validationErrors.push({
        kind: 'unknown_family',
        detail: `AI returned unknown family ID(s): ${[...invalidFamilyIds].map((id) => `'${id}'`).join(', ')}. Valid IDs are limited to L3 family codes (B1-F2, numeric passives like '52') and L2 category names. Manual review required.`,
      });
    }

    // (1b) unscoped_products bucket:
    //      perProductProposals[].proposedFamilyId all must be valid.
    const perProduct = payload.perProductProposals;
    if (Array.isArray(perProduct)) {
      const invalidProductIds = new Set<string>();
      for (const item of perProduct) {
        const fid = (item as Record<string, unknown> | undefined)?.proposedFamilyId;
        if (typeof fid === 'string' && fid && !validateFamilyId(fid)) invalidProductIds.add(fid);
      }
      if (invalidProductIds.size > 0) {
        validationErrors.push({
          kind: 'unknown_family',
          detail: `AI suggested per-product family ID(s) '${[...invalidProductIds].join(', ')}' which are not in the known set.`,
        });
      }
    }

    // (2) Canonical collision check — new_canonical bucket carries the
    // proposed attributeId at payload.attributeId. Verify against the
    // full cross-family inventory.
    //
    // Two collision kinds, two policies:
    //   - 'near' (e.g., `isolation_voltage_kvrms` vs existing `isolation_voltage`)
    //     → hard validation error. The engineer should either reuse the
    //     existing canonical name or differentiate clearly. Action button
    //     suppressed.
    //   - 'exact' (proposed ID is verbatim identical to an existing canonical)
    //     → NON-blocking note. Engineer is proposing to reuse a known
    //     canonical and extend it to the current family — that's the right
    //     call. We rewrite the AI's prose so the engineer sees "extending
    //     existing canonical" and clicks Accept. The matching engine still
    //     needs a rule added to the family's logic table for that ID to be
    //     consulted at score time, but the override write itself is fine.
    const bucket = parsed.bucket as string | undefined;
    const proposedAttrId = payload.attributeId as string | undefined;
    if (bucket === 'new_canonical' && proposedAttrId) {
      const inventory = await getCrossFamilyCanonicalSummary();
      const collision = detectCanonicalCollision(proposedAttrId, inventory, scopeKey ?? '');
      if (collision?.kind === 'near') {
        validationErrors.push({
          kind: 'duplicate_canonical',
          detail: `Proposed canonical '${proposedAttrId}' near-duplicates existing '${collision.existingId}' (${collision.existingName}) in ${collision.families.join(', ')}. Consider reusing the existing canonical or picking a clearly differentiated name.`,
        });
      } else if (collision?.kind === 'exact') {
        // Annotate the recommendation summary in place rather than blocking.
        const extendNote = `Note: this canonical already exists in ${collision.families.join(', ')}. Accepting will extend it to ${scopeKey ?? 'the current family'}. The matching engine will treat values as display-only until a logic-table rule is added for '${collision.existingId}' in ${scopeKey ?? 'this family'}.`;
        if (parsed.recommendation && typeof parsed.recommendation === 'object') {
          const rec = parsed.recommendation as Record<string, unknown>;
          const summary = (rec.summary as string | undefined) ?? '';
          rec.summary = summary ? `${summary}\n\n${extendNote}` : extendNote;
        }
      }
    }
    // Also check unit_mismatch bucket's newAttributeId field.
    const newAttrId = payload.newAttributeId as string | undefined;
    if (bucket === 'unit_mismatch' && newAttrId) {
      const inventory = await getCrossFamilyCanonicalSummary();
      const collision = detectCanonicalCollision(newAttrId, inventory, scopeKey ?? '');
      // unit_mismatch is specifically about minting a unit-variant, so
      // even an 'exact' match here is suspicious — we still flag it so
      // the engineer can decide whether to actually fork by unit.
      if (collision) {
        validationErrors.push({
          kind: 'duplicate_canonical',
          detail: `Proposed unit-variant canonical '${newAttrId}' ${collision.kind === 'exact' ? 'duplicates' : 'near-duplicates'} existing '${collision.existingId}' in ${collision.families.join(', ')}.`,
        });
      }
    }

    // Backfill the evidence layer with the raw fetched context. Sonnet
    // echoes some of this back in `evidence`, but the route is the
    // authoritative source — UI renders the raw data, not the AI's echo.
    const analysis = {
      ...parsed,
      validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
      evidence: {
        sampleProducts: sampleProducts.map((p) => ({
          mpn: p.mpn,
          description: p.description,
          manufacturer: p.manufacturer,
          valueForParam: p.valueForParam,
          datasheetUrl: p.datasheetUrl,
          origin: p.origin,
        })),
        crossScopeOverrides,
        nearestAcceptedInScope:
          (parsed.evidence as Record<string, unknown> | undefined)?.nearestAcceptedInScope ?? [],
        sampleValueDistribution: distribution,
        sampleProductsDiag,
      },
    };

    INVESTIGATE_CACHE.set(cacheKey, {
      value: { analysis },
      expiresAt: Date.now() + INVESTIGATE_CACHE_TTL_MS,
    });

    return NextResponse.json({
      success: true,
      analysis,
      currentCardVersion,
      currentSchemaVersion,
    });
  } catch (err) {
    console.error('investigate route error:', err);
    return NextResponse.json(
      { success: false, error: 'Investigation failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
