'use client';

/**
 * GlobalUnmappedParamsTable — deduplicated cross-batch unmapped-params list with
 * AI-assisted dictionary triage (Phase 3-A).
 *
 * Per row:
 *   1. Calls /api/admin/atlas/dictionaries/suggest with paramName + samples + dominantFamily
 *      to get a Claude Sonnet 4.6-proposed translation + attributeId + confidence + a binary
 *      'accept'|'defer' suggestion + a written explanation.
 *   2. Renders the suggestion + explanation symmetrically (chip + visible italic line under
 *      the translation) so Accept and Defer get the same depth of evidence.
 *   3. "Accept" creates an `add` override in atlas_dictionary_overrides (server-side),
 *      then triggers regeneration of every batch that surfaced this param.
 *   4. The note popover pre-fills its textarea with the AI explanation when the
 *      suggestion is 'defer' and no existing note is present — engineer can edit + Save
 *      instead of pasting from a separate Claude tab.
 *
 * Performance:
 *   - Suggestions are fetched lazily on first table-open per session (cached in component state).
 *   - Concurrency-limited to 6 parallel suggestion calls so we don't slam Anthropic
 *     when there are hundreds of params.
 *   - Failed suggestion fetches degrade to a manual entry row with no auto-fill.
 */

import { Fragment, useCallback, useEffect, useState, useMemo, useRef, useTransition } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  LinearProgress,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CheckIcon from '@mui/icons-material/Check';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import HelpOutlineOutlinedIcon from '@mui/icons-material/HelpOutlineOutlined';
import FlagIcon from '@mui/icons-material/Flag';
import BookmarkAddedIcon from '@mui/icons-material/BookmarkAdded';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import UndoOutlinedIcon from '@mui/icons-material/UndoOutlined';
import NoteAltOutlinedIcon from '@mui/icons-material/NoteAltOutlined';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SearchIcon from '@mui/icons-material/Search';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import type { GlobalUnmappedParam, DictSuggestion, DeepAnalysis } from './types';
import { getLogicTable } from '@/lib/logicTables';
import UnmappedParamNoteCell, { type NoteRecord } from './UnmappedParamNoteCell';

/** Compact relative time format used in accept-audit chips/tooltips.
 *  Mirrors the helper in RecentDictAcceptsPanel.tsx; if a third surface
 *  needs it, lift to a shared util. */
function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Resolve a familyId (e.g. "B1") to a short human-readable category name
 *  (e.g. "Rectifier Diodes"). The full familyName from the logic table often
 *  carries a descriptive suffix after an em dash or parens that's noisy in a
 *  narrow column — strip it for display, surface the full name on hover. */
function getFamilyDisplayName(familyId: string | null): { short: string; full: string } | null {
  if (!familyId) return null;
  const t = getLogicTable(familyId);
  if (!t) return null;
  const full = t.familyName;
  // Cut at the first em dash / en dash / parenthesis — whichever appears first.
  const cut = full.search(/[—–(]/);
  const short = (cut > 0 ? full.slice(0, cut) : full).trim();
  return { short, full };
}

/** Override scope for a row — either an L3 familyId ('B5') or an L2 category
 *  name ('Microcontrollers'). atlas_dictionary_overrides.family_id is
 *  overloaded to accept both, and the suggest/POST endpoints fall through L3
 *  → L2 internally. Returns null when neither signal is present (rare —
 *  pre-categoryCounts batches). */
function getOverrideScope(r: GlobalUnmappedParam): { kind: 'family' | 'category'; key: string } | null {
  if (r.dominantFamily) return { kind: 'family', key: r.dominantFamily };
  if (r.dominantCategory) return { kind: 'category', key: r.dominantCategory };
  return null;
}

/** Aggressive paramName normalization — strips case + collapses every
 *  non-alphanumeric run to a single underscore + trim. Mirrors the
 *  server-side helper in the investigate route. Two paramNames that
 *  collapse to the same string are cosmetic duplicates (whitespace /
 *  case / paren-style variants like "T(mm)" / "T (mm)" / "t(mm)").
 *  Non-ASCII characters (CJK, full-width punctuation) collapse to
 *  underscores, so Chinese param names DON'T spuriously match each
 *  other unless they're actually the same string. */
function normalizeParamKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/** Deterministic short UID for a paramName — FNV-1a 32-bit hash printed
 *  as 6 hex chars with a "TR-" prefix. Same input always yields the same
 *  UID across sessions, machines, and the server, so engineers can
 *  copy/paste "TR-a8f2c1" into a search field, a Slack message, or a
 *  ticket and the row resolves consistently. 6 hex chars = 16M slots —
 *  collision probability under our queue size (~1K paramNames) is
 *  negligible. No DB / migration needed because the input itself (the
 *  paramName string) is the canonical identity. */
export function paramUid(paramName: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < paramName.length; i++) {
    h ^= paramName.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return 'TR-' + (h >>> 0).toString(16).padStart(8, '0').slice(-6);
}

interface Props {
  rows: GlobalUnmappedParam[];
  onRegenerateAffected: (batchIds: string[]) => Promise<void>;
  pendingBatchCount: number;
  /** Notes are owned by the parent panel (so the filter bar can filter on
   *  them). Table just renders + edits via callback. */
  notesByParam: Record<string, NoteRecord>;
  onNoteChange: (paramName: string, next: NoteRecord | null) => void;
  /** Called after a successful Accept POST. Parent should update the row's
   *  acceptedOverride in-place so the UI transforms (Accept button → Revert
   *  button) without a full page refetch. Replaces the old "Accept → refresh
   *  → 30s skeleton" UX. */
  onRowAccepted?: (paramName: string, override: NonNullable<GlobalUnmappedParam['acceptedOverride']>) => void;
  /** Called after a successful Revert DELETE. Parent should set
   *  acceptedOverride.isActive=false in-place. Same optimistic-UI motivation
   *  as onRowAccepted. */
  onRowReverted?: (paramName: string) => void;
  /** Called after a successful flag mutation (PUT /unmapped-param-notes).
   *  Parent should set the row's noteStatus + flaggedBy in-place so the row
   *  transforms (or disappears from Open view) without waiting on a queue
   *  refetch. `status=null` clears the flag (Revert flow). Same optimistic-UI
   *  motivation as onRowAccepted/onRowReverted. */
  onRowFlagged?: (
    paramName: string,
    status: 'wrong_family' | 'confirmed_in_family' | 'unmappable' | null,
    flaggedBy: 'auto' | 'engineer' | null,
  ) => void;
}

interface RowState {
  suggestion: DictSuggestion | null;
  loadingSuggestion: boolean;
  // User-edited values (start from suggestion, can be overridden inline)
  editedAttributeId: string;
  editedAttributeName: string;
  editedUnit: string;
  accepted: boolean;
  acceptError: string | null;
  accepting: boolean;
  // Deep-investigation pass for non-accept rows. Opt-in fire (manual click).
  // When set, the row renders an expanded subrow showing the bucket verdict +
  // evidence + action buttons. Persisted to localStorage with the same TTL
  // as suggestions so investigations survive reloads.
  deepAnalysis: DeepAnalysis | null;
  loadingDeepAnalysis: boolean;
  deepAnalysisError: string | null;
}

const SUGGESTION_CONCURRENCY = 4;
// localStorage key prefix for cached AI suggestions. Keyed by paramName + familyId.
// Suggestions survive page reloads + tab switches without re-hitting the server.
// Server cache (24h) provides a second layer if storage is cleared.
//
// Bump the version suffix when DictSuggestion shape changes — old entries are
// orphaned (deleted on next miss path) and fresh suggestions are fetched.
// v2: added `suggestion` ('accept' | 'defer') + `explanation` fields when
// upgrading the model from Haiku to Sonnet 4.6.
const SUGGEST_LS_PREFIX = 'atlas-ingest-ai-suggest-v2:';
const SUGGEST_LS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
type CachedSuggestion = { suggestion: DictSuggestion; cachedAt: number };

function readSuggestionCache(paramName: string, familyId: string | null): DictSuggestion | null {
  if (typeof window === 'undefined') return null;
  try {
    const key = SUGGEST_LS_PREFIX + (familyId ?? '') + '::' + paramName;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedSuggestion;
    if (Date.now() - parsed.cachedAt > SUGGEST_LS_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed.suggestion;
  } catch {
    return null;
  }
}

function writeSuggestionCache(paramName: string, familyId: string | null, suggestion: DictSuggestion): void {
  if (typeof window === 'undefined') return;
  try {
    const key = SUGGEST_LS_PREFIX + (familyId ?? '') + '::' + paramName;
    const payload: CachedSuggestion = { suggestion, cachedAt: Date.now() };
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // localStorage full or disabled — silently degrade to no cache
  }
}

// Same cache pattern for deep investigations. Separate prefix so a schema
// change to DeepAnalysis doesn't bust suggestion cache entries.
// v2: added investigationId so cached entries support follow-up action
//     recording without re-firing the AI.
// v3: each sampleProduct now carries `origin: 'applied' | 'pending'` plus
//     the diag has appliedCount/pendingCount/pendingBatchesScanned. v2
//     entries are missing those fields.
// v4: investigationId removed — audit rows are now created on engineer
//     DECISION, not Investigate click. Cached entries from v3 still carry
//     a stale investigationId field that the new flow ignores; bump so
//     legacy entries aren't re-used with the wrong shape assumptions.
const INVESTIGATE_LS_PREFIX = 'atlas-ingest-ai-investigate-v4:';
type CachedDeepAnalysis = {
  analysis: DeepAnalysis;
  cachedAt: number;
};

function readInvestigateCache(paramName: string, scopeKey: string | null): CachedDeepAnalysis | null {
  if (typeof window === 'undefined') return null;
  try {
    const key = INVESTIGATE_LS_PREFIX + (scopeKey ?? '__none__') + '::' + paramName;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedDeepAnalysis;
    if (Date.now() - parsed.cachedAt > SUGGEST_LS_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    if (!parsed.analysis) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeInvestigateCache(
  paramName: string,
  scopeKey: string | null,
  analysis: DeepAnalysis,
): void {
  if (typeof window === 'undefined') return;
  try {
    const key = INVESTIGATE_LS_PREFIX + (scopeKey ?? '__none__') + '::' + paramName;
    const payload: CachedDeepAnalysis = { analysis, cachedAt: Date.now() };
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

// Per-family canonical attributeId set, cached separately from suggestions so
// the cache survives even when individual suggestion entries expire and so we
// don't duplicate the schema list across hundreds of suggestion entries.
const SCHEMA_LS_PREFIX = 'atlas-ingest-family-schema:';
type CachedSchema = { schemaIds: string[]; cachedAt: number };

function readFamilySchemaCache(familyId: string): string[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SCHEMA_LS_PREFIX + familyId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedSchema;
    if (Date.now() - parsed.cachedAt > SUGGEST_LS_TTL_MS) {
      localStorage.removeItem(SCHEMA_LS_PREFIX + familyId);
      return null;
    }
    return parsed.schemaIds;
  } catch {
    return null;
  }
}

function writeFamilySchemaCache(familyId: string, schemaIds: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: CachedSchema = { schemaIds, cachedAt: Date.now() };
    localStorage.setItem(SCHEMA_LS_PREFIX + familyId, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

// Initial visible row count — capped so the page doesn't render 400+ MUI
// Table rows on first paint. Each row carries multiple Tooltips, Chips,
// TextFields, and a Popover-backed note button — at ~15 React elements per
// row, going from 100 → 200 rows in one synchronous render froze the
// browser. ROW_BATCH_SIZE kept low so each "Show more" click stays under
// the responsive threshold.
const INITIAL_VISIBLE_ROWS = 50;
const ROW_BATCH_SIZE = 50;

export default function GlobalUnmappedParamsTable({ rows, onRegenerateAffected, pendingBatchCount, notesByParam, onNoteChange, onRowAccepted, onRowReverted, onRowFlagged }: Props) {
  // Default expanded so users see the AI-triage flow without an extra click —
  // this is the most-used panel of the page when there are unmapped params.
  const [expanded, setExpanded] = useState(true);
  const [states, setStates] = useState<Record<string, RowState>>({});
  const [suggestionProgress, setSuggestionProgress] = useState<{ done: number; total: number } | null>(null);
  // Per-paramName hydration guard. Previously a single bool ref ("did we
  // hydrate at all yet?") — that fired once on first mount and short-circuited
  // every subsequent filter change, so switching Status filter from Open to
  // Accepted left the new rows with empty state (no editedAttributeId, no
  // synthesized override suggestion, rendering as blank inputs + a misleading
  // "Generate" CTA). The Set guard hydrates each paramName once and lets new
  // rows entering the prop on a filter switch get seeded.
  const hydratedParamsRef = useRef<Set<string>>(new Set());
  // Per-family canonical attributeId set, populated from the suggest endpoint.
  // Used to flag whether the row's (possibly edited) attributeId actually
  // exists in the family's logic table. Empty set ⇒ family had no schema info.
  const [schemaByFamily, setSchemaByFamily] = useState<Record<string, Set<string>>>({});
  // How many rows to actually render. Bumped by the "Show more" button.
  // Resets when the rows prop changes (filters narrowed the set).
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_ROWS);

  // Per-row opt-out from bulk normalized-match acceptance. By default,
  // accepting a row that has cosmetic-duplicate paramNames in the same
  // scope ALSO fires overrides for the duplicates. Click the × on the
  // "+N similar" chip to scope the accept to just the primary row.
  const [bulkOptedOut, setBulkOptedOut] = useState<Set<string>>(new Set());

  /** For each row, the OTHER queue rows whose paramName normalizes to the
   *  same string AND share the same scope AND are still actionable (no
   *  active override). Accepting any of them with the engineer's chosen
   *  attributeId/Name/Unit is safe — they're whitespace/case/paren-style
   *  variants of the same concept ("T(mm)" / "T (mm)" / "t(mm)"). Built
   *  once per `rows` change; O(N) over the queue. */
  const normalizedMatchesByRow = useMemo(() => {
    const groups = new Map<string, GlobalUnmappedParam[]>();
    for (const r of rows) {
      const scope = getOverrideScope(r);
      if (!scope) continue; // unscoped — bulk-accept can't write an override
      if (r.acceptedOverride?.isActive) continue; // already mapped; not actionable
      const key = `${scope.kind}::${scope.key}::${normalizeParamKey(r.paramName)}`;
      const list = groups.get(key) ?? [];
      list.push(r);
      groups.set(key, list);
    }
    const result: Record<string, GlobalUnmappedParam[]> = {};
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      for (const r of list) {
        result[r.paramName] = list.filter((x) => x.paramName !== r.paramName);
      }
    }
    return result;
  }, [rows]);
  // Reset visible count whenever the rows prop changes — a filter change
  // shouldn't carry over an expanded "show all" state from the previous view.
  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_ROWS);
  }, [rows]);
  const visibleRows = rows.slice(0, visibleCount);
  const hiddenCount = Math.max(0, rows.length - visibleRows.length);
  // useTransition lets React keep the UI responsive while it renders the
  // additional rows. Without this, the synchronous setVisibleCount blocked
  // the main thread for several seconds on large queues, triggering "Page
  // Unresponsive" warnings.
  const [pendingShowMore, startShowMore] = useTransition();

  // Notes (notesByParam, onNoteChange) come from the parent panel via props
  // so the filter bar can scope rows by has-note. See AtlasDictTriagePanel.

  const total = rows.length;
  // sum of per-param product counts — this counts a product N times if it has N
  // unmapped params, so we label it as "param-mentions" not "products"
  const totalParamMentions = rows.reduce((s, r) => s + r.productCount, 0);
  // When the visible rows are entirely (or mostly) auto-flagged, the synonym
  // workflow header text is misleading — flip the description.
  const flaggedVisibleCount = rows.filter((r) => !!r.autoFlag || r.noteStatus === 'wrong_family').length;
  const allFlagged = total > 0 && flaggedVisibleCount === total;

  // Show the suggestion-fetch progress in the header even when collapsed so users
  // see processing happening before they expand.
  const fetchInFlight = !!suggestionProgress;

  // ─── Cache hydration on first expand (no API calls) ──────
  // Sonnet 4.6 is ~10× Haiku cost; auto-firing on every page load was burning
  // tokens. Now: hydrate cached rows synchronously from localStorage on
  // expand, but DO NOT fetch fresh suggestions. The user explicitly triggers
  // generation via the bulk "Generate suggestions" button at the top of the
  // table or the per-row "Generate" mini-button. Cached rows survive across
  // sessions for 7 days (localStorage) + 24h (server in-memory).
  const hydrateFromCache = useCallback(() => {
    const initialStates: Record<string, RowState> = {};
    const initialSchemaByFamily: Record<string, Set<string>> = {};
    const seenFamilies = new Set<string>();
    const familiesNeedingSchema = new Set<string>();
    for (const row of rows) {
      // Skip rows already hydrated this session — preserves user edits to
      // the input fields between filter switches. New paramNames entering
      // the prop fall through and get seeded.
      if (hydratedParamsRef.current.has(row.paramName)) continue;
      hydratedParamsRef.current.add(row.paramName);
      const scope = getOverrideScope(row);
      const scopeKey = scope?.key ?? null;
      if (scopeKey && !seenFamilies.has(scopeKey)) {
        seenFamilies.add(scopeKey);
        const cachedSchema = readFamilySchemaCache(scopeKey);
        if (cachedSchema && cachedSchema.length > 0) {
          initialSchemaByFamily[scopeKey] = new Set(cachedSchema);
        } else {
          familiesNeedingSchema.add(scopeKey);
        }
      }
      // Auto-flagged rows are misclassifications, not synonym gaps. Seed an
      // empty state so cells render placeholders; they're never eligible for
      // suggestion generation.
      if (row.autoFlag) {
        initialStates[row.paramName] = {
          suggestion: null,
          loadingSuggestion: false,
          editedAttributeId: '',
          editedAttributeName: '',
          editedUnit: '',
          accepted: false,
          acceptError: null,
          accepting: false,
          deepAnalysis: null,
          loadingDeepAnalysis: false,
          deepAnalysisError: null,
        };
        continue;
      }
      const cached = readSuggestionCache(row.paramName, scopeKey);
      const cachedDeep = readInvestigateCache(row.paramName, scopeKey);
      // For already-accepted rows (active OR reverted override), seed the
      // edit fields from the override so the Accepted / Undone status views
      // show what was actually mapped instead of blank inputs + a "Generate"
      // CTA that's irrelevant for a row that's already resolved. The AI
      // suggestion cache still wins as the source of truth when present —
      // engineer may have generated a fresh suggestion after revert.
      const ov = row.acceptedOverride;
      if (cached) {
        initialStates[row.paramName] = {
          suggestion: cached,
          loadingSuggestion: false,
          editedAttributeId: cached.suggestedAttributeId ?? ov?.attributeId ?? '',
          editedAttributeName: cached.suggestedAttributeName ?? ov?.attributeName ?? '',
          editedUnit: cached.suggestedUnit ?? ov?.unit ?? '',
          accepted: false,
          acceptError: null,
          accepting: false,
          deepAnalysis: cachedDeep?.analysis ?? null,
          loadingDeepAnalysis: false,
          deepAnalysisError: null,
        };
      } else if (ov) {
        // Override-only seed — no AI suggestion was ever cached for this row
        // (or it expired). Synthesize a minimal suggestion-like record so the
        // UI shows the saved attributeId/Name/Unit AND the "AI translation"
        // column renders the saved name instead of a misleading Generate
        // button. suggestion.suggestion='accept' suppresses the Defer chip.
        const syntheticSuggestion: DictSuggestion = {
          translation: ov.attributeName,
          suggestedAttributeId: ov.attributeId,
          suggestedAttributeName: ov.attributeName,
          suggestedUnit: ov.unit ?? null,
          confidence: 'high',
          reasoning: null,
          suggestion: 'accept',
          explanation: ov.isActive ? 'Saved mapping.' : 'Previously accepted (now reverted).',
        };
        initialStates[row.paramName] = {
          suggestion: syntheticSuggestion,
          loadingSuggestion: false,
          editedAttributeId: ov.attributeId,
          editedAttributeName: ov.attributeName,
          editedUnit: ov.unit ?? '',
          accepted: false,
          acceptError: null,
          accepting: false,
          deepAnalysis: cachedDeep?.analysis ?? null,
          loadingDeepAnalysis: false,
          deepAnalysisError: null,
        };
      } else {
        // Uncached AND not previously accepted — render a "Generate" button
        // instead of auto-fetching.
        initialStates[row.paramName] = {
          suggestion: null,
          loadingSuggestion: false,
          editedAttributeId: '',
          editedAttributeName: '',
          editedUnit: '',
          accepted: false,
          acceptError: null,
          accepting: false,
          deepAnalysis: cachedDeep?.analysis ?? null,
          loadingDeepAnalysis: false,
          deepAnalysisError: null,
        };
      }
    }
    setStates((prev) => ({ ...prev, ...initialStates }));
    if (Object.keys(initialSchemaByFamily).length > 0) {
      setSchemaByFamily((prev) => ({ ...prev, ...initialSchemaByFamily }));
    }

    // Schema fallback runs even when no suggestions are generated — the
    // canonical/invented indicators on the attributeId input depend on it.
    // Endpoint is cheap (no LLM, no DB JSONB scan), safe to fire on hydrate.
    if (familiesNeedingSchema.size > 0) {
      Promise.all([...familiesNeedingSchema].map(async (fam) => {
        try {
          const res = await fetch(`/api/admin/atlas/family-schema?familyId=${encodeURIComponent(fam)}`);
          const json = await res.json();
          if (json?.success && Array.isArray(json.schemaIds)) {
            writeFamilySchemaCache(fam, json.schemaIds);
            setSchemaByFamily((prev) => prev[fam] ? prev : { ...prev, [fam]: new Set(json.schemaIds) });
          }
        } catch {
          // schema fallback failed — indicator just stays dark for this family
        }
      }));
    }
  }, [rows]);

  // ─── Manual suggestion generation ───────────────────────
  // Fires Sonnet 4.6 for the given rows. Used by both the bulk "Generate
  // suggestions for N rows" button and the per-row "Generate" mini-button.
  // Concurrency-limited to SUGGESTION_CONCURRENCY parallel calls so we don't
  // slam Anthropic when the user generates a large batch at once.
  const generateSuggestionsForRows = useCallback(async (targetRows: GlobalUnmappedParam[]) => {
    const queue = targetRows.filter((r) => !r.autoFlag);
    if (queue.length === 0) return;

    // Mark each queued row as loading so the per-row UI flips from
    // "Generate" button to a spinner while in flight.
    setStates((prev) => {
      const next = { ...prev };
      for (const row of queue) {
        next[row.paramName] = {
          ...(prev[row.paramName] ?? {
            suggestion: null,
            editedAttributeId: '',
            editedAttributeName: '',
            editedUnit: '',
            accepted: false,
            acceptError: null,
            accepting: false,
            deepAnalysis: null,
            loadingDeepAnalysis: false,
            deepAnalysisError: null,
          }),
          loadingSuggestion: true,
        } as RowState;
      }
      return next;
    });
    setSuggestionProgress({ done: 0, total: queue.length });

    let done = 0;
    let next = 0;

    async function worker() {
      while (next < queue.length) {
        const row = queue[next++];
        if (!row) break;
        const key = row.paramName;
        const rowScope = getOverrideScope(row);
        const rowScopeKey = rowScope?.key ?? null;
        try {
          const res = await fetch('/api/admin/atlas/dictionaries/suggest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              paramName: row.paramName,
              samples: row.sampleValues,
              // family_id is overloaded: the suggest endpoint falls through
              // L3 logic-table → L2 param-map internally, so an L2 category
              // string (e.g. 'Microcontrollers') routes to the right schema.
              familyId: rowScopeKey ?? '',
            }),
          });
          const json = await res.json();
          const suggestion: DictSuggestion | null = json?.success ? json.suggestion : null;
          if (suggestion) {
            writeSuggestionCache(row.paramName, rowScopeKey, suggestion);
          }
          // Capture the schema list returned alongside the suggestion. We only need
          // it once per scope so the conditional setSchemaByFamily check avoids
          // rerendering rows whose scope already has the set populated. Also
          // persist to localStorage so the next page load lights up indicators
          // synchronously (no API roundtrip needed).
          if (Array.isArray(json?.schemaIds) && rowScopeKey) {
            const fam = rowScopeKey;
            setSchemaByFamily((prev) => prev[fam] ? prev : { ...prev, [fam]: new Set(json.schemaIds) });
            writeFamilySchemaCache(fam, json.schemaIds);
          }
          setStates((prev) => ({
            ...prev,
            [key]: {
              ...(prev[key] ?? {}),
              suggestion,
              loadingSuggestion: false,
              editedAttributeId: suggestion?.suggestedAttributeId ?? '',
              editedAttributeName: suggestion?.suggestedAttributeName ?? '',
              editedUnit: suggestion?.suggestedUnit ?? '',
              accepted: false,
              acceptError: null,
              accepting: false,
            },
          }));
        } catch {
          setStates((prev) => ({
            ...prev,
            [key]: { ...(prev[key] ?? {}), suggestion: null, loadingSuggestion: false } as RowState,
          }));
        } finally {
          done++;
          setSuggestionProgress({ done, total: queue.length });
        }
      }
    }

    const workers = Array.from({ length: Math.min(SUGGESTION_CONCURRENCY, queue.length) }, () => worker());
    await Promise.all(workers);
    setSuggestionProgress(null);
  }, []);

  useEffect(() => {
    if (expanded && rows.length > 0) {
      hydrateFromCache();
    }
  }, [expanded, rows, hydrateFromCache]);

  // ─── Pending-suggestion accounting ──────────────────────
  // Rows that don't have a suggestion AND aren't auto-flagged AND aren't
  // currently loading are eligible for the bulk Generate button. Computed
  // each render against the current `states` snapshot — cheap (string lookup
  // per row).
  const pendingSuggestionRows = useMemo(
    () => rows.filter((r) => !r.autoFlag && !states[r.paramName]?.suggestion && !states[r.paramName]?.loadingSuggestion),
    [rows, states],
  );

  const generateAllPending = useCallback(() => {
    if (pendingSuggestionRows.length === 0) return;
    generateSuggestionsForRows(pendingSuggestionRows);
  }, [pendingSuggestionRows, generateSuggestionsForRows]);

  const generateOne = useCallback((row: GlobalUnmappedParam) => {
    generateSuggestionsForRows([row]);
  }, [generateSuggestionsForRows]);

  // ─── Per-row flag actions (Confirm / Revert) ────────────
  // Tracks in-flight + last-error per paramName so the buttons can show
  // loading state and surface failures inline without alerts.
  const [flagState, setFlagState] = useState<Record<string, { busy: boolean; error: string | null }>>({});

  // Fire-and-forget audit-log write. ONLY fires on engineer decisions
  // (Accept / Confirm Wrong Family / Mark Unmappable), not on Investigate
  // clicks. Per May 2026 redesign: the AI log records DECISIONS, not the
  // ephemeral state of intermediate Investigate iterations — otherwise an
  // engineer iterating on a tricky param leaves a trail of "Pending" rows
  // that never resolve. Caller passes the in-state DeepAnalysis so the
  // server captures what the AI said at the moment the decision was made.
  // No-op when no investigation has been run (engineer accepted the lighter
  // /suggest verdict without firing the deeper /investigate pass).
  const recordInvestigationAction = useCallback(async (
    row: GlobalUnmappedParam,
    action: 'override_created' | 'flagged_wrong_family' | 'marked_unmappable' | 'dismissed',
    resultingOverrideId?: string,
  ) => {
    const state = states[row.paramName];
    const analysis = state?.deepAnalysis;
    if (!analysis) return;
    const scope = getOverrideScope(row);
    try {
      await fetch('/api/admin/atlas/triage-investigations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paramName: row.paramName,
          scopeKind: scope?.kind ?? 'none',
          scopeKey: scope?.key ?? null,
          analysis,
          actionTaken: action,
          resultingOverrideId: resultingOverrideId ?? null,
        }),
      });
    } catch (err) {
      console.error('recordInvestigationAction failed:', err);
    }
  }, [states]);

  const confirmFlag = useCallback(async (row: GlobalUnmappedParam) => {
    // Two sources feed this handler:
    //   1. Registry-based auto-flag (row.autoFlag) — the FAMILY_PARAM_SIGNATURES
    //      pass detected this paramName belongs to a different family. UI
    //      surfaces the red Confirm button on the row directly.
    //   2. AI-investigation verdict (state.deepAnalysis with bucket=wrong_family)
    //      — engineer ran Investigate; AI returned wrong_family with a
    //      signatureRecommendation. UI surfaces the red "Add wrong_family
    //      signature" button inside the deep-analysis card.
    // Either source provides the autoDiagnosis payload that gets snapshotted
    // onto atlas_unmapped_param_notes for the audit record.
    const deep = states[row.paramName]?.deepAnalysis;
    const investigationVerdict =
      deep?.bucket === 'wrong_family' ? deep : null;

    let autoDiagnosis: Record<string, unknown> | null = null;
    if (row.autoFlag) {
      autoDiagnosis = {
        source: 'registry',
        suggestedFamily: row.autoFlag.suggestedFamily,
        reasoning: row.autoFlag.reasoning,
        matchingParam: row.autoFlag.matchingParam,
        sourceFamily: row.dominantFamily,
        confirmedAt: new Date().toISOString(),
      };
    } else if (investigationVerdict) {
      const payload = (investigationVerdict.recommendation?.primaryActionPayload ?? {}) as {
        actualFamilyId?: string;
        signatureRecommendation?: { paramName?: string; familyId?: string; reasoning?: string };
      };
      autoDiagnosis = {
        source: 'ai_investigation',
        suggestedFamily: payload.signatureRecommendation?.familyId ?? payload.actualFamilyId ?? null,
        reasoning: payload.signatureRecommendation?.reasoning ?? investigationVerdict.prose ?? null,
        matchingParam: payload.signatureRecommendation?.paramName ?? row.paramName,
        sourceFamily: row.dominantFamily,
        confidence: investigationVerdict.confidence,
        summary: investigationVerdict.recommendation?.summary ?? null,
        confirmedAt: new Date().toISOString(),
      };
    } else {
      // Neither source — nothing to flag against. Bail silently so the
      // button can't no-op without explanation; the UI shouldn't render
      // the button in this state but defend against the case anyway.
      return;
    }

    setFlagState((p) => ({ ...p, [row.paramName]: { busy: true, error: null } }));
    try {
      const res = await fetch(`/api/admin/atlas/unmapped-param-notes/${encodeURIComponent(row.paramName)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'wrong_family',
          // 'auto' when the registry caught it; 'engineer' when the AI
          // investigation surfaced it and the engineer accepted the verdict.
          // Lets the queue UI distinguish the two provenances on hover.
          flaggedBy: row.autoFlag ? 'auto' : 'engineer',
          autoDiagnosis,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `Confirm failed (${res.status})`);
      // Optimistic in-place update so the row visibly transforms (drops from
      // Open view, or flips to confirmed-flag UI on Auto-flagged view) without
      // a queue refetch. onRegenerateAffected([]) alone only bumps the Recent
      // Accepts panel — it doesn't touch the row's noteStatus.
      onRowFlagged?.(row.paramName, 'wrong_family', row.autoFlag ? 'auto' : 'engineer');
      // Record on the audit log that this confirm was the outcome of an
      // earlier AI investigation (if there was one). Fire-and-forget.
      void recordInvestigationAction(row, 'flagged_wrong_family');
      // Bump the Recent Accepts panel — the queue-row mutation is handled by
      // onRowFlagged above. No batch regen needed; flagging doesn't change
      // ingest output.
      await onRegenerateAffected([]);
      setFlagState((p) => ({ ...p, [row.paramName]: { busy: false, error: null } }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Confirm failed';
      setFlagState((p) => ({ ...p, [row.paramName]: { busy: false, error: msg } }));
    }
  }, [onRegenerateAffected, recordInvestigationAction, states, onRowFlagged]);

  const revertFlag = useCallback(async (row: GlobalUnmappedParam) => {
    setFlagState((p) => ({ ...p, [row.paramName]: { busy: true, error: null } }));
    try {
      const res = await fetch(`/api/admin/atlas/unmapped-param-notes/${encodeURIComponent(row.paramName)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // 'confirmed_in_family' suppresses the registry hit even when the
          // pattern keeps matching on next render — this is the per-paramName
          // override for the false-positive case.
          status: 'confirmed_in_family',
          flaggedBy: 'engineer',
          autoDiagnosis: row.autoFlag
            ? {
              suppressedRegistryHit: row.autoFlag,
              revertedAt: new Date().toISOString(),
            }
            : null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `Revert failed (${res.status})`);
      // Mirror of confirmFlag — optimistic update so the row's UI reflects
      // the new status without a queue refetch.
      onRowFlagged?.(row.paramName, 'confirmed_in_family', 'engineer');
      await onRegenerateAffected([]);
      setFlagState((p) => ({ ...p, [row.paramName]: { busy: false, error: null } }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Revert failed';
      setFlagState((p) => ({ ...p, [row.paramName]: { busy: false, error: msg } }));
    }
  }, [onRegenerateAffected, onRowFlagged]);

  // ─── Per-row Accept ────────────────────────────────────
  const acceptRow = useCallback(async (row: GlobalUnmappedParam): Promise<{ ok: boolean; error?: string }> => {
    const state = states[row.paramName];
    if (!state || state.accepted) return { ok: true };
    if (!state.editedAttributeId.trim() || !state.editedAttributeName.trim()) {
      return { ok: false, error: 'attributeId and attributeName required' };
    }
    // Override scope: L3 familyId wins; L2 category is the fallback for
    // products that don't live in any logic-table family (Microcontrollers,
    // Connectors, LEDs, etc.). atlas_dictionary_overrides.family_id stores
    // either string — the column is overloaded by design.
    const scope = getOverrideScope(row);
    if (!scope) {
      return { ok: false, error: 'No dominant family or category — pick one manually via Atlas Dictionaries panel' };
    }

    setStates((prev) => ({
      ...prev,
      [row.paramName]: { ...prev[row.paramName], accepting: true, acceptError: null },
    }));

    try {
      // Create dictionary override
      const res = await fetch('/api/admin/atlas/dictionaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          familyId: scope.key,
          paramName: row.paramName.toLowerCase(),
          action: 'add',
          attributeId: state.editedAttributeId.trim(),
          attributeName: state.editedAttributeName.trim(),
          unit: state.editedUnit.trim() || undefined,
          changeReason: `AI-assisted ingest triage (${scope.kind === 'category' ? `L2 category: ${scope.key}` : `L3 family: ${scope.key}`}, confidence: ${state.suggestion?.confidence ?? 'manual'})`,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `Save failed (${res.status})`);

      setStates((prev) => ({
        ...prev,
        [row.paramName]: { ...prev[row.paramName], accepted: true, accepting: false, acceptError: null },
      }));

      // Optimistic UI: hand the new override metadata to the parent so the
      // row can transform in-place to "Accepted + Revert" without waiting on
      // a queue refetch (which would invalidate the server cache and force
      // a 30s cold reload). Author display name defaults to "You" since the
      // current user just clicked Accept; the next real refresh resolves it
      // to their full name from atlas_manufacturers/profiles.
      if (onRowAccepted && json.data) {
        const d = json.data as {
          id: string;
          attributeId?: string;
          attributeName?: string;
          unit?: string;
          createdBy: string;
          createdAt: string;
          updatedAt: string;
          isActive: boolean;
        };
        onRowAccepted(row.paramName, {
          id: d.id,
          attributeId: d.attributeId ?? state.editedAttributeId.trim(),
          attributeName: d.attributeName ?? state.editedAttributeName.trim(),
          unit: d.unit ?? null,
          createdBy: d.createdBy,
          createdByName: 'You',
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
          isActive: d.isActive,
          wasEdited: false,
        });
        // If this Accept was the outcome of a deep-AI investigation,
        // close the audit loop: log the resulting override id on the
        // investigation row. Fire-and-forget — Accept already succeeded.
        void recordInvestigationAction(row, 'override_created', d.id);
      }
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Accept failed';
      setStates((prev) => ({
        ...prev,
        [row.paramName]: { ...prev[row.paramName], accepting: false, acceptError: msg },
      }));
      return { ok: false, error: msg };
    }
  }, [states, onRowAccepted, recordInvestigationAction]);

  /** Fire an override creation for one of the primary row's normalized
   *  matches using the SAME attributeId/Name/Unit the engineer just used
   *  on the primary. Fire-and-forget per match: a single failure must not
   *  roll back the primary accept, and the engineer can retry the failed
   *  match individually. Returns true on success so the caller can decide
   *  whether to optimistically flip the row to Accepted in local state. */
  const acceptMatchWithPrimaryOverride = useCallback(async (
    match: GlobalUnmappedParam,
    overrideValues: { attributeId: string; attributeName: string; unit: string },
    primaryParamName: string,
  ): Promise<boolean> => {
    const scope = getOverrideScope(match);
    if (!scope) return false;
    try {
      const res = await fetch('/api/admin/atlas/dictionaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          familyId: scope.key,
          paramName: match.paramName.toLowerCase(),
          action: 'add',
          attributeId: overrideValues.attributeId,
          attributeName: overrideValues.attributeName,
          unit: overrideValues.unit || undefined,
          // Audit trail: tag the override so it's discoverable later as a
          // bulk-applied match, with a pointer back to the primary row that
          // drove the engineer's intent.
          changeReason: `Bulk-applied with "${primaryParamName}" (normalized-match group, ${scope.kind === 'category' ? `L2: ${scope.key}` : `L3: ${scope.key}`})`,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) return false;
      if (json.data && onRowAccepted) {
        const d = json.data as {
          id: string;
          attributeId?: string;
          attributeName?: string;
          unit?: string;
          createdBy: string;
          createdAt: string;
          updatedAt: string;
          isActive: boolean;
        };
        onRowAccepted(match.paramName, {
          id: d.id,
          attributeId: d.attributeId ?? overrideValues.attributeId,
          attributeName: d.attributeName ?? overrideValues.attributeName,
          unit: d.unit ?? null,
          createdBy: d.createdBy,
          createdByName: 'You',
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
          isActive: d.isActive,
          wasEdited: false,
        });
        // Mark the match's local state so any in-flight RowState sees it
        // as accepted (the parent's onRowAccepted update covers the parent
        // queue, but this table also keeps per-row edit state).
        setStates((prev) => ({
          ...prev,
          [match.paramName]: {
            ...(prev[match.paramName] ?? {
              suggestion: null,
              loadingSuggestion: false,
              editedAttributeId: '',
              editedAttributeName: '',
              editedUnit: '',
              accepting: false,
              acceptError: null,
              deepAnalysis: null,
              loadingDeepAnalysis: false,
              deepAnalysisError: null,
            }),
            accepted: true,
            accepting: false,
            acceptError: null,
          } as RowState,
        }));
      }
      return true;
    } catch (err) {
      console.error('bulk match accept failed for', match.paramName, err);
      return false;
    }
  }, [onRowAccepted]);

  /** Chip surfaced next to the Accept button when a row has cosmetic-
   *  duplicate paramName variants in the same scope. Default state: chip
   *  is visible and on Accept the same override fires for every variant.
   *  Click the × to scope the accept to just the primary row. Click the
   *  smaller "just this row" chip (in opted-out state) to re-enable. */
  const renderBulkMatchChip = (r: GlobalUnmappedParam) => {
    const matches = normalizedMatchesByRow[r.paramName] ?? [];
    if (matches.length === 0) return null;
    const isOptedOut = bulkOptedOut.has(r.paramName);
    if (isOptedOut) {
      return (
        <Tooltip title="Bulk-apply disabled. Click to re-enable so the same override also maps the similar paramNames.">
          <Chip
            label="just this row"
            size="small"
            variant="outlined"
            onClick={() => setBulkOptedOut((prev) => {
              const next = new Set(prev);
              next.delete(r.paramName);
              return next;
            })}
            sx={{ fontSize: '0.6rem', height: 18, color: 'text.disabled', borderStyle: 'dashed' }}
          />
        </Tooltip>
      );
    }
    return (
      <Tooltip
        title={
          <Box sx={{ p: 0.5 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
              Accept will also map {matches.length} similar paramName{matches.length === 1 ? '' : 's'}:
            </Typography>
            {matches.slice(0, 6).map((m, i) => (
              <Typography key={i} variant="caption" sx={{ display: 'block', fontFamily: 'monospace', fontSize: '0.65rem' }}>
                · {m.paramName}
                {m.sampleValues.length > 0 && ` (e.g. ${m.sampleValues.slice(0, 3).join(', ')})`}
              </Typography>
            ))}
            {matches.length > 6 && (
              <Typography variant="caption" sx={{ display: 'block', fontSize: '0.65rem', fontStyle: 'italic' }}>
                …and {matches.length - 6} more
              </Typography>
            )}
            <Typography variant="caption" sx={{ display: 'block', mt: 0.5, fontStyle: 'italic', fontSize: '0.65rem' }}>
              Click × to apply to just this row.
            </Typography>
          </Box>
        }
      >
        <Chip
          label={`+${matches.length} similar`}
          size="small"
          color="info"
          variant="outlined"
          onDelete={() => setBulkOptedOut((prev) => {
            const next = new Set(prev);
            next.add(r.paramName);
            return next;
          })}
          sx={{ fontSize: '0.6rem', height: 18, '& .MuiChip-deleteIcon': { fontSize: 12 } }}
        />
      </Tooltip>
    );
  };

  const acceptAndRegenerate = useCallback(async (row: GlobalUnmappedParam) => {
    const result = await acceptRow(row);
    if (!result.ok) return;

    // Bulk-apply branch: if this row has normalized-match siblings AND the
    // engineer hasn't opted out via the chip's ×, fire the same override
    // for every sibling in parallel. The primary accept already succeeded
    // by this point, so any match failure is contained — the engineer can
    // retry that match's row individually.
    const matches = normalizedMatchesByRow[row.paramName] ?? [];
    const doBulk = matches.length > 0 && !bulkOptedOut.has(row.paramName);
    if (doBulk) {
      const primaryState = states[row.paramName];
      if (primaryState && primaryState.editedAttributeId.trim()) {
        const overrideValues = {
          attributeId: primaryState.editedAttributeId.trim(),
          attributeName: primaryState.editedAttributeName.trim(),
          unit: primaryState.editedUnit.trim(),
        };
        await Promise.all(
          matches.map((m) => acceptMatchWithPrimaryOverride(m, overrideValues, row.paramName)),
        );
        // Aggregate affected batches across the entire matched group so
        // every batch that surfaced any of the variants gets regenerated
        // in one pass — otherwise some batches would still show the
        // sibling paramName as unmapped until the engineer clicks again.
        const allBatchIds = new Set<string>(row.affectedBatchIds);
        for (const m of matches) {
          for (const b of m.affectedBatchIds) allBatchIds.add(b);
        }
        await onRegenerateAffected([...allBatchIds]);
        return;
      }
    }

    await onRegenerateAffected(row.affectedBatchIds);
  }, [acceptRow, onRegenerateAffected, normalizedMatchesByRow, bulkOptedOut, states, acceptMatchWithPrimaryOverride]);

  // Per-row deep investigation — fires only on explicit click. Returns one
  // of six action buckets with evidence + a concrete next-step. The result
  // is cached server-side (24h) AND client-side (localStorage, 7d) so
  // re-clicking is free. See /api/admin/atlas/dictionaries/investigate.
  const runInvestigate = useCallback(async (row: GlobalUnmappedParam) => {
    const scope = getOverrideScope(row);
    const scopeKey = scope?.key ?? null;
    // If a deep analysis is already on the row, this is a Refresh — bypass
    // the server's in-memory cache to pick up freshly-deployed code paths
    // (e.g. richer evidence fetches). Also clear the localStorage cache
    // here so the new result writes a fresh entry.
    const isRefresh = !!states[row.paramName]?.deepAnalysis;
    if (isRefresh && typeof window !== 'undefined') {
      try {
        const cacheKey = INVESTIGATE_LS_PREFIX + (scopeKey ?? '__none__') + '::' + row.paramName;
        localStorage.removeItem(cacheKey);
      } catch {
        // ignore
      }
    }
    setStates((prev) => ({
      ...prev,
      [row.paramName]: {
        ...(prev[row.paramName] ?? {}),
        loadingDeepAnalysis: true,
        deepAnalysisError: null,
      } as RowState,
    }));
    try {
      const res = await fetch('/api/admin/atlas/dictionaries/investigate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paramName: row.paramName,
          samples: row.sampleValues,
          familyId: scope?.kind === 'family' ? scope.key : null,
          dominantCategory: scope?.kind === 'category' ? scope.key : null,
          affectedManufacturerSlugs: row.affectedManufacturers.map((m) => m.slug),
          affectedBatchIds: row.affectedBatchIds,
          forceRefresh: isRefresh,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || json.detail || 'Investigation failed');
      }
      const analysis: DeepAnalysis = json.analysis;
      writeInvestigateCache(row.paramName, scopeKey, analysis);
      setStates((prev) => ({
        ...prev,
        [row.paramName]: {
          ...(prev[row.paramName] ?? {}),
          deepAnalysis: analysis,
          loadingDeepAnalysis: false,
          deepAnalysisError: null,
        } as RowState,
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Investigation failed';
      setStates((prev) => ({
        ...prev,
        [row.paramName]: {
          ...(prev[row.paramName] ?? {}),
          loadingDeepAnalysis: false,
          deepAnalysisError: msg,
        } as RowState,
      }));
    }
  }, [states]);

  // Apply a primary or alternative action from the deep-analysis card.
  // For new_canonical / unit_mismatch / disambiguation: prefills the row's
  // edited attributeId/Name/Unit so the engineer just clicks the regular
  // Accept button to commit. For wrong_family: delegates to confirmFlag.
  // For unmappable: persists status='unmappable' on the notes row.
  // For unscoped_products: no inline action (Phase 1 just surfaces the
  // diagnosis for the engineer to address upstream).
  const applyDeepAction = useCallback(async (
    row: GlobalUnmappedParam,
    payload: { attributeId?: string; attributeName?: string; unit?: string | null },
  ) => {
    setStates((prev) => ({
      ...prev,
      [row.paramName]: {
        ...(prev[row.paramName] ?? {}),
        editedAttributeId: payload.attributeId ?? prev[row.paramName]?.editedAttributeId ?? '',
        editedAttributeName: payload.attributeName ?? prev[row.paramName]?.editedAttributeName ?? '',
        editedUnit: payload.unit ?? prev[row.paramName]?.editedUnit ?? '',
      } as RowState,
    }));
  }, []);

  /** Toggle the engineer-bookmark flag on a row. Independent of `status`
   *  and `note` — purely a "I want to revisit this later" marker. PUT
   *  carries through any existing note/status so the upsert doesn't
   *  clobber them. Optimistic UI: we update notesByParam immediately
   *  and roll back on error. */
  const toggleFlag = useCallback(async (row: GlobalUnmappedParam, nextFlagged: boolean) => {
    const existing = notesByParam[row.paramName];
    // Build the optimistic NoteRecord that the parent will store. Use
    // the existing note/status/etc when present so we don't drop them.
    const optimistic: NoteRecord = {
      paramName: row.paramName,
      note: existing?.note ?? '',
      status: existing?.status ?? null,
      flaggedBy: existing?.flaggedBy ?? null,
      autoDiagnosis: existing?.autoDiagnosis ?? null,
      flagged: nextFlagged,
      updatedBy: existing?.updatedBy ?? '',
      updatedByName: 'You',
      updatedAt: new Date().toISOString(),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    // Toggling OFF when there's no other signal on the row → server will
    // delete the note row entirely. Reflect that locally too.
    const willDelete = !nextFlagged
      && !existing?.status
      && (!existing?.note || existing.note.trim().length === 0);
    onNoteChange(row.paramName, willDelete ? null : optimistic);
    try {
      const res = await fetch(`/api/admin/atlas/unmapped-param-notes/${encodeURIComponent(row.paramName)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note: existing?.note ?? '',
          status: existing?.status ?? null,
          flaggedBy: existing?.flaggedBy ?? null,
          autoDiagnosis: existing?.autoDiagnosis ?? null,
          flagged: nextFlagged,
        }),
      });
      const json = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok || !(json as { success?: boolean }).success) {
        // Roll back the optimistic update on error.
        onNoteChange(row.paramName, existing ?? null);
        return;
      }
      // Reconcile with server-returned record (carries real updatedBy/At).
      if ((json as { item?: NoteRecord }).item) {
        onNoteChange(row.paramName, (json as { item: NoteRecord }).item);
      } else if ((json as { deleted?: boolean }).deleted) {
        onNoteChange(row.paramName, null);
      }
    } catch {
      onNoteChange(row.paramName, existing ?? null);
    }
  }, [notesByParam, onNoteChange]);

  const markUnmappable = useCallback(async (row: GlobalUnmappedParam) => {
    try {
      const res = await fetch(`/api/admin/atlas/unmapped-param-notes/${encodeURIComponent(row.paramName)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'unmappable', flaggedBy: 'engineer' }),
      });
      const json = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok || !(json as { success?: boolean }).success) {
        throw new Error((json as { error?: string }).error || 'Failed to mark unmappable');
      }
      // The server returns the canonical row; propagate it up so the parent's
      // notesByParam stays in sync. Queue cache invalidate fires server-side.
      onNoteChange(row.paramName, (json as { item: NoteRecord }).item);
      // Close the AI audit loop. Fire-and-forget.
      void recordInvestigationAction(row, 'marked_unmappable');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to mark unmappable';
      setStates((prev) => ({
        ...prev,
        [row.paramName]: {
          ...(prev[row.paramName] ?? {}),
          deepAnalysisError: msg,
        } as RowState,
      }));
    }
  }, [onNoteChange, recordInvestigationAction, states]);

  // Per-row Revert — soft-deletes the override (sets is_active=false).
  // The DELETE endpoint preserves the audit row so the queue can show it
  // under the "Undone" status filter. After revert, also queue affected
  // batches for regen so their report metrics catch up to the change.
  const [revertingIds, setRevertingIds] = useState<Set<string>>(new Set());
  const revertOverride = useCallback(async (row: GlobalUnmappedParam) => {
    const ov = row.acceptedOverride;
    if (!ov || !ov.isActive) return;
    if (!confirm(`Revert override for "${row.paramName}"? The row returns to the Open queue and the override is deactivated. Reversible via the Atlas Dictionaries admin panel.`)) return;
    setRevertingIds((prev) => new Set(prev).add(ov.id));
    try {
      const res = await fetch(`/api/admin/atlas/dictionaries/${ov.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Revert failed');
      // Optimistic UI: parent flips the row's acceptedOverride.isActive=false
      // in-place so the chip changes from "Accepted" to "Undone" without a
      // queue refetch. Same motivation as the Accept optimistic path.
      onRowReverted?.(row.paramName);
      // Queue affected batches for the deferred regen flush so the batch
      // report metrics catch up. Same flow as Accept.
      await onRegenerateAffected(row.affectedBatchIds);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Revert failed';
      // Surface via state so the row shows the error briefly. Reuses the
      // acceptError slot (mutually exclusive UX states).
      setStates((prev) => ({
        ...prev,
        [row.paramName]: { ...(prev[row.paramName] ?? {}), acceptError: msg } as RowState,
      }));
    } finally {
      setRevertingIds((prev) => {
        const next = new Set(prev);
        next.delete(ov.id);
        return next;
      });
    }
  }, [onRegenerateAffected, onRowReverted]);

  // ─── Render ────────────────────────────────────────────
  // Title makes the cross-batch nature explicit. Singular vs plural depending on
  // pending count — when only one batch is pending, the global view is actually
  // just that batch's view.
  const scopeLabel = pendingBatchCount === 1
    ? 'across this pending batch'
    : `across ${pendingBatchCount} pending batches`;

  return (
    <Accordion
      expanded={expanded}
      onChange={(_, x) => setExpanded(x)}
      sx={{ mb: 2 }}
      // unmountOnExit drops the (potentially 200-row) table body from the DOM
      // while collapsed. Without this, MUI keeps it mounted hidden — fine for
      // small lists, but for large unmapped-params queues on the Triage page
      // the row tree alone (Tooltips, Chips, TextFields per row) takes seconds
      // to render even hidden, freezing the page on initial load.
      slotProps={{ transition: { unmountOnExit: true } }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        {/* Header is rendered as MUI's internal <button>; cannot contain a <Button>
            child or React will throw a nested-button hydration error. The bulk
            "Accept all" action lives inside AccordionDetails below instead. */}
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flex: 1 }}>
          <Typography sx={{ fontWeight: 600 }}>Unmapped parameters</Typography>
          <Typography variant="caption" color="text.secondary">
            {total} unique {scopeLabel} &middot; {totalParamMentions.toLocaleString()} total mentions
          </Typography>
          {fetchInFlight && (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ ml: 1 }}>
              <CircularProgress size={12} />
              <Typography variant="caption" color="text.secondary">
                AI suggestions {suggestionProgress!.done} / {suggestionProgress!.total}
              </Typography>
            </Stack>
          )}
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {allFlagged ? (
              <>
                These rows look like upstream <strong>misclassifications</strong> — the parameter name belongs to a different family.
                Click <strong>Confirm</strong> on the obvious ones to record the diagnosis, or <strong>Revert</strong> if it&apos;s a false positive
                (the registry will stop flagging that paramName).
              </>
            ) : (
              <>
                Each row can be enriched with an AI-suggested mapping + <strong>Accept</strong>/<strong>Defer</strong> suggestion
                (Claude Sonnet 4.6, schema-aware). Suggestions are <strong>not auto-generated on page load</strong> — click
                the Generate button below (or the per-row Generate link) to spend tokens only when you want them.
                Cached suggestions persist 7 days locally, 24h server-side. The suggestion is advisory — you decide.
              </>
            )}
          </Typography>
        </Stack>

        {/* Bulk Generate alert — surfaces only when there are uncached rows
            eligible for suggestion generation. Hidden during in-flight progress
            and when nothing is pending. Per-row Generate buttons (in the AI
            translation cell) are available alongside this for one-at-a-time
            usage. */}
        {!suggestionProgress && pendingSuggestionRows.length > 0 && !allFlagged && (
          <Alert
            severity="info"
            icon={<AutoAwesomeIcon fontSize="small" />}
            sx={{ my: 1, py: 0.5 }}
            action={
              <Button
                size="small"
                variant="contained"
                color="primary"
                onClick={generateAllPending}
                startIcon={<AutoAwesomeIcon sx={{ fontSize: 14 }} />}
              >
                Generate {pendingSuggestionRows.length}
              </Button>
            }
          >
            <Typography variant="body2">
              <strong>{pendingSuggestionRows.length}</strong> row{pendingSuggestionRows.length === 1 ? '' : 's'} need AI suggestions.
              Each row costs ~$0.005 in API tokens (Sonnet 4.6) — generate only when you&apos;re ready to triage.
            </Typography>
          </Alert>
        )}

        {suggestionProgress && (
          <Box sx={{ my: 1 }}>
            <LinearProgress variant="determinate" value={(suggestionProgress.done / suggestionProgress.total) * 100} />
            <Typography variant="caption" color="text.secondary">
              Generating AI suggestions: {suggestionProgress.done} / {suggestionProgress.total}
            </Typography>
          </Box>
        )}

        <TableContainer>
          {/* table-layout: fixed forces the browser to honor explicit column widths
              instead of auto-sizing to content. Without this, the longest cell text
              in each column wins regardless of the `width` props below — which is
              why earlier widths on body cells alone weren't taking effect. */}
          <Table size="small" sx={{ tableLayout: 'fixed' }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, width: 90 }}>UID</TableCell>
                <TableCell sx={{ fontWeight: 600, width: 40, padding: '6px 4px', textAlign: 'center' }} aria-label="Flag" />
                <TableCell sx={{ fontWeight: 600, width: 40, padding: '6px 4px' }} aria-label="Note" />
                <TableCell sx={{ fontWeight: 600, width: 140 }}>Raw Attribute Name</TableCell>
                <TableCell sx={{ fontWeight: 600, width: 70 }}>Family</TableCell>
                <TableCell sx={{ fontWeight: 600, width: 160 }}>Category</TableCell>
                <TableCell sx={{ fontWeight: 600, width: 180 }}>Sample values</TableCell>
                <TableCell sx={{ fontWeight: 600, width: 60 }}>Prods</TableCell>
                <TableCell sx={{ fontWeight: 600, width: 180 }}>AI translation</TableCell>
                <TableCell sx={{ fontWeight: 600, width: 300 }}>attributeId</TableCell>
                <TableCell sx={{ fontWeight: 600, width: 240 }}>attributeName</TableCell>
                <TableCell sx={{ fontWeight: 600, width: 90 }}>Unit</TableCell>
                <TableCell sx={{ fontWeight: 600, width: 90 }}>Suggestion</TableCell>
                <TableCell sx={{ fontWeight: 600, width: 100 }}>Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {visibleRows.map((r, rowIdx) => {
                const state = states[r.paramName];
                // Effective flag state per-row. autoFlag = live registry hit;
                // noteStatus='wrong_family' = persisted (auto-confirmed or
                // manually flagged). Either makes the row a "flagged" row
                // for UI purposes — Confirm / Revert actions take over the
                // synonym workflow's Accept button.
                const flagged = !!r.autoFlag || r.noteStatus === 'wrong_family';
                const flagBusy = flagState[r.paramName]?.busy ?? false;
                const flagError = flagState[r.paramName]?.error ?? null;
                const suggestedFam = r.autoFlag ? getFamilyDisplayName(r.autoFlag.suggestedFamily) : null;
                const confirmedFlag = r.noteStatus === 'wrong_family';
                return (
                  <Fragment key={`${r.paramName}::${r.dominantFamily ?? ''}::${r.dominantCategory ?? ''}::${r.acceptedOverride?.id ?? 'no-ov'}::${rowIdx}`}>
                  <TableRow
                    sx={{
                      // Three "done" states drop opacity:
                      //   - state.accepted (synonym mapping accepted)
                      //   - confirmedFlag (auto-flag confirmed by engineer)
                      // Both visually recede so unreviewed work is at eye level.
                      opacity: state?.accepted ? 0.5 : (confirmedFlag ? 0.55 : 1),
                      // Red left-border accent makes flagged rows scannable in
                      // the All view. Confirmed flags soften the border to
                      // grey so the eye still parses "flag", but the row no
                      // longer reads as needing attention.
                      borderLeft: flagged ? '3px solid' : undefined,
                      borderLeftColor: flagged
                        ? (confirmedFlag ? 'text.disabled' : 'error.main')
                        : undefined,
                    }}
                  >
                    <TableCell sx={{ width: 90, padding: '4px 8px' }}>
                      <Tooltip title={`Copy ${paramUid(r.paramName)} (paste into search to find this row again)`} placement="top">
                        <Chip
                          label={paramUid(r.paramName)}
                          size="small"
                          variant="outlined"
                          onClick={() => {
                            if (typeof navigator !== 'undefined' && navigator.clipboard) {
                              void navigator.clipboard.writeText(paramUid(r.paramName));
                            }
                          }}
                          sx={{
                            fontSize: '0.62rem',
                            height: 18,
                            fontFamily: 'monospace',
                            cursor: 'pointer',
                            '& .MuiChip-label': { px: 0.75 },
                          }}
                        />
                      </Tooltip>
                    </TableCell>
                    <TableCell sx={{ width: 40, padding: '4px 0', textAlign: 'center' }}>
                      {(() => {
                        const flagged = !!notesByParam[r.paramName]?.flagged;
                        return (
                          <Tooltip title={flagged ? 'Flagged for follow-up — click to unflag' : 'Flag for follow-up'}>
                            <IconButton
                              size="small"
                              onClick={() => toggleFlag(r, !flagged)}
                              sx={{ p: 0.25 }}
                            >
                              {flagged
                                ? <BookmarkAddedIcon sx={{ fontSize: 16, color: 'warning.light' }} />
                                : <BookmarkBorderIcon sx={{ fontSize: 16, color: 'text.disabled' }} />}
                            </IconButton>
                          </Tooltip>
                        );
                      })()}
                    </TableCell>
                    <TableCell sx={{ width: 40, padding: '4px 0', textAlign: 'center' }}>
                      <UnmappedParamNoteCell
                        paramName={r.paramName}
                        note={notesByParam[r.paramName]}
                        onChange={onNoteChange}
                        aiDraft={state?.suggestion?.suggestion === 'defer' ? state.suggestion.explanation : undefined}
                        aiDraftHint={state?.suggestion?.suggestion === 'defer'}
                      />
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.7rem', width: 140, wordBreak: 'break-word' }}>
                      {r.paramName}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.7rem' }}>
                      {flagged && r.autoFlag ? (
                        // Show "B1 → B6" transition with the flag icon — at-a-glance
                        // diagnosis without needing the tooltip.
                        <Tooltip title={`${r.dominantFamily ?? '?'} → ${r.autoFlag.suggestedFamily} ${suggestedFam ? `(${suggestedFam.short})` : ''} — see diagnosis`}>
                          <Stack direction="row" spacing={0.25} alignItems="center">
                            <FlagIcon sx={{ fontSize: 14, color: 'error.main' }} />
                            <Box component="span" sx={{ fontSize: '0.6rem', color: 'text.secondary' }}>{r.dominantFamily}</Box>
                            <Box component="span" sx={{ fontSize: '0.65rem', color: 'error.main', fontWeight: 700 }}>→</Box>
                            <Box component="span" sx={{ fontSize: '0.6rem', color: 'error.main', fontWeight: 700 }}>{r.autoFlag.suggestedFamily}</Box>
                          </Stack>
                        </Tooltip>
                      ) : flagged ? (
                        <Tooltip title="Manually flagged as wrong family">
                          <Chip size="small" icon={<FlagIcon sx={{ fontSize: 12 }} />} label={r.dominantFamily ?? '?'} sx={{ fontSize: '0.6rem', height: 18, bgcolor: 'error.dark', color: 'error.contrastText' }} />
                        </Tooltip>
                      ) : r.dominantFamily ? (
                        <Chip size="small" label={r.dominantFamily} variant="outlined" sx={{ fontSize: '0.6rem', height: 18 }} />
                      ) : r.dominantCategory ? (
                        // L2-only row (no logic-table family). Show "L2"
                        // marker so engineers see at a glance that this is
                        // category-scoped, not family-scoped — matters for
                        // people who mix the two views.
                        <Tooltip title={`L2 category: ${r.dominantCategory} (no logic-table family — override scoped to category)`}>
                          <Chip size="small" label="L2" variant="outlined" color="info" sx={{ fontSize: '0.6rem', height: 18 }} />
                        </Tooltip>
                      ) : (
                        <Tooltip title="No dominant family or category — manual selection required">
                          <Chip size="small" label="?" variant="outlined" color="warning" sx={{ fontSize: '0.6rem', height: 18 }} />
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
                      {(() => {
                        // For flagged rows, surface the suggested family's
                        // human-readable name so the engineer sees "Rectifier
                        // Diodes → BJTs" not just "B1 → B6".
                        const fromFam = getFamilyDisplayName(r.dominantFamily);
                        if (flagged && suggestedFam) {
                          return (
                            <Tooltip title={`${fromFam?.full ?? r.dominantFamily ?? '?'} → ${suggestedFam.full}`}>
                              <Stack direction="row" spacing={0.25} alignItems="center" sx={{ flexWrap: 'wrap' }}>
                                <Box component="span" sx={{ textDecoration: 'line-through', color: 'text.disabled' }}>{fromFam?.short ?? '?'}</Box>
                                <Box component="span" sx={{ color: 'error.light', fontWeight: 600 }}>→ {suggestedFam.short}</Box>
                              </Stack>
                            </Tooltip>
                          );
                        }
                        if (fromFam) {
                          return (
                            <Tooltip title={fromFam.full}>
                              <span>{fromFam.short}</span>
                            </Tooltip>
                          );
                        }
                        // No L3 family — fall through to L2 category if present.
                        // The category string is already human-readable (e.g.
                        // 'Microcontrollers'), so no helper resolution needed.
                        if (r.dominantCategory) {
                          return (
                            <Tooltip title={`L2 category — override will scope to "${r.dominantCategory}"`}>
                              <span>{r.dominantCategory}</span>
                            </Tooltip>
                          );
                        }
                        return <span style={{ color: 'rgba(255,255,255,0.3)' }}>—</span>;
                      })()}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.7rem', color: 'text.secondary', maxWidth: 180 }}>
                      {r.sampleValues.slice(0, 3).map((v) => (
                        <Box key={v} component="code" sx={{ bgcolor: 'action.hover', px: 0.5, mr: 0.5, borderRadius: 0.5, display: 'inline-block', mb: 0.25 }}>{v}</Box>
                      ))}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.7rem' }}>
                      {r.affectedManufacturers && r.affectedManufacturers.length > 0 ? (
                        <Tooltip
                          title={
                            <Box>
                              <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
                                {r.productCount} products across {r.affectedManufacturers.length} MFR{r.affectedManufacturers.length === 1 ? '' : 's'}:
                              </Typography>
                              {r.affectedManufacturers.slice(0, 12).map((m) => (
                                <Typography key={m.slug} variant="caption" sx={{ display: 'block' }}>
                                  • {m.name} ({m.productCount})
                                </Typography>
                              ))}
                              {r.affectedManufacturers.length > 12 && (
                                <Typography variant="caption" sx={{ display: 'block', fontStyle: 'italic' }}>
                                  +{r.affectedManufacturers.length - 12} more
                                </Typography>
                              )}
                            </Box>
                          }
                        >
                          <Box sx={{ cursor: 'help' }}>
                            <Box>{r.productCount}</Box>
                            <Box sx={{ fontSize: '0.6rem', color: 'text.secondary' }}>
                              {r.affectedManufacturers.length === 1
                                ? r.affectedManufacturers[0].name
                                : `${r.affectedManufacturers.length} MFRs`}
                            </Box>
                          </Box>
                        </Tooltip>
                      ) : (
                        r.productCount
                      )}
                    </TableCell>

                    <TableCell sx={{ fontSize: '0.7rem', maxWidth: 200 }}>
                      {flagged && r.autoFlag ? (
                        // Diagnosis card content — full reasoning visible at
                        // a glance, no expansion needed. Tooltip carries the
                        // matched param + source family for the audit story.
                        <Tooltip title={`Matched on "${r.autoFlag.matchingParam}" — see Confirm/Revert`}>
                          <Typography
                            variant="caption"
                            sx={{ display: 'block', color: 'error.light', lineHeight: 1.3 }}
                          >
                            {r.autoFlag.reasoning}
                          </Typography>
                        </Tooltip>
                      ) : flagged ? (
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
                          Manually flagged as wrong family
                        </Typography>
                      ) : state?.loadingSuggestion ? (
                        <CircularProgress size={12} />
                      ) : state?.suggestion?.translation ? (
                        <Stack spacing={0.5}>
                          <Tooltip title={state.suggestion.reasoning ?? ''}>
                            <Typography variant="caption" sx={{ fontStyle: 'italic' }}>
                              {state.suggestion.translation}
                            </Typography>
                          </Tooltip>
                          {state.suggestion.explanation && (
                            // Symmetric in-cell explanation — visible by default
                            // for BOTH Accept and Defer rows so Claude doesn't
                            // get an opaque "trust me" chip on Accepts. Color
                            // hints which suggestion the explanation supports;
                            // line-clamp at 3 keeps row height bounded, full
                            // text on tooltip hover.
                            <Tooltip title={<Box sx={{ whiteSpace: 'pre-wrap', maxWidth: 360 }}>{state.suggestion.explanation}</Box>} placement="left" arrow>
                              <Typography
                                variant="caption"
                                sx={{
                                  color: state.suggestion.suggestion === 'defer' ? 'warning.light' : 'success.light',
                                  fontSize: '0.65rem',
                                  lineHeight: 1.35,
                                  display: '-webkit-box',
                                  WebkitLineClamp: 3,
                                  WebkitBoxOrient: 'vertical',
                                  overflow: 'hidden',
                                  cursor: 'help',
                                }}
                              >
                                {state.suggestion.explanation}
                              </Typography>
                            </Tooltip>
                          )}
                        </Stack>
                      ) : (
                        // Uncached, non-loading row — offer per-row Generate as
                        // an alternative to the bulk button at top of table.
                        // Costs one Sonnet roundtrip; only fires on click.
                        <Tooltip title="Generate AI suggestion for this row only (~$0.005)" placement="right">
                          <Button
                            size="small"
                            variant="text"
                            color="primary"
                            startIcon={<AutoAwesomeIcon sx={{ fontSize: 12 }} />}
                            onClick={() => generateOne(r)}
                            sx={{ fontSize: '0.65rem', py: 0, px: 0.5, minWidth: 0, textTransform: 'none' }}
                          >
                            Generate
                          </Button>
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell sx={{ width: 300 }}>
                      {flagged ? (
                        <Box sx={{ fontSize: '0.7rem', color: 'text.disabled', fontStyle: 'italic' }}>
                          Don&apos;t map — investigate upstream
                        </Box>
                      ) : (() => {
                        const editedId = state?.editedAttributeId?.trim() ?? '';
                        const rowScope = getOverrideScope(r);
                        const familySchema = rowScope ? schemaByFamily[rowScope.key] : undefined;
                        const schemaKnown = !!familySchema && familySchema.size > 0;
                        const isCanonical = schemaKnown && editedId.length > 0 && familySchema!.has(editedId);
                        // Three states: canonical (green check), invented (amber warn),
                        // unknown-because-no-schema (no chip — we can't validate). The
                        // border on the input mirrors the chip color so it reads at a glance.
                        const borderColor = !editedId
                          ? undefined
                          : isCanonical
                            ? 'success.main'
                            : schemaKnown ? 'warning.main' : undefined;
                        return (
                          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ width: '100%' }}>
                            <TextField
                              size="small"
                              fullWidth
                              value={state?.editedAttributeId ?? ''}
                              onChange={(e) => setStates((prev) => ({
                                ...prev,
                                [r.paramName]: { ...prev[r.paramName], editedAttributeId: e.target.value },
                              }))}
                              disabled={state?.accepted || state?.accepting}
                              placeholder="—"
                              sx={{
                                '& .MuiInputBase-input': { fontSize: '0.7rem', fontFamily: 'monospace', py: 0.5 },
                                '& .MuiOutlinedInput-notchedOutline': borderColor ? { borderColor } : {},
                              }}
                            />
                            {editedId && schemaKnown && (
                              isCanonical ? (
                                <Tooltip title="Canonical: this attributeId has a rule in the family's logic table — matching engine will use it.">
                                  <VerifiedOutlinedIcon sx={{ fontSize: 16, color: 'success.main' }} />
                                </Tooltip>
                              ) : (
                                <Tooltip title="Invented: this attributeId is not in the family's logic table. The override will be saved and the value stored, but no matching rule will use it (display-only)." >
                                  <HelpOutlineOutlinedIcon sx={{ fontSize: 16, color: 'warning.main' }} />
                                </Tooltip>
                              )
                            )}
                          </Stack>
                        );
                      })()}
                    </TableCell>
                    <TableCell sx={{ width: 240 }}>
                      {flagged ? (
                        <Box sx={{ fontSize: '0.7rem', color: 'text.disabled' }}>—</Box>
                      ) : (
                        <TextField
                          size="small"
                          fullWidth
                          value={state?.editedAttributeName ?? ''}
                          onChange={(e) => setStates((prev) => ({
                            ...prev,
                            [r.paramName]: { ...prev[r.paramName], editedAttributeName: e.target.value },
                          }))}
                          disabled={state?.accepted || state?.accepting}
                          placeholder="—"
                          sx={{ '& .MuiInputBase-input': { fontSize: '0.7rem', py: 0.5 } }}
                        />
                      )}
                    </TableCell>
                    <TableCell sx={{ width: 90 }}>
                      {flagged ? (
                        <Box sx={{ fontSize: '0.7rem', color: 'text.disabled' }}>—</Box>
                      ) : (
                        <TextField
                          size="small"
                          fullWidth
                          value={state?.editedUnit ?? ''}
                          onChange={(e) => setStates((prev) => ({
                            ...prev,
                            [r.paramName]: { ...prev[r.paramName], editedUnit: e.target.value },
                          }))}
                          disabled={state?.accepted || state?.accepting}
                          placeholder="—"
                          sx={{ '& .MuiInputBase-input': { fontSize: '0.7rem', py: 0.5 } }}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      {flagged ? (
                        r.noteStatus === 'wrong_family' ? (
                          <Chip
                            size="small"
                            icon={<CheckIcon sx={{ fontSize: 12 }} />}
                            label="Confirmed"
                            sx={{ bgcolor: 'error.dark', color: 'error.contrastText', fontSize: '0.6rem', height: 18, fontWeight: 700 }}
                          />
                        ) : (
                          <Chip
                            size="small"
                            icon={<FlagIcon sx={{ fontSize: 12 }} />}
                            label="Wrong family"
                            sx={{ bgcolor: 'error.main', color: 'error.contrastText', fontSize: '0.6rem', height: 18 }}
                          />
                        )
                      ) : (() => {
                        // Suggestion chip — advisory only. When a deeper
                        // /investigate verdict exists, it SUPERSEDES the cheap
                        // /suggest chip — the investigator pulled richer
                        // context and produced a concrete action, so showing
                        // the original Defer alongside would look contradictory.
                        // Buckets map to: green Accept (mint flow), red Flag,
                        // grey Skip, amber Unscoped. No deep analysis → fall
                        // back to the cheap /suggest verdict.
                        const sug = state?.suggestion;
                        const deep = state?.deepAnalysis;

                        if (deep) {
                          const meta = (() => {
                            switch (deep.bucket) {
                              case 'new_canonical':
                              case 'unit_mismatch':
                              case 'disambiguation':
                                return { label: 'Accept', bg: 'success.dark', fg: 'success.contrastText', icon: <CheckIcon sx={{ fontSize: 12 }} /> };
                              case 'wrong_family':
                                return { label: 'Flag', bg: 'error.dark', fg: 'error.contrastText', icon: <FlagIcon sx={{ fontSize: 12 }} /> };
                              case 'unmappable':
                                return { label: 'Skip', bg: 'action.disabledBackground', fg: 'text.secondary', icon: <NoteAltOutlinedIcon sx={{ fontSize: 12 }} /> };
                              case 'unscoped_products':
                                return { label: 'Unscoped', bg: 'warning.dark', fg: 'warning.contrastText', icon: <NoteAltOutlinedIcon sx={{ fontSize: 12 }} /> };
                              default:
                                return { label: 'Review', bg: 'info.dark', fg: 'info.contrastText', icon: <NoteAltOutlinedIcon sx={{ fontSize: 12 }} /> };
                            }
                          })();
                          const tooltipBody = (
                            <Box sx={{ whiteSpace: 'pre-wrap', maxWidth: 360 }}>
                              <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
                                Resolved via deeper investigation · Confidence: {deep.confidence}
                              </Typography>
                              {deep.recommendation?.summary && (
                                <Typography variant="caption" sx={{ display: 'block' }}>
                                  {deep.recommendation.summary}
                                </Typography>
                              )}
                            </Box>
                          );
                          return (
                            <Tooltip title={tooltipBody} placement="left" arrow>
                              <Chip
                                size="small"
                                icon={meta.icon}
                                label={meta.label}
                                sx={{ bgcolor: meta.bg, color: meta.fg, fontSize: '0.6rem', height: 18, fontWeight: 600 }}
                              />
                            </Tooltip>
                          );
                        }

                        if (!sug?.suggestion) {
                          return <span style={{ color: 'rgba(255,255,255,0.3)' }}>—</span>;
                        }
                        const isAccept = sug.suggestion === 'accept';
                        const tooltipBody = (
                          <Box sx={{ whiteSpace: 'pre-wrap', maxWidth: 360 }}>
                            <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
                              Suggestion: {isAccept ? 'Accept' : 'Defer'} · Confidence: {sug.confidence}
                            </Typography>
                            {sug.explanation && (
                              <Typography variant="caption" sx={{ display: 'block' }}>
                                {sug.explanation}
                              </Typography>
                            )}
                          </Box>
                        );
                        return (
                          <Tooltip title={tooltipBody} placement="left" arrow>
                            <Chip
                              size="small"
                              icon={isAccept ? <CheckIcon sx={{ fontSize: 12 }} /> : <NoteAltOutlinedIcon sx={{ fontSize: 12 }} />}
                              label={isAccept ? 'Accept' : 'Defer'}
                              sx={{
                                bgcolor: isAccept ? 'success.dark' : 'warning.dark',
                                color: isAccept ? 'success.contrastText' : 'warning.contrastText',
                                fontSize: '0.6rem',
                                height: 18,
                                fontWeight: 600,
                              }}
                            />
                          </Tooltip>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      {/* Inline accept audit + revert. When this row already
                          has an active override, render Revert (instead of
                          Accept) and a chip showing who accepted + when. When
                          undone, show a "↺ Reverted" chip and re-enable
                          Accept. Takes precedence over the flagged-row UI
                          since accept supersedes flag (the engineer made a
                          decision). */}
                      {r.acceptedOverride && r.acceptedOverride.isActive ? (
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <Tooltip
                            title={`${r.acceptedOverride.wasEdited ? 'Edited' : 'Accepted'} by ${r.acceptedOverride.createdByName} · ${formatRelative(r.acceptedOverride.createdAt)}${r.orphaned ? ' · No longer in any pending batch' : ''}`}
                            placement="top"
                          >
                            <Chip
                              size="small"
                              icon={<CheckIcon sx={{ fontSize: 12 }} />}
                              label={r.orphaned ? 'Accepted (orphaned)' : 'Accepted'}
                              sx={{
                                bgcolor: r.orphaned ? 'warning.dark' : 'success.dark',
                                color: r.orphaned ? 'warning.contrastText' : 'success.contrastText',
                                fontSize: '0.6rem', height: 18,
                              }}
                            />
                          </Tooltip>
                          <Tooltip title="Revert: deactivates the override; row returns to the Open queue.">
                            <span>
                              <Button
                                size="small"
                                variant="outlined"
                                color="error"
                                disabled={revertingIds.has(r.acceptedOverride.id)}
                                onClick={() => revertOverride(r)}
                                startIcon={<UndoOutlinedIcon sx={{ fontSize: 12 }} />}
                                sx={{ fontSize: '0.6rem', minWidth: 0, px: 1, py: 0.25 }}
                              >
                                {revertingIds.has(r.acceptedOverride.id) ? <CircularProgress size={10} color="inherit" /> : 'Revert'}
                              </Button>
                            </span>
                          </Tooltip>
                        </Stack>
                      ) : r.acceptedOverride && !r.acceptedOverride.isActive ? (
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <Tooltip
                            title={`Reverted (originally accepted by ${r.acceptedOverride.createdByName} · ${formatRelative(r.acceptedOverride.createdAt)})`}
                            placement="top"
                          >
                            <Chip
                              size="small"
                              icon={<UndoOutlinedIcon sx={{ fontSize: 12 }} />}
                              label="Undone"
                              sx={{ bgcolor: 'action.disabledBackground', color: 'text.secondary', fontSize: '0.6rem', height: 18 }}
                            />
                          </Tooltip>
                          {!r.orphaned && (
                            <Tooltip title={state?.acceptError ?? 'Re-accept this row to restore a fresh override.'} disableHoverListener={!state?.acceptError}>
                              <span>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  color={state?.acceptError ? 'error' : 'primary'}
                                  disabled={state?.accepting || state?.loadingSuggestion || !state?.editedAttributeId || !getOverrideScope(r)}
                                  onClick={() => acceptAndRegenerate(r)}
                                  sx={{ fontSize: '0.65rem', minWidth: 80 }}
                                >
                                  {state?.accepting ? <CircularProgress size={12} /> : 'Re-accept'}
                                </Button>
                              </span>
                            </Tooltip>
                          )}
                          {renderBulkMatchChip(r)}
                        </Stack>
                      ) : flagged ? (
                        // Confirm + Revert. After Confirm the persisted status
                        // is 'wrong_family' so the "Confirm" button hides; only
                        // Revert remains so the engineer can undo if it turns
                        // out to be a false positive.
                        <Stack direction="row" spacing={0.5}>
                          {r.noteStatus !== 'wrong_family' && r.autoFlag && (
                            <Tooltip title={flagError ?? 'Confirm this row as a misclassification — products with this param need upstream investigation.'}>
                              <span>
                                <Button
                                  size="small"
                                  variant="contained"
                                  color="error"
                                  disabled={flagBusy}
                                  onClick={() => confirmFlag(r)}
                                  sx={{ fontSize: '0.6rem', minWidth: 0, px: 1, py: 0.25 }}
                                >
                                  {flagBusy ? <CircularProgress size={10} color="inherit" /> : 'Confirm'}
                                </Button>
                              </span>
                            </Tooltip>
                          )}
                          <Tooltip title={r.noteStatus === 'wrong_family' ? 'Undo the wrong-family flag.' : 'False positive — suppress the auto-flag for this paramName.'}>
                            <span>
                              <Button
                                size="small"
                                variant="outlined"
                                color="inherit"
                                disabled={flagBusy}
                                onClick={() => revertFlag(r)}
                                startIcon={<UndoOutlinedIcon sx={{ fontSize: 12 }} />}
                                sx={{ fontSize: '0.6rem', minWidth: 0, px: 1, py: 0.25 }}
                              >
                                {flagBusy && r.noteStatus === 'wrong_family' ? <CircularProgress size={10} color="inherit" /> : 'Revert'}
                              </Button>
                            </span>
                          </Tooltip>
                        </Stack>
                      ) : state?.accepted ? (
                        <Chip size="small" icon={<CheckIcon sx={{ fontSize: 14 }} />} label="Saved" color="success" sx={{ fontSize: '0.6rem', height: 18 }} />
                      ) : (
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <Tooltip title={state?.acceptError ?? ''} disableHoverListener={!state?.acceptError}>
                            <span>
                              <Button
                                size="small"
                                variant="outlined"
                                color={state?.acceptError ? 'error' : 'primary'}
                                disabled={state?.accepting || state?.loadingSuggestion || !state?.editedAttributeId || !getOverrideScope(r)}
                                onClick={() => acceptAndRegenerate(r)}
                                sx={{ fontSize: '0.65rem', minWidth: 80 }}
                              >
                                {state?.accepting ? <CircularProgress size={12} /> : 'Accept'}
                              </Button>
                            </span>
                          </Tooltip>
                          {renderBulkMatchChip(r)}
                          {/* Investigate button. Visible when the row is either
                              unscoped (Accept grayed) or the AI verdict was
                              defer (Accept would be unsafe). Fires the deeper
                              /investigate pass which returns a bucketed action
                              with evidence. Hidden on confident-accept rows
                              where the engineer just needs to click Accept. */}
                          {(!getOverrideScope(r) || state?.suggestion?.suggestion === 'defer') && (
                            <Tooltip title={state?.deepAnalysisError ?? 'Investigate: AI runs a deeper analysis pulling affected products, cross-scope overrides, and proposes a concrete next action.'}>
                              <span>
                                <Button
                                  size="small"
                                  variant="text"
                                  color={state?.deepAnalysisError ? 'error' : 'secondary'}
                                  disabled={state?.loadingDeepAnalysis}
                                  onClick={() => runInvestigate(r)}
                                  startIcon={state?.loadingDeepAnalysis ? <CircularProgress size={10} color="inherit" /> : <SearchIcon sx={{ fontSize: 14 }} />}
                                  sx={{ fontSize: '0.6rem', minWidth: 0, px: 0.5 }}
                                >
                                  {state?.deepAnalysis ? 'Refresh' : 'Investigate'}
                                </Button>
                              </span>
                            </Tooltip>
                          )}
                        </Stack>
                      )}
                    </TableCell>
                  </TableRow>
                  {state?.deepAnalysis && (
                    <DeepAnalysisRow
                      row={r}
                      analysis={state.deepAnalysis}
                      onApplyPrefill={(payload) => applyDeepAction(r, payload)}
                      onConfirmWrongFamily={() => confirmFlag(r)}
                      onMarkUnmappable={() => markUnmappable(r)}
                    />
                  )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Pagination footer — shown when there are more rows than the
            current visible window. Renders the first INITIAL_VISIBLE_ROWS
            up front to avoid freezing the browser on 400+ row mount;
            subsequent batches are opt-in. */}
        {hiddenCount > 0 && (
          <Stack direction="row" spacing={2} alignItems="center" justifyContent="center" sx={{ mt: 2, py: 1.5, borderTop: 1, borderColor: 'divider' }}>
            <Typography variant="caption" color="text.secondary">
              {pendingShowMore ? 'Loading more rows…' : `Showing ${visibleRows.length} of ${rows.length} rows`}
            </Typography>
            <Button
              size="small"
              variant="outlined"
              disabled={pendingShowMore}
              startIcon={pendingShowMore ? <CircularProgress size={12} color="inherit" /> : undefined}
              onClick={() => startShowMore(() => setVisibleCount((n) => n + ROW_BATCH_SIZE))}
            >
              Show {Math.min(ROW_BATCH_SIZE, hiddenCount)} more
            </Button>
            {/* "Show all" intentionally removed — for queues with hundreds
                of rows it triggered browser unresponsiveness. Use the
                page-level filters (search, MFR, family, min-prods) to
                narrow the visible set instead. */}
          </Stack>
        )}
      </AccordionDetails>
    </Accordion>
  );
}

// ─── Deep Analysis subrow ──────────────────────────────────────────
// Renders below the main row when state.deepAnalysis is set. Surfaces
// the AI's bucket verdict, evidence, and bucket-specific action buttons.
// The buttons wire to the parent's handlers: prefill (Accept-flow),
// confirmFlag (wrong_family), markUnmappable (unmappable).
//
// Unscoped / new_canonical / unit_mismatch / disambiguation actions all
// flow through "prefill the row's editedAttributeId/Name/Unit then
// engineer clicks the regular Accept button." Keeping the commit path
// uniform avoids a second Accept code path that could drift from the
// authoritative one.

interface DeepAnalysisRowProps {
  row: GlobalUnmappedParam;
  analysis: DeepAnalysis;
  onApplyPrefill: (payload: { attributeId?: string; attributeName?: string; unit?: string | null }) => void;
  onConfirmWrongFamily: () => void;
  onMarkUnmappable: () => void;
}

const BUCKET_LABELS: Record<DeepAnalysis['bucket'], { label: string; color: 'primary' | 'warning' | 'error' | 'info' | 'success' }> = {
  new_canonical: { label: 'New canonical', color: 'primary' },
  disambiguation: { label: 'Disambiguation', color: 'info' },
  wrong_family: { label: 'Wrong family', color: 'error' },
  unit_mismatch: { label: 'Unit mismatch', color: 'warning' },
  unscoped_products: { label: 'Unscoped products', color: 'warning' },
  unmappable: { label: 'Unmappable', color: 'error' },
};

function DeepAnalysisRow({ row, analysis, onApplyPrefill, onConfirmWrongFamily, onMarkUnmappable }: DeepAnalysisRowProps) {
  const bucketMeta = BUCKET_LABELS[analysis.bucket];
  // Narrow the unknown payload to a discriminated shape per bucket up front
  // so JSX renders don't trip TS's ReactNode constraint on `unknown` values.
  const payloadRaw = (analysis.recommendation?.primaryActionPayload ?? {}) as Record<string, unknown>;
  const altPayloadRaw = (analysis.recommendation?.alternativeActionPayload ?? {}) as Record<string, unknown>;
  const perProductProposals: Array<{ mpn: string; proposedFamilyId: string; reasoning: string }> | null =
    Array.isArray(payloadRaw.perProductProposals)
      ? (payloadRaw.perProductProposals as Array<{ mpn: string; proposedFamilyId: string; reasoning: string }>)
      : null;
  const signatureRecommendation: { paramName?: string; familyId?: string; reasoning?: string } | null =
    payloadRaw.signatureRecommendation && typeof payloadRaw.signatureRecommendation === 'object'
      ? (payloadRaw.signatureRecommendation as { paramName?: string; familyId?: string; reasoning?: string })
      : null;
  const payload = payloadRaw;
  const altPayload = altPayloadRaw;

  // Extract the canonical name shown in the button LABEL — this is what the
  // engineer is being shown they'll get. Sonnet occasionally writes a more
  // specific ID into the label ("Mint canonical width_mm") than into the
  // payload ("attributeId": "width"); the user's expectation is set by the
  // visible label, so it takes precedence over the payload.
  function attributeIdFromLabel(): string | undefined {
    const label = analysis.recommendation?.primaryActionLabel ?? '';
    const m = label.match(/canonical\s+`?([a-z][a-z0-9_]*)`?/i);
    return m && m[1] ? m[1] : undefined;
  }

  // Permissive key extraction — Sonnet sometimes returns slightly different
  // payload shapes (snake_case, nested under 'canonical', etc) despite the
  // prompt asking for a specific shape. For new_canonical / unit_mismatch we
  // PREFER the label parse over the payload because the label is the user's
  // contract with the button; for disambiguation/etc the payload is canonical.
  function pickAttributeId(p: Record<string, unknown>): string | undefined {
    const fromLabel = (analysis.bucket === 'new_canonical' || analysis.bucket === 'unit_mismatch')
      ? attributeIdFromLabel()
      : undefined;
    if (fromLabel) return fromLabel;
    const direct = p.attributeId ?? p.newAttributeId ?? p.attribute_id ?? p.new_attribute_id;
    if (typeof direct === 'string' && direct.trim()) return direct.trim();
    const nested = p.canonical as Record<string, unknown> | undefined;
    if (nested && typeof nested === 'object') {
      const nestedId = nested.attributeId ?? nested.attribute_id;
      if (typeof nestedId === 'string' && nestedId.trim()) return nestedId.trim();
    }
    return undefined;
  }
  function pickAttributeName(p: Record<string, unknown>): string | undefined {
    const v = p.attributeName ?? p.newAttributeName ?? p.attribute_name ?? p.new_attribute_name;
    if (typeof v === 'string' && v.trim()) return v.trim();
    const nested = p.canonical as Record<string, unknown> | undefined;
    if (nested && typeof nested === 'object') {
      const nestedName = nested.attributeName ?? nested.attribute_name;
      if (typeof nestedName === 'string' && nestedName.trim()) return nestedName.trim();
    }
    return undefined;
  }
  function pickUnit(p: Record<string, unknown>): string | null | undefined {
    const v = p.unit ?? p.newUnit ?? p.new_unit;
    if (v === null) return null;
    if (typeof v === 'string') return v.trim() || null;
    return undefined;
  }

  // Per-bucket action handler — translates the AI's payload shape to a
  // concrete prefill / confirm / mark call.
  const handlePrimary = () => {
    switch (analysis.bucket) {
      case 'new_canonical':
      case 'unit_mismatch': {
        onApplyPrefill({
          attributeId: pickAttributeId(payload),
          attributeName: pickAttributeName(payload),
          unit: pickUnit(payload),
        });
        break;
      }
      case 'disambiguation': {
        const primary = (payload.primary as Record<string, unknown> | undefined) ?? {};
        onApplyPrefill({
          attributeId: pickAttributeId(primary),
          attributeName: pickAttributeName(primary),
          unit: pickUnit(primary),
        });
        break;
      }
      case 'wrong_family':
        onConfirmWrongFamily();
        break;
      case 'unmappable':
        onMarkUnmappable();
        break;
      // unscoped_products: no inline commit. Engineer addresses upstream.
    }
  };

  const handleAlternative = () => {
    if (analysis.bucket !== 'disambiguation') return;
    const altSource = (altPayload.alternative as Record<string, unknown> | undefined) ?? altPayload;
    onApplyPrefill({
      attributeId: pickAttributeId(altSource),
      attributeName: pickAttributeName(altSource),
      unit: pickUnit(altSource),
    });
  };

  return (
    <TableRow sx={{ bgcolor: 'action.hover' }}>
      <TableCell colSpan={14} sx={{ py: 1.5, px: 2, borderBottom: '2px solid', borderBottomColor: 'divider' }}>
        <Stack spacing={1.2}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip
              size="small"
              icon={<AutoAwesomeIcon sx={{ fontSize: 12 }} />}
              label={`AI verdict: ${bucketMeta.label}`}
              color={bucketMeta.color}
              sx={{ fontSize: '0.65rem', height: 20, fontWeight: 700 }}
            />
            <Chip
              size="small"
              label={`Confidence: ${analysis.confidence}`}
              variant="outlined"
              sx={{ fontSize: '0.6rem', height: 20 }}
            />
          </Stack>

          {analysis.recommendation?.summary && (
            <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
              {analysis.recommendation.summary}
            </Typography>
          )}

          {analysis.prose && (
            <Typography variant="body2" sx={{ fontSize: '0.75rem', color: 'text.secondary', fontStyle: 'italic' }}>
              {analysis.prose}
            </Typography>
          )}

          {/* Diagnostic line when affected-products lookup failed to find
              anything. Common causes: MFR name didn't resolve, products
              don't carry that paramName in JSONB, scope too narrow. The line
              tells the engineer exactly what went wrong so we can fix the
              pipeline instead of guessing. */}
          {analysis.evidence?.sampleProducts && analysis.evidence.sampleProducts.length === 0 && analysis.evidence?.sampleProductsDiag && (
            <Box sx={{ p: 1, bgcolor: 'warning.dark', color: 'warning.contrastText', borderRadius: 1 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
                No affected products found — diagnostic:
              </Typography>
              <Typography variant="caption" sx={{ display: 'block', fontFamily: 'monospace', fontSize: '0.65rem' }}>
                MFR slugs requested: {analysis.evidence.sampleProductsDiag.mfrSlugsRequested}
                {' · '}
                Name variants resolved: {analysis.evidence.sampleProductsDiag.nameVariantsResolved}
                {analysis.evidence.sampleProductsDiag.nameVariantsList.length > 0 &&
                  ` (${analysis.evidence.sampleProductsDiag.nameVariantsList.slice(0, 8).join(', ')}${analysis.evidence.sampleProductsDiag.nameVariantsList.length > 8 ? '…' : ''})`}
              </Typography>
              <Typography variant="caption" sx={{ display: 'block', fontFamily: 'monospace', fontSize: '0.65rem' }}>
                Applied tier — scanned: {analysis.evidence.sampleProductsDiag.productsScanned}
                {' · '}
                carrying this paramName: {analysis.evidence.sampleProductsDiag.productsCarryingParam}
              </Typography>
              {(analysis.evidence.sampleProductsDiag.pendingBatchesScanned ?? 0) > 0 && (
                <Typography variant="caption" sx={{ display: 'block', fontFamily: 'monospace', fontSize: '0.65rem' }}>
                  Pending tier — batches scanned: {analysis.evidence.sampleProductsDiag.pendingBatchesScanned}
                  {' · '}
                  products matched from source files: {analysis.evidence.sampleProductsDiag.pendingCount ?? 0}
                </Typography>
              )}
              {analysis.evidence.sampleProductsDiag.sampleKeysObserved && analysis.evidence.sampleProductsDiag.sampleKeysObserved.length > 0 && (
                <Typography variant="caption" sx={{ display: 'block', fontFamily: 'monospace', fontSize: '0.65rem', mt: 0.5 }}>
                  Actual JSONB keys seen in scanned products: {analysis.evidence.sampleProductsDiag.sampleKeysObserved.slice(0, 15).join(' | ')}
                  {analysis.evidence.sampleProductsDiag.sampleKeysObserved.length > 15 ? '…' : ''}
                </Typography>
              )}
            </Box>
          )}

          {/* Evidence: sample products, cross-scope, sample value distribution.
              Each product's MPN becomes a datasheet link when atlas_products
              has a datasheet_url — the AI's prose often says "check the
              datasheet" and the engineer should be able to do so in one click. */}
          {analysis.evidence?.sampleProducts && analysis.evidence.sampleProducts.length > 0 && (() => {
            const products = analysis.evidence.sampleProducts;
            const appliedN = products.filter((p) => p.origin === 'applied').length;
            const pendingN = products.filter((p) => p.origin === 'pending').length;
            const breakdownBits: string[] = [];
            if (appliedN > 0) breakdownBits.push(`${appliedN} applied`);
            if (pendingN > 0) breakdownBits.push(`${pendingN} pending`);
            const breakdown = breakdownBits.length > 0 ? ` — ${breakdownBits.join(' · ')}` : '';
            return (
              <Box>
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.5 }}>
                  Affected products ({products.length}{breakdown}):
                </Typography>
                <Stack spacing={0.25}>
                  {products.map((p, i) => {
                    // 'pending' means the source batch hasn't been applied yet —
                    // values come from raw JSON, not atlas_products. Engineer
                    // should verify against the linked datasheet rather than
                    // assuming the value is canonical.
                    const isPending = p.origin === 'pending';
                    return (
                      <Box key={i} sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
                        {p.origin && (
                          <Tooltip
                            title={
                              isPending
                                ? 'Pending: from the uploaded source file (batch not yet applied to atlas_products)'
                                : 'Applied: live in atlas_products'
                            }
                          >
                            <Chip
                              label={isPending ? 'pending' : 'applied'}
                              size="small"
                              color={isPending ? 'warning' : 'success'}
                              variant="outlined"
                              sx={{ height: 16, fontSize: '0.6rem', '& .MuiChip-label': { px: 0.5 } }}
                            />
                          </Tooltip>
                        )}
                        <Typography variant="caption" sx={{ fontSize: '0.7rem', fontFamily: 'monospace' }}>
                          {p.datasheetUrl ? (
                            <Tooltip title="Open datasheet in new tab">
                              <Box
                                component="a"
                                href={p.datasheetUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                sx={{
                                  fontWeight: 700,
                                  color: 'primary.light',
                                  textDecoration: 'none',
                                  '&:hover': { textDecoration: 'underline' },
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 0.25,
                                }}
                              >
                                {p.manufacturer} {p.mpn}
                                <OpenInNewIcon sx={{ fontSize: 10 }} />
                              </Box>
                            </Tooltip>
                          ) : (
                            <Box component="span" sx={{ fontWeight: 700 }}>{p.manufacturer} {p.mpn}</Box>
                          )}
                          {p.description ? ` — ${p.description}` : ''}
                          {p.valueForParam ? ` (value: ${p.valueForParam})` : ''}
                        </Typography>
                      </Box>
                    );
                  })}
                </Stack>
              </Box>
            );
          })()}

          {analysis.evidence?.crossScopeOverrides && analysis.evidence.crossScopeOverrides.length > 0 && (
            <Box>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.5 }}>
                Cross-scope override hits (same paramName accepted in other families):
              </Typography>
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                {analysis.evidence.crossScopeOverrides.map((c, i) => (
                  <Chip
                    key={i}
                    size="small"
                    label={`${c.familyId} → ${c.attributeId}`}
                    variant="outlined"
                    sx={{ fontSize: '0.65rem', height: 18, fontFamily: 'monospace' }}
                  />
                ))}
              </Stack>
            </Box>
          )}

          {/* unscoped_products: render per-product proposals inline */}
          {analysis.bucket === 'unscoped_products' && perProductProposals && (
            <Box>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.5 }}>
                Per-product family proposals (engineer addresses upstream):
              </Typography>
              <Stack spacing={0.25}>
                {perProductProposals.map((p, i) => (
                  <Typography key={i} variant="caption" sx={{ fontSize: '0.7rem' }}>
                    <Box component="span" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{p.mpn}</Box>
                    {' → '}
                    <Box component="span" sx={{ fontFamily: 'monospace', color: 'primary.main' }}>{p.proposedFamilyId}</Box>
                    {p.reasoning ? ` (${p.reasoning})` : ''}
                  </Typography>
                ))}
              </Stack>
            </Box>
          )}

          {/* wrong_family: surface the signature recommendation */}
          {analysis.bucket === 'wrong_family' && signatureRecommendation && (
            <Box sx={{ p: 1, bgcolor: 'background.default', border: 1, borderColor: 'divider', borderRadius: 1 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.5 }}>
                Suggested FAMILY_PARAM_SIGNATURES entry (engineer adds to atlasFamilyParamSignatures.ts):
              </Typography>
              <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>
                {JSON.stringify(signatureRecommendation)}
              </Typography>
            </Box>
          )}

          {/* Action buttons */}
          <Stack direction="row" spacing={1}>
            {analysis.recommendation?.primaryActionLabel && analysis.bucket !== 'unscoped_products' && (
              <Button
                size="small"
                variant="contained"
                color={analysis.bucket === 'unmappable' ? 'error' : analysis.bucket === 'wrong_family' ? 'error' : 'primary'}
                startIcon={analysis.bucket === 'unmappable' ? <BlockOutlinedIcon sx={{ fontSize: 14 }} /> : <CheckIcon sx={{ fontSize: 14 }} />}
                onClick={handlePrimary}
                sx={{ fontSize: '0.7rem' }}
              >
                {analysis.recommendation.primaryActionLabel}
              </Button>
            )}
            {analysis.bucket === 'disambiguation' && analysis.recommendation?.alternativeActionLabel && (
              <Button
                size="small"
                variant="outlined"
                color="primary"
                startIcon={<CheckIcon sx={{ fontSize: 14 }} />}
                onClick={handleAlternative}
                sx={{ fontSize: '0.7rem' }}
              >
                {analysis.recommendation.alternativeActionLabel}
              </Button>
            )}
            {/* Acknowledge param row.paramName so unused-prop lint stays quiet
                and the row identity is queryable from devtools. */}
            <Typography variant="caption" sx={{ color: 'text.disabled', alignSelf: 'center' }}>
              paramName: {row.paramName}
            </Typography>
          </Stack>
        </Stack>
      </TableCell>
    </TableRow>
  );
}
