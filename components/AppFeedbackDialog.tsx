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
  Alert,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import { AppFeedbackCategory, AppFeedbackSubmission } from '@/lib/types';
import { submitAppFeedback } from '@/lib/api';

export interface AppFeedbackDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmitted?: () => void;
}

export default function AppFeedbackDialog({ open, onClose, onSubmitted }: AppFeedbackDialogProps) {
  const [category, setCategory] = useState<AppFeedbackCategory>('idea');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!comment.trim()) return;
    setSubmitting(true);
    setError(null);

    const payload: AppFeedbackSubmission = {
      category,
      userComment: comment.trim(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      viewport:
        typeof window !== 'undefined'
          ? `${window.innerWidth}x${window.innerHeight}`
          : undefined,
    };

    try {
      await submitAppFeedback(payload);
      setComment('');
      setCategory('idea');
      onSubmitted?.();
      onClose();
    } catch {
      setError('Failed to submit feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (submitting) return;
    setComment('');
    setCategory('idea');
    setError(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 0.5 }}>Send Feedback</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.82rem' }}>
            Share an idea, report an issue, or let us know what&apos;s working. This goes directly to the team.
          </Typography>

          <ToggleButtonGroup
            value={category}
            exclusive
            fullWidth
            size="small"
            onChange={(_, v: AppFeedbackCategory | null) => { if (v) setCategory(v); }}
          >
            <ToggleButton value="idea" sx={{ textTransform: 'none', gap: 0.75 }}>
              <LightbulbOutlinedIcon sx={{ fontSize: '1rem' }} />
              Idea
            </ToggleButton>
            <ToggleButton value="issue" sx={{ textTransform: 'none', gap: 0.75 }}>
              <BugReportOutlinedIcon sx={{ fontSize: '1rem' }} />
              Issue
            </ToggleButton>
            <ToggleButton value="other" sx={{ textTransform: 'none', gap: 0.75 }}>
              <ChatBubbleOutlineIcon sx={{ fontSize: '1rem' }} />
              Other
            </ToggleButton>
          </ToggleButtonGroup>

          <TextField
            label="Your feedback"
            placeholder={
              category === 'idea'
                ? "What feature or change would make this more useful for you?"
                : category === 'issue'
                ? "What went wrong? What were you trying to do?"
                : "Tell us what's on your mind..."
            }
            multiline
            minRows={4}
            maxRows={10}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            fullWidth
            autoFocus
          />

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} color="inherit" disabled={submitting}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={submitting || !comment.trim()}
        >
          {submitting ? 'Sending…' : 'Send Feedback'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
