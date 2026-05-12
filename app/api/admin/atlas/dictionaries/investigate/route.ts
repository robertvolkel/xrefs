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
} from '@/lib/services/atlasTriageContext';

type CacheEntry = { value: unknown; expiresAt: number };
const INVESTIGATE_CACHE = new Map<string, CacheEntry>();
const INVESTIGATE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

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
 *  non-alphanumeric run to a single underscore + trim. Catches:
 *  "T(mm)" ↔ "t_mm", "Rds(on)" ↔ "rds_on", "阻抗值(Ω)" ↔ "阻抗值_Ω_". */
function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
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

  return `You are an electronics component parameter triage assistant. Your job is to look at a Chinese/English parameter name that the engineer has NOT been able to confidently accept yet, gather the evidence below, and produce a structured next-action verdict. The engineer is overwhelmed and needs ONE concrete next step, not generic "investigate this" advice.

${scopeLine}

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
- Confidence: "high" iff one bucket is clearly correct given the evidence. "medium" if you're choosing between two close calls. "low" if evidence is genuinely thin.
- Prose: 3-5 sentences in engineer-note voice. Cite the specific evidence (MPNs, sample values, cross-scope hits). Concrete, not generic.

PRIMARY ACTION PAYLOAD shape varies by bucket — fill the appropriate fields:

new_canonical: { "attributeId": "...", "attributeName": "...", "unit": "... or null" }
disambiguation: { "primary": { "attributeId": "...", "attributeName": "...", "rationale": "..." }, "alternative": { "attributeId": "...", "attributeName": "...", "rationale": "..." } }
wrong_family: { "actualFamilyId": "...", "signatureRecommendation": { "paramName": "...", "familyId": "...", "reasoning": "..." } }
unit_mismatch: { "existingCanonicalId": "...", "newAttributeId": "...", "newAttributeName": "...", "newUnit": "..." }
unscoped_products: { "perProductProposals": [{ "mpn": "...", "proposedFamilyId": "...", "reasoning": "..." }, ...] }
unmappable: {}

Respond in JSON ONLY, no markdown:
{
  "bucket": "new_canonical|disambiguation|wrong_family|unit_mismatch|unscoped_products|unmappable",
  "confidence": "high|medium|low",
  "evidence": {
    "nearestAcceptedInScope": [{ "attributeId": "...", "attributeName": "...", "reasoning": "..." }],
    "crossScopeOverrides": [{ "familyId": "...", "attributeId": "...", "attributeName": "...", "rawParam": "..." }],
    "sampleProducts": [{ "mpn": "...", "description": "...", "manufacturer": "...", "valueForParam": "..." }]
  },
  "recommendation": {
    "summary": "1-2 sentences plain English next step",
    "primaryActionLabel": "specific button label (e.g. 'Mint canonical reverse_current_ua')",
    "primaryActionPayload": { ... shape per bucket above ... },
    "alternativeActionLabel": "optional second-option button label (disambiguation only)",
    "alternativeActionPayload": { ... or omit ... }
  },
  "prose": "3-5 sentences in engineer-note voice with specific evidence cited"
}`;
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
    const cacheKey = `${scopeKey ?? '__none__'}::${paramName}`;
    if (forceRefresh) INVESTIGATE_CACHE.delete(cacheKey);
    const cached = forceRefresh ? null : INVESTIGATE_CACHE.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      const cachedPayload = cached.value as { analysis: unknown };
      return NextResponse.json({
        success: true,
        analysis: cachedPayload.analysis,
        cached: true,
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

    const schemaList =
      schemaAttrs.length > 0
        ? schemaAttrs.map((a) => `- ${a.attributeId}: ${a.attributeName}${a.unit ? ` (${a.unit})` : ''}`).join('\n')
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
    });

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      // 1600 vs the earlier 1200 — the prompt grew when we added the
      // pending-tier source-file evidence + [applied|pending] origin
      // tagging on each product. Disambiguation responses with full
      // evidence sections were occasionally truncating, which produced
      // unparseable JSON. 1600 gives Sonnet headroom without ballooning
      // cost (3K-4K input prompt vs 1.6K output is still a small call).
      max_tokens: 1600,
      system: prompt,
      messages: [{ role: 'user', content: `Investigate parameter: "${paramName}"` }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    // Multi-stage JSON extraction. Sonnet usually returns clean JSON, but
    // we've seen three failure modes in practice:
    //   1. Code-fence wrapping ("```json\n{...}\n```")
    //   2. Conversational preamble ("Here is the analysis:\n{...}")
    //   3. Trailing prose after the JSON
    // Stage 1: try the original direct parse with code-fence stripping.
    // Stage 2: slice between the first { and the last } — handles preamble
    // AND trailing prose AND nested objects in a single shot since outermost
    // {} bound the document.
    let parsed: Record<string, unknown> | null = null;
    let parseErrorMsg = '';
    const cleaned = text
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      parseErrorMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      // Stage 2 fallback — outermost-{} slice.
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        try {
          parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
        } catch (sliceErr) {
          parseErrorMsg += ` | slice retry: ${sliceErr instanceof Error ? sliceErr.message : String(sliceErr)}`;
        }
      }
    }

    if (!parsed) {
      const truncated = (response.stop_reason === 'max_tokens');
      console.error(
        'investigate JSON parse failed:',
        parseErrorMsg,
        'stop_reason:', response.stop_reason,
        'raw:', text.slice(0, 800),
      );
      return NextResponse.json(
        {
          success: false,
          error: truncated
            ? 'AI response was truncated (hit max_tokens). Try again, or shorten the prompt.'
            : 'AI response could not be parsed as JSON',
          detail: text.slice(0, 300),
          parseError: parseErrorMsg,
          stopReason: response.stop_reason,
        },
        { status: 502 },
      );
    }

    // Backfill the evidence layer with the raw fetched context. Sonnet
    // echoes some of this back in `evidence`, but the route is the
    // authoritative source — UI renders the raw data, not the AI's echo.
    const analysis = {
      ...parsed,
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

    return NextResponse.json({ success: true, analysis });
  } catch (err) {
    console.error('investigate route error:', err);
    return NextResponse.json(
      { success: false, error: 'Investigation failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
