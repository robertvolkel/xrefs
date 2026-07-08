/**
 * atlasParamSuggestionStore — durable persistence for AI Generate verdicts.
 *
 * Backs the `atlas_param_suggestions` table (see
 * scripts/supabase-atlas-param-suggestions-schema.sql). Server-only. All access
 * goes through the service-role client (bypasses RLS; the routes gate on
 * requireAdmin() upstream).
 *
 * Why this exists: before this table an AI verdict lived only in the engineer's
 * localStorage + a 24h in-memory server cache, so the server could not count or
 * filter "Accept" across the whole queue and the generated pile was not durable.
 *
 * Scope key mirrors the dictionary-override scope EXACTLY (Decision #178 and
 * getOverrideScope in GlobalUnmappedParamsTable.tsx):
 *   scopeKey = dominantFamily ?? dominantCategory ?? ''
 * and param_name is stored NORMALIZED (normalizeOverrideKey = NFC+lower+trim,
 * mirrored here as `normalizeParamKey`) so a queue row's (scopeKey, normalized
 * paramName) looks its verdict up directly.
 */

import { createServiceClient } from '@/lib/supabase/service';
import {
  type StoredSuggestion,
  type Verdict,
  normalizeParamKey,
  verdictMapKey,
} from '@/lib/services/atlasParamSuggestionTypes';

// Re-export the client-safe types/helpers so existing `from
// atlasParamSuggestionStore` imports keep working (server-only callers).
export {
  type StoredSuggestion,
  type Verdict,
  normalizeParamKey,
  scopeKeyForRow,
  verdictMapKey,
} from '@/lib/services/atlasParamSuggestionTypes';

interface SuggestionRow {
  family_id: string;
  param_name: string;
  raw_param_name: string | null;
  verdict: string | null;
  suggested_attribute_id: string | null;
  suggested_attribute_name: string | null;
  suggested_unit: string | null;
  translation: string | null;
  confidence: string | null;
  reasoning: string | null;
  explanation: string | null;
  card_version_at_write: string | null;
  schema_version_at_write: string | null;
}

function rowToStored(row: SuggestionRow): StoredSuggestion {
  return {
    translation: row.translation ?? null,
    suggestedAttributeId: row.suggested_attribute_id ?? null,
    suggestedAttributeName: row.suggested_attribute_name ?? null,
    suggestedUnit: row.suggested_unit ?? null,
    confidence: row.confidence ?? null,
    reasoning: row.reasoning ?? null,
    suggestion: row.verdict === 'accept' || row.verdict === 'defer' ? row.verdict : null,
    explanation: row.explanation ?? null,
    // Carry the at-write versions so the client's staleness check is honest for
    // server-hydrated suggestions (else a null version reads as "stale").
    cardVersionAtWrite: row.card_version_at_write ?? null,
    schemaVersionAtWrite: row.schema_version_at_write ?? null,
  };
}

/** Single-row read used by the /suggest route on an in-memory cache miss, so a
 *  redeploy that cleared the 24h memory cache still serves the persisted
 *  verdict without re-charging Sonnet. Returns null on miss/error (fail-open). */
export async function getParamSuggestion(
  familyId: string,
  rawParamName: string,
): Promise<StoredSuggestion | null> {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('atlas_param_suggestions')
      .select('*')
      .eq('family_id', familyId ?? '')
      .eq('param_name', normalizeParamKey(rawParamName))
      .maybeSingle();
    if (error || !data) return null;
    return rowToStored(data as SuggestionRow);
  } catch {
    return null;
  }
}

/** Upsert a generated suggestion. Called by /suggest on every fresh Sonnet
 *  result (and by the one-time backfill). Fire-and-forget friendly — errors are
 *  swallowed so persistence never breaks the suggestion response. */
export async function upsertParamSuggestion(args: {
  familyId: string;
  rawParamName: string;
  suggestion: StoredSuggestion;
  cardVersion: string | null;
  schemaVersion: string | null;
  generatedBy: string | null;
}): Promise<void> {
  try {
    const supabase = createServiceClient();
    await supabase
      .from('atlas_param_suggestions')
      .upsert(
        {
          family_id: args.familyId ?? '',
          param_name: normalizeParamKey(args.rawParamName),
          raw_param_name: args.rawParamName,
          verdict: args.suggestion.suggestion,
          suggested_attribute_id: args.suggestion.suggestedAttributeId,
          suggested_attribute_name: args.suggestion.suggestedAttributeName,
          suggested_unit: args.suggestion.suggestedUnit,
          translation: args.suggestion.translation,
          confidence: args.suggestion.confidence,
          reasoning: args.suggestion.reasoning,
          explanation: args.suggestion.explanation,
          card_version_at_write: args.cardVersion,
          schema_version_at_write: args.schemaVersion,
          generated_by: args.generatedBy,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'family_id,param_name' },
      );
    // New verdict written → drop the whole-queue verdict-map cache so the next
    // Triage GET reflects it (the client also updates counts optimistically).
    invalidateVerdictMapCache();
  } catch {
    // Persistence is best-effort; the in-memory cache + response still work.
  }
}

/** Bulk upsert used by the one-time browser→DB backfill. Dedups by PK within the
 *  batch (a Supabase array upsert errors if the same conflict key appears twice)
 *  and skips rows with no accept/defer verdict. Returns the count written. */
export async function upsertParamSuggestionsBulk(
  rows: Array<{
    familyId: string;
    rawParamName: string;
    suggestion: StoredSuggestion;
    cardVersion: string | null;
    schemaVersion: string | null;
    generatedBy: string | null;
  }>,
): Promise<number> {
  if (rows.length === 0) return 0;
  const byKey = new Map<string, Record<string, unknown>>();
  for (const r of rows) {
    const verdict = r.suggestion?.suggestion;
    if (verdict !== 'accept' && verdict !== 'defer') continue;
    const paramName = normalizeParamKey(r.rawParamName);
    const familyId = r.familyId ?? '';
    byKey.set(`${familyId}::${paramName}`, {
      family_id: familyId,
      param_name: paramName,
      raw_param_name: r.rawParamName,
      verdict,
      suggested_attribute_id: r.suggestion.suggestedAttributeId,
      suggested_attribute_name: r.suggestion.suggestedAttributeName,
      suggested_unit: r.suggestion.suggestedUnit,
      translation: r.suggestion.translation,
      confidence: r.suggestion.confidence,
      reasoning: r.suggestion.reasoning,
      explanation: r.suggestion.explanation,
      card_version_at_write: r.cardVersion,
      schema_version_at_write: r.schemaVersion,
      generated_by: r.generatedBy,
      updated_at: new Date().toISOString(),
    });
  }
  if (byKey.size === 0) return 0;
  try {
    const supabase = createServiceClient();
    const { error } = await supabase
      .from('atlas_param_suggestions')
      .upsert([...byKey.values()], { onConflict: 'family_id,param_name' });
    if (error) return 0;
    invalidateVerdictMapCache();
    return byKey.size;
  } catch {
    return 0;
  }
}

// ─── Whole-queue verdict map (cap-safe via jsonb RPC) ─────────────────────────
let verdictMapCache: { at: number; map: Map<string, Verdict> } | null = null;
const VERDICT_MAP_TTL_MS = 30_000;

export function invalidateVerdictMapCache(): void {
  verdictMapCache = null;
}

/**
 * Every verdict in the table, as `Map<'${scopeKey}::${normalizedParam}' →
 * verdict>`. Read from `get_atlas_param_suggestion_verdicts()` which RETURNS
 * jsonb — NOT a plain `.select()`, which PostgREST caps at 1000 rows and would
 * silently freeze the counter/Accept pile at 1000. 30s in-memory cache.
 */
export async function fetchVerdictMap(force = false): Promise<Map<string, Verdict>> {
  if (!force && verdictMapCache && Date.now() - verdictMapCache.at < VERDICT_MAP_TTL_MS) {
    return verdictMapCache.map;
  }
  const map = new Map<string, Verdict>();
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc('get_atlas_param_suggestion_verdicts');
    if (!error && Array.isArray(data)) {
      for (const row of data as Array<{ family_id: string; param_name: string; verdict: string }>) {
        if (row.verdict === 'accept' || row.verdict === 'defer') {
          map.set(verdictMapKey(row.family_id ?? '', row.param_name), row.verdict);
        }
      }
    }
  } catch {
    // Fail-open — an empty map degrades to "nothing generated yet", never a crash.
  }
  verdictMapCache = { at: Date.now(), map };
  return map;
}

/**
 * Full suggestion detail for a bounded set of (scope, param) pairs — used to
 * hydrate the CURRENT page's rows (≤ pageSize) for display + the Accept action,
 * so a fresh browser with no localStorage still renders the Accept card.
 *
 * Queries are keyed on (family_id, param_name) — NOT param_name alone — and
 * GROUPED BY family so each query is constrained to a single scope. That keeps
 * every query's result bounded by the page (each PK matches ≤ 1 row), which is
 * the whole point: a bare `.in('param_name', …)` would fan out across every
 * family that shares a normalized param name (e.g. '电压' / 'type' appear under
 * dozens of families), and at scale that cross-product can exceed the PostgREST
 * 1000-row cap and silently drop some page rows' detail — exactly on the fresh
 * browser this function exists to serve. Concurrency is capped (Supabase pool
 * safety); a page realistically spans few families so this is a handful of
 * fast indexed lookups.
 */
export async function fetchSuggestionDetails(
  pairs: Array<{ familyId: string; paramName: string }>,
): Promise<Map<string, StoredSuggestion>> {
  const result = new Map<string, StoredSuggestion>();
  if (pairs.length === 0) return result;
  // Group the wanted param_names by their scope key so each query filters on
  // family_id AND param_name (never param_name alone).
  const byFamily = new Map<string, Set<string>>();
  for (const p of pairs) {
    const set = byFamily.get(p.familyId) ?? new Set<string>();
    set.add(p.paramName);
    byFamily.set(p.familyId, set);
  }
  const wanted = new Set(pairs.map((p) => verdictMapKey(p.familyId, p.paramName)));
  try {
    const supabase = createServiceClient();
    const groups = Array.from(byFamily.entries());
    const CONCURRENCY = 5;   // cap parallel queries — Supabase pool safety
    const NAME_CHUNK = 150;  // URL-length guard for one family's param_name list
    for (let g = 0; g < groups.length; g += CONCURRENCY) {
      const wave = groups.slice(g, g + CONCURRENCY);
      await Promise.all(
        wave.map(async ([familyId, nameSet]) => {
          const names = Array.from(nameSet);
          for (let j = 0; j < names.length; j += NAME_CHUNK) {
            const chunk = names.slice(j, j + NAME_CHUNK);
            const { data, error } = await supabase
              .from('atlas_param_suggestions')
              .select('*')
              .eq('family_id', familyId)
              .in('param_name', chunk);
            if (error || !Array.isArray(data)) continue;
            for (const row of data as SuggestionRow[]) {
              const key = verdictMapKey(row.family_id ?? '', row.param_name);
              if (wanted.has(key)) result.set(key, rowToStored(row));
            }
          }
        }),
      );
    }
  } catch {
    // Fail-open — missing detail just means the row renders without its cached
    // AI card (the client can still Generate/hydrate from localStorage).
  }
  return result;
}

/**
 * Cap-safe global count of every persisted suggestion — the honest, cumulative
 * "generated so far" number: every param ever run through the AI, across all
 * families/scopes/batches. Monotonic (accepting a param doesn't delete its
 * suggestion row). Uses a `count` (head request), NOT a row pull, so the
 * PostgREST 1000-row cap can't freeze it. Fail-open to null → caller falls back
 * to the working-set count.
 */
export async function fetchGeneratedCount(): Promise<number | null> {
  try {
    const supabase = createServiceClient();
    const { count, error } = await supabase
      .from('atlas_param_suggestions')
      .select('*', { count: 'exact', head: true });
    if (error || count == null) return null;
    return count;
  } catch {
    return null;
  }
}
