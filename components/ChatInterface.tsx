'use client';
import { useRef, useEffect } from 'react';
import { Box, Button, CircularProgress, Link, Stack, Typography } from '@mui/material';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { AppPhase, ChatMessage, PartSummary } from '@/lib/types';
import MessageBubble from './MessageBubble';
import SearchInput from './SearchInput';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  phase: AppPhase;
  onSearch: (query: string) => void;
  onConfirm: (part: PartSummary) => void;
  onReject: () => void;
  onReset: () => void;
  onAttributeResponse?: (responses: Record<string, string>) => void;
  onSkipAttributes?: () => void;
  onContextResponse?: (answers: Record<string, string>) => void;
  onSkipContext?: () => void;
}

const CONTENT_MAX_WIDTH = 720;

export default function ChatInterface({
  messages,
  phase,
  onSearch,
  onConfirm,
  onReject,
  onReset,
  onAttributeResponse,
  onSkipAttributes,
  onContextResponse,
  onSkipContext,
}: ChatInterfaceProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isIdle = phase === 'idle';
  const isSearching = phase === 'searching';
  const isLanding = isIdle && messages.length === 0;
  const inputDisabled = isSearching || phase === 'loading-attributes' || phase === 'awaiting-attributes' || phase === 'awaiting-context' || phase === 'finding-matches';

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
          height: '100vh',
          px: 3,
        }}
      >
        <Box
          component="img"
          src="/eemonkey-logo.png"
          alt="EEMonkey"
          sx={{ height: 77, mb: 1, opacity: 0.55 }}
        />
        <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
          Find Chinese replacement components. Bring costs down. Be the hero.
        </Typography>
        <SearchInput onSubmit={onSearch} disabled={false} landing />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 4 }}>
          Or upload a{' '}
          <Link href="/parts-list" underline="always" sx={{ color: 'text.secondary', '&:hover': { color: 'text.primary' } }}>
            parts list
          </Link>
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ position: 'absolute', bottom: 24, display: 'flex', alignItems: 'baseline', gap: 0.75 }}
        >
          <span>🇨🇳</span>
          <span>Made in China by very smart engineers</span>
          <span style={{ margin: '0 2px' }}>|</span>
          <Link href="/logic" underline="hover" variant="caption" sx={{ color: 'text.secondary', '&:hover': { color: 'text.primary' } }}>
            View replacement logic
          </Link>
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
        height: '100vh',
      }}
    >
      {/* Header — fixed 100px to align with other panels */}
      <Box sx={{ height: 100, minHeight: 100, px: 2, borderBottom: 1, borderColor: 'divider', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        <Box sx={{ maxWidth: CONTENT_MAX_WIDTH, mx: 'auto', width: '100%' }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Box
              component="img"
              src="/eemonkey-logo.png"
              alt="EEMonkey"
              onClick={onReset}
              sx={{ height: 38, opacity: 0.55, cursor: 'pointer', '&:hover': { opacity: 0.8 } }}
            />
            <Button
              size="small"
              startIcon={<RestartAltIcon />}
              onClick={onReset}
              color="inherit"
              sx={{ opacity: 0.7, '&:hover': { opacity: 1 } }}
            >
              New Search
            </Button>
          </Stack>
        </Box>
      </Box>

      {/* Messages — centered column */}
      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        <Box
          sx={{
            maxWidth: CONTENT_MAX_WIDTH,
            mx: 'auto',
            width: '100%',
            px: 3,
            py: 3,
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
          {isSearching && (
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
                Searching...
              </Typography>
            </Box>
          )}
          <div ref={messagesEndRef} />
        </Box>
      </Box>

      {/* Pinned input — centered */}
      <Box sx={{ flexShrink: 0, pb: 2 }}>
        <Box sx={{ maxWidth: CONTENT_MAX_WIDTH, mx: 'auto', width: '100%', px: 3 }}>
          <SearchInput onSubmit={onSearch} disabled={inputDisabled} landing={false} />
        </Box>
      </Box>
    </Box>
  );
}
