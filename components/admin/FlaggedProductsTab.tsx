'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Box,
  Button,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { getAtlasFlags, updateAtlasFlag, type AtlasProductFlag } from '@/lib/api';
import AtlasExplorerDrawer from './AtlasExplorerDrawer';

type FilterStatus = 'open' | 'resolved' | 'dismissed' | 'all';

export default function FlaggedProductsTab({ manufacturer }: { manufacturer?: string } = {}) {
  const [flags, setFlags] = useState<AtlasProductFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>('open');

  // Explorer drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  const fetchFlags = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await getAtlasFlags(filter);
      // Filter client-side by manufacturer if provided (match on exact or startsWith for EN-only names)
      const filtered = manufacturer
        ? { ...resp, flags: resp.flags.filter(f => f.manufacturer === manufacturer || f.manufacturer.startsWith(manufacturer + ' ') || f.manufacturer.startsWith(manufacturer + '\u00A0')) }
        : resp;
      setFlags(filtered.flags);
    } catch {
      setFlags([]);
    } finally {
      setLoading(false);
    }
  }, [filter, manufacturer]);

  useEffect(() => {
    fetchFlags();
  }, [fetchFlags]);

  const handleStatusChange = async (flagId: string, newStatus: 'resolved' | 'dismissed') => {
    // Optimistic update
    setFlags((prev) => prev.map((f) => f.id === flagId ? { ...f, status: newStatus } : f));
    try {
      await updateAtlasFlag(flagId, newStatus);
    } catch {
      fetchFlags(); // Revert on error
    }
  };

  const handleReopen = async (flagId: string) => {
    setFlags((prev) => prev.map((f) => f.id === flagId ? { ...f, status: 'open' } : f));
    try {
      await updateAtlasFlag(flagId, 'open');
    } catch {
      fetchFlags();
    }
  };

  const statusCounts = {
    open: flags.filter(f => f.status === 'open').length,
    resolved: flags.filter(f => f.status === 'resolved').length,
    dismissed: flags.filter(f => f.status === 'dismissed').length,
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Status filter chips */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        {(['open', 'resolved', 'dismissed', 'all'] as FilterStatus[]).map((s) => (
          <Chip
            key={s}
            label={`${s.charAt(0).toUpperCase() + s.slice(1)}${s !== 'all' ? ` (${statusCounts[s as keyof typeof statusCounts] ?? 0})` : ''}`}
            size="small"
            variant={filter === s ? 'filled' : 'outlined'}
            onClick={() => setFilter(s)}
            sx={{ textTransform: 'capitalize' }}
          />
        ))}
      </Box>

      {loading ? (
        <Typography variant="body2" color="text.secondary">Loading...</Typography>
      ) : flags.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          {filter === 'open' ? 'No open flags.' : 'No flags found.'}
        </Typography>
      ) : (
        <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
          <Table size="small" stickyHeader sx={{ '& td, & th': { borderColor: 'divider' } }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>MPN</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Manufacturer</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Comment</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Flagged By</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 600, width: 120 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {flags.map((flag) => (
                <TableRow
                  key={flag.id}
                  hover
                  onClick={() => { setSelectedProductId(flag.productId); setDrawerOpen(true); }}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell>
                    <Typography variant="body2" sx={{ fontSize: '0.78rem', fontWeight: 600 }}>
                      {flag.mpn}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontSize: '0.78rem' }}>
                      {flag.manufacturer}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontSize: '0.78rem', maxWidth: 300 }}>
                      {flag.comment}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {flag.createdByName}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(flag.createdAt).toLocaleDateString()}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={flag.status}
                      size="small"
                      color={flag.status === 'open' ? 'warning' : flag.status === 'resolved' ? 'success' : 'default'}
                      variant="outlined"
                      sx={{ height: 20, fontSize: '0.65rem', textTransform: 'capitalize' }}
                    />
                  </TableCell>
                  <TableCell>
                    {flag.status === 'open' ? (
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Button
                          size="small"
                          startIcon={<CheckIcon sx={{ fontSize: 14 }} />}
                          onClick={(e) => { e.stopPropagation(); handleStatusChange(flag.id, 'resolved'); }}
                          sx={{ fontSize: '0.7rem', minWidth: 0, px: 1 }}
                        >
                          Resolve
                        </Button>
                        <Button
                          size="small"
                          startIcon={<CloseIcon sx={{ fontSize: 14 }} />}
                          onClick={(e) => { e.stopPropagation(); handleStatusChange(flag.id, 'dismissed'); }}
                          sx={{ fontSize: '0.7rem', minWidth: 0, px: 1, color: 'text.secondary' }}
                        >
                          Dismiss
                        </Button>
                      </Box>
                    ) : (
                      <Button
                        size="small"
                        onClick={(e) => { e.stopPropagation(); handleReopen(flag.id); }}
                        sx={{ fontSize: '0.7rem', minWidth: 0, px: 1 }}
                      >
                        Reopen
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <AtlasExplorerDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        productId={selectedProductId}
      />
    </Box>
  );
}
