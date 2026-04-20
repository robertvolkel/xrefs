import { useState, useEffect } from 'react';
import { Box, Skeleton, Stack, Typography } from '@mui/material';
import { AppPhase, ChatMessage, ConversationSummary, ManufacturerProfile, PartAttributes, XrefRecommendation } from '@/lib/types';

export type AttributesTab = 'overview' | 'specs' | 'commercial';
import ChatInterface from './ChatInterface';
import CollapsedChatNav from './CollapsedChatNav';
import ChatHistoryDrawer from './ChatHistoryDrawer';
import AppSidebar from './AppSidebar';
import AttributesPanel from './AttributesPanel';
import RecommendationsPanel from './RecommendationsPanel';
import ComparisonView from './ComparisonView';
import ManufacturerProfilePanel from './ManufacturerProfilePanel';
import ParticleWaveBackground from './ParticleWaveBackground';

function formatLastUpdated(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return `today at ${time}`;
  if (isYesterday) return `yesterday at ${time}`;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${time}`;
}

function getGridColumns(
  showAttrs: boolean,
  showRecs: boolean,
  chatCollapsed: boolean,
  mfrOpen: boolean,
): string {
  if (chatCollapsed && mfrOpen) return '60px 3fr 3fr 3fr';
  if (chatCollapsed) return '60px 1fr 1fr 0fr';
  if (showRecs) return '1fr 1fr 1fr 0fr';
  if (showAttrs) return '2fr 1fr 0fr 0fr';
  return '1fr 0fr 0fr 0fr';
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

export interface DesktopLayoutProps {
  // App state
  phase: AppPhase;
  messages: ChatMessage[];
  statusText: string;
  sourceAttributes: PartAttributes | null;
  comparisonAttributes: PartAttributes | null;
  recommendations: XrefRecommendation[];
  selectedRecommendation: XrefRecommendation | null;
  conversationId: string | null;

  // Panel visibility
  showAttributesPanel: boolean;
  showRightPanel: boolean;
  isLoadingRecs: boolean;
  isEnrichingFC: boolean;
  // Manufacturer profile
  chatCollapsed: boolean;
  mfrOpen: boolean;
  mfrProfile: ManufacturerProfile | null;

  // Chat history
  historyOpen: boolean;
  conversations: ConversationSummary[];
  convoLoading: boolean;

  // Handlers — app state
  onSearch: (query: string) => void;
  onConfirm: (part: import('@/lib/types').PartSummary) => void;
  onReject: () => void;
  onReset: () => void;
  onAttributeResponse: (responses: Record<string, string>) => void;
  onSkipAttributes: () => void;
  onContextResponse: (answers: Record<string, string>) => void;
  onSkipContext: () => void;
  onChoiceSelect: (choice: import('@/lib/types').ChoiceOption) => void;
  onSelectRecommendation: (rec: XrefRecommendation) => void;
  onBackToRecommendations: () => void;

  // Handlers — panels
  onManufacturerClick: (manufacturer: string) => void;
  onExpandChat: () => void;

  // Handlers — history
  onToggleHistory: () => void;
  onCloseHistory: () => void;
  onSelectConversation: (id: string) => Promise<void>;
  onNewChat: () => void;
  onDeleteConversation: (id: string) => Promise<void>;
}

export default function DesktopLayout(props: DesktopLayoutProps) {
  const {
    phase, messages, statusText, sourceAttributes, comparisonAttributes,
    recommendations, selectedRecommendation, conversationId,
    showAttributesPanel, showRightPanel, isLoadingRecs, isEnrichingFC,
    chatCollapsed, mfrOpen, mfrProfile,
    historyOpen, conversations, convoLoading,
    onSearch, onConfirm, onReject, onReset,
    onAttributeResponse, onSkipAttributes, onContextResponse, onSkipContext, onChoiceSelect,
    onSelectRecommendation, onBackToRecommendations,
    onManufacturerClick, onExpandChat,
    onToggleHistory, onCloseHistory,
    onSelectConversation, onNewChat, onDeleteConversation,
  } = props;

  // Synced tab state for AttributesPanel + ComparisonView — both panels show same dimension
  const [attributesTab, setAttributesTab] = useState<AttributesTab>('overview');
  useEffect(() => { setAttributesTab('overview'); }, [sourceAttributes?.part.mpn]);

  return (
    <Box sx={{ display: 'flex', height: 'var(--app-height)', width: '100vw' }}>
      <AppSidebar
        onReset={onReset}
        onToggleHistory={onToggleHistory}
        historyOpen={historyOpen}
      />
      <ChatHistoryDrawer
        open={historyOpen}
        onClose={onCloseHistory}
        conversations={conversations}
        loading={convoLoading}
        activeConversationId={conversationId}
        onSelectConversation={onSelectConversation}
        onNewChat={onNewChat}
        onDeleteConversation={onDeleteConversation}
      />
      <Box sx={{ flex: 1, position: 'relative', bgcolor: 'background.default', display: 'flex', flexDirection: 'column' }}>
        <ParticleWaveBackground visible={!showAttributesPanel} />
        <Box
          sx={{
            position: 'relative',
            zIndex: 1,
            display: 'grid',
            gridTemplateColumns: getGridColumns(showAttributesPanel, showRightPanel, chatCollapsed, mfrOpen),
            flex: 1,
            overflow: 'hidden',
            transition: 'grid-template-columns 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
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
            <CollapsedChatNav onExpand={onExpandChat} />
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
              onChoiceSelect={onChoiceSelect}
              sourceMpn={sourceAttributes?.part.mpn}
              sourceManufacturer={sourceAttributes?.part.manufacturer}
            />
          </Box>
        </Box>

        {/* Center panel: Source Attributes */}
        <Box
          sx={{
            overflow: 'auto',
            opacity: showAttributesPanel ? 1 : 0,
            transition: showAttributesPanel
              ? 'opacity 0.3s ease 0.35s'   // Entrance: staggered fade-in after grid expands
              : 'opacity 0.2s ease',          // Exit: fade out immediately before grid collapses
            borderRight: (showRightPanel || chatCollapsed) ? 1 : 0,
            borderColor: 'divider',
            minWidth: 0,
            position: 'relative',
            bgcolor: 'background.default',
          }}
        >
          <AttributesPanel
            attributes={sourceAttributes}
            loading={phase === 'loading-attributes'}
            title="Source Part"
            activeTab={attributesTab}
            onTabChange={setAttributesTab}
            allRecommendations={recommendations}
          />
        </Box>

        {/* Right panel: Recommendations or Comparison */}
        <Box
          sx={{
            overflow: 'auto',
            opacity: showRightPanel ? 1 : 0,
            transition: showRightPanel
              ? 'opacity 0.3s ease 0.4s'     // Entrance: staggered fade-in after grid expands
              : 'opacity 0.15s ease',         // Exit: fade out immediately before grid collapses
            borderRight: mfrOpen ? 1 : 0,
            borderColor: 'divider',
            minWidth: 0,
            position: 'relative',
            bgcolor: 'background.default',
          }}
        >
          {isLoadingRecs ? (
            <RecommendationsSkeleton />
          ) : phase === 'comparing' &&
            selectedRecommendation &&
            sourceAttributes ? (
            <ComparisonView
              sourceAttributes={sourceAttributes}
              replacementAttributes={comparisonAttributes}
              recommendation={selectedRecommendation!}
              onBack={onBackToRecommendations}
              onManufacturerClick={onManufacturerClick}
              activeTab={attributesTab}
              onTabChange={setAttributesTab}
            />
          ) : recommendations.length > 0 ? (
            <RecommendationsPanel
              recommendations={recommendations}
              onSelect={onSelectRecommendation}
              onManufacturerClick={onManufacturerClick}
              isEnrichingFC={isEnrichingFC}
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
            bgcolor: 'background.default',
          }}
        >
          {mfrProfile && (
            <ManufacturerProfilePanel profile={mfrProfile} onClose={onExpandChat} />
          )}
        </Box>
        </Box>
        {phase === 'idle' && messages.length === 0 && (
          <Box
            sx={{
              position: 'absolute',
              bottom: 40,
              left: 0,
              right: 0,
              zIndex: 2,
              textAlign: 'center',
              pointerEvents: 'none',
            }}
          >
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
              XQ Xrefs Alpha
              {formatLastUpdated(process.env.NEXT_PUBLIC_LAST_UPDATED) && (
                <>{'   |   '}Last Updated {formatLastUpdated(process.env.NEXT_PUBLIC_LAST_UPDATED)}</>
              )}
              {'   |   '}
              <Box
                component="span"
                role="button"
                tabIndex={0}
                onClick={() => window.dispatchEvent(new Event('xq-open-app-feedback'))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    window.dispatchEvent(new Event('xq-open-app-feedback'));
                  }
                }}
                sx={{
                  pointerEvents: 'auto',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  textDecorationStyle: 'dotted',
                  textUnderlineOffset: '2px',
                  '&:hover': { color: 'text.primary' },
                }}
              >
                Give Feedback
              </Box>
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}
