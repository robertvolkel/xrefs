'use client';

import {
  Box,
  Chip,
  IconButton,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { PartsListRow } from '@/lib/types';
import MatchPercentageBadge from '../MatchPercentageBadge';

interface PartsListTableProps {
  rows: PartsListRow[];
  validationProgress: number;
  isValidating: boolean;
  onRowClick: (rowIndex: number) => void;
}

const ROW_FONT_SIZE = '0.78rem';

function StatusChip({ status }: { status: PartsListRow['status'] }) {
  switch (status) {
    case 'pending':
      return <Chip label="Pending" size="small" sx={{ fontSize: '0.7rem' }} />;
    case 'validating':
      return <Chip label="Validating..." size="small" color="info" sx={{ fontSize: '0.7rem' }} />;
    case 'resolved':
      return <Chip label="Resolved" size="small" color="success" sx={{ fontSize: '0.7rem' }} />;
    case 'not-found':
      return <Chip label="Not Found" size="small" color="error" sx={{ fontSize: '0.7rem' }} />;
    case 'error':
      return <Chip label="Error" size="small" color="warning" sx={{ fontSize: '0.7rem' }} />;
  }
}

export default function PartsListTable({
  rows,
  validationProgress,
  isValidating,
  onRowClick,
}: PartsListTableProps) {
  const resolved = rows.filter(r => r.status === 'resolved').length;
  const total = rows.length;
  const processed = rows.filter(r => r.status !== 'pending' && r.status !== 'validating').length;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', px: 3 }}>
      {/* Progress bar */}
      <Box sx={{ px: 3, pt: 2, pb: 1, flexShrink: 0 }}>
        {isValidating ? (
          <>
            <LinearProgress
              variant="determinate"
              value={validationProgress * 100}
              sx={{ mb: 1, borderRadius: 1 }}
            />
            <Typography variant="caption" color="text.secondary">
              Validating... {processed} of {total} parts processed
            </Typography>
          </>
        ) : (
          <Typography variant="body2" color="text.secondary">
            {resolved} of {total} parts resolved
          </Typography>
        )}
      </Box>

      {/* Table */}
      <TableContainer sx={{ flex: 1, overflowY: 'auto' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', px: 1, whiteSpace: 'nowrap' }}>#</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', px: 1, whiteSpace: 'nowrap' }}>Part</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', px: 1, whiteSpace: 'nowrap' }}>Description</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', px: 1, whiteSpace: 'nowrap', textAlign: 'right' }}>Price</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', px: 1, whiteSpace: 'nowrap', textAlign: 'right' }}>Stock</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', px: 1, whiteSpace: 'nowrap' }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', px: 1, whiteSpace: 'nowrap', textAlign: 'center' }}>Hits</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', px: 1, whiteSpace: 'nowrap' }}>Top Suggestion</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', px: 1, whiteSpace: 'nowrap', textAlign: 'center' }}>Match</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', px: 1, whiteSpace: 'nowrap', textAlign: 'right' }}>Price</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', px: 1, whiteSpace: 'nowrap', textAlign: 'right' }}>Stock</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', px: 1 }} />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => {
              const recCount = row.allRecommendations?.length ?? (row.suggestedReplacement ? 1 : 0);
              const topRec = row.suggestedReplacement;

              return (
                <TableRow
                  key={row.rowIndex}
                  hover
                  sx={{
                    cursor: row.status === 'resolved' ? 'pointer' : 'default',
                    '&:hover': row.status === 'resolved'
                      ? { bgcolor: 'rgba(160, 196, 255, 0.05)' }
                      : {},
                  }}
                  onClick={() => row.status === 'resolved' && onRowClick(row.rowIndex)}
                >
                  {/* # */}
                  <TableCell sx={{ fontSize: ROW_FONT_SIZE, color: 'text.secondary', px: 1, whiteSpace: 'nowrap' }}>
                    {row.rowIndex + 1}
                  </TableCell>

                  {/* Part (MPN + Manufacturer) */}
                  <TableCell sx={{ fontSize: ROW_FONT_SIZE, px: 1, whiteSpace: 'nowrap' }}>
                    <Typography
                      variant="body2"
                      noWrap
                      sx={{ fontSize: ROW_FONT_SIZE, fontFamily: 'monospace', fontWeight: 500 }}
                    >
                      {row.rawMpn}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: '0.7rem', display: 'block' }}>
                      {row.rawManufacturer}
                    </Typography>
                  </TableCell>

                  {/* Description */}
                  <TableCell
                    sx={{
                      fontSize: ROW_FONT_SIZE,
                      px: 1,
                      maxWidth: 320,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {row.rawDescription}
                  </TableCell>

                  {/* Price (original part) */}
                  <TableCell sx={{ fontSize: ROW_FONT_SIZE, textAlign: 'right', px: 1, whiteSpace: 'nowrap' }}>
                    {row.sourceAttributes?.part.unitPrice != null
                      ? `$${row.sourceAttributes.part.unitPrice.toFixed(2)}`
                      : null}
                  </TableCell>

                  {/* Stock (original part) */}
                  <TableCell sx={{ fontSize: ROW_FONT_SIZE, textAlign: 'right', px: 1, whiteSpace: 'nowrap' }}>
                    {row.sourceAttributes?.part.quantityAvailable != null
                      ? row.sourceAttributes.part.quantityAvailable.toLocaleString()
                      : null}
                  </TableCell>

                  {/* Status */}
                  <TableCell sx={{ px: 1, whiteSpace: 'nowrap' }}>
                    <StatusChip status={row.status} />
                  </TableCell>

                  {/* Suggestions count */}
                  <TableCell sx={{ fontSize: ROW_FONT_SIZE, textAlign: 'center', px: 1, whiteSpace: 'nowrap' }}>
                    {row.status === 'resolved' ? (
                      <Typography variant="body2" sx={{ fontSize: ROW_FONT_SIZE, fontWeight: 500 }}>
                        {recCount}
                      </Typography>
                    ) : null}
                  </TableCell>

                  {/* Top Suggestion (MPN + Manufacturer) */}
                  <TableCell sx={{ fontSize: ROW_FONT_SIZE, px: 1, whiteSpace: 'nowrap' }}>
                    {topRec ? (
                      <Box>
                        <Typography
                          variant="body2"
                          noWrap
                          sx={{ fontSize: ROW_FONT_SIZE, fontFamily: 'monospace', fontWeight: 500 }}
                        >
                          {topRec.part.mpn}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: '0.7rem', display: 'block' }}>
                          {topRec.part.manufacturer}
                        </Typography>
                      </Box>
                    ) : row.status === 'resolved' ? (
                      <Typography variant="caption" color="text.secondary">
                        No replacement found
                      </Typography>
                    ) : null}
                  </TableCell>

                  {/* Match */}
                  <TableCell sx={{ textAlign: 'center', px: 1, whiteSpace: 'nowrap' }}>
                    {topRec && (
                      <MatchPercentageBadge
                        percentage={topRec.matchPercentage}
                        size="small"
                        hasFailures={topRec.matchDetails.some(d => d.ruleResult === 'fail')}
                        hasReviews={topRec.matchDetails.some(d => d.ruleResult === 'review')}
                      />
                    )}
                  </TableCell>

                  {/* Price (of top suggestion) */}
                  <TableCell sx={{ fontSize: ROW_FONT_SIZE, textAlign: 'right', px: 1, whiteSpace: 'nowrap' }}>
                    {topRec?.part.unitPrice != null
                      ? `$${topRec.part.unitPrice.toFixed(2)}`
                      : null}
                  </TableCell>

                  {/* Stock (of top suggestion) */}
                  <TableCell sx={{ fontSize: ROW_FONT_SIZE, textAlign: 'right', px: 1, whiteSpace: 'nowrap' }}>
                    {topRec?.part.quantityAvailable != null
                      ? topRec.part.quantityAvailable.toLocaleString()
                      : null}
                  </TableCell>

                  {/* Action */}
                  <TableCell sx={{ px: 1 }}>
                    {row.status === 'resolved' && (
                      <Tooltip title="Explore replacements">
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRowClick(row.rowIndex);
                          }}
                        >
                          <OpenInNewIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
