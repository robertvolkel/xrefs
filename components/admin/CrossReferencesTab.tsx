'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Snackbar,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { getMfrCrossRefs, uploadMfrCrossRefs, deleteMfrCrossRefs } from '@/lib/api';
import { parseSpreadsheetFile } from '@/lib/excelParser';
import { formatRelativeTime } from '@/lib/utils/dateFormatting';
import type { ManufacturerCrossReference, ParsedSpreadsheet, CrossRefColumnMapping } from '@/lib/types';
import CrossRefColumnMappingDialog from './CrossRefColumnMappingDialog';

const ACCEPTED_FORMATS = '.xlsx,.xls,.csv';
const PAGE_SIZE = 25;

interface CrossReferencesTabProps {
  slug: string;
  manufacturerName: string;
  lastUploadedAt?: string | null;
}

export default function CrossReferencesTab({ slug, manufacturerName, lastUploadedAt }: CrossReferencesTabProps) {
  // Existing cross-refs state
  const [crossRefs, setCrossRefs] = useState<ManufacturerCrossReference[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Upload state
  const [parsedFile, setParsedFile] = useState<ParsedSpreadsheet | null>(null);
  const [mappingDialogOpen, setMappingDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Feedback
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success',
  });

  // Fetch cross-refs
  const fetchCrossRefs = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getMfrCrossRefs(slug, { page: page + 1, limit: PAGE_SIZE, search: search || undefined });
      setCrossRefs(result.crossRefs);
      setTotal(result.total);
    } catch {
      setCrossRefs([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [slug, page, search]);

  useEffect(() => {
    fetchCrossRefs();
  }, [fetchCrossRefs]);

  // Debounced search
  const handleSearchChange = (value: string) => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setSearch(value);
      setPage(0);
    }, 400);
  };

  // File handling
  const handleFile = async (file: File) => {
    try {
      const parsed = await parseSpreadsheetFile(file);
      setParsedFile(parsed);
      setMappingDialogOpen(true);
    } catch (err) {
      setSnackbar({ open: true, message: `Parse error: ${err instanceof Error ? err.message : 'Unknown error'}`, severity: 'error' });
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset so re-selecting the same file triggers onChange
    e.target.value = '';
  };

  // Upload after column mapping
  const handleMappingConfirm = async (mapping: CrossRefColumnMapping) => {
    setMappingDialogOpen(false);
    if (!parsedFile) return;

    setUploading(true);
    try {
      // Parse type column values
      const normalizeType = (val: string): 'pin_to_pin' | 'functional' => {
        const lower = val.toLowerCase().trim();
        if (lower.includes('pin') || lower === 'p2p' || lower === 'ptp' || lower === 'drop-in' || lower === 'drop in') return 'pin_to_pin';
        return 'functional';
      };

      const rows = parsedFile.rows.map(row => ({
        xref_mpn: row[mapping.xrefMpnColumn]?.trim() || '',
        xref_manufacturer: mapping.xrefMfrColumn !== undefined ? row[mapping.xrefMfrColumn]?.trim() || undefined : undefined,
        xref_description: mapping.xrefDescColumn !== undefined ? row[mapping.xrefDescColumn]?.trim() || undefined : undefined,
        original_mpn: row[mapping.originalMpnColumn]?.trim() || '',
        original_manufacturer: mapping.originalMfrColumn !== undefined ? row[mapping.originalMfrColumn]?.trim() || undefined : undefined,
        equivalence_type: mapping.equivalenceTypeColumn !== undefined
          ? normalizeType(row[mapping.equivalenceTypeColumn] || '')
          : 'functional',
      })).filter(r => r.xref_mpn && r.original_mpn); // Skip rows missing required fields

      if (rows.length === 0) {
        setSnackbar({ open: true, message: 'No valid rows found after mapping', severity: 'error' });
        return;
      }

      const result = await uploadMfrCrossRefs(slug, rows);
      const parts: string[] = [`Uploaded ${result.inserted} cross-references`];
      if (result.skipped > 0) parts.push(`${result.skipped} duplicates skipped`);
      if (result.atlasEnriched > 0) parts.push(`${result.atlasEnriched} descriptions enriched from Atlas`);
      setSnackbar({ open: true, message: parts.join(' · '), severity: 'success' });
      setParsedFile(null);
      setPage(0);
      fetchCrossRefs();
    } catch (err) {
      setSnackbar({ open: true, message: `Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`, severity: 'error' });
    } finally {
      setUploading(false);
    }
  };

  // Delete
  const handleDelete = async (xref: ManufacturerCrossReference) => {
    if (!window.confirm(`Delete cross-reference ${xref.original_mpn} → ${xref.xref_mpn}?`)) return;
    // Optimistic
    setCrossRefs(prev => prev.filter(r => r.id !== xref.id));
    setTotal(prev => prev - 1);
    try {
      await deleteMfrCrossRefs(slug, [xref.id]);
    } catch {
      fetchCrossRefs(); // Revert on error
      setSnackbar({ open: true, message: 'Failed to delete cross-reference', severity: 'error' });
    }
  };

  return (
    <Box>
      {/* Upload zone */}
      <Box
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        sx={{
          border: 2,
          borderStyle: 'dashed',
          borderColor: dragOver ? 'primary.main' : 'divider',
          borderRadius: 2,
          p: 3,
          mb: 3,
          textAlign: 'center',
          cursor: 'pointer',
          bgcolor: dragOver ? 'rgba(160, 196, 255, 0.08)' : 'transparent',
          transition: 'all 0.15s',
          '&:hover': { borderColor: 'primary.main', bgcolor: 'rgba(160, 196, 255, 0.04)' },
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_FORMATS}
          style={{ display: 'none' }}
          onChange={handleFileInput}
        />
        <UploadFileIcon sx={{ fontSize: 36, color: 'text.disabled', mb: 1 }} />
        <Typography variant="body2" color="text.secondary">
          Drop an Excel or CSV file here, or click to browse
        </Typography>
        <Typography variant="caption" color="text.disabled">
          Upload cross-references from {manufacturerName}. Accepts .xlsx, .xls, .csv
        </Typography>
      </Box>

      {uploading && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <CircularProgress size={16} />
          <Typography variant="caption" color="text.secondary">Uploading cross-references...</Typography>
        </Box>
      )}

      {/* Search + table */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, gap: 2 }}>
        <Typography variant="subtitle2" color="text.secondary">
          {total > 0 ? `${total} cross-reference${total !== 1 ? 's' : ''}` : search ? 'No results' : 'No cross-references uploaded yet'}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {lastUploadedAt ? (
            <Tooltip title={new Date(lastUploadedAt).toLocaleString()} arrow>
              <Typography variant="caption" color="text.secondary">
                Last uploaded: {formatRelativeTime(lastUploadedAt)}
              </Typography>
            </Tooltip>
          ) : (
            <Typography variant="caption" color="text.disabled">
              Last uploaded: never
            </Typography>
          )}
          {(total > 0 || search) && (
            <TextField
              size="small"
              placeholder="Search MPN..."
              onChange={(e) => handleSearchChange(e.target.value)}
              sx={{ width: 240, '& input': { fontSize: '0.8rem' } }}
            />
          )}
        </Box>
      </Box>

      {loading && crossRefs.length === 0 ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={24} />
        </Box>
      ) : crossRefs.length > 0 ? (
        <>
          <TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.72rem' }}>Original MPN</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.72rem' }}>Original MFR</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.72rem' }}>Xref MPN</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.72rem' }}>Xref MFR</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.72rem' }}>Description</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.72rem' }}>Type</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.72rem' }}>Uploaded</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.72rem', width: 48 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {crossRefs.map((xref) => (
                  <TableRow key={xref.id} hover>
                    <TableCell sx={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>{xref.original_mpn}</TableCell>
                    <TableCell sx={{ fontSize: '0.72rem' }}>{xref.original_manufacturer || '—'}</TableCell>
                    <TableCell sx={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>{xref.xref_mpn}</TableCell>
                    <TableCell sx={{ fontSize: '0.72rem' }}>{xref.xref_manufacturer || '—'}</TableCell>
                    <TableCell sx={{ fontSize: '0.72rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <Tooltip title={xref.xref_description || ''} arrow>
                        <span>{xref.xref_description || '—'}</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={xref.equivalence_type === 'pin_to_pin' ? 'Pin-to-Pin' : 'Functional'}
                        size="small"
                        variant="outlined"
                        sx={{
                          height: 20,
                          fontSize: '0.65rem',
                          color: xref.equivalence_type === 'pin_to_pin' ? '#66BB6A' : '#FFA726',
                          borderColor: xref.equivalence_type === 'pin_to_pin' ? '#66BB6A' : '#FFA726',
                        }}
                      />
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
                      {xref.uploaded_at ? new Date(xref.uploaded_at).toLocaleDateString() : '—'}
                    </TableCell>
                    <TableCell>
                      <IconButton size="small" onClick={() => handleDelete(xref)} sx={{ opacity: 0.5, '&:hover': { opacity: 1 } }}>
                        <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={PAGE_SIZE}
            rowsPerPageOptions={[PAGE_SIZE]}
            sx={{ '& .MuiTablePagination-displayedRows': { fontSize: '0.75rem' } }}
          />
        </>
      ) : !loading ? (
        <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic', py: 2 }}>
          {search ? 'No cross-references match your search.' : 'Upload an Excel or CSV file to add manufacturer-certified cross-references.'}
        </Typography>
      ) : null}

      {/* Column mapping dialog */}
      <CrossRefColumnMappingDialog
        open={mappingDialogOpen}
        parsedData={parsedFile}
        onConfirm={handleMappingConfirm}
        onCancel={() => { setMappingDialogOpen(false); setParsedFile(null); }}
      />

      {/* Snackbar feedback */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
