'use client';
import { Box, keyframes } from '@mui/material';

const typingBounce = keyframes`
  0%, 80%, 100% { opacity: 0.3; transform: translateY(0); }
  40% { opacity: 1; transform: translateY(-3px); }
`;

interface TypingIndicatorProps {
  /** 'bubble' (default) = chat bubble variant for transcript; 'inline' = bare dots for status bars. */
  variant?: 'bubble' | 'inline';
  /** When true (default for bubble), reserves the MessageBubble avatar gutter so dots sit under AGENT content. */
  withAvatarGutter?: boolean;
}

export default function TypingIndicator({ variant = 'bubble', withAvatarGutter = variant === 'bubble' }: TypingIndicatorProps) {
  const dotSize = variant === 'inline' ? 4 : 5;
  const dots = (
    <Box
      sx={{
        display: 'inline-flex',
        gap: 0.5,
        alignItems: 'center',
        ...(variant === 'bubble'
          ? { px: 1.25, py: 0.85, borderRadius: 2, bgcolor: 'action.hover' }
          : {}),
      }}
    >
      {[0, 1, 2].map(i => (
        <Box
          key={i}
          sx={{
            width: dotSize,
            height: dotSize,
            borderRadius: '50%',
            bgcolor: 'text.secondary',
            animation: `${typingBounce} 1.2s ease-in-out infinite`,
            animationDelay: `${i * 0.15}s`,
          }}
        />
      ))}
    </Box>
  );

  if (!withAvatarGutter) return dots;

  return (
    <Box sx={{ display: 'flex', gap: { xs: 1, sm: 1.5 }, mb: 2.5, alignItems: 'flex-start' }}>
      {/* Empty avatar gutter to align with MessageBubble avatar column */}
      <Box sx={{ width: { xs: 32, sm: 28 }, flexShrink: 0 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>{dots}</Box>
    </Box>
  );
}
