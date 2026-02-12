'use client';
import { Box, CircularProgress, Typography } from '@mui/material';

interface MatchPercentageBadgeProps {
  percentage: number;
  size?: 'small' | 'medium';
  hasFailures?: boolean;
  hasReviews?: boolean;
}

function getColor(pct: number, hasFailures?: boolean, hasReviews?: boolean): string {
  if (hasFailures) return '#FF5252';
  if (hasReviews) return '#FFD54F';
  if (pct >= 85) return '#69F0AE';
  if (pct >= 60) return '#FFD54F';
  return '#FF5252';
}

export default function MatchPercentageBadge({ percentage, size = 'medium', hasFailures, hasReviews }: MatchPercentageBadgeProps) {
  const dim = size === 'small' ? 40 : 52;
  const fontSize = size === 'small' ? '0.65rem' : '0.75rem';
  const color = getColor(percentage, hasFailures, hasReviews);

  return (
    <Box sx={{ position: 'relative', display: 'inline-flex' }}>
      <CircularProgress
        variant="determinate"
        value={percentage}
        size={dim}
        thickness={3}
        sx={{ color }}
      />
      <Box
        sx={{
          top: 0,
          left: 0,
          bottom: 0,
          right: 0,
          position: 'absolute',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Typography variant="caption" sx={{ fontWeight: 700, fontSize, color }}>
          {percentage}%
        </Typography>
      </Box>
    </Box>
  );
}
