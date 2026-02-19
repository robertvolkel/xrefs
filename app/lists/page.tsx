'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Box } from '@mui/material';
import AppSidebar from '@/components/AppSidebar';
import ChatHistoryDrawer from '@/components/ChatHistoryDrawer';
import ListsDashboard from '@/components/lists/ListsDashboard';
import { useConversations } from '@/lib/hooks/useConversations';

export default function ListsPage() {
  const router = useRouter();
  const {
    conversations, loading: convoLoading,
    remove: removeConvo, refresh: refreshConvos,
  } = useConversations();
  const [historyOpen, setHistoryOpen] = useState(false);

  // Refresh conversation list when drawer opens
  const handleToggleHistory = useCallback(() => {
    setHistoryOpen((prev) => {
      if (!prev) refreshConvos();
      return !prev;
    });
  }, [refreshConvos]);

  return (
    <Box sx={{ display: 'flex', height: 'var(--app-height)', width: '100vw' }}>
      <AppSidebar
        onReset={() => router.push('/')}
        onToggleHistory={handleToggleHistory}
        historyOpen={historyOpen}
      />
      <ChatHistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        conversations={conversations}
        loading={convoLoading}
        activeConversationId={null}
        onSelectConversation={(id) => router.push(`/?c=${id}`)}
        onNewChat={() => router.push('/')}
        onDeleteConversation={(id) => removeConvo(id)}
      />
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        <ListsDashboard />
      </Box>
    </Box>
  );
}
