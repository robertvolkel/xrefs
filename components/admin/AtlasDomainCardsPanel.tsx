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

import { useEffect, useState, useCallback } from 'react';
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
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import RefreshIcon from '@mui/icons-material/Refresh';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CloseIcon from '@mui/icons-material/Close';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

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

export default function AtlasDomainCardsPanel() {
  const [entries, setEntries] = useState<CardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>('all');
  // Per-family pending-generate state. A family in this set is currently
  // waiting on its Opus call.
  const [generating, setGenerating] = useState<Set<string>>(new Set());
  const [drawerFamilyId, setDrawerFamilyId] = useState<string | null>(null);

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

  const filteredEntries = entries.filter((e) => {
    if (filter === 'attention') {
      return e.health.level === 'refresh-recommended' || e.health.level === 'consider-refresh';
    }
    if (filter === 'no-card') return e.source === 'none';
    if (filter === 'draft') return e.status === 'draft';
    if (filter === 'active') return e.status === 'active';
    return true;
  });

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
              const healthMeta = HEALTH_META[e.health.level];
              return (
                <TableRow key={e.familyId} hover>
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
