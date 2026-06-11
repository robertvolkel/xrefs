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
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Menu,
  MenuItem,
  Popover,
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
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import FlagIcon from '@mui/icons-material/Flag';
import OutlinedFlagIcon from '@mui/icons-material/OutlinedFlag';
import UndoOutlinedIcon from '@mui/icons-material/UndoOutlined';
import NoteAltOutlinedIcon from '@mui/icons-material/NoteAltOutlined';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SearchIcon from '@mui/icons-material/Search';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import PlayArrowOutlinedIcon from '@mui/icons-material/PlayArrowOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import type { GlobalUnmappedParam, DictSuggestion, DeepAnalysis, SimilarSibling } from './types';
import { getLogicTable } from '@/lib/logicTables';
import { isValidFamilyId } from '@/lib/services/validFamilyIds';
import { isGenericTerm } from '@/lib/services/paramNameSimilarity';
import { paramUid } from '@/lib/services/paramUid';
import { ClusterPreviewModal } from './ClusterPreviewModal';
import UnmappedParamNoteCell, { type NoteRecord } from './UnmappedParamNoteCell';
import DeepAnalysisDrawer from './DeepAnalysisDrawer';

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
function getOverrideScope(r: { dominantFamily: string | null; dominantCategory: string | null }): { kind: 'family' | 'category'; key: string } | null {
  if (r.dominantFamily) return { kind: 'family', key: r.dominantFamily };
  if (r.dominantCategory) return { kind: 'category', key: r.dominantCategory };
  return null;
}

// `normalizeParamKey` + `isFuzzyMatch` moved to lib/services/paramNameSimilarity.ts
// so the same helpers can be reused server-side (cluster-suggest) and unit-
// tested in isolation. See that file's header for the ASCII-only fuzzy gate.

// paramUid (FNV-1a short UID) moved to lib/services/paramUid.ts so the
// server-side Triage search uses the byte-for-byte identical implementation.
// Re-exported here for the existing import site (AtlasDictTriagePanel).
export { paramUid };

/** Local helper — renders the matchingImpact column. Colour tiers chosen to
 *  give an at-a-glance prioritisation signal across the queue. Estimate rows
 *  (no override yet, default weight=7 assumption) get a dashed border so
 *  engineers know the score will sharpen once the row is accepted with a
 *  definitive canonical. */
function ImpactChip({
  impact,
  productCount,
}: {
  impact?: GlobalUnmappedParam['matchingImpact'];
  productCount: number;
}): React.ReactElement {
  // Server didn't compute (older cached payload, defensive). Fall back to
  // product_count as the only signal available.
  if (!impact) {
    return (
      <Chip
        label={productCount.toLocaleString()}
        size="small"
        sx={{ height: 20, fontSize: '0.65rem', bgcolor: 'action.hover' }}
      />
    );
  }
  const { score, weight, canonical, isEstimate } = impact;
  // Display-only target → no matching impact, even if product reach is high.
  // Engineers should know accepting won't move recommendation quality.
  if (weight === 0) {
    return (
      <Tooltip
        arrow
        title={
          <Box>
            <Typography variant="caption" sx={{ display: 'block', fontWeight: 600 }}>
              Display only
            </Typography>
            <Typography variant="caption" sx={{ display: 'block' }}>
              {canonical
                ? `'${canonical}' is not in the matching engine's logic table (satellite or L2 display-only attribute).`
                : 'Destination scope is L2/uncovered — no matching-engine impact, just display.'}
            </Typography>
          </Box>
        }
      >
        <Chip
          label="—"
          size="small"
          sx={{ height: 20, fontSize: '0.65rem', bgcolor: 'action.hover', color: 'text.disabled' }}
        />
      </Tooltip>
    );
  }
  // Tier thresholds picked so the queue self-organises: a 🔥 row should be
  // worth dropping everything for (1000s of products on a blocking gate),
  // 🟠 is high-value batch work, 🟡 is moderate, ⚪ is small fish.
  let icon = '⚪';
  let bg = 'action.hover';
  let fg = 'text.primary';
  if (score >= 50000) { icon = '🔥'; bg = 'error.dark'; fg = 'error.contrastText'; }
  else if (score >= 10000) { icon = '🟠'; bg = 'warning.dark'; fg = 'warning.contrastText'; }
  else if (score >= 1000) { icon = '🟡'; bg = 'warning.light'; fg = 'warning.contrastText'; }
  const formatted = score >= 1000 ? `${(score / 1000).toFixed(score >= 10000 ? 0 : 1)}k` : score.toString();
  return (
    <Tooltip
      arrow
      title={
        <Box>
          <Typography variant="caption" sx={{ display: 'block', fontWeight: 600 }}>
            Matching impact: {score.toLocaleString()}
          </Typography>
          <Typography variant="caption" sx={{ display: 'block' }}>
            {productCount.toLocaleString()} products × weight {weight}
            {canonical ? ` (→ ${canonical})` : ''}
          </Typography>
          {isEstimate && (
            <Typography variant="caption" sx={{ display: 'block', mt: 0.5, fontStyle: 'italic' }}>
              Estimate — weight defaults to 7 until the row is accepted with a definitive canonical.
            </Typography>
          )}
        </Box>
      }
    >
      <Chip
        label={`${icon} ${formatted}`}
        size="small"
        sx={{
          height: 20,
          fontSize: '0.65rem',
          bgcolor: bg,
          color: fg,
          ...(isEstimate && { border: '1px dashed', borderColor: 'divider', opacity: 0.85 }),
        }}
      />
    </Tooltip>
  );
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
    status: 'wrong_family' | 'confirmed_in_family' | 'unmappable' | 'deferred' | null,
    flaggedBy: 'auto' | 'engineer' | null,
  ) => void;
  /** Stable key derived from the parent's filter inputs (mode, status,
   *  search, MFR/family chips, etc.). When it changes, pagination resets
   *  to INITIAL_VISIBLE_ROWS. Critically, it does NOT change when rows are
   *  mutated in-place by Accept/Revert/Flag — so an engineer scrolled deep
   *  into the queue stays scrolled deep after taking action on a row. */
  viewKey: string;
  /** Filter by cached AI Triage verdict. 'all' = no filter (default).
   *  'accept' / 'defer' = only rows whose state.suggestion.suggestion
   *  matches. 'none' = only cold rows (no AI suggestion yet). Filter
   *  applies in orderedRows after the row-fetch but before the stale
   *  partition + visible-count pagination. */
  aiVerdictFilter?: 'all' | 'accept' | 'defer' | 'none';
  /** Server-side pagination (Decision #231). `rows` is the accumulated set of
   *  pages fetched so far; `serverRemaining` is how many MORE rows match the
   *  current filter on the server but haven't been pulled yet; `serverTotal`
   *  is the total filtered count (for the "X of Y" footer); `onLoadMore`
   *  fetches + appends the next server page; `loadingMore` is its in-flight
   *  flag. Absent ⇒ no server pagination (everything is loaded). */
  serverRemaining?: number;
  serverTotal?: number;
  onLoadMore?: () => void;
  loadingMore?: boolean;
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
  // Versions present at the time the suggestion / investigation was cached.
  // Compared against the current versions on render to drive the staleness
  // signal (left-border stripe + receded chip + ↻ icon). null when no
  // suggestion / investigation is cached, or for rows seeded from overrides.
  suggestionCardVersionAtWrite: string | null;
  suggestionSchemaVersionAtWrite: string | null;
  deepAnalysisCardVersionAtWrite: string | null;
  deepAnalysisSchemaVersionAtWrite: string | null;
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
// v7: cache key drops the cardVersion segment. Versions now live INSIDE
// the cached payload as `cardVersionAtWrite` + `schemaVersionAtWrite` so
// stale entries stay readable and the UI renders proactive staleness
// signals (left-border stripe + receded verdict chip + ↻ icon) instead
// of silently orphaning the entry.
const SUGGEST_LS_PREFIX = 'atlas-ingest-ai-suggest-v7:';
const SUGGEST_LS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
type CachedSuggestion = {
  suggestion: DictSuggestion;
  cachedAt: number;
  cardVersionAtWrite: string | null;
  schemaVersionAtWrite: string | null;
};

function suggestLsKey(familyId: string | null, paramName: string): string {
  return SUGGEST_LS_PREFIX + (familyId ?? '') + '::' + paramName;
}

/**
 * Compute the post-conversion preview for a sample value, given the unit
 * the engineer is about to commit. Mirrors `extractNumericWithPrefix` +
 * `applyUnitPrefix` in atlasMapper.ts so engineers can see what numericValue
 * will land in atlas_products BEFORE clicking Accept.
 *
 * Returns null when:
 *   - unit is empty (no conversion will happen)
 *   - unit doesn't trigger SI prefix (V/A/Ω/°C/% etc. — no-op)
 *   - sample value can't be parsed as numeric
 *
 * Returns a short caption like "120 → 1.20e+5" when the unit triggers
 * conversion. The numeric prefix indicates the multiplier (k=×1000,
 * M=×1e6, m=×0.001, µ=×1e-6, etc.).
 */
function previewConversion(sampleValue: string, unit: string): { display: string; numericValue: number; suspicious: boolean } | null {
  if (!unit || !sampleValue) return null;

  // SI prefix detection — must match atlasMapper.ts _applyUnitPrefixCore guards
  let multiplier = 1;
  if (unit.startsWith('p')) multiplier = 1e-12;
  else if (unit.startsWith('n') && !unit.startsWith('no')) multiplier = 1e-9;
  else if (unit.startsWith('µ') || unit.startsWith('μ') || unit.startsWith('u')) multiplier = 1e-6;
  else if (unit.startsWith('m') && !unit.startsWith('mm') && !unit.startsWith('M')) multiplier = 1e-3;
  else if (unit.startsWith('k') || unit.startsWith('K')) multiplier = 1e3;
  else if (unit.startsWith('M') && !unit.startsWith('MSL')) multiplier = 1e6;
  else if (unit.startsWith('G')) multiplier = 1e9;
  else if (unit.startsWith('T')) multiplier = 1e12;

  if (multiplier === 1) return null; // no-op unit

  // Parse the sample's leading number — handle "400kHz" (value-string parsing wins),
  // bare digits like "120", comparison prefixes like "≤150".
  const valueMatch = sampleValue.match(/^[≤≥<>=±]?\s*([+-]?\d+\.?\d*)\s*([a-zA-ZµΩ°%/√]*)/);
  if (!valueMatch) return null;

  const rawNum = parseFloat(valueMatch[1]);
  const valueStringUnit = valueMatch[2]?.trim() || undefined;

  // Value-string unit WINS over dict unit (Decision #217 hybrid).
  // If the sample already has an embedded unit, that's what gets applied;
  // dict unit only matters for unit-less values. Preview reflects this.
  const effectiveUnitForPreview = valueStringUnit || unit;
  let effectiveMultiplier = 1;
  if (effectiveUnitForPreview.startsWith('p')) effectiveMultiplier = 1e-12;
  else if (effectiveUnitForPreview.startsWith('n') && !effectiveUnitForPreview.startsWith('no')) effectiveMultiplier = 1e-9;
  else if (effectiveUnitForPreview.startsWith('µ') || effectiveUnitForPreview.startsWith('μ') || effectiveUnitForPreview.startsWith('u')) effectiveMultiplier = 1e-6;
  else if (effectiveUnitForPreview.startsWith('m') && !effectiveUnitForPreview.startsWith('mm') && !effectiveUnitForPreview.startsWith('M')) effectiveMultiplier = 1e-3;
  else if (effectiveUnitForPreview.startsWith('k') || effectiveUnitForPreview.startsWith('K')) effectiveMultiplier = 1e3;
  else if (effectiveUnitForPreview.startsWith('M') && !effectiveUnitForPreview.startsWith('MSL')) effectiveMultiplier = 1e6;
  else if (effectiveUnitForPreview.startsWith('G')) effectiveMultiplier = 1e9;
  else if (effectiveUnitForPreview.startsWith('T')) effectiveMultiplier = 1e12;

  const numericValue = rawNum * effectiveMultiplier;
  const display = `${rawNum} → ${numericValue.toExponential(2)}`;

  // "Suspicious" heuristic: if value-string unit DIFFERS from dict unit,
  // flag amber — that's the EVISUN-style case where dict says MHz but value
  // says kHz. Not necessarily wrong (value-string wins, math is right) but
  // worth surfacing so engineer notices the conflict.
  const suspicious = !!(valueStringUnit && valueStringUnit !== unit && multiplier !== effectiveMultiplier);

  return { display, numericValue, suspicious };
}

/** Read a cached suggestion. Returns the full record (suggestion + at-write
 *  versions) so the caller can compare against current versions and decide
 *  staleness. Returns null on missing / expired entries. */
function readSuggestionCacheRecord(paramName: string, familyId: string | null): CachedSuggestion | null {
  if (typeof window === 'undefined') return null;
  try {
    const key = suggestLsKey(familyId, paramName);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedSuggestion;
    if (Date.now() - parsed.cachedAt > SUGGEST_LS_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeSuggestionCache(
  paramName: string,
  familyId: string | null,
  suggestion: DictSuggestion,
  cardVersionAtWrite: string | null,
  schemaVersionAtWrite: string | null,
): void {
  if (typeof window === 'undefined') return;
  try {
    const key = suggestLsKey(familyId, paramName);
    const payload: CachedSuggestion = {
      suggestion,
      cachedAt: Date.now(),
      cardVersionAtWrite,
      schemaVersionAtWrite,
    };
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // localStorage full or disabled — silently degrade to no cache
  }
}

/** Compare a cached entry's at-write versions against the current versions
 *  for that family. Returns null if fresh; otherwise a short reason string
 *  used in tooltips and the header banner. Engineer-friendly wording — no
 *  "version" jargon, just plain English. */
function computeStaleness(
  atWriteCard: string | null,
  atWriteSchema: string | null,
  currentCard: string | null,
  currentSchema: string | null,
): string | null {
  const reasons: string[] = [];
  if (atWriteCard !== currentCard) reasons.push('domain card updated');
  if (atWriteSchema !== currentSchema) reasons.push('schema changed');
  if (reasons.length === 0) return null;
  return reasons.join(' and ');
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
// v10: cache record gains cardVersionAtWrite + schemaVersionAtWrite for
//      proactive staleness signaling (mirrors the v7 suggest cache shape).
const INVESTIGATE_LS_PREFIX = 'atlas-ingest-ai-investigate-v10:';
type CachedDeepAnalysis = {
  analysis: DeepAnalysis;
  cachedAt: number;
  cardVersionAtWrite: string | null;
  schemaVersionAtWrite: string | null;
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
  cardVersionAtWrite: string | null,
  schemaVersionAtWrite: string | null,
): void {
  if (typeof window === 'undefined') return;
  try {
    const key = INVESTIGATE_LS_PREFIX + (scopeKey ?? '__none__') + '::' + paramName;
    const payload: CachedDeepAnalysis = {
      analysis,
      cachedAt: Date.now(),
      cardVersionAtWrite,
      schemaVersionAtWrite,
    };
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

// Per-family canonical attributeId set + current versions for staleness
// comparison. v6 bump because the cached shape now carries schemaVersion
// alongside cardUpdatedAt.
const SCHEMA_LS_PREFIX = 'atlas-ingest-family-schema-v6:';
type CachedSchema = {
  schemaIds: string[];
  cardUpdatedAt: string | null;
  schemaVersion: string | null;
  cachedAt: number;
};

function readFamilySchemaCache(familyId: string): { schemaIds: string[]; cardUpdatedAt: string | null; schemaVersion: string | null } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SCHEMA_LS_PREFIX + familyId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedSchema;
    if (Date.now() - parsed.cachedAt > SUGGEST_LS_TTL_MS) {
      localStorage.removeItem(SCHEMA_LS_PREFIX + familyId);
      return null;
    }
    return {
      schemaIds: parsed.schemaIds,
      cardUpdatedAt: parsed.cardUpdatedAt ?? null,
      schemaVersion: parsed.schemaVersion ?? null,
    };
  } catch {
    return null;
  }
}

function writeFamilySchemaCache(
  familyId: string,
  schemaIds: string[],
  cardUpdatedAt: string | null,
  schemaVersion: string | null,
): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: CachedSchema = { schemaIds, cardUpdatedAt, schemaVersion, cachedAt: Date.now() };
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

export default function GlobalUnmappedParamsTable({ rows, onRegenerateAffected, pendingBatchCount, notesByParam, onNoteChange, onRowAccepted, onRowReverted, onRowFlagged, viewKey, aiVerdictFilter = 'all', serverRemaining = 0, serverTotal, onLoadMore, loadingMore = false }: Props) {
  // Default expanded so users see the AI-triage flow without an extra click —
  // this is the most-used panel of the page when there are unmapped params.
  const [expanded, setExpanded] = useState(true);
  const [states, setStates] = useState<Record<string, RowState>>({});
  const [suggestionProgress, setSuggestionProgress] = useState<{ done: number; total: number } | null>(null);
  // Cancel flag for the bulk AI Generate run. Set true by the Stop button;
  // each worker checks it between fetches and exits cleanly. We use a ref so
  // the flag is observable inside the async closure without re-rendering the
  // table mid-run. Reset to false at the start of every new generate batch.
  const generateCancelRef = useRef<boolean>(false);
  // Mirror of the cancel ref for UI feedback (button label/disabled). Ref
  // alone won't re-render the Stop button when clicked.
  const [generateStopping, setGenerateStopping] = useState(false);
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
  /** Per-family current versions used for the staleness comparison. The
   *  cached suggestion / investigation stores the at-write versions
   *  separately; on render we compare against these "current" values
   *  fetched from the server. When they differ → row renders stale UI. */
  const [cardVersionByFamily, setCardVersionByFamily] = useState<Record<string, string | null>>({});
  const cardVersionByFamilyRef = useRef<Record<string, string | null>>({});
  useEffect(() => { cardVersionByFamilyRef.current = cardVersionByFamily; }, [cardVersionByFamily]);
  const [schemaVersionByFamily, setSchemaVersionByFamily] = useState<Record<string, string | null>>({});
  const schemaVersionByFamilyRef = useRef<Record<string, string | null>>({});
  useEffect(() => { schemaVersionByFamilyRef.current = schemaVersionByFamily; }, [schemaVersionByFamily]);
  // How many rows to actually render. Bumped by the "Show more" button.
  // Resets when the rows prop changes (filters narrowed the set).
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_ROWS);
  /** When true, the table re-orders so rows with stale cached AI work
   *  surface to the top. Engineer toggles via the staleness-banner button.
   *  Off by default so a fresh page load preserves the parent panel's
   *  source order (which is itself sorted by triage priority upstream). */
  const [staleFirstSort, setStaleFirstSort] = useState(false);

  // Per-row opt-out from bulk normalized-match acceptance. By default,
  // accepting a row that has cosmetic-duplicate paramNames in the same
  // scope ALSO fires overrides for the duplicates. Click the × on the
  // "+N similar" chip to scope the accept to just the primary row.
  const [bulkOptedOut, setBulkOptedOut] = useState<Set<string>>(new Set());

  /** Open paramName for the AI Cluster (Tier 2) preview modal. null = closed.
   *  Set on "Find Similar (AI)" button click, cleared on modal close. Tier 2
   *  catches CJK synonyms / semantic equivalents / unit-suffix variants that
   *  the deterministic Tier 1 (`normalizedMatchesByRow` + the "+N similar"
   *  chip) is gated against for safety reasons. */
  const [clusterFocalParam, setClusterFocalParam] = useState<string | null>(null);
  /** Cross-scope cluster candidates for the open focal, fetched SERVER-SIDE
   *  (Decision #231) so they cover the WHOLE queue, not just the loaded page.
   *  null = not yet loaded (modal shows a loading state). */
  const [clusterCandidates, setClusterCandidates] = useState<GlobalUnmappedParam[] | null>(null);

  // Fetch candidates whenever a focal is opened. The endpoint excludes the
  // focal + Tier-1 siblings + already-mapped + unscoped rows and pre-sorts
  // exact-normalized-key-first, mirroring the prior client-side gathering but
  // over the full classified set.
  useEffect(() => {
    if (!clusterFocalParam) { setClusterCandidates(null); return; }
    let cancelled = false;
    setClusterCandidates(null);
    (async () => {
      try {
        const res = await fetch(`/api/admin/atlas/dictionaries/cluster-candidates?focal=${encodeURIComponent(clusterFocalParam)}`);
        const json = await res.json();
        if (cancelled) return;
        setClusterCandidates(json?.success && Array.isArray(json.candidates) ? (json.candidates as GlobalUnmappedParam[]) : []);
      } catch {
        if (!cancelled) setClusterCandidates([]);
      }
    })();
    return () => { cancelled = true; };
  }, [clusterFocalParam]);

  /** When set, the right-side AI Investigation drawer is open showing the
   *  cached deepAnalysis for that paramName. Single-instance drawer: clicking
   *  another row's verdict chip swaps the content. Closes via ESC, backdrop
   *  click, or after the engineer commits an action (auto-close). */
  const [drawerParamName, setDrawerParamName] = useState<string | null>(null);

  /** For each row, the OTHER queue rows whose paramName is the same concept
   *  AND shares the same scope AND is still actionable (no active override).
   *  Two passes:
   *   1. Exact-normalized-key clustering — whitespace / case / paren-style
   *      variants like "T(mm)" / "T (mm)" / "t(mm)" all collapse to one key.
   *   2. ASCII-only Levenshtein-1 fuzzy fallback — catches single-char typos
   *      like "propogation_delay" vs "propagation_delay". Gated to ASCII-only
   *      keys because CJK characters carry too much semantic weight per code
   *      point ("电压_max" vs "电流_max" is distance 1 but means voltage vs
   *      current — opposite concepts). The AI cluster-suggest button handles
   *      CJK synonyms with proper semantic understanding.
   *  Built once per `rows` change. */
  // "+N similar" cosmetic-variant siblings. The clustering is now computed
  // SERVER-SIDE over the FULL classified set (lib/services/triageClustering.ts)
  // and attached per-row as `row.similarSiblings` — because under server
  // pagination the client only holds one page, so it can no longer see every
  // in-scope variant to cluster locally. We just index the server-attached
  // siblings by paramName for the existing consumers (the "+N similar" chip +
  // bulk-accept path), which read `normalizedMatchesByRow[paramName]` as a
  // `{ paramName, sampleValues }[]`.
  const normalizedMatchesByRow = useMemo(() => {
    const result: Record<string, SimilarSibling[]> = {};
    for (const r of rows) {
      if (r.similarSiblings && r.similarSiblings.length > 0) {
        result[r.paramName] = r.similarSiblings;
      }
    }
    return result;
  }, [rows]);
  // Reset visible count when the parent's filter context changes — a filter
  // narrowing shouldn't carry over an expanded "show all" state from the
  // previous view. Crucially this is NOT keyed off `rows`: optimistic
  // Accept/Revert/Flag mutations replace the `rows` array reference too, and
  // resetting on those was kicking engineers back to the first 50 rows after
  // every single action on long queues.
  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_ROWS);
  }, [viewKey]);
  // Safety clamp: if the filtered set shrinks below the current visible count
  // (e.g. accepting a row in Open status drops it from filteredRows), keep
  // visibleCount in range so the "Show more" affordance stays meaningful.
  useEffect(() => {
    if (rows.length < visibleCount && rows.length >= INITIAL_VISIBLE_ROWS) {
      setVisibleCount(rows.length);
    }
  }, [rows.length, visibleCount]);
  // Conditional stale-first sort. When toggled on (via the staleness banner),
  // rows whose cached suggestion OR investigation is stale rise to the top
  // of the queue so the engineer can refresh them without scrolling. The
  // sort is stable: within the stale group, source order preserved; within
  // fresh group, source order preserved. Off by default — preserves the
  // parent panel's intentional ordering.
  const orderedRows = useMemo(() => {
    // Apply AI verdict filter first — reduces work for the stale partition
    // and pagination. Filter reads each row's cached suggestion verdict
    // from `states`. 'none' = rows with no AI suggestion yet (cold rows).
    let filtered: GlobalUnmappedParam[] = rows;
    if (aiVerdictFilter && aiVerdictFilter !== 'all') {
      filtered = rows.filter((r) => {
        const st = states[r.paramName];
        const verdict = st?.suggestion?.suggestion ?? null;
        if (aiVerdictFilter === 'none') return verdict === null;
        return verdict === aiVerdictFilter;
      });
    }
    // Default sort (matchingImpact.score desc) is now applied SERVER-SIDE
    // (queryTriage) so the page slice is in the right order — we no longer
    // re-sort here (re-sorting one page would only reshuffle within the page).
    // The aiVerdict filter above + the stale-first partition below still apply
    // client-side over the loaded rows.
    if (!staleFirstSort) return filtered;
    const isRowStale = (row: GlobalUnmappedParam): boolean => {
      const st = states[row.paramName];
      if (!st) return false;
      const scope = getOverrideScope(row);
      const scopeKey = scope?.key ?? null;
      if (!scopeKey) return false;
      const curCard = cardVersionByFamily[scopeKey] ?? null;
      const curSchema = schemaVersionByFamily[scopeKey] ?? null;
      if (st.suggestion && (st.suggestionCardVersionAtWrite !== curCard || st.suggestionSchemaVersionAtWrite !== curSchema)) return true;
      if (st.deepAnalysis && (st.deepAnalysisCardVersionAtWrite !== curCard || st.deepAnalysisSchemaVersionAtWrite !== curSchema)) return true;
      return false;
    };
    // Stable partition: stales first (preserved relative order), then fresh.
    const stale: GlobalUnmappedParam[] = [];
    const fresh: GlobalUnmappedParam[] = [];
    for (const r of filtered) {
      if (isRowStale(r)) stale.push(r);
      else fresh.push(r);
    }
    return [...stale, ...fresh];
  }, [rows, states, cardVersionByFamily, schemaVersionByFamily, staleFirstSort, aiVerdictFilter]);
  const visibleRows = orderedRows.slice(0, visibleCount);
  // Two-level pagination (Decision #231):
  //   renderHidden = rows loaded but not yet rendered (the client render window
  //     — keeps a big page from painting 500 MUI rows at once, the documented
  //     freeze guard).
  //   serverRemaining = rows matching the filter on the server but not yet
  //     fetched into the accumulator.
  // "Show more" advances the render window first; once that's exhausted it
  // fetches the next server page (and bumps the window so the new rows show).
  const renderHidden = Math.max(0, orderedRows.length - visibleRows.length);
  const hasMore = renderHidden > 0 || serverRemaining > 0;
  // Total for the "X of Y" footer — the server's filtered total when present
  // (so it reflects rows not yet loaded), else the loaded count.
  const displayTotal = serverTotal ?? orderedRows.length;
  // useTransition lets React keep the UI responsive while it renders the
  // additional rows. Without this, the synchronous setVisibleCount blocked
  // the main thread for several seconds on large queues, triggering "Page
  // Unresponsive" warnings.
  const [pendingShowMore, startShowMore] = useTransition();
  const handleShowMore = () => {
    if (renderHidden > 0) {
      startShowMore(() => setVisibleCount((n) => n + ROW_BATCH_SIZE));
    } else if (serverRemaining > 0 && onLoadMore) {
      // Fetch + append the next server page; bump the window so the incoming
      // rows render (they're beyond the current visibleCount).
      onLoadMore();
      setVisibleCount((n) => n + ROW_BATCH_SIZE);
    }
  };

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
    const initialCardVersionByFamily: Record<string, string | null> = {};
    const initialSchemaVersionByFamily: Record<string, string | null> = {};
    const seenFamilies = new Set<string>();
    const familiesNeedingSchema = new Set<string>();
    for (const row of rows) {
      if (hydratedParamsRef.current.has(row.paramName)) continue;
      hydratedParamsRef.current.add(row.paramName);
      const scope = getOverrideScope(row);
      const scopeKey = scope?.key ?? null;
      if (scopeKey && !seenFamilies.has(scopeKey)) {
        seenFamilies.add(scopeKey);
        const cachedSchema = readFamilySchemaCache(scopeKey);
        if (cachedSchema && cachedSchema.schemaIds.length > 0) {
          // Seed from LS cache for instant render — schemaIds rarely change.
          initialSchemaByFamily[scopeKey] = new Set(cachedSchema.schemaIds);
          initialCardVersionByFamily[scopeKey] = cachedSchema.cardUpdatedAt;
          initialSchemaVersionByFamily[scopeKey] = cachedSchema.schemaVersion;
        }
        // ALWAYS refetch the schema endpoint, even on LS cache hit. The
        // cardUpdatedAt + schemaVersion fields drive staleness comparison;
        // if we trust the 7-day LS cache, a card edit performed BETWEEN page
        // loads never reaches the staleness check (cached versions match the
        // suggestion's at-write versions, so no staleness signal renders).
        // The endpoint is cheap (logic-table read + one DB query for the
        // active card row); ~50ms × N families per page load is acceptable.
        familiesNeedingSchema.add(scopeKey);
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
          suggestionCardVersionAtWrite: null,
          suggestionSchemaVersionAtWrite: null,
          deepAnalysisCardVersionAtWrite: null,
          deepAnalysisSchemaVersionAtWrite: null,
        };
        continue;
      }
      const cachedRecord = readSuggestionCacheRecord(row.paramName, scopeKey);
      const cached = cachedRecord?.suggestion ?? null;
      const cachedDeep = readInvestigateCache(row.paramName, scopeKey);
      // For already-accepted rows (active OR reverted override), seed the
      // edit fields from the override so the Accepted / Undone status views
      // show what was actually mapped instead of blank inputs + a "Generate"
      // CTA that's irrelevant for a row that's already resolved.
      //
      // Precedence: override wins over AI suggestion when both exist. The
      // override represents the engineer's committed decision (potentially
      // edited away from the AI's proposal — e.g. user overrides
      // vgs_th → vgs_th_min). Always honor that over the stale AI cache.
      // For rows with no override yet, AI suggestion fills the fields as
      // a starting point for the engineer to review/edit.
      const ov = row.acceptedOverride;
      if (cached) {
        initialStates[row.paramName] = {
          suggestion: cached,
          loadingSuggestion: false,
          editedAttributeId: ov?.attributeId ?? cached.suggestedAttributeId ?? '',
          editedAttributeName: ov?.attributeName ?? cached.suggestedAttributeName ?? '',
          editedUnit: ov?.unit ?? cached.suggestedUnit ?? '',
          accepted: false,
          acceptError: null,
          accepting: false,
          deepAnalysis: cachedDeep?.analysis ?? null,
          loadingDeepAnalysis: false,
          deepAnalysisError: null,
          suggestionCardVersionAtWrite: cachedRecord?.cardVersionAtWrite ?? null,
          suggestionSchemaVersionAtWrite: cachedRecord?.schemaVersionAtWrite ?? null,
          deepAnalysisCardVersionAtWrite: cachedDeep?.cardVersionAtWrite ?? null,
          deepAnalysisSchemaVersionAtWrite: cachedDeep?.schemaVersionAtWrite ?? null,
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
          // Synthetic suggestion (from override) is never "stale" against
          // current versions — engineer accepted it intentionally.
          suggestionCardVersionAtWrite: null,
          suggestionSchemaVersionAtWrite: null,
          deepAnalysisCardVersionAtWrite: cachedDeep?.cardVersionAtWrite ?? null,
          deepAnalysisSchemaVersionAtWrite: cachedDeep?.schemaVersionAtWrite ?? null,
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
          suggestionCardVersionAtWrite: null,
          suggestionSchemaVersionAtWrite: null,
          deepAnalysisCardVersionAtWrite: cachedDeep?.cardVersionAtWrite ?? null,
          deepAnalysisSchemaVersionAtWrite: cachedDeep?.schemaVersionAtWrite ?? null,
        };
      }
    }
    setStates((prev) => ({ ...prev, ...initialStates }));
    if (Object.keys(initialSchemaByFamily).length > 0) {
      setSchemaByFamily((prev) => ({ ...prev, ...initialSchemaByFamily }));
    }
    if (Object.keys(initialCardVersionByFamily).length > 0) {
      setCardVersionByFamily((prev) => ({ ...prev, ...initialCardVersionByFamily }));
    }
    if (Object.keys(initialSchemaVersionByFamily).length > 0) {
      setSchemaVersionByFamily((prev) => ({ ...prev, ...initialSchemaVersionByFamily }));
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
            const cardUpdatedAt = (typeof json.cardUpdatedAt === 'string' ? json.cardUpdatedAt : null) as string | null;
            const schemaVersion = (typeof json.schemaVersion === 'string' ? json.schemaVersion : null) as string | null;
            writeFamilySchemaCache(fam, json.schemaIds, cardUpdatedAt, schemaVersion);
            // schemaIds: keep the "don't clobber if already set" guard — the
            // set is identity-stable so re-creating it would force a needless
            // re-render. The version state, however, MUST overwrite: that's
            // the whole point of the always-fetch refresh — bring the latest
            // cardUpdatedAt + schemaVersion to the staleness comparison even
            // if the LS cache pre-seeded older values.
            setSchemaByFamily((prev) => prev[fam] ? prev : { ...prev, [fam]: new Set(json.schemaIds) });
            setCardVersionByFamily((prev) => ({ ...prev, [fam]: cardUpdatedAt }));
            setSchemaVersionByFamily((prev) => ({ ...prev, [fam]: schemaVersion }));
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
  const generateSuggestionsForRows = useCallback(async (targetRows: GlobalUnmappedParam[], opts?: { force?: boolean }) => {
    const force = opts?.force === true;
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
    // Reset cancel flag at the start of every new batch — a previous Stop
    // shouldn't poison the next run.
    generateCancelRef.current = false;
    setGenerateStopping(false);

    let done = 0;
    let next = 0;

    async function worker() {
      while (next < queue.length) {
        // Stop button sets this. We exit between fetches (not mid-fetch) so
        // in-flight requests still resolve and update their row — clean stop,
        // no orphan loading spinners.
        if (generateCancelRef.current) break;
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
              // force=true bypasses server-side SUGGEST_CACHE for this call.
              // Used by the bulk "Refresh AI suggestions" action so post-card
              // / post-rule changes propagate even when the card version
              // didn't change (which would otherwise auto-invalidate).
              force,
            }),
          });
          const json = await res.json();
          const suggestion: DictSuggestion | null = json?.success ? json.suggestion : null;
          // Server returns the current versions on every response. Use them as
          // the at-write versions stored alongside the cache entry — they're
          // the freshest values seen, and the staleness check on next render
          // compares THESE against future "current" values fetched on next
          // page load. If versions differ later → row renders stale UI.
          const currentCardVersion = (typeof json?.currentCardVersion === 'string' ? json.currentCardVersion : null) as string | null;
          const currentSchemaVersion = (typeof json?.currentSchemaVersion === 'string' ? json.currentSchemaVersion : null) as string | null;
          if (suggestion) {
            writeSuggestionCache(row.paramName, rowScopeKey, suggestion, currentCardVersion, currentSchemaVersion);
          }
          // Capture the schema list returned alongside the suggestion + bump
          // local version state so the next /suggest write uses fresh values.
          if (Array.isArray(json?.schemaIds) && rowScopeKey) {
            const fam = rowScopeKey;
            setSchemaByFamily((prev) => prev[fam] ? prev : { ...prev, [fam]: new Set(json.schemaIds) });
            setCardVersionByFamily((prev) => ({ ...prev, [fam]: currentCardVersion }));
            setSchemaVersionByFamily((prev) => ({ ...prev, [fam]: currentSchemaVersion }));
            writeFamilySchemaCache(fam, json.schemaIds, currentCardVersion, currentSchemaVersion);
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
              suggestionCardVersionAtWrite: currentCardVersion,
              suggestionSchemaVersionAtWrite: currentSchemaVersion,
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
    // If the user hit Stop, some queued rows were marked loading but never
    // fetched. Clear their spinners so the UI doesn't strand them. Rows that
    // got a verdict (or errored) already had their state set above.
    if (generateCancelRef.current) {
      setStates((prev) => {
        const next = { ...prev };
        for (const row of queue) {
          const s = next[row.paramName];
          if (s?.loadingSuggestion) {
            next[row.paramName] = { ...s, loadingSuggestion: false };
          }
        }
        return next;
      });
    }
    generateCancelRef.current = false;
    setGenerateStopping(false);
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

  // Bulk-refresh state. The "stale" subsets — rows whose cached suggestion /
  // investigation was written against an older card or schema version than
  // is current. These drive the proactive header banner + targeted refresh.
  const cachedSuggestionRows = useMemo(
    () => rows.filter((r) => !r.autoFlag && !!states[r.paramName]?.suggestion && !states[r.paramName]?.loadingSuggestion),
    [rows, states],
  );
  const cachedInvestigationRows = useMemo(
    () => rows.filter((r) => !!states[r.paramName]?.deepAnalysis && !states[r.paramName]?.loadingDeepAnalysis),
    [rows, states],
  );

  /** Per-row helper — exposed at component scope so the row-render code can
   *  drive the stripe / chip styling / ↻ icon visibility. */
  const getRowSuggestionStaleness = useCallback((row: GlobalUnmappedParam): string | null => {
    const st = states[row.paramName];
    if (!st?.suggestion) return null;
    const scope = getOverrideScope(row);
    const scopeKey = scope?.key ?? null;
    if (!scopeKey) return null;
    return computeStaleness(
      st.suggestionCardVersionAtWrite,
      st.suggestionSchemaVersionAtWrite,
      cardVersionByFamily[scopeKey] ?? null,
      schemaVersionByFamily[scopeKey] ?? null,
    );
  }, [states, cardVersionByFamily, schemaVersionByFamily]);

  const getRowInvestigationStaleness = useCallback((row: GlobalUnmappedParam): string | null => {
    const st = states[row.paramName];
    if (!st?.deepAnalysis) return null;
    const scope = getOverrideScope(row);
    const scopeKey = scope?.key ?? null;
    if (!scopeKey) return null;
    return computeStaleness(
      st.deepAnalysisCardVersionAtWrite,
      st.deepAnalysisSchemaVersionAtWrite,
      cardVersionByFamily[scopeKey] ?? null,
      schemaVersionByFamily[scopeKey] ?? null,
    );
  }, [states, cardVersionByFamily, schemaVersionByFamily]);

  const staleSuggestionRows = useMemo(
    () => cachedSuggestionRows.filter((r) => getRowSuggestionStaleness(r) !== null),
    [cachedSuggestionRows, getRowSuggestionStaleness],
  );
  const staleInvestigationRows = useMemo(
    () => cachedInvestigationRows.filter((r) => getRowInvestigationStaleness(r) !== null),
    [cachedInvestigationRows, getRowInvestigationStaleness],
  );

  const [refreshConfirm, setRefreshConfirm] = useState<{ kind: 'suggestions' | 'investigations'; count: number } | null>(null);
  const [bulkRefreshProgress, setBulkRefreshProgress] = useState<{ done: number; total: number } | null>(null);

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

      // For AI-driven confirms (NOT registry auto-flags — those are already
      // in the code registry by definition), also: (a) persist the signature
      // to atlas_family_param_signatures so future ingests auto-reclassify,
      // and (b) retroactively reclassify existing atlas_products that carry
      // the offending paramName under the wrong family. Both happen server-
      // side in one call. Reasoning + targetFamily come from the AI verdict.
      //
      // Pre-flight validation: skip the POST entirely if the AI's
      // suggested family isn't a real L3 family. The server-side endpoint
      // would 400 on this anyway (Decision #185 BACKLOG follow-up), but
      // catching it client-side gives a cleaner message and avoids a
      // misleading "signature insert failed" tooltip when the real issue
      // is "the AI hallucinated a family ID."
      let sigError: string | null = null;
      if (investigationVerdict && autoDiagnosis?.suggestedFamily) {
        if (!isValidFamilyId(autoDiagnosis.suggestedFamily as string)) {
          sigError = `Flag confirmed, but skipped registry insert — AI suggested unknown family '${autoDiagnosis.suggestedFamily}'. Edit the signature manually if needed.`;
        } else {
          try {
            const sigRes = await fetch('/api/admin/atlas/family-param-signatures', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                paramName: row.paramName,
                targetFamilyId: autoDiagnosis.suggestedFamily,
                reasoning: autoDiagnosis.reasoning ?? investigationVerdict.prose ?? 'Engineer confirmed AI wrong-family verdict.',
              }),
            });
            const sigJson = await sigRes.json();
            if (!sigRes.ok || !sigJson.success) {
              // Don't fail the whole Confirm — the wrong_family note already
              // persisted. Surface the signature failure as a non-blocking
              // warning so engineer knows the registry didn't update.
              sigError = `Flag confirmed, but signature insert failed: ${sigJson.error ?? 'unknown error'}`;
            }
          } catch (e) {
            sigError = `Flag confirmed, but signature insert errored: ${(e as Error).message}`;
          }
        }
      }

      // Bump the Recent Accepts panel — the queue-row mutation is handled by
      // onRowFlagged above. No batch regen needed; flagging doesn't change
      // ingest output.
      await onRegenerateAffected([]);
      setFlagState((p) => ({ ...p, [row.paramName]: { busy: false, error: sigError } }));
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
    // Only needs the override target name + scope — accepts both a compact
    // SimilarSibling and a full row.
    match: { paramName: string; dominantFamily: string | null; dominantCategory: string | null },
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

  /** Tier 2 trigger — opens the AI Cluster modal for the focal row. Enabled
   *  iff the row has a usable override mapping (engineer-edited or AI-suggested
   *  attributeId) AND is in a scope (family or category). Disabled state
   *  surfaces the reason in the tooltip. */
  const renderFindSimilarButton = (r: GlobalUnmappedParam) => {
    const state = states[r.paramName];
    const hasMapping = !!state?.editedAttributeId?.trim();
    const scope = getOverrideScope(r);
    const disabled = !hasMapping || !scope;
    const disabledReason = !scope
      ? 'Unscoped row — set a dominantFamily or dominantCategory before clustering.'
      : !hasMapping
      ? 'Generate or enter an attributeId mapping first — the modal applies it to selected matches.'
      : '';
    return (
      <Tooltip title={disabled ? disabledReason : 'Use AI to find near-duplicate paramNames in scope (CJK synonyms, semantic equivalents) and bulk-apply this row’s mapping.'}>
        <span>
          <IconButton
            size="small"
            disabled={disabled}
            onClick={() => setClusterFocalParam(r.paramName)}
            sx={{ p: 0.5 }}
          >
            <AutoAwesomeIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </span>
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
      // Server returns current versions on every response — use them as
      // the at-write versions so the staleness check on next render compares
      // against then-future "current" values fetched at page load.
      const currentCardVersion = (typeof json.currentCardVersion === 'string' ? json.currentCardVersion : null) as string | null;
      const currentSchemaVersion = (typeof json.currentSchemaVersion === 'string' ? json.currentSchemaVersion : null) as string | null;
      writeInvestigateCache(row.paramName, scopeKey, analysis, currentCardVersion, currentSchemaVersion);
      setStates((prev) => ({
        ...prev,
        [row.paramName]: {
          ...(prev[row.paramName] ?? {}),
          deepAnalysis: analysis,
          loadingDeepAnalysis: false,
          deepAnalysisError: null,
          deepAnalysisCardVersionAtWrite: currentCardVersion,
          deepAnalysisSchemaVersionAtWrite: currentSchemaVersion,
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

  // ─── Bulk refresh handlers ────────────────────────────
  // Declared AFTER runInvestigate so the closure can safely reference it
  // (avoids TDZ on the const). Suggestions go through generateSuggestionsForRows
  // (parallel, concurrency-limited via SUGGESTION_CONCURRENCY); investigations
  // run sequentially because they're more expensive and fan out to several
  // server-side fetches each.
  const requestRefreshSuggestions = useCallback(() => {
    if (staleSuggestionRows.length === 0) return;
    setRefreshConfirm({ kind: 'suggestions', count: staleSuggestionRows.length });
  }, [staleSuggestionRows.length]);

  const requestRefreshInvestigations = useCallback(() => {
    if (staleInvestigationRows.length === 0) return;
    setRefreshConfirm({ kind: 'investigations', count: staleInvestigationRows.length });
  }, [staleInvestigationRows.length]);

  const confirmRefresh = useCallback(async () => {
    if (!refreshConfirm) return;
    const { kind } = refreshConfirm;
    setRefreshConfirm(null);
    if (kind === 'suggestions') {
      await generateSuggestionsForRows(staleSuggestionRows, { force: true });
    } else {
      const total = staleInvestigationRows.length;
      setBulkRefreshProgress({ done: 0, total });
      try {
        for (let i = 0; i < total; i++) {
          const row = staleInvestigationRows[i];
          if (!row) continue;
          await runInvestigate(row);
          setBulkRefreshProgress({ done: i + 1, total });
        }
      } finally {
        setBulkRefreshProgress(null);
      }
    }
  }, [refreshConfirm, staleSuggestionRows, staleInvestigationRows, generateSuggestionsForRows, runInvestigate]);

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
    // Optimistic — chip counts (deferred / unmappable / open) in the parent's
    // statusCounts also depend on onRowFlagged, not just notesByParam.
    onRowFlagged?.(row.paramName, 'unmappable', 'engineer');
    try {
      const existing = notesByParam[row.paramName];
      const res = await fetch(`/api/admin/atlas/unmapped-param-notes/${encodeURIComponent(row.paramName)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'unmappable',
          flaggedBy: 'engineer',
          note: existing?.note ?? null,
          autoDiagnosis: existing?.autoDiagnosis ?? null,
          flagged: existing?.flagged ?? false,
        }),
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
      // Roll back the optimistic chip-count update.
      onRowFlagged?.(row.paramName, notesByParam[row.paramName]?.status ?? null, notesByParam[row.paramName]?.flaggedBy ?? null);
      const msg = err instanceof Error ? err.message : 'Failed to mark unmappable';
      setStates((prev) => ({
        ...prev,
        [row.paramName]: {
          ...(prev[row.paramName] ?? {}),
          deepAnalysisError: msg,
        } as RowState,
      }));
    }
  }, [onNoteChange, onRowFlagged, notesByParam, recordInvestigationAction]);

  // ─── Defer + Reopen (per-row "park for later" workflow) ───────
  // Defer is the engineer-side counterpart to the AI verdict 'defer':
  // they've decided this row needs upstream work / more context before
  // it can be mapped, so park it out of the OPEN view. Reason textarea
  // pre-fills from the AI explanation when present so engineers don't
  // have to retype context they already saw.
  const [deferPopover, setDeferPopover] = useState<{ anchor: HTMLElement; row: GlobalUnmappedParam } | null>(null);
  const [deferReason, setDeferReason] = useState('');
  const [deferSubmitting, setDeferSubmitting] = useState(false);
  const [parkedMenuAnchor, setParkedMenuAnchor] = useState<{ anchor: HTMLElement; row: GlobalUnmappedParam } | null>(null);

  const openDeferPopover = useCallback((row: GlobalUnmappedParam, anchor: HTMLElement) => {
    const aiExplanation = states[row.paramName]?.suggestion?.suggestion === 'defer'
      ? (states[row.paramName]?.suggestion?.explanation ?? '')
      : '';
    const existingNote = notesByParam[row.paramName]?.note ?? '';
    // Prefer the existing engineer note when present (they wrote it for a
    // reason); otherwise seed with the AI defer explanation if it exists.
    setDeferReason(existingNote.trim().length > 0 ? existingNote : aiExplanation);
    setDeferPopover({ anchor, row });
  }, [states, notesByParam]);

  const closeDeferPopover = useCallback(() => {
    setDeferPopover(null);
    setDeferReason('');
  }, []);

  const submitDefer = useCallback(async () => {
    if (!deferPopover) return;
    const row = deferPopover.row;
    const reason = deferReason.trim();
    setDeferSubmitting(true);
    // Optimistic — flip the row's noteStatus + parent chip counts.
    onRowFlagged?.(row.paramName, 'deferred', 'engineer');
    try {
      const existing = notesByParam[row.paramName];
      const res = await fetch(`/api/admin/atlas/unmapped-param-notes/${encodeURIComponent(row.paramName)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'deferred',
          flaggedBy: 'engineer',
          note: reason.length > 0 ? reason : (existing?.note ?? null),
          autoDiagnosis: existing?.autoDiagnosis ?? null,
          flagged: existing?.flagged ?? false,
        }),
      });
      const json = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok || !(json as { success?: boolean }).success) {
        throw new Error((json as { error?: string }).error || 'Failed to defer');
      }
      if ((json as { item?: NoteRecord }).item) {
        onNoteChange(row.paramName, (json as { item: NoteRecord }).item);
      }
      setDeferPopover(null);
      setDeferReason('');
    } catch {
      // Roll back optimistic chip-count update on error.
      const fallback = notesByParam[row.paramName];
      onRowFlagged?.(row.paramName, fallback?.status ?? null, fallback?.flaggedBy ?? null);
    } finally {
      setDeferSubmitting(false);
    }
  }, [deferPopover, deferReason, notesByParam, onRowFlagged, onNoteChange]);

  // Reopen — clears 'deferred' or 'unmappable' back to NULL so the row
  // re-enters the OPEN queue. Preserves the engineer note (it's still
  // useful context). If the row had no other signal (no note + no flag),
  // the server-side PUT handler deletes the row entirely.
  const reopenRow = useCallback(async (row: GlobalUnmappedParam) => {
    const existing = notesByParam[row.paramName];
    const prevStatus = existing?.status ?? row.noteStatus ?? null;
    const prevFlaggedBy = existing?.flaggedBy ?? row.flaggedBy ?? null;
    // Optimistic
    onRowFlagged?.(row.paramName, null, null);
    try {
      const res = await fetch(`/api/admin/atlas/unmapped-param-notes/${encodeURIComponent(row.paramName)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: null,
          flaggedBy: null,
          note: existing?.note ?? null,
          autoDiagnosis: existing?.autoDiagnosis ?? null,
          flagged: existing?.flagged ?? false,
        }),
      });
      const json = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok || !(json as { success?: boolean }).success) {
        throw new Error((json as { error?: string }).error || 'Failed to reopen');
      }
      if ((json as { item?: NoteRecord }).item) {
        onNoteChange(row.paramName, (json as { item: NoteRecord }).item);
      } else if ((json as { deleted?: boolean }).deleted) {
        onNoteChange(row.paramName, null);
      }
    } catch {
      // Roll back
      onRowFlagged?.(row.paramName, prevStatus, prevFlaggedBy);
    }
  }, [notesByParam, onRowFlagged, onNoteChange]);

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

        {/* Proactive staleness banner — replaces the previous always-visible
            "Refresh AI suggestions / investigations" buttons. Renders ONLY
            when the visible queue contains stale entries (cached against an
            older card or schema version than is currently active). Hidden
            entirely when nothing is stale, so a fresh Triage page is noise-free. */}
        {!suggestionProgress && !bulkRefreshProgress && (staleSuggestionRows.length > 0 || staleInvestigationRows.length > 0) && (
          <Alert
            severity="warning"
            icon={<RefreshIcon fontSize="small" />}
            sx={{ my: 1, py: 0.75 }}
            action={
              <Stack direction="row" spacing={1} alignItems="center">
                {/* Sort affordance — flips the table to surface stale rows
                    at the top so the engineer can refresh without scrolling.
                    Off by default; on persists for the session (state lives
                    in the table component, not localStorage). */}
                <Tooltip title={staleFirstSort
                  ? 'Restore source order'
                  : 'Sort the table so stale rows surface to the top. Operates on loaded rows — click Show more to extend the set.'}>
                  <Button
                    size="small"
                    variant={staleFirstSort ? 'contained' : 'outlined'}
                    color="warning"
                    onClick={() => setStaleFirstSort((v) => !v)}
                    sx={{ fontSize: '0.7rem' }}
                  >
                    {staleFirstSort ? 'Stale-first ✓' : 'Show stale first'}
                  </Button>
                </Tooltip>
                {staleSuggestionRows.length > 0 && (
                  <Button
                    size="small"
                    variant="contained"
                    color="warning"
                    startIcon={<RefreshIcon sx={{ fontSize: 14 }} />}
                    onClick={requestRefreshSuggestions}
                  >
                    Refresh {staleSuggestionRows.length} stale suggestion{staleSuggestionRows.length === 1 ? '' : 's'}
                  </Button>
                )}
                {staleInvestigationRows.length > 0 && (
                  <Button
                    size="small"
                    variant="outlined"
                    color="warning"
                    startIcon={<RefreshIcon sx={{ fontSize: 14 }} />}
                    onClick={requestRefreshInvestigations}
                  >
                    Refresh {staleInvestigationRows.length} stale investigation{staleInvestigationRows.length === 1 ? '' : 's'}
                  </Button>
                )}
              </Stack>
            }
          >
            <Typography variant="body2">
              {staleSuggestionRows.length > 0 && <strong>{staleSuggestionRows.length} suggestion{staleSuggestionRows.length === 1 ? '' : 's'}</strong>}
              {staleSuggestionRows.length > 0 && staleInvestigationRows.length > 0 && <> and </>}
              {staleInvestigationRows.length > 0 && <strong>{staleInvestigationRows.length} investigation{staleInvestigationRows.length === 1 ? '' : 's'}</strong>}
              {' '}in this view {staleSuggestionRows.length + staleInvestigationRows.length === 1 ? 'is' : 'are'} stale —
              the AI verdict was generated before recent domain card or schema changes.
              Refresh to see updated AI verdicts that reflect the current context.
            </Typography>
          </Alert>
        )}

        {bulkRefreshProgress && (
          <Box sx={{ my: 1 }}>
            <LinearProgress variant="determinate" value={(bulkRefreshProgress.done / bulkRefreshProgress.total) * 100} />
            <Typography variant="caption" color="text.secondary">
              Refreshing AI investigations: {bulkRefreshProgress.done} / {bulkRefreshProgress.total}
            </Typography>
          </Box>
        )}

        {suggestionProgress && (
          <Box sx={{ my: 1 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
              <Box sx={{ flex: 1 }}>
                <LinearProgress variant="determinate" value={(suggestionProgress.done / suggestionProgress.total) * 100} />
              </Box>
              {/* Stop button — sets the cancel ref. Workers finish their
                  in-flight fetch and exit before picking the next row, so
                  this is a clean stop, not an abort. */}
              <Button
                size="small"
                variant="outlined"
                color="warning"
                disabled={generateStopping}
                onClick={() => {
                  generateCancelRef.current = true;
                  setGenerateStopping(true);
                }}
                sx={{ fontSize: '0.7rem', py: 0.25 }}
              >
                {generateStopping ? 'Stopping…' : 'Stop'}
              </Button>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Generating AI suggestions: {suggestionProgress.done} / {suggestionProgress.total}
              {generateStopping ? ' — stopping after current in-flight calls' : ''}
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
                <TableCell sx={{ fontWeight: 600, width: 90 }}>
                  <Tooltip
                    arrow
                    title="Matching impact — product reach × destination attribute weight. Higher = bigger lift to recommendation quality. Sorted by this column by default."
                  >
                    <span>Impact</span>
                  </Tooltip>
                </TableCell>
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
                // Staleness signals — drive the per-row visual cues described
                // in the staleness banner section. Amber border, receded chip,
                // and ↻ icon. Computed once per row to avoid recomputing in
                // multiple cells.
                const suggestionStaleReason = getRowSuggestionStaleness(r);
                const investigationStaleReason = getRowInvestigationStaleness(r);
                const isStale = !!(suggestionStaleReason || investigationStaleReason);
                return (
                  <Fragment key={`${r.paramName}::${r.dominantFamily ?? ''}::${r.dominantCategory ?? ''}::${r.acceptedOverride?.id ?? 'no-ov'}::${rowIdx}`}>
                  <TableRow
                    sx={{
                      // Three "done" states drop opacity:
                      //   - state.accepted (synonym mapping accepted)
                      //   - confirmedFlag (auto-flag confirmed by engineer)
                      // Both visually recede so unreviewed work is at eye level.
                      opacity: state?.accepted ? 0.5 : (confirmedFlag ? 0.55 : 1),
                      // Left-border accent: red for flagged (highest signal),
                      // amber for stale (high signal, lower than flagged), none
                      // when neither. Keeps the strongest signal visible when
                      // both states overlap on the same row.
                      borderLeft: flagged || isStale ? '4px solid' : undefined,
                      borderLeftColor: flagged
                        ? (confirmedFlag ? 'text.disabled' : 'error.main')
                        : (isStale ? 'warning.main' : undefined),
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
                                ? <FlagIcon sx={{ fontSize: 16, color: 'error.main' }} />
                                : <OutlinedFlagIcon sx={{ fontSize: 16, color: 'text.disabled' }} />}
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
                        // Tooltip surfaces the human-readable family name so
                        // engineers can map "C3" → "Gate Drivers" without
                        // having to memorize the L3 ID list. Other admin
                        // panels (Dictionary, Logic, Param Mappings) all use
                        // the full English name in their family pickers.
                        (() => {
                          const fam = getFamilyDisplayName(r.dominantFamily);
                          return (
                            <Tooltip title={fam ? `${r.dominantFamily} — ${fam.full}` : r.dominantFamily}>
                              <Chip size="small" label={r.dominantFamily} variant="outlined" sx={{ fontSize: '0.6rem', height: 18 }} />
                            </Tooltip>
                          );
                        })()
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

                    <TableCell sx={{ fontSize: '0.7rem', padding: '4px 8px' }}>
                      <ImpactChip impact={r.matchingImpact} productCount={r.productCount} />
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
                          <Stack direction="row" spacing={0.5} alignItems="flex-start">
                            <Tooltip title={state.suggestion.reasoning ?? ''}>
                              <Typography variant="caption" sx={{ fontStyle: 'italic', flex: 1 }}>
                                {state.suggestion.translation}
                              </Typography>
                            </Tooltip>
                            {/* Per-row refresh ↻ — always rendered when a cached
                                suggestion exists. Stale rows (Decision #187 — card
                                or schema version drift) render the icon in warning
                                color with prepended ⚠; non-stale rows render it
                                muted as a manual on-demand refresh affordance.
                                Click re-fires /suggest with force=true so the
                                server skips its cache too. */}
                            <Tooltip title={
                              suggestionStaleReason
                                ? `⚠ Stale — ${suggestionStaleReason}. Click to refresh this row's AI suggestion.`
                                : `Refresh AI suggestion for this row (re-runs /suggest with the latest prompt).`
                            }>
                              <IconButton
                                size="small"
                                onClick={() => generateSuggestionsForRows([r], { force: true })}
                                sx={{
                                  p: 0.25,
                                  color: suggestionStaleReason ? 'warning.main' : 'text.disabled',
                                  '&:hover': { color: suggestionStaleReason ? 'warning.dark' : 'text.secondary' },
                                }}
                                aria-label={suggestionStaleReason ? 'Refresh stale AI suggestion' : 'Refresh AI suggestion'}
                              >
                                <RefreshIcon sx={{ fontSize: 14 }} />
                              </IconButton>
                            </Tooltip>
                          </Stack>
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
                        <>
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
                          {(() => {
                            const sample = r.sampleValues?.[0];
                            const preview = previewConversion(sample ?? '', state?.editedUnit ?? '');
                            if (!preview) return null;
                            return (
                              <Tooltip
                                title={
                                  preview.suspicious
                                    ? `Sample value embeds a unit that differs from the dict unit above. Value-string parsing wins at ingest, so math will be correct — but double-check the dict unit captures the typical vendor convention.`
                                    : `At ingest, sample "${sample}" with unit "${state?.editedUnit}" becomes numericValue ${preview.numericValue} (base SI). Verify this magnitude is physically plausible for ${r.paramName}.`
                                }
                                placement="top"
                                arrow
                              >
                                <Box
                                  sx={{
                                    fontSize: '0.62rem',
                                    color: preview.suspicious ? 'warning.main' : 'text.secondary',
                                    fontFamily: 'monospace',
                                    mt: 0.3,
                                    cursor: 'help',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                  }}
                                >
                                  {preview.suspicious ? '⚠ ' : ''}{preview.display}
                                </Box>
                              </Tooltip>
                            );
                          })()}
                        </>
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
                                Click to open full analysis · Confidence: {deep.confidence}
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
                                onClick={() => setDrawerParamName(r.paramName)}
                                sx={{
                                  bgcolor: meta.bg,
                                  color: meta.fg,
                                  fontSize: '0.6rem',
                                  height: 18,
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  '&:hover': { filter: 'brightness(1.15)' },
                                }}
                              />
                            </Tooltip>
                          );
                        }

                        if (!sug?.suggestion) {
                          return <span style={{ color: 'rgba(255,255,255,0.3)' }}>—</span>;
                        }
                        const isAccept = sug.suggestion === 'accept';
                        // When stale, modify the existing chip's appearance
                        // (no new chip): dotted warning border + reduced
                        // opacity so it visually recedes. The tooltip body
                        // gets a leading "⚠ Stale — …" line so the engineer
                        // sees WHY at a glance.
                        const stale = suggestionStaleReason;
                        const tooltipBody = (
                          <Box sx={{ whiteSpace: 'pre-wrap', maxWidth: 360 }}>
                            {stale && (
                              <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5, color: 'warning.light' }}>
                                ⚠ Stale — {stale}. Click ↻ to refresh.
                              </Typography>
                            )}
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
                                ...(stale && {
                                  opacity: 0.7,
                                  border: '1.5px dotted',
                                  borderColor: 'warning.main',
                                }),
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
                          {renderFindSimilarButton(r)}
                        </Stack>
                      ) : (r.noteStatus === 'deferred' || r.noteStatus === 'unmappable') ? (
                        // Parked row — engineer chose to defer or mark
                        // unmappable. Show a status chip + Reopen button so
                        // the engineer can unlock the row back to OPEN.
                        // Reopen preserves the engineer note as context.
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <Tooltip
                            title={r.noteStatus === 'deferred'
                              ? 'Parked for later — Reopen to return to the Open queue.'
                              : 'Marked unmappable — Reopen to allow mapping again.'}
                            placement="top"
                          >
                            <Chip
                              size="small"
                              icon={r.noteStatus === 'deferred'
                                ? <PauseCircleOutlineIcon sx={{ fontSize: 12 }} />
                                : <BlockOutlinedIcon sx={{ fontSize: 12 }} />}
                              label={r.noteStatus === 'deferred' ? 'Deferred' : 'Unmappable'}
                              sx={{
                                bgcolor: r.noteStatus === 'deferred' ? 'warning.dark' : 'action.disabledBackground',
                                color: r.noteStatus === 'deferred' ? 'warning.contrastText' : 'text.secondary',
                                fontSize: '0.6rem', height: 18,
                              }}
                            />
                          </Tooltip>
                          <Tooltip title="Reopen — returns the row to the Open queue. Engineer note is preserved.">
                            <span>
                              <Button
                                size="small"
                                variant="outlined"
                                color="inherit"
                                onClick={() => reopenRow(r)}
                                startIcon={<PlayArrowOutlinedIcon sx={{ fontSize: 12 }} />}
                                sx={{ fontSize: '0.6rem', minWidth: 0, px: 1, py: 0.25 }}
                              >
                                Reopen
                              </Button>
                            </span>
                          </Tooltip>
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
                          <Tooltip title="Defer — park this row out of the OPEN queue for later review. Reversible via Reopen.">
                            <span>
                              <Button
                                size="small"
                                variant="text"
                                color="warning"
                                onClick={(e) => openDeferPopover(r, e.currentTarget)}
                                startIcon={<PauseCircleOutlineIcon sx={{ fontSize: 12 }} />}
                                sx={{ fontSize: '0.6rem', minWidth: 0, px: 0.5 }}
                              >
                                Defer
                              </Button>
                            </span>
                          </Tooltip>
                          <Tooltip title="More actions">
                            <IconButton
                              size="small"
                              onClick={(e) => setParkedMenuAnchor({ anchor: e.currentTarget, row: r })}
                              sx={{ p: 0.25 }}
                            >
                              <MoreVertIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Tooltip>
                          {renderBulkMatchChip(r)}
                          {renderFindSimilarButton(r)}
                          {/* Investigate button. Visible when the row is either
                              unscoped (Accept grayed) or the AI verdict was
                              defer (Accept would be unsafe). Fires the deeper
                              /investigate pass which returns a bucketed action
                              with evidence. Hidden on confident-accept rows
                              where the engineer just needs to click Accept. */}
                          {(!getOverrideScope(r) || state?.suggestion?.suggestion === 'defer') && (
                            <>
                              {/* View: re-opens the cached deepAnalysis in the
                                  drawer without re-running /investigate. Only
                                  shown once an analysis exists. */}
                              {state?.deepAnalysis && (
                                <Tooltip title="View AI investigation">
                                  <IconButton
                                    size="small"
                                    onClick={() => setDrawerParamName(r.paramName)}
                                    sx={{ p: 0.25 }}
                                  >
                                    <VisibilityOutlinedIcon sx={{ fontSize: 14 }} />
                                  </IconButton>
                                </Tooltip>
                              )}
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
                            </>
                          )}
                        </Stack>
                      )}
                    </TableCell>
                  </TableRow>
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
        {hasMore && (
          <Stack direction="row" spacing={2} alignItems="center" justifyContent="center" sx={{ mt: 2, py: 1.5, borderTop: 1, borderColor: 'divider' }}>
            <Typography variant="caption" color="text.secondary">
              {pendingShowMore || loadingMore
                ? 'Loading more rows…'
                : `Showing ${visibleRows.length.toLocaleString()} of ${displayTotal.toLocaleString()} rows`}
            </Typography>
            <Button
              size="small"
              variant="outlined"
              disabled={pendingShowMore || loadingMore}
              startIcon={(pendingShowMore || loadingMore) ? <CircularProgress size={12} color="inherit" /> : undefined}
              onClick={handleShowMore}
            >
              {renderHidden > 0
                ? `Show ${Math.min(ROW_BATCH_SIZE, renderHidden)} more`
                : `Load ${Math.min(ROW_BATCH_SIZE, serverRemaining)} more`}
            </Button>
            {/* "Show all" intentionally removed — for queues with hundreds
                of rows it triggered browser unresponsiveness. Use the
                page-level filters (search, MFR, family, min-prods) to
                narrow the visible set instead. */}
          </Stack>
        )}
      </AccordionDetails>

      {/* Bulk-refresh confirm dialog. Per-call cost: ~$0.005 (Sonnet
          4.6 /suggest) or ~$0.05 (Sonnet 4.6 /investigate). Total
          shown to engineer so they don't accidentally burn $50 on a
          misclick over a large queue. */}
      <Dialog open={refreshConfirm !== null} onClose={() => setRefreshConfirm(null)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Refresh {refreshConfirm?.kind === 'suggestions' ? 'AI suggestions' : 'AI investigations'}?
        </DialogTitle>
        <DialogContent>
          {refreshConfirm && (() => {
            const isSuggestions = refreshConfirm.kind === 'suggestions';
            const perRowCost = isSuggestions ? 0.005 : 0.05;
            const totalCost = (refreshConfirm.count * perRowCost).toFixed(2);
            return (
              <Stack spacing={1.5}>
                <Typography variant="body2">
                  This will re-fire {isSuggestions ? '/suggest (Sonnet 4.6)' : '/investigate (Sonnet 4.6, deeper)'} for{' '}
                  <strong>{refreshConfirm.count}</strong> row{refreshConfirm.count === 1 ? '' : 's'}, bypassing the cache.
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Approximate cost: <strong>${totalCost}</strong> in Anthropic API tokens.
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {isSuggestions
                    ? 'Suggestions run in parallel (concurrency-limited). Should complete in 1-3 minutes for typical queue sizes.'
                    : 'Investigations run sequentially. Each takes 10-30 seconds — large refreshes can take a while.'}
                </Typography>
              </Stack>
            );
          })()}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRefreshConfirm(null)}>Cancel</Button>
          <Button onClick={() => void confirmRefresh()} variant="contained" color="primary" startIcon={<RefreshIcon sx={{ fontSize: 14 }} />}>
            Refresh
          </Button>
        </DialogActions>
      </Dialog>

      {/* Single-instance right-side drawer for AI Investigation results.
          Replaces the inline second-row expansion (Decision: drawer over
          inline collapse). Click any row's verdict chip OR the View icon
          button to open. Drawer auto-closes after the engineer commits
          a primary/alternative action via DeepAnalysisContent's onAfterAction. */}
      {(() => {
        const drawerRow = drawerParamName ? rows.find((r) => r.paramName === drawerParamName) ?? null : null;
        const drawerAnalysis = drawerParamName ? states[drawerParamName]?.deepAnalysis ?? null : null;
        const closeDrawer = () => setDrawerParamName(null);
        return (
          <DeepAnalysisDrawer
            open={drawerParamName !== null && drawerAnalysis !== null}
            onClose={closeDrawer}
            uid={drawerRow ? paramUid(drawerRow.paramName) : null}
            paramName={drawerRow?.paramName ?? null}
          >
            {drawerRow && drawerAnalysis && (
              <DeepAnalysisContent
                row={drawerRow}
                analysis={drawerAnalysis}
                onApplyPrefill={(payload) => applyDeepAction(drawerRow, payload)}
                onConfirmWrongFamily={() => confirmFlag(drawerRow)}
                onMarkUnmappable={() => markUnmappable(drawerRow)}
                onAfterAction={closeDrawer}
              />
            )}
          </DeepAnalysisDrawer>
        );
      })()}
      {/* Tier 2 AI Cluster modal — opens from the "Find Similar (AI)" icon
          button per row. Single-instance: only one focal can be open at a
          time. Closes on engineer Cancel or after Accept N completes. */}
      {(() => {
        if (!clusterFocalParam) return null;
        const focal = rows.find((r) => r.paramName === clusterFocalParam);
        if (!focal) return null;
        const focalState = states[clusterFocalParam];
        const attrId = focalState?.editedAttributeId?.trim();
        if (!attrId) return null;
        const scope = getOverrideScope(focal);
        if (!scope) return null;
        // Candidates are gathered SERVER-SIDE (Decision #231) over the full
        // classified set so cross-scope matches on unloaded pages are included.
        // The endpoint already excludes the focal + Tier-1 cosmetic siblings +
        // already-mapped + unscoped rows, and pre-sorts exact-normalized-key
        // first (the cluster-suggest route caps at 50, so high-likelihood hits
        // must rank first). null = still loading → show an empty list for now.
        const candidates = clusterCandidates ?? [];
        // Per-candidate scope label for the modal's Scope column chips.
        const candidateScopeLabels: Record<string, string> = {};
        for (const c of candidates) {
          const s = getOverrideScope(c);
          if (!s) continue;
          candidateScopeLabels[c.paramName] = s.kind === 'family'
            ? (getFamilyDisplayName(s.key)?.short ?? s.key)
            : s.key;
        }
        const scopeLabel = scope.kind === 'family'
          ? (getFamilyDisplayName(scope.key)?.full ?? scope.key)
          : scope.key;
        const scopeKey = `${scope.kind}::${scope.key}`;
        const focalAlreadyAccepted = focal.acceptedOverride?.isActive ?? false;
        const isGenericFocal = isGenericTerm(focal.paramName);
        return (
          <ClusterPreviewModal
            open
            focal={focal}
            focalMapping={{
              attributeId: attrId,
              attributeName: focalState.editedAttributeName.trim(),
              unit: focalState.editedUnit.trim(),
            }}
            candidates={candidates}
            scopeLabel={scopeLabel}
            scopeKey={scopeKey}
            focalAlreadyAccepted={focalAlreadyAccepted}
            crossScope
            candidateScopeLabels={candidateScopeLabels}
            isGenericFocal={isGenericFocal}
            onClose={() => setClusterFocalParam(null)}
            onAcceptCluster={async (selected) => {
              const overrideValues = {
                attributeId: attrId,
                attributeName: focalState.editedAttributeName.trim(),
                unit: focalState.editedUnit.trim(),
              };
              // 1. Accept the focal first if it isn't already accepted. Bail
              //    on failure — we MUST NOT propagate the focal's mapping to
              //    matches when the focal itself didn't persist (data integrity).
              if (!focalAlreadyAccepted) {
                const focalResult = await acceptRow(focal);
                if (!focalResult.ok) {
                  throw new Error(focalResult.error ?? 'Focal Accept failed');
                }
              }
              // 2. Tier 1 fanout — match the behavior of clicking Accept on
              //    the focal row directly, so opening the modal vs clicking
              //    Accept on the row stays consistent.
              const tier1Matches = normalizedMatchesByRow[focal.paramName] ?? [];
              const doTier1 = tier1Matches.length > 0 && !bulkOptedOut.has(focal.paramName);
              // 3. Tier 1 + Tier 2 overrides fire in parallel.
              await Promise.all([
                ...(doTier1
                  ? tier1Matches.map((m) =>
                      acceptMatchWithPrimaryOverride(m, overrideValues, focal.paramName),
                    )
                  : []),
                ...selected.map((m) =>
                  acceptMatchWithPrimaryOverride(m, overrideValues, focal.paramName),
                ),
              ]);
              // 4. Regenerate the union of affected batches.
              const allBatches = new Set<string>();
              for (const r of [focal, ...(doTier1 ? tier1Matches : []), ...selected]) {
                for (const b of r.affectedBatchIds) allBatches.add(b);
              }
              await onRegenerateAffected(Array.from(allBatches));
            }}
          />
        );
      })()}

      {/* Defer popover — small textarea anchored to the per-row Defer button.
          Reason is optional; pre-filled with the AI defer explanation when
          present so engineers don't retype context they already saw. */}
      <Popover
        open={deferPopover !== null}
        anchorEl={deferPopover?.anchor ?? null}
        onClose={closeDeferPopover}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        <Box sx={{ p: 2, width: 520 }}>
          <Typography variant="caption" sx={{ display: 'block', mb: 0.5, fontWeight: 600 }}>
            Defer this row
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            {deferPopover ? `“${deferPopover.row.paramName}”` : ''} will leave the OPEN queue and appear under the DEFERRED chip. Reversible via Reopen.
          </Typography>
          <TextField
            value={deferReason}
            onChange={(e) => setDeferReason(e.target.value)}
            placeholder="Reason (optional)"
            multiline
            minRows={6}
            maxRows={14}
            fullWidth
            size="small"
            autoFocus
            sx={{
              mb: 1.5,
              '& .MuiInputBase-input': { fontSize: '0.75rem', lineHeight: 1.5 },
            }}
          />
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button size="small" onClick={closeDeferPopover} disabled={deferSubmitting}>Cancel</Button>
            <Button
              size="small"
              variant="contained"
              color="warning"
              onClick={() => void submitDefer()}
              disabled={deferSubmitting}
              startIcon={deferSubmitting ? <CircularProgress size={10} color="inherit" /> : <PauseCircleOutlineIcon sx={{ fontSize: 14 }} />}
            >
              Defer
            </Button>
          </Stack>
        </Box>
      </Popover>

      {/* Overflow menu — Mark Unmappable (less common than Defer; lives
          here to keep the per-row action column compact). */}
      <Menu
        open={parkedMenuAnchor !== null}
        anchorEl={parkedMenuAnchor?.anchor ?? null}
        onClose={() => setParkedMenuAnchor(null)}
      >
        <MenuItem
          onClick={() => {
            const row = parkedMenuAnchor?.row;
            setParkedMenuAnchor(null);
            if (!row) return;
            if (confirm(`Mark "${row.paramName}" as Unmappable? The row leaves the OPEN queue. Reversible via Reopen.`)) {
              void markUnmappable(row);
            }
          }}
          sx={{ fontSize: '0.75rem' }}
        >
          <BlockOutlinedIcon sx={{ fontSize: 14, mr: 1, color: 'text.secondary' }} />
          Mark Unmappable
        </MenuItem>
      </Menu>
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

export interface DeepAnalysisContentProps {
  row: GlobalUnmappedParam;
  analysis: DeepAnalysis;
  onApplyPrefill: (payload: { attributeId?: string; attributeName?: string; unit?: string | null }) => void;
  onConfirmWrongFamily: () => void;
  onMarkUnmappable: () => void;
  /** Optional hook invoked after a primary/alternative action completes.
   *  Used by the drawer to auto-close so the engineer returns to the table. */
  onAfterAction?: () => void;
}

const BUCKET_LABELS: Record<DeepAnalysis['bucket'], { label: string; color: 'primary' | 'warning' | 'error' | 'info' | 'success' }> = {
  new_canonical: { label: 'New canonical', color: 'primary' },
  disambiguation: { label: 'Disambiguation', color: 'info' },
  wrong_family: { label: 'Wrong family', color: 'error' },
  unit_mismatch: { label: 'Unit mismatch', color: 'warning' },
  unscoped_products: { label: 'Unscoped products', color: 'warning' },
  unmappable: { label: 'Unmappable', color: 'error' },
};

export function DeepAnalysisContent({ row, analysis, onApplyPrefill, onConfirmWrongFamily, onMarkUnmappable, onAfterAction }: DeepAnalysisContentProps) {
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
  // Guard: reject generic words ("attribute", "id", "field") that match the
  // regex when the AI produces a non-specific label like "Create new canonical
  // attribute" — those would otherwise be committed as the literal attributeId.
  function attributeIdFromLabel(): string | undefined {
    const label = analysis.recommendation?.primaryActionLabel ?? '';
    const m = label.match(/canonical\s+`?([a-z][a-z0-9_]*)`?/i);
    if (!m || !m[1]) return undefined;
    const GENERIC_LABEL_WORDS = new Set(['attribute', 'attributes', 'id', 'field', 'name', 'value', 'parameter', 'param']);
    if (GENERIC_LABEL_WORDS.has(m[1].toLowerCase())) return undefined;
    return m[1];
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
    onAfterAction?.();
  };

  const handleAlternative = () => {
    if (analysis.bucket !== 'disambiguation') return;
    const altSource = (altPayload.alternative as Record<string, unknown> | undefined) ?? altPayload;
    onApplyPrefill({
      attributeId: pickAttributeId(altSource),
      attributeName: pickAttributeName(altSource),
      unit: pickUnit(altSource),
    });
    onAfterAction?.();
  };

  return (
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
                Signature that will be persisted on Confirm:
              </Typography>
              <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>
                {JSON.stringify(signatureRecommendation)}
              </Typography>
            </Box>
          )}

          {/* Server-side post-validation warnings — suppress the primary
              action button when the AI's recommendation is provably bad
              (invalid family ID or duplicate canonical). Engineer must
              review manually rather than clicking through. */}
          {analysis.validationErrors && analysis.validationErrors.length > 0 && (
            <Box
              sx={{
                p: 1,
                mb: 1,
                bgcolor: 'warning.dark',
                color: 'warning.contrastText',
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'warning.main',
              }}
            >
              <Stack direction="row" spacing={1} alignItems="flex-start">
                <WarningAmberIcon sx={{ fontSize: 18, mt: 0.25, flexShrink: 0 }} />
                <Box>
                  <Typography variant="caption" sx={{ fontWeight: 600, display: 'block' }}>
                    AI recommendation failed server-side validation — review manually
                  </Typography>
                  {analysis.validationErrors.map((err, i) => (
                    <Typography
                      key={i}
                      variant="caption"
                      sx={{ display: 'block', fontSize: '0.7rem', mt: 0.25 }}
                    >
                      • {err.detail}
                    </Typography>
                  ))}
                </Box>
              </Stack>
            </Box>
          )}

          {/* Action buttons — hidden when validation errors are present so
              the engineer can't accidentally click through to a bad action.
              For wrong_family we override the AI's primaryActionLabel
              because the AI tends to write copy implying both code-registry
              edit + reclassification happen on click. Both DO happen now
              (signature-insert endpoint handles persist + retroactive
              reclassify) — so the override here states it plainly without
              overpromising the wording. */}
          <Stack direction="row" spacing={1}>
            {analysis.recommendation?.primaryActionLabel
              && analysis.bucket !== 'unscoped_products'
              && !(analysis.validationErrors && analysis.validationErrors.length > 0) && (
              <Button
                size="small"
                variant="contained"
                color={analysis.bucket === 'unmappable' ? 'error' : analysis.bucket === 'wrong_family' ? 'error' : 'primary'}
                startIcon={analysis.bucket === 'unmappable' ? <BlockOutlinedIcon sx={{ fontSize: 14 }} /> : <CheckIcon sx={{ fontSize: 14 }} />}
                onClick={handlePrimary}
                sx={{ fontSize: '0.7rem' }}
              >
                {analysis.bucket === 'wrong_family' && signatureRecommendation?.familyId
                  ? `Confirm: reclassify to ${signatureRecommendation.familyId} + add signature`
                  : analysis.recommendation.primaryActionLabel}
              </Button>
            )}
            {analysis.bucket === 'disambiguation'
              && analysis.recommendation?.alternativeActionLabel
              && !(analysis.validationErrors && analysis.validationErrors.length > 0) && (
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
            {/* Engineer escape hatch. The AI sometimes mis-buckets a pure
                test-condition / metadata param as 'disambiguation' or
                'new_canonical' (e.g. Galaxy 'Condition1_IC', '@Ic(mA)' —
                the current/voltage AT WHICH another spec is measured). When
                the engineer judges the param unmappable but the AI did not,
                there'd otherwise be no path to status='unmappable' from this
                drawer. Always offer it except when the AI already picked
                'unmappable' (its primary button does this). Hidden under
                validation errors like the other actions. */}
            {analysis.bucket !== 'unmappable'
              && !(analysis.validationErrors && analysis.validationErrors.length > 0) && (
              <Tooltip title="Override the AI: record this paramName as unmappable test-condition / metadata and drop it from the queue.">
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  startIcon={<BlockOutlinedIcon sx={{ fontSize: 14 }} />}
                  onClick={() => { onMarkUnmappable(); onAfterAction?.(); }}
                  sx={{ fontSize: '0.7rem' }}
                >
                  Mark unmappable instead
                </Button>
              </Tooltip>
            )}
            {/* Acknowledge param row.paramName so unused-prop lint stays quiet
                and the row identity is queryable from devtools. */}
            <Typography variant="caption" sx={{ color: 'text.disabled', alignSelf: 'center' }}>
              paramName: {row.paramName}
            </Typography>
          </Stack>
        </Stack>
  );
}
