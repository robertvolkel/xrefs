'use client';

import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import type { DuplicateGroup } from '@/lib/types';

interface DuplicateDetectionDialogProps {
  open: boolean;
  groups: DuplicateGroup[];
  qtyColumnMapped: boolean;
  loading?: boolean;
  onConsolidate: () => void;
  onLeaveAsIs: () => void;
}

export default function DuplicateDetectionDialog({
  open,
  groups,
  qtyColumnMapped,
  loading = false,
  onConsolidate,
  onLeaveAsIs,
}: DuplicateDetectionDialogProps) {
  const totalRowsAffected = groups.reduce((s, g) => s + g.rowCount, 0);

  return (
    <Dialog
      open={open}
      onClose={() => { /* forced choice — user must pick an action */ }}
      disableEscapeKeyDown
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { bgcolor: 'background.paper' } }}
    >
      <DialogTitle sx={{ pb: 0.5 }}>Duplicate parts found</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {groups.length === 1
            ? `1 part appears on multiple rows (${totalRowsAffected} rows total).`
            : `${groups.length} parts appear on multiple rows (${totalRowsAffected} rows total).`}
          {' '}
          Decide how to handle them before validation starts.
        </Typography>

        <TableContainer sx={{ maxHeight: 280, border: 1, borderColor: 'divider', borderRadius: 1, mb: 2 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>MPN</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Manufacturer</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Occurrences</TableCell>
                {qtyColumnMapped && (
                  <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Total Qty</TableCell>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {groups.map((g, i) => (
                <TableRow key={`${g.mpn}|${g.manufacturer}|${i}`}>
                  <TableCell sx={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>{g.mpn}</TableCell>
                  <TableCell sx={{ fontSize: '0.8rem' }}>{g.manufacturer}</TableCell>
                  <TableCell align="right" sx={{ fontSize: '0.8rem' }}>{g.rowCount}</TableCell>
                  {qtyColumnMapped && (
                    <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                      {g.totalQty !== undefined ? g.totalQty : '—'}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Alert severity="warning" sx={{ py: 0.5 }}>
          <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
            Consolidating keeps the <strong>first occurrence</strong> of each duplicate and <strong>discards the extras</strong>,
            including reference designators and any other data in those rows.
            {qtyColumnMapped ? ' Quantities will be summed into the survivor.' : ''}
            {' '}This cannot be undone. If your BOM uses one row per designator, consider leaving it as is.
          </Typography>
        </Alert>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, justifyContent: 'space-between' }}>
        <Button onClick={onLeaveAsIs} color="inherit" disabled={loading}>
          Leave as is
        </Button>
        <Button variant="contained" onClick={onConsolidate} disabled={loading}>
          {loading ? '...' : 'Consolidate duplicates'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
