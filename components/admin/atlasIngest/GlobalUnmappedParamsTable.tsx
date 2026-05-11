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

import { useCallback, useEffect, useState, useMemo, useRef, useTransition } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
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
import UndoOutlinedIcon from '@mui/icons-material/UndoOutlined';
import NoteAltOutlinedIcon from '@mui/icons-material/NoteAltOutlined';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import type { GlobalUnmappedParam, DictSuggestion } from './types';
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

export default function GlobalUnmappedParamsTable({ rows, onRegenerateAffected, pendingBatchCount, notesByParam, onNoteChange, onRowAccepted, onRowReverted }: Props) {
  // Default expanded so users see the AI-triage flow without an extra click —
  // this is the most-used panel of the page when there are unmapped params.
  const [expanded, setExpanded] = useState(true);
  const [states, setStates] = useState<Record<string, RowState>>({});
  const [suggestionProgress, setSuggestionProgress] = useState<{ done: number; total: number } | null>(null);
  const fetchedRef = useRef(false);
  // Per-family canonical attributeId set, populated from the suggest endpoint.
  // Used to flag whether the row's (possibly edited) attributeId actually
  // exists in the family's logic table. Empty set ⇒ family had no schema info.
  const [schemaByFamily, setSchemaByFamily] = useState<Record<string, Set<string>>>({});
  // How many rows to actually render. Bumped by the "Show more" button.
  // Resets when the rows prop changes (filters narrowed the set).
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_ROWS);
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
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    const initialStates: Record<string, RowState> = {};
    const initialSchemaByFamily: Record<string, Set<string>> = {};
    const seenFamilies = new Set<string>();
    const familiesNeedingSchema = new Set<string>();
    for (const row of rows) {
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
        };
        continue;
      }
      const cached = readSuggestionCache(row.paramName, scopeKey);
      if (cached) {
        initialStates[row.paramName] = {
          suggestion: cached,
          loadingSuggestion: false,
          editedAttributeId: cached.suggestedAttributeId ?? '',
          editedAttributeName: cached.suggestedAttributeName ?? '',
          editedUnit: cached.suggestedUnit ?? '',
          accepted: false,
          acceptError: null,
          accepting: false,
        };
      } else {
        // Uncached — render a "Generate" button instead of auto-fetching.
        initialStates[row.paramName] = {
          suggestion: null,
          loadingSuggestion: false,
          editedAttributeId: '',
          editedAttributeName: '',
          editedUnit: '',
          accepted: false,
          acceptError: null,
          accepting: false,
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
    if (expanded && !fetchedRef.current && rows.length > 0) {
      hydrateFromCache();
    }
  }, [expanded, rows.length, hydrateFromCache]);

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

  const confirmFlag = useCallback(async (row: GlobalUnmappedParam) => {
    if (!row.autoFlag) return;
    setFlagState((p) => ({ ...p, [row.paramName]: { busy: true, error: null } }));
    try {
      const res = await fetch(`/api/admin/atlas/unmapped-param-notes/${encodeURIComponent(row.paramName)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'wrong_family',
          flaggedBy: 'auto',
          // Snapshot the registry hit at flag time so the audit record
          // survives later registry edits / removals.
          autoDiagnosis: {
            suggestedFamily: row.autoFlag.suggestedFamily,
            reasoning: row.autoFlag.reasoning,
            matchingParam: row.autoFlag.matchingParam,
            sourceFamily: row.dominantFamily,
            confirmedAt: new Date().toISOString(),
          },
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `Confirm failed (${res.status})`);
      // Refresh the queue so the row's persisted state is reflected (the
      // route's classifier reads atlas_unmapped_param_notes on every fetch).
      // No batches need regenerating — flagging doesn't change ingest output.
      await onRegenerateAffected([]);
      setFlagState((p) => ({ ...p, [row.paramName]: { busy: false, error: null } }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Confirm failed';
      setFlagState((p) => ({ ...p, [row.paramName]: { busy: false, error: msg } }));
    }
  }, [onRegenerateAffected]);

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
      await onRegenerateAffected([]);
      setFlagState((p) => ({ ...p, [row.paramName]: { busy: false, error: null } }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Revert failed';
      setFlagState((p) => ({ ...p, [row.paramName]: { busy: false, error: msg } }));
    }
  }, [onRegenerateAffected]);

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
  }, [states, onRowAccepted]);

  const acceptAndRegenerate = useCallback(async (row: GlobalUnmappedParam) => {
    const result = await acceptRow(row);
    if (result.ok) {
      await onRegenerateAffected(row.affectedBatchIds);
    }
  }, [acceptRow, onRegenerateAffected]);

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
              {visibleRows.map((r) => {
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
                  <TableRow
                    key={r.paramName}
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
                        // Suggestion chip — advisory only. The user always
                        // decides via the Accept button or note popover; this
                        // chip just surfaces Sonnet 4.6's read on whether the
                        // suggested attributeId is safe to commit. Tooltip
                        // carries the full explanation alongside confidence.
                        const sug = state?.suggestion;
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
                      )}
                    </TableCell>
                  </TableRow>
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
