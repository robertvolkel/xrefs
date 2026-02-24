'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Stack,
  Chip,
  TextField,
  Button,
  Card,
  CardContent,
  Divider,
  Tooltip,
} from '@mui/material';
import { QcFeedbackRecord, FeedbackStatus } from '@/lib/types';
import { resultDotColor, statusColor } from './qcConstants';

interface QcFeedbackCardProps {
  feedback: QcFeedbackRecord;
  onAction: (id: string, status: FeedbackStatus, notes?: string) => Promise<void>;
  t: (key: string) => string;
}

export default function QcFeedbackCard({ feedback: fb, onAction, t }: QcFeedbackCardProps) {
  const [notes, setNotes] = useState(fb.adminNotes ?? '');
  const [saving, setSaving] = useState(false);

  const handleAction = async (status: FeedbackStatus) => {
    setSaving(true);
    await onAction(fb.id, status, notes.trim() || undefined);
    setSaving(false);
  };

  return (
    <Card variant="outlined" sx={{ bgcolor: 'background.default', borderLeftWidth: 3, borderLeftColor: resultDotColor(fb.ruleResult) }}>
      <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Chip
              label={fb.feedbackStage === 'rule_logic' ? 'Rule' : 'Question'}
              size="small"
              variant="outlined"
              sx={{ height: 20, fontSize: '0.65rem' }}
            />
            <Chip
              label={t(`adminQc.status${fb.status.charAt(0).toUpperCase() + fb.status.slice(1)}`)}
              size="small"
              color={statusColor(fb.status)}
              sx={{ height: 20, fontSize: '0.65rem' }}
            />
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
            {fb.userName || fb.userEmail} — {new Date(fb.createdAt).toLocaleDateString()}
          </Typography>
        </Stack>

        {/* Context — only show if per-attribute feedback (has ruleAttributeName) */}
        {fb.feedbackStage === 'rule_logic' && fb.ruleAttributeName && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.78rem' }}>
              {fb.ruleAttributeName}:
            </Typography>
            <Typography variant="body2" sx={{ fontSize: '0.78rem', fontFamily: 'monospace' }}>
              {fb.sourceValue} → {fb.replacementValue}
            </Typography>
            {fb.ruleResult && (
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: resultDotColor(fb.ruleResult), flexShrink: 0 }} />
            )}
          </Stack>
        )}
        {/* Show replacement MPN for comparison-level feedback */}
        {fb.feedbackStage === 'rule_logic' && !fb.ruleAttributeName && fb.replacementMpn && (
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.78rem', fontFamily: 'monospace', mb: 0.75 }}>
            vs {fb.replacementMpn}
          </Typography>
        )}
        {fb.feedbackStage === 'qualifying_questions' && fb.questionText && (
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.78rem', mb: 0.75 }}>
            {fb.questionText}
          </Typography>
        )}

        {/* User comment */}
        <Box sx={{ bgcolor: 'action.hover', borderRadius: 1, p: 1, mb: 1 }}>
          <Typography variant="body2" sx={{ fontSize: '0.82rem', whiteSpace: 'pre-wrap' }}>
            {fb.userComment}
          </Typography>
        </Box>

        {/* Admin notes */}
        <TextField
          size="small"
          fullWidth
          multiline
          minRows={1}
          maxRows={4}
          placeholder={t('adminQc.adminNotesPlaceholder')}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          sx={{ mb: 1, '& .MuiInputBase-input': { fontSize: '0.78rem' } }}
        />

        {/* Actions */}
        <Divider sx={{ mb: 1 }} />
        <Stack direction="row" spacing={1}>
          {fb.status === 'open' && (
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
          {fb.status === 'reviewed' && (
            <>
              <Button size="small" variant="contained" onClick={() => handleAction('resolved')} disabled={saving}>
                {t('adminQc.markResolved')}
              </Button>
              <Button size="small" color="inherit" onClick={() => handleAction('dismissed')} disabled={saving}>
                {t('adminQc.dismiss')}
              </Button>
            </>
          )}
          {(fb.status === 'resolved' || fb.status === 'dismissed') && (
            <Button size="small" variant="outlined" onClick={() => handleAction('open')} disabled={saving}>
              {t('adminQc.reopen')}
            </Button>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
