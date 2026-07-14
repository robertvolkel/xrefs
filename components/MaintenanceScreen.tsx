'use client';

import { Box, Typography, keyframes } from '@mui/material';

// Gentle bob so the sleeping robot feels alive, not frozen.
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
          fontSize: { xs: '4.5rem', sm: '6rem' },
          lineHeight: 1,
          mb: 3,
          animation: `${bob} 3s ease-in-out infinite`,
        }}
      >
        🤖💤
      </Box>

      <Typography
        variant="h4"
        sx={{ fontWeight: 700, mb: 1.5, maxWidth: 520 }}
      >
        Our robot is taking a quick power nap.
      </Typography>

      <Typography
        sx={{ color: 'text.secondary', fontSize: '1.05rem', maxWidth: 440 }}
      >
        We&rsquo;re topping up and will be back before you know it. Check back
        soon — no need to refresh, this page will let you back in automatically.
      </Typography>
    </Box>
  );
}
