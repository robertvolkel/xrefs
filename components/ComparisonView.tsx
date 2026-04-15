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
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import { useTranslation } from 'react-i18next';
import { PartAttributes, XrefRecommendation, MatchStatus, RuleResult, CertificationSource, deriveRecommendationCategories } from '@/lib/types';
import { ATTRIBUTES_HEADER_HEIGHT, ATTRIBUTES_HEADER_HEIGHT_MOBILE, ROW_FONT_SIZE, ROW_FONT_SIZE_MOBILE, ROW_PY, ROW_PY_MOBILE, ROW_HEIGHT, ROW_HEIGHT_MOBILE } from '@/lib/layoutConstants';
import { useScrollIndicators } from '@/hooks/useScrollIndicators';
import ComparisonFeedbackDialog from './ComparisonFeedbackDialog';
import type { AttributesTab } from './DesktopLayout';
import { pillGroupSx, OverviewContent, CommercialContent } from './AttributesTabContent';

interface ComparisonViewProps {
  sourceAttributes: PartAttributes;
  replacementAttributes: PartAttributes | null;
  recommendation: XrefRecommendation;
  onBack: () => void;
  onManufacturerClick?: (manufacturer: string) => void;
  activeTab: AttributesTab;
  onTabChange: (tab: AttributesTab) => void;
}

const DOT_GREEN = '#69F0AE';
const DOT_YELLOW = '#FFD54F';
const DOT_RED = '#FF5252';

const CERT_LABELS: Record<CertificationSource, string> = {
  partsio_fff: 'Parts.io (FFF)',
  partsio_functional: 'Parts.io (Functional)',
  mouser: 'Mouser',
  manufacturer: 'Manufacturer Certified',
};
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
  activeTab,
  onTabChange,
}: ComparisonViewProps) {
  const { t } = useTranslation();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const { ref: scrollRef, canScrollUp, canScrollDown } = useScrollIndicators<HTMLDivElement>();
  const matchMap = new Map(
    recommendation.matchDetails.map((d) => [d.parameterId, d])
  );

  const sourceParamIds = new Set(sourceAttributes.parameters.map((p) => p.parameterId));

  const rowsFromSource = sourceAttributes.parameters
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((sourceParam) => {
      const replParam = replacementAttributes?.parameters.find(
        (p) => p.parameterId === sourceParam.parameterId
      );
      const matchDetail = matchMap.get(sourceParam.parameterId);

      return {
        parameterId: sourceParam.parameterId,
        parameterName: sourceParam.parameterName,
        sourceValue: sourceParam.value,
        replacementValue: replParam?.value ?? matchDetail?.replacementValue ?? '—',
        matchStatus: matchDetail?.matchStatus ?? ('different' as MatchStatus),
        ruleResult: matchDetail?.ruleResult,
        note: matchDetail?.note,
        replSource: replParam?.source,
      };
    })
    .filter((row) => !(row.matchStatus === 'different' && !row.ruleResult));

  // Add matchDetails not already covered by source parameters (e.g. application_review
  // rules for datasheet-only specs like SOA, or threshold rules like Vbe(sat) when
  // the parametric data doesn't include them)
  const extraRows = recommendation.matchDetails
    .filter((d) => !sourceParamIds.has(d.parameterId) && d.ruleResult && d.ruleResult !== 'pass')
    .map((d) => ({
      parameterId: d.parameterId,
      parameterName: d.parameterName,
      sourceValue: d.sourceValue,
      replacementValue: d.replacementValue,
      matchStatus: d.matchStatus,
      ruleResult: d.ruleResult,
      note: d.note,
      replSource: undefined as 'digikey' | 'partsio' | 'atlas' | undefined,
    }));

  const rows = [...rowsFromSource, ...extraRows];
  const replPart = (replacementAttributes ?? recommendation).part;

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header — same height as AttributesPanel to align */}
      <Box
        sx={{
          height: { xs: ATTRIBUTES_HEADER_HEIGHT_MOBILE, md: ATTRIBUTES_HEADER_HEIGHT },
          minHeight: { xs: ATTRIBUTES_HEADER_HEIGHT_MOBILE, md: ATTRIBUTES_HEADER_HEIGHT },
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
                {replPart.mpn}
              </Typography>
              <Chip label={replPart.status} size="small" color={replPart.status === 'Active' ? 'success' : 'warning'} variant="outlined" sx={{ height: 18, fontSize: '0.6rem' }} />
              {replPart.qualifications?.map(q => (
                <Chip key={q} label={q} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.6rem', color: '#4FC3F7', borderColor: '#4FC3F7' }} />
              ))}
              {(() => {
                const cats = deriveRecommendationCategories(recommendation);
                const thirdPartySources = recommendation.certifiedBy?.filter(s => s !== 'manufacturer') || [];
                return (
                  <>
                    {cats.includes('manufacturer_certified') && (
                      <Chip label="MFR Certified" size="small" variant="outlined" sx={{ height: 18, fontSize: '0.6rem', color: '#66BB6A', borderColor: '#66BB6A' }} />
                    )}
                    {cats.includes('third_party_certified') && (
                      <Tooltip title={thirdPartySources.map(s => CERT_LABELS[s] || s).join(', ')} arrow>
                        <Chip label="Accuris Certified" size="small" variant="outlined" sx={{ height: 18, fontSize: '0.6rem', color: '#FFA726', borderColor: '#FFA726' }} />
                      </Tooltip>
                    )}
                  </>
                );
              })()}
              {replPart.datasheetUrl && (
                <Tooltip title="View datasheet" arrow>
                  <Box
                    component="span"
                    role="link"
                    onClick={() => window.open(replPart.datasheetUrl, '_blank')}
                    sx={{ cursor: 'pointer', display: 'inline-flex', '&:hover': { opacity: 0.8 } }}
                  >
                    <PictureAsPdfOutlinedIcon sx={{ fontSize: 14, color: '#E57373' }} />
                  </Box>
                </Tooltip>
              )}
            </Stack>
            <Typography
              variant="body2"
              color="text.primary"
              sx={{
                fontSize: '0.78rem',
                ...(onManufacturerClick && {
                  cursor: 'pointer',
                  '&:hover': { color: 'primary.main', textDecoration: 'underline' },
                  transition: 'color 0.15s ease',
                }),
              }}
              noWrap
              onClick={onManufacturerClick ? () => onManufacturerClick(replPart.manufacturer) : undefined}
            >
              {replPart.manufacturer}
            </Typography>
          </Box>
        </Stack>
        {/* Pill segment control */}
        <ToggleButtonGroup
          value={activeTab}
          exclusive
          onChange={(_, v) => { if (v !== null) onTabChange(v as AttributesTab); }}
          size="small"
          sx={{ ...pillGroupSx, ml: 5 }}
        >
          <ToggleButton value="overview">{t('attributes.tabOverview')}</ToggleButton>
          <ToggleButton value="specs">{t('attributes.tabSpecs')}</ToggleButton>
          <ToggleButton value="commercial">{t('attributes.tabCommercial')}</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Specs tab — comparison table + issue summary */}
      {activeTab === 'specs' && (
        <>
          <Box sx={{ flex: 1, position: 'relative', minHeight: 0 }}>
            {canScrollUp && (
              <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 24, background: 'linear-gradient(to bottom, rgba(0,0,0,0.12), transparent)', pointerEvents: 'none', zIndex: 1 }} />
            )}
            {canScrollDown && (
              <Box sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 24, background: 'linear-gradient(to top, rgba(0,0,0,0.12), transparent)', pointerEvents: 'none', zIndex: 1 }} />
            )}
          <Box ref={scrollRef} sx={{ height: '100%', overflowY: 'auto', overflowX: 'auto' }}>
            <TableContainer>
              <Table size="small" stickyHeader sx={{ minWidth: { xs: 420, md: 'auto' }, tableLayout: 'fixed' }}>
                <TableHead>
                  <TableRow sx={{ height: { xs: ROW_HEIGHT_MOBILE, md: ROW_HEIGHT } }}>
                    <TableCell sx={{ bgcolor: 'background.paper', fontSize: '0.7rem', fontWeight: 600, borderColor: 'divider', color: 'text.secondary', py: { xs: ROW_PY_MOBILE, md: ROW_PY } }}>
                      {t('comparison.parameterHeader')}
                    </TableCell>
                    <TableCell sx={{ bgcolor: 'background.paper', fontSize: '0.7rem', fontWeight: 600, borderColor: 'divider', color: 'text.secondary', py: { xs: ROW_PY_MOBILE, md: ROW_PY } }}>
                      {t('comparison.valueHeader')}
                    </TableCell>
                    <TableCell sx={{ bgcolor: 'background.paper', borderColor: 'divider', py: { xs: ROW_PY_MOBILE, md: ROW_PY }, px: 0.5, width: 32 }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row) => {
                    const dot = getDotInfo(row.ruleResult, row.matchStatus, t);
                    const resultContent = (
                      <Box sx={{ cursor: row.note ? 'help' : 'default', display: 'inline-flex' }}>
                        <Box
                          sx={{
                            width: 12,
                            height: 12,
                            borderRadius: '50%',
                            bgcolor: dot.color,
                            flexShrink: 0,
                          }}
                        />
                      </Box>
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
                          <Stack direction="row" alignItems="center" spacing={0.75}>
                            <Box component="span" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.replacementValue}</Box>
                            {row.replSource && (
                              <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: '50%', border: '1px solid', borderColor: 'text.disabled', fontSize: '0.5rem', color: 'text.disabled', fontWeight: 600, fontFamily: 'sans-serif', flexShrink: 0 }}>
                                {row.replSource === 'digikey' ? 'D' : row.replSource === 'partsio' ? 'P' : 'A'}
                              </Box>
                            )}
                          </Stack>
                        </TableCell>
                        <TableCell
                          sx={{ borderColor: 'divider', py: { xs: ROW_PY_MOBILE, md: ROW_PY }, px: 0.5, width: 32, lineHeight: 0 }}
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

            {/* Issue Summary */}
            {(() => {
              const failures = rows.filter((r) => r.ruleResult === 'fail');
              const reviews = rows.filter((r) => r.ruleResult === 'review');
              if (failures.length === 0 && reviews.length === 0) return null;
              return (
                <Box sx={{ px: 2, py: 1.5, mt: 0.5 }}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 1 }}>
                    {t('comparison.issueSummary', 'Issue Summary')}
                  </Typography>

                  {failures.length > 0 && (
                    <Box sx={{ mb: reviews.length > 0 ? 1.5 : 0 }}>
                      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.5 }}>
                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: DOT_RED, flexShrink: 0 }} />
                        <Typography variant="caption" sx={{ fontSize: '0.72rem', fontWeight: 600, color: DOT_RED }}>
                          {t('comparison.failuresHeading', { count: failures.length, defaultValue: `${failures.length} Failing` })}
                        </Typography>
                      </Stack>
                      {failures.map((row) => (
                        <Box key={row.parameterId} sx={{ pl: 2, mb: 0.25 }}>
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem', lineHeight: 1.5 }}>
                            <Box component="span" sx={{ fontWeight: 600, color: 'text.primary' }}>{row.parameterName}</Box>
                            {row.note ? ` — ${row.note}` : ''}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  )}

                  {reviews.length > 0 && (
                    <Box>
                      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.5 }}>
                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: DOT_YELLOW, flexShrink: 0 }} />
                        <Typography variant="caption" sx={{ fontSize: '0.72rem', fontWeight: 600, color: DOT_YELLOW }}>
                          {t('comparison.reviewsHeading', { count: reviews.length, defaultValue: `${reviews.length} Needs Review` })}
                        </Typography>
                      </Stack>
                      {reviews.map((row) => (
                        <Box key={row.parameterId} sx={{ pl: 2, mb: 0.25 }}>
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem', lineHeight: 1.5 }}>
                            <Box component="span" sx={{ fontWeight: 600, color: 'text.primary' }}>{row.parameterName}</Box>
                            {row.note ? ` — ${row.note}` : ''}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  )}
                </Box>
              );
            })()}
          </Box>
          </Box>

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
        </>
      )}

      {/* Overview tab — replacement part summary (no cross-refs on replacement side) */}
      {activeTab === 'overview' && (
        <OverviewContent part={replPart} t={t} dataSource={replacementAttributes?.dataSource as 'digikey' | 'atlas' | 'partsio' | undefined} />
      )}

      {/* Commercial tab — replacement part pricing/stock */}
      {activeTab === 'commercial' && (
        <CommercialContent part={replPart} t={t} />
      )}

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
