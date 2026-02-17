'use client';
import { Box, Typography } from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import { useTranslation } from 'react-i18next';
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

/** Render inline bold within a single line */
function renderInline(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i}>{part}</strong>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

/** Render basic markdown: paragraphs, bullet lists, and bold */
function renderMarkdown(text: string) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let bulletBuffer: string[] = [];
  let key = 0;

  const flushBullets = () => {
    if (bulletBuffer.length === 0) return;
    elements.push(
      <Box key={key++} component="ul" sx={{ m: 0, pl: 2.5, mb: 1, '& li': { mb: 0.25 } }}>
        {bulletBuffer.map((item, i) => (
          <li key={i}><span>{renderInline(item)}</span></li>
        ))}
      </Box>
    );
    bulletBuffer = [];
  };

  for (const line of lines) {
    const bulletMatch = line.match(/^[-•*]\s+(.*)/);
    if (bulletMatch) {
      bulletBuffer.push(bulletMatch[1]);
    } else {
      flushBullets();
      const trimmed = line.trim();
      if (trimmed === '') {
        // blank line — paragraph break
        elements.push(<Box key={key++} sx={{ height: '0.5em' }} />);
      } else {
        elements.push(<span key={key++}>{renderInline(trimmed)}<br /></span>);
      }
    }
  }
  flushBullets();

  return elements;
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
  const { t } = useTranslation();
  const isUser = message.role === 'user';

  return (
    <Box sx={{ display: 'flex', gap: { xs: 1, sm: 1.5 }, mb: 2.5, alignItems: 'flex-start' }}>
      {/* Avatar */}
      <Box
        sx={{
          width: { xs: 32, sm: 28 },
          height: { xs: 32, sm: 28 },
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
          <PersonIcon sx={{ fontSize: { xs: 18, sm: 16 }, color: 'primary.contrastText' }} />
        ) : (
          <SmartToyIcon sx={{ fontSize: { xs: 18, sm: 16 }, color: 'text.secondary' }} />
        )}
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontWeight: 600, mb: 0.5, display: 'block', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}
        >
          {isUser ? t('chat.you') : t('chat.agent')}
        </Typography>
        <Typography
          component="div"
          variant="body2"
          color="text.primary"
          sx={{ lineHeight: 1.7 }}
        >
          {renderMarkdown(message.content)}
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
