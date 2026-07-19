/**
 * Pure decision logic for the connector-abstraction characterization oracle.
 *
 * Extracted from scripts/providers-characterize.ts so it carries NO data-source
 * imports and can be unit-tested in jest with zero network (see
 * __tests__/scripts/characterizationCore.test.ts). The harness is the load-bearing
 * "proven IDENTICAL" gate for every adoption phase, so its verdict logic gets a
 * permanent regression guard rather than living only in an ad-hoc script.
 *
 * The one rule the whole oracle turns on: a case only PROVES the provider swap is
 * safe if BOTH runs produced the SAME real, reachable data. Two runs that both
 * errored, or both came back empty from an unreachable source, prove nothing — they
 * are INCONCLUSIVE, never a pass.
 */

// ── Sentinels ────────────────────────────────────────────────────────────────
// Named consts (NOT bare literals) so the writer (record) and the matcher
// (isInconclusive) can never drift: renaming one renames both. A bare-literal
// duplicate here previously risked silently re-opening the "both errored ⇒ IDENTICAL"
// false pass if only one copy were changed.
export const EMPTY_SENTINEL = '__EMPTY__';
export const ERROR_SENTINEL_PREFIX = '__ERROR__';

/** Build the recorded value for a case whose run() threw. */
export function errorSentinel(message: string): string {
  return `${ERROR_SENTINEL_PREFIX} ${message}`;
}

/**
 * A recorded value that carried no comparable data on this run — the source threw
 * (ERROR) or was unreachable/unresolved (EMPTY). Two such values being equal proves
 * nothing about the provider swap, so diff() counts them as inconclusive.
 */
export function isInconclusive(recorded: string): boolean {
  return recorded.startsWith(ERROR_SENTINEL_PREFIX) || recorded === EMPTY_SENTINEL;
}

/**
 * Is this (non-throwing) engine output a REACHED, comparable answer worth byte-
 * diffing? Decides whether record() stores the real payload (comparable) or the
 * EMPTY sentinel (inconclusive).
 *
 * The three corpus output shapes are handled distinctly — and NOT symmetrically,
 * because the reachability signal differs by shape:
 *
 *   • getAttributes → `PartAttributes | null`.  `null` means NO source resolved the
 *     MPN (down / absent) → not comparable.  A NON-null result means a source
 *     resolved the identity, i.e. it was reachable — comparable even if `parameters`
 *     is empty (a sparse-but-real answer; two identical sparse answers still prove
 *     the paths agree). This null-vs-non-null split is the one clean reachable-vs-
 *     unreachable distinction available.
 *
 *   • searchParts / getRecommendations → always a structured object, even on total
 *     failure: every source promise CATCHES its own errors and returns an empty
 *     result, so a down source is indistinguishable from a genuinely-empty one from
 *     the output alone (`sourcesContributed` is NOT a reachability signal — it lists
 *     any settled promise, including caught failures). So an empty pool is treated
 *     as NOT comparable by default (inconclusive) — marking it comparable would let
 *     a source that was down on BOTH runs read as "identical", re-opening the very
 *     false pass this oracle exists to prevent.
 *
 * `allowEmpty` is the per-case escape hatch: a corpus case whose query is EXPECTED
 * to return an empty pool (none exist today) can opt in, accepting that for that one
 * case a down-source empty is indistinguishable from the expected empty. Default off
 * keeps every real (data-expecting) case safe.
 */
export function comparableOutput(out: unknown, allowEmpty = false): boolean {
  if (out == null) return false; // unresolved / source down → inconclusive
  const o = out as { matches?: unknown[]; recommendations?: unknown[]; parameters?: unknown[] };
  if (Array.isArray(o.matches)) return o.matches.length > 0 || allowEmpty; // searchParts
  if (Array.isArray(o.recommendations)) return o.recommendations.length > 0 || allowEmpty; // getRecommendations
  if (Array.isArray(o.parameters)) return true; // getAttributes: non-null ⇒ reachable (even if sparse)
  return true; // unknown shape → assume comparable (never FALSE-flag real data as empty)
}

// ── Comparison ────────────────────────────────────────────────────────────────
export type CaseVerdict =
  | { name: string; kind: 'verified' }
  | { name: string; kind: 'inconclusive' }
  | { name: string; kind: 'differ'; va: string; vb: string };

export interface DiffOutcome {
  /** A valid proof: no differences, no inconclusive cases, and ≥1 verified case. */
  ok: boolean;
  verified: number;
  inconclusive: number;
  differing: number;
  cases: CaseVerdict[];
}

/**
 * Pure comparison of two recorded maps (label → recorded string). NO printing.
 * `ok` requires every case to be verified (identical AND real data on both sides);
 * an inconclusive-on-both case or any difference fails the proof.
 */
export function computeDiff(A: Record<string, string>, B: Record<string, string>): DiffOutcome {
  const names = [...new Set([...Object.keys(A), ...Object.keys(B)])].sort();
  const cases: CaseVerdict[] = [];
  let verified = 0;
  let inconclusive = 0;
  let differing = 0;
  for (const name of names) {
    const va = A[name];
    const vb = B[name];
    if (va === vb) {
      // va is a defined string here: a name in the union exists in ≥1 map, and a
      // name in only one map makes va !== vb (the differ branch).
      if (isInconclusive(va)) {
        inconclusive++;
        cases.push({ name, kind: 'inconclusive' });
      } else {
        verified++;
        cases.push({ name, kind: 'verified' });
      }
    } else {
      differing++;
      cases.push({ name, kind: 'differ', va: va ?? '', vb: vb ?? '' });
    }
  }
  return { ok: differing === 0 && inconclusive === 0 && verified > 0, verified, inconclusive, differing, cases };
}
