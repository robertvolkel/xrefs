'use client';
import { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, CircularProgress, Typography } from '@mui/material';
import { AppPhase, ChatMessage, PartSummary } from '@/lib/types';
import MessageBubble from './MessageBubble';
import SearchInput from './SearchInput';
import { CONTENT_MAX_WIDTH, HEADER_HEIGHT, HEADER_HEIGHT_MOBILE } from '@/lib/layoutConstants';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  phase: AppPhase;
  statusText?: string;
  onSearch: (query: string) => void;
  onConfirm: (part: PartSummary) => void;
  onReject: () => void;
  onReset: () => void;
  onAttributeResponse?: (responses: Record<string, string>) => void;
  onSkipAttributes?: () => void;
  onContextResponse?: (answers: Record<string, string>) => void;
  onSkipContext?: () => void;
}

export default function ChatInterface({
  messages,
  phase,
  statusText,
  onSearch,
  onConfirm,
  onReject,
  onReset,
  onAttributeResponse,
  onSkipAttributes,
  onContextResponse,
  onSkipContext,
}: ChatInterfaceProps) {
  const { t } = useTranslation();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isIdle = phase === 'idle';
  const isSearching = phase === 'searching';
  const isLanding = isIdle && messages.length === 0;
  const inputDisabled = isSearching || phase === 'loading-attributes' || phase === 'awaiting-attributes' || phase === 'awaiting-context' || phase === 'finding-matches';
  const showSpinner = !!statusText;
  const firstUserMessage = messages.find((m) => m.role === 'user')?.content;
  const chatTitle = firstUserMessage && firstUserMessage.length > 30
    ? firstUserMessage.slice(0, 30) + '…'
    : firstUserMessage;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Landing state: full-center layout
  if (isLanding) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          px: { xs: 2, sm: 3 },
        }}
      >
        <SearchInput onSubmit={onSearch} disabled={false} landing />
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ position: 'absolute', bottom: 24, display: { xs: 'none', sm: 'flex' }, alignItems: 'baseline', gap: 0.75 }}
        >
          <span>🇨🇳</span>
          <span>{t('chat.madeInChina')}</span>
        </Typography>
      </Box>
    );
  }

  // Active state: centered chat column
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      {/* Chat title — top-aligned in HEADER_HEIGHT zone to match "SOURCE PART" label */}
      {chatTitle && (
        <Box
          sx={{
            height: { xs: HEADER_HEIGHT_MOBILE, md: HEADER_HEIGHT },
            minHeight: { xs: HEADER_HEIGHT_MOBILE, md: HEADER_HEIGHT },
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            flexShrink: 0,
            pt: '30px',
            px: { xs: 2, sm: 3 },
          }}
        >
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontSize: '0.85rem', fontWeight: 500 }}
            noWrap
          >
            {chatTitle}
          </Typography>
        </Box>
      )}

      {/* Messages — centered column */}
      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        <Box
          sx={{
            maxWidth: { xs: '100%', md: CONTENT_MAX_WIDTH },
            mx: 'auto',
            width: '100%',
            px: { xs: 2, sm: 3 },
            py: { xs: 1.5, sm: 2 },
          }}
        >
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              onConfirm={onConfirm}
              onReject={onReject}
              onSelectPart={onConfirm}
              onAttributeResponse={onAttributeResponse}
              onSkipAttributes={onSkipAttributes}
              onContextResponse={onContextResponse}
              onSkipContext={onSkipContext}
            />
          ))}
          {showSpinner && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
              <Box
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  bgcolor: 'background.paper',
                  border: 1,
                  borderColor: 'divider',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <CircularProgress size={14} />
              </Box>
              <Typography variant="body2" color="text.secondary">
                {statusText}
              </Typography>
            </Box>
          )}
          <div ref={messagesEndRef} />
        </Box>
      </Box>

      {/* Pinned input — centered */}
      <Box sx={{ flexShrink: 0, pb: { xs: 1, sm: 2 } }}>
        <Box sx={{ maxWidth: { xs: '100%', md: CONTENT_MAX_WIDTH }, mx: 'auto', width: '100%', px: { xs: 2, sm: 3 } }}>
          <SearchInput onSubmit={onSearch} disabled={inputDisabled} landing={false} />
        </Box>
      </Box>
    </Box>
  );
}
