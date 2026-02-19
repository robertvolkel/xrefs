'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { ConversationSummary, ConversationSnapshot } from '@/lib/types';
import {
  getConversations,
  createConversation as createConvo,
  updateConversation,
  loadConversation,
  deleteConversation,
} from '@/lib/supabaseConversationStorage';

export function useConversations() {
  const { user, loading: authLoading } = useAuth();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setConversations([]);
      setLoading(false);
      return;
    }
    const data = await getConversations();
    setConversations(data);
    setLoading(false);
  }, [user]);

  // Fetch on mount / when user changes
  useEffect(() => {
    if (authLoading) return;
    refresh();
  }, [authLoading, refresh]);

  const create: typeof createConvo = useCallback(async (...args) => {
    const id = await createConvo(...args);
    if (id) await refresh();
    return id;
  }, [refresh]);

  const save: typeof updateConversation = useCallback(async (...args) => {
    await updateConversation(...args);
  }, []);

  const load = useCallback(async (id: string): Promise<ConversationSnapshot | null> => {
    return loadConversation(id);
  }, []);

  const remove = useCallback(async (id: string) => {
    await deleteConversation(id);
    await refresh();
  }, [refresh]);

  return {
    conversations,
    loading: authLoading || loading,
    refresh,
    create,
    save,
    load,
    remove,
  };
}
