'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Typography, Button } from '@mui/material';
import { PAGE_HEADER_HEIGHT } from '@/lib/layoutConstants';
import { Notification } from '@/lib/types';
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '@/lib/api';
import NotificationsList from './NotificationsList';

const PAGE_SIZE = 30;

export default function NotificationsPageClient() {
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  // setState happens only inside the async continuation (never synchronously
  // in the effect body) — `loading` starts true so the first paint is correct.
  useEffect(() => {
    let active = true;
    getNotifications({ limit: PAGE_SIZE })
      .then((rows) => {
        if (!active) return;
        setItems(rows);
        setHasMore(rows.length === PAGE_SIZE);
      })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const loadMore = useCallback(() => {
    const last = items[items.length - 1];
    if (!last) return;
    setLoadingMore(true);
    getNotifications({ limit: PAGE_SIZE, before: last.createdAt })
      .then((rows) => {
        setItems((prev) => [...prev, ...rows]);
        setHasMore(rows.length === PAGE_SIZE);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  }, [items]);

  const handleItemClick = useCallback(
    (n: Notification) => {
      if (!n.readAt) {
        setItems((prev) => prev.map((it) => (it.id === n.id ? { ...it, readAt: new Date().toISOString() } : it)));
        markNotificationRead(n.id)
          .then(() => window.dispatchEvent(new Event('notifications-changed')))
          .catch(() => {});
      }
      if (n.link) router.push(n.link);
    },
    [router],
  );

  const handleMarkAll = useCallback(() => {
    setItems((prev) => prev.map((it) => (it.readAt ? it : { ...it, readAt: new Date().toISOString() })));
    markAllNotificationsRead()
      .then(() => window.dispatchEvent(new Event('notifications-changed')))
      .catch(() => {});
  }, []);

  const hasUnread = items.some((n) => !n.readAt);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: 'background.default' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 3,
          height: PAGE_HEADER_HEIGHT,
          borderBottom: 1,
          borderColor: 'divider',
          flexShrink: 0,
        }}
      >
        <Typography variant="h6" fontWeight={400} color="text.secondary" sx={{ lineHeight: 1 }}>
          Notifications
        </Typography>
        <Button
          size="small"
          onClick={handleMarkAll}
          disabled={!hasUnread}
          sx={{ textTransform: 'none' }}
        >
          Mark all read
        </Button>
      </Box>

      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        <Box sx={{ maxWidth: 720, mx: 'auto' }}>
          <NotificationsList items={items} loading={loading} onItemClick={handleItemClick} />
          {hasMore && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <Button onClick={loadMore} disabled={loadingMore} sx={{ textTransform: 'none' }}>
                {loadingMore ? 'Loading…' : 'Load more'}
              </Button>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
