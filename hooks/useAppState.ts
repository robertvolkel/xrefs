'use client';
import { useState, useCallback, useRef, useEffect } from 'react';
import {
  AppPhase,
  ApplicationContext,
  ChatMessage,
  ChoiceOption,
  ConversationSnapshot,
  PartSummary,
  PartAttributes,
  XrefRecommendation,
  SearchResult,
  OrchestratorMessage,
} from '@/lib/types';
import {
  searchParts,
  getPartAttributes,
  getRecommendationsWithOverrides,
  chatWithOrchestrator,
  enrichWithFCBatch,
} from '@/lib/api';
import { sortRecommendationsForDisplay } from '@/components/RecommendationsPanel';
import { getLogicTableForSubcategory, isFamilySupported } from '@/lib/logicTables';
import { detectMissingAttributes } from '@/lib/services/matchingEngine';
import { getContextQuestionsForFamily } from '@/lib/contextQuestions';
import { deriveAutoAnswers } from '@/lib/contextQuestions/autoAnswer';
import { logSearch } from '@/lib/supabaseLogger';

interface AppState {
  conversationId: string | null;
  phase: AppPhase;
  messages: ChatMessage[];
  statusText: string;
  searchResult: SearchResult | null;
  sourcePart: PartSummary | null;
  sourceAttributes: PartAttributes | null;
  applicationContext: ApplicationContext | null;
  recommendations: XrefRecommendation[];
  allRecommendations: XrefRecommendation[]; // full unfiltered set for filter reset
  selectedRecommendation: XrefRecommendation | null;
  comparisonAttributes: PartAttributes | null;
  llmAvailable: boolean | null; // null = not yet checked
  isEnrichingFC: boolean; // true while FindChips batch enrichment is in flight
}

const initialState: AppState = {
  conversationId: null,
  phase: 'idle',
  messages: [],
  statusText: '',
  searchResult: null,
  sourcePart: null,
  sourceAttributes: null,
  applicationContext: null,
  recommendations: [],
  allRecommendations: [],
  selectedRecommendation: null,
  comparisonAttributes: null,
  llmAvailable: null,
  isEnrichingFC: false,
};

function buildUnsupportedMessage(mpn: string, subcategory: string): string {
  return `The application's cross-reference logic currently doesn't support **${subcategory}** components. ` +
    `I was able to load the attributes for **${mpn}**, but I can't evaluate replacements without a matching rules table for this category.`;
}

export function useAppState() {
  const [state, setState] = useState<AppState>(initialState);
  // Track conversation history for the LLM orchestrator
  const conversationRef = useRef<OrchestratorMessage[]>([]);
  // Track current recommendations for follow-up LLM calls
  const recsRef = useRef<XrefRecommendation[]>([]);
  // Track full unfiltered recommendations — filters always operate on this set
  const allRecsRef = useRef<XrefRecommendation[]>([]);
  // Track attribute overrides so handleContextResponse can include them
  const pendingOverridesRef = useRef<Record<string, string>>({});
  // Track whether context questions have been asked (ref avoids stale closure)
  const contextAskedRef = useRef(false);
  // Track original search query for search history logging
  const queryRef = useRef<string>('');
  const loggedRef = useRef(false);
  // Abort in-flight requests when switching conversations or resetting
  const abortRef = useRef<AbortController | null>(null);

  /** Cancel any in-flight request and return a fresh AbortSignal. */
  const freshAbort = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    return controller.signal;
  }, []);

  // Keep refs in sync with state for async callbacks
  useEffect(() => {
    recsRef.current = state.recommendations;
  }, [state.recommendations]);
  useEffect(() => {
    allRecsRef.current = state.allRecommendations;
  }, [state.allRecommendations]);

  // Log search when reaching 'viewing' or 'unsupported' phase
  useEffect(() => {
    if ((state.phase === 'viewing' || state.phase === 'unsupported') && !loggedRef.current) {
      loggedRef.current = true;
      logSearch({
        query: queryRef.current,
        sourceMpn: state.sourcePart?.mpn,
        sourceManufacturer: state.sourcePart?.manufacturer,
        sourceCategory: state.sourceAttributes?.part.subcategory,
        recommendationCount: state.recommendations.length,
        phaseReached: state.phase,
      });
    }
    if (state.phase === 'idle') {
      loggedRef.current = false;
    }
  }, [state.phase, state.sourcePart, state.sourceAttributes, state.recommendations]);

  const addMessage = useCallback(
    (
      role: 'user' | 'assistant',
      content: string,
      interactiveElement?: ChatMessage['interactiveElement'],
      variant?: ChatMessage['variant'],
    ) => {
      const msg: ChatMessage = {
        id: crypto.randomUUID(),
        role,
        content,
        timestamp: new Date(),
        variant,
        interactiveElement,
      };
      setState((prev) => ({ ...prev, messages: [...prev.messages, msg] }));
      return msg;
    },
    []
  );

  const setStatus = useCallback((text: string) => {
    setState((prev) => ({ ...prev, statusText: text }));
  }, []);

  /** Rotate through status messages on a timer. Returns cleanup function. */
  const startStatusRotation = useCallback((messages: { text: string; delayMs: number }[]) => {
    const timers: NodeJS.Timeout[] = [];
    if (messages.length > 0) setStatus(messages[0].text);
    for (let i = 1; i < messages.length; i++) {
      const msg = messages[i];
      timers.push(setTimeout(() => setStatus(msg.text), msg.delayMs));
    }
    return () => timers.forEach(clearTimeout);
  }, [setStatus]);

  /** Background FindChips enrichment — merges N-distributor pricing/lifecycle into displayed recs.
   *  Sorts recs by display priority (MFR Certified → 3rd Party → Logic Driven) so the first chunk
   *  contains the MPNs the user sees at the top of the list. Fires chunks in parallel and merges
   *  each as it arrives. Priority chunk is smaller (30) so it finishes quickly even under rate
   *  limiting; remaining 50-MPN chunks fill in after. */
  const triggerFCEnrichment = useCallback(
    (recs: XrefRecommendation[], signal: AbortSignal) => {
      if (recs.length === 0) return;
      const PRIORITY_CHUNK = 30;
      const CHUNK_SIZE = 50;
      const sortedRecs = sortRecommendationsForDisplay(recs);
      const mpns = sortedRecs.map(r => r.part.mpn);
      const chunks: string[][] = [];
      if (mpns.length > 0) chunks.push(mpns.slice(0, PRIORITY_CHUNK));
      for (let i = PRIORITY_CHUNK; i < mpns.length; i += CHUNK_SIZE) {
        chunks.push(mpns.slice(i, i + CHUNK_SIZE));
      }

      setState((prev) => ({ ...prev, isEnrichingFC: true }));

      const chunkPromises = chunks.map(chunk =>
        enrichWithFCBatch(chunk, signal).then((fcData) => {
          if (signal.aborted || Object.keys(fcData).length === 0) return;
          setState((prev) => {
            const enriched = prev.recommendations.map(rec => {
              const data = fcData[rec.part.mpn.toLowerCase()];
              if (!data) return rec;
              return {
                ...rec,
                part: {
                  ...rec.part,
                  supplierQuotes: data.quotes.length > 0 ? data.quotes : rec.part.supplierQuotes,
                  lifecycleInfo: data.lifecycle ? [...(rec.part.lifecycleInfo ?? []), data.lifecycle] : rec.part.lifecycleInfo,
                  complianceData: data.compliance ? [...(rec.part.complianceData ?? []), data.compliance] : rec.part.complianceData,
                },
              };
            });
            return { ...prev, recommendations: enriched, allRecommendations: enriched };
          });
        }).catch(() => { /* individual chunk failures don't abort the batch */ })
      );

      Promise.all(chunkPromises).finally(() => {
        if (!signal.aborted) {
          setState((prev) => ({ ...prev, isEnrichingFC: false }));
        }
      });
    },
    []
  );

  /**
   * Show recommendations immediately, then fire the LLM assessment in the background.
   * This avoids blocking the recommendations panel by 3-8s while the orchestrator responds.
   */
  const showRecsAndDeferAssessment = useCallback(
    (
      recs: XrefRecommendation[],
      mpn: string,
      paramCount: number,
      conversationContext: string,
      signal: AbortSignal,
    ) => {
      // Show recs immediately — panels appear without waiting for LLM
      const summaryMsg = recs.length > 0
        ? `Loaded ${paramCount} parameters · Found **${recs.length} replacement${recs.length !== 1 ? 's' : ''}** for ${mpn}`
        : `No cross-references found for ${mpn}.`;

      addMessage('assistant', summaryMsg);
      setState((prev) => ({ ...prev, phase: 'viewing', recommendations: recs, allRecommendations: recs }));

      // Push context to conversation history for the orchestrator
      conversationRef.current.push({ role: 'user', content: conversationContext });
      conversationRef.current.push({ role: 'assistant', content: summaryMsg });

      // Fire LLM assessment and Mouser enrichment in background (non-blocking)
      if (recs.length > 0) {
        setStatus('Generating engineering assessment...');

        // Background: LLM assessment
        chatWithOrchestrator(conversationRef.current, recs, signal)
          .then((response) => {
            if (signal.aborted) return;
            setStatus('');
            if (response?.message) {
              conversationRef.current.push({ role: 'assistant', content: response.message });
              addMessage('assistant', response.message);
            }
          })
          .catch(() => {
            if (!signal.aborted) setStatus('');
          });

        // Background: FindChips candidate enrichment (pricing / lifecycle / risk).
        triggerFCEnrichment(recs, signal);
      } else {
        setStatus('');
      }
    },
    [addMessage, setStatus, triggerFCEnrichment]
  );

  // ============================================================
  // NEXT-STEP CHOICES (after attributes loaded)
  // ============================================================

  /** After attributes are loaded, pause and offer the user action choices instead of auto-finding recs. */
  const presentNextStepChoices = useCallback(
    (mpn: string, sourceAttrs: PartAttributes, context?: ApplicationContext | null) => {
      const choices: ChoiceOption[] = [
        { id: 'find_xrefs', label: 'Find cross-references', action: 'find_replacements' },
      ];
      addMessage('assistant', `Loaded details for **${mpn}**. Is there anything specific you'd like to know about this part?`, { type: 'choices', choices });
      conversationRef.current.push({
        role: 'assistant',
        content: `Loaded details for ${mpn}. Is there anything specific you'd like to know about this part? Waiting for user to choose next action.`,
      });
      setState((prev) => ({
        ...prev,
        phase: 'awaiting-action' as AppPhase,
        sourceAttributes: sourceAttrs,
        ...(context ? { applicationContext: context } : {}),
      }));
      setStatus('');
    },
    [addMessage, setStatus]
  );

  /** Find replacements for the current source part — triggered by user choosing "Find cross-references".
   *  Checks for missing attributes and context questions first, deferring to forms if needed. */
  const handleFindReplacements = useCallback(
    async () => {
      const signal = freshAbort();
      const mpn = state.sourcePart?.mpn;
      const sourceAttrs = state.sourceAttributes;
      if (!mpn || !sourceAttrs) return;

      // Step 1: Check for missing critical attributes
      const logicTable = getLogicTableForSubcategory(sourceAttrs.part.subcategory, sourceAttrs);
      const missingAttrs = logicTable ? detectMissingAttributes(sourceAttrs, logicTable) : [];
      const criticalMissing = missingAttrs.filter(a => a.weight >= 7);

      if (criticalMissing.length > 0 && missingAttrs.length <= 6) {
        addMessage('assistant', `I'm missing some information that's important for finding accurate replacements.`, {
          type: 'attribute-query',
          missingAttributes: missingAttrs,
          partMpn: mpn,
        });
        conversationRef.current.push({
          role: 'assistant',
          content: `Asking for missing attribute values before finding replacements for ${mpn}.`,
        });
        setState((prev) => ({ ...prev, phase: 'awaiting-attributes' }));
        return; // handleAttributeResponse → handleFindReplacements (re-enters)
      }

      // Step 2: Check for application context questions (if not already asked)
      if (!contextAskedRef.current && logicTable) {
        const contextConfig = getContextQuestionsForFamily(logicTable.familyId);
        if (contextConfig && contextConfig.questions.length > 0) {
          const autoAnswers = deriveAutoAnswers(sourceAttrs, logicTable.familyId);
          const hasAutoAnswers = Object.keys(autoAnswers).length > 0;
          const autoAnswerIds = new Set(Object.keys(autoAnswers));

          const hasVisibleRemaining = contextConfig.questions.some((q) => {
            if (autoAnswerIds.has(q.questionId)) return false;
            if (!q.condition) return true;
            const depAnswer = autoAnswers[q.condition.questionId];
            return depAnswer !== undefined && q.condition.values.includes(depAnswer);
          });

          if (hasVisibleRemaining || !hasAutoAnswers) {
            addMessage('assistant', 'To find the best match, tell me about your application.', {
              type: 'context-questions',
              questions: contextConfig.questions,
              familyId: logicTable.familyId,
              initialAnswers: hasAutoAnswers ? autoAnswers : undefined,
            });
            conversationRef.current.push({
              role: 'assistant',
              content: `Asking application context questions before finding replacements for ${mpn}.`,
            });
            pendingOverridesRef.current = {};
            contextAskedRef.current = true;
            setState((prev) => ({ ...prev, phase: 'awaiting-context' }));
            return; // handleContextResponse → handleFindReplacements (re-enters)
          }

          // All questions auto-answered
          if (hasAutoAnswers) {
            const autoContext: ApplicationContext = { familyId: logicTable.familyId, answers: autoAnswers };
            setState((prev) => ({ ...prev, applicationContext: autoContext }));
            // Continue to find recs with this context
            addMessage('assistant', `Finding cross-references for **${mpn}**...`);
            setStatus('Evaluating candidates against replacement rules...');
            setState((prev) => ({ ...prev, phase: 'finding-matches' as AppPhase }));

            try {
              const overrides = pendingOverridesRef.current;
              const hasOverrides = Object.keys(overrides).length > 0;
              const recs = await getRecommendationsWithOverrides(mpn, hasOverrides ? overrides : {}, autoContext, signal, sourceAttrs);
              if (signal.aborted) return;
              showRecsAndDeferAssessment(recs, mpn, sourceAttrs.parameters.length, `${recs.length} replacement candidates evaluated. Please provide your engineering assessment.`, signal);
            } catch {
              setStatus('');
              addMessage('assistant', 'Something went wrong while finding replacements. Please try again.');
              conversationRef.current.push({ role: 'assistant', content: 'Failed to find replacements due to an error.' });
              setState((prev) => ({ ...prev, phase: 'awaiting-action' as AppPhase }));
            } finally {
              pendingOverridesRef.current = {};
            }
            return;
          }
        }
      }

      // Step 3: Find replacements
      addMessage('assistant', `Finding cross-references for **${mpn}**...`);
      setStatus('Evaluating candidates against replacement rules...');
      setState((prev) => ({ ...prev, phase: 'finding-matches' as AppPhase }));

      try {
        const overrides = pendingOverridesRef.current;
        const hasOverrides = Object.keys(overrides).length > 0;
        const recs = await getRecommendationsWithOverrides(
          mpn,
          hasOverrides ? overrides : {},
          state.applicationContext ?? undefined,
          signal,
          sourceAttrs,
        );
        if (signal.aborted) return;

        const contextMsg = state.applicationContext
          ? `Application context applied. ${recs.length} replacement candidates evaluated. Please provide your engineering assessment.`
          : `${recs.length} replacement candidates evaluated. Please provide your engineering assessment.`;
        showRecsAndDeferAssessment(recs, mpn, sourceAttrs.parameters.length, contextMsg, signal);
      } catch {
        setStatus('');
        addMessage('assistant', 'Something went wrong while finding replacements. Please try again.');
        conversationRef.current.push({ role: 'assistant', content: 'Failed to find replacements due to an error.' });
        setState((prev) => ({ ...prev, phase: 'awaiting-action' as AppPhase }));
      } finally {
        pendingOverridesRef.current = {};
      }
    },
    [addMessage, setStatus, showRecsAndDeferAssessment, state.sourcePart, state.sourceAttributes, state.applicationContext]
  );

  // ============================================================
  // LLM-POWERED SEARCH FLOW
  // ============================================================

  const handleSearchWithLLM = useCallback(
    async (query: string) => {
      const signal = freshAbort();
      addMessage('user', query);
      setStatus('Thinking...');
      setState((prev) => ({
        ...prev,
        phase: prev.sourceAttributes ? prev.phase : 'searching',
      }));

      // Add to conversation history
      conversationRef.current.push({ role: 'user', content: query });

      try {
        const response = await chatWithOrchestrator(
          conversationRef.current,
          allRecsRef.current.length > 0 ? allRecsRef.current : undefined,
          signal,
        );

        if (signal.aborted) return; // conversation switched mid-flight

        // Track assistant response in conversation history
        conversationRef.current.push({ role: 'assistant', content: response.message });

        // Mark LLM as available
        setState((prev) => ({ ...prev, llmAvailable: true }));
        setStatus('');

        // Extract search result if the LLM searched
        const searchResult = response.searchResult;

        // When a new search is initiated, clear stale data from previous part
        if (searchResult) contextAskedRef.current = false;
        const partResetFields = searchResult ? {
          sourcePart: null as AppState['sourcePart'],
          sourceAttributes: null as AppState['sourceAttributes'],
          recommendations: [] as XrefRecommendation[],
          allRecommendations: [] as XrefRecommendation[],
          selectedRecommendation: null as AppState['selectedRecommendation'],
          comparisonAttributes: null as AppState['comparisonAttributes'],
          applicationContext: null as AppState['applicationContext'],
        } : {};

        if (response.choices && response.choices.length > 0) {
          // LLM declared custom choices — render them instead of generic confirm/options
          addMessage('assistant', response.message, { type: 'choices', choices: response.choices });
          setState((prev) => ({ ...prev, ...partResetFields, phase: 'resolving', searchResult: searchResult ?? null }));
        } else if (searchResult && searchResult.type === 'single') {
          // Single match — show as a clickable part card (same as multi-match)
          addMessage('assistant', response.message, { type: 'options', parts: searchResult.matches });
          setState((prev) => ({ ...prev, ...partResetFields, phase: 'resolving', searchResult }));
        } else if (searchResult && searchResult.type === 'multiple') {
          addMessage('assistant', response.message, { type: 'options', parts: searchResult.matches });
          setState((prev) => ({ ...prev, ...partResetFields, phase: 'resolving', searchResult }));
        } else if (searchResult && searchResult.type === 'none') {
          addMessage('assistant', response.message);
          setState((prev) => ({ ...prev, ...partResetFields, phase: 'idle', searchResult: null }));
        } else {
          // No search performed — check if LLM returned filtered recommendations
          addMessage('assistant', response.message);
          const updatedRecs = response.recommendations
            ? Object.values(response.recommendations)[0]
            : undefined;

          if (updatedRecs && updatedRecs.length > 0) {
            // filter_recommendations tool returned results — update the list
            setState((prev) => ({ ...prev, phase: 'viewing', recommendations: updatedRecs }));
          } else {
            // No search, no filtered recs — stay in viewing if we have recs, else idle
            setState((prev) => ({
              ...prev,
              phase: prev.recommendations.length > 0 ? 'viewing' : 'idle',
            }));
          }
        }
      } catch {
        // LLM not available — mark it and fall back
        setStatus('');
        setState((prev) => ({ ...prev, llmAvailable: false }));
        // Remove the conversation entry we just added
        conversationRef.current.pop();
        // Run deterministic fallback (skip adding user message since we already did)
        await handleSearchDeterministic(query, true);
      }
    },
    [addMessage, setStatus]
  );

  const handleConfirmWithLLM = useCallback(
    async (part: PartSummary) => {
      const signal = freshAbort();
      const stopRotation = startStatusRotation([
        { text: 'Checking all data sources...', delayMs: 0 },
        { text: 'Fetching technical attributes...', delayMs: 1200 },
        { text: 'Checking price and availability...', delayMs: 2800 },
        { text: 'Analyzing supply risk...', delayMs: 4500 },
      ]);
      setState((prev) => ({ ...prev, phase: 'loading-attributes', sourcePart: part }));

      // Tell the LLM the user confirmed
      conversationRef.current.push({
        role: 'user',
        content: `Yes, that's the part: ${part.mpn} from ${part.manufacturer}. Please get its attributes and find replacements.`,
      });

      // Step 1: Fetch attributes (fast, direct API)
      const sourceAttrs = await getPartAttributes(part.mpn, signal).catch(() => null);
      stopRotation();
      if (signal.aborted) return; // conversation switched mid-flight

      if (sourceAttrs) {
        // Check if this part family is supported
        if (!isFamilySupported(sourceAttrs.part.subcategory)) {
          setStatus('');
          const unsupportedMsg = buildUnsupportedMessage(part.mpn, sourceAttrs.part.subcategory);
          addMessage('assistant', unsupportedMsg, undefined, 'warning');
          conversationRef.current.push({ role: 'assistant', content: unsupportedMsg });
          setState((prev) => ({
            ...prev,
            phase: 'unsupported',
            sourceAttributes: sourceAttrs,
          }));
          return;
        }

        // Show attributes and offer next action — context questions + missing attrs
        // are deferred until the user clicks "Find cross-references"
        presentNextStepChoices(part.mpn, sourceAttrs);
        return;
      }

      // Attributes failed — full fallback
      if (!sourceAttrs) {
        await loadAttributesAndRecommendations(part);
      }
    },
    [addMessage, setStatus, presentNextStepChoices]
  );

  // ============================================================
  // DETERMINISTIC SEARCH FLOW (fallback when no API key)
  // ============================================================

  const handleSearchDeterministic = useCallback(
    async (query: string, skipUserMessage = false) => {
      if (!skipUserMessage) {
        addMessage('user', query);
        setState((prev) => ({
          ...prev,
          phase: prev.sourceAttributes ? prev.phase : 'searching',
        }));
      }
      setStatus(`Searching for "${query}"...`);

      try {
        const result = await searchParts(query);
        setStatus('');

        if (result.type === 'none') {
          addMessage(
            'assistant',
            `I couldn't find any parts matching "${query}". Please try a different part number or include the manufacturer name.`
          );
          setState((prev) => ({ ...prev, phase: 'idle', searchResult: null }));
        } else if (result.type === 'single') {
          const part = result.matches[0];
          addMessage(
            'assistant',
            `Found **${part.mpn}** from **${part.manufacturer}** — ${part.description}. Is that the part you're looking for?`,
            { type: 'confirmation', part }
          );
          setState((prev) => ({ ...prev, phase: 'resolving', searchResult: result }));
        } else {
          addMessage(
            'assistant',
            `I found ${result.matches.length} possible matches. Which part are you looking for?`,
            { type: 'options', parts: result.matches }
          );
          setState((prev) => ({ ...prev, phase: 'resolving', searchResult: result }));
        }
      } catch {
        setStatus('');
        addMessage('assistant', 'Something went wrong while searching. Please try again.');
        setState((prev) => ({ ...prev, phase: 'idle' }));
      }
    },
    [addMessage, setStatus]
  );

  /** Load attributes + recommendations via direct API calls */
  const loadAttributesAndRecommendations = useCallback(
    async (part: PartSummary) => {
      freshAbort(); // Cancel any in-flight requests
      try {
        const stopRotation = startStatusRotation([
          { text: 'Checking all data sources...', delayMs: 0 },
          { text: 'Fetching technical attributes...', delayMs: 1200 },
          { text: 'Checking price and availability...', delayMs: 2800 },
          { text: 'Analyzing supply risk...', delayMs: 4500 },
        ]);
        const attributes = await getPartAttributes(part.mpn);
        stopRotation();

        // Check if this part family is supported
        if (!isFamilySupported(attributes.part.subcategory)) {
          setStatus('');
          addMessage('assistant', buildUnsupportedMessage(part.mpn, attributes.part.subcategory), undefined, 'warning');
          setState((prev) => ({
            ...prev,
            phase: 'unsupported',
            sourceAttributes: attributes,
          }));
          return;
        }

        // Show attributes and offer next action — context questions + missing attrs
        // are deferred until the user clicks "Find cross-references"
        presentNextStepChoices(part.mpn, attributes);
      } catch {
        setStatus('');
        addMessage('assistant', 'Something went wrong while fetching part details. Please try again.');
        setState((prev) => ({ ...prev, phase: 'idle' }));
      }
    },
    [addMessage, setStatus, presentNextStepChoices]
  );

  const handleConfirmDeterministic = useCallback(
    async (part: PartSummary) => {
      setState((prev) => ({ ...prev, phase: 'loading-attributes', sourcePart: part }));
      await loadAttributesAndRecommendations(part);
    },
    [addMessage, loadAttributesAndRecommendations]
  );

  // ============================================================
  // PUBLIC HANDLERS (route to LLM or deterministic)
  // ============================================================

  const handleSearch = useCallback(
    async (query: string) => {
      queryRef.current = query;
      loggedRef.current = false;
      if (state.llmAvailable === false) {
        await handleSearchDeterministic(query);
      } else {
        await handleSearchWithLLM(query);
      }
    },
    [state.llmAvailable, handleSearchWithLLM, handleSearchDeterministic]
  );

  const handleConfirmPart = useCallback(
    async (part: PartSummary) => {
      if (state.llmAvailable === false) {
        await handleConfirmDeterministic(part);
      } else {
        await handleConfirmWithLLM(part);
      }
    },
    [state.llmAvailable, handleConfirmWithLLM, handleConfirmDeterministic]
  );

  const handleRejectPart = useCallback(() => {
    addMessage('user', 'No, that\'s not the right part.');
    if (state.llmAvailable !== false) {
      conversationRef.current.push({
        role: 'user',
        content: 'No, that\'s not the right part. Let me search again.',
      });
    }
    addMessage(
      'assistant',
      'No problem. Please try searching again with more detail, such as including the manufacturer name.'
    );
    setStatus('');
    setState((prev) => ({ ...prev, phase: 'idle', searchResult: null }));
  }, [addMessage, setStatus, state.llmAvailable]);

  const handleChoiceSelect = useCallback(
    async (choice: ChoiceOption) => {
      if (choice.action === 'confirm_part' && choice.mpn) {
        // Short-circuit: resolve part from current search result and confirm directly.
        // Don't addMessage here — handleConfirmPart already adds a user message.
        const searchMatches = state.searchResult?.matches ?? [];
        const part = searchMatches.find(p => p.mpn === choice.mpn);
        if (part) {
          await handleConfirmPart(part);
          return;
        }
      }

      if (choice.action === 'find_replacements') {
        // Trigger replacement search for the current source part
        addMessage('user', choice.label);
        conversationRef.current.push({ role: 'user', content: 'Find cross-references for this part.' });
        await handleFindReplacements();
        return;
      }

      // Show user's choice in chat
      addMessage('user', choice.label);
      // Send choice label to LLM as a user message
      conversationRef.current.push({ role: 'user', content: choice.label });
      await handleSearchWithLLM(choice.label);
    },
    [addMessage, state.searchResult, handleConfirmPart, handleFindReplacements, handleSearchWithLLM]
  );

  const handleSelectRecommendation = useCallback(async (rec: XrefRecommendation) => {
    setStatus('Fetching replacement specs from Digikey...');
    try {
      const attributes = await getPartAttributes(rec.part.mpn);
      setStatus('');
      setState((prev) => ({
        ...prev,
        phase: 'comparing',
        selectedRecommendation: rec,
        comparisonAttributes: attributes,
      }));
    } catch (err) {
      console.error('[handleSelectRecommendation] Failed to fetch attributes for', rec.part.mpn, err);
      setStatus('');
      setState((prev) => ({
        ...prev,
        phase: 'comparing',
        selectedRecommendation: rec,
        comparisonAttributes: null,
      }));
    }
  }, [setStatus]);

  const handleBackToRecommendations = useCallback(() => {
    setState((prev) => ({
      ...prev,
      phase: 'viewing',
      selectedRecommendation: null,
      comparisonAttributes: null,
    }));
  }, []);

  const handleReset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    conversationRef.current = [];
    contextAskedRef.current = false;
    setStatus('');
    setState(initialState);
  }, [setStatus]);

  // ============================================================
  // MISSING ATTRIBUTES RESPONSE HANDLERS
  // ============================================================

  const handleAttributeResponse = useCallback(
    async (responses: Record<string, string>) => {
      // Filter out empty values
      const overrides = Object.fromEntries(
        Object.entries(responses).filter(([, v]) => v.trim() !== '')
      );
      const filledCount = Object.keys(overrides).length;

      if (filledCount > 0) {
        addMessage('user', `Provided: ${Object.values(overrides).join(', ')}`);
      } else {
        addMessage('user', 'Proceeding without additional information.');
      }

      // Merge overrides into displayed attributes
      if (filledCount > 0) {
        setState((prev) => {
          if (!prev.sourceAttributes) return prev;
          const updatedParams = [...prev.sourceAttributes.parameters];
          for (const [attrId, value] of Object.entries(overrides)) {
            const idx = updatedParams.findIndex(p => p.parameterId === attrId);
            if (idx >= 0) {
              updatedParams[idx] = { ...updatedParams[idx], value, numericValue: undefined };
            } else {
              updatedParams.push({ parameterId: attrId, parameterName: attrId, value, sortOrder: 999 });
            }
          }
          return { ...prev, sourceAttributes: { ...prev.sourceAttributes, parameters: updatedParams } };
        });
      }

      const mpn = state.sourcePart?.mpn;
      if (!mpn) return;

      // Check for application context questions before finding matches
      let autoContext: ApplicationContext | undefined;
      const sourceAttrs = state.sourceAttributes;
      if (sourceAttrs) {
        const logicTableForContext = getLogicTableForSubcategory(sourceAttrs.part.subcategory, sourceAttrs);
        if (logicTableForContext) {
          const contextConfig = getContextQuestionsForFamily(logicTableForContext.familyId);
          if (contextConfig && contextConfig.questions.length > 0) {
            // Auto-answer disambiguation questions when the attribute is already known
            const autoAnswers = deriveAutoAnswers(sourceAttrs, logicTableForContext.familyId);
            const hasAutoAnswers = Object.keys(autoAnswers).length > 0;
            const autoAnswerIds = new Set(Object.keys(autoAnswers));

            const hasVisibleRemaining = contextConfig.questions.some((q) => {
              if (autoAnswerIds.has(q.questionId)) return false;
              if (!q.condition) return true;
              const depAnswer = autoAnswers[q.condition.questionId];
              return depAnswer !== undefined && q.condition.values.includes(depAnswer);
            });

            if (hasVisibleRemaining || !hasAutoAnswers) {
              addMessage('assistant', 'One more thing — let me understand your application to find the best match.', {
                type: 'context-questions',
                questions: contextConfig.questions,
                familyId: logicTableForContext.familyId,
                initialAnswers: hasAutoAnswers ? autoAnswers : undefined,
              });
              conversationRef.current.push({
                role: 'user',
                content: filledCount > 0
                  ? `Attribute overrides provided: ${Object.values(overrides).join(', ')}`
                  : 'Proceeding without additional attribute information.',
              });
              conversationRef.current.push({
                role: 'assistant',
                content: `Received attribute values. Now asking application context questions for ${mpn} before finding replacements.`,
              });
              pendingOverridesRef.current = overrides;
              setState((prev) => ({ ...prev, phase: 'awaiting-context' }));
              return; // Wait for handleContextResponse
            }
            // All questions auto-answered — carry auto-context forward to recommendation call
            if (hasAutoAnswers) {
              autoContext = { familyId: logicTableForContext.familyId, answers: autoAnswers };
            }
          }
        }
      }

      // Attributes answered — now find replacements (will check context questions)
      if (autoContext) {
        setState((prev) => ({ ...prev, applicationContext: autoContext }));
      }
      await handleFindReplacements();
    },
    [addMessage, setStatus, handleFindReplacements, state.sourcePart, state.sourceAttributes]
  );

  const handleSkipAttributes = useCallback(async () => {
    await handleAttributeResponse({});
  }, [handleAttributeResponse]);

  // ============================================================
  // APPLICATION CONTEXT RESPONSE HANDLERS
  // ============================================================

  const handleContextResponse = useCallback(
    async (answers: Record<string, string>) => {
      // Filter out empty answers
      const filteredAnswers = Object.fromEntries(
        Object.entries(answers).filter(([, v]) => v.trim() !== '')
      );
      const filledCount = Object.keys(filteredAnswers).length;

      // Block if any visible required questions are unanswered
      const familyIdForBlock = state.sourceAttributes?.part.subcategory
        ? getLogicTableForSubcategory(state.sourceAttributes.part.subcategory, state.sourceAttributes)?.familyId
        : undefined;
      if (familyIdForBlock) {
        const contextConfig = getContextQuestionsForFamily(familyIdForBlock);
        if (contextConfig) {
          const visibleRequired = contextConfig.questions
            .filter((q) => q.required)
            .filter((q) => {
              if (!q.condition) return true;
              const depAnswer = filteredAnswers[q.condition.questionId];
              return depAnswer !== undefined && q.condition.values.includes(depAnswer);
            });
          const unanswered = visibleRequired.filter((q) => !filteredAnswers[q.questionId]);
          if (unanswered.length > 0) {
            addMessage(
              'assistant',
              `⚠️ Please answer the required question${unanswered.length > 1 ? 's' : ''} before proceeding: ${unanswered.map((q) => `"${q.questionText}"`).join(', ')}`
            );
            return;
          }
        }
      }

      if (filledCount > 0) {
        const labels = Object.values(filteredAnswers);
        addMessage('user', `Application context: ${labels.join(', ')}`);
      } else {
        addMessage('user', 'Proceeding with default matching.');
      }

      const mpn = state.sourcePart?.mpn;
      if (!mpn) return;

      // Build ApplicationContext — always set a value so handleFindReplacements
      // knows context was handled (even if skipped with empty answers)
      const familyId = state.sourceAttributes?.part.subcategory
        ? getLogicTableForSubcategory(state.sourceAttributes.part.subcategory, state.sourceAttributes)?.familyId
        : undefined;

      const context: ApplicationContext = familyId
        ? { familyId, answers: filteredAnswers }
        : { familyId: '', answers: {} };

      // Context answered/skipped — now find replacements
      setState((prev) => ({ ...prev, applicationContext: context }));
      await handleFindReplacements();
    },
    [addMessage, setStatus, handleFindReplacements, state.sourcePart, state.sourceAttributes]
  );

  const handleSkipContext = useCallback(async () => {
    await handleContextResponse({});
  }, [handleContextResponse]);

  // ============================================================
  // CONVERSATION PERSISTENCE HELPERS
  // ============================================================

  const getOrchestratorMessages = useCallback(() => conversationRef.current, []);

  const setConversationId = useCallback((id: string) => {
    setState((prev) => ({ ...prev, conversationId: id }));
  }, []);

  const hydrateState = useCallback((snapshot: ConversationSnapshot) => {
    // Cancel any in-flight async operations from the previous conversation
    abortRef.current?.abort();
    abortRef.current = null;

    conversationRef.current = snapshot.orchestratorMessages;
    recsRef.current = snapshot.recommendations;
    allRecsRef.current = snapshot.recommendations;
    pendingOverridesRef.current = {};
    queryRef.current = snapshot.sourceMpn ?? '';
    loggedRef.current = true; // don't re-log on hydration

    // Recover from transient phases (only valid while an async op is running)
    let phase = snapshot.phase;
    let messages = snapshot.messages;

    const TRANSIENT_PHASES: AppPhase[] = ['searching', 'loading-attributes', 'finding-matches'];
    if (TRANSIENT_PHASES.includes(phase)) {
      // Determine the best safe phase based on available data
      if (phase === 'finding-matches') {
        // Recommendations may not have flushed before the snapshot was written.
        // If we have any, drop the user back into the results view; otherwise
        // park them at the action choices for the source part (or idle if even
        // the source attributes never landed).
        phase = snapshot.recommendations.length > 0
          ? 'viewing'
          : snapshot.sourceAttributes ? 'awaiting-action' : 'idle';
      } else if (phase === 'loading-attributes') {
        phase = snapshot.sourceAttributes ? 'viewing' : snapshot.sourcePart ? 'resolving' : 'idle';
      } else {
        // 'searching' → idle
        phase = 'idle';
      }

      // Append a recovery message
      const recoveryText = phase === 'idle'
        ? 'Your previous search was interrupted. Please search again.'
        : 'Loading was interrupted but your progress has been restored.';

      messages = [
        ...messages,
        {
          id: crypto.randomUUID(),
          role: 'assistant' as const,
          content: recoveryText,
          timestamp: new Date(),
        },
      ];
    }

    // Infer llmAvailable from conversation evidence
    const llmWasUsed = snapshot.orchestratorMessages.length > 0;

    setState({
      conversationId: snapshot.id,
      phase,
      messages,
      statusText: '',
      searchResult: null,
      sourcePart: snapshot.sourcePart,
      sourceAttributes: snapshot.sourceAttributes,
      applicationContext: snapshot.applicationContext,
      recommendations: snapshot.recommendations,
      allRecommendations: snapshot.recommendations,
      selectedRecommendation: snapshot.selectedRecommendation,
      comparisonAttributes: snapshot.comparisonAttributes,
      llmAvailable: llmWasUsed ? true : null,
      isEnrichingFC: false,
    });
  }, []);

  return {
    ...state,
    handleSearch,
    handleConfirmPart,
    handleRejectPart,
    handleChoiceSelect,
    handleSelectRecommendation,
    handleBackToRecommendations,
    handleReset,
    handleAttributeResponse,
    handleSkipAttributes,
    handleContextResponse,
    handleSkipContext,
    getOrchestratorMessages,
    setConversationId,
    hydrateState,
  };
}
