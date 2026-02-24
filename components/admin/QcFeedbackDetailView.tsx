'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Stack,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  TextField,
  Button,
  Card,
  CardContent,
  Divider,
  CircularProgress,
  Tooltip,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useTranslation } from 'react-i18next';
import {
  QcFeedbackListItem,
  FeedbackStatus,
  RecommendationLogEntry,
  XrefRecommendation,
  MatchStatus,
} from '@/lib/types';
import { getAdminQcLogDetail } from '@/lib/api';
import { DOT_GREEN, DOT_YELLOW, DOT_RED, DOT_GREY, resultDotColor, statusColor } from './qcConstants';
import QcRecommendationSummary from './QcRecommendationSummary';

interface ComparisonRow {
  parameterId: string;
  parameterName: string;
  sourceValue: string;
  replacementValue: string;
  matchStatus: MatchStatus;
  ruleResult?: string;
  note?: string;
}

interface QcFeedbackDetailViewProps {
  feedback: QcFeedbackListItem;
  onBack: () => void;
  onStatusChange: (feedbackId: string, status: FeedbackStatus, notes?: string) => Promise<void>;
}

export default function QcFeedbackDetailView({ feedback, onBack, onStatusChange }: QcFeedbackDetailViewProps) {
  const { t } = useTranslation();
  const [logDetail, setLogDetail] = useState<RecommendationLogEntry | null>(null);
  const [loading, setLoading] = useState(!!feedback.logId);
  const [notes, setNotes] = useState(feedback.adminNotes ?? '');
  const [saving, setSaving] = useState(false);
  const [comparisonRows, setComparisonRows] = useState<ComparisonRow[]>([]);
  const [recommendation, setRecommendation] = useState<XrefRecommendation | null>(null);

  // Load log detail for snapshot
  useEffect(() => {
    if (!feedback.logId) return;
    setLoading(true);
    getAdminQcLogDetail(feedback.logId)
      .then((detail) => {
        setLogDetail(detail.log);

        // Build comparison rows if this is rule_logic feedback with a replacement
        if (feedback.feedbackStage === 'rule_logic' && feedback.replacementMpn && detail.log.snapshot) {
          const rec = detail.log.snapshot.recommendations.find(
            (r: XrefRecommendation) => r.part.mpn === feedback.replacementMpn
          );
          setRecommendation(rec ?? null);

          if (rec && detail.log.snapshot.sourceAttributes) {
            const matchMap = new Map(
              rec.matchDetails.map((d) => [d.parameterId, d])
            );
            const rows = detail.log.snapshot.sourceAttributes.parameters
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((sourceParam) => {
                const matchDetail = matchMap.get(sourceParam.parameterId);
                return {
                  parameterId: sourceParam.parameterId,
                  parameterName: sourceParam.parameterName,
                  sourceValue: sourceParam.value,
                  replacementValue: matchDetail?.replacementValue ?? '—',
                  matchStatus: (matchDetail?.matchStatus ?? 'different') as MatchStatus,
                  ruleResult: matchDetail?.ruleResult,
                  note: matchDetail?.note,
                };
              })
              .filter((row) => !(row.matchStatus === 'different' && !row.ruleResult));
            setComparisonRows(rows);
          }
        }
      })
      .catch(() => {
        // Failed to load detail
      })
      .finally(() => setLoading(false));
  }, [feedback.logId, feedback.feedbackStage, feedback.replacementMpn]);

  const handleAction = async (status: FeedbackStatus) => {
    setSaving(true);
    await onStatusChange(feedback.id, status, notes.trim() || undefined);
    setSaving(false);
  };

  const getDotColor = (ruleResult?: string): string => {
    switch (ruleResult) {
      case 'pass': case 'upgrade': return DOT_GREEN;
      case 'review': return DOT_YELLOW;
      case 'fail': return DOT_RED;
      default: return DOT_GREY;
    }
  };

  const getDotLabel = (ruleResult?: string): string => {
    switch (ruleResult) {
      case 'pass': return t('comparison.pass');
      case 'upgrade': return t('comparison.pass');
      case 'review': return t('comparison.review');
      case 'fail': return t('comparison.fail');
      case 'info': return t('comparison.info');
      default: return '';
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <IconButton onClick={onBack} size="small">
            <ArrowBackIcon fontSize="small" />
          </IconButton>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {t('adminQc.feedbackDetailTitle')}
            </Typography>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography variant="h6" sx={{ fontFamily: 'monospace', fontSize: '0.95rem' }}>
                {feedback.sourceMpn}
              </Typography>
              {feedback.replacementMpn && (
                <>
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.78rem' }}>→</Typography>
                  <Typography variant="h6" sx={{ fontFamily: 'monospace', fontSize: '0.95rem' }}>
                    {feedback.replacementMpn}
                  </Typography>
                </>
              )}
              <Chip
                label={feedback.feedbackStage === 'rule_logic' ? t('adminQc.typeRule') : t('adminQc.typeQuestion')}
                size="small"
                variant="outlined"
                sx={{ height: 20, fontSize: '0.65rem' }}
              />
              <Chip
                label={t(`adminQc.status${feedback.status.charAt(0).toUpperCase() + feedback.status.slice(1)}`)}
                size="small"
                color={statusColor(feedback.status)}
                sx={{ height: 20, fontSize: '0.65rem' }}
              />
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem' }}>
              {feedback.userName || feedback.userEmail} — {new Date(feedback.createdAt).toLocaleString()}
              {feedback.familyName && ` — ${feedback.familyName}`}
            </Typography>
          </Box>
        </Stack>
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <Stack spacing={2.5}>
            {/* User comment — shown prominently first */}
            <Box>
              <Typography variant="subtitle2" sx={{ fontSize: '0.78rem', fontWeight: 600, mb: 0.5 }}>
                {t('adminQc.userComment')}
              </Typography>
              <Box sx={{ bgcolor: 'action.hover', borderRadius: 1, p: 1.5 }}>
                <Typography variant="body2" sx={{ fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>
                  {feedback.userComment}
                </Typography>
              </Box>
            </Box>

            {/* Feedback context */}
            {feedback.feedbackStage === 'rule_logic' && feedback.ruleAttributeName && (
              <Box>
                <Typography variant="subtitle2" sx={{ fontSize: '0.78rem', fontWeight: 600, mb: 0.5 }}>
                  {t('adminQc.flaggedRule')}
                </Typography>
                <Card variant="outlined" sx={{ bgcolor: 'background.default', borderLeftWidth: 3, borderLeftColor: resultDotColor(feedback.ruleResult) }}>
                  <CardContent sx={{ py: 1, px: 2, '&:last-child': { pb: 1 } }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.78rem' }}>
                        {feedback.ruleAttributeName}:
                      </Typography>
                      <Typography variant="body2" sx={{ fontSize: '0.78rem', fontFamily: 'monospace' }}>
                        {feedback.sourceValue} → {feedback.replacementValue}
                      </Typography>
                      {feedback.ruleResult && (
                        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: resultDotColor(feedback.ruleResult), flexShrink: 0 }} />
                      )}
                    </Stack>
                    {feedback.ruleNote && (
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem', mt: 0.5, display: 'block' }}>
                        {feedback.ruleNote}
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              </Box>
            )}

            {feedback.feedbackStage === 'qualifying_questions' && feedback.questionText && (
              <Box>
                <Typography variant="subtitle2" sx={{ fontSize: '0.78rem', fontWeight: 600, mb: 0.5 }}>
                  {t('adminQc.flaggedQuestion')}
                </Typography>
                <Card variant="outlined" sx={{ bgcolor: 'background.default' }}>
                  <CardContent sx={{ py: 1, px: 2, '&:last-child': { pb: 1 } }}>
                    <Typography variant="body2" sx={{ fontSize: '0.78rem' }}>
                      {feedback.questionText}
                    </Typography>
                  </CardContent>
                </Card>
              </Box>
            )}

            {/* Comparison table — reconstructed from snapshot */}
            {comparisonRows.length > 0 && (
              <Box>
                <Typography variant="subtitle2" sx={{ fontSize: '0.78rem', fontWeight: 600, mb: 0.5 }}>
                  {t('adminQc.comparisonTable')}
                </Typography>
                <TableContainer sx={{ maxHeight: 400 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ bgcolor: 'background.paper', fontSize: '0.7rem', fontWeight: 600, color: 'text.secondary' }}>
                          Parameter
                        </TableCell>
                        <TableCell sx={{ bgcolor: 'background.paper', fontSize: '0.7rem', fontWeight: 600, color: 'text.secondary' }}>
                          {t('adminQc.sourceColumn')}
                        </TableCell>
                        <TableCell sx={{ bgcolor: 'background.paper', fontSize: '0.7rem', fontWeight: 600, color: 'text.secondary' }}>
                          {t('adminQc.replacementColumn')}
                        </TableCell>
                        <TableCell sx={{ bgcolor: 'background.paper', fontSize: '0.7rem', fontWeight: 600, color: 'text.secondary', width: 80 }}>
                          Result
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {comparisonRows.map((row) => {
                        const isFlagged = row.parameterId === feedback.ruleAttributeId;
                        return (
                          <TableRow
                            key={row.parameterId}
                            sx={{
                              ...(isFlagged && {
                                bgcolor: 'action.selected',
                                borderLeft: `3px solid ${DOT_YELLOW}`,
                              }),
                              '&:last-child td': { borderBottom: 0 },
                            }}
                          >
                            <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary', fontWeight: isFlagged ? 600 : 400 }}>
                              {row.parameterName}
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>
                              {row.sourceValue}
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>
                              {row.replacementValue}
                            </TableCell>
                            <TableCell>
                              <Stack direction="row" alignItems="center" spacing={0.5}>
                                <Box
                                  sx={{
                                    width: 10,
                                    height: 10,
                                    borderRadius: '50%',
                                    bgcolor: getDotColor(row.ruleResult),
                                    flexShrink: 0,
                                  }}
                                />
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>
                                  {getDotLabel(row.ruleResult) || row.ruleResult || row.matchStatus}
                                </Typography>
                                {row.note && (
                                  <Tooltip title={row.note} placement="top" arrow>
                                    <Typography variant="caption" sx={{ fontSize: '0.65rem', opacity: 0.5, cursor: 'help' }}>
                                      ?
                                    </Typography>
                                  </Tooltip>
                                )}
                              </Stack>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}

            {/* Fallback: replacement not found in snapshot */}
            {feedback.feedbackStage === 'rule_logic' && feedback.replacementMpn && !recommendation && logDetail?.snapshot?.recommendations && (
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem', mb: 1 }}>
                  {t('adminQc.replacementNotInSnapshot')}
                </Typography>
                <Typography variant="subtitle2" sx={{ fontSize: '0.78rem', fontWeight: 600, mb: 0.5 }}>
                  {t('adminQc.recommendations')} ({logDetail.snapshot.recommendations.length})
                </Typography>
                <Stack spacing={1}>
                  {logDetail.snapshot.recommendations.map((rec: XrefRecommendation) => (
                    <QcRecommendationSummary key={rec.part.mpn} rec={rec} t={t} />
                  ))}
                </Stack>
              </Box>
            )}

            {/* No linked log */}
            {!feedback.logId && (
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem', fontStyle: 'italic' }}>
                {t('adminQc.noLinkedLog')}
              </Typography>
            )}

            {/* Context answers from snapshot */}
            {logDetail?.snapshot?.contextAnswers && Object.keys(logDetail.snapshot.contextAnswers).length > 0 && (
              <Box>
                <Typography variant="subtitle2" sx={{ fontSize: '0.78rem', fontWeight: 600, mb: 0.5 }}>
                  {t('adminQc.contextAnswers')}
                </Typography>
                <Card variant="outlined" sx={{ bgcolor: 'background.default' }}>
                  <CardContent sx={{ py: 1, px: 2, '&:last-child': { pb: 1 } }}>
                    {Object.entries(logDetail.snapshot.contextAnswers).map(([key, value]) => (
                      <Stack key={key} direction="row" justifyContent="space-between" sx={{ py: 0.5 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.78rem' }}>
                          {key}
                        </Typography>
                        <Typography variant="body2" sx={{ fontSize: '0.78rem', fontFamily: 'monospace' }}>
                          {value}
                        </Typography>
                      </Stack>
                    ))}
                  </CardContent>
                </Card>
              </Box>
            )}

            {/* Admin notes + actions */}
            <Box>
              <Divider sx={{ mb: 1.5 }} />
              <TextField
                size="small"
                fullWidth
                multiline
                minRows={2}
                maxRows={6}
                placeholder={t('adminQc.adminNotesPlaceholder')}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                sx={{ mb: 1.5, '& .MuiInputBase-input': { fontSize: '0.78rem' } }}
              />
              <Stack direction="row" spacing={1}>
                {feedback.status === 'open' && (
                  <>
                    <Button size="small" variant="outlined" onClick={() => handleAction('reviewed')} disabled={saving}>
                      {t('adminQc.markReviewed')}
                    </Button>
                    <Button size="small" variant="contained" onClick={() => handleAction('resolved')} disabled={saving}>
                      {t('adminQc.markResolved')}
                    </Button>
                    <Button size="small" color="inherit" onClick={() => handleAction('dismissed')} disabled={saving}>
                      {t('adminQc.dismiss')}
                    </Button>
                  </>
                )}
                {feedback.status === 'reviewed' && (
                  <>
                    <Button size="small" variant="contained" onClick={() => handleAction('resolved')} disabled={saving}>
                      {t('adminQc.markResolved')}
                    </Button>
                    <Button size="small" color="inherit" onClick={() => handleAction('dismissed')} disabled={saving}>
                      {t('adminQc.dismiss')}
                    </Button>
                  </>
                )}
                {(feedback.status === 'resolved' || feedback.status === 'dismissed') && (
                  <Button size="small" variant="outlined" onClick={() => handleAction('open')} disabled={saving}>
                    {t('adminQc.reopen')}
                  </Button>
                )}
              </Stack>
            </Box>
          </Stack>
        )}
      </Box>
    </Box>
  );
}
