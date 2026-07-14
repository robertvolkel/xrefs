'use client';

import { Box, Typography, keyframes } from '@mui/material';

// Siemens dark green (darkened petrol). Tweak this hex to taste.
const SIEMENS_DARK_GREEN = '#00786B';

// Gentle bob so the "zzz" drifts like sleep, not frozen.
const bob = keyframes`
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-10px); }
`;

/**
 * Full-viewport, theme-aware "we're on a maintenance break" notice shown to
 * regular users while the app is in maintenance mode. No dismiss button — it's
 * a status screen, and it clears itself once the app recovers.
 */
export default function MaintenanceScreen() {
  return (
    <Box
      role="status"
      aria-live="polite"
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: (theme) => theme.zIndex.modal + 100,
        bgcolor: 'background.default',
        color: 'text.primary',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        px: 3,
      }}
    >
      <Box
        aria-hidden
        sx={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 0.75,
          mb: 4,
          color: SIEMENS_DARK_GREEN,
          fontWeight: 800,
          lineHeight: 1,
          animation: `${bob} 3s ease-in-out infinite`,
        }}
      >
        <Box component="span" sx={{ fontSize: { xs: '2rem', sm: '2.75rem' } }}>z</Box>
        <Box component="span" sx={{ fontSize: { xs: '3rem', sm: '4rem' } }}>Z</Box>
        <Box component="span" sx={{ fontSize: { xs: '4.25rem', sm: '5.5rem' } }}>Z</Box>
      </Box>

      <Typography variant="h4" sx={{ fontWeight: 700, maxWidth: 520 }}>
        We&rsquo;re taking a quick power nap. Be back soon.
      </Typography>
    </Box>
  );
}
