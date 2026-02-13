'use client';
import { useRef, useEffect } from 'react';
import { Box, Button, CircularProgress, IconButton, Link, Stack, Typography } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { AppPhase, ChatMessage, PartSummary } from '@/lib/types';
import MessageBubble from './MessageBubble';
import SearchInput from './SearchInput';
import { CONTENT_MAX_WIDTH, HEADER_HEIGHT, HEADER_HEIGHT_MOBILE } from '@/lib/layoutConstants';

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
  showHamburger?: boolean;
  onCollapse?: () => void;
}

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
  showHamburger,
  onCollapse,
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
          height: '100%',
          px: { xs: 2, sm: 3 },
        }}
      >
        <Box
          component="img"
          src="/xqv2-logo.png"
          alt="XQ"
          sx={{ height: { xs: 60, sm: 77 }, mb: 1, opacity: 0.55 }}
        />
        <Typography variant="body1" color="text.secondary" sx={{ mb: 4, textAlign: 'center', px: 1 }}>
          Go ahead.
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
          sx={{ position: 'absolute', bottom: 24, display: { xs: 'none', sm: 'flex' }, alignItems: 'baseline', gap: 0.75 }}
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
        height: '100%',
      }}
    >
      {/* Header — fixed height to align with other panels */}
      <Box sx={{ height: { xs: HEADER_HEIGHT_MOBILE, md: HEADER_HEIGHT }, minHeight: { xs: HEADER_HEIGHT_MOBILE, md: HEADER_HEIGHT }, px: 2, borderBottom: 1, borderColor: 'divider', flexShrink: 0, display: 'flex', alignItems: showHamburger ? 'flex-start' : 'center', pt: showHamburger ? 2 : 0 }}>
        <Box sx={{ maxWidth: { xs: '100%', md: CONTENT_MAX_WIDTH }, mx: 'auto', width: '100%' }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            {showHamburger ? (
              <IconButton onClick={onCollapse} size="small" sx={{ opacity: 0.7, '&:hover': { opacity: 1 } }}>
                <MenuIcon fontSize="small" />
              </IconButton>
            ) : (
              <Box
                component="img"
                src="/xqv2-logo.png"
                alt="XQ"
                onClick={onReset}
                sx={{ height: 38, opacity: 0.55, cursor: 'pointer', '&:hover': { opacity: 0.8 } }}
              />
            )}
            <Button
              size="small"
              startIcon={<RestartAltIcon />}
              onClick={onReset}
              color="inherit"
              sx={{ opacity: 0.7, '&:hover': { opacity: 1 } }}
            >
              Start Over
            </Button>
          </Stack>
        </Box>
      </Box>

      {/* Messages — centered column */}
      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        <Box
          sx={{
            maxWidth: { xs: '100%', md: CONTENT_MAX_WIDTH },
            mx: 'auto',
            width: '100%',
            px: { xs: 2, sm: 3 },
            py: { xs: 2, sm: 3 },
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
      <Box sx={{ flexShrink: 0, pb: { xs: 1, sm: 2 } }}>
        <Box sx={{ maxWidth: { xs: '100%', md: CONTENT_MAX_WIDTH }, mx: 'auto', width: '100%', px: { xs: 2, sm: 3 } }}>
          <SearchInput onSubmit={onSearch} disabled={inputDisabled} landing={false} />
        </Box>
      </Box>
    </Box>
  );
}
