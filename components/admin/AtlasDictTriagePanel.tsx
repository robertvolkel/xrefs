'use client';

/**
 * AtlasDictTriagePanel — dedicated workspace for engineers reviewing unmapped
 * Atlas parameters across all manufacturers and batches.
 *
 * Why this exists separately from AtlasIngestPanel: the operator workflow
 * (upload + apply batches) and the engineer workflow (review AI-suggested
 * dictionary mappings) are different jobs that benefit from different page
 * surfaces. Operators see only a count summary on the Ingest page; engineers
 * own the full editing experience here. Same data behind both surfaces — see
 * /api/admin/atlas/ingest/batches which serves both consumers.
 *
 * URL contract: optional `?batch=<batch_id>` query param scopes the queue to
 * a single batch. The "Review in Dictionary Triage →" link from a batch card
 * uses this so an engineer can land on exactly the params for that one batch
 * (instead of the global unfiltered queue).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Alert, Stack, Typography, Chip, Button, Skeleton, CircularProgress, Tooltip, LinearProgress } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useSearchParams, useRouter } from 'next/navigation';
import GlobalUnmappedParamsTable from './atlasIngest/GlobalUnmappedParamsTable';
import TriageFilterBar, { EMPTY_FILTERS, type TriageFilters, type TriageMode } from './atlasIngest/TriageFilterBar';
import type { NoteRecord } from './atlasIngest/UnmappedParamNoteCell';
import type { BatchListResponse, StatusFilter, GlobalUnmappedParam } from './atlasIngest/types';

// Parallel worker count for the deferred batch-regen flush. Each regen spawns
// a Node child process running scripts/atlas-ingest.mjs (~5–15s wall-clock per
// batch), so 3 keeps the dev server responsive while still scaling well.
const REGEN_CONCURRENCY = 3;

// Feature flag — hide the "Regen affected batches" control on the Triage page
// (user request, July 2026). It confused the mapping workflow and duplicated
// the per-batch regen that already lives on the Ingest page (BatchCard). The
// underlying pendingRegenIds / flushPendingRegens machinery is left wired so
// flipping this back to `true` fully restores the button — nothing was deleted.
const SHOW_TRIAGE_REGEN = false;

// Server-side pagination (Decision #231). The route returns one page; the
// client accumulates pages ("Show more"). Default page is small to keep the
// payload + render cheap. When a localStorage-bound client filter is active
// (AI verdict), we bump the page so that view — which can only be applied to
// LOADED rows — usually covers the already-narrowed set in one shot.
const DEFAULT_PAGE_SIZE = 100;
const AI_FILTER_PAGE_SIZE = 500;

// Remember the last view (mode / status / AI-verdict) across visits so returning
// to Triage drops the engineer back where they were (e.g. their Accept pile)
// instead of the default "synonyms / open / first 50".
const VIEW_LS_KEY = 'atlas-triage-view-v1';
type SavedView = { mode?: TriageMode; statusFilter?: StatusFilter; aiVerdict?: TriageFilters['aiVerdict'] };
function readSavedView(): SavedView {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(window.localStorage.getItem(VIEW_LS_KEY) || '{}') as SavedView; } catch { return {}; }
}

// One-time migration of browser-only AI suggestions into the durable DB so the
// pre-launch pile counts toward "generated so far" and isn't re-charged.
const SUGGEST_LS_PREFIX = 'atlas-ingest-ai-suggest-v7:';
const BACKFILL_FLAG = 'atlas-triage-suggest-backfilled-v1';

export default function AtlasDictTriagePanel() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const batchFilter = searchParams.get('batch');

  const [data, setData] = useState<BatchListResponse | null>(null);
  // Accumulated rows across server pages (the "Show more" append model). `data`
  // holds the latest response's counts / option lists / batches; `accumRows`
  // holds every row fetched for the current filter view. Reset to page 1's
  // rows whenever a filter/mode/status/search changes.
  const [accumRows, setAccumRows] = useState<GlobalUnmappedParam[]>([]);
  // Fresh mirror of accumRows for optimistic handlers that need to read a
  // row's pre-mutation state without a stale closure.
  const accumRowsRef = useRef<GlobalUnmappedParam[]>([]);
  useEffect(() => { accumRowsRef.current = accumRows; }, [accumRows]);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Page-level filter state (search/MFR/family/min-prods/has-note). Pure
  // client-side slicing of the in-memory queue — no extra fetches.
  //
  // URL contract: optional `?mfr=<slug>` query param pre-seeds the MFR
  // filter on mount. Used by the Atlas MFRs admin panel's per-row "🔧
  // Repair coverage" link to deep-link engineers straight into a focused
  // queue for one manufacturer (Decision #200). The param is consumed
  // once-on-mount; user-driven filter changes from there on don't write
  // back to the URL (intentional — the URL is a starting point, not a
  // session-state mirror).
  const initialMfrSlug = searchParams.get('mfr');
  const [filters, setFilters] = useState<TriageFilters>(() => {
    const saved = readSavedView();
    const base: TriageFilters = { ...EMPTY_FILTERS, aiVerdict: saved.aiVerdict ?? EMPTY_FILTERS.aiVerdict };
    return initialMfrSlug ? { ...base, mfrSlugs: [initialMfrSlug] } : base;
  });
  // Optimistic delta added to the server's verdictCounts so the "generated so
  // far" counter + chips move the instant a batch finishes (before the next
  // fetch reconciles). Reset on every fetch (the server count is then fresh).
  // Signed adjustments to the server verdict counts, so the chips + "generated
  // so far" + "not generated yet" move live between fetches (reset on every
  // fetch). `generated` bumps generatedTotal; accept/defer/none are per-bucket.
  // Generating moves rows OUT of none (none -= generated); accepting a param
  // moves it OUT of its verdict bucket (see handleRowAcceptedBucket).
  const [verdictDelta, setVerdictDelta] = useState({ generated: 0, accept: 0, defer: 0, none: 0 });
  const handleBatchGenerated = useCallback((t: { generated: number; accept: number; defer: number }) => {
    setVerdictDelta((d) => ({
      generated: d.generated + t.generated,
      accept: d.accept + t.accept,
      defer: d.defer + t.defer,
      none: d.none - t.generated,
    }));
  }, []);
  // Accepting a param removes it from the OPEN "accepts waiting" pile, so tick the
  // bucket it left down live (the server only reflects it on the next fetch).
  // Reverting is intentionally NOT the inverse: a reverted param is "undone", still
  // not "open", so the server keeps it out of these counts — matching this.
  const handleRowAcceptedBucket = useCallback((bucket: 'accept' | 'defer' | 'none') => {
    setVerdictDelta((d) => ({
      ...d,
      accept: bucket === 'accept' ? d.accept - 1 : d.accept,
      defer: bucket === 'defer' ? d.defer - 1 : d.defer,
      none: bucket === 'none' ? d.none - 1 : d.none,
    }));
  }, []);
  // Notes per paramName — owned at the panel level so the filter bar can
  // scope rows by has-note (the rows-needing-followup workflow). Single
  // fetch on mount; subsequent edits reconcile via onNoteChange.
  const [notesByParam, setNotesByParam] = useState<Record<string, NoteRecord>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/atlas/unmapped-param-notes');
        const json = await res.json();
        if (cancelled || !json?.success || !Array.isArray(json.items)) return;
        const next: Record<string, NoteRecord> = {};
        for (const item of json.items as NoteRecord[]) {
          next[item.paramName] = item;
        }
        setNotesByParam(next);
      } catch {
        // Notes are non-essential — fall through with empty map.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const onNoteChange = useCallback((paramName: string, next: NoteRecord | null) => {
    setNotesByParam((prev) => {
      if (next === null) {
        const copy = { ...prev };
        delete copy[paramName];
        return copy;
      }
      return { ...prev, [paramName]: next };
    });
  }, []);
  // View mode — server-side. Changing the mode triggers a refetch since the
  // queue's classification (synonym vs auto-flagged) is computed in the route.
  // Seeded from the last-visited view (remember-view).
  const [mode, setMode] = useState<TriageMode>(() => readSavedView().mode ?? 'synonyms');
  // Status filter — server-side. 'open' (default) shows un-accepted rows;
  // 'accepted' / 'undone' surface the audit trail of past Accepts; 'all'
  // shows the union (useful when an engineer wants the full picture).
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => readSavedView().statusFilter ?? 'open');

  // Persist the view (mode / status / AI-verdict) so the next visit restores it.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(VIEW_LS_KEY, JSON.stringify({ mode, statusFilter, aiVerdict: filters.aiVerdict }));
    } catch { /* storage disabled — non-fatal */ }
  }, [mode, statusFilter, filters.aiVerdict]);

  // One-time browser→DB backfill of AI suggestions — protects the pre-launch
  // pile (currently localStorage-only) and avoids re-charging to regenerate.
  // Runs once per browser (guarded flag); chunked; non-fatal on error.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem(BACKFILL_FLAG)) return;
    const items: Array<{ familyId: string; paramName: string; suggestion: unknown; cardVersion: string | null; schemaVersion: string | null }> = [];
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (!key || !key.startsWith(SUGGEST_LS_PREFIX)) continue;
        const rest = key.slice(SUGGEST_LS_PREFIX.length);
        const sep = rest.indexOf('::');
        if (sep < 0) continue;
        const raw = window.localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        const suggestion = parsed?.suggestion;
        if (!suggestion || (suggestion.suggestion !== 'accept' && suggestion.suggestion !== 'defer')) continue;
        items.push({
          familyId: rest.slice(0, sep),
          paramName: rest.slice(sep + 2),
          suggestion,
          cardVersion: parsed.cardVersionAtWrite ?? null,
          schemaVersion: parsed.schemaVersionAtWrite ?? null,
        });
      }
    } catch { /* ignore parse/storage errors */ }
    if (items.length === 0) {
      try { window.localStorage.setItem(BACKFILL_FLAG, '1'); } catch { /* */ }
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        for (let i = 0; i < items.length; i += 500) {
          if (cancelled) return;
          await fetch('/api/admin/atlas/param-suggestions/backfill', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: items.slice(i, i + 500) }),
          });
        }
        window.localStorage.setItem(BACKFILL_FLAG, '1');
        if (!cancelled) refresh(); // pull fresh counts so the backfilled pile shows
      } catch { /* leave flag unset to retry next mount */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mode switches reset filters explicitly. Without this, filters set in one
  // mode (e.g. MFR=Delta in Open Synonyms) silently strip every row in the
  // next mode and the user sees "Showing 0 of N" with no obvious cause.
  // Filter state still persists for actions WITHIN a mode (search, scroll,
  // accept) — only the mode-chip click triggers the reset.
  const handleModeChange = useCallback((next: TriageMode) => {
    setMode(next);
    setFilters(EMPTY_FILTERS);
  }, []);
  // Batches affected by recent Accepts that haven't been regenerated yet.
  // Accept no longer auto-regens (each regen spawns a child process and runs
  // 5–15s; sequential per-affected-batch regens made each Accept feel like a
  // 30s reload). Instead we accumulate IDs here and let the user trigger a
  // parallel flush via the header chip when they're done reviewing.
  const [pendingRegenIds, setPendingRegenIds] = useState<Set<string>>(new Set());
  const [regenFlushing, setRegenFlushing] = useState(false);
  const [regenProgress, setRegenProgress] = useState<{ done: number; total: number } | null>(null);

  // Page size grows when a localStorage-bound client filter (AI verdict) is
  // active — that filter can only be applied to LOADED rows, so we fetch a
  // bigger page up front so the already-narrowed view is usually fully covered.
  const pageSize = filters.aiVerdict !== 'all' ? AI_FILTER_PAGE_SIZE : DEFAULT_PAGE_SIZE;

  // Build the server query for a given page. All the heavy filter axes
  // (search/MFR/family/min-prods/flagged/has-note) + mode + status are now
  // applied SERVER-SIDE (Decision #231) so the route can slice to one page.
  const buildQuery = useCallback((pageNum: number, forceFresh: boolean): string => {
    const params = new URLSearchParams();
    if (batchFilter) params.set('batch', batchFilter);
    if (forceFresh) params.set('refresh', '1');
    params.set('page', String(pageNum));
    params.set('page_size', String(pageSize));
    params.set('include', mode);           // TriageMode === IncludeMode
    params.set('status_filter', statusFilter);
    const s = filters.search.trim();
    if (s) params.set('search', s);
    for (const slug of filters.mfrSlugs) params.append('mfr', slug);
    for (const fam of filters.families) params.append('family', fam);
    if (filters.minProductCount > 0) params.set('min_prods', String(filters.minProductCount));
    if (filters.hasNote) params.set('has_note', '1');
    if (filters.flaggedOnly) params.set('flagged', '1');
    // Server-side AI verdict filter (durable suggestions). 'accept' pulls the
    // whole Accept pile paginated from the server — no load-everything dance.
    if (filters.aiVerdict && filters.aiVerdict !== 'all') params.set('ai_verdict', filters.aiVerdict);
    return params.toString();
  }, [batchFilter, mode, statusFilter, filters, pageSize]);

  // Fetch one page. append=false replaces the accumulator (page 1, full
  // reload / filter change); append=true concatenates (the "Show more" /
  // load-next-server-page path). cache:'no-store' so the browser doesn't
  // reuse a previous response for the same URL; server-side L1/L2 still apply.
  const fetchPage = useCallback(async (pageNum: number, append: boolean, forceFresh = false) => {
    if (append) setLoadingMore(true);
    else { setLoading(true); setError(null); }
    try {
      const res = await fetch(`/api/admin/atlas/ingest/batches?${buildQuery(pageNum, forceFresh)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      const json = (await res.json()) as BatchListResponse;
      const rows = json.unmappedParamsGlobal ?? [];
      setData(json);
      setAccumRows((prev) => (append ? [...prev, ...rows] : rows));
      setPage(pageNum);
      // Server verdictCounts are now fresh — clear the optimistic delta so we
      // don't double-count the batch that's already reflected in the response.
      setVerdictDelta({ generated: 0, accept: 0, defer: 0, none: 0 });
    } catch (err) {
      if (!append) setError(err instanceof Error ? err.message : 'Failed to load triage queue');
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  }, [buildQuery]);

  // Full reload to page 1 (resets the accumulator). forceFresh bypasses the
  // server L1/L2 cache (Refresh button). Used by the regen flush + the
  // Recently-Accepted undo callback too.
  const refresh = useCallback((forceFresh = false) => fetchPage(1, false, forceFresh), [fetchPage]);

  // Load the next server page and append to the accumulator (the "Show more"
  // server-fetch path, wired into the table footer).
  const loadMore = useCallback(() => fetchPage(page + 1, true), [fetchPage, page]);

  // Fetch the next N UN-GENERATED params straight from the server so the bulk
  // "Generate" button can sweep the whole queue without the engineer scrolling
  // rows into view. Standalone fetch — deliberately does NOT touch
  // data/accumRows/loading (the displayed view is unchanged; this is a
  // background sweep). Forces the generatable population (open synonyms with no
  // AI verdict yet) so it matches the `verdictCounts.none` count on the button.
  // Whole-queue by design (ignores the active mfr/family/search axes). Returns
  // [] on any failure (button no-ops).
  const fetchUngenerated = useCallback(async (n: number): Promise<GlobalUnmappedParam[]> => {
    const params = new URLSearchParams();
    if (batchFilter) params.set('batch', batchFilter);
    params.set('include', 'synonyms');
    params.set('status_filter', 'open');
    params.set('ai_verdict', 'none');
    params.set('page', '1');
    params.set('page_size', String(Math.max(1, Math.min(n, 500))));
    try {
      const res = await fetch(`/api/admin/atlas/ingest/batches?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) return [];
      const json = (await res.json()) as BatchListResponse;
      return json.unmappedParamsGlobal ?? [];
    } catch {
      return [];
    }
  }, [batchFilter]);

  // Debounce search so each keystroke doesn't fire a server round-trip. Other
  // filter axes (chips, dropdowns, min-prods, toggles) refetch immediately.
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(filters.search), 300);
    return () => clearTimeout(t);
  }, [filters.search]);

  // Serialized server-relevant filter inputs. A change here resets to page 1
  // and refetches (replace). NOT keyed off `page` — that's the append path.
  const filterKey = useMemo(() => JSON.stringify({
    search: debouncedSearch.trim().toLowerCase(),
    mfrSlugs: [...filters.mfrSlugs].sort(),
    families: [...filters.families].sort(),
    minProductCount: filters.minProductCount,
    hasNote: filters.hasNote,
    flaggedOnly: filters.flaggedOnly,
    aiVerdict: filters.aiVerdict,   // changes pageSize → refetch with bigger page
    mode,
    statusFilter,
    batchFilter,
  }), [debouncedSearch, filters, mode, statusFilter, batchFilter]);

  // Refetch page 1 whenever the server-relevant filter view changes. Single
  // dependency on filterKey (not fetchPage) so we don't double-fire when
  // fetchPage's identity churns from its own deps.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchPage(1, false); }, [filterKey]);

  const regenerateBatch = useCallback(async (batchId: string) => {
    try {
      const res = await fetch(`/api/admin/atlas/ingest/batches/${batchId}/regenerate`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Regenerate failed');
    } catch {
      // Failures here are silent — the user will see stale batch metrics and
      // can retry from the Ingest page if needed. Don't block other regens.
    }
  }, []);

  // Accept callback: queue the affected batch IDs for later flush. We no
  // longer call refresh() here — the row's optimistic in-place update (via
  // onRowAccepted below) already shows the new "Accepted" state, and a
  // refetch would invalidate the server-side cache (the Accept POST bumps
  // it) and force a 30+s cold reload with a skeleton screen, which was the
  // user's biggest pain point.
  const onRegenerateAffected = useCallback(async (batchIds: string[]) => {
    if (batchIds.length > 0) {
      setPendingRegenIds((prev) => {
        const next = new Set(prev);
        for (const id of batchIds) next.add(id);
        return next;
      });
    }
  }, []);

  // Optimistic in-place mutation of a row's acceptedOverride after a
  // successful Accept POST. Avoids the round-trip refetch entirely.
  // Adjusts the global statusCounts so the FilterBar chips update too.
  const onRowAccepted = useCallback((paramName: string, override: NonNullable<BatchListResponse['unmappedParamsGlobal'][number]['acceptedOverride']>, leftBucket?: 'accept' | 'defer' | 'none') => {
    // Tick the AI-verdict chip the accepted param left ("accepts waiting" down by
    // one, live) — the table only passes a bucket when the row was genuinely open.
    if (leftBucket) handleRowAcceptedBucket(leftBucket);
    // Rows live in accumRows; counts live in data. Mutate both.
    setAccumRows((rows) => rows.map((r) =>
      r.paramName === paramName ? { ...r, acceptedOverride: override } : r,
    ));
    setData((prev) => {
      if (!prev) return prev;
      const nextStatusCounts = prev.statusCounts
        ? {
          open: Math.max(0, prev.statusCounts.open - 1),
          accepted: prev.statusCounts.accepted + 1,
          undone: prev.statusCounts.undone,
          deferred: prev.statusCounts.deferred,
          unmappable: prev.statusCounts.unmappable,
        }
        : prev.statusCounts;
      // triageCounts (synonyms / autoFlagged) is scoped to OPEN status —
      // accepting a synonym row decrements that bucket too.
      const nextTriageCounts = prev.triageCounts
        ? {
          synonyms: Math.max(0, prev.triageCounts.synonyms - 1),
          autoFlagged: prev.triageCounts.autoFlagged,
          total: Math.max(0, prev.triageCounts.total - 1),
        }
        : prev.triageCounts;
      // totalFiltered only drops when the accepted row actually leaves the
      // current view. In Open view it does (accept = no longer open); in
      // All/Accepted views it stays. Keeps "N shown of M" + Show-more honest.
      const leavesView = statusFilter === 'open';
      const nextTotalFiltered = leavesView && typeof prev.totalFiltered === 'number'
        ? Math.max(0, prev.totalFiltered - 1)
        : prev.totalFiltered;
      return { ...prev, statusCounts: nextStatusCounts, triageCounts: nextTriageCounts, totalFiltered: nextTotalFiltered };
    });
  }, [statusFilter, handleRowAcceptedBucket]);

  // Optimistic in-place mutation after a successful Confirm-Flag or
  // Revert-Flag PUT. Mirrors the onRowAccepted / onRowReverted pattern so
  // the row's noteStatus updates immediately and the table's "wrong_family"
  // render branches (or auto-flag suppression for 'confirmed_in_family')
  // kick in without waiting on a queue refetch. The parent's notesByParam
  // map also drives `liveNoteStatus` in filteredRows; this complements it
  // by mutating row.noteStatus directly so the within-row UI (button
  // labels, badge state) also responds.
  const onRowFlagged = useCallback((
    paramName: string,
    status: 'wrong_family' | 'confirmed_in_family' | 'unmappable' | 'deferred' | null,
    flaggedBy: 'auto' | 'engineer' | null,
  ) => {
    // Look up the row's pre-mutation classification (fresh, via ref) so we can
    // decrement the right mode bucket on its way out (and increment the right
    // one on its way in). Mirrors the row-classification logic in filteredRows:
    // a row is "auto-flagged" iff autoFlag exists OR noteStatus is
    // 'wrong_family'; otherwise it's a "synonym" row. "Parked" means deferred
    // OR unmappable — both hide the row from every default mode view.
    const target = accumRowsRef.current.find((r) => r.paramName === paramName);
    // Mutate the row in accumRows.
    setAccumRows((rows) => rows.map((r) =>
      r.paramName === paramName ? { ...r, noteStatus: status, flaggedBy } : r,
    ));
    setData((prev) => {
      if (!prev) return prev;
      const wasFlagged = target ? (!!target.autoFlag || target.noteStatus === 'wrong_family') : false;
      const isParkedNow = status === 'unmappable' || status === 'deferred';
      const wasParked = target?.noteStatus === 'unmappable' || target?.noteStatus === 'deferred';
      const isFlaggedNow = !!target?.autoFlag || status === 'wrong_family';
      let triageCounts = prev.triageCounts;
      if (triageCounts) {
        let { synonyms, autoFlagged, total } = triageCounts;
        // Remove from previous bucket
        if (!wasParked) {
          if (wasFlagged) autoFlagged = Math.max(0, autoFlagged - 1);
          else synonyms = Math.max(0, synonyms - 1);
          if (isParkedNow) total = Math.max(0, total - 1);
        }
        // Add into new bucket
        if (!isParkedNow) {
          if (isFlaggedNow) autoFlagged += 1;
          else synonyms += 1;
          if (wasParked) total += 1;
        }
        triageCounts = { synonyms, autoFlagged, total };
      }
      // statusCounts — when a lifecycle-open row gets parked it leaves the
      // OPEN count and joins DEFERRED or UNMAPPABLE; reopen reverses.
      // Accepted/undone counts are untouched (noteStatus is independent
      // of acceptedOverride).
      let statusCounts = prev.statusCounts;
      if (statusCounts && target && !target.acceptedOverride) {
        // accepted/undone are independent of noteStatus — never reassigned here.
        const { accepted, undone } = statusCounts;
        let { open, deferred, unmappable } = statusCounts;
        const wasDeferred = target.noteStatus === 'deferred';
        const wasUnmappable = target.noteStatus === 'unmappable';
        const isDeferredNow = status === 'deferred';
        const isUnmappableNow = status === 'unmappable';
        if (wasDeferred) deferred = Math.max(0, deferred - 1);
        if (wasUnmappable) unmappable = Math.max(0, unmappable - 1);
        if (isDeferredNow) deferred += 1;
        if (isUnmappableNow) unmappable += 1;
        if (!wasParked && isParkedNow) open = Math.max(0, open - 1);
        if (wasParked && !isParkedNow) open += 1;
        statusCounts = { open, accepted, undone, deferred, unmappable };
      }
      return { ...prev, triageCounts, statusCounts };
    });
    // Also seed notesByParam so filteredRows' liveNoteStatus lookup picks
    // up the change before the next /unmapped-param-notes refetch.
    setNotesByParam((prev) => {
      const existing = prev[paramName];
      if (status === null) {
        if (!existing) return prev;
        const { [paramName]: _drop, ...rest } = prev;
        void _drop;
        return rest;
      }
      return {
        ...prev,
        [paramName]: existing
          ? { ...existing, status, flaggedBy }
          : {
              paramName,
              note: '',
              status,
              flaggedBy,
              autoDiagnosis: null,
              updatedBy: '',
              updatedByName: 'You',
              updatedAt: new Date().toISOString(),
              createdAt: new Date().toISOString(),
            },
      };
    });
  }, []);

  // Optimistic in-place mutation after a successful Revert DELETE.
  // Flips acceptedOverride.isActive to false and bumps statusCounts
  // (accepted-1, undone+1). Open-bucket count stays put because reverting
  // doesn't bring the row back into the open queue; the row is still
  // resolved (just by an inactive override) until a fresh refresh recomputes
  // classification.
  const onRowReverted = useCallback((paramName: string) => {
    setAccumRows((rows) => rows.map((r) => {
      if (r.paramName !== paramName || !r.acceptedOverride) return r;
      return { ...r, acceptedOverride: { ...r.acceptedOverride, isActive: false } };
    }));
    setData((prev) => {
      if (!prev) return prev;
      const nextStatusCounts = prev.statusCounts
        ? {
          open: prev.statusCounts.open,
          accepted: Math.max(0, prev.statusCounts.accepted - 1),
          undone: prev.statusCounts.undone + 1,
          deferred: prev.statusCounts.deferred,
          unmappable: prev.statusCounts.unmappable,
        }
        : prev.statusCounts;
      return { ...prev, statusCounts: nextStatusCounts };
    });
  }, []);

  // Worker-pool flush — REGEN_CONCURRENCY subprocesses in flight at once.
  // Tracks progress so the button shows "Regenerating 3 of 8…" feedback.
  const flushPendingRegens = useCallback(async () => {
    const ids = [...pendingRegenIds];
    if (ids.length === 0) return;
    setRegenFlushing(true);
    setRegenProgress({ done: 0, total: ids.length });
    let next = 0;
    let done = 0;
    async function worker() {
      while (next < ids.length) {
        const id = ids[next++];
        if (!id) break;
        await regenerateBatch(id);
        done++;
        setRegenProgress({ done, total: ids.length });
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(REGEN_CONCURRENCY, ids.length) }, () => worker()),
    );
    setPendingRegenIds(new Set());
    setRegenProgress(null);
    setRegenFlushing(false);
    await refresh();
  }, [pendingRegenIds, regenerateBatch, refresh]);

  const clearBatchFilter = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('batch');
    router.push(`/admin?${params.toString()}`);
  }, [searchParams, router]);

  // When batch-filtered, surface the actual batch's MFR in the chip.
  // Previously this used the first row's first MFR — misleading when params
  // are shared across batches (e.g. Yangjie + Vanguard both ship MOSFETs
  // with the same param names; if Vanguard had more products with that
  // param, the chip would show "Vanguard" even when filtered to Yangjie).
  // Now we resolve from data.batches[0] which the route returns regardless
  // of the batch's status (pending/applied/reverted).
  const batchMfrName = useMemo(() => {
    if (!batchFilter || !data) return null;
    const filteredBatch = data.batches.find((b) => b.batch_id === batchFilter);
    return filteredBatch?.manufacturer ?? null;
  }, [batchFilter, data]);

  // The heavy filter axes (search / MFR / family / min-prods / has-note /
  // flagged) + the server page slice are now applied SERVER-SIDE (Decision
  // #231) — accumRows is the already-filtered, already-paged set.
  //
  // We KEEP a thin client-side pass for the status / mode / parked predicates
  // (with the notesByParam liveNoteStatus overlay). Reason: optimistic
  // Accept / Flag / Defer must drop a row from the current view WITHOUT a
  // refetch, which only works if these predicates re-run locally. For
  // server-returned rows this pass is idempotent (the server already filtered
  // by mode + status); it only changes visibility for rows the engineer just
  // mutated this session.
  const allRows = accumRows;
  const filteredRows = useMemo(() => {
    return allRows.filter((row) => {
      // Live note status takes precedence over the row's server-fetched
      // noteStatus — after the engineer marks unmappable (or confirms a flag),
      // notesByParam updates immediately while row.noteStatus wouldn't refresh
      // until the next queue refetch.
      const liveNoteStatus = notesByParam[row.paramName]?.status ?? row.noteStatus ?? null;
      // Parked rows (unmappable + deferred) drop from every default view; the
      // DEFERRED / UNMAPPABLE status chips opt them back in; "All" mode keeps
      // them visible so the audit trail stays accessible.
      if (mode !== 'all') {
        if (liveNoteStatus === 'unmappable' && statusFilter !== 'unmappable') return false;
        if (liveNoteStatus === 'deferred' && statusFilter !== 'deferred') return false;
      }
      // Mode filter (Open Synonyms vs Auto-flagged vs All).
      const isFlagged = !!row.autoFlag || liveNoteStatus === 'wrong_family';
      if (mode === 'auto_flagged' && !isFlagged) return false;
      if (mode === 'synonyms' && isFlagged) return false;
      // Status filter. OPEN = lifecycle-open AND not parked. Mirrors
      // isInOpenQueue() on the server.
      const ov = row.acceptedOverride;
      const isParked = liveNoteStatus === 'unmappable' || liveNoteStatus === 'deferred';
      if (statusFilter === 'open' && (ov || isParked)) return false;
      if (statusFilter === 'accepted' && (!ov || !ov.isActive)) return false;
      if (statusFilter === 'undone' && (!ov || ov.isActive)) return false;
      if (statusFilter === 'deferred' && liveNoteStatus !== 'deferred') return false;
      if (statusFilter === 'unmappable' && liveNoteStatus !== 'unmappable') return false;
      return true;
    });
  }, [allRows, notesByParam, mode, statusFilter]);

  // Stable key the table uses to decide when to reset its pagination. Encodes
  // every input that should genuinely change the "view" (mode, status,
  // search, MFR/family chips, etc.) but NOT row-content mutations from
  // Accept/Revert/Flag. Without this, the table was keying off the `rows`
  // prop reference, which churned on every optimistic mutation and kicked
  // engineers back to the first 50 rows after every action.
  const viewKey = useMemo(
    () => JSON.stringify({
      mode,
      statusFilter,
      search: filters.search.trim().toLowerCase(),
      mfrSlugs: [...filters.mfrSlugs].sort(),
      families: [...filters.families].sort(),
      minProductCount: filters.minProductCount,
      hasNote: filters.hasNote,
      flaggedOnly: filters.flaggedOnly,
      aiVerdict: filters.aiVerdict,
      batchFilter,
    }),
    [mode, statusFilter, filters, batchFilter],
  );

  // Count of flagged params across the whole notes map — surfaced as the
  // chip badge on the Flagged toggle in the filter bar.
  const flaggedCount = useMemo(
    () => Object.values(notesByParam).filter((n) => n?.flagged).length,
    [notesByParam],
  );

  // grandTotal = every classified row in the working (batch-scoped or full)
  // set, across ALL modes/statuses — independent of the active per-axis
  // filters (statusCounts is computed pre-axis-filter server-side). 0 ⇒ the
  // queue is genuinely empty. viewTotal = the count for the CURRENT
  // mode/status/axes view (server's totalFiltered) — drives the bar's
  // "N of M" + the per-view empty messages + the table's server pagination.
  const grandTotal = useMemo(() => {
    const sc = data?.statusCounts;
    if (!sc) return accumRows.length;
    return sc.open + sc.accepted + sc.undone + sc.deferred + sc.unmappable;
  }, [data, accumRows.length]);
  const viewTotal = data?.totalFiltered ?? accumRows.length;
  // Rows on the server not yet pulled into the accumulator — drives the
  // table's "Show more" server-fetch affordance.
  const serverRemaining = Math.max(0, viewTotal - accumRows.length);

  // ── Simplified-header progress numbers (server-computed statusCounts) ──
  const sc = data?.statusCounts;
  const mappedCount = sc?.accepted ?? 0;
  const leftCount = sc?.open ?? 0;
  const undoneCount = sc?.undone ?? 0;
  const deferredCount = sc?.deferred ?? 0;
  const unmappableCount = sc?.unmappable ?? 0;
  const mappedPct = grandTotal > 0 ? Math.round((mappedCount / grandTotal) * 100) : 0;

  // ── Durable AI-suggestion counts (+ optimistic delta) ──
  // generatedSoFar drives the "generated so far" counter (headline #1); the
  // per-verdict counts feed the filter-bar chips (Accept = "Accepts waiting").
  const vc = data?.verdictCounts;
  const generatedSoFar = (vc?.generatedTotal ?? 0) + verdictDelta.generated;
  const effectiveVerdictCounts = vc
    ? {
        generatedTotal: vc.generatedTotal + verdictDelta.generated,
        accept: Math.max(0, vc.accept + verdictDelta.accept),
        defer: Math.max(0, vc.defer + verdictDelta.defer),
        none: Math.max(0, vc.none + verdictDelta.none),
      }
    : undefined;

  // How many generatable (open-synonym, no-verdict) params remain — drives the
  // whole-queue "Generate next N" control in the table. 0 in auto_flagged mode
  // (that mode is Confirm/Revert, not Generate) so the control hides there.
  const ungeneratedCount = mode === 'auto_flagged' ? 0 : (effectiveVerdictCounts?.none ?? 0);

  return (
    <Box sx={{ px: 3, pb: 3, pt: 2 }}>
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
        {batchFilter && (
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip
              size="small"
              label={
                batchMfrName
                  ? `Filtered to ${batchMfrName} batch (${batchFilter.slice(0, 8)}…)`
                  : `Filtered to batch ${batchFilter.slice(0, 8)}…`
              }
              onDelete={clearBatchFilter}
              color="primary"
              variant="outlined"
            />
            <Button size="small" onClick={clearBatchFilter}>Show all</Button>
          </Stack>
        )}
        {!batchFilter && data && (
          <Stack direction="row" spacing={3} alignItems="baseline" flexWrap="wrap" sx={{ rowGap: 0.5 }}>
            <Box>
              <Typography component="span" variant="h6" sx={{ fontWeight: 700, color: 'success.main' }}>{mappedCount.toLocaleString()}</Typography>
              <Typography component="span" variant="body2" sx={{ ml: 0.75, color: 'text.secondary' }}>mapped</Typography>
            </Box>
            <Box>
              <Typography component="span" variant="h6" sx={{ fontWeight: 700, color: 'warning.main' }}>{leftCount.toLocaleString()}</Typography>
              <Typography component="span" variant="body2" sx={{ ml: 0.75, color: 'text.secondary' }}>left to map</Typography>
            </Box>
            <Box>
              <Typography component="span" variant="h6" sx={{ fontWeight: 700, color: 'text.primary' }}>{grandTotal.toLocaleString()}</Typography>
              <Typography component="span" variant="body2" sx={{ ml: 0.75, color: 'text.secondary' }}>total</Typography>
            </Box>
            {/* auto-flagged count intentionally not repeated here — the
                "Auto-flagged misclassifications" chip in the filter bar below
                already shows it and is clickable. */}
          </Stack>
        )}

        {/* Deferred-regen flush control — appears once an Accept has queued
            affected batches. Tooltip explains why this exists separate from
            Accept (so the user understands their accepted overrides are
            already live; this only refreshes batch report metrics).
            HIDDEN on Triage via SHOW_TRIAGE_REGEN (July 2026) — regen still
            available per-batch on the Ingest page. Flip the flag to restore. */}
        {SHOW_TRIAGE_REGEN && pendingRegenIds.size > 0 && (
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip
              size="small"
              color="warning"
              variant="outlined"
              label={
                regenProgress
                  ? `Regenerating ${regenProgress.done} of ${regenProgress.total}…`
                  : `${pendingRegenIds.size} batch${pendingRegenIds.size === 1 ? '' : 'es'} need regen`
              }
            />
            <Button
              size="small"
              variant="contained"
              startIcon={regenFlushing ? <CircularProgress size={14} color="inherit" /> : <RefreshIcon fontSize="small" />}
              onClick={flushPendingRegens}
              disabled={regenFlushing}
              sx={{ whiteSpace: 'nowrap' }}
            >
              {regenFlushing ? 'Regenerating…' : 'Regen affected batches'}
            </Button>
          </Stack>
        )}

        {/* Refresh forces a fresh server compute (bypasses L1+L2). Pinned to the
            far right of the header row; white outline to read as a neutral
            utility action (not a primary/green CTA). */}
        <Tooltip title="Force a fresh fetch from the database (bypasses cache, ~10–30s)">
          <span style={{ marginLeft: 'auto' }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={loading ? <CircularProgress size={14} color="inherit" /> : <RefreshIcon fontSize="small" />}
              onClick={() => refresh(true)}
              disabled={loading}
              sx={{ color: 'common.white', borderColor: 'rgba(255,255,255,0.5)', '&:hover': { borderColor: 'common.white' } }}
            >
              Refresh
            </Button>
          </span>
        </Tooltip>
      </Stack>

      {/* Progress bar under the numbers — mapped share of the whole queue. */}
      {!loading && !batchFilter && data && grandTotal > 0 && (
        <Box sx={{ mb: 2, mt: -0.5 }}>
          <LinearProgress
            variant="determinate"
            value={mappedPct}
            color="success"
            sx={{ height: 6, borderRadius: 3 }}
          />
          <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5, display: 'block' }}>
            {mappedPct}% mapped
            {undoneCount > 0 && ` · ${undoneCount.toLocaleString()} undone`}
            {deferredCount > 0 && ` · ${deferredCount.toLocaleString()} set aside`}
            {unmappableCount > 0 && ` · ${unmappableCount.toLocaleString()} can't map`}
          </Typography>
        </Box>
      )}

      {loading && (
        <Box sx={{ mt: 1 }}>
          <Skeleton variant="rectangular" height={48} sx={{ mb: 2, borderRadius: 1 }} />
          <Skeleton variant="rectangular" height={36} sx={{ mb: 1, borderRadius: 0.5 }} />
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} variant="rectangular" height={42} sx={{ mb: 0.5, borderRadius: 0.5 }} />
          ))}
        </Box>
      )}

      {error && <Alert severity="error" sx={{ my: 2 }}>{error}</Alert>}

      {/* Globally empty: 0 rows in EVERY mode/status (grandTotal). Hide the
          filter bar entirely and surface a green success state. */}
      {!loading && data && grandTotal === 0 && (
        <Alert severity="success" sx={{ my: 3 }}>
          {batchFilter
            ? 'No unresolved parameters for this batch — nothing to review.'
            : 'No unresolved parameters across any manufacturer. The queue is empty.'}
        </Alert>
      )}

      {/* Otherwise: keep the filter bar (mode chips + filters) mounted so the
          engineer can switch modes even when the current mode is empty. */}
      {!loading && data && grandTotal > 0 && (
        <>
          <TriageFilterBar
            mfrOptions={data.mfrOptions ?? []}
            familyOptions={data.familyOptions ?? []}
            filters={filters}
            onChange={setFilters}
            filteredCount={filteredRows.length}
            totalCount={viewTotal}
            mode={mode}
            onModeChange={handleModeChange}
            triageCounts={data.triageCounts}
            status={statusFilter}
            onStatusChange={setStatusFilter}
            statusCounts={data.statusCounts}
            noteCount={Object.keys(notesByParam).length}
            flaggedCount={flaggedCount}
            verdictCounts={effectiveVerdictCounts}
          />
          {/* "Generated so far" counter (headline #1) — lives here, next to the
              Generate control at the top of the table, NOT in the mapped/left/
              total header row (avoids crowding). Raw cumulative count so it only
              climbs; the Accept chip above carries "Accepts waiting". */}
          <Typography variant="body2" sx={{ mt: 1, mb: 0.5, color: 'text.secondary' }}>
            <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>{generatedSoFar.toLocaleString()}</Box>
            {' '}params generated so far
          </Typography>
          {viewTotal === 0 || filteredRows.length === 0 ? (
            // The current view (server-filtered by mode/status/axes) is empty,
            // OR the loaded page emptied out client-side (e.g. optimistic
            // accept). Three messages, most-specific first:
            //   1. Single-MFR drilldown (?mfr=<slug> from the 🔧 wrench) →
            //      success state so the engineer knows the MFR is fully mapped,
            //      not that the filter is broken. MFR name resolved from the
            //      server option list (accumRows is empty here).
            //   2. Any other active per-axis filter → generic "no match / clear".
            //   3. No filters → mode-specific empty message.
            (() => {
              const onlyMfrFilter =
                filters.mfrSlugs.length === 1 &&
                filters.families.length === 0 &&
                !filters.search.trim() &&
                !filters.hasNote &&
                !filters.flaggedOnly &&
                filters.minProductCount === 0 &&
                (!filters.aiVerdict || filters.aiVerdict === 'all');
              if (onlyMfrFilter) {
                const slug = filters.mfrSlugs[0];
                const mfrName = (data.mfrOptions ?? []).find((m) => m.slug === slug)?.name ?? slug;
                return (
                  <Alert severity="success" sx={{ my: 2 }}>
                    No pending unmapped params for <strong>{mfrName}</strong>. With current dictionary overrides,
                    every param this MFR ships is already mapped to a canonical attribute — nothing left to triage here.{' '}
                    <Box
                      component="span"
                      onClick={() => setFilters(EMPTY_FILTERS)}
                      sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'primary.main' }}
                    >
                      Clear filter
                    </Box>
                    {' '}to see the rest of the queue.
                  </Alert>
                );
              }
              const anyFilterActive =
                !!filters.search.trim() ||
                filters.mfrSlugs.length > 0 ||
                filters.families.length > 0 ||
                filters.minProductCount > 0 ||
                filters.hasNote ||
                filters.flaggedOnly ||
                (!!filters.aiVerdict && filters.aiVerdict !== 'all');
              if (anyFilterActive) {
                return (
                  <Alert severity="info" sx={{ my: 2 }}>
                    No params match the current filters. Adjust or{' '}
                    <Box
                      component="span"
                      onClick={() => setFilters(EMPTY_FILTERS)}
                      sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'primary.main' }}
                    >
                      clear all filters
                    </Box>
                    .
                  </Alert>
                );
              }
              return (
                <Alert severity="info" sx={{ my: 2 }}>
                  {mode === 'auto_flagged'
                    ? 'No auto-flagged misclassifications. Switch to Open synonyms to continue mapping.'
                    : mode === 'synonyms'
                      ? 'No open synonym rows in the queue.'
                      : 'No rows match the current view.'}
                </Alert>
              );
            })()
          ) : (
            <GlobalUnmappedParamsTable
              rows={filteredRows}
              viewKey={viewKey}
              pendingBatchCount={data.aggregate.counts.total}
              onRegenerateAffected={onRegenerateAffected}
              onRowAccepted={onRowAccepted}
              onRowReverted={onRowReverted}
              onRowFlagged={onRowFlagged}
              notesByParam={notesByParam}
              onNoteChange={onNoteChange}
              aiVerdictFilter={filters.aiVerdict}
              serverRemaining={serverRemaining}
              serverTotal={viewTotal}
              onLoadMore={loadMore}
              loadingMore={loadingMore}
              onBatchGenerated={handleBatchGenerated}
              ungeneratedCount={ungeneratedCount}
              fetchUngenerated={fetchUngenerated}
            />
          )}
        </>
      )}
    </Box>
  );
}
