/**
 * atlasParamSuggestionTypes — CLIENT-SAFE types + pure helpers for durable AI
 * suggestions. No server imports (no service client), so both the client
 * (components/admin/atlasIngest/types.ts, the panel/table) and the server
 * (atlasParamSuggestionStore.ts, triageQueueCompute.ts) can import from here.
 *
 * The DB-touching functions live in atlasParamSuggestionStore.ts (server-only).
 */

export type Verdict = 'accept' | 'defer';

/** AI-verdict filter for the Triage view. 'none' = not yet generated. ONE source
 *  of truth: the type union AND the runtime validation set both derive from this
 *  array, so adding a value can't leave them out of sync. */
export const AI_VERDICT_FILTERS = ['all', 'accept', 'defer', 'none'] as const;
export type AiVerdictFilter = typeof AI_VERDICT_FILTERS[number];

const VALID_AI_VERDICTS: ReadonlySet<string> = new Set(AI_VERDICT_FILTERS);

/** Resolve the effective AI-verdict filter for a Triage query from the raw
 *  query param. The "High confidence" filter is a strict refinement of the
 *  Accept pile, so when it's on the verdict is FORCED to 'accept' (defensive
 *  against a stale/absent ai_verdict param); otherwise an invalid/absent raw
 *  value falls back to 'all'. Pure — unit-tested in place of a route harness. */
export function resolveAiVerdict(aiVerdictRaw: string | null, highConfidenceOnly: boolean): AiVerdictFilter {
  if (highConfidenceOnly) return 'accept';
  return aiVerdictRaw && VALID_AI_VERDICTS.has(aiVerdictRaw) ? (aiVerdictRaw as AiVerdictFilter) : 'all';
}

/** Full suggestion detail, shaped like the /suggest route's `suggestion` object
 *  so a DB-served suggestion renders identically to a freshly-generated one. */
export interface StoredSuggestion {
  translation: string | null;
  suggestedAttributeId: string | null;
  suggestedAttributeName: string | null;
  suggestedUnit: string | null;
  confidence: string | null;
  reasoning: string | null;
  suggestion: Verdict | null;
  explanation: string | null;
  /** Card/schema versions the suggestion was generated against — load-bearing
   *  for the staleness signal (Decision #187). Carried through the DB read path
   *  so a server-hydrated suggestion (fresh browser) is only flagged stale when
   *  the rules ACTUALLY changed, not just because it came from the DB. */
  cardVersionAtWrite?: string | null;
  schemaVersionAtWrite?: string | null;
}

/** Attached per queue row. `verdict` comes from the whole-queue verdict map
 *  (present on every generated row); `detail` is hydrated only for the current
 *  page's rows (for display + the Accept action). */
export interface RowSuggestion {
  verdict: Verdict;
  detail?: StoredSuggestion | null;
}

/** Two-axis counts returned on the triage response.
 *  - generatedTotal: rows in scope that have ANY verdict (the stable, monotonic
 *    "generated so far" number — not a shrinking fraction).
 *  - accept/defer/none: over the OPEN synonym queue (what Generate targets) —
 *    `accept` is the "Accepts waiting" chip, `none` is still-to-generate. */
export interface VerdictCounts {
  generatedTotal: number;
  accept: number;
  defer: number;
  none: number;
}

/** NFC + lower + trim — byte-for-byte the same as `normalizeOverrideKey` in
 *  triageQueueCompute.ts. Pure; client-safe. */
export function normalizeParamKey(paramName: string): string {
  return paramName.normalize('NFC').toLowerCase().trim();
}

/** The scope key a param stores its suggestion under — family preferred, then
 *  category, then '' (unscoped). Matches getOverrideScope + the /suggest
 *  caller's `familyId: rowScopeKey ?? ''`. */
export function scopeKeyForRow(r: { dominantFamily: string | null; dominantCategory: string | null }): string {
  return r.dominantFamily ?? r.dominantCategory ?? '';
}

/** Map/lookup key: `${scopeKey}::${normalizedParam}`. */
export function verdictMapKey(familyId: string, normalizedParam: string): string {
  return `${familyId ?? ''}::${normalizedParam}`;
}
