'use client';

import { useCallback, useEffect, useState } from 'react';
import { Box, Typography, Button } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { PAGE_HEADER_HEIGHT } from '@/lib/layoutConstants';
import { AppFeedbackListItem } from '@/lib/types';
import { getOwnAppFeedbackList } from '@/lib/api';
import AppFeedbackDialog from '@/components/AppFeedbackDialog';
import NotificationSnackbar from '@/components/NotificationSnackbar';
import FeedbackList from './FeedbackList';
import FeedbackDetailModal, { FeedbackDetailModalUpdate } from './FeedbackDetailModal';

const POLL_INTERVAL_MS = 30_000;

export default function FeedbackShell() {
  const [items, setItems] = useState<AppFeedbackListItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const loadList = useCallback(async () => {
    try {
      const { items: rows } = await getOwnAppFeedbackList();
      setItems(rows);
    } finally {
      setLoadingList(false);
    }
  }, []);

  // Initial load.
  useEffect(() => {
    loadList();
  }, [loadList]);

  // 30s background poll while the tab is visible + immediate refresh on
  // tab-visibility regain. Skipped when the tab is hidden.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') loadList();
    };
    const intervalId = setInterval(tick, POLL_INTERVAL_MS);
    const onVis = () => {
      if (document.visibilityState === 'visible') loadList();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [loadList]);

  // Cross-tab + intra-app event: another component mutated read-state.
  useEffect(() => {
    const handler = () => { loadList(); };
    window.addEventListener('feedback-unread-changed', handler);
    return () => window.removeEventListener('feedback-unread-changed', handler);
  }, [loadList]);

  const openItem = openId ? items.find((it) => it.id === openId) ?? null : null;

  const handleRowDeleted = useCallback((deletedId: string) => {
    setItems((prev) => prev.filter((it) => it.id !== deletedId));
    if (openId === deletedId) setOpenId(null);
    window.dispatchEvent(new Event('feedback-unread-changed'));
  }, [openId]);

  const handleModalUpdated = useCallback((update: FeedbackDetailModalUpdate) => {
    if (!openId) return;
    setItems((prev) =>
      prev.map((it) =>
        it.id === openId
          ? {
              ...it,
              commentCount: it.commentCount + (update.commentCountDelta ?? 0),
              hasUnread: false,
              userLastReadAt: new Date().toISOString(),
            }
          : it,
      ),
    );
  }, [openId]);

  const handleSubmitted = useCallback(() => {
    setSubmitted(true);
    loadList();
    window.dispatchEvent(new Event('feedback-unread-changed'));
  }, [loadList]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: 'background.default' }}>
      {/* Page header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: 3,
          height: PAGE_HEADER_HEIGHT,
          minHeight: PAGE_HEADER_HEIGHT,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Typography variant="h6" fontWeight={400} color="text.secondary" sx={{ lineHeight: 1 }}>
          My Feedback
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Button
          variant="contained"
          size="small"
          startIcon={<AddIcon />}
          onClick={() => setDialogOpen(true)}
          sx={{ textTransform: 'none', fontSize: '0.8rem' }}
        >
          New Feedback
        </Button>
      </Box>

      {/* Full-width list */}
      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        <Box sx={{ maxWidth: 880, mx: 'auto' }}>
          <FeedbackList
            items={items}
            selectedId={openId}
            onSelect={(item) => setOpenId(item.id)}
            onDeleted={handleRowDeleted}
            loading={loadingList}
          />
        </Box>
      </Box>

      {/* Trello-style overlay */}
      {openItem && (
        <FeedbackDetailModal
          open
          onClose={() => setOpenId(null)}
          viewerRole="user"
          feedback={openItem}
          onUpdated={handleModalUpdated}
        />
      )}

      <AppFeedbackDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmitted={handleSubmitted}
      />
      <NotificationSnackbar
        open={submitted}
        message="Thanks — your feedback has been sent."
        severity="success"
        onClose={() => setSubmitted(false)}
        autoHideDuration={4000}
      />
    </Box>
  );
}
