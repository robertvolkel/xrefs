'use client';
import { useCallback, useEffect, useMemo } from 'react';
import { useAppState } from '@/hooks/useAppState';
import { useConversationPersistence } from '@/hooks/useConversationPersistence';
import { usePanelVisibility } from '@/hooks/usePanelVisibility';
import { useManufacturerProfile } from '@/hooks/useManufacturerProfile';
import { useNewListWorkflow } from '@/hooks/useNewListWorkflow';
import { useIsMobile } from '@/hooks/useIsMobile';
import MobileAppLayout from './MobileAppLayout';
import DesktopLayout from './DesktopLayout';
import NewListDialog from './lists/NewListDialog';
import type { ChoiceOption } from '@/lib/types';

export default function AppShell() {
  const appState = useAppState();
  const hasAttributes = (appState.sourceAttributes?.parameters.length ?? 0) > 0;

  const mfr = useManufacturerProfile();
  const panels = usePanelVisibility(appState.phase, hasAttributes);

  // Auto-clear manual collapse when leaving 3-panel mode
  useEffect(() => {
    if (!panels.showRightPanel) mfr.clearManualCollapse();
  }, [panels.showRightPanel]); // eslint-disable-line react-hooks/exhaustive-deps

  // Intent auto-fire signal: when useAppState detects a "show profile" intent
  // and the part has a profile available, it sets autoOpenMfr. AppShell owns
  // useManufacturerProfile, so it consumes the signal here and clears it.
  useEffect(() => {
    if (appState.autoOpenMfr) {
      mfr.handleManufacturerClick(appState.autoOpenMfr);
      appState.consumeAutoOpenMfr();
    }
  }, [appState.autoOpenMfr]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetPanelState = useCallback(() => {
    mfr.reset();
  }, [mfr.reset]); // eslint-disable-line react-hooks/exhaustive-deps

  const persistence = useConversationPersistence(appState, resetPanelState, panels.setRecsRevealed);
  const newList = useNewListWorkflow();

  // Wraps reset to also clear MFR profile, manual collapse, and dismissed state
  const handleReset = useCallback(() => {
    resetPanelState();
    appState.handleReset();
  }, [resetPanelState, appState.handleReset]); // eslint-disable-line react-hooks/exhaustive-deps

  const isMobile = useIsMobile();

  // MPNs the assistant might mention in prose that should auto-link in chat.
  // Source: current search-result cards + visible recommendations + selected
  // source. Built as a Set for fast membership lookup; case-preserved so the
  // regex anchors match the model's output spellings.
  const knownMpns = useMemo(() => {
    const set = new Set<string>();
    for (const p of appState.searchResult?.matches ?? []) set.add(p.mpn);
    for (const r of appState.allRecommendations ?? []) set.add(r.part.mpn);
    if (appState.sourcePart?.mpn) set.add(appState.sourcePart.mpn);
    return set;
  }, [appState.searchResult, appState.allRecommendations, appState.sourcePart]);

  // Auto-collapse chat only when MFR profile + recs are both visible — that's
  // the 4-panel crowding scenario. With MFR + attrs only (3 panels) chat fits
  // comfortably and shouldn't auto-collapse.
  const effectiveChatCollapsed = mfr.chatCollapsed || (mfr.mfrOpen && panels.showRightPanel);

  // Wraps handleChoiceSelect so the "{Manufacturer}'s Profile" button also
  // triggers the side-panel open. useAppState owns chat-message state but
  // doesn't (and shouldn't) know about useManufacturerProfile — the panel
  // hook is composed at this layer, same as the recommendation-card MFR
  // click path that wires through onManufacturerClick.
  const handleChoiceSelectWithMfr = useCallback(
    async (choice: ChoiceOption) => {
      if (choice.action === 'show_mfr_profile') {
        const sourceMfr = appState.sourcePart?.manufacturer;
        if (sourceMfr) mfr.handleManufacturerClick(sourceMfr);
      }
      await appState.handleChoiceSelect(choice);
    },
    [appState.handleChoiceSelect, appState.sourcePart, mfr.handleManufacturerClick] // eslint-disable-line react-hooks/exhaustive-deps
  );

  if (isMobile) {
    return (
      <MobileAppLayout
        phase={appState.phase}
        messages={appState.messages}
        statusText={appState.statusText}
        sourceAttributes={appState.sourceAttributes}
        comparisonAttributes={appState.comparisonAttributes}
        recommendations={appState.recommendations}
        selectedRecommendation={appState.selectedRecommendation}
        mfrProfile={mfr.mfrProfile}
        mfrSource={mfr.mfrSource}
        mfrLoading={mfr.mfrLoading}
        showAttributesPanel={panels.showAttributesPanel}
        showRightPanel={panels.showRightPanel}
        isLoadingRecs={panels.isLoadingRecs}
        isEnrichingFC={appState.isEnrichingFC}
        onSearch={appState.handleSearch}
        onConfirm={appState.handleConfirmPart}
        onReject={appState.handleRejectPart}
        onReset={handleReset}
        onAttributeResponse={appState.handleAttributeResponse}
        onSkipAttributes={appState.handleSkipAttributes}
        onContextResponse={appState.handleContextResponse}
        onSkipContext={appState.handleSkipContext}
        onChoiceSelect={handleChoiceSelectWithMfr}
        onQuantitySubmit={appState.handleQuantitySubmit}
        onSelectRecommendation={appState.handleSelectRecommendation}
        onBackToRecommendations={appState.handleBackToRecommendations}
        onManufacturerClick={mfr.handleManufacturerClick}
        onCloseMfrProfile={mfr.handleExpandChat}
        knownMpns={knownMpns}
        onMpnClick={appState.handleMpnClick}
      />
    );
  }

  return (
    <>
      <DesktopLayout
        phase={appState.phase}
        messages={appState.messages}
        statusText={appState.statusText}
        sourceAttributes={appState.sourceAttributes}
        comparisonAttributes={appState.comparisonAttributes}
        isLoadingComparison={appState.isLoadingComparison}
        comparisonError={appState.comparisonError}
        recommendations={appState.recommendations}
        selectedRecommendation={appState.selectedRecommendation}
        conversationId={appState.conversationId}
        showAttributesPanel={panels.showAttributesPanel}
        showRightPanel={panels.showRightPanel}
        isLoadingRecs={panels.isLoadingRecs}
        isEnrichingFC={appState.isEnrichingFC}
        chatCollapsed={effectiveChatCollapsed}
        mfrOpen={mfr.mfrOpen}
        mfrProfile={mfr.mfrProfile}
        mfrSource={mfr.mfrSource}
        mfrLoading={mfr.mfrLoading}
        historyOpen={persistence.historyOpen}
        conversations={persistence.conversations}
        convoLoading={persistence.convoLoading}
        onSearch={appState.handleSearch}
        onConfirm={appState.handleConfirmPart}
        onReject={appState.handleRejectPart}
        onReset={handleReset}
        onAttributeResponse={appState.handleAttributeResponse}
        onSkipAttributes={appState.handleSkipAttributes}
        onContextResponse={appState.handleContextResponse}
        onSkipContext={appState.handleSkipContext}
        onChoiceSelect={handleChoiceSelectWithMfr}
        onQuantitySubmit={appState.handleQuantitySubmit}
        activeAttributesTab={appState.activeAttributesTab}
        onAttributesTabChange={appState.setActiveAttributesTab}
        onSelectRecommendation={appState.handleSelectRecommendation}
        onBackToRecommendations={appState.handleBackToRecommendations}
        onManufacturerClick={mfr.handleManufacturerClick}
        onExpandChat={mfr.handleExpandChat}
        onToggleHistory={() => persistence.setHistoryOpen(!persistence.historyOpen)}
        onCloseHistory={() => persistence.setHistoryOpen(false)}
        onSelectConversation={persistence.handleSelectConversation}
        onNewChat={persistence.handleNewChat}
        onDeleteConversation={persistence.handleDeleteConversation}
        onClearAllConversations={persistence.handleClearAllConversations}
        knownMpns={knownMpns}
        onMpnClick={appState.handleMpnClick}
      />
      <NewListDialog
        open={newList.newListDialogOpen}
        fileName={newList.pendingUploadFile?.name ?? ''}
        onConfirm={newList.handleNewListConfirm}
        onCancel={newList.handleNewListCancel}
      />
    </>
  );
}
