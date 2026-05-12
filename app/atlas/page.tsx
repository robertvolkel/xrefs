'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Box } from '@mui/material';
import AppSidebar from '@/components/AppSidebar';
import ChatHistoryDrawer from '@/components/ChatHistoryDrawer';
import AtlasCoveragePanel from '@/components/admin/AtlasCoveragePanel';
import { useConversations } from '@/lib/hooks/useConversations';
import { useProfile } from '@/lib/hooks/useProfile';

export default function AtlasPage() {
  const router = useRouter();
  const { isAdmin } = useProfile();
  const {
    conversations, loading: convoLoading,
    remove: removeConvo, removeAll: removeAllConvos, refresh: refreshConvos,
  } = useConversations();
  const [historyOpen, setHistoryOpen] = useState(false);

  const handleToggleHistory = useCallback(() => {
    setHistoryOpen((prev) => {
      if (!prev) refreshConvos();
      return !prev;
    });
  }, [refreshConvos]);

  return (
    <Box sx={{ display: 'flex', height: 'var(--app-height)', width: '100vw' }}>
      <AppSidebar
        onReset={() => { window.location.href = '/'; }}
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
        onClearAllConversations={() => removeAllConvos()}
      />
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        <AtlasCoveragePanel readOnly={!isAdmin} />
      </Box>
    </Box>
  );
}
