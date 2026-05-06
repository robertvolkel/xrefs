'use client';

/**
 * GlobalUnmappedParamsTable — deduplicated cross-batch unmapped-params list with
 * AI-assisted dictionary triage (Phase 3-A).
 *
 * Per row:
 *   1. Calls /api/admin/atlas/dictionaries/suggest with paramName + samples + dominantFamily
 *      to get a Claude Haiku-proposed translation + attributeId + confidence.
 *   2. Renders the suggestion as an editable Autocomplete pre-filled with the AI choice.
 *   3. "Accept" creates an `add` override in atlas_dictionary_overrides (server-side),
 *      then triggers regeneration of every batch that surfaced this param.
 *
 * Bulk action: "Accept All High Confidence" iterates rows whose AI suggestion came
 * back as `confidence: 'high'` and creates/regenerates them in concurrency-limited parallel.
 *
 * Performance:
 *   - Suggestions are fetched lazily on first table-open per session (cached in component state).
 *   - Concurrency-limited to 6 parallel suggestion calls so we don't slam Anthropic
 *     when there are hundreds of params.
 *   - Failed suggestion fetches degrade to a manual entry row with no auto-fill.
 */

import { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
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
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import HelpOutlineOutlinedIcon from '@mui/icons-material/HelpOutlineOutlined';
import type { GlobalUnmappedParam, DictSuggestion } from './types';
import { getLogicTable } from '@/lib/logicTables';

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

interface Props {
  rows: GlobalUnmappedParam[];
  onRegenerateAffected: (batchIds: string[]) => Promise<void>;
  pendingBatchCount: number;
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
const ACCEPT_CONCURRENCY = 4;
// localStorage key prefix for cached AI suggestions. Keyed by paramName + familyId.
// Suggestions survive page reloads + tab switches without re-hitting the server.
// Server cache (24h) provides a second layer if storage is cleared.
const SUGGEST_LS_PREFIX = 'atlas-ingest-ai-suggest:';
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

const CONFIDENCE_COLOR: Record<DictSuggestion['confidence'], { bg: string; fg: string }> = {
  high:   { bg: 'success.dark', fg: 'success.contrastText' },
  medium: { bg: 'warning.dark', fg: 'warning.contrastText' },
  low:    { bg: 'error.dark',   fg: 'error.contrastText' },
};

export default function GlobalUnmappedParamsTable({ rows, onRegenerateAffected, pendingBatchCount }: Props) {
  // Default expanded so users see the AI-triage flow without an extra click —
  // this is the most-used panel of the page when there are unmapped params.
  const [expanded, setExpanded] = useState(true);
  const [states, setStates] = useState<Record<string, RowState>>({});
  const [bulkRunning, setBulkRunning] = useState(false);
  const [suggestionProgress, setSuggestionProgress] = useState<{ done: number; total: number } | null>(null);
  const fetchedRef = useRef(false);
  // Per-family canonical attributeId set, populated from the suggest endpoint.
  // Used to flag whether the row's (possibly edited) attributeId actually
  // exists in the family's logic table. Empty set ⇒ family had no schema info.
  const [schemaByFamily, setSchemaByFamily] = useState<Record<string, Set<string>>>({});

  const total = rows.length;
  // sum of per-param product counts — this counts a product N times if it has N
  // unmapped params, so we label it as "param-mentions" not "products"
  const totalParamMentions = rows.reduce((s, r) => s + r.productCount, 0);

  // Show the suggestion-fetch progress in the header even when collapsed so users
  // see processing happening before they expand.
  const fetchInFlight = !!suggestionProgress;

  // ─── Lazy load suggestions on first expand ──────────────
  // Two-layer cache before hitting Anthropic:
  //   1. localStorage (per-browser, 7-day TTL) — persists across page reloads
  //   2. Server in-memory cache (per-process, 24h TTL) — shared across browsers
  // Cached rows populate state synchronously without changing the progress count.
  const fetchAllSuggestions = useCallback(async () => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    // Pass 1 — synchronously hydrate from localStorage. Tracks how many rows
    // still need the server roundtrip so the progress bar reflects real work.
    // Also seed the family schema state from its own per-family cache so the
    // canonical/invented indicators light up before any API roundtrip.
    const initialStates: Record<string, RowState> = {};
    const initialSchemaByFamily: Record<string, Set<string>> = {};
    const seenFamilies = new Set<string>();
    const queue: GlobalUnmappedParam[] = [];
    for (const row of rows) {
      if (row.dominantFamily && !seenFamilies.has(row.dominantFamily)) {
        seenFamilies.add(row.dominantFamily);
        const cachedSchema = readFamilySchemaCache(row.dominantFamily);
        if (cachedSchema && cachedSchema.length > 0) {
          initialSchemaByFamily[row.dominantFamily] = new Set(cachedSchema);
        }
      }
      const cached = readSuggestionCache(row.paramName, row.dominantFamily);
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
        initialStates[row.paramName] = {
          suggestion: null,
          loadingSuggestion: true,
          editedAttributeId: '',
          editedAttributeName: '',
          editedUnit: '',
          accepted: false,
          acceptError: null,
          accepting: false,
        };
        queue.push(row);
      }
    }
    setStates((prev) => ({ ...prev, ...initialStates }));
    if (Object.keys(initialSchemaByFamily).length > 0) {
      setSchemaByFamily((prev) => ({ ...prev, ...initialSchemaByFamily }));
    }

    // Schema fallback: any family that has rows but didn't get a schema from
    // localStorage AND won't get one from /suggest (because all its rows hit
    // the cache path) needs an explicit fetch — otherwise the indicators stay
    // dark forever. The endpoint is cheap (no LLM, no DB) so this is fine to
    // do on every mount where the local cache lacks the schema.
    const familiesNeedingSchema: string[] = [];
    const familiesInQueue = new Set(queue.map((r) => r.dominantFamily).filter((f): f is string => !!f));
    for (const fam of seenFamilies) {
      if (!initialSchemaByFamily[fam] && !familiesInQueue.has(fam)) {
        familiesNeedingSchema.push(fam);
      }
    }
    if (familiesNeedingSchema.length > 0) {
      Promise.all(familiesNeedingSchema.map(async (fam) => {
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

    if (queue.length === 0) {
      setSuggestionProgress(null);
      return;
    }

    setSuggestionProgress({ done: 0, total: queue.length });

    let done = 0;
    let next = 0;

    async function worker() {
      while (next < queue.length) {
        const row = queue[next++];
        if (!row) break;
        const key = row.paramName;
        try {
          const res = await fetch('/api/admin/atlas/dictionaries/suggest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              paramName: row.paramName,
              samples: row.sampleValues,
              familyId: row.dominantFamily ?? '',
            }),
          });
          const json = await res.json();
          const suggestion: DictSuggestion | null = json?.success ? json.suggestion : null;
          if (suggestion) {
            writeSuggestionCache(row.paramName, row.dominantFamily, suggestion);
          }
          // Capture the schema list returned alongside the suggestion. We only need
          // it once per family so the conditional setSchemaByFamily check avoids
          // rerendering rows whose family already has the set populated. Also
          // persist to localStorage so the next page load lights up indicators
          // synchronously (no API roundtrip needed).
          if (Array.isArray(json?.schemaIds) && row.dominantFamily) {
            const fam = row.dominantFamily;
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
  }, [rows]);

  useEffect(() => {
    if (expanded && !fetchedRef.current && rows.length > 0) {
      fetchAllSuggestions();
    }
  }, [expanded, rows.length, fetchAllSuggestions]);

  // ─── Per-row Accept ────────────────────────────────────
  const acceptRow = useCallback(async (row: GlobalUnmappedParam): Promise<{ ok: boolean; error?: string }> => {
    const state = states[row.paramName];
    if (!state || state.accepted) return { ok: true };
    if (!state.editedAttributeId.trim() || !state.editedAttributeName.trim()) {
      return { ok: false, error: 'attributeId and attributeName required' };
    }
    if (!row.dominantFamily) {
      return { ok: false, error: 'No dominant family — pick a family manually via Atlas Dictionaries panel' };
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
          familyId: row.dominantFamily,
          paramName: row.paramName.toLowerCase(),
          action: 'add',
          attributeId: state.editedAttributeId.trim(),
          attributeName: state.editedAttributeName.trim(),
          unit: state.editedUnit.trim() || undefined,
          changeReason: `AI-assisted ingest triage (confidence: ${state.suggestion?.confidence ?? 'manual'})`,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `Save failed (${res.status})`);

      setStates((prev) => ({
        ...prev,
        [row.paramName]: { ...prev[row.paramName], accepted: true, accepting: false, acceptError: null },
      }));
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Accept failed';
      setStates((prev) => ({
        ...prev,
        [row.paramName]: { ...prev[row.paramName], accepting: false, acceptError: msg },
      }));
      return { ok: false, error: msg };
    }
  }, [states]);

  const acceptAndRegenerate = useCallback(async (row: GlobalUnmappedParam) => {
    const result = await acceptRow(row);
    if (result.ok) {
      await onRegenerateAffected(row.affectedBatchIds);
    }
  }, [acceptRow, onRegenerateAffected]);

  // ─── Bulk accept all high-confidence ────────────────────
  // Eligibility for bulk-accept:
  //   confidence === 'high' AND we have a dominantFamily AND we have an editedAttributeId
  //   AND (the family has no known schema  OR  the attributeId is canonical in that schema).
  // Excluding the "high-confidence but invented attributeId for a known family" case
  // protects against silently storing values under made-up IDs that no rule ever scores.
  // Those rows still appear in the table for manual review with the amber indicator.
  const isBulkEligible = useCallback((r: GlobalUnmappedParam): boolean => {
    const s = states[r.paramName];
    if (!s || s.accepted) return false;
    if (s.suggestion?.confidence !== 'high') return false;
    if (!r.dominantFamily) return false;
    const editedId = s.editedAttributeId?.trim() ?? '';
    if (!editedId) return false;
    const schema = schemaByFamily[r.dominantFamily];
    if (schema && schema.size > 0) {
      return schema.has(editedId);
    }
    return true; // no schema known → bypass the canonical check
  }, [states, schemaByFamily]);

  const highConfidenceCount = useMemo(() => rows.filter(isBulkEligible).length, [rows, isBulkEligible]);

  const acceptAllHighConfidence = useCallback(async () => {
    if (!confirm(`Create ${highConfidenceCount} dictionary overrides from high-confidence AI suggestions (only canonical attributeIds), then regenerate every affected batch? Reversible per-override via the Atlas Dictionaries panel.`)) return;
    setBulkRunning(true);
    const targets = rows.filter(isBulkEligible);
    const allBatchIds = new Set<string>();
    let ok = 0, failed = 0;
    let idx = 0;
    async function worker() {
      while (idx < targets.length) {
        const r = targets[idx++];
        const result = await acceptRow(r);
        if (result.ok) {
          ok++;
          for (const id of r.affectedBatchIds) allBatchIds.add(id);
        } else {
          failed++;
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(ACCEPT_CONCURRENCY, targets.length) }, () => worker()));
    if (allBatchIds.size > 0) {
      await onRegenerateAffected([...allBatchIds]);
    }
    setBulkRunning(false);
    if (failed > 0) {
      alert(`${ok} accepted, ${failed} failed. Check individual rows for errors.`);
    }
  }, [rows, states, highConfidenceCount, acceptRow, onRegenerateAffected]);

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
          {expanded && highConfidenceCount > 0 && !bulkRunning && (
            <Typography variant="caption" sx={{ ml: 'auto', mr: 2, color: 'success.light', fontWeight: 600 }}>
              {highConfidenceCount} high-confidence ready
            </Typography>
          )}
          {bulkRunning && (
            <Box sx={{ ml: 'auto', mr: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={16} />
              <Typography variant="caption">Bulk-accepting…</Typography>
            </Box>
          )}
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Each row gets an AI-suggested mapping (Claude Haiku, schema-aware via dominant family).
            Edit the attributeId/Name inline if needed, then <strong>Accept</strong> to create a dictionary override
            and regenerate affected batches.
          </Typography>
          {highConfidenceCount > 0 && !bulkRunning && (
            <Button
              size="small"
              variant="contained"
              color="success"
              startIcon={<AutoAwesomeIcon />}
              onClick={acceptAllHighConfidence}
              sx={{ flexShrink: 0 }}
            >
              Accept all {highConfidenceCount} high-confidence
            </Button>
          )}
        </Stack>

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
                <TableCell sx={{ fontWeight: 600, width: 140 }}>Raw Attribute Name</TableCell>
                <TableCell sx={{ fontWeight: 600, width: 70 }}>Family</TableCell>
                <TableCell sx={{ fontWeight: 600, width: 160 }}>Category</TableCell>
                <TableCell sx={{ fontWeight: 600, width: 180 }}>Sample values</TableCell>
                <TableCell sx={{ fontWeight: 600, width: 60 }}>Prods</TableCell>
                <TableCell sx={{ fontWeight: 600, width: 180 }}>AI translation</TableCell>
                <TableCell sx={{ fontWeight: 600, width: 300 }}>attributeId</TableCell>
                <TableCell sx={{ fontWeight: 600, width: 240 }}>attributeName</TableCell>
                <TableCell sx={{ fontWeight: 600, width: 90 }}>Unit</TableCell>
                <TableCell sx={{ fontWeight: 600, width: 80 }}>Conf.</TableCell>
                <TableCell sx={{ fontWeight: 600, width: 100 }}>Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => {
                const state = states[r.paramName];
                const confidence = state?.suggestion?.confidence;
                const cConf = confidence ? CONFIDENCE_COLOR[confidence] : null;
                return (
                  <TableRow key={r.paramName} sx={{ opacity: state?.accepted ? 0.5 : 1 }}>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.7rem', width: 140, wordBreak: 'break-word' }}>
                      {r.paramName}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.7rem' }}>
                      {r.dominantFamily ? (
                        <Chip size="small" label={r.dominantFamily} variant="outlined" sx={{ fontSize: '0.6rem', height: 18 }} />
                      ) : (
                        <Tooltip title="No dominant family — manual family selection required">
                          <Chip size="small" label="?" variant="outlined" color="warning" sx={{ fontSize: '0.6rem', height: 18 }} />
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
                      {(() => {
                        const fam = getFamilyDisplayName(r.dominantFamily);
                        if (!fam) return <span style={{ color: 'rgba(255,255,255,0.3)' }}>—</span>;
                        return (
                          <Tooltip title={fam.full}>
                            <span>{fam.short}</span>
                          </Tooltip>
                        );
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
                      {state?.loadingSuggestion ? (
                        <CircularProgress size={12} />
                      ) : state?.suggestion?.translation ? (
                        <Tooltip title={state.suggestion.reasoning ?? ''}>
                          <Typography variant="caption" sx={{ fontStyle: 'italic' }}>
                            {state.suggestion.translation}
                          </Typography>
                        </Tooltip>
                      ) : <span style={{ color: 'rgba(255,255,255,0.4)' }}>—</span>}
                    </TableCell>
                    <TableCell sx={{ width: 300 }}>
                      {(() => {
                        const editedId = state?.editedAttributeId?.trim() ?? '';
                        const familySchema = r.dominantFamily ? schemaByFamily[r.dominantFamily] : undefined;
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
                    </TableCell>
                    <TableCell sx={{ width: 90 }}>
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
                    </TableCell>
                    <TableCell>
                      {confidence && cConf ? (
                        <Chip size="small" label={confidence} sx={{ bgcolor: cConf.bg, color: cConf.fg, fontSize: '0.6rem', height: 18 }} />
                      ) : <span style={{ color: 'rgba(255,255,255,0.3)' }}>—</span>}
                    </TableCell>
                    <TableCell>
                      {state?.accepted ? (
                        <Chip size="small" icon={<CheckIcon sx={{ fontSize: 14 }} />} label="Saved" color="success" sx={{ fontSize: '0.6rem', height: 18 }} />
                      ) : (
                        <Tooltip title={state?.acceptError ?? ''} disableHoverListener={!state?.acceptError}>
                          <span>
                            <Button
                              size="small"
                              variant="outlined"
                              color={state?.acceptError ? 'error' : 'primary'}
                              disabled={state?.accepting || state?.loadingSuggestion || !state?.editedAttributeId || !r.dominantFamily}
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
      </AccordionDetails>
    </Accordion>
  );
}
