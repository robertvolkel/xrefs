'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, IconButton, InputAdornment, TextField, Typography } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import { useTranslation } from 'react-i18next';
import { PartsListRow, XrefRecommendation } from '@/lib/types';
import MessageBubble from '../MessageBubble';
import { useModalChat } from '@/hooks/useModalChat';

interface ModalChatPanelProps {
  row: PartsListRow | null;
  open: boolean;
  onRecommendationsRefreshed: (recs: XrefRecommendation[]) => void;
  onLoadingChange?: (loading: boolean) => void;
}

export default function ModalChatPanel({ row, open, onRecommendationsRefreshed, onLoadingChange }: ModalChatPanelProps) {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    phase,
    isLoading,
    handleAttributeResponse,
    handleSkipAttributes,
    handleContextResponse,
    handleSkipContext,
    handleSendMessage,
  } = useModalChat({ row, open, onRecommendationsRefreshed });

  // Surface loading state to parent
  useEffect(() => {
    onLoadingChange?.(isLoading);
  }, [isLoading, onLoadingChange]);

  // Auto-scroll when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const onSubmit = useCallback(() => {
    if (!inputValue.trim() || isLoading) return;
    handleSendMessage(inputValue);
    setInputValue('');
  }, [inputValue, isLoading, handleSendMessage]);

  const showInput = phase === 'open-chat';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Messages */}
      <Box
        ref={scrollRef}
        sx={{
          flex: 1,
          overflow: 'auto',
          px: 2,
          pt: 2,
          pb: 1,
        }}
      >
        {messages.map(msg => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onAttributeResponse={handleAttributeResponse}
            onSkipAttributes={handleSkipAttributes}
            onContextResponse={handleContextResponse}
            onSkipContext={handleSkipContext}
          />
        ))}

        {isLoading && (
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', px: 1, pb: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Thinking...
            </Typography>
          </Box>
        )}
      </Box>

      {/* Text input (phase 2 only) */}
      {showInput && (
        <Box sx={{ px: 2, pb: 2, pt: 1, borderTop: 1, borderColor: 'divider' }}>
          <TextField
            fullWidth
            size="small"
            placeholder={t('partsList.modalChatPlaceholder', 'Ask about replacements...')}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSubmit();
              }
            }}
            disabled={isLoading}
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      onClick={onSubmit}
                      disabled={!inputValue.trim() || isLoading}
                    >
                      <SendIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />
        </Box>
      )}
    </Box>
  );
}
