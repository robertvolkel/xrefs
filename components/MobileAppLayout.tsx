'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Skeleton, Stack, Typography } from '@mui/material';
import { AppPhase, ChatMessage, ManufacturerProfile, PartAttributes, PartSummary, XrefRecommendation } from '@/lib/types';
import { TAB_BAR_HEIGHT } from '@/lib/layoutConstants';
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation';
import MobileTabBar, { MobileTab, MOBILE_TAB_ICONS } from './MobileTabBar';
import ChatInterface from './ChatInterface';
import AttributesPanel from './AttributesPanel';
import RecommendationsPanel from './RecommendationsPanel';
import ComparisonView from './ComparisonView';
import ManufacturerProfilePanel from './ManufacturerProfilePanel';

function RecommendationsSkeleton() {
  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box
        sx={{
          height: 56,
          minHeight: 56,
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

interface MobileAppLayoutProps {
  // App state
  phase: AppPhase;
  messages: ChatMessage[];
  statusText?: string;
  sourceAttributes: PartAttributes | null;
  comparisonAttributes: PartAttributes | null;
  recommendations: XrefRecommendation[];
  selectedRecommendation: XrefRecommendation | null;
  mfrProfile: ManufacturerProfile | null;
  // Derived flags
  showAttributesPanel: boolean;
  showRightPanel: boolean;
  isLoadingRecs: boolean;
  // Handlers
  onSearch: (query: string) => void;
  onConfirm: (part: PartSummary) => void;
  onReject: () => void;
  onReset: () => void;
  onAttributeResponse?: (responses: Record<string, string>) => void;
  onSkipAttributes?: () => void;
  onContextResponse?: (answers: Record<string, string>) => void;
  onSkipContext?: () => void;
  onSelectRecommendation: (rec: XrefRecommendation) => void;
  onBackToRecommendations: () => void;
  onManufacturerClick: (manufacturer: string) => void;
  onCloseMfrProfile: () => void;
}

export default function MobileAppLayout({
  phase,
  messages,
  statusText,
  sourceAttributes,
  comparisonAttributes,
  recommendations,
  selectedRecommendation,
  mfrProfile,
  showAttributesPanel,
  showRightPanel,
  isLoadingRecs,
  onSearch,
  onConfirm,
  onReject,
  onReset,
  onAttributeResponse,
  onSkipAttributes,
  onContextResponse,
  onSkipContext,
  onSelectRecommendation,
  onBackToRecommendations,
  onManufacturerClick,
  onCloseMfrProfile,
}: MobileAppLayoutProps) {
  const [activeTab, setActiveTab] = useState(0);
  const [badges, setBadges] = useState<Record<number, boolean>>({});
  const prevTabCountRef = useRef(1);

  // Build available tabs based on phase
  const tabs: MobileTab[] = useMemo(() => {
    const result: MobileTab[] = [
      { label: 'Chat', icon: MOBILE_TAB_ICONS.chat, badge: badges[0] },
    ];

    if (showAttributesPanel) {
      result.push({ label: 'Attributes', icon: MOBILE_TAB_ICONS.attributes, badge: badges[1] });
    }

    if (showRightPanel || isLoadingRecs) {
      const label = phase === 'comparing' ? 'Compare' : 'Matches';
      result.push({ label, icon: MOBILE_TAB_ICONS.matches, badge: badges[2] });
    }

    if (mfrProfile) {
      result.push({ label: 'Mfr', icon: MOBILE_TAB_ICONS.manufacturer, badge: badges[3] });
    }

    return result;
  }, [showAttributesPanel, showRightPanel, isLoadingRecs, phase, mfrProfile, badges]);

  // Auto-switch to new tab when it appears
  useEffect(() => {
    const newCount = tabs.length;
    if (newCount > prevTabCountRef.current) {
      // A new tab appeared — auto-switch to it
      setActiveTab(newCount - 1);
    }
    prevTabCountRef.current = newCount;
  }, [tabs.length]);

  // Badge when recommendations load while not on matches tab
  useEffect(() => {
    const matchesTabIdx = showAttributesPanel ? 2 : -1;
    if (recommendations.length > 0 && activeTab !== matchesTabIdx && matchesTabIdx >= 0) {
      setBadges(prev => ({ ...prev, [matchesTabIdx]: true }));
    }
  }, [recommendations.length, activeTab, showAttributesPanel]);

  // Clear badge when switching to a tab
  const handleTabChange = useCallback((tab: number) => {
    setActiveTab(tab);
    setBadges(prev => ({ ...prev, [tab]: false }));
  }, []);

  // Clamp active tab if tabs shrink (e.g. closing mfr profile)
  useEffect(() => {
    if (activeTab >= tabs.length) {
      setActiveTab(Math.max(0, tabs.length - 1));
    }
  }, [tabs.length, activeTab]);

  // Swipe navigation
  const swipeHandlers = useSwipeNavigation(
    () => { if (activeTab < tabs.length - 1) handleTabChange(activeTab + 1); },
    () => { if (activeTab > 0) handleTabChange(activeTab - 1); },
  );

  // Map tab index to panel content
  const getPanelIndex = (tabIdx: number): 'chat' | 'attributes' | 'matches' | 'manufacturer' => {
    if (tabIdx === 0) return 'chat';
    if (showAttributesPanel && tabIdx === 1) return 'attributes';
    if ((showRightPanel || isLoadingRecs) && tabIdx === (showAttributesPanel ? 2 : 1)) return 'matches';
    if (mfrProfile && tabIdx === tabs.length - 1) return 'manufacturer';
    return 'chat';
  };

  // Hide tab bar when virtual keyboard is open
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;
    const handler = () => {
      setKeyboardOpen(window.innerHeight - vv.height > 100);
    };
    vv.addEventListener('resize', handler);
    return () => vv.removeEventListener('resize', handler);
  }, []);

  const activePanel = getPanelIndex(activeTab);
  const showTabBar = tabs.length > 1 && !keyboardOpen;

  return (
    <Box
      sx={{
        height: 'var(--app-height)',
        width: '100vw',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        bgcolor: 'background.default',
      }}
    >
      {/* Panel content area */}
      <Box
        sx={{ flex: 1, overflow: 'hidden', position: 'relative' }}
        {...swipeHandlers}
      >
        {/* Chat — use visibility to preserve scroll */}
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            visibility: activePanel === 'chat' ? 'visible' : 'hidden',
            zIndex: activePanel === 'chat' ? 1 : 0,
          }}
        >
          <ChatInterface
            messages={messages}
            phase={phase}
            statusText={statusText}
            onSearch={onSearch}
            onConfirm={onConfirm}
            onReject={onReject}
            onReset={onReset}
            onAttributeResponse={onAttributeResponse}
            onSkipAttributes={onSkipAttributes}
            onContextResponse={onContextResponse}
            onSkipContext={onSkipContext}
          />
        </Box>

        {/* Attributes */}
        {showAttributesPanel && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: activePanel === 'attributes' ? 'block' : 'none',
              zIndex: activePanel === 'attributes' ? 1 : 0,
            }}
          >
            <AttributesPanel
              attributes={sourceAttributes}
              loading={phase === 'loading-attributes'}
              title="Source Part"
            />
          </Box>
        )}

        {/* Matches / Comparison */}
        {(showRightPanel || isLoadingRecs) && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: activePanel === 'matches' ? 'block' : 'none',
              zIndex: activePanel === 'matches' ? 1 : 0,
            }}
          >
            {isLoadingRecs ? (
              <RecommendationsSkeleton />
            ) : phase === 'comparing' &&
              comparisonAttributes &&
              sourceAttributes ? (
              <ComparisonView
                sourceAttributes={sourceAttributes}
                replacementAttributes={comparisonAttributes}
                recommendation={selectedRecommendation!}
                onBack={onBackToRecommendations}
                onManufacturerClick={onManufacturerClick}
              />
            ) : recommendations.length > 0 ? (
              <RecommendationsPanel
                recommendations={recommendations}
                onSelect={onSelectRecommendation}
                onManufacturerClick={onManufacturerClick}
              />
            ) : (
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
                  No replacements found for this part.
                </Typography>
              </Box>
            )}
          </Box>
        )}

        {/* Manufacturer Profile */}
        {mfrProfile && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: activePanel === 'manufacturer' ? 'block' : 'none',
              zIndex: activePanel === 'manufacturer' ? 1 : 0,
            }}
          >
            <ManufacturerProfilePanel profile={mfrProfile} onClose={onCloseMfrProfile} />
          </Box>
        )}
      </Box>

      {/* Bottom tab bar */}
      {showTabBar && (
        <MobileTabBar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          tabs={tabs}
        />
      )}
    </Box>
  );
}
