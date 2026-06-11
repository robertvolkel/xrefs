'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Popover, Typography, Button, Divider } from '@mui/material';
import { Notification } from '@/lib/types';
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '@/lib/api';
import NotificationsList from './NotificationsList';

const RECENT_LIMIT = 15;

interface NotificationsPopoverProps {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
}

export default function NotificationsPopover({ anchorEl, open, onClose }: NotificationsPopoverProps) {
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  // Reload each time the popover opens. setState happens only in the async
  // continuation (the lint rule forbids synchronous setState in an effect).
  useEffect(() => {
    if (!open) return;
    let active = true;
    getNotifications({ limit: RECENT_LIMIT })
      .then((rows) => { if (active) setItems(rows); })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open]);

  const handleItemClick = useCallback(
    (n: Notification) => {
      // Optimistic local mark-read so the badge clears immediately.
      if (!n.readAt) {
        setItems((prev) => prev.map((it) => (it.id === n.id ? { ...it, readAt: new Date().toISOString() } : it)));
        markNotificationRead(n.id)
          .then(() => window.dispatchEvent(new Event('notifications-changed')))
          .catch(() => {});
      }
      onClose();
      if (n.link) router.push(n.link);
    },
    [router, onClose],
  );

  const handleMarkAll = useCallback(() => {
    setItems((prev) => prev.map((it) => (it.readAt ? it : { ...it, readAt: new Date().toISOString() })));
    markAllNotificationsRead()
      .then(() => window.dispatchEvent(new Event('notifications-changed')))
      .catch(() => {});
  }, []);

  const hasUnread = items.some((n) => !n.readAt);

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'center', horizontal: 'right' }}
      transformOrigin={{ vertical: 'center', horizontal: 'left' }}
      slotProps={{ paper: { sx: { width: 360, maxHeight: 480, overflow: 'hidden', display: 'flex', flexDirection: 'column' } } }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.5 }}>
        <Typography variant="subtitle2" fontWeight={600}>Notifications</Typography>
        <Button
          size="small"
          onClick={handleMarkAll}
          disabled={!hasUnread}
          sx={{ textTransform: 'none', minWidth: 0 }}
        >
          Mark all read
        </Button>
      </Box>
      <Divider />
      <Box sx={{ overflowY: 'auto', flex: 1 }}>
        <NotificationsList
          items={items}
          loading={loading}
          onItemClick={handleItemClick}
          dense
        />
      </Box>
      <Divider />
      <Button
        fullWidth
        onClick={() => { onClose(); router.push('/notifications'); }}
        sx={{ textTransform: 'none', py: 1.25, borderRadius: 0 }}
      >
        View all
      </Button>
    </Popover>
  );
}
