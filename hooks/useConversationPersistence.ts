'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useConversations } from '@/lib/hooks/useConversations';
import { AppPhase, ConversationSnapshot, ChatMessage, PartSummary, PartAttributes, ApplicationContext, XrefRecommendation, OrchestratorMessage } from '@/lib/types';

interface AppStateSlice {
  conversationId: string | null;
  phase: AppPhase;
  messages: ChatMessage[];
  sourcePart: PartSummary | null;
  sourceAttributes: PartAttributes | null;
  applicationContext: ApplicationContext | null;
  recommendations: XrefRecommendation[];
  selectedRecommendation: XrefRecommendation | null;
  comparisonAttributes: PartAttributes | null;
  hydrateState: (snapshot: ConversationSnapshot) => void;
  setConversationId: (id: string) => void;
  handleReset: () => void;
  getOrchestratorMessages: () => OrchestratorMessage[];
}

interface ConversationPersistenceResult {
  conversations: ReturnType<typeof useConversations>['conversations'];
  convoLoading: boolean;
  historyOpen: boolean;
  setHistoryOpen: (open: boolean) => void;
  handleSelectConversation: (id: string) => Promise<void>;
  handleNewChat: () => void;
  handleDeleteConversation: (id: string) => Promise<void>;
  /** Called on hydration to set recsRevealed externally */
  onHydrateRecsRevealed: (revealed: boolean) => void;
}

export function useConversationPersistence(
  appState: AppStateSlice,
  resetPanelState: () => void,
  setRecsRevealed: (revealed: boolean) => void,
): ConversationPersistenceResult {
  const {
    conversations, loading: convoLoading,
    create: createConvo, save: saveConvo, load: loadConvo,
    remove: removeConvo, refresh: refreshConvos,
  } = useConversations();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [historyOpen, setHistoryOpen] = useState(false);

  // Hydrate from URL param (e.g., navigated from /lists with ?c=<id>)
  const hydrationDoneRef = useRef(false);
  useEffect(() => {
    if (hydrationDoneRef.current) return;
    const convoId = searchParams.get('c');
    if (!convoId) return;
    hydrationDoneRef.current = true;
    loadConvo(convoId).then((snapshot) => {
      if (!snapshot) return;
      setRecsRevealed(snapshot.phase === 'viewing' || snapshot.phase === 'comparing');
      appState.hydrateState(snapshot);
      // Clean the URL
      router.replace('/', { scroll: false });
    });
  }, [searchParams, loadConvo, appState.hydrateState, router, setRecsRevealed]);

  // Auto-save: create or update conversation when messages/phase change
  const prevSaveKeyRef = useRef('');
  useEffect(() => {
    const msgCount = appState.messages.length;
    if (msgCount === 0) return;

    // Don't persist transient phases — they'd cause frozen UI on reload
    const TRANSIENT_PHASES = ['searching', 'loading-attributes', 'finding-matches'];
    if (TRANSIENT_PHASES.includes(appState.phase)) return;

    const saveKey = `${msgCount}:${appState.phase}`;
    if (saveKey === prevSaveKeyRef.current) return;
    prevSaveKeyRef.current = saveKey;

    const firstUserMsg = appState.messages.find((m) => m.role === 'user');
    if (!firstUserMsg) return;

    if (!appState.conversationId) {
      // First save — create conversation
      const title = firstUserMsg.content.length > 50
        ? firstUserMsg.content.slice(0, 50) + '...'
        : firstUserMsg.content;
      createConvo(title, null, appState.messages, appState.getOrchestratorMessages(), appState.phase)
        .then((id) => { if (id) appState.setConversationId(id); });
    } else {
      // Update existing conversation
      saveConvo(appState.conversationId, {
        messages: appState.messages,
        orchestratorMessages: appState.getOrchestratorMessages(),
        phase: appState.phase,
        sourcePart: appState.sourcePart,
        sourceAttributes: appState.sourceAttributes,
        applicationContext: appState.applicationContext,
        recommendations: appState.recommendations,
        selectedRecommendation: appState.selectedRecommendation,
        comparisonAttributes: appState.comparisonAttributes,
        sourceMpn: appState.sourcePart?.mpn ?? null,
      });
    }
  }, [appState.messages.length, appState.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh conversation list when drawer opens
  useEffect(() => {
    if (historyOpen) refreshConvos();
  }, [historyOpen, refreshConvos]);

  const handleSelectConversation = useCallback(async (id: string) => {
    const snapshot = await loadConvo(id);
    if (!snapshot) return;
    resetPanelState();
    setRecsRevealed(snapshot.phase === 'viewing' || snapshot.phase === 'comparing');
    appState.hydrateState(snapshot);
    setHistoryOpen(false);
  }, [loadConvo, appState.hydrateState, resetPanelState, setRecsRevealed]);

  const handleNewChat = useCallback(() => {
    resetPanelState();
    appState.handleReset();
    setHistoryOpen(false);
  }, [appState.handleReset, resetPanelState]);

  const handleDeleteConversation = useCallback(async (id: string) => {
    await removeConvo(id);
    if (appState.conversationId === id) {
      appState.handleReset();
    }
  }, [removeConvo, appState.conversationId, appState.handleReset]);

  return {
    conversations,
    convoLoading,
    historyOpen,
    setHistoryOpen,
    handleSelectConversation,
    handleNewChat,
    handleDeleteConversation,
    onHydrateRecsRevealed: setRecsRevealed,
  };
}
