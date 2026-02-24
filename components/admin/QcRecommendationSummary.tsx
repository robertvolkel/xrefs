'use client';

import {
  Box,
  Typography,
  Stack,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Card,
  CardContent,
  Tooltip,
} from '@mui/material';
import { XrefRecommendation } from '@/lib/types';
import { DOT_GREEN, DOT_YELLOW, DOT_RED, resultDotColor } from './qcConstants';

interface QcRecommendationSummaryProps {
  rec: XrefRecommendation;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

export default function QcRecommendationSummary({ rec, t }: QcRecommendationSummaryProps) {
  const hasFailures = rec.matchDetails.some(d => d.ruleResult === 'fail');
  const hasReviews = !hasFailures && rec.matchDetails.some(d => d.ruleResult === 'review');

  return (
    <Card variant="outlined" sx={{ bgcolor: 'background.default' }}>
      <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography variant="subtitle2" sx={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>
                {rec.part.mpn}
              </Typography>
              <Chip
                label={rec.part.status}
                size="small"
                color={rec.part.status === 'Active' ? 'success' : 'warning'}
                variant="outlined"
                sx={{ height: 18, fontSize: '0.6rem' }}
              />
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
              {rec.part.manufacturer}
            </Typography>
          </Box>
          <Chip
            label={t('adminQc.matchPercent', { percent: Math.round(rec.matchPercentage) })}
            size="small"
            sx={{
              height: 24,
              fontSize: '0.72rem',
              fontWeight: 600,
              bgcolor: hasFailures ? '#FF525222' : hasReviews ? '#FFD54F22' : '#69F0AE22',
              color: hasFailures ? DOT_RED : hasReviews ? DOT_YELLOW : DOT_GREEN,
            }}
          />
        </Stack>

        {/* Match details table */}
        {rec.matchDetails.length > 0 && (
          <Box sx={{ mt: 1 }}>
            <Table size="small">
              <TableBody>
                {rec.matchDetails.map((detail) => (
                  <TableRow key={detail.parameterId} sx={{ '&:last-child td': { borderBottom: 0 } }}>
                    <TableCell sx={{ fontSize: '0.72rem', color: 'text.secondary', py: 0.5, pl: 0, width: '35%' }}>
                      {detail.parameterName}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.72rem', fontFamily: 'monospace', py: 0.5, width: '35%' }}>
                      {detail.replacementValue ?? '—'}
                    </TableCell>
                    <TableCell sx={{ py: 0.5, width: '30%' }}>
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <Box
                          sx={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            bgcolor: resultDotColor(detail.ruleResult),
                            flexShrink: 0,
                          }}
                        />
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>
                          {detail.ruleResult ?? detail.matchStatus}
                        </Typography>
                        {detail.note && (
                          <Tooltip title={detail.note} placement="top" arrow>
                            <Typography variant="caption" sx={{ fontSize: '0.65rem', opacity: 0.5, cursor: 'help' }}>
                              ?
                            </Typography>
                          </Tooltip>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
