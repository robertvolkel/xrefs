'use client';

import { Box, Paper, Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material';
import type { ComparisonTable as ComparisonTableData } from '@/lib/services/comparisonTable';

interface ComparisonTableProps {
  table: ComparisonTableData;
  /** MPNs known to be real (for click affordance). */
  knownMpns?: Set<string>;
  /** Opens the part when an MPN is clicked (same handler as card/linkify clicks). */
  onMpnClick?: (mpn: string) => void;
}

/**
 * Renders a system-built comparison table (grounding plan step 4). The data comes from
 * buildComparisonTable() — every cell traces to a real catalog lookup, so nothing here
 * is model-authored prose. The MPN column is clickable (opens the part) when a handler
 * is provided. Horizontally scrollable for wide tables.
 */
export default function ComparisonTable({ table, knownMpns, onMpnClick }: ComparisonTableProps) {
  if (!table.columns.length || !table.rows.length) return null;

  return (
    <Box sx={{ mt: 1, mb: 0.5, overflowX: 'auto', maxWidth: '100%' }}>
      <Paper variant="outlined" sx={{ display: 'inline-block', minWidth: '100%', bgcolor: 'background.paper' }}>
        <Table size="small" sx={{ '& td, & th': { px: 1.25, py: 0.75, fontSize: '0.8rem', whiteSpace: 'nowrap' } }}>
          <TableHead>
            <TableRow sx={{ '& th': { fontWeight: 600, color: 'text.secondary', borderBottom: 1, borderColor: 'divider' } }}>
              {table.columns.map((col) => (
                <TableCell key={col.key}>{col.label}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {table.rows.map((row) => {
              const clickable = !!onMpnClick && (!knownMpns || knownMpns.has(row.mpn));
              return (
                <TableRow key={row.mpn} hover>
                  {table.columns.map((col) => {
                    const value = row.cells[col.key] ?? '—';
                    if (col.key === 'mpn') {
                      return (
                        <TableCell
                          key={col.key}
                          onClick={clickable ? () => onMpnClick!(row.mpn) : undefined}
                          sx={{
                            fontFamily: '"Roboto Mono", monospace',
                            color: clickable ? 'primary.main' : 'text.primary',
                            cursor: clickable ? 'pointer' : 'default',
                            '&:hover': clickable ? { textDecoration: 'underline' } : undefined,
                          }}
                        >
                          {value}
                        </TableCell>
                      );
                    }
                    return (
                      <TableCell
                        key={col.key}
                        sx={{ color: value === '—' ? 'text.disabled' : 'text.primary' }}
                      >
                        {value}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
}
