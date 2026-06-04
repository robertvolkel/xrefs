'use client';

import { useMemo, useState } from 'react';
import { Box, Stack, Typography, TextField, Button, Avatar } from '@mui/material';
import { AppFeedbackComment, AppFeedbackCommentAuthorRole } from '@/lib/types';
import { postAppFeedbackComment } from '@/lib/api';
import { formatAbsolute, formatRelative } from '@/lib/feedbackChrome';

interface Props {
  feedbackId: string;
  /** Which side is "me" — drives avatar label "You" vs the other party. */
  viewerRole: AppFeedbackCommentAuthorRole;
  comments: AppFeedbackComment[];
  onCommentAdded: (c: AppFeedbackComment) => void;
  /** Label for the other party (defaults: "XQ Admin" when viewer=user, "User" when viewer=admin). */
  otherPartyLabel?: string;
  /** Disable composer (e.g. while parent is reloading). */
  disabled?: boolean;
}

const MAX_BODY_CHARS = 4000;

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function FeedbackThread({
  feedbackId,
  viewerRole,
  comments,
  onCommentAdded,
  otherPartyLabel,
  disabled,
}: Props) {
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaultOtherLabel = viewerRole === 'user' ? 'XQ Admin' : 'User';
  const otherLabel = otherPartyLabel ?? defaultOtherLabel;

  // Newest first.
  const ordered = useMemo(
    () => [...comments].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [comments],
  );

  const handlePost = async () => {
    const text = body.trim();
    if (!text) return;
    setPosting(true);
    setError(null);
    try {
      const comment = await postAppFeedbackComment(feedbackId, text);
      onCommentAdded(comment);
      setBody('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to post comment');
    } finally {
      setPosting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!posting && body.trim()) handlePost();
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1, width: '100%' }}>
      {/* Composer at top */}
      <Box sx={{ pb: 1.5 }}>
        <TextField
          multiline
          minRows={2}
          maxRows={6}
          placeholder="Write a comment…"
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY_CHARS))}
          onKeyDown={handleKeyDown}
          disabled={disabled || posting}
          fullWidth
          size="small"
          sx={{ '& .MuiInputBase-input': { fontSize: '0.85rem' } }}
        />
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1 }}>
          <Button
            variant="contained"
            size="small"
            disabled={!body.trim() || posting || disabled}
            onClick={handlePost}
          >
            {posting ? 'Sending…' : 'Send'}
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
            ⌘/Ctrl + Enter
          </Typography>
          {error && (
            <Typography variant="caption" color="error" sx={{ fontSize: '0.7rem' }}>
              {error}
            </Typography>
          )}
        </Stack>
      </Box>

      {/* Feed — newest first */}
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {ordered.length === 0 ? (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.78rem' }}>
              No messages yet — start the conversation above.
            </Typography>
          </Box>
        ) : (
          <Stack spacing={2} sx={{ py: 0.5 }}>
            {ordered.map((c) => {
              const mine = c.authorRole === viewerRole;
              const displayName = mine ? 'You' : (c.authorName || otherLabel);
              return (
                <Stack key={c.id} direction="row" spacing={1.25} alignItems="flex-start">
                  <Avatar
                    sx={{
                      width: 28,
                      height: 28,
                      fontSize: '0.7rem',
                      bgcolor: mine ? 'primary.main' : 'action.selected',
                      color: mine ? 'primary.contrastText' : 'text.primary',
                    }}
                  >
                    {initialsOf(displayName)}
                  </Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" spacing={1} alignItems="baseline" sx={{ mb: 0.25 }}>
                      <Typography
                        variant="body2"
                        sx={{ fontSize: '0.8rem', fontWeight: 600 }}
                      >
                        {displayName}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ fontSize: '0.7rem' }}
                        title={formatAbsolute(c.createdAt)}
                      >
                        {formatRelative(c.createdAt)}
                      </Typography>
                    </Stack>
                    <Box
                      sx={{
                        bgcolor: 'background.default',
                        border: 1,
                        borderColor: 'divider',
                        borderRadius: 1,
                        px: 1.25,
                        py: 0.75,
                      }}
                    >
                      <Typography
                        variant="body2"
                        sx={{ fontSize: '0.85rem', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}
                      >
                        {c.body}
                      </Typography>
                    </Box>
                  </Box>
                </Stack>
              );
            })}
          </Stack>
        )}
      </Box>
    </Box>
  );
}
