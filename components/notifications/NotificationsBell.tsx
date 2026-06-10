'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { IconButton, Badge } from '@mui/material';
import NotificationsNoneOutlinedIcon from '@mui/icons-material/NotificationsNoneOutlined';
import { getNotificationsUnreadCount } from '@/lib/api';
import NotificationsPopover from './NotificationsPopover';

const POLL_INTERVAL_MS = 30_000;

/**
 * Sidebar notification bell. Self-contained: polls the unread count every 30s
 * (paused when the tab is hidden, refreshed on visibility + on the
 * `notifications-changed` window event), shows a count badge, and opens the
 * recents popover on click.
 */
export default function NotificationsBell() {
  const [count, setCount] = useState(0);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);
  const cancelledRef = useRef(false);

  const refresh = useCallback(() => {
    getNotificationsUnreadCount()
      .then((r) => { if (!cancelledRef.current) setCount(r.count); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    refresh();
    const onChange = () => refresh();
    const tick = () => { if (document.visibilityState === 'visible') refresh(); };
    const onVis = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('notifications-changed', onChange);
    document.addEventListener('visibilitychange', onVis);
    const intervalId = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelledRef.current = true;
      window.removeEventListener('notifications-changed', onChange);
      document.removeEventListener('visibilitychange', onVis);
      clearInterval(intervalId);
    };
  }, [refresh]);

  const handleClose = useCallback(() => {
    setAnchorEl(null);
    // Popover may have marked items read — re-sync the badge shortly after.
    setTimeout(refresh, 300);
  }, [refresh]);

  return (
    <>
      <IconButton
        onClick={(e) => setAnchorEl(e.currentTarget)}
        size="small"
        title="Notifications"
        sx={{
          mb: 1.5,
          color: open ? 'text.primary' : 'text.secondary',
          bgcolor: open ? 'action.selected' : 'transparent',
          borderRadius: 1,
          '&:hover': { color: 'text.primary' },
        }}
      >
        <Badge badgeContent={count} color="error" max={99}>
          <NotificationsNoneOutlinedIcon fontSize="small" />
        </Badge>
      </IconButton>
      <NotificationsPopover anchorEl={anchorEl} open={open} onClose={handleClose} />
    </>
  );
}
