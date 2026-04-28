'use client';
import { Typography } from '@mui/material';

interface MatchPercentageBadgeProps {
  percentage: number;
  size?: 'small' | 'medium';
  hasFailures?: boolean;
  hasReviews?: boolean;
}

function getColor(pct: number, hasFailures?: boolean, hasReviews?: boolean): string {
  // Only high-confidence matches with no issues highlight green; everything
  // else falls back to the muted description-text color.
  if (!hasFailures && !hasReviews && pct >= 85) return '#69F0AE';
  return 'text.secondary';
}

export default function MatchPercentageBadge({ percentage, size = 'medium', hasFailures, hasReviews }: MatchPercentageBadgeProps) {
  const fontSize = size === 'small' ? '0.8rem' : '0.95rem';
  const color = getColor(percentage, hasFailures, hasReviews);

  return (
    <Typography
      component="span"
      sx={{
        fontWeight: 700,
        fontSize,
        color,
        // Match the 18px chip-row height so the badge baseline-aligns with
        // adjacent chips (Active, AEC-Q200, etc.) when placed in a chip row.
        lineHeight: '18px',
        display: 'inline-block',
        whiteSpace: 'nowrap',
      }}
    >
      {percentage}%
    </Typography>
  );
}
