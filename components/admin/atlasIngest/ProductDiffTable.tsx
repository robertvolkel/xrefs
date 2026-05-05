'use client';

/**
 * ProductDiffTable — collapsible per-product attribute diff table.
 * Renders the first 50 entries by default; "Show all" reveals the rest.
 */

import { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';

interface ProductDiffRow {
  mpn: string;
  kind: 'insert' | 'update';
  added: string[];
  changed: Array<{ key: string; oldValue: unknown; newValue: unknown }>;
  removed: string[];
}

interface Props {
  rows: ProductDiffRow[];
}

const INITIAL_LIMIT = 50;

export default function ProductDiffTable({ rows }: Props) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? rows : rows.slice(0, INITIAL_LIMIT);

  if (rows.length === 0) return null;

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="caption" sx={{ fontWeight: 600 }}>
        Product changes ({rows.length}):
      </Typography>
      <TableContainer sx={{ mt: 1, maxHeight: 600 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, fontSize: '0.7rem' }}>MPN</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: '0.7rem', width: 80 }}>Kind</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: '0.7rem' }}>Added</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: '0.7rem' }}>Changed</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: '0.7rem' }}>Removed</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {visible.map((row) => (
              <TableRow key={row.mpn}>
                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>{row.mpn}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    variant="outlined"
                    label={row.kind}
                    sx={{
                      fontSize: '0.65rem',
                      height: 20,
                      borderColor: row.kind === 'insert' ? 'success.main' : 'info.main',
                      color: row.kind === 'insert' ? 'success.light' : 'info.light',
                      bgcolor: 'transparent',
                    }}
                  />
                </TableCell>
                <TableCell sx={{ fontSize: '0.7rem', maxWidth: 200 }}>
                  {row.added.length > 0 ? (
                    <Stack direction="row" spacing={0.25} flexWrap="wrap" useFlexGap>
                      {row.added.slice(0, 8).map((a) => (
                        <Box
                          key={a}
                          component="code"
                          sx={{
                            color: 'success.light',
                            border: '1px solid',
                            borderColor: 'success.main',
                            bgcolor: 'transparent',
                            px: 0.5,
                            borderRadius: 0.5,
                            fontSize: '0.65rem',
                          }}
                        >
                          {a}
                        </Box>
                      ))}
                      {row.added.length > 8 && (
                        <Typography variant="caption" color="text.secondary">+{row.added.length - 8}</Typography>
                      )}
                    </Stack>
                  ) : '—'}
                </TableCell>
                <TableCell sx={{ fontSize: '0.65rem', maxWidth: 280 }}>
                  {row.changed.length > 0 ? (
                    <Box>
                      {row.changed.slice(0, 4).map((c) => (
                        <Box key={c.key} sx={{ mb: 0.25 }}>
                          <code>{c.key}</code>: <code style={{ color: 'var(--mui-palette-error-light)' }}>{String(c.oldValue ?? '∅')}</code>
                          {' → '}
                          <code style={{ color: 'var(--mui-palette-success-light)' }}>{String(c.newValue ?? '∅')}</code>
                        </Box>
                      ))}
                      {row.changed.length > 4 && (
                        <Typography variant="caption" color="text.secondary">+{row.changed.length - 4} more</Typography>
                      )}
                    </Box>
                  ) : '—'}
                </TableCell>
                <TableCell sx={{ fontSize: '0.7rem', maxWidth: 200 }}>
                  {row.removed.length > 0 ? (
                    <Stack direction="row" spacing={0.25} flexWrap="wrap" useFlexGap>
                      {row.removed.slice(0, 6).map((a) => (
                        <Box
                          key={a}
                          component="code"
                          sx={{
                            color: 'error.light',
                            border: '1px solid',
                            borderColor: 'error.main',
                            bgcolor: 'transparent',
                            px: 0.5,
                            borderRadius: 0.5,
                            fontSize: '0.65rem',
                          }}
                        >
                          {a}
                        </Box>
                      ))}
                      {row.removed.length > 6 && (
                        <Typography variant="caption" color="text.secondary">+{row.removed.length - 6}</Typography>
                      )}
                    </Stack>
                  ) : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {rows.length > INITIAL_LIMIT && (
        <Button size="small" onClick={() => setShowAll((p) => !p)} sx={{ mt: 1 }}>
          {showAll ? `Show first ${INITIAL_LIMIT}` : `Show all ${rows.length}`}
        </Button>
      )}
    </Box>
  );
}
