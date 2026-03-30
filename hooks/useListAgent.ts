'use client';

import { useCallback, useRef, useState } from 'react';
import {
  ChatMessage,
  OrchestratorMessage,
  ListAgentContext,
  ListAgentResponse,
  PendingListAction,
  PartsListRow,
} from '@/lib/types';
import { SavedView } from '@/lib/viewConfigStorage';
import { listAgentChat } from '@/lib/api';

// ----------------------------------------------------------
// Types
// ----------------------------------------------------------

export interface UseListAgentOptions {
  rows: PartsListRow[];
  listId: string | null;
  listName: string | null;
  listDescription: string;
  listCustomer: string;
  listCurrency: string;
  activeView: SavedView;
  views: SavedView[];
  // Action dispatchers
  setSearchTerm: (term: string) => void;
  setSortColumnId: (id: string | null) => void;
  setSortDirection: (dir: 'asc' | 'desc') => void;
  selectView: (viewId: string) => void;
  handleRefreshRows: (indices: number[]) => void;
  handleDeleteRows: (indices: number[]) => void;
  handleSetPreferred: (rowIndex: number, mpn: string | null) => void;
}

export interface UseListAgentResult {
  messages: ChatMessage[];
  isLoading: boolean;
  isOpen: boolean;
  toggleOpen: () => void;
  handleSendMessage: (text: string) => void;
  handleActionConfirm: (messageId: string) => void;
  handleActionCancel: (messageId: string) => void;
}

// ----------------------------------------------------------
// Helpers
// ----------------------------------------------------------

let msgCounter = 0;
function makeMessage(
  role: 'user' | 'assistant',
  content: string,
  interactiveElement?: ChatMessage['interactiveElement'],
): ChatMessage {
  return {
    id: `list-agent-${++msgCounter}`,
    role,
    content,
    timestamp: new Date(),
    interactiveElement,
  };
}

// ----------------------------------------------------------
// Hook
// ----------------------------------------------------------

export function useListAgent(options: UseListAgentOptions): UseListAgentResult {
  const {
    rows, listId, listName, listDescription, listCustomer, listCurrency,
    activeView, views,
    setSearchTerm, setSortColumnId, setSortDirection, selectView,
    handleRefreshRows, handleDeleteRows, handleSetPreferred,
  } = options;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const conversationRef = useRef<OrchestratorMessage[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const toggleOpen = useCallback(() => setIsOpen(prev => !prev), []);

  const buildListContext = useCallback((): ListAgentContext => {
    const statusCounts: Record<string, number> = {};
    const mfrCounts: Record<string, number> = {};
    const familyCounts: Record<string, number> = {};

    for (const row of rows) {
      statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1;
      const mfr = row.resolvedPart?.manufacturer ?? row.rawManufacturer;
      if (mfr) mfrCounts[mfr] = (mfrCounts[mfr] ?? 0) + 1;
      const cat = row.resolvedPart?.category ?? '';
      if (cat) familyCounts[cat] = (familyCounts[cat] ?? 0) + 1;
    }

    const topManufacturers = Object.entries(mfrCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    const topFamilies = Object.entries(familyCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    return {
      listId: listId ?? '',
      listName: listName ?? '',
      listDescription: listDescription ?? '',
      listCustomer: listCustomer ?? '',
      currency: listCurrency,
      totalRows: rows.length,
      statusCounts,
      topManufacturers,
      topFamilies,
      activeViewName: activeView.name,
      activeViewColumns: activeView.columns.slice(0, 20), // Cap to keep context small
      viewNames: views.map(v => v.name),
    };
  }, [rows, listId, listName, listDescription, listCustomer, listCurrency, activeView, views]);

  const dispatchClientActions = useCallback((response: ListAgentResponse) => {
    if (!response.clientActions) return;
    for (const action of response.clientActions) {
      switch (action.type) {
        case 'sort':
          setSortColumnId(action.columnId);
          setSortDirection(action.direction);
          break;
        case 'filter':
          setSearchTerm(action.searchTerm);
          break;
        case 'switch_view': {
          const match = views.find(v => v.name.toLowerCase() === action.viewName.toLowerCase());
          if (match) selectView(match.id);
          break;
        }
      }
    }
  }, [setSortColumnId, setSortDirection, setSearchTerm, views, selectView]);

  const handleSendMessage = useCallback(async (text: string) => {
    if (!text.trim() || !listId || isLoading) return;

    // Cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const userMsg = makeMessage('user', text);
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    conversationRef.current.push({ role: 'user', content: text });

    try {
      const listContext = buildListContext();
      const response = await listAgentChat(
        conversationRef.current,
        listContext,
        listId,
        controller.signal,
      );

      conversationRef.current.push({ role: 'assistant', content: response.message });

      // Dispatch client-side actions immediately
      dispatchClientActions(response);

      // Build assistant message with optional pending action
      const assistantMsg = makeMessage(
        'assistant',
        response.message,
        response.pendingAction
          ? { type: 'list-action', action: response.pendingAction, status: 'pending' }
          : undefined,
      );
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      console.error('[useListAgent] Error:', err);
      const errorMsg = makeMessage('assistant', 'Sorry, something went wrong. Please try again.');
      errorMsg.variant = 'warning';
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  }, [listId, isLoading, buildListContext, dispatchClientActions]);

  const handleActionConfirm = useCallback((messageId: string) => {
    setMessages(prev => prev.map(msg => {
      if (msg.id !== messageId) return msg;
      if (msg.interactiveElement?.type !== 'list-action') return msg;
      if (msg.interactiveElement.status !== 'pending') return msg;

      const action = msg.interactiveElement.action;

      // Dispatch the action
      switch (action.type) {
        case 'delete_rows':
          handleDeleteRows(action.rowIndices);
          break;
        case 'refresh_rows':
          handleRefreshRows(action.rowIndices);
          break;
        case 'set_preferred':
          handleSetPreferred(action.rowIndex, action.mpn);
          break;
      }

      return {
        ...msg,
        interactiveElement: { ...msg.interactiveElement, status: 'confirmed' as const },
      };
    }));
  }, [handleDeleteRows, handleRefreshRows, handleSetPreferred]);

  const handleActionCancel = useCallback((messageId: string) => {
    setMessages(prev => prev.map(msg => {
      if (msg.id !== messageId) return msg;
      if (msg.interactiveElement?.type !== 'list-action') return msg;
      if (msg.interactiveElement.status !== 'pending') return msg;

      return {
        ...msg,
        interactiveElement: { ...msg.interactiveElement, status: 'cancelled' as const },
      };
    }));
  }, []);

  return {
    messages,
    isLoading,
    isOpen,
    toggleOpen,
    handleSendMessage,
    handleActionConfirm,
    handleActionCancel,
  };
}
