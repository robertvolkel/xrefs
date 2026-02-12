'use client';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Stack,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { PartAttributes, XrefRecommendation, MatchStatus, RuleResult } from '@/lib/types';
import MatchPercentageBadge from './MatchPercentageBadge';

// Must match AttributesPanel for row alignment
const HEADER_HEIGHT = 100;
const ROW_FONT_SIZE = '0.78rem';
const ROW_PY = '10px';

interface ComparisonViewProps {
  sourceAttributes: PartAttributes;
  replacementAttributes: PartAttributes;
  recommendation: XrefRecommendation;
  onBack: () => void;
  onManufacturerClick?: (manufacturer: string) => void;
}

const DOT_GREEN = '#69F0AE';
const DOT_YELLOW = '#FFD54F';
const DOT_RED = '#FF5252';
const DOT_GREY = '#90A4AE';

function getDotInfo(
  ruleResult: RuleResult | undefined,
  matchStatus: MatchStatus,
  note: string | undefined
): { color: string; label: string } {
  // Prefer ruleResult when available (from matching engine)
  if (ruleResult) {
    switch (ruleResult) {
      case 'pass':
        return { color: DOT_GREEN, label: note ? `Pass (${note})` : 'Pass' };
      case 'upgrade':
        return { color: DOT_GREEN, label: note ? `Pass (${note})` : 'Pass' };
      case 'review':
        return { color: DOT_YELLOW, label: note ? `Review (${note})` : 'Review' };
      case 'fail':
        return { color: DOT_RED, label: note ? `Fail (${note})` : 'Fail' };
      case 'info':
        return { color: DOT_GREY, label: note || 'Info' };
    }
  }

  // Fallback: derive from matchStatus (mock data without ruleResult)
  switch (matchStatus) {
    case 'exact':
      return { color: DOT_GREEN, label: 'Pass' };
    case 'better':
      return { color: DOT_GREEN, label: 'Pass' };
    case 'compatible':
      return { color: DOT_YELLOW, label: 'OK' };
    case 'worse':
      return { color: DOT_RED, label: 'Worse' };
    case 'different':
      return { color: DOT_GREY, label: 'Diff' };
    default:
      return { color: DOT_GREY, label: '' };
  }
}

function getValueColor(matchStatus: MatchStatus): string {
  switch (matchStatus) {
    case 'exact':
      return 'inherit';
    case 'better':
      return DOT_GREEN;
    case 'worse':
      return DOT_RED;
    case 'compatible':
      return DOT_YELLOW;
    case 'different':
      return DOT_GREY;
    default:
      return 'inherit';
  }
}

export default function ComparisonView({
  sourceAttributes,
  replacementAttributes,
  recommendation,
  onBack,
  onManufacturerClick,
}: ComparisonViewProps) {
  const matchMap = new Map(
    recommendation.matchDetails.map((d) => [d.parameterId, d])
  );

  const rows = sourceAttributes.parameters
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((sourceParam) => {
      const replParam = replacementAttributes.parameters.find(
        (p) => p.parameterId === sourceParam.parameterId
      );
      const matchDetail = matchMap.get(sourceParam.parameterId);

      return {
        parameterId: sourceParam.parameterId,
        parameterName: sourceParam.parameterName,
        replacementValue: replParam?.value ?? '—',
        matchStatus: matchDetail?.matchStatus ?? ('different' as MatchStatus),
        ruleResult: matchDetail?.ruleResult,
        note: matchDetail?.note,
      };
    });

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header — same fixed height as AttributesPanel */}
      <Box
        sx={{
          height: HEADER_HEIGHT,
          minHeight: HEADER_HEIGHT,
          p: 2,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          <IconButton onClick={onBack} size="small">
            <ArrowBackIcon fontSize="small" />
          </IconButton>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Comparing with
            </Typography>
            <Typography variant="h6" sx={{ fontFamily: 'monospace', fontSize: '0.95rem', lineHeight: 1.3 }} noWrap>
              {replacementAttributes.part.mpn}
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                fontSize: '0.78rem',
                ...(onManufacturerClick && {
                  cursor: 'pointer',
                  '&:hover': { color: 'primary.main', textDecoration: 'underline' },
                  transition: 'color 0.15s ease',
                }),
              }}
              noWrap
              onClick={onManufacturerClick ? () => onManufacturerClick(replacementAttributes.part.manufacturer) : undefined}
            >
              {replacementAttributes.part.manufacturer}
            </Typography>
          </Box>
          <MatchPercentageBadge percentage={recommendation.matchPercentage} size="small" />
        </Stack>
      </Box>

      {/* Comparison table — rows aligned with left panel */}
      <TableContainer sx={{ flex: 1, overflowY: 'auto' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ bgcolor: 'background.paper', fontSize: '0.7rem', fontWeight: 600, borderColor: 'divider', color: 'text.secondary', py: ROW_PY }}>
                Parameter
              </TableCell>
              <TableCell sx={{ bgcolor: 'background.paper', fontSize: '0.7rem', fontWeight: 600, borderColor: 'divider', color: 'text.secondary', py: ROW_PY }}>
                Value
              </TableCell>
              <TableCell sx={{ bgcolor: 'background.paper', fontSize: '0.7rem', fontWeight: 600, borderColor: 'divider', color: 'text.secondary', py: ROW_PY }}>
                Result
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => {
              const dot = getDotInfo(row.ruleResult, row.matchStatus, row.note);
              return (
                <TableRow key={row.parameterId} hover>
                  <TableCell
                    sx={{
                      color: 'text.secondary',
                      fontSize: ROW_FONT_SIZE,
                      borderColor: 'divider',
                      width: '35%',
                      py: ROW_PY,
                    }}
                  >
                    {row.parameterName}
                  </TableCell>
                  <TableCell
                    sx={{
                      fontFamily: 'monospace',
                      fontSize: ROW_FONT_SIZE,
                      borderColor: 'divider',
                      color: getValueColor(row.matchStatus),
                      py: ROW_PY,
                      width: '30%',
                    }}
                  >
                    {row.replacementValue}
                  </TableCell>
                  <TableCell
                    sx={{ borderColor: 'divider', py: ROW_PY }}
                  >
                    <Stack direction="row" alignItems="flex-start" spacing={0.75}>
                      <Box
                        sx={{
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          bgcolor: dot.color,
                          flexShrink: 0,
                          mt: '3px',
                        }}
                      />
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ fontSize: ROW_FONT_SIZE }}
                      >
                        {dot.label}
                      </Typography>
                    </Stack>
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
