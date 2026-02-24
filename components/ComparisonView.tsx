'use client';
import { useState } from 'react';
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
  Chip,
  Link,
  Stack,
  Tooltip,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useTranslation } from 'react-i18next';
import { PartAttributes, XrefRecommendation, MatchStatus, RuleResult } from '@/lib/types';
import { HEADER_HEIGHT, HEADER_HEIGHT_MOBILE, ROW_FONT_SIZE, ROW_FONT_SIZE_MOBILE, ROW_PY, ROW_PY_MOBILE, ROW_HEIGHT, ROW_HEIGHT_MOBILE } from '@/lib/layoutConstants';
import ComparisonFeedbackDialog from './ComparisonFeedbackDialog';

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
  t: (key: string) => string,
): { color: string; label: string } {
  // Prefer ruleResult when available (from matching engine)
  if (ruleResult) {
    switch (ruleResult) {
      case 'pass':
        return { color: DOT_GREEN, label: t('comparison.pass') };
      case 'upgrade':
        return { color: DOT_GREEN, label: t('comparison.pass') };
      case 'review':
        return { color: DOT_YELLOW, label: t('comparison.review') };
      case 'fail':
        return { color: DOT_RED, label: t('comparison.fail') };
      case 'info':
        return { color: DOT_GREY, label: t('comparison.info') };
    }
  }

  // Fallback: derive from matchStatus (mock data without ruleResult)
  switch (matchStatus) {
    case 'exact':
      return { color: DOT_GREEN, label: t('comparison.pass') };
    case 'better':
      return { color: DOT_GREEN, label: t('comparison.pass') };
    case 'compatible':
      return { color: DOT_YELLOW, label: t('comparison.ok') };
    case 'worse':
      return { color: DOT_RED, label: t('comparison.worse') };
    case 'different':
      return { color: DOT_GREY, label: t('comparison.diff') };
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
  const { t } = useTranslation();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
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
        sourceValue: sourceParam.value,
        replacementValue: replParam?.value ?? '—',
        matchStatus: matchDetail?.matchStatus ?? ('different' as MatchStatus),
        ruleResult: matchDetail?.ruleResult,
        note: matchDetail?.note,
      };
    })
    .filter((row) => !(row.matchStatus === 'different' && !row.ruleResult));

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header — same fixed height as AttributesPanel */}
      <Box
        sx={{
          height: { xs: HEADER_HEIGHT_MOBILE, md: HEADER_HEIGHT },
          minHeight: { xs: HEADER_HEIGHT_MOBILE, md: HEADER_HEIGHT },
          px: 2,
          py: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          <IconButton onClick={onBack} size="small">
            <ArrowBackIcon fontSize="small" />
          </IconButton>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {t('comparison.comparingWith')}
            </Typography>
            <Stack direction="row" alignItems="center" spacing={0.75}>
              <Typography variant="h6" sx={{ fontFamily: 'monospace', fontSize: '0.95rem', lineHeight: 1.3 }} noWrap>
                {replacementAttributes.part.mpn}
              </Typography>
              <Chip label={replacementAttributes.part.status} size="small" color={replacementAttributes.part.status === 'Active' ? 'success' : 'warning'} variant="outlined" sx={{ height: 18, fontSize: '0.6rem' }} />
            </Stack>
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
        </Stack>
      </Box>

      {/* Comparison table — rows aligned with left panel */}
      <TableContainer sx={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
        <Table size="small" stickyHeader sx={{ minWidth: { xs: 420, md: 'auto' } }}>
          <TableHead>
            <TableRow sx={{ height: { xs: ROW_HEIGHT_MOBILE, md: ROW_HEIGHT } }}>
              <TableCell sx={{ bgcolor: 'background.paper', fontSize: '0.7rem', fontWeight: 600, borderColor: 'divider', color: 'text.secondary', py: { xs: ROW_PY_MOBILE, md: ROW_PY } }}>
                {t('comparison.parameterHeader')}
              </TableCell>
              <TableCell sx={{ bgcolor: 'background.paper', fontSize: '0.7rem', fontWeight: 600, borderColor: 'divider', color: 'text.secondary', py: { xs: ROW_PY_MOBILE, md: ROW_PY } }}>
                {t('comparison.valueHeader')}
              </TableCell>
              <TableCell sx={{ bgcolor: 'background.paper', fontSize: '0.7rem', fontWeight: 600, borderColor: 'divider', color: 'text.secondary', py: { xs: ROW_PY_MOBILE, md: ROW_PY } }}>
                {t('comparison.resultHeader')}
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => {
              const dot = getDotInfo(row.ruleResult, row.matchStatus, t);
              const resultContent = (
                <Stack direction="row" alignItems="center" spacing={0.75} sx={{ cursor: row.note ? 'help' : 'default' }}>
                  <Box
                    sx={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      bgcolor: dot.color,
                      flexShrink: 0,
                    }}
                  />
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE }, lineHeight: 1.43 }}
                  >
                    {dot.label}
                  </Typography>
                </Stack>
              );
              return (
                <TableRow key={row.parameterId} hover sx={{ height: { xs: ROW_HEIGHT_MOBILE, md: ROW_HEIGHT } }}>
                  <TableCell
                    sx={{
                      color: 'text.secondary',
                      fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE },
                      borderColor: 'divider',
                      width: '40%',
                      py: { xs: ROW_PY_MOBILE, md: ROW_PY },
                    }}
                  >
                    {row.parameterName}
                  </TableCell>
                  <TableCell
                    sx={{
                      fontFamily: 'monospace',
                      fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE },
                      borderColor: 'divider',
                      color: getValueColor(row.matchStatus),
                      py: { xs: ROW_PY_MOBILE, md: ROW_PY },
                      width: '45%',
                    }}
                  >
                    {row.replacementValue}
                  </TableCell>
                  <TableCell
                    sx={{ borderColor: 'divider', py: { xs: ROW_PY_MOBILE, md: ROW_PY }, width: '15%' }}
                  >
                    {row.note ? (
                      <Tooltip title={row.note} placement="left" arrow>
                        {resultContent}
                      </Tooltip>
                    ) : (
                      resultContent
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Feedback link */}
      <Box sx={{ px: 2, py: 1.5, borderTop: 1, borderColor: 'divider', flexShrink: 0 }}>
        <Link
          component="button"
          variant="body2"
          onClick={() => setFeedbackOpen(true)}
          sx={{ fontSize: '0.78rem' }}
        >
          {t('feedback.provideFeedback')}
        </Link>
      </Box>

      <ComparisonFeedbackDialog
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        sourceAttributes={sourceAttributes}
        replacementAttributes={replacementAttributes}
        rows={rows}
      />
    </Box>
  );
}
