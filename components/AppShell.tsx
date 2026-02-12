'use client';
import { useCallback, useEffect, useState } from 'react';
import { Box, Skeleton, Stack, Typography } from '@mui/material';
import { useAppState } from '@/hooks/useAppState';
import { AppPhase, ManufacturerProfile } from '@/lib/types';
import { getManufacturerProfile } from '@/lib/mockManufacturerData';
import ChatInterface from './ChatInterface';
import CollapsedChatNav from './CollapsedChatNav';
import AttributesPanel from './AttributesPanel';
import RecommendationsPanel from './RecommendationsPanel';
import ComparisonView from './ComparisonView';
import ManufacturerProfilePanel from './ManufacturerProfilePanel';

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
      return '7fr 3fr 0fr 0fr';
    case 'finding-matches':
      return (recsRevealed && hasAttributes) ? '4fr 3fr 3fr 0fr' : '7fr 3fr 0fr 0fr';
    case 'viewing':
    case 'comparing':
      return hasAttributes ? '4fr 3fr 3fr 0fr' : '7fr 3fr 0fr 0fr';
    default:
      return '1fr 0fr 0fr 0fr';
  }
}

function RecommendationsSkeleton() {
  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Box
        sx={{
          height: 100,
          minHeight: 100,
          p: 2,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
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
  ].includes(appState.phase);
  const showRightPanel = recsRevealed && hasAttributes;
  const isLoadingRecs = appState.phase === 'finding-matches';

  // Auto-clear manual collapse when leaving 3-panel mode
  useEffect(() => {
    if (!showRightPanel) setChatManuallyCollapsed(false);
  }, [showRightPanel]);

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: getGridColumns(appState.phase, hasAttributes, recsRevealed, chatCollapsed, mfrOpen),
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        transition: 'grid-template-columns 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
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
      {/* Left panel: Chat or Collapsed Nav */}
      <Box
        sx={{
          overflow: 'hidden',
          borderRight: (showAttributesPanel || chatCollapsed) ? 1 : 0,
          borderColor: 'divider',
          transition: 'border-color 0.3s ease',
          minWidth: 0,
        }}
      >
        {chatCollapsed ? (
          <CollapsedChatNav onExpand={handleExpandChat} />
        ) : (
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
            showHamburger={showRightPanel}
            onCollapse={() => setChatManuallyCollapsed(true)}
          />
        )}
      </Box>

      {/* Center panel: Source Attributes */}
      <Box
        sx={{
          overflow: 'auto',
          opacity: showAttributesPanel ? 1 : 0,
          transition: 'opacity 0.3s ease 0.15s',
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
          transition: 'opacity 0.3s ease 0.2s',
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
              height: '100vh',
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

      {/* Far right panel: Manufacturer Profile */}
      <Box
        sx={{
          overflow: 'auto',
          opacity: mfrOpen ? 1 : 0,
          transition: 'opacity 0.3s ease 0.2s',
          minWidth: 0,
        }}
      >
        {mfrProfile && (
          <ManufacturerProfilePanel profile={mfrProfile} onClose={handleExpandChat} />
        )}
      </Box>
    </Box>
  );
}
