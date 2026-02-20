'use client';
import { Box, Typography } from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
          sx={{
            lineHeight: 1.7,
            '& p': { mt: 0, mb: 1 },
            '& p:last-child': { mb: 0 },
            '& ul, & ol': { mt: 0, mb: 1, pl: 2.5, '& li': { mb: 0.25 } },
            '& code': {
              fontFamily: '"Roboto Mono", monospace',
              fontSize: '0.8em',
              bgcolor: 'action.hover',
              px: 0.6,
              py: 0.15,
              borderRadius: 0.5,
            },
            '& pre': {
              bgcolor: 'background.paper',
              border: 1,
              borderColor: 'divider',
              borderRadius: 1,
              p: 1.5,
              overflowX: 'auto',
              mb: 1,
              '& code': { bgcolor: 'transparent', p: 0, fontSize: '0.8em' },
            },
            '& a': { color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } },
            '& h1, & h2, & h3, & h4, & h5, & h6': { mt: 1.5, mb: 0.5, fontWeight: 600 },
            '& h1': { fontSize: '1.3em' },
            '& h2': { fontSize: '1.15em' },
            '& h3': { fontSize: '1.05em' },
            '& blockquote': {
              borderLeft: 3,
              borderColor: 'divider',
              pl: 1.5,
              ml: 0,
              color: 'text.secondary',
              my: 1,
            },
            '& table': { borderCollapse: 'collapse', mb: 1, width: '100%' },
            '& th, & td': { border: 1, borderColor: 'divider', px: 1, py: 0.5, textAlign: 'left' },
            '& th': { fontWeight: 600, bgcolor: 'action.hover' },
            '& hr': { border: 'none', borderTop: 1, borderColor: 'divider', my: 1.5 },
          }}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
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
