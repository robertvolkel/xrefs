'use client';

/**
 * ClusterPreviewModal — Tier 2 AI near-duplicate clustering for the Atlas
 * Dictionary Triage queue. Opens from the "Find Similar (AI)" button on a
 * focal row, calls /api/admin/atlas/dictionaries/cluster-suggest with the
 * focal + the open candidates in the same scope, and renders a checkbox
 * grid so the engineer can bulk-Accept N near-duplicates with the focal's
 * already-chosen mapping.
 *
 * Why this exists alongside the existing "+N similar" Tier 1 chip:
 *  Tier 1 is deterministic — exact-normalized-key + ASCII-only single-char
 *  fuzzy. It catches whitespace / case / punctuation variants and ASCII
 *  typos. It deliberately does NOT touch CJK characters (a 1-char edit on
 *  "电压" flips meaning to "电流") and does NOT strip unit suffixes
 *  ("电压(V)" must stay distinct from "电压(mV)" so bulk-apply can't
 *  propagate the wrong unit). Tier 2 handles those harder cases via the AI
 *  with sample-value evidence + confidence + per-row reasoning the engineer
 *  reviews before confirming.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Link,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import type { GlobalUnmappedParam } from './types';

export type ClusterVerdict = {
  paramName: string;
  isMatch: boolean;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
};

type Props = {
  open: boolean;
  focal: GlobalUnmappedParam;
  focalMapping: {
    attributeId: string;
    attributeName: string;
    unit: string;
  };
  /** Open in-scope candidates (caller has already filtered to same scope +
   *  excluded the focal + excluded actively-mapped rows). */
  candidates: GlobalUnmappedParam[];
  scopeLabel: string;
  scopeKey: string; // e.g. "family::B5" — used for the localStorage cache key
  /** True when the focal row already has an active override (engineer
   *  Accepted it before opening the modal). When true, the confirm button
   *  reads "Accept N matches"; when false, it reads "Accept focal + N
   *  matches" because the parent will Accept the focal in the same flow. */
  focalAlreadyAccepted: boolean;
  onClose: () => void;
  /** Engineer confirmed — accept the focal (if not already accepted) AND
   *  apply focal's mapping to these candidate rows. Caller wires through
   *  acceptRow + acceptMatchWithPrimaryOverride + Tier 1 fanout. */
  onAcceptCluster: (selected: GlobalUnmappedParam[]) => Promise<void>;
};

const CACHE_PREFIX = 'atlas-cluster-suggest-v1:';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

type CacheEntry = {
  clusters: ClusterVerdict[];
  cachedAt: number;
};

function readCache(scopeKey: string, focalParamName: string): ClusterVerdict[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`${CACHE_PREFIX}${scopeKey}:${focalParamName}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (Date.now() - parsed.cachedAt > CACHE_TTL_MS) return null;
    return parsed.clusters;
  } catch {
    return null;
  }
}

function writeCache(scopeKey: string, focalParamName: string, clusters: ClusterVerdict[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      `${CACHE_PREFIX}${scopeKey}:${focalParamName}`,
      JSON.stringify({ clusters, cachedAt: Date.now() } satisfies CacheEntry),
    );
  } catch {
    // localStorage full or disabled — fail-open, modal still works without cache.
  }
}

function confidenceColor(c: ClusterVerdict['confidence']): 'success' | 'info' | 'default' {
  if (c === 'high') return 'success';
  if (c === 'medium') return 'info';
  return 'default';
}

export function ClusterPreviewModal({
  open,
  focal,
  focalMapping,
  candidates,
  scopeLabel,
  scopeKey,
  focalAlreadyAccepted,
  onClose,
  onAcceptCluster,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verdicts, setVerdicts] = useState<ClusterVerdict[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  // Rejections (AI verdict = 'distinct') are hidden by default — engineers
  // shouldn't have to scan unrelated paramNames the AI already ruled out.
  // Expand on demand via the "Show N rejected" link to audit the reasoning.
  const [showRejected, setShowRejected] = useState(false);

  // On open: hydrate from cache or fetch fresh verdicts.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setSelected(new Set());
    setShowRejected(false);

    const cached = readCache(scopeKey, focal.paramName);
    if (cached) {
      // Filter cached verdicts to currently-visible candidates — a cached row
      // that's since been Accepted won't be in `candidates` anymore.
      const candidateNames = new Set(candidates.map((c) => c.paramName));
      const fresh = cached.filter((v) => candidateNames.has(v.paramName));
      setVerdicts(fresh);
      setSelected(new Set(fresh.filter((v) => v.isMatch && v.confidence !== 'low').map((v) => v.paramName)));
      setLoading(false);
      return;
    }

    if (candidates.length === 0) {
      setVerdicts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    (async () => {
      try {
        const resp = await fetch('/api/admin/atlas/dictionaries/cluster-suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            focal: {
              paramName: focal.paramName,
              samples: focal.sampleValues,
            },
            candidates: candidates.map((c) => ({
              paramName: c.paramName,
              samples: c.sampleValues,
            })),
            scopeLabel,
          }),
        });
        const json = await resp.json();
        if (cancelled) return;
        if (!resp.ok || !json.success) {
          setError(json.error || 'AI cluster lookup failed');
          setVerdicts([]);
        } else {
          const clusters = (json.clusters || []) as ClusterVerdict[];
          setVerdicts(clusters);
          // Default-check high + medium confidence matches; low requires
          // explicit engineer opt-in (the false-positive risk is real).
          setSelected(new Set(clusters.filter((v) => v.isMatch && v.confidence !== 'low').map((v) => v.paramName)));
          writeCache(scopeKey, focal.paramName, clusters);
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'AI cluster lookup failed');
        setVerdicts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, focal.paramName, focal.sampleValues, candidates, scopeKey, scopeLabel]);

  const candidateByName = useMemo(() => {
    const m = new Map<string, GlobalUnmappedParam>();
    for (const c of candidates) m.set(c.paramName, c);
    return m;
  }, [candidates]);

  // Matches sorted high → medium → low. Rejections sorted high → medium → low
  // too (engineer auditing a wrong rejection is more interested in the
  // confident wrongs than the uncertain ones). The two lists are rendered
  // separately so the engineer sees actionable matches first and only
  // sees the rejections if they explicitly expand them.
  const { matchVerdicts, rejectedVerdicts } = useMemo(() => {
    const confOrder = { high: 0, medium: 1, low: 2 };
    const matches: ClusterVerdict[] = [];
    const rejected: ClusterVerdict[] = [];
    for (const v of verdicts) {
      (v.isMatch ? matches : rejected).push(v);
    }
    matches.sort((a, b) => confOrder[a.confidence] - confOrder[b.confidence]);
    rejected.sort((a, b) => confOrder[a.confidence] - confOrder[b.confidence]);
    return { matchVerdicts: matches, rejectedVerdicts: rejected };
  }, [verdicts]);

  const matchCount = matchVerdicts.length;
  const rejectedCount = rejectedVerdicts.length;

  const toggleRow = useCallback((paramName: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(paramName)) next.delete(paramName);
      else next.add(paramName);
      return next;
    });
  }, []);

  const handleConfirm = useCallback(async () => {
    if (selected.size === 0) return;
    const toApply: GlobalUnmappedParam[] = [];
    for (const name of selected) {
      const row = candidateByName.get(name);
      if (row) toApply.push(row);
    }
    if (toApply.length === 0) return;
    setSubmitting(true);
    try {
      await onAcceptCluster(toApply);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bulk-apply failed');
    } finally {
      setSubmitting(false);
    }
  }, [selected, candidateByName, onAcceptCluster, onClose]);

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <AutoAwesomeIcon fontSize="small" sx={{ color: 'primary.main' }} />
        <span>Find Similar (AI)</span>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Box>
            <Typography variant="caption" color="text.secondary">
              FOCAL PARAM — {focalAlreadyAccepted
                ? 'your override mapping will bulk-apply to all checked candidates'
                : 'on confirm, the focal will be Accepted and the same mapping will bulk-apply to all checked candidates'}
            </Typography>
            <Box sx={{ mt: 0.5, p: 1.25, bgcolor: 'action.hover', borderRadius: 1 }}>
              <Typography variant="body2" fontWeight={500}>
                {focal.paramName}
              </Typography>
              {focal.sampleValues.length > 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                  Samples: {focal.sampleValues.slice(0, 5).join(', ')}
                </Typography>
              )}
              <Stack direction="row" spacing={0.5} sx={{ mt: 0.75 }}>
                <Chip size="small" label={focalMapping.attributeId} variant="outlined" />
                <Chip size="small" label={focalMapping.attributeName} variant="outlined" color="primary" />
                {focalMapping.unit && (
                  <Chip size="small" label={focalMapping.unit} variant="outlined" />
                )}
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                Scope: {scopeLabel}
              </Typography>
            </Box>
          </Box>

          <Divider />

          {loading && (
            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ py: 2, justifyContent: 'center' }}>
              <CircularProgress size={18} />
              <Typography variant="body2" color="text.secondary">
                Asking AI to evaluate {candidates.length} candidate{candidates.length === 1 ? '' : 's'}…
              </Typography>
            </Stack>
          )}

          {error && (
            <Alert severity="error">{error}</Alert>
          )}

          {!loading && !error && verdicts.length === 0 && candidates.length === 0 && (
            <Alert severity="info">
              There are no other open rows in this scope to evaluate.
            </Alert>
          )}

          {!loading && !error && verdicts.length > 0 && matchCount === 0 && (
            <Alert severity="info">
              AI evaluated {verdicts.length} candidate{verdicts.length === 1 ? '' : 's'} in this scope
              and found no near-duplicates of &ldquo;{focal.paramName}&rdquo;.
            </Alert>
          )}

          {!loading && matchCount > 0 && (
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                AI flagged {matchCount} near-duplicate{matchCount === 1 ? '' : 's'} of &ldquo;{focal.paramName}&rdquo;.
                High + medium confidence are pre-checked; low confidence requires explicit selection.
              </Typography>
              <TableContainer sx={{ maxHeight: 380, border: 1, borderColor: 'divider', borderRadius: 1 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell padding="checkbox" />
                      <TableCell>Candidate paramName</TableCell>
                      <TableCell>Samples</TableCell>
                      <TableCell>Confidence</TableCell>
                      <TableCell>Reasoning</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {matchVerdicts.map((v) => {
                      const cand = candidateByName.get(v.paramName);
                      const checked = selected.has(v.paramName);
                      return (
                        <TableRow
                          key={v.paramName}
                          hover
                          onClick={() => toggleRow(v.paramName)}
                          sx={{ cursor: 'pointer' }}
                        >
                          <TableCell padding="checkbox">
                            <Checkbox
                              size="small"
                              checked={checked}
                              onChange={() => toggleRow(v.paramName)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">{v.paramName}</Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="caption" color="text.secondary">
                              {(cand?.sampleValues || []).slice(0, 3).join(', ') || '—'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={v.confidence}
                              color={confidenceColor(v.confidence)}
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell>
                            <Typography variant="caption" color="text.secondary">
                              {v.reasoning}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}

          {/* Rejected-candidate audit panel — collapsed by default. Lets the
              engineer verify the AI's "distinct" verdicts without forcing
              everyone to scan unrelated paramNames on every open. */}
          {!loading && rejectedCount > 0 && (
            <Box>
              <Link
                component="button"
                type="button"
                underline="hover"
                onClick={() => setShowRejected((v) => !v)}
                sx={{ fontSize: '0.75rem', color: 'text.secondary' }}
              >
                {showRejected
                  ? `Hide ${rejectedCount} rejected candidate${rejectedCount === 1 ? '' : 's'}`
                  : `Show ${rejectedCount} rejected candidate${rejectedCount === 1 ? '' : 's'} (AI verdict: distinct)`}
              </Link>
              <Collapse in={showRejected}>
                <TableContainer sx={{ mt: 1, maxHeight: 280, border: 1, borderColor: 'divider', borderRadius: 1, opacity: 0.85 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>Rejected paramName</TableCell>
                        <TableCell>Samples</TableCell>
                        <TableCell>Confidence</TableCell>
                        <TableCell>Why distinct</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rejectedVerdicts.map((v) => {
                        const cand = candidateByName.get(v.paramName);
                        return (
                          <TableRow key={v.paramName}>
                            <TableCell>
                              <Typography variant="body2">{v.paramName}</Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="caption" color="text.secondary">
                                {(cand?.sampleValues || []).slice(0, 3).join(', ') || '—'}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Chip
                                size="small"
                                label={v.confidence}
                                color={confidenceColor(v.confidence)}
                                variant="outlined"
                              />
                            </TableCell>
                            <TableCell>
                              <Typography variant="caption" color="text.secondary">
                                {v.reasoning}
                              </Typography>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Collapse>
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleConfirm}
          disabled={loading || submitting || selected.size === 0}
          startIcon={submitting ? <CircularProgress size={14} color="inherit" /> : null}
        >
          {submitting
            ? 'Applying…'
            : focalAlreadyAccepted
            ? `Accept ${selected.size} match${selected.size === 1 ? '' : 'es'}`
            : `Accept focal + ${selected.size} match${selected.size === 1 ? '' : 'es'}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
