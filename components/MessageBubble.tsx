'use client';
import { Box, Typography } from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import { ChatMessage, PartSummary } from '@/lib/types';
import PartConfirmation from './PartConfirmation';
import PartOptionsSelector from './PartOptionsSelector';
import MissingAttributesForm from './MissingAttributesForm';
import ApplicationContextForm from './ApplicationContextForm';

interface MessageBubbleProps {
  message: ChatMessage;
  onConfirm?: (part: PartSummary) => void;
  onReject?: () => void;
  onSelectPart?: (part: PartSummary) => void;
  onAttributeResponse?: (responses: Record<string, string>) => void;
  onSkipAttributes?: () => void;
  onContextResponse?: (answers: Record<string, string>) => void;
  onSkipContext?: () => void;
}

function renderMarkdownBold(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i}>{part}</strong>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export default function MessageBubble({
  message,
  onConfirm,
  onReject,
  onSelectPart,
  onAttributeResponse,
  onSkipAttributes,
  onContextResponse,
  onSkipContext,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <Box sx={{ display: 'flex', gap: 1.5, mb: 2.5, alignItems: 'flex-start' }}>
      {/* Avatar */}
      <Box
        sx={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          bgcolor: isUser ? 'primary.main' : 'background.paper',
          border: isUser ? 'none' : 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          mt: 0.25,
        }}
      >
        {isUser ? (
          <PersonIcon sx={{ fontSize: 16, color: 'primary.contrastText' }} />
        ) : (
          <SmartToyIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
        )}
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontWeight: 600, mb: 0.5, display: 'block', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}
        >
          {isUser ? 'You' : 'Agent'}
        </Typography>
        <Typography
          variant="body2"
          color="text.primary"
          sx={{ lineHeight: 1.7 }}
        >
          {renderMarkdownBold(message.content)}
        </Typography>

        {message.interactiveElement?.type === 'confirmation' && onConfirm && onReject && (
          <PartConfirmation
            part={message.interactiveElement.part}
            onConfirm={onConfirm}
            onReject={onReject}
          />
        )}

        {message.interactiveElement?.type === 'options' && onSelectPart && (
          <PartOptionsSelector
            parts={message.interactiveElement.parts}
            onSelect={onSelectPart}
          />
        )}

        {message.interactiveElement?.type === 'attribute-query' && onAttributeResponse && onSkipAttributes && (
          <MissingAttributesForm
            missingAttributes={message.interactiveElement.missingAttributes}
            onSubmit={onAttributeResponse}
            onSkip={onSkipAttributes}
          />
        )}

        {message.interactiveElement?.type === 'context-questions' && onContextResponse && onSkipContext && (
          <ApplicationContextForm
            questions={message.interactiveElement.questions}
            onSubmit={onContextResponse}
            onSkip={onSkipContext}
          />
        )}
      </Box>
    </Box>
  );
}
