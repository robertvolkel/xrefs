'use client';

import { useMemo } from 'react';
import { Box, Stack, Typography, Chip, Skeleton, Paper } from '@mui/material';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import { AppFeedbackListItem } from '@/lib/types';
import {
  categoryIcon,
  categoryLabel,
  statusChipColor,
  statusLabel,
  formatRelative,
} from '@/lib/feedbackChrome';
import FeedbackRowMenu from './FeedbackRowMenu';

interface Props {
  items: AppFeedbackListItem[];
  selectedId: string | null;
  onSelect: (item: AppFeedbackListItem) => void;
  onDeleted: (feedbackId: string) => void;
  loading: boolean;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n).trimEnd() + '…';
}

export default function FeedbackList({ items, selectedId, onSelect, onDeleted, loading }: Props) {
  // Sort: unread (new admin replies) first, then newest first within each group.
  const ordered = useMemo(() => {
    return [...items].sort((a, b) => {
      if (a.hasUnread !== b.hasUnread) return a.hasUnread ? -1 : 1;
      return a.createdAt < b.createdAt ? 1 : -1;
    });
  }, [items]);

  if (loading) {
    return (
      <Box sx={{ px: 3, pt: 3, pb: 2 }}>
        <Stack spacing={1.5}>
          {[0, 1, 2].map((i) => (
            <Paper key={i} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Skeleton variant="text" width="40%" sx={{ fontSize: '0.7rem' }} />
              <Skeleton variant="text" width="90%" sx={{ fontSize: '1rem', mt: 0.5 }} />
              <Skeleton variant="text" width="30%" sx={{ fontSize: '0.7rem' }} />
            </Paper>
          ))}
        </Stack>
      </Box>
    );
  }

  if (items.length === 0) {
    return (
      <Box sx={{ p: 6, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.9rem' }}>
          You haven&rsquo;t submitted any feedback yet.
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.78rem', display: 'block', mt: 0.75 }}>
          Use the &ldquo;+ New Feedback&rdquo; button above to start.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ px: 3, pt: 3, pb: 2 }}>
      <Stack spacing={1.25}>
        {ordered.map((item) => {
          const selected = item.id === selectedId;
          return (
            <Paper
              key={item.id}
              variant="outlined"
              role="button"
              tabIndex={0}
              onClick={() => onSelect(item)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(item);
                }
              }}
              sx={{
                px: 2.25,
                py: 1.75,
                borderRadius: 2,
                cursor: 'pointer',
                borderColor: item.hasUnread ? 'primary.main' : 'divider',
                borderWidth: item.hasUnread ? 1.5 : 1,
                bgcolor: selected ? 'action.selected' : 'background.paper',
                transition: 'background-color 120ms, border-color 120ms',
                '&:hover': { bgcolor: 'action.hover' },
                '&:focus-visible': {
                  outline: 2,
                  outlineColor: 'primary.main',
                  outlineOffset: 2,
                },
              }}
            >
                {/* Top row: category + status + unread dot + kebab */}
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <Chip
                    icon={categoryIcon(item.category, '0.85rem')}
                    label={categoryLabel(item.category)}
                    size="small"
                    variant="outlined"
                    sx={{ height: 22, fontSize: '0.7rem', '& .MuiChip-icon': { ml: 0.5 } }}
                  />
                  <Chip
                    label={statusLabel(item.status)}
                    size="small"
                    color={statusChipColor(item.status)}
                    variant="outlined"
                    sx={{ height: 22, fontSize: '0.7rem' }}
                  />
                  {item.hasUnread && (
                    <Stack direction="row" alignItems="center" spacing={0.5}>
                      <Box
                        title="New reply from admin"
                        sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'error.main' }}
                      />
                      <Typography
                        variant="caption"
                        color="error"
                        sx={{ fontSize: '0.66rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}
                      >
                        New reply
                      </Typography>
                    </Stack>
                  )}
                  <Box sx={{ flex: 1 }} />
                  <Box onClick={(e) => e.stopPropagation()}>
                    <FeedbackRowMenu
                      feedback={item}
                      viewerRole="user"
                      onDeleted={onDeleted}
                    />
                  </Box>
                </Stack>

                {/* Comment preview */}
                <Typography
                  variant="body2"
                  sx={{
                    fontSize: '0.92rem',
                    fontWeight: item.hasUnread ? 600 : 500,
                    lineHeight: 1.4,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    color: 'text.primary',
                  }}
                >
                  {truncate(item.userComment, 240)}
                </Typography>

                {/* Footer meta */}
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 1 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem' }}>
                    {formatRelative(item.createdAt)}
                  </Typography>
                  {item.commentCount > 0 && (
                    <Stack direction="row" spacing={0.4} alignItems="center" sx={{ color: 'text.secondary' }}>
                      <ChatBubbleOutlineIcon sx={{ fontSize: '0.82rem' }} />
                      <Typography variant="caption" sx={{ fontSize: '0.72rem' }}>
                        {item.commentCount} {item.commentCount === 1 ? 'comment' : 'comments'}
                      </Typography>
                    </Stack>
                  )}
                </Stack>
            </Paper>
          );
        })}
      </Stack>
    </Box>
  );
}
