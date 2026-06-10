'use client';

import { Box, Typography, CircularProgress } from '@mui/material';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import NotificationsNoneOutlinedIcon from '@mui/icons-material/NotificationsNoneOutlined';
import { Notification, NotificationType } from '@/lib/types';
import { formatRelativeTime } from '@/lib/utils/dateFormatting';

const TYPE_ICON: Record<NotificationType, React.ElementType> = {
  feedback_reply: ForumOutlinedIcon,
  feedback_new: ForumOutlinedIcon,
  release_note: CampaignOutlinedIcon,
  bom_report: DescriptionOutlinedIcon,
  system: NotificationsNoneOutlinedIcon,
};

interface NotificationsListProps {
  items: Notification[];
  loading?: boolean;
  /** Called when a row is clicked — caller marks read + navigates. */
  onItemClick: (n: Notification) => void;
  /** Empty-state copy. */
  emptyLabel?: string;
  dense?: boolean;
}

export default function NotificationsList({
  items,
  loading,
  onItemClick,
  emptyLabel = 'No notifications yet',
  dense = false,
}: NotificationsListProps) {
  if (loading && items.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size={22} />
      </Box>
    );
  }

  if (items.length === 0) {
    return (
      <Box sx={{ px: 3, py: 5, textAlign: 'center' }}>
        <NotificationsNoneOutlinedIcon sx={{ fontSize: 32, color: 'text.disabled', mb: 1 }} />
        <Typography variant="body2" color="text.secondary">{emptyLabel}</Typography>
      </Box>
    );
  }

  return (
    <Box>
      {items.map((n) => {
        const Icon = TYPE_ICON[n.type] ?? NotificationsNoneOutlinedIcon;
        const unread = !n.readAt;
        return (
          <Box
            key={n.id}
            onClick={() => onItemClick(n)}
            role="button"
            sx={{
              display: 'flex',
              gap: 1.5,
              px: 2,
              py: dense ? 1.25 : 1.75,
              cursor: 'pointer',
              borderBottom: 1,
              borderColor: 'divider',
              bgcolor: unread ? 'action.hover' : 'transparent',
              '&:hover': { bgcolor: 'action.selected' },
            }}
          >
            <Box sx={{ pt: 0.25, position: 'relative' }}>
              <Icon fontSize="small" sx={{ color: unread ? 'primary.main' : 'text.secondary' }} />
            </Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography
                variant="body2"
                noWrap
                sx={{ fontWeight: unread ? 600 : 400 }}
              >
                {n.title}
              </Typography>
              {n.body && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {n.body}
                </Typography>
              )}
              <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.25 }}>
                {formatRelativeTime(n.createdAt)}
              </Typography>
            </Box>
            {unread && (
              <Box
                sx={{
                  alignSelf: 'center',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  bgcolor: 'primary.main',
                  flexShrink: 0,
                }}
              />
            )}
          </Box>
        );
      })}
    </Box>
  );
}
