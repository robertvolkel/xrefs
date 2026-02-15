'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Skeleton, Stack, Typography } from '@mui/material';
import { useAppState } from '@/hooks/useAppState';
import { AppPhase, ManufacturerProfile } from '@/lib/types';
import { getManufacturerProfile } from '@/lib/mockManufacturerData';
import { setPendingFile } from '@/lib/pendingFile';
import { useIsMobile } from '@/hooks/useIsMobile';
import ChatInterface from './ChatInterface';
import CollapsedChatNav from './CollapsedChatNav';
import AppSidebar from './AppSidebar';
import MobileAppLayout from './MobileAppLayout';
import AttributesPanel from './AttributesPanel';
import RecommendationsPanel from './RecommendationsPanel';
import ComparisonView from './ComparisonView';
import ManufacturerProfilePanel from './ManufacturerProfilePanel';
import NewListDialog from './lists/NewListDialog';

function getGridColumns(
  phase: AppPhase,
  hasAttributes: boolean,
  recsRevealed: boolean,
  chatCollapsed: boolean,
  mfrOpen: boolean
): string {
  if (chatCollapsed && mfrOpen) {
    return '60px 3fr 3fr 3fr';
  }
  if (chatCollapsed) {
    return '60px 1fr 1fr 0fr';
  }

  switch (phase) {
    case 'idle':
    case 'searching':
    case 'resolving':
      return '1fr 0fr 0fr 0fr';
    case 'loading-attributes':
    case 'awaiting-attributes':
    case 'awaiting-context':
    case 'unsupported':
      return '2fr 1fr 0fr 0fr';
    case 'finding-matches':
      return (recsRevealed && hasAttributes) ? '1fr 1fr 1fr 0fr' : '2fr 1fr 0fr 0fr';
    case 'viewing':
    case 'comparing':
      return hasAttributes ? '1fr 1fr 1fr 0fr' : '2fr 1fr 0fr 0fr';
    default:
      return '1fr 0fr 0fr 0fr';
  }
}

function RecommendationsSkeleton() {
  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box
        sx={{
          height: 80,
          minHeight: 80,
          px: 2,
          py: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Recommended Replacements
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.78rem', mt: 0.5 }}>
          Finding cross-references...
        </Typography>
      </Box>
      <Box sx={{ flex: 1, p: 2 }}>
        <Stack spacing={1.5}>
          {[0, 1, 2].map((i) => (
            <Skeleton
              key={i}
              variant="rounded"
              height={80}
              sx={{ borderRadius: 2, opacity: 1 - i * 0.25 }}
            />
          ))}
        </Stack>
      </Box>
    </Box>
  );
}

export default function AppShell() {
  const appState = useAppState();
  const hasAttributes = (appState.sourceAttributes?.parameters.length ?? 0) > 0;

  // Delay showing the skeleton panel by 2s after attributes load
  const [recsRevealed, setRecsRevealed] = useState(false);
  useEffect(() => {
    if (appState.phase === 'finding-matches') {
      const timer = setTimeout(() => setRecsRevealed(true), 2000);
      return () => clearTimeout(timer);
    }
    if (appState.phase === 'viewing' || appState.phase === 'comparing') {
      setRecsRevealed(true);
    } else {
      setRecsRevealed(false);
    }
  }, [appState.phase]);

  // Manufacturer profile panel state (the "dance")
  const [mfrProfile, setMfrProfile] = useState<ManufacturerProfile | null>(null);
  // Manual chat collapse via hamburger (independent of MFR profile)
  const [chatManuallyCollapsed, setChatManuallyCollapsed] = useState(false);
  const chatCollapsed = mfrProfile !== null || chatManuallyCollapsed;
  const mfrOpen = mfrProfile !== null;

  const router = useRouter();

  // New list dialog state (triggered by file upload from SearchInput)
  const [pendingUploadFile, setPendingUploadFile] = useState<File | null>(null);
  const [newListDialogOpen, setNewListDialogOpen] = useState(false);

  const handleFileSelect = useCallback((file: File) => {
    setPendingUploadFile(file);
    setNewListDialogOpen(true);
  }, []);

  const handleNewListConfirm = useCallback((name: string, description: string) => {
    if (!pendingUploadFile) return;
    setPendingFile(pendingUploadFile, name, description);
    setNewListDialogOpen(false);
    setPendingUploadFile(null);
    router.push('/parts-list');
  }, [pendingUploadFile, router]);

  const handleNewListCancel = useCallback(() => {
    setNewListDialogOpen(false);
    setPendingUploadFile(null);
  }, []);

  const handleManufacturerClick = useCallback((manufacturer: string) => {
    const profile = getManufacturerProfile(manufacturer);
    if (profile) setMfrProfile(profile);
  }, []);

  const handleExpandChat = useCallback(() => {
    setChatManuallyCollapsed(false);
    setMfrProfile(null);
  }, []);

  // Wraps reset to also clear MFR profile and manual collapse
  const handleReset = useCallback(() => {
    setMfrProfile(null);
    setChatManuallyCollapsed(false);
    appState.handleReset();
  }, [appState.handleReset]);

  const showAttributesPanel = [
    'loading-attributes',
    'awaiting-attributes',
    'awaiting-context',
    'finding-matches',
    'viewing',
    'comparing',
    'unsupported',
  ].includes(appState.phase);
  const showRightPanel = recsRevealed && hasAttributes;
  const isLoadingRecs = appState.phase === 'finding-matches';

  // Auto-clear manual collapse when leaving 3-panel mode
  useEffect(() => {
    if (!showRightPanel) setChatManuallyCollapsed(false);
  }, [showRightPanel]);

  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <MobileAppLayout
        phase={appState.phase}
        messages={appState.messages}
        sourceAttributes={appState.sourceAttributes}
        comparisonAttributes={appState.comparisonAttributes}
        recommendations={appState.recommendations}
        selectedRecommendation={appState.selectedRecommendation}
        mfrProfile={mfrProfile}
        showAttributesPanel={showAttributesPanel}
        showRightPanel={showRightPanel}
        isLoadingRecs={isLoadingRecs}
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
        onManufacturerClick={handleManufacturerClick}
        onCloseMfrProfile={handleExpandChat}
      />
    );
  }

  return (
    <Box sx={{ display: 'flex', height: 'var(--app-height)', width: '100vw' }}>
      <AppSidebar onReset={handleReset} />
      <Box
        sx={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: getGridColumns(appState.phase, hasAttributes, recsRevealed, chatCollapsed, mfrOpen),
          height: '100%',
          overflow: 'hidden',
          transition: 'grid-template-columns 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
          bgcolor: 'background.default',
          '@media (max-width: 900px)': {
            gridTemplateColumns: '1fr !important',
            gridTemplateRows: showRightPanel
              ? '40vh 30vh 30vh'
              : showAttributesPanel
                ? '60vh 40vh'
                : '1fr',
          },
        }}
      >
      {/* Left panel: Chat + Collapsed Nav (both rendered, crossfade) */}
      <Box
        sx={{
          overflow: 'hidden',
          borderRight: (showAttributesPanel || chatCollapsed) ? 1 : 0,
          borderColor: 'divider',
          transition: 'border-color 0.3s ease',
          minWidth: 0,
          position: 'relative',
        }}
      >
        {/* Collapsed nav — appears near end of collapse, disappears immediately on expand */}
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 0,
            width: 60,
            opacity: chatCollapsed ? 1 : 0,
            transition: chatCollapsed
              ? 'opacity 0.3s ease 0.5s'
              : 'opacity 0.2s ease',
            pointerEvents: chatCollapsed ? 'auto' : 'none',
            zIndex: 2,
          }}
        >
          <CollapsedChatNav onExpand={handleExpandChat} />
        </Box>

        {/* Chat — visible during slide, fades near end of collapse */}
        <Box
          sx={{
            opacity: chatCollapsed ? 0 : 1,
            transition: chatCollapsed
              ? 'opacity 0.3s ease 0.15s'
              : 'opacity 0.3s ease 0.5s',
            height: '100%',
            pointerEvents: chatCollapsed ? 'none' : 'auto',
          }}
        >
          <ChatInterface
            messages={appState.messages}
            phase={appState.phase}
            onSearch={appState.handleSearch}
            onConfirm={appState.handleConfirmPart}
            onReject={appState.handleRejectPart}
            onReset={handleReset}
            onAttributeResponse={appState.handleAttributeResponse}
            onSkipAttributes={appState.handleSkipAttributes}
            onContextResponse={appState.handleContextResponse}
            onSkipContext={appState.handleSkipContext}
            onFileSelect={handleFileSelect}
          />
        </Box>
      </Box>

      {/* Center panel: Source Attributes */}
      <Box
        sx={{
          overflow: 'auto',
          opacity: showAttributesPanel ? 1 : 0,
          transition: 'opacity 0.3s ease 0.35s',
          borderRight: (showRightPanel || chatCollapsed) ? 1 : 0,
          borderColor: 'divider',
          minWidth: 0,
        }}
      >
        <AttributesPanel
          attributes={appState.sourceAttributes}
          loading={appState.phase === 'loading-attributes'}
          title="Source Part"
        />
      </Box>

      {/* Right panel: Recommendations or Comparison */}
      <Box
        sx={{
          overflow: 'auto',
          opacity: showRightPanel ? 1 : 0,
          transition: 'opacity 0.3s ease 0.4s',
          borderRight: mfrOpen ? 1 : 0,
          borderColor: 'divider',
          minWidth: 0,
        }}
      >
        {isLoadingRecs ? (
          <RecommendationsSkeleton />
        ) : appState.phase === 'comparing' &&
        appState.comparisonAttributes &&
        appState.sourceAttributes ? (
          <ComparisonView
            sourceAttributes={appState.sourceAttributes}
            replacementAttributes={appState.comparisonAttributes}
            recommendation={appState.selectedRecommendation!}
            onBack={appState.handleBackToRecommendations}
            onManufacturerClick={handleManufacturerClick}
          />
        ) : appState.recommendations.length > 0 ? (
          <RecommendationsPanel
            recommendations={appState.recommendations}
            onSelect={appState.handleSelectRecommendation}
            onManufacturerClick={handleManufacturerClick}
          />
        ) : showRightPanel ? (
          <Box
            sx={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              p: 4,
            }}
          >
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ fontSize: '0.85rem', textAlign: 'center', maxWidth: 280 }}
            >
              No replacements found for this part. It might be one of a kind... or our database just needs a coffee break.
            </Typography>
          </Box>
        ) : null}
      </Box>

      {/* Far right panel: Manufacturer Profile — slides in from right */}
      <Box
        sx={{
          overflow: 'hidden',
          opacity: mfrOpen ? 1 : 0,
          transition: mfrOpen
            ? 'opacity 0.2s ease 0.45s'
            : 'opacity 0.1s ease',
          minWidth: 0,
        }}
      >
        {mfrProfile && (
          <ManufacturerProfilePanel profile={mfrProfile} onClose={handleExpandChat} />
        )}
      </Box>
      </Box>

      {/* New list naming dialog (triggered by file upload from SearchInput) */}
      <NewListDialog
        open={newListDialogOpen}
        fileName={pendingUploadFile?.name ?? ''}
        onConfirm={handleNewListConfirm}
        onCancel={handleNewListCancel}
      />
    </Box>
  );
}
