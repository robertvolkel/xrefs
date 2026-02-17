'use client';
import { useState, useCallback, useRef, useEffect } from 'react';
import {
  AppPhase,
  ApplicationContext,
  ChatMessage,
  PartSummary,
  PartAttributes,
  XrefRecommendation,
  SearchResult,
  OrchestratorMessage,
} from '@/lib/types';
import {
  searchParts,
  getPartAttributes,
  getRecommendations,
  getRecommendationsWithOverrides,
  getRecommendationsWithContext,
  chatWithOrchestrator,
} from '@/lib/api';
import { getLogicTableForSubcategory, isFamilySupported, getSupportedFamilyNames } from '@/lib/logicTables';
import { detectMissingAttributes } from '@/lib/services/matchingEngine';
import { getContextQuestionsForFamily } from '@/lib/contextQuestions';
import { logSearch } from '@/lib/supabaseLogger';

interface AppState {
  phase: AppPhase;
  messages: ChatMessage[];
  statusText: string;
  searchResult: SearchResult | null;
  sourcePart: PartSummary | null;
  sourceAttributes: PartAttributes | null;
  applicationContext: ApplicationContext | null;
  recommendations: XrefRecommendation[];
  selectedRecommendation: XrefRecommendation | null;
  comparisonAttributes: PartAttributes | null;
  llmAvailable: boolean | null; // null = not yet checked
}

const initialState: AppState = {
  phase: 'idle',
  messages: [],
  statusText: '',
  searchResult: null,
  sourcePart: null,
  sourceAttributes: null,
  applicationContext: null,
  recommendations: [],
  selectedRecommendation: null,
  comparisonAttributes: null,
  llmAvailable: null,
};

function buildUnsupportedMessage(mpn: string, subcategory: string): string {
  const supported = getSupportedFamilyNames();
  const shortNames = supported.map(n => n.split('–')[0].split('—')[0].trim());
  return `The application's cross-reference logic currently doesn't support **${subcategory}** components. ` +
    `I was able to load the attributes for **${mpn}**, but I can't evaluate replacements without a matching rules table for this category.\n\n` +
    `Supported categories: ${shortNames.join(', ')}.`;
}

export function useAppState() {
  const [state, setState] = useState<AppState>(initialState);
  // Track conversation history for the LLM orchestrator
  const conversationRef = useRef<OrchestratorMessage[]>([]);
  // Track attribute overrides so handleContextResponse can include them
  const pendingOverridesRef = useRef<Record<string, string>>({});
  // Track original search query for search history logging
  const queryRef = useRef<string>('');
  const loggedRef = useRef(false);

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
      interactiveElement?: ChatMessage['interactiveElement']
    ) => {
      const msg: ChatMessage = {
        id: crypto.randomUUID(),
        role,
        content,
        timestamp: new Date(),
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

  // ============================================================
  // LLM-POWERED SEARCH FLOW
  // ============================================================

  const handleSearchWithLLM = useCallback(
    async (query: string) => {
      addMessage('user', query);
      setStatus('Thinking...');
      setState((prev) => ({ ...prev, phase: 'searching' }));

      // Add to conversation history
      conversationRef.current.push({ role: 'user', content: query });

      try {
        const response = await chatWithOrchestrator(conversationRef.current);

        // Track assistant response in conversation history
        conversationRef.current.push({ role: 'assistant', content: response.message });

        // Mark LLM as available
        setState((prev) => ({ ...prev, llmAvailable: true }));
        setStatus('');

        // Extract search result if the LLM searched
        const searchResult = response.searchResult;

        if (searchResult && searchResult.type === 'single') {
          const part = searchResult.matches[0];
          addMessage('assistant', response.message, { type: 'confirmation', part });
          setState((prev) => ({ ...prev, phase: 'resolving', searchResult }));
        } else if (searchResult && searchResult.type === 'multiple') {
          addMessage('assistant', response.message, { type: 'options', parts: searchResult.matches });
          setState((prev) => ({ ...prev, phase: 'resolving', searchResult }));
        } else if (searchResult && searchResult.type === 'none') {
          addMessage('assistant', response.message);
          setState((prev) => ({ ...prev, phase: 'idle', searchResult: null }));
        } else {
          // LLM responded without searching (e.g., asked for clarification)
          addMessage('assistant', response.message);
          setState((prev) => ({ ...prev, phase: 'idle' }));
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
      addMessage('user', `Yes, **${part.mpn}** from ${part.manufacturer}.`);
      setStatus('Fetching specifications from Digikey...');
      setState((prev) => ({ ...prev, phase: 'loading-attributes', sourcePart: part }));

      // Tell the LLM the user confirmed
      conversationRef.current.push({
        role: 'user',
        content: `Yes, that's the part: ${part.mpn} from ${part.manufacturer}. Please get its attributes and find replacements.`,
      });

      // Step 1: Fetch attributes (fast, direct API)
      const sourceAttrs = await getPartAttributes(part.mpn).catch(() => null);

      if (sourceAttrs) {
        // Check if this part family is supported
        if (!isFamilySupported(sourceAttrs.part.subcategory)) {
          setStatus('');
          addMessage('assistant', buildUnsupportedMessage(part.mpn, sourceAttrs.part.subcategory));
          setState((prev) => ({
            ...prev,
            phase: 'unsupported',
            sourceAttributes: sourceAttrs,
          }));
          return;
        }

        // Step 2: Check for missing attributes against the logic table
        const logicTable = getLogicTableForSubcategory(sourceAttrs.part.subcategory);
        const missingAttrs = logicTable ? detectMissingAttributes(sourceAttrs, logicTable) : [];
        const criticalMissing = missingAttrs.filter(a => a.weight >= 7);

        if (criticalMissing.length > 0 && missingAttrs.length <= 6) {
          // Pause and ask user for missing critical attribute values
          setStatus('');
          addMessage('assistant', `Loaded attributes for **${part.mpn}**. I'm missing some information that's important for finding accurate replacements.`, {
            type: 'attribute-query',
            missingAttributes: missingAttrs,
            partMpn: part.mpn,
          });
          setState((prev) => ({
            ...prev,
            phase: 'awaiting-attributes',
            sourceAttributes: sourceAttrs,
          }));
          return; // Wait for handleAttributeResponse
        }

        // Step 2b: Check for application context questions
        const logicTableForContext = getLogicTableForSubcategory(sourceAttrs.part.subcategory);
        if (logicTableForContext) {
          const contextConfig = getContextQuestionsForFamily(logicTableForContext.familyId);
          if (contextConfig && contextConfig.questions.length > 0) {
            setStatus('');
            addMessage('assistant', `Loaded attributes for **${part.mpn}**.`, {
              type: 'context-questions',
              questions: contextConfig.questions,
              familyId: logicTableForContext.familyId,
            });
            pendingOverridesRef.current = {};
            setState((prev) => ({
              ...prev,
              phase: 'awaiting-context',
              sourceAttributes: sourceAttrs,
            }));
            return; // Wait for handleContextResponse
          }
        }

        if (missingAttrs.length > 6) {
          addMessage('assistant', `Loaded attributes for **${part.mpn}**. We have limited data for this part — replacement accuracy may be reduced. Finding cross-references...`);
        } else {
          addMessage('assistant', `Loaded attributes for **${part.mpn}**. Finding cross-references...`);
        }
        setStatus('Evaluating candidates against replacement rules...');
        setState((prev) => ({
          ...prev,
          phase: 'finding-matches',
          sourceAttributes: sourceAttrs,
        }));
      }

      // Step 3: Fire orchestrator for recommendations
      const response = await chatWithOrchestrator(conversationRef.current).catch(() => null);
      setStatus('');
      if (response) {
        conversationRef.current.push({ role: 'assistant', content: response.message });

        const recs = response.recommendations?.[part.mpn];
        if (recs && recs.length > 0) {
          const paramCount = sourceAttrs?.parameters.length ?? 0;
          const assessmentMsg = response.message || `Loaded ${paramCount} parameters · Found **${recs.length} replacement${recs.length !== 1 ? 's' : ''}** for ${part.mpn}`;
          addMessage('assistant', assessmentMsg);
          setState((prev) => ({
            ...prev,
            phase: 'viewing',
            sourceAttributes: sourceAttrs ?? response.attributes?.[part.mpn] ?? prev.sourceAttributes,
            recommendations: recs,
          }));
        } else {
          // Orchestrator didn't return recs — try direct API
          setStatus('Evaluating candidates against replacement rules...');
          const fallbackRecs = await getRecommendations(part.mpn);
          setStatus('');
          if (fallbackRecs.length > 0) {
            addMessage('assistant', response.message || `Found **${fallbackRecs.length} potential replacement${fallbackRecs.length !== 1 ? 's' : ''}** for ${part.mpn}.`);
          } else {
            addMessage('assistant', response.message || `No cross-references found for ${part.mpn}.`);
          }
          setState((prev) => ({
            ...prev,
            phase: 'viewing',
            sourceAttributes: sourceAttrs ?? response.attributes?.[part.mpn] ?? prev.sourceAttributes,
            recommendations: fallbackRecs,
          }));
        }
      } else {
        // Orchestrator failed entirely — fall back to direct recs
        if (!sourceAttrs) {
          // Attributes also failed — full fallback
          await loadAttributesAndRecommendations(part);
          return;
        }
        setStatus('Evaluating candidates against replacement rules...');
        const recs = await getRecommendations(part.mpn);
        setStatus('');
        const paramCount = sourceAttrs.parameters.length;
        addMessage('assistant', `Loaded ${paramCount} parameters · Found **${recs.length} replacement${recs.length !== 1 ? 's' : ''}** for ${part.mpn}`);
        setState((prev) => ({
          ...prev,
          phase: 'viewing',
          recommendations: recs,
        }));
      }
    },
    [addMessage, setStatus]
  );

  // ============================================================
  // DETERMINISTIC SEARCH FLOW (fallback when no API key)
  // ============================================================

  const handleSearchDeterministic = useCallback(
    async (query: string, skipUserMessage = false) => {
      if (!skipUserMessage) {
        addMessage('user', query);
        setState((prev) => ({ ...prev, phase: 'searching' }));
      }
      setStatus(`Searching Digikey for "${query}"...`);

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
      try {
        setStatus('Fetching specifications from Digikey...');
        const attributes = await getPartAttributes(part.mpn);

        // Check if this part family is supported
        if (!isFamilySupported(attributes.part.subcategory)) {
          setStatus('');
          addMessage('assistant', buildUnsupportedMessage(part.mpn, attributes.part.subcategory));
          setState((prev) => ({
            ...prev,
            phase: 'unsupported',
            sourceAttributes: attributes,
          }));
          return;
        }

        // Check for missing attributes against the logic table
        const logicTable = getLogicTableForSubcategory(attributes.part.subcategory);
        const missingAttrs = logicTable ? detectMissingAttributes(attributes, logicTable) : [];
        const criticalMissing = missingAttrs.filter(a => a.weight >= 7);

        if (criticalMissing.length > 0 && missingAttrs.length <= 6) {
          setStatus('');
          addMessage('assistant', `Loaded attributes for **${part.mpn}**. I'm missing some information that's important for finding accurate replacements.`, {
            type: 'attribute-query',
            missingAttributes: missingAttrs,
            partMpn: part.mpn,
          });
          setState((prev) => ({
            ...prev,
            phase: 'awaiting-attributes',
            sourceAttributes: attributes,
          }));
          return; // Wait for handleAttributeResponse
        }

        // Check for application context questions
        const logicTableForContext = getLogicTableForSubcategory(attributes.part.subcategory);
        if (logicTableForContext) {
          const contextConfig = getContextQuestionsForFamily(logicTableForContext.familyId);
          if (contextConfig && contextConfig.questions.length > 0) {
            setStatus('');
            addMessage('assistant', `Loaded attributes for **${part.mpn}**.`, {
              type: 'context-questions',
              questions: contextConfig.questions,
              familyId: logicTableForContext.familyId,
            });
            pendingOverridesRef.current = {};
            setState((prev) => ({
              ...prev,
              phase: 'awaiting-context',
              sourceAttributes: attributes,
            }));
            return; // Wait for handleContextResponse
          }
        }

        if (missingAttrs.length > 6) {
          addMessage('assistant', `Loaded attributes for **${part.mpn}**. We have limited data for this part — replacement accuracy may be reduced. Searching for cross-references...`);
        } else {
          addMessage('assistant', `Loaded attributes for **${part.mpn}**. Searching for cross-references...`);
        }
        setStatus('Evaluating candidates against replacement rules...');
        setState((prev) => ({
          ...prev,
          phase: 'finding-matches',
          sourceAttributes: attributes,
        }));

        const recs = await getRecommendations(part.mpn);
        setStatus('');
        const paramCount = attributes.parameters.length;
        addMessage(
          'assistant',
          `Loaded ${paramCount} parameters · Found **${recs.length} replacement${recs.length !== 1 ? 's' : ''}** for ${part.mpn}`
        );
        setState((prev) => ({
          ...prev,
          phase: 'viewing',
          recommendations: recs,
        }));
      } catch {
        setStatus('');
        addMessage('assistant', 'Something went wrong while fetching part details. Please try again.');
        setState((prev) => ({ ...prev, phase: 'idle' }));
      }
    },
    [addMessage, setStatus]
  );

  const handleConfirmDeterministic = useCallback(
    async (part: PartSummary) => {
      addMessage('user', `Yes, **${part.mpn}** from ${part.manufacturer}.`);
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
    } catch {
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
    conversationRef.current = [];
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
      const sourceAttrs = state.sourceAttributes;
      if (sourceAttrs) {
        const logicTableForContext = getLogicTableForSubcategory(sourceAttrs.part.subcategory);
        if (logicTableForContext) {
          const contextConfig = getContextQuestionsForFamily(logicTableForContext.familyId);
          if (contextConfig && contextConfig.questions.length > 0) {
            addMessage('assistant', 'One more thing — let me understand your application to find the best match.', {
              type: 'context-questions',
              questions: contextConfig.questions,
              familyId: logicTableForContext.familyId,
            });
            pendingOverridesRef.current = overrides;
            setState((prev) => ({ ...prev, phase: 'awaiting-context' }));
            return; // Wait for handleContextResponse
          }
        }
      }

      addMessage('assistant', `Finding cross-references for **${mpn}**...`);
      setStatus('Evaluating candidates against replacement rules...');
      setState((prev) => ({ ...prev, phase: 'finding-matches' as AppPhase }));

      try {
        const recs = filledCount > 0
          ? await getRecommendationsWithOverrides(mpn, overrides)
          : await getRecommendations(mpn);
        setStatus('');
        const paramCount = state.sourceAttributes?.parameters.length ?? 0;
        addMessage(
          'assistant',
          recs.length > 0
            ? `Loaded ${paramCount} parameters · Found **${recs.length} replacement${recs.length !== 1 ? 's' : ''}** for ${mpn}`
            : `No cross-references found for ${mpn}.`
        );
        setState((prev) => ({ ...prev, phase: 'viewing', recommendations: recs }));
      } catch {
        setStatus('');
        addMessage('assistant', 'Something went wrong while finding replacements. Please try again.');
        setState((prev) => ({ ...prev, phase: 'idle' }));
      }
    },
    [addMessage, setStatus, state.sourcePart, state.sourceAttributes]
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

      if (filledCount > 0) {
        const labels = Object.values(filteredAnswers);
        addMessage('user', `Application context: ${labels.join(', ')}`);
      } else {
        addMessage('user', 'Proceeding with default matching.');
      }

      const mpn = state.sourcePart?.mpn;
      if (!mpn) return;

      // Build ApplicationContext if user provided answers
      const familyId = state.sourceAttributes?.part.subcategory
        ? getLogicTableForSubcategory(state.sourceAttributes.part.subcategory)?.familyId
        : undefined;

      const context: ApplicationContext | undefined = filledCount > 0 && familyId
        ? { familyId, answers: filteredAnswers }
        : undefined;

      setState((prev) => ({
        ...prev,
        phase: 'finding-matches' as AppPhase,
        applicationContext: context ?? null,
      }));
      addMessage('assistant', `Finding cross-references for **${mpn}**...`);
      setStatus('Evaluating candidates against replacement rules...');

      try {
        const overrides = pendingOverridesRef.current;
        const hasOverrides = Object.keys(overrides).length > 0;

        let recs: XrefRecommendation[];
        if (hasOverrides || context) {
          recs = await getRecommendationsWithOverrides(
            mpn,
            hasOverrides ? overrides : {},
            context
          );
        } else {
          recs = await getRecommendations(mpn);
        }

        setStatus('');
        const paramCount = state.sourceAttributes?.parameters.length ?? 0;
        addMessage(
          'assistant',
          recs.length > 0
            ? `Loaded ${paramCount} parameters · Found **${recs.length} replacement${recs.length !== 1 ? 's' : ''}** for ${mpn}`
            : `No cross-references found for ${mpn}.`
        );
        setState((prev) => ({ ...prev, phase: 'viewing', recommendations: recs }));
      } catch {
        setStatus('');
        addMessage('assistant', 'Something went wrong while finding replacements. Please try again.');
        setState((prev) => ({ ...prev, phase: 'idle' }));
      } finally {
        pendingOverridesRef.current = {};
      }
    },
    [addMessage, setStatus, state.sourcePart, state.sourceAttributes]
  );

  const handleSkipContext = useCallback(async () => {
    await handleContextResponse({});
  }, [handleContextResponse]);

  return {
    ...state,
    handleSearch,
    handleConfirmPart,
    handleRejectPart,
    handleSelectRecommendation,
    handleBackToRecommendations,
    handleReset,
    handleAttributeResponse,
    handleSkipAttributes,
    handleContextResponse,
    handleSkipContext,
  };
}
