'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, IconButton, InputAdornment, Slide, TextField, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import { ChatMessage } from '@/lib/types';
import MessageBubble from '@/components/MessageBubble';
import TypingIndicator from '@/components/TypingIndicator';
import { LIST_AGENT_FOOTER_HEIGHT } from '@/lib/layoutConstants';

interface ListAgentDrawerProps {
  open: boolean;
  messages: ChatMessage[];
  isLoading: boolean;
  onClose: () => void;
  onSendMessage: (text: string) => void;
  onActionConfirm: (messageId: string) => void;
  onActionCancel: (messageId: string) => void;
}

export default function ListAgentDrawer({
  open,
  messages,
  isLoading,
  onClose,
  onSendMessage,
  onActionConfirm,
  onActionCancel,
}: ListAgentDrawerProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSubmit = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    onSendMessage(trimmed);
    setInput('');
  }, [input, isLoading, onSendMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  return (
    <Slide direction="up" in={open} mountOnEnter unmountOnExit>
      <Box
        sx={{
          position: 'absolute',
          bottom: LIST_AGENT_FOOTER_HEIGHT,
          left: 0,
          right: 0,
          height: '50vh',
          display: 'flex',
          flexDirection: 'column',
          bgcolor: 'background.default',
          borderTop: 1,
          borderColor: 'divider',
          zIndex: 10,
        }}
      >
        {/* Header */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2,
            py: 0.75,
            borderBottom: 1,
            borderColor: 'divider',
            flexShrink: 0,
          }}
        >
          <Typography variant="subtitle2" fontWeight={600} sx={{ fontSize: '0.8rem' }}>
            List Agent
          </Typography>
          <IconButton size="small" onClick={onClose} sx={{ p: 0.25 }}>
            <CloseIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Box>

        {/* Messages */}
        <Box
          sx={{
            flex: 1,
            overflowY: 'auto',
            px: 2,
            py: 1.5,
          }}
        >
          {messages.length === 0 && (
            <Typography variant="body2" color="text.disabled" sx={{ textAlign: 'center', mt: 4, fontSize: '0.8rem' }}>
              Ask me anything about this list — status, filters, actions...
            </Typography>
          )}
          {messages.map(msg => (
            <MessageBubble
              key={msg.id}
              message={msg}
              onListActionConfirm={onActionConfirm}
              onListActionCancel={onActionCancel}
            />
          ))}
          {isLoading && <TypingIndicator />}
          <div ref={messagesEndRef} />
        </Box>

        {/* Input */}
        <Box sx={{ px: 2, pb: 1.5, pt: 0.5, flexShrink: 0 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Ask about this list..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            slotProps={{
              input: {
                sx: { fontSize: '0.8rem', py: 0.5 },
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      onClick={handleSubmit}
                      disabled={!input.trim() || isLoading}
                      sx={{ p: 0.5 }}
                    >
                      <SendIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />
        </Box>
      </Box>
    </Slide>
  );
}
