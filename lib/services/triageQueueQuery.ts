/**
 * Server-side Triage queue query — filter → sort → slice over the cached
 * classified set, returning ONE page plus counts + option lists.
 *
 * Why this exists: the batches route used to ship the ENTIRE classified set
 * (~4.25 MB at ~14k rows, growing toward ~20k as legacy-MFR discovery lands —
 * Decision #231) and the client filtered/sorted it in-memory. That doesn't
 * scale. This pure function moves the filter/sort/slice server-side so the
 * route returns ~one page (~50 rows). It's a PURE function (no I/O) so it's
 * unit-testable without a route harness and provably non-mutating of the
 * cached array (which is shared with the manufacturers route).
 *
 * Parity contract: the visible order + filter semantics must match what the
 * client rendered before this change —
 *   - sort = matchingImpact.score desc (what GlobalUnmappedParamsTable.orderedRows
 *     produced; the route's old wrong_family-last sort was overridden by the
 *     client, so we do NOT reproduce it here),
 *   - search matches paramName OR paramUid (same as the client search box),
 *   - mode (include) / statusFilter / parked-row hiding lifted verbatim from
 *     the route's prior per-request block.
 */

import { paramUid } from '@/lib/services/paramUid';
import {
  isAccepted,
  isUndone,
  isDeferred,
  isUnmappable,
  isInOpenQueue,
  type Classified,
  type GlobalUnmapped,
} from '@/lib/services/triageQueueCompute';

export type IncludeMode = 'synonyms' | 'auto_flagged' | 'all';
export type StatusFilter = 'open' | 'accepted' | 'undone' | 'deferred' | 'unmappable' | 'all';

export type TriageQueryParams = {
  batchFilter: string | null;
  include: IncludeMode;
  statusFilter: StatusFilter;
  search: string;          // raw; lowercased internally
  mfrSlugs: string[];
  families: string[];
  minProds: number;
  flaggedOnly: boolean;
  hasNoteOnly: boolean;
  sort: 'impact';
  page: number;            // 1-based
  pageSize: number;        // 0 = count-only (rows: [])
};

export type TriageCounts = { synonyms: number; autoFlagged: number; total: number };
export type StatusCounts = { open: number; accepted: number; undone: number; deferred: number; unmappable: number };

export type TriageQueryResult = {
  rows: GlobalUnmapped[];   // one page, `effective` stripped
  totalFiltered: number;    // rows matching every filter, BEFORE slice
  triageCounts: TriageCounts;
  statusCounts: StatusCounts;
  mfrOptions: Array<{ slug: string; name: string }>;
  familyOptions: string[];
};

function computeTriageCounts(openQueue: Classified[]): TriageCounts {
  return {
    synonyms: openQueue.filter((r) => r.effective === 'synonym').length,
    autoFlagged: openQueue.filter((r) => r.effective === 'flagged').length,
    total: openQueue.length,
  };
}

function computeStatusCounts(working: Classified[]): StatusCounts {
  return {
    open: working.filter(isInOpenQueue).length,
    accepted: working.filter(isAccepted).length,
    undone: working.filter(isUndone).length,
    deferred: working.filter(isDeferred).length,
    unmappable: working.filter(isUnmappable).length,
  };
}

/**
 * Filter → sort → slice. Never mutates `classified` (all ops return new arrays).
 */
export function queryTriage(classified: Classified[], p: TriageQueryParams): TriageQueryResult {
  // ── batchFilter slice ──
  const workingClassified = p.batchFilter
    ? classified.filter((r) => r.affectedBatchIds.includes(p.batchFilter as string))
    : classified;

  // ── Counts (over the working — batch-scoped or full — set) ──
  const triageCounts = computeTriageCounts(workingClassified.filter(isInOpenQueue));
  const statusCounts = computeStatusCounts(workingClassified);

  // ── Option lists: built AFTER batchFilter, BEFORE per-axis filters so the
  //    dropdowns stay stable as the user filters (matches the old client
  //    TriageFilterBar useMemos). ──
  const mfrMap = new Map<string, string>();
  const famSet = new Set<string>();
  for (const r of workingClassified) {
    for (const m of r.affectedManufacturers ?? []) {
      if (!mfrMap.has(m.slug)) mfrMap.set(m.slug, m.name);
    }
    if (r.dominantFamily) famSet.add(r.dominantFamily);
  }
  const mfrOptions = [...mfrMap.entries()]
    .map(([slug, name]) => ({ slug, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const familyOptions = [...famSet].sort();

  // ── Mode (include) filter ──
  let visible: Classified[];
  if (p.include === 'auto_flagged') visible = workingClassified.filter((r) => r.effective === 'flagged');
  else if (p.include === 'all') visible = workingClassified;
  else visible = workingClassified.filter((r) => r.effective === 'synonym');

  // ── Parked-row hiding: deferred + unmappable drop from synonyms/auto_flagged
  //    default views unless the status chip explicitly targets them. (Lifted
  //    verbatim from the route's prior block.) ──
  if (p.include !== 'all') {
    visible = visible.filter((r) => {
      if (isUnmappable(r) && p.statusFilter !== 'unmappable') return false;
      if (isDeferred(r) && p.statusFilter !== 'deferred') return false;
      return true;
    });
  }

  // ── Status filter ──
  if (p.statusFilter === 'open') visible = visible.filter(isInOpenQueue);
  else if (p.statusFilter === 'accepted') visible = visible.filter(isAccepted);
  else if (p.statusFilter === 'undone') visible = visible.filter(isUndone);
  else if (p.statusFilter === 'deferred') visible = visible.filter(isDeferred);
  else if (p.statusFilter === 'unmappable') visible = visible.filter(isUnmappable);

  // ── Per-axis filters (the heavy axes moved off the client) ──
  const search = p.search.trim().toLowerCase();
  const mfrSet = new Set(p.mfrSlugs);
  const familySet = new Set(p.families);
  if (search) {
    visible = visible.filter((r) => {
      const nameHit = r.paramName.toLowerCase().includes(search);
      if (nameHit) return true;
      return paramUid(r.paramName).toLowerCase().includes(search);
    });
  }
  if (p.minProds > 0) visible = visible.filter((r) => r.productCount >= p.minProds);
  if (mfrSet.size > 0) {
    visible = visible.filter((r) => (r.affectedManufacturers ?? []).some((m) => mfrSet.has(m.slug)));
  }
  if (familySet.size > 0) {
    visible = visible.filter((r) => !!r.dominantFamily && familySet.has(r.dominantFamily));
  }
  if (p.flaggedOnly) visible = visible.filter((r) => r.isFlagged === true);
  if (p.hasNoteOnly) visible = visible.filter((r) => r.hasNote === true);

  // ── Sort: matchingImpact.score desc, then paramName asc as a STABLE,
  //    deterministic tiebreak. score=0 ties are very common (unscoped rows with
  //    no logic-table weight); without a unique secondary key their order falls
  //    back to compute/RPC output order, which can vary across cache rebuilds —
  //    so the same page could skip or re-show rows between refreshes. paramName
  //    is unique per row (the queue's key). Copy before sort (never touch the
  //    cached array). (Decision #233 review) ──
  const sorted = [...visible].sort((a, b) => {
    const ds = (b.matchingImpact?.score ?? 0) - (a.matchingImpact?.score ?? 0);
    if (ds !== 0) return ds;
    return a.paramName < b.paramName ? -1 : a.paramName > b.paramName ? 1 : 0;
  });

  const totalFiltered = sorted.length;

  // ── Slice. pageSize=0 → count-only (no rows shipped). ──
  let pageRows: Classified[];
  if (p.pageSize <= 0) {
    pageRows = [];
  } else {
    const start = Math.max(0, (p.page - 1) * p.pageSize);
    pageRows = sorted.slice(start, start + p.pageSize);
  }

  // Strip the server-only `effective` discriminator (route did this before).
  const rows: GlobalUnmapped[] = pageRows.map(({ effective: _effective, ...rest }) => {
    void _effective;
    return rest;
  });

  return { rows, totalFiltered, triageCounts, statusCounts, mfrOptions, familyOptions };
}
