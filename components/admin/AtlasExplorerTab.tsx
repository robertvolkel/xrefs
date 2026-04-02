'use client';

import { useState, useCallback, useRef } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import FlagIcon from '@mui/icons-material/Flag';
import { useTranslation } from 'react-i18next';
import { searchAtlasExplorer, createAtlasFlag, type AtlasExplorerResult } from '@/lib/api';
import AtlasExplorerDrawer from './AtlasExplorerDrawer';

export default function AtlasExplorerTab() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AtlasExplorerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [capped, setCapped] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Flag dialog state
  const [flagDialogOpen, setFlagDialogOpen] = useState(false);
  const [flagTarget, setFlagTarget] = useState<AtlasExplorerResult | null>(null);
  const [flagComment, setFlagComment] = useState('');
  const [flagSubmitting, setFlagSubmitting] = useState(false);
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set());

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setSearched(false);
      setCapped(false);
      return;
    }
    setLoading(true);
    setSearched(true);
    try {
      const resp = await searchAtlasExplorer(q);
      setResults(resp.results);
      setCapped(resp.capped);
    } catch {
      setResults([]);
      setCapped(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value.trim()), 300);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      doSearch(query.trim());
    }
  };

  const handleRowClick = (id: string) => {
    setSelectedId(id);
    setDrawerOpen(true);
  };

  const handleFlagClick = (e: React.MouseEvent, row: AtlasExplorerResult) => {
    e.stopPropagation();
    setFlagTarget(row);
    setFlagComment('');
    setFlagDialogOpen(true);
  };

  const handleFlagSubmit = async () => {
    if (!flagTarget || !flagComment.trim()) return;
    setFlagSubmitting(true);
    try {
      await createAtlasFlag({
        productId: flagTarget.id,
        mpn: flagTarget.mpn,
        manufacturer: flagTarget.manufacturer,
        comment: flagComment.trim(),
      });
      setFlaggedIds((prev) => new Set(prev).add(flagTarget.id));
      setFlagDialogOpen(false);
    } catch (err) {
      console.error('Flag submit failed:', err);
    } finally {
      setFlagSubmitting(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Search */}
      <TextField
        size="small"
        placeholder={t('admin.atlasSearchHint')}
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                {loading ? <CircularProgress size={16} /> : <SearchIcon sx={{ fontSize: 18, opacity: 0.5 }} />}
              </InputAdornment>
            ),
          },
        }}
        sx={{ mb: 2, maxWidth: 480 }}
      />

      {/* Empty state */}
      {!searched && results.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          {t('admin.atlasSearchHint')}
        </Typography>
      )}

      {/* No results */}
      {searched && !loading && results.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          {t('admin.atlasNoResults', { query })}
        </Typography>
      )}

      {/* Results table */}
      {results.length > 0 && (
        <>
          {capped && (
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1 }}>
              Showing first 50 results
            </Typography>
          )}
          <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
            <Table size="small" stickyHeader sx={{ '& td, & th': { borderColor: 'divider' } }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>MPN</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Manufacturer</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Family</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Category</TableCell>
                  <TableCell sx={{ fontWeight: 600, width: 80, textAlign: 'center' }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 600, width: 80, textAlign: 'center' }}>Coverage</TableCell>
                  <TableCell sx={{ fontWeight: 600, width: 50 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {results.map((row) => {
                  const isFlagged = flaggedIds.has(row.id);
                  return (
                    <TableRow
                      key={row.id}
                      hover
                      onClick={() => handleRowClick(row.id)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell>
                        <Typography variant="body2" sx={{ fontSize: '0.78rem', fontWeight: 600 }}>
                          {row.mpn}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontSize: '0.78rem' }}>
                          {row.manufacturer}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" noWrap sx={{ fontSize: '0.78rem', maxWidth: 280, opacity: row.description ? 1 : 0.3 }}>
                          {row.description || '\u2014'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {row.familyName ? (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Typography variant="body2" sx={{ fontSize: '0.78rem' }}>
                              {row.familyName}
                            </Typography>
                            <Chip
                              label={row.familyId}
                              size="small"
                              sx={{ height: 18, fontSize: '0.6rem', fontWeight: 600 }}
                            />
                          </Box>
                        ) : (
                          <Typography variant="body2" sx={{ fontSize: '0.78rem', opacity: 0.4 }}>
                            —
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontSize: '0.78rem' }}>
                          {row.subcategory || row.category}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ textAlign: 'center' }}>
                        <Chip
                          label={row.status}
                          size="small"
                          color={row.status === 'Active' ? 'success' : row.status === 'Obsolete' ? 'error' : 'default'}
                          variant="outlined"
                          sx={{ height: 20, fontSize: '0.65rem' }}
                        />
                      </TableCell>
                      <TableCell sx={{ textAlign: 'center' }}>
                        {row.coveragePct !== null ? (
                          <Tooltip title={`${row.schemaMatchCount} of ${row.schemaTotalCount} schema attributes present`} arrow>
                            <Typography
                              variant="body2"
                              sx={{
                                fontSize: '0.78rem',
                                fontWeight: 600,
                                color: row.coveragePct >= 60 ? 'success.main' : row.coveragePct >= 30 ? 'warning.main' : 'error.main',
                              }}
                            >
                              {row.coveragePct}%
                            </Typography>
                          </Tooltip>
                        ) : (
                          <Typography variant="body2" sx={{ fontSize: '0.78rem', opacity: 0.3 }}>
                            —
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ textAlign: 'center', p: 0 }}>
                        <Tooltip title={isFlagged ? 'Flagged' : 'Flag this product'} arrow>
                          <IconButton
                            size="small"
                            onClick={(e) => handleFlagClick(e, row)}
                            sx={{ color: isFlagged ? 'warning.main' : 'text.disabled' }}
                          >
                            {isFlagged ? <FlagIcon fontSize="small" /> : <FlagOutlinedIcon fontSize="small" />}
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      <AtlasExplorerDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        productId={selectedId}
      />

      {/* Flag dialog */}
      <Dialog open={flagDialogOpen} onClose={() => setFlagDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>Flag Product</DialogTitle>
        <DialogContent>
          {flagTarget && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {flagTarget.mpn} — {flagTarget.manufacturer}
            </Typography>
          )}
          <TextField
            autoFocus
            multiline
            rows={3}
            fullWidth
            placeholder="What's the issue with this product?"
            value={flagComment}
            onChange={(e) => setFlagComment(e.target.value)}
            size="small"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFlagDialogOpen(false)} size="small">Cancel</Button>
          <Button
            onClick={handleFlagSubmit}
            variant="contained"
            size="small"
            disabled={!flagComment.trim() || flagSubmitting}
          >
            {flagSubmitting ? 'Flagging...' : 'Flag'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
