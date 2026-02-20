'use client';
import { useCallback, useEffect } from 'react';
import { useAppState } from '@/hooks/useAppState';
import { useConversationPersistence } from '@/hooks/useConversationPersistence';
import { usePanelVisibility } from '@/hooks/usePanelVisibility';
import { useManufacturerProfile } from '@/hooks/useManufacturerProfile';
import { useNewListWorkflow } from '@/hooks/useNewListWorkflow';
import { useIsMobile } from '@/hooks/useIsMobile';
import MobileAppLayout from './MobileAppLayout';
import DesktopLayout from './DesktopLayout';
import NewListDialog from './lists/NewListDialog';

export default function AppShell() {
  const appState = useAppState();
  const hasAttributes = (appState.sourceAttributes?.parameters.length ?? 0) > 0;

  const mfr = useManufacturerProfile();
  const panels = usePanelVisibility(appState.phase, hasAttributes, mfr.mfrOpen);

  // Auto-clear manual collapse when leaving 3-panel mode
  useEffect(() => {
    if (!panels.showRightPanel) mfr.clearManualCollapse();
  }, [panels.showRightPanel]); // eslint-disable-line react-hooks/exhaustive-deps

  // Unified reset: clears manufacturer profile + panel dismissed state
  const resetPanelState = useCallback(() => {
    mfr.reset();
    panels.resetDismissed();
  }, [mfr.reset, panels.resetDismissed]); // eslint-disable-line react-hooks/exhaustive-deps

  const persistence = useConversationPersistence(appState, resetPanelState, panels.setRecsRevealed);
  const newList = useNewListWorkflow();

  // Wraps reset to also clear MFR profile, manual collapse, and dismissed state
  const handleReset = useCallback(() => {
    resetPanelState();
    appState.handleReset();
  }, [resetPanelState, appState.handleReset]); // eslint-disable-line react-hooks/exhaustive-deps

  const isMobile = useIsMobile();

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
        showAttributesPanel={panels.showAttributesPanel}
        showRightPanel={panels.showRightPanel}
        isLoadingRecs={panels.isLoadingRecs}
        onSearch={appState.handleSearch}
        onConfirm={appState.handleConfirmPart}
        onReject={appState.handleRejectPart}
        onReset={handleReset}
        onAttributeResponse={appState.handleAttributeResponse}
        onSkipAttributes={appState.handleSkipAttributes}
        onContextResponse={appState.handleContextResponse}
        onSkipContext={appState.handleSkipContext}
        onSelectRecommendation={appState.handleSelectRecommendation}
        onBackToRecommendations={appState.handleBackToRecommendations}
        onManufacturerClick={mfr.handleManufacturerClick}
        onCloseMfrProfile={mfr.handleExpandChat}
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
        recommendations={appState.recommendations}
        selectedRecommendation={appState.selectedRecommendation}
        conversationId={appState.conversationId}
        showAttributesPanel={panels.showAttributesPanel}
        showRightPanel={panels.showRightPanel}
        isLoadingRecs={panels.isLoadingRecs}
        showRecsClose={panels.showRecsClose}
        showAttrsClose={panels.showAttrsClose}
        chatCollapsed={mfr.chatCollapsed}
        mfrOpen={mfr.mfrOpen}
        mfrProfile={mfr.mfrProfile}
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
        onSelectRecommendation={appState.handleSelectRecommendation}
        onBackToRecommendations={appState.handleBackToRecommendations}
        onCloseRecs={panels.handleCloseRecs}
        onCloseAttrs={panels.handleCloseAttrs}
        onManufacturerClick={mfr.handleManufacturerClick}
        onExpandChat={mfr.handleExpandChat}
        onToggleHistory={() => persistence.setHistoryOpen(!persistence.historyOpen)}
        onCloseHistory={() => persistence.setHistoryOpen(false)}
        onSelectConversation={persistence.handleSelectConversation}
        onNewChat={persistence.handleNewChat}
        onDeleteConversation={persistence.handleDeleteConversation}
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
