/**
 * triageBatchApprove — CLIENT-SAFE pure predicate for the Triage "Batch Accept"
 * feature. No server imports, so the table component + unit tests both use it.
 *
 * A row earns a star (and a batch-accept checkbox) when the AI marked it
 * accept + HIGH confidence, it carries a writable mapping + a scope to write it
 * under, and it's still an OPEN row (not already accepted, wrong-family-flagged,
 * parked, or actively mapped). "High confidence only" is intentional per the
 * feature's design — the engineer hand-ticks each box, so the star is a visual
 * aid, not a safety gate; existing on-row warnings still render alongside it.
 */

export interface StarrableRowInput {
  suggestion?: {
    verdict?: 'accept' | 'defer';
    detail?: {
      confidence?: string | null;
      suggestion?: 'accept' | 'defer' | null;
      suggestedAttributeId?: string | null;
      suggestedAttributeName?: string | null;
    } | null;
  };
  dominantFamily: string | null;
  dominantCategory: string | null;
  autoFlag?: unknown;
  noteStatus?: string | null;
  acceptedOverride?: { isActive: boolean };
}

export function isStarrableRow(r: StarrableRowInput): boolean {
  const d = r.suggestion?.detail;
  if (!d) return false;

  // AI verdict: accept only (whole-queue verdict, falling back to detail).
  const verdict = r.suggestion?.verdict ?? d.suggestion ?? null;
  if (verdict !== 'accept') return false;

  // High confidence only.
  if ((d.confidence ?? '').toLowerCase() !== 'high') return false;

  // Must carry a writable mapping.
  if (!d.suggestedAttributeId || !d.suggestedAttributeId.trim()) return false;
  if (!d.suggestedAttributeName || !d.suggestedAttributeName.trim()) return false;

  // Must have a scope to write the override under (L3 family or L2 category).
  if (!r.dominantFamily && !r.dominantCategory) return false;

  // Only OPEN rows: not flagged wrong-family, not parked, not already mapped.
  if (r.autoFlag) return false;
  if (r.noteStatus === 'wrong_family' || r.noteStatus === 'unmappable' || r.noteStatus === 'deferred') return false;
  if (r.acceptedOverride?.isActive) return false;

  return true;
}

// ── Batch write input preparation (shared by the batch route + tests) ────────

/** NFC + lowercase + trim — byte-for-byte the single-write route's + queue
 *  lookup's normalization. Load-bearing: two cosmetic variants that collapse to
 *  the same (familyId, paramName) must be deduped before a bulk insert, else the
 *  partial unique index rejects the whole chunk. */
export function normalizeBatchParamName(s: string): string {
  return s.normalize('NFC').toLowerCase().trim();
}

export interface RawBatchItem {
  familyId?: unknown;
  paramName?: unknown;
  attributeId?: unknown;
  attributeName?: unknown;
  unit?: unknown;
}

export interface PreparedBatchItem {
  familyId: string;
  rawParamName: string;
  paramName: string; // normalized
  attributeId: string;
  attributeName: string;
  unit?: string;
}

export interface BatchPrepResult {
  prepared: PreparedBatchItem[];
  skipped: Array<{ paramName: string; familyId: string; reason: string }>;
  deduped: number;
}

/** Validate + normalize + dedupe batch-accept input by (familyId, normalized
 *  paramName). Pure — no DB. Rows missing a required field are `skipped`; later
 *  rows that collapse to a key already seen this request bump `deduped`. */
export function prepareBatchItems(items: RawBatchItem[]): BatchPrepResult {
  const prepared: PreparedBatchItem[] = [];
  const skipped: BatchPrepResult['skipped'] = [];
  const seen = new Set<string>();
  let deduped = 0;
  for (const it of items) {
    const familyId = typeof it?.familyId === 'string' ? it.familyId.trim() : '';
    const rawParamName = typeof it?.paramName === 'string' ? it.paramName : '';
    const attributeId = typeof it?.attributeId === 'string' ? it.attributeId.trim() : '';
    const attributeName = typeof it?.attributeName === 'string' ? it.attributeName.trim() : '';
    const unit = typeof it?.unit === 'string' ? it.unit.trim() : '';
    if (!familyId || !rawParamName.trim() || !attributeId || !attributeName) {
      skipped.push({ paramName: rawParamName, familyId, reason: 'missing familyId/paramName/attributeId/attributeName' });
      continue;
    }
    const paramName = normalizeBatchParamName(rawParamName);
    const key = `${familyId}::${paramName}`;
    if (seen.has(key)) { deduped++; continue; }
    seen.add(key);
    prepared.push({ familyId, rawParamName, paramName, attributeId, attributeName, unit: unit || undefined });
  }
  return { prepared, skipped, deduped };
}
