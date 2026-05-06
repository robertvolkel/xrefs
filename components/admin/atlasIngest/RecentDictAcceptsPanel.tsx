'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary,
  Box, Chip, IconButton, Stack, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Tooltip, Typography, Skeleton,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import UndoIcon from '@mui/icons-material/Undo';
import HistoryIcon from '@mui/icons-material/History';

type RecentItem = {
  id: string;
  familyId: string;
  paramName: string;
  action: 'modify' | 'add' | 'remove';
  attributeId: string | null;
  attributeName: string | null;
  unit: string | null;
  changeReason: string | null;
  createdBy: string | null;
  createdByName: string;
  createdAt: string;
};

interface Props {
  /** Bumped by parent when an Accept happens to retrigger the recent-list fetch. */
  refreshSignal?: number;
  /** Called after a successful undo so the parent can refresh the unmapped queue. */
  onUndone?: () => void;
}

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

export default function RecentDictAcceptsPanel({ refreshSignal = 0, onUndone }: Props) {
  const [items, setItems] = useState<RecentItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingUndo, setPendingUndo] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/atlas/dictionaries/recent?limit=20');
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load');
      setItems(json.items as RecentItem[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load recent accepts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh, refreshSignal]);

  const undo = useCallback(async (id: string) => {
    setPendingUndo((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/admin/atlas/dictionaries/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Undo failed');
      // Optimistic: drop from local list immediately
      setItems((prev) => (prev ?? []).filter((it) => it.id !== id));
      onUndone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Undo failed');
    } finally {
      setPendingUndo((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, [onUndone]);

  const count = items?.length ?? 0;

  return (
    <Accordion
      defaultExpanded={false}
      slotProps={{ transition: { unmountOnExit: true } }}
      sx={{ mb: 2, '&:before': { display: 'none' } }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <HistoryIcon fontSize="small" sx={{ color: 'text.secondary' }} />
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Recently Accepted
          </Typography>
          {!loading && (
            <Chip
              size="small"
              label={count === 0 ? 'none yet' : `${count} most recent`}
              variant="outlined"
              sx={{ height: 20, fontSize: '0.7rem' }}
            />
          )}
        </Stack>
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 0 }}>
        {loading && (
          <Stack spacing={0.5}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} variant="rectangular" height={36} sx={{ borderRadius: 0.5 }} />
            ))}
          </Stack>
        )}

        {error && (
          <Typography variant="body2" sx={{ color: 'error.main', py: 1 }}>{error}</Typography>
        )}

        {!loading && !error && items && items.length === 0 && (
          <Typography variant="body2" sx={{ color: 'text.secondary', py: 1 }}>
            No dictionary overrides have been accepted yet. Accepted mappings will appear here so you can review or undo them.
          </Typography>
        )}

        {!loading && !error && items && items.length > 0 && (
          <TableContainer>
            <Table size="small" sx={{ tableLayout: 'fixed' }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 80 }}>Family</TableCell>
                  <TableCell>Raw Attribute → Mapped</TableCell>
                  <TableCell sx={{ width: 70 }}>Action</TableCell>
                  <TableCell sx={{ width: 130 }}>By</TableCell>
                  <TableCell sx={{ width: 90 }}>When</TableCell>
                  <TableCell sx={{ width: 60, textAlign: 'right' }}>Undo</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((it) => (
                  <TableRow key={it.id} hover>
                    <TableCell>
                      <Chip size="small" label={it.familyId} sx={{ height: 18, fontSize: '0.65rem' }} />
                    </TableCell>
                    <TableCell sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <Tooltip title={`${it.paramName} → ${it.attributeId ?? '(removed)'}`}>
                        <Box component="span">
                          <Box component="span" sx={{ fontFamily: 'monospace', color: 'text.primary' }}>
                            {it.paramName}
                          </Box>
                          <Box component="span" sx={{ color: 'text.secondary', mx: 0.5 }}>→</Box>
                          <Box component="span" sx={{ fontFamily: 'monospace', color: 'success.main' }}>
                            {it.attributeId ?? '(removed)'}
                          </Box>
                          {it.unit && (
                            <Box component="span" sx={{ color: 'text.secondary', ml: 0.5, fontSize: '0.7rem' }}>
                              [{it.unit}]
                            </Box>
                          )}
                        </Box>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={it.action}
                        color={it.action === 'add' ? 'success' : it.action === 'remove' ? 'error' : 'warning'}
                        variant="outlined"
                        sx={{ height: 18, fontSize: '0.65rem' }}
                      />
                    </TableCell>
                    <TableCell sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {it.createdByName}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Tooltip title={new Date(it.createdAt).toLocaleString()}>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {formatRelative(it.createdAt)}
                        </Typography>
                      </Tooltip>
                    </TableCell>
                    <TableCell sx={{ textAlign: 'right' }}>
                      <Tooltip title="Undo (deactivates override; raw param returns to queue)">
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => undo(it.id)}
                            disabled={pendingUndo.has(it.id)}
                          >
                            <UndoIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </AccordionDetails>
    </Accordion>
  );
}
