'use client';
import { useState, useCallback, useRef, useEffect } from 'react';
import {
  AppPhase,
  ApplicationContext,
  AttributesTab,
  ChatMessage,
  ChoiceOption,
  ConversationSnapshot,
  PartSummary,
  PartAttributes,
  XrefRecommendation,
  SearchResult,
  OrchestratorMessage,
  hasAnyReplacements,
} from '@/lib/types';
import { computeBestPrice, formatPrice, BestPriceResult } from '@/lib/services/bestPriceCalculator';
import { detectQueryIntent, PendingIntent } from '@/lib/services/intentDetector';
import { detectFilterIntent, detectClearFilterIntent } from '@/lib/services/filterIntentDetector';
import { applyRecommendationFilter } from '@/lib/services/recommendationFilter';
import { buildRecsSummary } from '@/lib/services/recommendationSummary';
import { formatSupplierName } from '@/lib/constants/suppliers';
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
  /** Active tab on the source-part attributes panel — lifted up from
   *  DesktopLayout so chat-message handlers (e.g., Best Spot Price) can
   *  programmatically switch tabs after computing a result. */
  activeAttributesTab: AttributesTab;
  /** When the user's search query telegraphs intent (e.g., "lowest price for
   *  X"), we carry it through the part-confirmation step and auto-fire the
   *  matching action after attributes load — instead of presenting the
   *  generic action menu. Cleared on consumption. */
  pendingIntent: PendingIntent | null;
  /** Effect-based signal that AppShell consumes to open the MFR side panel
   *  programmatically (used by the show_mfr_profile auto-fire path). */
  autoOpenMfr: string | null;
  /** True while a clicked recommendation's full attributes are being fetched.
   *  Drives skeleton placeholders in ComparisonView's Overview/Commercial tabs
   *  so the panel feels responsive at click time instead of frozen for 3-4s. */
  isLoadingComparison: boolean;
  /** Set when the replacement-attributes fetch failed (vs still loading). */
  comparisonError: boolean;
  /** Active filter on the recommendations panel (set by dispatchFilterIntent
   *  or the LLM's filter_recommendations tool). Persists across background
   *  enrichment passes so a filtered panel doesn't snap back to the full set
   *  when parts.io / FC enrichment completes and replaces allRecommendations. */
  currentFilter: import('@/lib/services/recommendationFilter').FilterInput | null;
  currentFilterLabel: string | null;
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
  activeAttributesTab: 'overview',
  pendingIntent: null,
  autoOpenMfr: null,
  isLoadingComparison: false,
  comparisonError: false,
  currentFilter: null,
  currentFilterLabel: null,
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
  // Mirrors state.searchResult so async callbacks can pass the current cards
  // on screen to the LLM orchestrator without needing a render-time read.
  const searchResultRef = useRef<SearchResult | null>(null);
  // Mirrors state.sourceAttributes so the orchestrator gets the canonical
  // supplier/lifecycle/compliance snapshot on every turn (drives
  // summarizeSourcePart()). Without this the LLM fabricates supplier names
  // and prices on follow-up turns.
  const sourceAttributesRef = useRef<PartAttributes | null>(null);
  // When the user's find-replacements query also contains a filter predicate
  // ("show me replacements from Wurth"), stash the original query here so the
  // filter can be auto-applied AFTER recs land — even if the flow detoured
  // through context-question or missing-attribute prompts in between. Cleared
  // on consumption inside showRecsAndDeferAssessment.
  const pendingPostRecsFilterRef = useRef<string | null>(null);
  // Mirror of `pendingIntent` that captures the user's original query string at
  // search time, so when `tryAutoFireIntent` later fires `find_replacements`
  // after part confirmation, any filter qualifier bundled into the original
  // query (e.g. "Chinese replacements for X") gets stashed into
  // `pendingPostRecsFilterRef` and applied once recs land. Without this, the
  // qualifier is lost between search-time intent detection and post-confirm
  // intent dispatch.
  const pendingIntentQueryRef = useRef<string | null>(null);
  // Track attribute overrides so handleContextResponse can include them
  const pendingOverridesRef = useRef<Record<string, string>>({});
  // Track whether context questions have been asked (ref avoids stale closure)
  const contextAskedRef = useRef(false);
  // Track whether the missing-attributes prompt has already been shown this xref cycle
  const attributesAskedRef = useRef(false);
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
  useEffect(() => {
    searchResultRef.current = state.searchResult;
  }, [state.searchResult]);
  useEffect(() => {
    sourceAttributesRef.current = state.sourceAttributes;
  }, [state.sourceAttributes]);

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

  const setActiveAttributesTab = useCallback((tab: AttributesTab) => {
    setState((prev) => ({ ...prev, activeAttributesTab: tab }));
  }, []);

  /** AppShell calls this once it has consumed the autoOpenMfr signal —
   *  clears the field so the effect doesn't refire on subsequent renders. */
  const consumeAutoOpenMfr = useCallback(() => {
    setState((prev) => (prev.autoOpenMfr === null ? prev : { ...prev, autoOpenMfr: null }));
  }, []);

  // Reset to overview whenever the source MPN changes — preserves the prior
  // DesktopLayout-local behavior now that tab state lives here.
  useEffect(() => {
    setState((prev) => (prev.activeAttributesTab === 'overview' ? prev : { ...prev, activeAttributesTab: 'overview' }));
  }, [state.sourcePart?.mpn]);

  // Reset to Overview when the user enters a form / replacement / comparison
  // workflow. The Commercial tab can be lingering from a prior best-price flow
  // (we auto-switch to it when posting a price answer); during the next flow's
  // form-fill or recommendations review, Overview/Specs is the more useful
  // lens. Fires only on entry — transitions BETWEEN flow phases (e.g.,
  // awaiting-context → finding-matches) don't re-reset, so user-driven
  // tab changes mid-flow stick.
  const flowPhases: AppPhase[] = [
    'awaiting-attributes',
    'awaiting-context',
    'finding-matches',
    'viewing',
    'comparing',
  ];
  const prevPhaseRef = useRef<AppPhase | null>(null);
  useEffect(() => {
    const prev = prevPhaseRef.current;
    const next = state.phase;
    prevPhaseRef.current = next;
    const enteringFlow = flowPhases.includes(next) && !flowPhases.includes(prev as AppPhase);
    if (enteringFlow) {
      setState((s) => (s.activeAttributesTab === 'overview' ? s : { ...s, activeAttributesTab: 'overview' }));
    }
  }, [state.phase]); // eslint-disable-line react-hooks/exhaustive-deps

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
            // Enrich against the FULL source (allRecommendations), NOT the
            // currently-displayed subset — otherwise filtered-out recs would
            // be permanently dropped from the source set on every chunk.
            const enrichedFull = prev.allRecommendations.map(rec => {
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
            // Re-derive the visible subset from the active filter so a
            // narrowed panel survives the chunk update.
            const visible = prev.currentFilter
              ? applyRecommendationFilter(enrichedFull, prev.currentFilter)
              : enrichedFull;
            recsRef.current = visible;
            allRecsRef.current = enrichedFull;
            return { ...prev, recommendations: visible, allRecommendations: enrichedFull };
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

  /** Background distributor-count enrichment for chat-search picker cards.
   *  Cards render immediately from `searchParts()` with `distributorCount` populated only
   *  for MPNs warm in the L2 cache. This helper closes the gap: fires FC for the
   *  remaining MPNs in parallel (5× concurrency, server-side rate-limited) and merges the
   *  count into the matching message. Fire-and-forget; never blocks search rendering. */
  const triggerSearchDistributorEnrichment = useCallback(
    (messageId: string, parts: PartSummary[]) => {
      const gapMpns = parts
        .filter((p) => typeof p.distributorCount !== 'number')
        .map((p) => p.mpn);
      if (gapMpns.length === 0) return;

      enrichWithFCBatch(gapMpns)
        .then((fcData) => {
          if (Object.keys(fcData).length === 0) return;
          const mergeCount = (p: PartSummary): PartSummary => {
            if (typeof p.distributorCount === 'number') return p;
            const data = fcData[p.mpn.toLowerCase()];
            const count = data?.quotes?.length ?? 0;
            if (count <= 0) return p;
            return { ...p, distributorCount: count };
          };
          setState((prev) => {
            // Merge counts into the message that holds the cards (so the chip
            // chip fades in) AND into prev.searchResult.matches (so the LLM
            // sees fresh counts on its next call). Both must stay in sync —
            // searchResultRef mirrors prev.searchResult, and that's what gets
            // passed to the orchestrator on each message.
            const messages = prev.messages.map((msg) => {
              if (msg.id !== messageId) return msg;
              const el = msg.interactiveElement;
              if (!el || el.type !== 'options' || !el.parts) return msg;
              return { ...msg, interactiveElement: { ...el, parts: el.parts.map(mergeCount) } };
            });
            const searchResult = prev.searchResult
              ? { ...prev.searchResult, matches: prev.searchResult.matches.map(mergeCount) }
              : prev.searchResult;
            return { ...prev, messages, searchResult };
          });
        })
        .catch(() => { /* FC down → cards stay un-badged */ });
    },
    [],
  );

  /** Background parts.io enrichment (Option 2). The fast initial recommendation call runs
   *  with `skipPartsioEnrichment: true` so candidates score on Digikey-only attributes; here
   *  we re-fire the same call without the flag, server enriches every Digikey candidate from
   *  parts.io (~500-1500ms), and we replace recs in place. After replacement we re-fire FC
   *  enrichment — its L1 cache is warm so the merge is effectively free. */
  const triggerPartsioEnrichment = useCallback(
    (
      args: { mpn: string; overrides: Record<string, string>; applicationContext?: ApplicationContext; sourceAttributes?: PartAttributes },
      signal: AbortSignal,
    ) => {
      getRecommendationsWithOverrides(
        args.mpn,
        args.overrides,
        args.applicationContext,
        signal,
        args.sourceAttributes,
        undefined,
        false /* run parts.io enrichment */,
      )
        .then((enrichedRecs) => {
          if (signal.aborted || enrichedRecs.length === 0) return;
          // allRecsRef always tracks the full source; recsRef tracks the
          // displayed subset (filter-aware).
          allRecsRef.current = enrichedRecs;
          setState((prev) => {
            const visible = prev.currentFilter
              ? applyRecommendationFilter(enrichedRecs, prev.currentFilter)
              : enrichedRecs;
            recsRef.current = visible;
            return { ...prev, recommendations: visible, allRecommendations: enrichedRecs };
          });
          // Re-merge FC commercial data into the replaced recs (cache hit → instant).
          triggerFCEnrichment(enrichedRecs, signal);
        })
        .catch(() => { /* parts.io down → keep Digikey-only recs */ });
    },
    [triggerFCEnrichment],
  );

  /**
   * Show recommendations immediately, then fire the LLM assessment in the background.
   * This avoids blocking the recommendations panel by 3-8s while the orchestrator responds.
   */
  const showRecsAndDeferAssessment = useCallback(
    (
      recs: XrefRecommendation[],
      mpn: string,
      conversationContext: string,
      signal: AbortSignal,
      opts?: {
        deferredPartsio?: { mpn: string; overrides: Record<string, string>; applicationContext?: ApplicationContext; sourceAttributes?: PartAttributes };
      },
    ) => {
      // Show recs immediately — panels appear without waiting for LLM. The
      // success summary ("Loaded N · Found M") is omitted from chat: the LLM
      // assessment that follows restates the same info. The empty-result case
      // is still a persistent chat message since no LLM follow-up arrives.
      if (recs.length === 0) {
        addMessage('assistant', `No cross-references found for ${mpn}.`);
      }
      // Sync-update the refs alongside setState. The useEffect-based mirroring
      // lags by one render, so any code that reads recsRef/allRecsRef
      // immediately after `await` on this path (notably the chained filter in
      // handleSearch) would otherwise see stale empty arrays. Also clear any
      // active filter — a fresh recs load is a clean slate.
      recsRef.current = recs;
      allRecsRef.current = recs;
      setState((prev) => ({
        ...prev,
        phase: 'viewing',
        recommendations: recs,
        allRecommendations: recs,
        currentFilter: null,
        currentFilterLabel: null,
      }));

      // (Conversation-history trigger push removed — it was bait for the
      // post-recs LLM assessment that lived here previously. Future LLM
      // follow-ups via handleSearchWithLLM still see rec context on each
      // call via summarizeRecommendations(), so dropping the trigger does
      // not lose visibility. `conversationContext` is unused now but kept on
      // the signature to avoid touching every call site.)
      void conversationContext;

      // Deferred filter consumption: when the user's original find-replacements
      // query also bundled a filter predicate ("show me replacements from Wurth"),
      // apply it now that recs are actually loaded. This survives the context-
      // question gate, the missing-attributes gate, and any other interactive
      // detour that handleFindReplacements might take before recs land — those
      // detours would otherwise leave the inline-chain logic in handleSearch
      // running against an empty allRecsRef. Cleared here regardless of whether
      // a filter actually matched, so a stale stash from a prior turn doesn't
      // bleed into a fresh recs load.
      const stashedFilterQuery = pendingPostRecsFilterRef.current;
      pendingPostRecsFilterRef.current = null;
      // assessmentRecs is what the LLM sees in summarizeRecommendations(). When
      // a bundled filter is active (e.g. "Chinese replacements"), we MUST hand
      // the LLM the same filtered slice the user sees in the panel — otherwise
      // the unfiltered Top 5 leaks Western MFRs into the assessment prose,
      // contradicting the panel and inviting "Rubycon (Japan-based but…)"
      // hallucinations downstream.
      let assessmentRecs = recs;
      if (stashedFilterQuery && recs.length > 0) {
        const filterIntent = detectFilterIntent(stashedFilterQuery, recs);
        if (filterIntent) {
          dispatchFilterIntent(filterIntent.filterInput, filterIntent.label, stashedFilterQuery, { echoUserMessage: false });
          assessmentRecs = applyRecommendationFilter(recs, filterIntent.filterInput);
        }
      }

      if (recs.length > 0) {
        // Post a deterministic 1-2 line summary in chat. The previous LLM
        // assessment that ran here proved unreliable — three rounds of
        // system-prompt tightening could not stop Sonnet from fabricating
        // MFR origin / cert / supply-chain claims that were never in the
        // recommendation block. Every value in the deterministic summary
        // traces back to a card the user can see, so by construction it
        // cannot fabricate. When a bundled filter matched, dispatchFilterIntent
        // already posted "Filtered to N <label> replacements + Top picks"
        // which serves the same role — skip the deterministic summary then
        // to avoid double-posting.
        const filterApplied = assessmentRecs !== recs;
        if (!filterApplied) {
          const summary = buildRecsSummary(assessmentRecs, mpn);
          addMessage('assistant', summary);
          conversationRef.current.push({ role: 'assistant', content: summary });
        }
        setStatus('');

        // Background: FindChips candidate enrichment (pricing / lifecycle / risk).
        triggerFCEnrichment(recs, signal);

        // Background: parts.io candidate enrichment (parametric gap-fill + rescore).
        if (opts?.deferredPartsio) {
          triggerPartsioEnrichment(opts.deferredPartsio, signal);
        }
      } else {
        setStatus('');
      }
    },
    [addMessage, setStatus, triggerFCEnrichment, triggerPartsioEnrichment]
  );

  // ============================================================
  // NEXT-STEP CHOICES (after attributes loaded)
  // ============================================================

  /** After attributes are loaded, pause and offer the user action choices instead of auto-finding recs. */
  const presentNextStepChoices = useCallback(
    (mpn: string, sourceAttrs: PartAttributes, context?: ApplicationContext | null) => {
      // Build contextual action buttons from the server-side capability preflight.
      // Each button only appears when its capability has actual data behind it;
      // user clicks dead-end into "no info" otherwise. The user-facing message
      // stays neutral so we don't lead with any specific capability — the
      // buttons are the affordance. The LLM gets the partCapabilities flags via
      // the get_part_attributes tool result and the history note below, so it
      // can decline gracefully if asked for something the buttons didn't offer.
      const caps = sourceAttrs.partCapabilities;
      const choices: ChoiceOption[] = [];
      if (caps?.bestPrice) {
        choices.push({
          id: 'show_best_price',
          label: 'Best Spot Price',
          action: 'show_best_price',
        });
      }
      if (caps?.mfrProfile) {
        choices.push({
          id: 'show_mfr_profile',
          label: `${sourceAttrs.part.manufacturer}'s Profile`,
          action: 'show_mfr_profile',
        });
      }
      if (hasAnyReplacements(sourceAttrs)) {
        choices.push({
          id: 'find_xrefs',
          label: 'Replacement Options',
          action: 'find_replacements',
        });
      }
      const interactive = choices.length > 0
        ? { type: 'choices' as const, choices }
        : undefined;
      const message = `Got it — loaded the basics for **${mpn}**. What would you like to explore?`;
      const offered = choices.map(c => c.label).join(', ') || 'none';
      const historyContent = `Loaded details for ${mpn}. Offered buttons: [${offered}]. Open-ended turn — user may also ask about specs, lifecycle, manufacturer, or supply. partCapabilities=${JSON.stringify(caps ?? {})}.`;
      addMessage('assistant', message, interactive);
      conversationRef.current.push({ role: 'assistant', content: historyContent });
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
    // `contextOverride` bypasses the React stale-closure trap: callers that
    // setState({applicationContext}) and immediately call this function
    // cannot rely on state.applicationContext being updated yet (Decision
    // #155 regression — without it, the domain filter sees null context and
    // never runs on the main search flow).
    //
    // `partOverride` solves the same trap for sourcePart / sourceAttributes
    // on the auto-fire path: handleConfirmWithLLM does setState({sourcePart})
    // then awaits getPartAttributes then synchronously calls dispatchIntent
    // → handleFindReplacements. The captured closure still sees the pre-confirm
    // state where both are null, so without this override the function bails
    // at the guard below and the user's chat freezes mid-flight (no context
    // questions, no recs, no error message).
    async (
      contextOverride?: ApplicationContext | null,
      partOverride?: { mpn: string; sourceAttributes: PartAttributes },
    ) => {
      const signal = freshAbort();
      const mpn = partOverride?.mpn ?? state.sourcePart?.mpn;
      const sourceAttrs = partOverride?.sourceAttributes ?? state.sourceAttributes;
      if (!mpn || !sourceAttrs) return;
      const effectiveContext = contextOverride ?? state.applicationContext ?? undefined;

      // Family-support gate — only surfaces once the user actually asks for
      // replacements, per orchestrator system prompt.
      if (!isFamilySupported(sourceAttrs.part.subcategory)) {
        setStatus('');
        const unsupportedMsg = buildUnsupportedMessage(mpn, sourceAttrs.part.subcategory);
        addMessage('assistant', unsupportedMsg, undefined, 'warning');
        conversationRef.current.push({ role: 'assistant', content: unsupportedMsg });
        setState((prev) => ({ ...prev, phase: 'unsupported' }));
        return;
      }

      // Step 1: Check for missing critical attributes
      const logicTable = getLogicTableForSubcategory(sourceAttrs.part.subcategory, sourceAttrs);
      const missingAttrs = logicTable ? detectMissingAttributes(sourceAttrs, logicTable) : [];
      const criticalMissing = missingAttrs.filter(a => a.weight >= 7);

      if (!attributesAskedRef.current && criticalMissing.length > 0 && missingAttrs.length <= 6) {
        addMessage('assistant', `I'm missing some information that's important for finding accurate replacements.`, {
          type: 'attribute-query',
          missingAttributes: missingAttrs,
          partMpn: mpn,
        });
        conversationRef.current.push({
          role: 'assistant',
          content: `Asking for missing attribute values before finding replacements for ${mpn}.`,
        });
        attributesAskedRef.current = true;
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
            // Continue to find recs with this context — status only, no chat bubble
            setStatus(`Finding cross-references for ${mpn}…`);
            setState((prev) => ({ ...prev, phase: 'finding-matches' as AppPhase }));

            try {
              const overrides = pendingOverridesRef.current;
              const hasOverrides = Object.keys(overrides).length > 0;
              const recs = await getRecommendationsWithOverrides(mpn, hasOverrides ? overrides : {}, autoContext, signal, sourceAttrs, undefined, true /* skipPartsioEnrichment — deferred */);
              if (signal.aborted) return;
              showRecsAndDeferAssessment(recs, mpn, `${recs.length} replacement candidates evaluated. Please provide your engineering assessment.`, signal, {
                deferredPartsio: { mpn, overrides: hasOverrides ? overrides : {}, applicationContext: autoContext, sourceAttributes: sourceAttrs },
              });
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

      // Step 3: Find replacements — status only, no chat bubble
      setStatus(`Finding cross-references for ${mpn}…`);
      setState((prev) => ({ ...prev, phase: 'finding-matches' as AppPhase }));

      try {
        const overrides = pendingOverridesRef.current;
        const hasOverrides = Object.keys(overrides).length > 0;
        const recs = await getRecommendationsWithOverrides(
          mpn,
          hasOverrides ? overrides : {},
          effectiveContext ?? undefined,
          signal,
          sourceAttrs,
          undefined,
          true /* skipPartsioEnrichment — deferred */,
        );
        if (signal.aborted) return;

        const contextMsg = effectiveContext
          ? `Application context applied. ${recs.length} replacement candidates evaluated. Please provide your engineering assessment.`
          : `${recs.length} replacement candidates evaluated. Please provide your engineering assessment.`;
        showRecsAndDeferAssessment(recs, mpn, contextMsg, signal, {
          deferredPartsio: { mpn, overrides: hasOverrides ? overrides : {}, applicationContext: effectiveContext ?? undefined, sourceAttributes: sourceAttrs },
        });
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

  /** Core dispatch for a known intent against a loaded source part. Used by
   *  both confirmation-time (initial-search shortcut) and follow-up-time (chat
   *  message after part is already loaded) entry points. Returns true when the
   *  intent was served; false if the requested capability isn't available
   *  (caller decides whether to fall through to the generic menu or hand off
   *  to the LLM). The two callers differ only in framing — confirmation-time
   *  uses "Got it — MPN loaded. What quantity?", follow-up time uses just
   *  "What quantity?" (the part is already on screen). */
  const dispatchIntent = useCallback(
    async (
      intent: PendingIntent,
      mpn: string,
      sourceAttrs: PartAttributes,
      mode: 'fresh' | 'followup' = 'fresh',
    ): Promise<boolean> => {
      const caps = sourceAttrs.partCapabilities;
      const partLabel = mode === 'fresh' ? `Got it — **${mpn}** loaded. ` : '';

      if (intent === 'best_price') {
        if (!caps?.bestPrice) {
          addMessage(
            'assistant',
            `Couldn't find supplier pricing for **${mpn}**.`,
          );
          return false;
        }
        setState((prev) => ({
          ...prev,
          phase: 'awaiting-action' as AppPhase,
          sourceAttributes: sourceAttrs,
        }));
        addMessage(
          'assistant',
          `${partLabel}What quantity? Pick a common tier or type a custom number.`,
          { type: 'quantity-prompt', presets: [1, 10, 100, 1_000, 10_000, 100_000], status: 'pending' },
        );
        setStatus('');
        return true;
      }

      if (intent === 'find_replacements') {
        if (!hasAnyReplacements(sourceAttrs)) {
          addMessage(
            'assistant',
            `No replacement coverage for **${mpn}** — no rules table for this category and no certified crosses available.`,
          );
          return false;
        }
        // Sync-prime sourceAttributesRef before handleFindReplacements runs:
        // showRecsAndDeferAssessment + the LLM-assessment background path read
        // it for source-part context on the chat call. The useEffect mirror at
        // line 167 lags by one render, so on the auto-fire path the ref would
        // otherwise still be null when those downstream paths fire.
        sourceAttributesRef.current = sourceAttrs;
        setState((prev) => ({
          ...prev,
          phase: 'awaiting-action' as AppPhase,
          sourceAttributes: sourceAttrs,
        }));
        // Pass mpn + sourceAttrs through partOverride to bypass the
        // stale-closure trap on state.sourcePart / state.sourceAttributes.
        await handleFindReplacements(undefined, { mpn, sourceAttributes: sourceAttrs });
        return true;
      }

      if (intent === 'show_mfr_profile') {
        if (!caps?.mfrProfile) {
          addMessage(
            'assistant',
            `No detailed profile available for **${sourceAttrs.part.manufacturer}**.`,
          );
          return false;
        }
        setState((prev) => ({
          ...prev,
          phase: 'awaiting-action' as AppPhase,
          sourceAttributes: sourceAttrs,
          autoOpenMfr: sourceAttrs.part.manufacturer,
        }));
        addMessage(
          'assistant',
          `${partLabel}Opening **${sourceAttrs.part.manufacturer}**'s profile.`,
        );
        setStatus('');
        return true;
      }

      return false;
    },
    [addMessage, setStatus, handleFindReplacements],
  );

  /** Consume `pendingIntent` after part attributes load (initial-search path). */
  const tryAutoFireIntent = useCallback(
    async (mpn: string, sourceAttrs: PartAttributes): Promise<boolean> => {
      const intent = state.pendingIntent;
      if (!intent) return false;
      const stashedQuery = pendingIntentQueryRef.current;
      pendingIntentQueryRef.current = null;
      setState((prev) => ({ ...prev, pendingIntent: null }));
      // Carry bundled filter qualifier ("Chinese", "≥80%", etc.) through to
      // showRecsAndDeferAssessment, which runs detectFilterIntent on the
      // stashed query once recs land. Only meaningful for find_replacements
      // (the only intent that produces a recs panel to filter).
      if (intent === 'find_replacements' && stashedQuery) {
        pendingPostRecsFilterRef.current = stashedQuery;
      }
      return dispatchIntent(intent, mpn, sourceAttrs, 'fresh');
    },
    [state.pendingIntent, dispatchIntent],
  );

  /** Apply a filter intent to the current recommendations panel + chat. Used
   *  by the follow-up interception path so "show only Würth" / "only AEC-Q200"
   *  / "hide obsolete" / etc. update the panel deterministically instead of
   *  going through the LLM (which keeps prose-listing without calling the
   *  filter_recommendations tool). Mirrors the chat output the LLM SHOULD have
   *  produced — "Filtered to N {label}. Top picks: ..." — so the follow-up
   *  feels conversational, not robotic. */
  const dispatchFilterIntent = useCallback(
    (
      filterInput: import('@/lib/services/recommendationFilter').FilterInput,
      label: string,
      query: string,
      opts?: { echoUserMessage?: boolean },
    ) => {
      // When chained after another action (e.g., find_replacements that
      // already pushed the user's query), skip the echo so the chat doesn't
      // show the same user message twice.
      const echoUserMessage = opts?.echoUserMessage !== false;
      if (echoUserMessage) {
        addMessage('user', query);
        conversationRef.current.push({ role: 'user', content: query });
      }

      const sourceRecs = allRecsRef.current;
      const filtered = applyRecommendationFilter(sourceRecs, filterInput);

      if (filtered.length === 0) {
        addMessage(
          'assistant',
          `No matches in the current ${sourceRecs.length} recommendations for **${label}**. Want me to broaden the search?`,
        );
        return;
      }

      // Update the panel — both visible recs and conversation-history note for
      // the LLM (so future turns see the filtered count, not the original).
      // Sync-update recsRef alongside (allRecsRef stays at the full source so
      // subsequent filter requests narrow from the original 78, not the
      // already-filtered subset). Also persist the active filter to state so
      // background enrichment paths (parts.io re-enrichment, FC chunks) can
      // re-apply it when they replace the full recs set — without this, the
      // user sees the panel snap back to all-78 a second after filtering.
      recsRef.current = filtered;
      setState((prev) => ({ ...prev, recommendations: filtered, currentFilter: filterInput, currentFilterLabel: label }));

      const top3 = filtered.slice(0, 3);
      const headline = `Filtered to **${filtered.length}** ${label} replacement${filtered.length === 1 ? '' : 's'}.`;
      const lines: string[] = [headline];
      if (top3.length > 0) {
        lines.push('', 'Top picks:');
        for (const r of top3) {
          const status = r.part.status ? ` — ${r.part.status}` : '';
          lines.push(`- **${r.part.mpn}** (${r.matchPercentage.toFixed(0)}%)${status}`);
        }
      }
      const message = lines.join('\n');
      addMessage('assistant', message);
      conversationRef.current.push({
        role: 'assistant',
        content: `Filtered the recommendations panel to ${filtered.length} ${label} (from ${sourceRecs.length}). The user can see the narrowed cards now.`,
      });
    },
    [addMessage],
  );

  /** Clear the active filter on the recommendations panel — restores the
   *  full set. No-op (with a friendly chat note) when no filter is active. */
  const dispatchClearFilter = useCallback((query: string) => {
    addMessage('user', query);
    conversationRef.current.push({ role: 'user', content: query });

    const fullRecs = allRecsRef.current;
    setState((prev) => {
      if (!prev.currentFilter) {
        addMessage(
          'assistant',
          `No filter is currently applied — showing all ${prev.allRecommendations.length} recommendations.`,
        );
        return prev;
      }
      recsRef.current = fullRecs;
      addMessage(
        'assistant',
        `Filter cleared — showing all **${fullRecs.length}** recommendations.`,
      );
      conversationRef.current.push({
        role: 'assistant',
        content: `Cleared the recommendations filter; panel now shows all ${fullRecs.length} cards.`,
      });
      return {
        ...prev,
        recommendations: fullRecs,
        currentFilter: null,
        currentFilterLabel: null,
      };
    });
  }, [addMessage]);

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
          searchResultRef.current ?? undefined,
          sourceAttributesRef.current ?? undefined,
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
        if (searchResult) {
          contextAskedRef.current = false;
          attributesAskedRef.current = false;
        }
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
          const msg = addMessage('assistant', response.message, { type: 'options', parts: searchResult.matches });
          triggerSearchDistributorEnrichment(msg.id, searchResult.matches);
          setState((prev) => ({ ...prev, ...partResetFields, phase: 'resolving', searchResult }));
        } else if (searchResult && searchResult.type === 'multiple') {
          const msg = addMessage('assistant', response.message, { type: 'options', parts: searchResult.matches });
          triggerSearchDistributorEnrichment(msg.id, searchResult.matches);
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
    [addMessage, setStatus, triggerSearchDistributorEnrichment]
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
        // If the user's original query telegraphed an intent (e.g., "lowest
        // price for X"), skip the generic action menu and fire that action
        // directly. tryAutoFireIntent returns false when the intent can't be
        // served (capability missing) and falls through to the regular menu
        // with a one-line note in chat.
        const handled = await tryAutoFireIntent(part.mpn, sourceAttrs);
        if (!handled) presentNextStepChoices(part.mpn, sourceAttrs);
        return;
      }

      // Attributes failed — full fallback
      if (!sourceAttrs) {
        await loadAttributesAndRecommendations(part);
      }
    },
    [addMessage, setStatus, presentNextStepChoices, tryAutoFireIntent]
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
          const msg = addMessage(
            'assistant',
            `I found ${result.matches.length} possible matches. Which part are you looking for?`,
            { type: 'options', parts: result.matches }
          );
          triggerSearchDistributorEnrichment(msg.id, result.matches);
          setState((prev) => ({ ...prev, phase: 'resolving', searchResult: result }));
        }
      } catch {
        setStatus('');
        addMessage('assistant', 'Something went wrong while searching. Please try again.');
        setState((prev) => ({ ...prev, phase: 'idle' }));
      }
    },
    [addMessage, setStatus, triggerSearchDistributorEnrichment]
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

        // Mirror the LLM-flow shortcut — if pendingIntent is set, skip the
        // generic action menu and fire what the user asked for.
        const handled = await tryAutoFireIntent(part.mpn, attributes);
        if (!handled) presentNextStepChoices(part.mpn, attributes);
      } catch {
        setStatus('');
        addMessage('assistant', 'Something went wrong while fetching part details. Please try again.');
        setState((prev) => ({ ...prev, phase: 'idle' }));
      }
    },
    [addMessage, setStatus, presentNextStepChoices, tryAutoFireIntent]
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
      const intent = detectQueryIntent(query);
      const sourceAttrs = sourceAttributesRef.current;
      const sourcePart = state.sourcePart;
      const currentRecs = allRecsRef.current;

      // Filter-intent shortcut takes PRIORITY when recs are already loaded.
      // Without this, "show only Würth replacements" matches both find_replacements
      // (because of "replacements") AND the manufacturer filter — and the older
      // ordering let find_replacements win, re-running the matching engine and
      // silently dropping the manufacturer filter. If recs exist on screen, the
      // user can't be asking for a fresh xref run; they want to narrow what's
      // already there.
      if (currentRecs.length > 0) {
        // Clear-filter intent FIRST — phrasings like "remove the wurth filter"
        // or "show me all the MFRs again" mention a manufacturer name + the
        // word "filter", which would otherwise misfire as a fresh apply-filter
        // request and re-narrow to the same MFR (the bug we just hit).
        if (detectClearFilterIntent(query)) {
          dispatchClearFilter(query);
          return;
        }
        const filterIntent = detectFilterIntent(query, currentRecs);
        if (filterIntent) {
          dispatchFilterIntent(filterIntent.filterInput, filterIntent.label, query);
          return;
        }
      }

      // Follow-up intent shortcut: when a part is already loaded and the user
      // types a message that pattern-matches a known capability ("show me
      // replacements", "best price", "tell me about the manufacturer"),
      // dispatch the action client-side and skip the LLM round-trip entirely.
      if (intent && sourceAttrs && sourcePart) {
        // Stash the query for deferred filter application BEFORE dispatching.
        // For find_replacements, the dispatched flow may detour through context
        // questions / missing-attribute prompts before recs actually load —
        // showRecsAndDeferAssessment consumes this stash when recs land, so
        // bundled predicates ("from Wurth") survive the detour.
        if (intent === 'find_replacements') {
          pendingPostRecsFilterRef.current = query;
        }
        addMessage('user', query);
        conversationRef.current.push({ role: 'user', content: query });
        const dispatched = await dispatchIntent(intent, sourcePart.mpn, sourceAttrs, 'followup');
        if (dispatched) return;
        // Capability missing — dispatchIntent has already shown a one-line note.
        // Clear the stash so a stale predicate doesn't re-fire on the next recs load.
        pendingPostRecsFilterRef.current = null;
        // Fall through to LLM so it can engage with the user's question (e.g.,
        // explain why coverage is missing, suggest related actions).
      }

      // Pattern-detect user intent so the post-confirmation flow can skip the
      // generic action menu and go straight to what the user asked for. Cleared
      // either when consumed in handleConfirmPart or on the next reset. Stash
      // the raw query alongside so any bundled filter qualifier ("Chinese", "≥80%")
      // survives to the post-recs filter step in showRecsAndDeferAssessment.
      pendingIntentQueryRef.current = intent ? query : null;
      setState((prev) => ({ ...prev, pendingIntent: intent }));
      if (state.llmAvailable === false) {
        await handleSearchDeterministic(query);
      } else {
        await handleSearchWithLLM(query);
      }
    },
    [state.llmAvailable, state.sourcePart, addMessage, dispatchIntent, dispatchFilterIntent, dispatchClearFilter, handleSearchWithLLM, handleSearchDeterministic]
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

  /** Mark a quantity-prompt message as submitted with the chosen qty. The
   *  prompt collapses to a single "Qty: N" pill in place of the chips/input,
   *  so chat history stays clean without echoing the choice as a user message. */
  const lockQuantityPrompt = useCallback((messageId: string | undefined, submittedQty: number) => {
    setState((prev) => ({
      ...prev,
      messages: prev.messages.map((m) => {
        if (messageId && m.id !== messageId) return m;
        const el = m.interactiveElement;
        if (!el || el.type !== 'quantity-prompt' || el.status === 'submitted') return m;
        return { ...m, interactiveElement: { ...el, status: 'submitted' as const, submittedQty } };
      }),
    }));
  }, []);

  /** Mark the choices-interactive element on the most recent assistant message
   *  whose choices contain the given choice id. Replaces the user-echo pattern
   *  with a visual "selected button" mark on the original prompt. */
  const markChoiceSelected = useCallback((choiceId: string) => {
    setState((prev) => {
      // Walk newest-first; lock only the most recent unlocked match.
      const idx = [...prev.messages].reverse().findIndex(
        (m) =>
          m.interactiveElement?.type === 'choices' &&
          !m.interactiveElement.clickedChoiceId &&
          m.interactiveElement.choices.some((c) => c.id === choiceId),
      );
      if (idx === -1) return prev;
      const realIdx = prev.messages.length - 1 - idx;
      return {
        ...prev,
        messages: prev.messages.map((m, i) => {
          if (i !== realIdx) return m;
          const el = m.interactiveElement;
          if (!el || el.type !== 'choices') return m;
          return { ...m, interactiveElement: { ...el, clickedChoiceId: choiceId } };
        }),
      };
    });
  }, []);

  /** Render a best-price computation as a chat message + open the Commercial
   *  tab. Used by both the quantity-prompt submission path and the "price at
   *  minimum" fallback Yes-button. Pure UI side-effect, no LLM round-trip. */
  const renderBestPriceResult = useCallback((result: BestPriceResult) => {
    if (result.kind === 'none') {
      addMessage(
        'assistant',
        result.reason === 'no-quotes'
          ? `No supplier quotes are available for this part right now.`
          : `Couldn't compute a price at qty ${result.requestedQty}.`,
      );
      return;
    }

    if (result.kind === 'fallback') {
      const opt = result.minOption;
      const price = formatPrice(opt.unitPrice, opt.currency);
      addMessage(
        'assistant',
        `Lowest available is qty **${opt.minOrderQty}** from **${formatSupplierName(opt.supplier)}** at **${price}** each. Want me to price that instead?`,
        {
          type: 'choices',
          choices: [
            {
              id: `price_at_${opt.minOrderQty}`,
              label: `Yes — price at qty ${opt.minOrderQty}`,
              action: 'best_price_at_qty',
              quantity: opt.minOrderQty,
            },
          ],
        },
      );
      // Switch to Commercial so the user sees the full quote table.
      setState((prev) => ({ ...prev, activeAttributesTab: 'commercial' }));
      return;
    }

    // Match — numbered list with the top option in bold + per-option totals.
    // Single-option case skips the list and uses a one-line headline since
    // numbering "1." against zero alternatives reads oddly.
    const ranked = [result.top, ...result.others];
    const qtyLabel = result.requestedQty.toLocaleString();
    const lines: string[] = [];

    if (ranked.length === 1) {
      const opt = ranked[0];
      const unit = formatPrice(opt.unitPrice, opt.currency);
      const total = formatPrice(opt.totalPrice, opt.currency);
      lines.push(`At qty **${qtyLabel}**, best spot price is **${formatSupplierName(opt.supplier)}: ${unit}/each** (total ${total}).`);
    } else {
      lines.push(`At qty **${qtyLabel}**, best spot prices:`, '');
      ranked.forEach((opt, i) => {
        const unit = formatPrice(opt.unitPrice, opt.currency);
        const total = formatPrice(opt.totalPrice, opt.currency);
        const body = `${formatSupplierName(opt.supplier)}: ${unit}/each (total ${total})`;
        lines.push(i === 0 ? `${i + 1}. **${body}**` : `${i + 1}. ${body}`);
      });
    }

    // Higher-MOQ alternates — distributors that stock the part but require a
    // bigger order than the user asked for. Surfacing them lets the user
    // decide whether bumping quantity unlocks a meaningfully better deal.
    if (result.overMinimum.length > 0) {
      lines.push('');
      lines.push(`Also available at higher MOQ:`);
      for (const opt of result.overMinimum) {
        const unit = formatPrice(opt.unitPrice, opt.currency);
        lines.push(`- ${formatSupplierName(opt.supplier)}: ${unit}/each at qty ${opt.minOrderQty.toLocaleString()}+`);
      }
    }

    // Tab pointer only when we've truly truncated — i.e., the panel has
    // suppliers we didn't enumerate in either the ranked list or the MOQ
    // footnote. Avoids a redundant pointer when chat already covered everything.
    const surfacedCount = ranked.length + result.overMinimum.length;
    if (result.totalSuppliers > surfacedCount) {
      lines.push('');
      lines.push(`See the **Commercial** tab for the full quote list.`);
    }
    addMessage('assistant', lines.join('\n'));
    setState((prev) => ({ ...prev, activeAttributesTab: 'commercial' }));
  }, [addMessage]);

  const handleQuantitySubmit = useCallback((messageId: string, quantity: number) => {
    // No user-message echo — the prompt collapses to a "Qty: N" pill instead.
    // LLM context still records the chosen qty via conversationRef.
    lockQuantityPrompt(messageId, quantity);
    conversationRef.current.push({
      role: 'user',
      content: `Quantity for best spot price: ${quantity}.`,
    });
    const quotes = state.sourceAttributes?.part.supplierQuotes;
    const result = computeBestPrice(quotes, quantity);
    renderBestPriceResult(result);
  }, [lockQuantityPrompt, renderBestPriceResult, state.sourceAttributes]);

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

      // Contextual action buttons (Replacement Options / MFR Profile / Best
      // Spot Price / fallback "price at qty N"): mark the clicked button as
      // selected on its prompt instead of echoing the choice as a user message.
      // LLM context still gets the action via conversationRef.

      if (choice.action === 'find_replacements') {
        markChoiceSelected(choice.id);
        conversationRef.current.push({ role: 'user', content: 'Find cross-references for this part.' });
        await handleFindReplacements();
        return;
      }

      if (choice.action === 'show_mfr_profile') {
        // Panel open is wired in AppShell (it owns useManufacturerProfile).
        markChoiceSelected(choice.id);
        conversationRef.current.push({
          role: 'user',
          content: `Show manufacturer profile for ${state.sourcePart?.manufacturer ?? 'this part'}.`,
        });
        return;
      }

      if (choice.action === 'show_best_price') {
        markChoiceSelected(choice.id);
        conversationRef.current.push({
          role: 'user',
          content: `Find best spot price for ${state.sourcePart?.mpn ?? 'this part'}.`,
        });
        addMessage(
          'assistant',
          `What quantity? Pick a common tier or type a custom number.`,
          { type: 'quantity-prompt', presets: [1, 10, 100, 1_000, 10_000, 100_000], status: 'pending' },
        );
        return;
      }

      if (choice.action === 'best_price_at_qty' && typeof choice.quantity === 'number') {
        // Fallback "Yes — price at qty N" button. Re-runs the compute at the
        // distributor's minimum order qty, since the user's original request
        // was below every supplier's MOQ.
        markChoiceSelected(choice.id);
        conversationRef.current.push({ role: 'user', content: `Price at qty ${choice.quantity}.` });
        const quotes = state.sourceAttributes?.part.supplierQuotes;
        renderBestPriceResult(computeBestPrice(quotes, choice.quantity));
        return;
      }

      // Show user's choice in chat
      addMessage('user', choice.label);
      // Send choice label to LLM as a user message
      conversationRef.current.push({ role: 'user', content: choice.label });
      await handleSearchWithLLM(choice.label);
    },
    [addMessage, markChoiceSelected, state.searchResult, state.sourcePart, state.sourceAttributes, handleConfirmPart, handleFindReplacements, handleSearchWithLLM, renderBestPriceResult]
  );

  const handleSelectRecommendation = useCallback(async (rec: XrefRecommendation) => {
    // Optimistic open: flip to the comparison view IMMEDIATELY with whatever
    // basic data we have (the recommendation's stored part + matchDetails).
    // Without this, the UI freezes for 3-4 seconds while getPartAttributes runs
    // — the click registers but nothing visibly changes, which feels broken.
    // ComparisonView already falls back to (replacementAttributes ?? recommendation).part
    // for the header, so the panel is meaningfully populated at open time;
    // Overview/Commercial tabs render skeletons while attributes load.
    setState((prev) => ({
      ...prev,
      phase: 'comparing',
      selectedRecommendation: rec,
      comparisonAttributes: null,
      isLoadingComparison: true,
      comparisonError: false,
    }));
    setStatus('Fetching replacement specs from Digikey...');
    try {
      const attributes = await getPartAttributes(rec.part.mpn);
      setStatus('');
      setState((prev) => {
        // Guard against race: if the user already navigated away from this rec
        // (clicked Back, picked a different one), don't clobber newer state.
        if (prev.selectedRecommendation?.part.mpn !== rec.part.mpn) return prev;
        return {
          ...prev,
          comparisonAttributes: attributes,
          isLoadingComparison: false,
          comparisonError: false,
        };
      });
    } catch (err) {
      console.error('[handleSelectRecommendation] Failed to fetch attributes for', rec.part.mpn, err);
      setStatus('');
      setState((prev) => {
        if (prev.selectedRecommendation?.part.mpn !== rec.part.mpn) return prev;
        return {
          ...prev,
          comparisonAttributes: null,
          isLoadingComparison: false,
          comparisonError: true,
        };
      });
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
    attributesAskedRef.current = false;
    pendingPostRecsFilterRef.current = null;
    pendingIntentQueryRef.current = null;
    recsRef.current = [];
    allRecsRef.current = [];
    sourceAttributesRef.current = null;
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
              contextAskedRef.current = true;
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
      await handleFindReplacements(autoContext);
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
      await handleFindReplacements(context);
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
      activeAttributesTab: 'overview',
      pendingIntent: null,
      autoOpenMfr: null,
      isLoadingComparison: false,
      comparisonError: false,
      currentFilter: null,
      currentFilterLabel: null,
    });
  }, []);

  /** Resolve an MPN typed inline by the assistant (or referenced anywhere
   *  the chat surfaces them) back to a PartSummary, then run the same
   *  flow as a card click. Looks first in current search results, then
   *  recommendations, then the selected source. Returns silently if no
   *  match is found — the caller (MessageBubble link) is best-effort. */
  const handleMpnClick = useCallback(async (mpn: string) => {
    const lower = mpn.toLowerCase();
    const fromSearch = searchResultRef.current?.matches.find(p => p.mpn.toLowerCase() === lower);
    if (fromSearch) {
      await handleConfirmPart(fromSearch);
      return;
    }
    const fromRecs = recsRef.current.find(r => r.part.mpn.toLowerCase() === lower)
      ?? allRecsRef.current.find(r => r.part.mpn.toLowerCase() === lower);
    if (fromRecs) {
      const part: PartSummary = {
        mpn: fromRecs.part.mpn,
        manufacturer: fromRecs.part.manufacturer,
        description: fromRecs.part.description ?? '',
        category: fromRecs.part.category,
        status: fromRecs.part.status,
        qualifications: fromRecs.part.qualifications,
      };
      await handleConfirmPart(part);
      return;
    }
    if (state.sourcePart && state.sourcePart.mpn.toLowerCase() === lower) {
      await handleConfirmPart(state.sourcePart);
    }
  }, [handleConfirmPart, state.sourcePart]);

  return {
    ...state,
    handleSearch,
    handleConfirmPart,
    handleRejectPart,
    handleChoiceSelect,
    handleQuantitySubmit,
    handleSelectRecommendation,
    handleBackToRecommendations,
    handleReset,
    handleAttributeResponse,
    handleSkipAttributes,
    handleContextResponse,
    handleSkipContext,
    handleMpnClick,
    setActiveAttributesTab,
    consumeAutoOpenMfr,
    getOrchestratorMessages,
    setConversationId,
    hydrateState,
  };
}
