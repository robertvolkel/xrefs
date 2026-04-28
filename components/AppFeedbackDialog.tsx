'use client';

import { useEffect, useRef, useState, ClipboardEvent } from 'react';
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
  Box,
  IconButton,
} from '@mui/material';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import CloseIcon from '@mui/icons-material/Close';
import { AppFeedbackCategory, AppFeedbackSubmission } from '@/lib/types';
import { submitAppFeedback } from '@/lib/api';

export interface AppFeedbackDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmitted?: () => void;
}

const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

interface PendingFile {
  file: File;
  url: string;
}

export default function AppFeedbackDialog({ open, onClose, onSubmitted }: AppFeedbackDialogProps) {
  const [category, setCategory] = useState<AppFeedbackCategory>('idea');
  const [comment, setComment] = useState('');
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Revoke object URLs on cleanup so we don't leak.
  useEffect(() => {
    return () => {
      for (const f of files) URL.revokeObjectURL(f.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reset = () => {
    for (const f of files) URL.revokeObjectURL(f.url);
    setFiles([]);
    setComment('');
    setCategory('idea');
    setError(null);
  };

  const addFiles = (incoming: File[]) => {
    if (incoming.length === 0) return;
    setError(null);
    setFiles((prev) => {
      const next = [...prev];
      for (const file of incoming) {
        if (next.length >= MAX_FILES) {
          setError(`Maximum ${MAX_FILES} attachments`);
          break;
        }
        if (!ALLOWED_MIME.has(file.type)) {
          setError(`Unsupported file type: ${file.type || 'unknown'}. Use PNG, JPEG, WebP, or GIF.`);
          continue;
        }
        if (file.size > MAX_BYTES) {
          setError(`${file.name} exceeds 10 MB`);
          continue;
        }
        next.push({ file, url: URL.createObjectURL(file) });
      }
      return next;
    });
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => {
      const target = prev[idx];
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const handlePaste = (e: ClipboardEvent<HTMLDivElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const pasted: File[] = [];
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) pasted.push(f);
      }
    }
    if (pasted.length > 0) {
      e.preventDefault();
      addFiles(pasted);
    }
  };

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
      attachments: files.map((f) => f.file),
    };

    try {
      await submitAppFeedback(payload);
      reset();
      onSubmitted?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 0.5 }}>Send Feedback</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }} onPaste={handlePaste}>
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

          <Stack direction="row" spacing={1} alignItems="center">
            <Button
              size="small"
              variant="outlined"
              startIcon={<AttachFileIcon />}
              onClick={() => fileInputRef.current?.click()}
              disabled={files.length >= MAX_FILES}
              sx={{ textTransform: 'none' }}
            >
              Attach screenshot
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem' }}>
              Or paste from clipboard. Up to {MAX_FILES} images, 10 MB each.
            </Typography>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              hidden
              onChange={(e) => {
                const list = Array.from(e.target.files ?? []);
                addFiles(list);
                if (e.target) e.target.value = '';
              }}
            />
          </Stack>

          {files.length > 0 && (
            <Stack direction="row" spacing={1} flexWrap="wrap" rowGap={1}>
              {files.map((f, idx) => (
                <Box
                  key={f.url}
                  sx={{
                    position: 'relative',
                    width: 96,
                    height: 96,
                    borderRadius: 1,
                    overflow: 'hidden',
                    border: 1,
                    borderColor: 'divider',
                    bgcolor: 'background.default',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={f.url}
                    alt={f.file.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <IconButton
                    size="small"
                    onClick={() => removeFile(idx)}
                    sx={{
                      position: 'absolute',
                      top: 2,
                      right: 2,
                      bgcolor: 'rgba(0,0,0,0.6)',
                      color: '#fff',
                      width: 22,
                      height: 22,
                      '&:hover': { bgcolor: 'rgba(0,0,0,0.8)' },
                    }}
                  >
                    <CloseIcon sx={{ fontSize: '0.85rem' }} />
                  </IconButton>
                </Box>
              ))}
            </Stack>
          )}

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
