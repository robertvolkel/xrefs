'use client';
import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage, ChoiceOption, PartSummary } from '@/lib/types';
import PartConfirmation from './PartConfirmation';
import PartOptionsSelector from './PartOptionsSelector';
import ChoiceButtons from './ChoiceButtons';
import MissingAttributesForm from './MissingAttributesForm';
import ApplicationContextForm from './ApplicationContextForm';
import ListActionConfirmation from './parts-list/ListActionConfirmation';

interface MessageBubbleProps {
  message: ChatMessage;
  onConfirm?: (part: PartSummary) => void;
  onReject?: () => void;
  onSelectPart?: (part: PartSummary) => void;
  onChoiceSelect?: (choice: ChoiceOption) => void;
  onAttributeResponse?: (responses: Record<string, string>) => void;
  onSkipAttributes?: () => void;
  onContextResponse?: (answers: Record<string, string>) => void;
  onSkipContext?: () => void;
  onListActionConfirm?: (messageId: string) => void;
  onListActionCancel?: (messageId: string) => void;
  sourceMpn?: string;
  sourceManufacturer?: string;
  /** MPNs (case-preserved) the assistant might mention in prose that should
   *  render as clickable links. Typically built from the current search result
   *  + recommendations + selected source part. Empty/unset = no linkification. */
  knownMpns?: Set<string>;
  onMpnClick?: (mpn: string) => void;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Walk markdown text-bearing children and replace any known-MPN substring
 *  with a clickable span. Non-string children (nested elements) pass through
 *  untouched, so markdown links / code / etc. survive. */
function linkifyChildren(
  children: React.ReactNode,
  knownMpns: Set<string> | undefined,
  onClick: ((mpn: string) => void) | undefined,
  pattern: RegExp | null,
): React.ReactNode {
  if (!pattern || !knownMpns || knownMpns.size === 0 || !onClick) return children;
  const transform = (child: React.ReactNode, idx: number): React.ReactNode => {
    if (typeof child !== 'string') return child;
    const parts: React.ReactNode[] = [];
    let lastIdx = 0;
    let match: RegExpExecArray | null;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(child)) !== null) {
      const mpn = match[0];
      // Confirm canonical case-preserved MPN is in the known set (the regex
      // already enforces this, but a Set lookup is the source of truth).
      const canonical = [...knownMpns].find(m => m.toLowerCase() === mpn.toLowerCase()) ?? mpn;
      if (match.index > lastIdx) parts.push(child.slice(lastIdx, match.index));
      parts.push(
        <Box
          component="span"
          key={`${idx}-${match.index}-${canonical}`}
          onClick={() => onClick(canonical)}
          sx={{
            color: 'primary.main',
            cursor: 'pointer',
            fontFamily: '"Roboto Mono", monospace',
            '&:hover': { textDecoration: 'underline' },
          }}
        >
          {mpn}
        </Box>
      );
      lastIdx = match.index + mpn.length;
    }
    if (lastIdx === 0) return child;
    if (lastIdx < child.length) parts.push(child.slice(lastIdx));
    return <React.Fragment key={`f-${idx}`}>{parts}</React.Fragment>;
  };
  return Array.isArray(children)
    ? children.map((c, i) => transform(c, i))
    : transform(children, 0);
}

export default function MessageBubble({
  message,
  onConfirm,
  onReject,
  onSelectPart,
  onChoiceSelect,
  onAttributeResponse,
  onSkipAttributes,
  onContextResponse,
  onSkipContext,
  onListActionConfirm,
  onListActionCancel,
  sourceMpn,
  sourceManufacturer,
  knownMpns,
  onMpnClick,
}: MessageBubbleProps) {
  const { t } = useTranslation();
  const isUser = message.role === 'user';

  // Compile the regex once per known-MPN-set change. Sort longest first so
  // a longer MPN that contains a shorter one wins. Word-boundary anchors keep
  // matches conservative and avoid biting into surrounding tokens.
  const mpnPattern = useMemo(() => {
    if (!knownMpns || knownMpns.size === 0) return null;
    const sorted = [...knownMpns].sort((a, b) => b.length - a.length);
    return new RegExp(`\\b(?:${sorted.map(escapeRegex).join('|')})\\b`, 'gi');
  }, [knownMpns]);

  // Don't linkify the user's own messages — only the assistant might mention
  // MPNs we want to surface as clickable. Avoids re-coloring an MPN the user
  // just typed back into the input.
  const shouldLinkify = !isUser;
  const linkify = (children: React.ReactNode) =>
    shouldLinkify ? linkifyChildren(children, knownMpns, onMpnClick, mpnPattern) : children;

  return (
    <Box sx={{ display: 'flex', gap: { xs: 1, sm: 1.5 }, mb: 2.5, alignItems: 'flex-start' }}>
      {/* Avatar */}
      <Box
        sx={{
          width: { xs: 32, sm: 28 },
          height: { xs: 32, sm: 28 },
          borderRadius: '50%',
          bgcolor: isUser ? 'primary.main' : message.variant === 'warning' ? '#FF980020' : 'background.paper',
          border: isUser ? 'none' : 1,
          borderColor: message.variant === 'warning' ? '#FF9800' : 'divider',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          mt: 0.25,
        }}
      >
        {isUser ? (
          <PersonIcon sx={{ fontSize: { xs: 18, sm: 16 }, color: 'primary.contrastText' }} />
        ) : message.variant === 'warning' ? (
          <WarningAmberIcon sx={{ fontSize: { xs: 18, sm: 16 }, color: '#FF9800' }} />
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
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => <p>{linkify(children)}</p>,
              li: ({ children }) => <li>{linkify(children)}</li>,
              strong: ({ children }) => <strong>{linkify(children)}</strong>,
              em: ({ children }) => <em>{linkify(children)}</em>,
              td: ({ children }) => <td>{linkify(children)}</td>,
            }}
          >{message.content}</ReactMarkdown>
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

        {message.interactiveElement?.type === 'choices' && onChoiceSelect && (
          <ChoiceButtons
            choices={message.interactiveElement.choices}
            onSelect={onChoiceSelect}
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
            familyId={message.interactiveElement.familyId}
            initialAnswers={message.interactiveElement.initialAnswers}
            onSubmit={onContextResponse}
            onSkip={onSkipContext}
            sourceMpn={sourceMpn}
            sourceManufacturer={sourceManufacturer}
          />
        )}

        {message.interactiveElement?.type === 'list-action' && onListActionConfirm && onListActionCancel && (
          <ListActionConfirmation
            action={message.interactiveElement.action}
            status={message.interactiveElement.status}
            onConfirm={() => onListActionConfirm(message.id)}
            onCancel={() => onListActionCancel(message.id)}
          />
        )}
      </Box>
    </Box>
  );
}
