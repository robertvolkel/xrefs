'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Stack,
  Box,
  Alert,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { PartAttributes, MatchStatus, RuleResult } from '@/lib/types';
import { submitFeedback } from '@/lib/api';

const DOT_GREEN = '#69F0AE';
const DOT_YELLOW = '#FFD54F';
const DOT_RED = '#FF5252';
const DOT_GREY = '#90A4AE';

function resultDotColor(result?: RuleResult): string {
  switch (result) {
    case 'pass': case 'upgrade': return DOT_GREEN;
    case 'review': return DOT_YELLOW;
    case 'fail': return DOT_RED;
    default: return DOT_GREY;
  }
}

export interface ComparisonRow {
  parameterId: string;
  parameterName: string;
  sourceValue: string;
  replacementValue: string;
  matchStatus: MatchStatus;
  ruleResult?: RuleResult;
  note?: string;
}

interface ComparisonFeedbackDialogProps {
  open: boolean;
  onClose: () => void;
  sourceAttributes: PartAttributes;
  replacementAttributes: PartAttributes;
  rows: ComparisonRow[];
}

export default function ComparisonFeedbackDialog({
  open,
  onClose,
  sourceAttributes,
  replacementAttributes,
  rows,
}: ComparisonFeedbackDialogProps) {
  const { t } = useTranslation();
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!comment.trim()) return;
    setSubmitting(true);
    setError(null);

    try {
      await submitFeedback({
        feedbackStage: 'rule_logic',
        sourceMpn: sourceAttributes.part.mpn,
        sourceManufacturer: sourceAttributes.part.manufacturer,
        replacementMpn: replacementAttributes.part.mpn,
        userComment: comment.trim(),
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('feedback.submitError'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    onClose();
  };

  const handleExited = () => {
    setComment('');
    setSubmitted(false);
    setError(null);
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth TransitionProps={{ onExited: handleExited }}>
      <DialogTitle sx={{ pb: 0.5 }}>
        {t('feedback.title')}
      </DialogTitle>
      <DialogContent>
        {submitted ? (
          <Alert severity="success" sx={{ mt: 1 }}>
            {t('feedback.submitSuccess')}
          </Alert>
        ) : (
          <Stack spacing={2} sx={{ mt: 1 }}>
            {/* Context: source vs replacement */}
            <Box sx={{ bgcolor: 'background.default', borderRadius: 1, p: 1.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {t('feedback.regarding')}
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                  {sourceAttributes.part.mpn}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                  vs
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                  {replacementAttributes.part.mpn}
                </Typography>
              </Stack>
            </Box>

            {/* Side-by-side comparison table */}
            <TableContainer sx={{ maxHeight: 400, border: 1, borderColor: 'divider', borderRadius: 1 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ bgcolor: 'background.paper', fontSize: '0.7rem', fontWeight: 600, color: 'text.secondary', width: '25%' }}>
                      {t('comparison.parameterHeader')}
                    </TableCell>
                    <TableCell sx={{ bgcolor: 'background.paper', fontSize: '0.7rem', fontWeight: 600, color: 'text.secondary', width: '30%', borderRight: 1, borderColor: 'divider' }}>
                      {sourceAttributes.part.mpn}
                    </TableCell>
                    <TableCell sx={{ bgcolor: 'background.paper', fontSize: '0.7rem', fontWeight: 600, color: 'text.secondary', width: '30%' }}>
                      {replacementAttributes.part.mpn}
                    </TableCell>
                    <TableCell sx={{ bgcolor: 'background.paper', fontSize: '0.7rem', fontWeight: 600, color: 'text.secondary', width: '15%' }}>
                      {t('comparison.resultHeader')}
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.parameterId}>
                      <TableCell sx={{ color: 'text.secondary', fontSize: '0.75rem', borderColor: 'divider' }}>
                        {row.parameterName}
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', borderColor: 'divider', borderRight: 1, borderRightColor: 'divider' }}>
                        {row.sourceValue}
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', borderColor: 'divider' }}>
                        {row.replacementValue}
                      </TableCell>
                      <TableCell sx={{ borderColor: 'divider' }}>
                        {row.ruleResult && (
                          <Stack direction="row" alignItems="center" spacing={0.5}>
                            <Box
                              sx={{
                                width: 10,
                                height: 10,
                                borderRadius: '50%',
                                bgcolor: resultDotColor(row.ruleResult),
                                flexShrink: 0,
                              }}
                            />
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                              {row.ruleResult}
                            </Typography>
                          </Stack>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Comment input */}
            <TextField
              label={t('feedback.commentLabel')}
              placeholder={t('feedback.commentPlaceholder')}
              multiline
              minRows={3}
              maxRows={6}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              fullWidth
              autoFocus
            />

            {error && (
              <Alert severity="error">{error}</Alert>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        {submitted ? (
          <Button onClick={handleClose} color="inherit">
            {t('feedback.close')}
          </Button>
        ) : (
          <>
            <Button onClick={handleClose} color="inherit" disabled={submitting}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleSubmit}
              variant="contained"
              disabled={submitting || !comment.trim()}
            >
              {submitting ? '...' : t('feedback.submit')}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
