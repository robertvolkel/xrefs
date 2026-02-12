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
  Chip,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { PartAttributes, XrefRecommendation, MatchStatus } from '@/lib/types';
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

function getStatusColor(status: MatchStatus): string {
  switch (status) {
    case 'exact':
      return 'inherit';
    case 'better':
      return '#69F0AE';
    case 'worse':
      return '#FF5252';
    case 'compatible':
      return '#FFD54F';
    case 'different':
      return '#A0A0A0';
    default:
      return 'inherit';
  }
}

function getStatusLabel(status: MatchStatus): string {
  switch (status) {
    case 'exact':
      return 'Match';
    case 'better':
      return 'Better';
    case 'worse':
      return 'Worse';
    case 'compatible':
      return 'OK';
    case 'different':
      return 'Diff';
    default:
      return '';
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
              <TableCell sx={{ bgcolor: 'background.paper', fontSize: '0.7rem', fontWeight: 600, borderColor: 'divider', color: 'text.secondary', py: ROW_PY, width: 56 }} align="center">
                Status
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.parameterId} hover>
                <TableCell
                  sx={{
                    color: 'text.secondary',
                    fontSize: ROW_FONT_SIZE,
                    borderColor: 'divider',
                    width: '40%',
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
                    color: getStatusColor(row.matchStatus),
                    py: ROW_PY,
                  }}
                >
                  {row.replacementValue}
                </TableCell>
                <TableCell
                  align="center"
                  sx={{ borderColor: 'divider', py: ROW_PY }}
                >
                  {row.matchStatus !== 'exact' && (
                    <Chip
                      label={getStatusLabel(row.matchStatus)}
                      size="small"
                      sx={{
                        fontSize: '0.6rem',
                        height: 18,
                        color: getStatusColor(row.matchStatus),
                        borderColor: getStatusColor(row.matchStatus),
                      }}
                      variant="outlined"
                    />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
