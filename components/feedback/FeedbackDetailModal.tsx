'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  Box,
  Stack,
  Typography,
  Chip,
  IconButton,
  Collapse,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  Divider,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import {
  AppFeedbackComment,
  AppFeedbackListItem,
  AppFeedbackStatus,
  AppFeedbackThread,
} from '@/lib/types';
import {
  getAdminAppFeedbackThread,
  getOwnAppFeedbackThread,
  updateAppFeedback,
} from '@/lib/api';
import {
  categoryIcon,
  categoryLabel,
  formatAbsolute,
  formatRelative,
  statusChipColor,
  statusLabel,
} from '@/lib/feedbackChrome';
import FeedbackThread from './FeedbackThread';

export interface FeedbackDetailModalUpdate {
  commentCountDelta?: number;
  status?: AppFeedbackStatus;
}

interface Props {
  open: boolean;
  onClose: () => void;
  viewerRole: 'user' | 'admin';
  /** List-row snapshot. Used immediately for header chrome while the thread loads. */
  feedback: AppFeedbackListItem;
  /** Called when the modal mutates row state — list parent can mutate in place. */
  onUpdated?: (update: FeedbackDetailModalUpdate) => void;
}

export default function FeedbackDetailModal({
  open,
  onClose,
  viewerRole,
  feedback,
  onUpdated,
}: Props) {
  const isAdmin = viewerRole === 'admin';

  // Server thread.
  const [thread, setThread] = useState<AppFeedbackThread | null>(null);
  const [loadingThread, setLoadingThread] = useState(true);

  // Admin status editor (only used when isAdmin).
  const [status, setStatus] = useState<AppFeedbackStatus>(feedback.status);
  const [savingStatus, setSavingStatus] = useState(false);
  const [techOpen, setTechOpen] = useState(false);

  // Fetch thread on open / when the feedback id changes.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingThread(true);
    setThread(null);
    setStatus(feedback.status);

    const fetcher = isAdmin
      ? getAdminAppFeedbackThread(feedback.id)
      : getOwnAppFeedbackThread(feedback.id);

    fetcher
      .then((t) => {
        if (cancelled) return;
        setThread(t);
        // The server stamped the read timestamp on this GET. Tell the parent
        // list to flip hasUnread locally so the blue "new activity" outline
        // clears immediately — don't wait for the next 30s poll.
        onUpdated?.({});
        window.dispatchEvent(new Event('feedback-unread-changed'));
      })
      .catch(() => {
        if (!cancelled) setThread(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingThread(false);
      });
    return () => { cancelled = true; };
    // onUpdated intentionally omitted — we only want this effect to re-run
    // when the open feedback changes, not on every parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, feedback.id, feedback.status, isAdmin]);

  const handleCommentAdded = useCallback((c: AppFeedbackComment) => {
    setThread((prev) => prev ? { ...prev, comments: [...prev.comments, c] } : prev);
    onUpdated?.({ commentCountDelta: 1 });
    window.dispatchEvent(new Event('feedback-unread-changed'));
  }, [onUpdated]);

  const handleSaveStatus = async () => {
    setSavingStatus(true);
    try {
      await updateAppFeedback(feedback.id, { status });
      onUpdated?.({ status });
    } catch {
      // silent — error UX deferred
    } finally {
      setSavingStatus(false);
    }
  };

  const statusDirty = status !== feedback.status;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            height: '90vh',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
          },
        },
      }}
    >
      {/* Modal header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: 2,
          py: 1.25,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Chip
          icon={categoryIcon(feedback.category, '1rem')}
          label={categoryLabel(feedback.category)}
          size="small"
          variant="outlined"
          sx={{ height: 24, fontSize: '0.75rem', mr: 1 }}
        />
        <Chip
          label={statusLabel(feedback.status)}
          size="small"
          color={statusChipColor(feedback.status)}
          variant="outlined"
          sx={{ height: 24, fontSize: '0.75rem', mr: 1 }}
        />
        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.78rem', ml: 0.5 }}>
          {isAdmin ? (feedback.userName || feedback.userEmail || 'User') : 'Your feedback'}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <IconButton size="small" onClick={onClose} aria-label="Close">
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Body — 60/40 split */}
      <DialogContent sx={{ p: 0, flex: 1, minHeight: 0, display: 'flex' }}>
        {/* Left — 60%, scrollable */}
        <Box
          sx={{
            width: '60%',
            minWidth: 0,
            overflowY: 'auto',
            px: 3,
            py: 2.5,
            borderRight: 1,
            borderColor: 'divider',
          }}
        >
          <Stack spacing={2.5}>
            {/* Summary chips */}
            <Stack direction="row" spacing={3} alignItems="flex-start" flexWrap="wrap" rowGap={2}>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Submitted
                </Typography>
                <Typography variant="body2" sx={{ fontSize: '0.85rem', fontWeight: 500, mt: 0.25 }}>
                  {formatAbsolute(feedback.createdAt)}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem', display: 'block' }}>
                  {formatRelative(feedback.createdAt)}
                </Typography>
              </Box>
              {isAdmin && feedback.userEmail && (
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Contact
                  </Typography>
                  <Typography variant="body2" sx={{ fontSize: '0.85rem', fontWeight: 500, mt: 0.25 }}>
                    {feedback.userEmail}
                  </Typography>
                </Box>
              )}
            </Stack>

            {/* Original submission */}
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {isAdmin ? 'Original submission' : 'Your original submission'}
              </Typography>
              <Box sx={{ mt: 0.5, p: 2, bgcolor: 'background.default', borderRadius: 1, border: 1, borderColor: 'divider' }}>
                <Typography variant="body2" sx={{ fontSize: '0.86rem', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                  {feedback.userComment}
                </Typography>
              </Box>
            </Box>

            {/* Attachments */}
            {feedback.attachments && feedback.attachments.length > 0 && (
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Attachments ({feedback.attachments.length})
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" rowGap={1} sx={{ mt: 0.75 }}>
                  {feedback.attachments.map((att) => (
                    <a
                      key={att.path}
                      href={att.signedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: 'inline-block', lineHeight: 0 }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={att.signedUrl}
                        alt="feedback attachment"
                        style={{
                          maxHeight: 160,
                          maxWidth: 240,
                          borderRadius: 4,
                          border: '1px solid rgba(255,255,255,0.12)',
                          objectFit: 'cover',
                          cursor: 'zoom-in',
                        }}
                      />
                    </a>
                  ))}
                </Stack>
              </Box>
            )}

            {/* Admin-only: technical info collapse */}
            {isAdmin && (feedback.userAgent || feedback.viewport) && (
              <Box>
                <Stack
                  direction="row"
                  alignItems="center"
                  onClick={() => setTechOpen((v) => !v)}
                  sx={{ cursor: 'pointer', userSelect: 'none' }}
                >
                  {techOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                    Technical info
                  </Typography>
                </Stack>
                <Collapse in={techOpen}>
                  <Stack spacing={0.5} sx={{ mt: 1, pl: 3 }}>
                    {feedback.viewport && (
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem', fontFamily: 'monospace' }}>
                        viewport: {feedback.viewport}
                      </Typography>
                    )}
                    {feedback.userAgent && (
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                        user-agent: {feedback.userAgent}
                      </Typography>
                    )}
                  </Stack>
                </Collapse>
              </Box>
            )}

            {/* Admin-only: resolved metadata */}
            {isAdmin && feedback.resolvedAt && (
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                {feedback.status === 'resolved' ? 'Resolved' : 'Dismissed'} by {feedback.resolvedByName || 'admin'} on {formatAbsolute(feedback.resolvedAt)}
              </Typography>
            )}

            {/* Admin-only: status editor */}
            {isAdmin && (
              <>
                <Divider />
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Update
                  </Typography>
                  <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 1 }}>
                    <FormControl size="small" sx={{ minWidth: 200 }}>
                      <InputLabel id="app-feedback-modal-status">Status</InputLabel>
                      <Select
                        labelId="app-feedback-modal-status"
                        label="Status"
                        value={status}
                        onChange={(e) => setStatus(e.target.value as AppFeedbackStatus)}
                      >
                        <MenuItem value="open">Open</MenuItem>
                        <MenuItem value="reviewed">Reviewed</MenuItem>
                        <MenuItem value="resolved">Resolved</MenuItem>
                        <MenuItem value="dismissed">Dismissed</MenuItem>
                      </Select>
                    </FormControl>
                    <Button
                      variant="contained"
                      size="small"
                      disabled={!statusDirty || savingStatus}
                      onClick={handleSaveStatus}
                    >
                      {savingStatus ? 'Saving…' : 'Save'}
                    </Button>
                  </Stack>
                </Box>
              </>
            )}
          </Stack>
        </Box>

        {/* Right — 40%, conversation */}
        <Box
          sx={{
            width: '40%',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            px: 2.5,
            py: 2.5,
            bgcolor: 'background.paper',
          }}
        >
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              fontSize: '0.68rem',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              mb: 1,
            }}
          >
            Comments and activity
          </Typography>

          {loadingThread ? (
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.78rem' }}>
              Loading thread…
            </Typography>
          ) : !thread ? (
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.78rem' }}>
              Could not load thread.
            </Typography>
          ) : (
            <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
              <FeedbackThread
                feedbackId={feedback.id}
                viewerRole={viewerRole}
                comments={thread.comments}
                onCommentAdded={handleCommentAdded}
                otherPartyLabel={isAdmin ? (feedback.userName || 'User') : 'XQ Admin'}
              />
            </Box>
          )}
        </Box>
      </DialogContent>
    </Dialog>
  );
}
