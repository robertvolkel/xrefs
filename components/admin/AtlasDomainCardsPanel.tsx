'use client';

/**
 * AtlasDomainCardsPanel — admin surface for managing per-family domain
 * knowledge cards used by the Triage AI.
 *
 * Engineer flow:
 *   1. See a table of every L3 family with current card status (none /
 *      draft / active / TS-fallback).
 *   2. Click "Generate" on a family with no card → server fires Opus 4.7
 *      → returns a draft card → status='draft' row inserted.
 *   3. Open the draft via "Review", read the generated text, optionally
 *      edit, then click "Approve" to flip status to 'active'. From that
 *      point the card is injected into every Triage AI call for that family.
 *   4. "Regenerate" on an existing card runs Opus again with the latest
 *      data; the new draft replaces the previous row.
 *
 * Hand-written TS-fallback cards (the original 7) appear as 'active'
 * with source='ts'. They can be regenerated to migrate them into the
 * DB-backed flow.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Box,
  Stack,
  Typography,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Chip,
  Button,
  IconButton,
  Drawer,
  TextField,
  CircularProgress,
  Alert,
  Tooltip,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import type { Theme } from '@mui/material/styles';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import RefreshIcon from '@mui/icons-material/Refresh';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import { diffWordsWithSpace } from 'diff';
import type { CardAuditResult } from '@/lib/services/atlasFamilyCardAuditTypes';
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CloseIcon from '@mui/icons-material/Close';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';

interface DataSnapshot {
  ruleCount?: number;
  acceptedCount?: number;
  signatureCount?: number;
  crossFamilyCount?: number;
  generatedAt?: string;
}

type HealthLevel =
  | 'no-card'
  | 'refresh-recommended'
  | 'consider-refresh'
  | 'ok'
  | 'no-data';

interface HealthDetail {
  level: HealthLevel;
  flagCount: number;
  ruleDrift: number;
  /** Phase 2 of Decision #192 — atlas product/MFR drift since the card's
   *  grounding snapshot. For no-card families these fields carry the
   *  current absolute counts (used to differentiate HIGH/MED/LOW
   *  uncarded families visually). */
  groundingProductDrift: number;
  groundingMfrDrift: number;
  reason: string;
}

interface CardEntry {
  familyId: string;
  familyName: string;
  source: 'db' | 'ts' | 'none';
  status: 'draft' | 'active' | 'archived' | null;
  cardText: string | null;
  modelUsed: string | null;
  updatedAt: string | null;
  dataSnapshot: DataSnapshot | null;
  health: HealthDetail;
  /** Decision #195 Phase 2 — persisted output of atlasFamilyCardAudit.ts.
   *  Null when never audited (TS-fallback / pre-Phase-2 / no card). */
  auditResults: CardAuditResult | null;
  /** Snapshot of card_text BEFORE the current version was written.
   *  Populated on each Regenerate / cardText-PATCH. Null on first generation
   *  or TS-fallback. Powers the "Diff vs prior" view. */
  previousCardText: string | null;
  previousUpdatedAt: string | null;
  previousAuditResults: CardAuditResult | null;
}

/** Color + label config for the stoplight chip rendered in the Health
 *  column. Order also drives the filter chips at the top of the panel. */
const HEALTH_META: Record<HealthLevel, { label: string; color: 'error' | 'warning' | 'info' | 'success' | 'default'; emoji: string }> = {
  'refresh-recommended': { label: 'Refresh recommended', color: 'error', emoji: '🔴' },
  'no-card':              { label: 'No card', color: 'warning', emoji: '⚪' },
  'consider-refresh':     { label: 'Consider refresh', color: 'warning', emoji: '🟡' },
  'no-data':              { label: 'No data yet', color: 'default', emoji: '⚪' },
  'ok':                   { label: 'OK', color: 'success', emoji: '🟢' },
};

type FilterMode = 'all' | 'attention' | 'no-card' | 'draft' | 'active';

const PINNED_STORAGE_KEY = 'atlas-domain-cards-pinned-v1';

function loadPinnedFromStorage(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(PINNED_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function savePinnedToStorage(ids: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* quota or disabled storage — non-fatal */
  }
}

export default function AtlasDomainCardsPanel() {
  const [entries, setEntries] = useState<CardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>('all');
  // Per-family pending-generate state. A family in this set is currently
  // waiting on its Opus call.
  const [generating, setGenerating] = useState<Set<string>>(new Set());
  const [drawerFamilyId, setDrawerFamilyId] = useState<string | null>(null);
  // Pinned family IDs in pin-order (earliest pin first). Persisted to
  // localStorage so a refresh keeps the same focus set. Per-browser only.
  const [pinned, setPinned] = useState<string[]>([]);

  useEffect(() => {
    setPinned(loadPinnedFromStorage());
  }, []);

  const pinnedSet = useMemo(() => new Set(pinned), [pinned]);

  const togglePin = useCallback((familyId: string) => {
    setPinned((prev) => {
      const next = prev.includes(familyId)
        ? prev.filter((id) => id !== familyId)
        : [...prev, familyId];
      savePinnedToStorage(next);
      return next;
    });
  }, []);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/atlas/family-domain-cards', { cache: 'no-store' });
      const json = await res.json();
      if (!json.success) {
        setError(json.error ?? 'Failed to load');
      } else {
        setEntries(json.entries as CardEntry[]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const handleGenerate = useCallback(async (familyId: string) => {
    setGenerating((prev) => new Set(prev).add(familyId));
    try {
      const res = await fetch(`/api/admin/atlas/family-domain-cards/${familyId}/generate`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!json.success) {
        setError(`Generate failed for ${familyId}: ${json.error ?? 'unknown error'}`);
      } else {
        await fetchList();
        // Open drawer immediately for review.
        setDrawerFamilyId(familyId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating((prev) => {
        const next = new Set(prev);
        next.delete(familyId);
        return next;
      });
    }
  }, [fetchList]);

  const filteredEntries = useMemo(() => {
    const filtered = entries.filter((e) => {
      if (filter === 'attention') {
        return e.health.level === 'refresh-recommended' || e.health.level === 'consider-refresh';
      }
      if (filter === 'no-card') return e.source === 'none';
      if (filter === 'draft') return e.status === 'draft';
      if (filter === 'active') return e.status === 'active';
      return true;
    });
    // Stable-partition: pinned rows float to the top in pin-order,
    // unpinned rows keep the server's health-priority ordering below.
    const pinIndex = new Map(pinned.map((id, i) => [id, i]));
    const pinnedRows = filtered
      .filter((e) => pinnedSet.has(e.familyId))
      .sort((a, b) => (pinIndex.get(a.familyId) ?? 0) - (pinIndex.get(b.familyId) ?? 0));
    const unpinnedRows = filtered.filter((e) => !pinnedSet.has(e.familyId));
    return [...pinnedRows, ...unpinnedRows];
  }, [entries, filter, pinned, pinnedSet]);

  const counts = {
    total: entries.length,
    attention: entries.filter((e) => e.health.level === 'refresh-recommended' || e.health.level === 'consider-refresh').length,
    none: entries.filter((e) => e.source === 'none').length,
    draft: entries.filter((e) => e.status === 'draft').length,
    active: entries.filter((e) => e.status === 'active').length,
  };

  const drawerEntry = drawerFamilyId ? entries.find((e) => e.familyId === drawerFamilyId) : null;

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
        <Typography variant="h6">AI Domain Cards</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
          Per-family knowledge cards injected into the Triage AI. Generate with Opus 4.7;
          Sonnet 4.6 reads them on every /suggest and /investigate call.
        </Typography>
        <IconButton size="small" onClick={() => void fetchList()} disabled={loading}>
          <RefreshIcon fontSize="small" />
        </IconButton>
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <ToggleButtonGroup
          size="small"
          value={filter}
          exclusive
          onChange={(_e, v) => v && setFilter(v as FilterMode)}
        >
          <ToggleButton value="all">All ({counts.total})</ToggleButton>
          <ToggleButton value="attention" sx={{ color: counts.attention > 0 ? 'warning.main' : undefined }}>
            Needs attention ({counts.attention})
          </ToggleButton>
          <ToggleButton value="no-card">No card ({counts.none})</ToggleButton>
          <ToggleButton value="draft">Draft ({counts.draft})</ToggleButton>
          <ToggleButton value="active">Active ({counts.active})</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 36, px: 0.5 }} align="center" />
              <TableCell sx={{ width: 70 }}>Family</TableCell>
              <TableCell>Name</TableCell>
              <TableCell sx={{ width: 180 }}>
                <Tooltip title="Refresh-recommended families have repeatedly tripped up the Triage AI in the last 30 days. Sorted by urgency.">
                  <Box component="span" sx={{ borderBottom: '1px dotted', borderBottomColor: 'text.secondary', cursor: 'help' }}>
                    Health
                  </Box>
                </Tooltip>
              </TableCell>
              <TableCell sx={{ width: 100 }}>Source</TableCell>
              <TableCell sx={{ width: 100 }}>Status</TableCell>
              <TableCell sx={{ width: 110 }}>
                <Tooltip title="Auto-audit cross-checks the card against atlas_products + atlasMapper.ts. Surfaces bogus MFRs, wrong MPN prefixes, fabricated Chinese mappings (block), and top-MFR omissions (warn).">
                  <Box component="span" sx={{ borderBottom: '1px dotted', borderBottomColor: 'text.secondary', cursor: 'help' }}>
                    Audit
                  </Box>
                </Tooltip>
              </TableCell>
              <TableCell sx={{ width: 130 }}>Last Updated</TableCell>
              <TableCell sx={{ width: 240 }} align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredEntries.map((e) => {
              const isGenerating = generating.has(e.familyId);
              const sourceChip = e.source === 'db'
                ? <Chip size="small" label="Custom" color="primary" variant="outlined" />
                : e.source === 'ts'
                  ? <Chip size="small" label="Built-in" color="default" variant="outlined" />
                  : <Chip size="small" label="—" color="warning" variant="outlined" />;
              const statusChip = !e.status
                ? <Chip size="small" label="none" color="warning" />
                : e.status === 'active'
                  ? <Chip size="small" label="active" color="success" />
                  : e.status === 'draft'
                    ? <Chip size="small" label="draft" color="info" />
                    : <Chip size="small" label="archived" color="default" variant="outlined" />;
              // Phase 2 follow-up (May 19, 2026): no-card families now carry
              // their current atlas volume in `groundingProductDrift` (see
              // computeDomainCardHealth no-card branch). Override the chip
              // visual based on volume so HIGH-priority uncarded families
              // (e.g. C4 with 1,143 products) visually pop as red instead
              // of blending in with dormant no-card families.
              let healthMeta = HEALTH_META[e.health.level];
              if (e.health.level === 'no-card') {
                const vol = e.health.groundingProductDrift;
                if (vol >= 500) healthMeta = { label: `No card · HIGH (${vol.toLocaleString()})`, color: 'error', emoji: '🔴' };
                else if (vol >= 100) healthMeta = { label: `No card · MED (${vol})`, color: 'warning', emoji: '🟡' };
                else if (vol > 0) healthMeta = { label: `No card · LOW (${vol})`, color: 'default', emoji: '⚪' };
                // else: vol === 0 (dormant) — keep default "No card" label
              }
              const isPinned = pinnedSet.has(e.familyId);
              const auditChip = renderAuditChip(e.auditResults);
              return (
                <TableRow
                  key={e.familyId}
                  hover
                  sx={isPinned ? { bgcolor: (t) => t.palette.action.selected } : undefined}
                >
                  <TableCell sx={{ px: 0.5 }} align="center">
                    <Tooltip title={isPinned ? 'Unpin' : 'Pin to top'}>
                      <IconButton
                        size="small"
                        onClick={() => togglePin(e.familyId)}
                        sx={{ color: isPinned ? 'warning.main' : 'text.disabled' }}
                      >
                        {isPinned
                          ? <PushPinIcon sx={{ fontSize: 16 }} />
                          : <PushPinOutlinedIcon sx={{ fontSize: 16 }} />}
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{e.familyId}</TableCell>
                  <TableCell>{e.familyName}</TableCell>
                  <TableCell>
                    <Tooltip title={e.health.reason} placement="right">
                      <Chip
                        size="small"
                        label={`${healthMeta.emoji} ${healthMeta.label}`}
                        color={healthMeta.color}
                        variant={e.health.level === 'ok' ? 'outlined' : 'filled'}
                        sx={{ cursor: 'help', fontSize: '0.7rem' }}
                      />
                    </Tooltip>
                  </TableCell>
                  <TableCell>{sourceChip}</TableCell>
                  <TableCell>{statusChip}</TableCell>
                  <TableCell>{auditChip}</TableCell>
                  <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                    {e.updatedAt ? new Date(e.updatedAt).toLocaleString() : '—'}
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      {e.cardText && (
                        <Tooltip title="View / edit card">
                          <IconButton size="small" onClick={() => setDrawerFamilyId(e.familyId)}>
                            <VisibilityOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Button
                        size="small"
                        variant={e.source === 'none' ? 'contained' : 'outlined'}
                        startIcon={isGenerating ? <CircularProgress size={12} color="inherit" /> : <AutoAwesomeIcon sx={{ fontSize: 14 }} />}
                        onClick={() => void handleGenerate(e.familyId)}
                        disabled={isGenerating}
                        sx={{ fontSize: '0.7rem' }}
                      >
                        {e.source === 'none' ? 'Generate' : 'Regenerate'}
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {drawerEntry && (
        <CardReviewDrawer
          entry={drawerEntry}
          onClose={() => setDrawerFamilyId(null)}
          onSaved={async () => {
            await fetchList();
          }}
        />
      )}
    </Box>
  );
}

// ────────────────────────────────────────────────────────────────────

/** Advisory (warn-level) item count: dict coverage gaps + MFR omissions.
 *  Decision #197 — these do NOT gate Approve. */
function advisoryCount(audit: CardAuditResult): number {
  return audit.fabricatedDict.length + audit.omittedMfrs.length;
}

/** Small chip rendered in the Audit column. Severity-driven (Decision #197):
 *  block → red ❌ with hallucination count (bogus MFR + wrong prefix only)
 *  warn  → amber ⚠ with advisory count (dict gaps + omissions)
 *  clean → green ✓
 *  error → grey ! (audit threw, treat as un-audited for gating)
 *  null  → "—" placeholder (never audited yet) */
function renderAuditChip(audit: CardAuditResult | null) {
  if (!audit) {
    return <Chip size="small" label="—" variant="outlined" sx={{ fontSize: '0.7rem' }} />;
  }
  if (audit.error) {
    return (
      <Tooltip title={`Audit error: ${audit.error}`}>
        <Chip size="small" label="! error" color="default" variant="outlined" sx={{ fontSize: '0.7rem', cursor: 'help' }} />
      </Tooltip>
    );
  }
  if (audit.severity === 'block') {
    const breakdown: string[] = [];
    if (audit.bogusMfrs.length) breakdown.push(`${audit.bogusMfrs.length} bogus MFR`);
    if (audit.wrongPrefixes.length) breakdown.push(`${audit.wrongPrefixes.length} wrong prefix`);
    if (audit.criticalOmittedMfrs?.length) breakdown.push(`${audit.criticalOmittedMfrs.length} critical MFR omission(s)`);
    if (audit.wrongRuleClaims?.length) breakdown.push(`${audit.wrongRuleClaims.length} wrong rule claim(s)`);
    if (audit.wrongDictArrows?.length) breakdown.push(`${audit.wrongDictArrows.length} wrong dict arrow(s)`);
    return (
      <Tooltip title={breakdown.join(', ') || 'Block-level issues found'}>
        <Chip size="small" label={`❌ ${audit.issueCount}`} color="error" sx={{ fontSize: '0.7rem', cursor: 'help' }} />
      </Tooltip>
    );
  }
  if (audit.severity === 'warn') {
    const breakdown: string[] = [];
    if (audit.fabricatedDict.length) breakdown.push(`${audit.fabricatedDict.length} dict coverage gap(s)`);
    // At warn-level, all omittedMfrs are editorial (criticals would have
    // promoted severity to block).
    if (audit.omittedMfrs.length) breakdown.push(`${audit.omittedMfrs.length} editorial MFR omission(s)`);
    return (
      <Tooltip title={`${breakdown.join(', ')} — advisory, doesn't block Approve`}>
        <Chip size="small" label={`⚠ ${advisoryCount(audit)}`} color="warning" variant="outlined" sx={{ fontSize: '0.7rem', cursor: 'help' }} />
      </Tooltip>
    );
  }
  return (
    <Tooltip title={`Clean — audited ${new Date(audit.auditedAt).toLocaleString()}`}>
      <Chip size="small" label="✓ clean" color="success" variant="outlined" sx={{ fontSize: '0.7rem', cursor: 'help' }} />
    </Tooltip>
  );
}

/** Inline audit-detail panel rendered above the card text in the drawer.
 *  Default-expanded — Decision #195 calls audit a safety net, so the
 *  engineer should always see it. Collapses irrelevant sub-sections. */
function AuditDetailPanel({ audit }: { audit: CardAuditResult | null }) {
  if (!audit) {
    return (
      <Alert severity="info" icon={false} sx={{ mb: 2, fontSize: '0.78rem' }}>
        <strong>Not audited.</strong> Click <em>Re-run audit</em> above to check this card against atlas_products and the dictionary.
      </Alert>
    );
  }
  if (audit.error) {
    return (
      <Alert severity="warning" sx={{ mb: 2, fontSize: '0.78rem' }}>
        <strong>Audit error:</strong> {audit.error}
      </Alert>
    );
  }
  const auditedAt = new Date(audit.auditedAt).toLocaleString();
  const severityColor: 'success' | 'warning' | 'error' =
    audit.severity === 'clean' ? 'success' : audit.severity === 'warn' ? 'warning' : 'error';
  const criticalOmissions = audit.criticalOmittedMfrs ?? [];
  const criticalNameSet = new Set(criticalOmissions.map((o) => o.name));
  const editorialOmissions = audit.omittedMfrs.filter((o) => !criticalNameSet.has(o.name));
  const warnBreakdown: string[] = [];
  if (audit.fabricatedDict.length) warnBreakdown.push(`${audit.fabricatedDict.length} dictionary coverage gap(s)`);
  if (editorialOmissions.length) warnBreakdown.push(`${editorialOmissions.length} editorial MFR omission(s)`);
  const blockBreakdown: string[] = [];
  const hallucinations = audit.bogusMfrs.length + audit.wrongPrefixes.length;
  const wrongRuleClaims = audit.wrongRuleClaims ?? [];
  const wrongDictArrows = audit.wrongDictArrows ?? [];
  if (hallucinations) blockBreakdown.push(`${hallucinations} hallucination(s)`);
  if (criticalOmissions.length) blockBreakdown.push(`${criticalOmissions.length} critical MFR omission(s)`);
  if (wrongRuleClaims.length) blockBreakdown.push(`${wrongRuleClaims.length} wrong rule claim(s)`);
  if (wrongDictArrows.length) blockBreakdown.push(`${wrongDictArrows.length} wrong dict arrow(s)`);
  const headline =
    audit.severity === 'clean'
      ? '✓ Audit clean'
      : audit.severity === 'warn'
        ? `⚠ ${warnBreakdown.join(' + ')} — advisory only`
        : `❌ ${blockBreakdown.join(' + ')} — blocks Approve`;

  return (
    <Alert
      severity={severityColor}
      icon={false}
      sx={{ mb: 2, fontSize: '0.78rem', '& .MuiAlert-message': { width: '100%' } }}
    >
      <Stack spacing={1}>
        <Stack direction="row" alignItems="baseline" justifyContent="space-between">
          <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.82rem' }}>{headline}</Typography>
          <Typography variant="caption" color="text.secondary">audited {auditedAt}</Typography>
        </Stack>
        {audit.bogusMfrs.length > 0 && (
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'error.main' }}>
              Bogus MFRs ({audit.bogusMfrs.length}) — mentioned in card but don&apos;t ship under this family
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5, fontSize: '0.75rem' }}>
              {audit.bogusMfrs.map((m) => <li key={m}>{m}</li>)}
            </Box>
          </Box>
        )}
        {audit.wrongPrefixes.length > 0 && (
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'error.main' }}>
              Wrong prefixes ({audit.wrongPrefixes.length}) — claimed prefix doesn&apos;t match MFR&apos;s MPN samples
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5, fontSize: '0.75rem' }}>
              {audit.wrongPrefixes.map((w, i) => (
                <li key={`${w.mfr}-${w.claimed}-${i}`}>
                  <strong>{w.mfr}</strong>: claimed &quot;{w.claimed}&quot; ({w.claimedShare}% of samples).
                  {' '}Actual top: {w.actualTop.join(', ')}.
                  {' '}Samples: {w.actualSamples.join(', ')}
                </li>
              ))}
            </Box>
          </Box>
        )}
        {audit.fabricatedDict.length > 0 && (
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'warning.main' }}>
              Dictionary coverage gaps ({audit.fabricatedDict.length}) — Chinese phrase not catalogued in atlasMapper.ts
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5, fontSize: '0.75rem' }}>
              {audit.fabricatedDict.map((f, i) => (
                <li key={`${f.phrase}-${i}`}><code>{f.phrase}</code> — {f.claimedTarget}</li>
              ))}
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, fontStyle: 'italic' }}>
              Advisory only — usually a dictionary TODO (the term may be a real
              synonym not yet added), not a hallucination. Verify against
              atlasMapper.ts before treating as a card error.
            </Typography>
          </Box>
        )}
        {criticalOmissions.length > 0 && (
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'error.main' }}>
              Critical MFR omissions ({criticalOmissions.length}) — top-share MFRs missing from cohort, blocks Approve
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5, fontSize: '0.75rem' }}>
              {criticalOmissions.map((o) => (
                <li key={o.name}><strong>{o.name}</strong> — {o.productCount.toLocaleString()} products ({o.share}% of family)</li>
              ))}
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, fontStyle: 'italic' }}>
              Fix with AI will add these as bare cohort mentions. For prefix-level enrichment, use Regenerate from the table.
            </Typography>
          </Box>
        )}
        {editorialOmissions.length > 0 && (
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'warning.main' }}>
              Editorial MFR omissions ({editorialOmissions.length}) — minor share, doesn&apos;t block
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5, fontSize: '0.75rem' }}>
              {editorialOmissions.map((o) => (
                <li key={o.name}>{o.name} — {o.productCount.toLocaleString()} products ({o.share}% of family)</li>
              ))}
            </Box>
          </Box>
        )}
        {wrongRuleClaims.length > 0 && (
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'error.main' }}>
              Wrong rule claims ({wrongRuleClaims.length}) — card cites rule type/weight that doesn&apos;t match this family&apos;s logic table
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5, fontSize: '0.75rem' }}>
              {wrongRuleClaims.map((w, i) => {
                const parts: string[] = [];
                if (w.claimedType && w.actualType) {
                  parts.push(`type "${w.claimedType}" → actual "${w.actualType}"`);
                }
                if (w.claimedWeight !== undefined && w.actualWeight !== undefined) {
                  parts.push(`weight ${w.claimedWeight} → actual ${w.actualWeight}`);
                }
                return (
                  <li key={`${w.attributeId}-${i}`}>
                    <strong>{w.attributeId}</strong>: {parts.join('; ')}
                  </li>
                );
              })}
            </Box>
          </Box>
        )}
        {wrongDictArrows.length > 0 && (
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'error.main' }}>
              Wrong dict arrows ({wrongDictArrows.length}) — card claims a Chinese→canonical mapping that points at the wrong target
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5, fontSize: '0.75rem' }}>
              {wrongDictArrows.map((w, i) => (
                <li key={`${w.phrase}-${i}`}>
                  <code>{w.phrase}</code> → claimed <code>{w.claimedTarget}</code>, actual <code>{w.actualTarget}</code>
                </li>
              ))}
            </Box>
          </Box>
        )}
      </Stack>
    </Alert>
  );
}

/** Word-level diff renderer. Deletions strike through in red; insertions
 *  underline in green; unchanged tokens render plain. Word-level (not
 *  line-level) is critical for prose where a single-token swap inside a
 *  sentence ("CJ005" → "CJO") would otherwise mark the whole line as
 *  changed. */
/** Heuristic threshold: when more than 30% of the text changed, inline
 *  word-diff becomes unreadable (interleaved red/green tokens) so we
 *  default to a stacked Before/After view. Engineer can toggle back
 *  manually for either mode. */
const DENSE_DIFF_THRESHOLD = 0.3;

function CardDiffView({ before, after }: { before: string; after: string }) {
  const parts = useMemo(() => diffWordsWithSpace(before, after), [before, after]);
  const changeRatio = useMemo(() => {
    let changed = 0;
    let total = 0;
    for (const p of parts) {
      total += p.value.length;
      if (p.added || p.removed) changed += p.value.length;
    }
    return total > 0 ? changed / total : 0;
  }, [parts]);
  // Default to stacked when the diff is dense — inline word-diff is
  // unreadable past ~30% change ratio.
  const [mode, setMode] = useState<'inline' | 'stacked'>(
    changeRatio > DENSE_DIFF_THRESHOLD ? 'stacked' : 'inline',
  );

  const panelSx = {
    fontFamily: 'monospace',
    fontSize: '0.78rem',
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    p: 1.5,
    border: 1,
    borderColor: 'divider',
    borderRadius: 1,
    bgcolor: (t: Theme) =>
      t.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
    maxHeight: 480,
    overflowY: 'auto',
  } as const;

  return (
    <Stack spacing={1}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="caption" color="text.secondary">
          {Math.round(changeRatio * 100)}% of text changed
          {changeRatio > DENSE_DIFF_THRESHOLD && mode === 'stacked' ? ' — using stacked view for readability' : ''}
        </Typography>
        <ToggleButtonGroup
          size="small"
          value={mode}
          exclusive
          onChange={(_, v) => v && setMode(v)}
          sx={{ '& .MuiToggleButton-root': { fontSize: '0.7rem', py: 0.25, px: 1 } }}
        >
          <ToggleButton value="inline">Inline</ToggleButton>
          <ToggleButton value="stacked">Stacked</ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      {mode === 'inline' ? (
        <Box sx={panelSx}>
          {parts.map((part, i) => {
            if (part.added) {
              return (
                <Box
                  key={i}
                  component="span"
                  sx={{
                    bgcolor: (t) =>
                      t.palette.mode === 'dark' ? 'rgba(46, 160, 67, 0.25)' : 'rgba(46, 160, 67, 0.18)',
                    color: 'success.main',
                    textDecoration: 'underline',
                    textDecorationStyle: 'dotted',
                  }}
                >
                  {part.value}
                </Box>
              );
            }
            if (part.removed) {
              return (
                <Box
                  key={i}
                  component="span"
                  sx={{
                    bgcolor: (t) =>
                      t.palette.mode === 'dark' ? 'rgba(248, 81, 73, 0.25)' : 'rgba(248, 81, 73, 0.18)',
                    color: 'error.main',
                    textDecoration: 'line-through',
                  }}
                >
                  {part.value}
                </Box>
              );
            }
            return <Box key={i} component="span">{part.value}</Box>;
          })}
        </Box>
      ) : (
        <Stack spacing={1.5}>
          <Box>
            <Typography
              variant="caption"
              sx={{ fontWeight: 600, color: 'error.main', display: 'block', mb: 0.5 }}
            >
              ◀ Prior version
            </Typography>
            <Box
              sx={{
                ...panelSx,
                borderLeft: 3,
                borderLeftColor: 'error.main',
              }}
            >
              {before}
            </Box>
          </Box>
          <Box>
            <Typography
              variant="caption"
              sx={{ fontWeight: 600, color: 'success.main', display: 'block', mb: 0.5 }}
            >
              ▶ Current version
            </Typography>
            <Box
              sx={{
                ...panelSx,
                borderLeft: 3,
                borderLeftColor: 'success.main',
              }}
            >
              {after}
            </Box>
          </Box>
        </Stack>
      )}
    </Stack>
  );
}

// ────────────────────────────────────────────────────────────────────

interface CardReviewDrawerProps {
  entry: CardEntry;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

function CardReviewDrawer({ entry, onClose, onSaved }: CardReviewDrawerProps) {
  const [text, setText] = useState(entry.cardText ?? '');
  const [saving, setSaving] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [auditing, setAuditing] = useState(false);
  const [fixing, setFixing] = useState(false);
  // Local override of the panel's audit results — lets the engineer see
  // a freshly re-run audit without waiting for the parent listing fetch
  // to round-trip. Cleared when the drawer's entry changes.
  const [localAudit, setLocalAudit] = useState<CardAuditResult | null>(entry.auditResults);
  // Proposed fix from Sonnet — when non-null, the diff view replaces the
  // textarea and Accept/Discard buttons appear. Accept now saves + auto-
  // re-audits in one click (collapsed from prior 2-step flow).
  const [proposedFix, setProposedFix] = useState<{ before: string; after: string } | null>(null);
  // Diff vs prior version — when true, replaces the textarea with a
  // word-level diff between previous_card_text and the current card_text
  // so the engineer can see what the most recent Regenerate (or manual
  // edit) added / removed / changed. Disabled when no prior version exists.
  const [showingPriorDiff, setShowingPriorDiff] = useState(false);

  useEffect(() => {
    setLocalAudit(entry.auditResults);
    setProposedFix(null);
    setShowingPriorDiff(false);
  }, [entry.familyId, entry.auditResults]);

  const handleReAudit = async () => {
    setAuditing(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/atlas/family-domain-cards/${entry.familyId}/audit`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!json.success) {
        setErr(json.error ?? 'Audit failed');
      } else {
        setLocalAudit(json.auditResults as CardAuditResult);
        // Refresh the parent so the table chip + sort orders update.
        await onSaved();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setAuditing(false);
    }
  };

  const handleFixWithAI = async () => {
    if (!localAudit) return;
    setFixing(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/atlas/family-domain-cards/${entry.familyId}/fix-issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardText: text, auditResults: localAudit }),
      });
      const json = await res.json();
      if (!json.success) {
        setErr(json.error ?? 'AI fix failed');
      } else {
        // Stash before/after for the diff view. NOT saved yet — engineer
        // reviews the diff, clicks Accept, then Save edits.
        setProposedFix({ before: text, after: json.proposedText as string });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setFixing(false);
    }
  };

  const acceptProposedFix = async () => {
    if (!proposedFix) return;
    const newText = proposedFix.after;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/atlas/family-domain-cards/${entry.familyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardText: newText }),
      });
      const json = await res.json();
      if (!json.success) {
        setErr(json.error ?? 'Save failed');
        // Keep the proposal on screen so the engineer can retry or discard.
        return;
      }
      // Order matters: write text into editable textarea BEFORE clearing
      // proposedFix, so the textarea swap-in shows the correct content.
      setText(newText);
      setProposedFix(null);
      await onSaved();
      // Re-audit fires the new severity into the panel without a second
      // click — the whole point of the one-click flow.
      void handleReAudit();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const discardProposedFix = () => {
    setProposedFix(null);
  };

  // Sync local text when the drawer's entry changes (different family
  // selected without closing the drawer, or a Customize call swapped
  // a built-in into a fresh DB draft).
  useEffect(() => {
    setText(entry.cardText ?? '');
    setErr(null);
  }, [entry.familyId, entry.cardText]);

  const dirty = text !== (entry.cardText ?? '');
  const isBuiltIn = entry.source === 'ts';
  const isDb = entry.source === 'db';

  const patch = async (updates: { cardText?: string; status?: 'draft' | 'active' | 'archived' }) => {
    if (!isDb) {
      setErr('Built-in cards aren\'t directly editable. Click "Customize this card" below to create your own copy first.');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/atlas/family-domain-cards/${entry.familyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const json = await res.json();
      if (!json.success) {
        setErr(json.error ?? 'Save failed');
      } else {
        await onSaved();
        // Decision #195 Phase 2 — any save that changes cardText auto-
        // triggers a re-audit so the engineer sees the new severity
        // immediately. Consistent across all paths: Accept fix → save,
        // manual textarea hand-edit → Save edits. Audit is the backstop
        // against AI-introduced or hand-edit-introduced regressions.
        if (typeof updates.cardText === 'string') {
          void handleReAudit();
        }
        if (updates.status === 'active' || updates.status === 'archived') {
          onClose();
        }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleCustomize = async () => {
    setCustomizing(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/atlas/family-domain-cards/${entry.familyId}/customize`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!json.success) {
        setErr(json.error ?? 'Customize failed');
      } else {
        // Parent re-fetches the listing; the drawer's entry prop will swap
        // from source='ts' to source='db', and the useEffect above resyncs
        // local text.
        await onSaved();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setCustomizing(false);
    }
  };

  // "Opus read" inputs chip-row: only when the row carries a snapshot
  // (i.e., generated by /generate; null for /customize-seeded drafts and
  // for built-in cards).
  const snap = entry.dataSnapshot;
  const inputsChips: Array<{ label: string; value: number }> = snap
    ? [
        { label: 'logic-table rules', value: snap.ruleCount ?? 0 },
        { label: 'accepted overrides', value: snap.acceptedCount ?? 0 },
        { label: 'family signatures', value: snap.signatureCount ?? 0 },
        { label: 'cross-family canonicals', value: snap.crossFamilyCount ?? 0 },
      ]
    : [];

  return (
    <Drawer
      anchor="right"
      open
      onClose={onClose}
      PaperProps={{ sx: { width: 640, maxWidth: '95vw' } }}
    >
      <Stack sx={{ height: '100%' }}>
        <Box sx={{ position: 'sticky', top: 0, zIndex: 1, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider', px: 2, py: 1.5 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip size="small" label={entry.familyId} sx={{ fontFamily: 'monospace', fontWeight: 600 }} />
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{entry.familyName}</Typography>
              {entry.status && (
                <Chip
                  size="small"
                  label={entry.status}
                  color={entry.status === 'active' ? 'success' : entry.status === 'draft' ? 'info' : 'default'}
                />
              )}
              {isBuiltIn && <Chip size="small" label="Built-in" variant="outlined" />}
            </Stack>
            <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
          </Stack>
          {entry.modelUsed && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              Generated by {entry.modelUsed}
              {entry.updatedAt ? ` · ${new Date(entry.updatedAt).toLocaleString()}` : ''}
            </Typography>
          )}
          {inputsChips.length > 0 && (
            <Tooltip title="These are the inputs the card-writing AI saw. Engineering reasons for each rule are passed verbatim. Approve only after spot-checking the card against the family you know.">
              <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                <InfoOutlinedIcon sx={{ fontSize: 12, color: 'text.secondary' }} />
                <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5, fontWeight: 600 }}>
                  AI read:
                </Typography>
                {inputsChips.map((c) => (
                  <Chip
                    key={c.label}
                    size="small"
                    label={`${c.value} ${c.label}`}
                    variant="outlined"
                    sx={{ height: 18, fontSize: '0.65rem' }}
                  />
                ))}
              </Stack>
            </Tooltip>
          )}
        </Box>

        <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
          {err && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErr(null)}>{err}</Alert>}

          {/* Audit panel — default-expanded per Decision #195 Phase 2.
              Re-run button sits in the header above so it's discoverable
              even when the audit is clean. */}
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
            <Stack direction="row" spacing={0.75} alignItems="center">
              <FactCheckOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                Audit
              </Typography>
            </Stack>
            <Stack direction="row" spacing={1}>
              {/* Fix with AI — Sonnet 4.6 produces minimal-edit corrections
                  for BLOCK-level issues (bogus MFRs, wrong prefixes). Not
                  offered for warn-level dict gaps — those are usually real
                  synonyms to ADD to the dict, not card errors to remove
                  (Decision #197). Disabled while a proposal is on screen.

                  Visual contract (operator fool-proofing): when the button is
                  actionable it becomes a filled `contained` variant with a
                  dynamic "Fix N issue(s) with AI" label so the button itself
                  is the signal — operators shouldn't have to read the audit
                  header to know whether to click. Disabled state stays as a
                  ghost outlined button so it's unmistakably inert. */}
              {(() => {
                const fixable = !!localAudit && localAudit.issueCount > 0 && !isBuiltIn;
                const tooltipTitle = !localAudit
                  ? 'Run audit first'
                  : localAudit.issueCount === 0
                    ? 'No blocking issues to fix (advisory-only flags are dictionary coverage gaps — resolve by adding terms to the dictionary, not by editing the card)'
                    : isBuiltIn
                      ? 'Customize the card first to enable AI fixes'
                      : 'Sonnet 4.6 produces a minimal-edit correction. Review diff before accepting.';
                const label = fixable
                  ? `Fix ${localAudit!.issueCount} issue${localAudit!.issueCount === 1 ? '' : 's'} with AI`
                  : !localAudit
                    ? 'Fix with AI'
                    : localAudit.issueCount === 0
                      ? 'No issues to fix'
                      : 'Fix with AI';
                return (
                  <Tooltip title={tooltipTitle}>
                    <span>
                      <Button
                        size="small"
                        variant={fixable ? 'contained' : 'outlined'}
                        color="warning"
                        startIcon={fixing ? <CircularProgress size={12} color="inherit" /> : <AutoFixHighIcon sx={{ fontSize: 14 }} />}
                        onClick={() => void handleFixWithAI()}
                        disabled={
                          fixing ||
                          isBuiltIn ||
                          !localAudit ||
                          localAudit.issueCount === 0 ||
                          proposedFix !== null
                        }
                        sx={{ fontSize: '0.7rem' }}
                      >
                        {label}
                      </Button>
                    </span>
                  </Tooltip>
                );
              })()}
              <Button
                size="small"
                variant="outlined"
                startIcon={auditing ? <CircularProgress size={12} color="inherit" /> : <RefreshIcon sx={{ fontSize: 14 }} />}
                onClick={() => void handleReAudit()}
                disabled={auditing}
                sx={{ fontSize: '0.7rem' }}
              >
                Re-run audit
              </Button>
              {/* Diff vs prior — toggles a word-level diff between the saved
                  previous_card_text and the current card_text. Lets the
                  engineer see what the most recent Regenerate (or manual edit)
                  changed. Disabled when no prior version exists (first
                  generation, TS-fallback, or pre-migration row). */}
              <Tooltip title={
                entry.previousCardText
                  ? `Compare current text against the version saved before this regeneration${entry.previousUpdatedAt ? ` (prior version: ${new Date(entry.previousUpdatedAt).toLocaleString()})` : ''}`
                  : 'No prior version yet — this is the first time this card has been written, or the migration that captures prior versions hasn’t run yet.'
              }>
                <span>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<CompareArrowsIcon sx={{ fontSize: 14 }} />}
                    onClick={() => setShowingPriorDiff((v) => !v)}
                    disabled={!entry.previousCardText || proposedFix !== null}
                    sx={{ fontSize: '0.7rem' }}
                  >
                    {showingPriorDiff ? 'Hide diff' : 'Diff vs prior'}
                  </Button>
                </span>
              </Tooltip>
            </Stack>
          </Stack>
          <AuditDetailPanel audit={localAudit} />

          {isBuiltIn && (
            <Alert
              severity="info"
              icon={false}
              sx={{ mb: 2 }}
              action={
                <Button
                  size="small"
                  variant="contained"
                  startIcon={customizing ? <CircularProgress size={12} color="inherit" /> : <EditOutlinedIcon sx={{ fontSize: 14 }} />}
                  onClick={() => void handleCustomize()}
                  disabled={customizing}
                >
                  Customize this card
                </Button>
              }
            >
              <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                <strong>Built-in card.</strong> This one ships with the app and isn&apos;t directly editable.
                Click <em>Customize</em> to create your own editable copy (no AI call) — you&apos;ll be able
                to add or change text and Approve. Or use <em>Regenerate</em> in the table to have Opus
                rewrite it from scratch.
              </Typography>
            </Alert>
          )}

          {showingPriorDiff && entry.previousCardText ? (
            <Stack spacing={1}>
              <Alert severity="info" icon={false} sx={{ fontSize: '0.78rem' }}>
                <strong>Diff vs prior version</strong>
                {entry.previousUpdatedAt && (
                  <> (saved {new Date(entry.previousUpdatedAt).toLocaleString()})</>
                )}
                {' — '}<span style={{ color: 'var(--mui-palette-error-main)' }}>red strikethrough</span> = removed,{' '}
                <span style={{ color: 'var(--mui-palette-success-main)' }}>green underline</span> = added. Read-only view; click <em>Hide diff</em> above to edit the current text.
              </Alert>
              <CardDiffView before={entry.previousCardText} after={entry.cardText ?? ''} />
            </Stack>
          ) : proposedFix ? (
            <Stack spacing={1}>
              <Alert severity="info" icon={false} sx={{ fontSize: '0.78rem' }}>
                <strong>Proposed AI fix</strong> — review the diff below. <span style={{ color: 'var(--mui-palette-error-main)' }}>red strikethrough</span> = removed,{' '}
                <span style={{ color: 'var(--mui-palette-success-main)' }}>green underline</span> = added. <strong>Accept</strong> saves the fix and re-runs the audit in one step. <strong>Discard</strong> drops the proposal — original text is unchanged.
              </Alert>
              <CardDiffView before={proposedFix.before} after={proposedFix.after} />
              <Stack direction="row" spacing={1} justifyContent="flex-end">
                <Button
                  size="small"
                  variant="outlined"
                  onClick={discardProposedFix}
                  disabled={saving}
                >
                  Discard fix
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  color="success"
                  onClick={() => void acceptProposedFix()}
                  disabled={saving}
                  startIcon={saving ? <CircularProgress size={12} color="inherit" /> : undefined}
                >
                  {saving ? 'Saving + auditing…' : 'Accept fix'}
                </Button>
              </Stack>
            </Stack>
          ) : (
            <TextField
              multiline
              fullWidth
              minRows={20}
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={isBuiltIn}
              sx={{
                '& .MuiInputBase-input': { fontFamily: 'monospace', fontSize: '0.78rem', lineHeight: 1.5 },
              }}
            />
          )}
        </Box>

        <Box sx={{ position: 'sticky', bottom: 0, bgcolor: 'background.paper', borderTop: 1, borderColor: 'divider', px: 2, py: 1.5 }}>
          {isBuiltIn ? (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'right' }}>
              Read-only. Use <strong>Customize</strong> above to edit.
            </Typography>
          ) : isDb ? (
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              {entry.status !== 'archived' && (
                <Button
                  size="small"
                  variant="outlined"
                  color="warning"
                  startIcon={<ArchiveOutlinedIcon sx={{ fontSize: 14 }} />}
                  onClick={() => void patch({ status: 'archived' })}
                  disabled={saving}
                >
                  Archive
                </Button>
              )}
              {/* Save edits is always visible (disabled when no edits)
                  so the engineer always sees the available actions. */}
              <Button
                size="small"
                variant="outlined"
                onClick={() => void patch({ cardText: text })}
                disabled={saving || !dirty}
              >
                Save edits
              </Button>
              {entry.status !== 'active' && (
                <Button
                  size="small"
                  variant="contained"
                  color="success"
                  startIcon={<CheckCircleOutlineIcon sx={{ fontSize: 14 }} />}
                  onClick={() => void patch({ cardText: dirty ? text : undefined, status: 'active' })}
                  disabled={saving}
                >
                  {dirty ? 'Save & Approve' : 'Approve'}
                </Button>
              )}
            </Stack>
          ) : null}
        </Box>
      </Stack>
    </Drawer>
  );
}
