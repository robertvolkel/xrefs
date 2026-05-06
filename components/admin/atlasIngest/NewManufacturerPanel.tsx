'use client';

/**
 * NewManufacturerPanel — surfaces uploaded files referencing brand-new MFRs
 * so the admin can confirm/edit auto-filled identity fields before they're
 * inserted into atlas_manufacturers (and before the report flow runs).
 *
 * Auto-fill logic lives server-side in lib/services/atlasIngestService.ts
 * (parseAtlasFilename). This panel just lets the user override per-row.
 */

import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import type { StagedFile } from './types';

interface Props {
  stagedFiles: StagedFile[];
  onConfirmed: () => void | Promise<void>;
  onCancelled: () => void;
}

interface RowState {
  filename: string;
  atlasId: number;
  nameEn: string;
  nameZh: string;
  nameDisplay: string;
  slug: string;
}

export default function NewManufacturerPanel({ stagedFiles, onConfirmed, onCancelled }: Props) {
  const [rows, setRows] = useState<RowState[]>(() =>
    stagedFiles.map((sf) => ({
      filename: sf.filename,
      atlasId: sf.parsed.atlasId ?? 0,
      nameEn: sf.parsed.nameEn ?? '',
      nameZh: sf.parsed.nameZh ?? '',
      nameDisplay: sf.parsed.nameDisplay ?? '',
      slug: sf.parsed.slug ?? '',
    }))
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateRow = (idx: number, patch: Partial<RowState>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const handleConfirm = async () => {
    setError(null);

    // Client-side validation
    for (const r of rows) {
      if (!r.atlasId || !r.nameEn.trim() || !r.nameDisplay.trim() || !r.slug.trim()) {
        setError(`Row "${r.filename}": atlas_id, name_en, name_display, and slug are required.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/atlas/ingest/register-mfrs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manufacturers: rows.map((r) => ({
            atlas_id: r.atlasId,
            name_en: r.nameEn.trim(),
            name_zh: r.nameZh.trim() || undefined,
            name_display: r.nameDisplay.trim(),
            slug: r.slug.trim(),
            country: 'CN',
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || `Registration failed (${res.status})`);
      }
      await onConfirmed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2, borderColor: 'warning.main' }}>
      <Typography variant="h6" sx={{ fontWeight: 600 }}>
        New manufacturers detected
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        These uploaded files reference manufacturers not yet in the master list. Review the auto-filled fields, edit if needed, then confirm to proceed with report generation.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>Filename</TableCell>
              <TableCell sx={{ fontWeight: 600, width: 100 }}>Atlas ID</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Name (EN)</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Name (ZH)</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Display</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Slug</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r, idx) => (
              <TableRow key={r.filename}>
                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{r.filename}</TableCell>
                <TableCell>
                  <TextField
                    size="small"
                    type="number"
                    value={r.atlasId || ''}
                    onChange={(e) => updateRow(idx, { atlasId: parseInt(e.target.value, 10) || 0 })}
                    sx={{ width: 90 }}
                  />
                </TableCell>
                <TableCell>
                  <TextField
                    size="small"
                    value={r.nameEn}
                    onChange={(e) => updateRow(idx, { nameEn: e.target.value })}
                    fullWidth
                  />
                </TableCell>
                <TableCell>
                  <TextField
                    size="small"
                    value={r.nameZh}
                    onChange={(e) => updateRow(idx, { nameZh: e.target.value })}
                    fullWidth
                  />
                </TableCell>
                <TableCell>
                  <TextField
                    size="small"
                    value={r.nameDisplay}
                    onChange={(e) => updateRow(idx, { nameDisplay: e.target.value })}
                    fullWidth
                  />
                </TableCell>
                <TableCell>
                  <TextField
                    size="small"
                    value={r.slug}
                    onChange={(e) => updateRow(idx, { slug: e.target.value })}
                    fullWidth
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 2 }}>
        <Button onClick={onCancelled} disabled={submitting}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleConfirm}
          disabled={submitting}
        >
          {submitting ? 'Registering…' : `Confirm ${rows.length} & Continue`}
        </Button>
      </Stack>
    </Paper>
  );
}
