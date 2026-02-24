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
  Stack,
  Box,
  Chip,
  Alert,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { FeedbackStage, QcFeedbackSubmission } from '@/lib/types';
import { submitFeedback } from '@/lib/api';

// Dot colors matching ComparisonView
const DOT_GREEN = '#69F0AE';
const DOT_YELLOW = '#FFD54F';
const DOT_RED = '#FF5252';
const DOT_GREY = '#90A4AE';

function resultDotColor(result?: string): string {
  switch (result) {
    case 'pass': case 'upgrade': return DOT_GREEN;
    case 'review': return DOT_YELLOW;
    case 'fail': return DOT_RED;
    default: return DOT_GREY;
  }
}

export interface FeedbackDialogProps {
  open: boolean;
  onClose: () => void;
  feedbackStage: FeedbackStage;
  sourceMpn: string;
  sourceManufacturer?: string;
  // rule_logic fields
  replacementMpn?: string;
  ruleAttributeId?: string;
  ruleAttributeName?: string;
  ruleResult?: string;
  sourceValue?: string;
  replacementValue?: string;
  ruleNote?: string;
  // qualifying_questions fields
  questionId?: string;
  questionText?: string;
}

export default function FeedbackDialog({
  open,
  onClose,
  feedbackStage,
  sourceMpn,
  sourceManufacturer,
  replacementMpn,
  ruleAttributeId,
  ruleAttributeName,
  ruleResult,
  sourceValue,
  replacementValue,
  ruleNote,
  questionId,
  questionText,
}: FeedbackDialogProps) {
  const { t } = useTranslation();
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!comment.trim()) return;
    setSubmitting(true);
    setError(null);

    const payload: QcFeedbackSubmission = {
      feedbackStage,
      sourceMpn,
      sourceManufacturer,
      replacementMpn,
      ruleAttributeId,
      ruleAttributeName,
      ruleResult,
      sourceValue,
      replacementValue,
      ruleNote,
      questionId,
      questionText,
      userComment: comment.trim(),
    };

    try {
      await submitFeedback(payload);
      setSubmitted(true);
    } catch {
      setError(t('feedback.submitError'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setComment('');
    setSubmitted(false);
    setError(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
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
            {/* Context summary */}
            <Box sx={{ bgcolor: 'background.default', borderRadius: 1, p: 1.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {t('feedback.regarding')}
              </Typography>

              {feedbackStage === 'rule_logic' && (
                <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {sourceMpn}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                      vs
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {replacementMpn}
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.78rem' }}>
                      {ruleAttributeName}
                    </Typography>
                    {ruleResult && (
                      <Chip
                        size="small"
                        label={ruleResult}
                        sx={{
                          height: 18,
                          fontSize: '0.65rem',
                          bgcolor: resultDotColor(ruleResult) + '22',
                          color: resultDotColor(ruleResult),
                          border: `1px solid ${resultDotColor(ruleResult)}44`,
                        }}
                      />
                    )}
                  </Stack>
                  {(sourceValue || replacementValue) && (
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem' }}>
                      {sourceValue} → {replacementValue}
                    </Typography>
                  )}
                  {ruleNote && (
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', fontStyle: 'italic' }}>
                      {ruleNote}
                    </Typography>
                  )}
                </Stack>
              )}

              {feedbackStage === 'qualifying_questions' && (
                <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    {sourceMpn}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.78rem' }}>
                    {questionText}
                  </Typography>
                </Stack>
              )}
            </Box>

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
