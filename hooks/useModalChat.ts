'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChatMessage,
  InteractiveElement,
  ApplicationContext,
  XrefRecommendation,
  PartsListRow,
  OrchestratorMessage,
  MissingAttributeInfo,
} from '@/lib/types';
import { getLogicTableForSubcategory } from '@/lib/logicTables';
import { detectMissingAttributes } from '@/lib/services/matchingEngine';
import { getContextQuestionsForFamily } from '@/lib/contextQuestions';
import { getRecommendationsWithOverrides, modalChat as modalChatApi } from '@/lib/api';

// ----------------------------------------------------------
// Types
// ----------------------------------------------------------

type ModalChatPhase = 'init' | 'awaiting-attributes' | 'awaiting-context' | 'refreshing' | 'open-chat';

interface ModalChatState {
  messages: ChatMessage[];
  phase: ModalChatPhase;
  overrides: Record<string, string>;
  applicationContext: ApplicationContext | null;
  isLoading: boolean;
  familyId: string | null;
}

interface UseModalChatOptions {
  row: PartsListRow | null;
  open: boolean;
  onRecommendationsRefreshed: (recs: XrefRecommendation[]) => void;
}

// ----------------------------------------------------------
// Helpers
// ----------------------------------------------------------

let msgCounter = 0;
function makeMessage(role: 'user' | 'assistant', content: string, interactiveElement?: InteractiveElement): ChatMessage {
  return {
    id: `modal-${++msgCounter}`,
    role,
    content,
    timestamp: new Date(),
    interactiveElement,
  };
}

// ----------------------------------------------------------
// Hook
// ----------------------------------------------------------

export function useModalChat({ row, open, onRecommendationsRefreshed }: UseModalChatOptions) {
  const [state, setState] = useState<ModalChatState>({
    messages: [],
    phase: 'init',
    overrides: {},
    applicationContext: null,
    isLoading: false,
    familyId: null,
  });

  // Track overrides/context in refs so handlers don't need state deps
  const overridesRef = useRef<Record<string, string>>({});
  const contextRef = useRef<ApplicationContext | null>(null);
  const familyIdRef = useRef<string | null>(null);
  const conversationRef = useRef<OrchestratorMessage[]>([]);
  const mpnRef = useRef<string>('');
  const initRef = useRef(false);

  // ----------------------------------------------------------
  // Initialization — runs when modal opens with a row
  // ----------------------------------------------------------

  useEffect(() => {
    if (!open || !row || !row.sourceAttributes) {
      // Reset when modal closes
      if (!open && initRef.current) {
        setState({
          messages: [],
          phase: 'init',
          overrides: {},
          applicationContext: null,
          isLoading: false,
          familyId: null,
        });
        overridesRef.current = {};
        contextRef.current = null;
        familyIdRef.current = null;
        conversationRef.current = [];
        mpnRef.current = '';
        initRef.current = false;
      }
      return;
    }

    // Prevent re-running if already initialized for this row
    if (initRef.current) return;
    initRef.current = true;

    const attrs = row.sourceAttributes;
    mpnRef.current = attrs.part.mpn;
    const logicTable = getLogicTableForSubcategory(attrs.part.subcategory);

    if (!logicTable) {
      // No logic table — go straight to open chat
      setState(prev => ({
        ...prev,
        messages: [
          makeMessage('assistant', `Showing **${attrs.part.mpn}** recommendations. Ask me anything to help narrow down the best replacement.`),
        ],
        phase: 'open-chat',
      }));
      return;
    }

    familyIdRef.current = logicTable.familyId;

    // Check for missing critical attributes
    const missingAttrs = detectMissingAttributes(attrs, logicTable);
    const criticalMissing = missingAttrs.filter(a => a.weight >= 7);

    if (criticalMissing.length > 0 && missingAttrs.length <= 6) {
      setState(prev => ({
        ...prev,
        familyId: logicTable.familyId,
        messages: [
          makeMessage(
            'assistant',
            `I found **${row.allRecommendations?.length ?? 0}** replacements for **${attrs.part.mpn}**. I'm missing some information that could improve the results.`,
            {
              type: 'attribute-query',
              missingAttributes: missingAttrs,
              partMpn: attrs.part.mpn,
            }
          ),
        ],
        phase: 'awaiting-attributes',
      }));
      return;
    }

    // Check for context questions
    const contextConfig = getContextQuestionsForFamily(logicTable.familyId);
    if (contextConfig && contextConfig.questions.length > 0) {
      setState(prev => ({
        ...prev,
        familyId: logicTable.familyId,
        messages: [
          makeMessage(
            'assistant',
            `I found **${row.allRecommendations?.length ?? 0}** replacements for **${attrs.part.mpn}**. Let me understand your application to refine the results.`,
            {
              type: 'context-questions',
              questions: contextConfig.questions,
              familyId: logicTable.familyId,
            }
          ),
        ],
        phase: 'awaiting-context',
      }));
      return;
    }

    // Nothing to ask — go to open chat
    setState(prev => ({
      ...prev,
      familyId: logicTable.familyId,
      messages: [
        makeMessage('assistant', `Showing **${row.allRecommendations?.length ?? 0}** replacements for **${attrs.part.mpn}**. Ask me anything to help narrow down the best replacement.`),
      ],
      phase: 'open-chat',
    }));
  }, [open, row]);

  // ----------------------------------------------------------
  // Refresh recommendations with current overrides + context
  // ----------------------------------------------------------

  const refreshRecommendations = useCallback(async () => {
    const mpn = mpnRef.current;
    if (!mpn) return;

    setState(prev => ({ ...prev, isLoading: true }));
    try {
      const overrides = overridesRef.current;
      const context = contextRef.current;
      const recs = await getRecommendationsWithOverrides(mpn, overrides, context ?? undefined);
      onRecommendationsRefreshed(recs);
    } catch {
      // Silently fail — keep existing recommendations
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [onRecommendationsRefreshed]);

  // ----------------------------------------------------------
  // Transition to context questions or open chat
  // ----------------------------------------------------------

  const transitionAfterAttributes = useCallback(() => {
    const fId = familyIdRef.current;
    if (fId) {
      const contextConfig = getContextQuestionsForFamily(fId);
      if (contextConfig && contextConfig.questions.length > 0) {
        setState(prev => ({
          ...prev,
          phase: 'awaiting-context',
          messages: [
            ...prev.messages,
            makeMessage(
              'assistant',
              'One more thing — let me understand your application to find the best match.',
              {
                type: 'context-questions',
                questions: contextConfig.questions,
                familyId: fId,
              }
            ),
          ],
        }));
        return;
      }
    }

    // No context questions — refresh and go to open chat
    refreshRecommendations();
    setState(prev => ({
      ...prev,
      phase: 'open-chat',
      messages: [
        ...prev.messages,
        makeMessage('assistant', 'Recommendations updated. Ask me anything to refine the results further.'),
      ],
    }));
  }, [refreshRecommendations]);

  // ----------------------------------------------------------
  // Phase 1 handlers: Structured forms
  // ----------------------------------------------------------

  const handleAttributeResponse = useCallback((responses: Record<string, string>) => {
    // Filter out empty responses
    const filled: Record<string, string> = {};
    for (const [k, v] of Object.entries(responses)) {
      if (v.trim()) filled[k] = v.trim();
    }

    overridesRef.current = { ...overridesRef.current, ...filled };

    const filledCount = Object.keys(filled).length;
    setState(prev => ({
      ...prev,
      overrides: { ...prev.overrides, ...filled },
      messages: [
        ...prev.messages,
        makeMessage('user', filledCount > 0
          ? `Provided ${filledCount} attribute value${filledCount > 1 ? 's' : ''}.`
          : 'Skipped missing attributes.'),
      ],
    }));

    transitionAfterAttributes();
  }, [transitionAfterAttributes]);

  const handleSkipAttributes = useCallback(() => {
    setState(prev => ({
      ...prev,
      messages: [
        ...prev.messages,
        makeMessage('user', 'Skipped missing attributes.'),
      ],
    }));
    transitionAfterAttributes();
  }, [transitionAfterAttributes]);

  const handleContextResponse = useCallback((answers: Record<string, string>) => {
    const filtered: Record<string, string> = {};
    for (const [k, v] of Object.entries(answers)) {
      if (v.trim()) filtered[k] = v.trim();
    }

    const fId = familyIdRef.current;
    const filledCount = Object.keys(filtered).length;

    if (filledCount > 0 && fId) {
      const ctx: ApplicationContext = { familyId: fId, answers: filtered };
      contextRef.current = ctx;
      setState(prev => ({ ...prev, applicationContext: ctx }));
    }

    setState(prev => ({
      ...prev,
      messages: [
        ...prev.messages,
        makeMessage('user', filledCount > 0
          ? `Answered ${filledCount} application question${filledCount > 1 ? 's' : ''}.`
          : 'Skipped application questions.'),
      ],
    }));

    // Refresh with all collected data and transition to open chat
    refreshRecommendations();
    setState(prev => ({
      ...prev,
      phase: 'open-chat',
      messages: [
        ...prev.messages,
        makeMessage('assistant', 'Recommendations updated. Ask me anything to refine the results further.'),
      ],
    }));
  }, [refreshRecommendations]);

  const handleSkipContext = useCallback(() => {
    setState(prev => ({
      ...prev,
      messages: [
        ...prev.messages,
        makeMessage('user', 'Skipped application questions.'),
      ],
    }));

    // Still refresh with any attribute overrides collected
    refreshRecommendations();
    setState(prev => ({
      ...prev,
      phase: 'open-chat',
      messages: [
        ...prev.messages,
        makeMessage('assistant', 'Recommendations ready. Ask me anything to refine the results further.'),
      ],
    }));
  }, [refreshRecommendations]);

  // ----------------------------------------------------------
  // Phase 2 handler: Open chat with LLM
  // ----------------------------------------------------------

  const handleSendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const userMsg = makeMessage('user', trimmed);
    setState(prev => ({
      ...prev,
      messages: [...prev.messages, userMsg],
      isLoading: true,
    }));

    // Build conversation for the orchestrator
    conversationRef.current.push({ role: 'user', content: trimmed });

    try {
      const result = await modalChatApi(
        conversationRef.current,
        mpnRef.current,
        overridesRef.current,
        contextRef.current ?? undefined,
      );

      conversationRef.current.push({ role: 'assistant', content: result.message });

      // If the LLM returned new recommendations, update the right panel
      const recsMap = result.recommendations;
      if (recsMap) {
        const recs = Object.values(recsMap)[0];
        if (recs) {
          onRecommendationsRefreshed(recs);
        }
      }

      setState(prev => ({
        ...prev,
        messages: [...prev.messages, makeMessage('assistant', result.message)],
        isLoading: false,
      }));
    } catch {
      setState(prev => ({
        ...prev,
        messages: [...prev.messages, makeMessage('assistant', 'Sorry, I encountered an error. Please try again.')],
        isLoading: false,
      }));
    }
  }, [onRecommendationsRefreshed]);

  return {
    messages: state.messages,
    phase: state.phase,
    isLoading: state.isLoading,
    handleAttributeResponse,
    handleSkipAttributes,
    handleContextResponse,
    handleSkipContext,
    handleSendMessage,
  };
}
