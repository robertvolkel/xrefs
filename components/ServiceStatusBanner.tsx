'use client';

import { Box, Collapse, IconButton, Typography } from '@mui/material';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import CloseIcon from '@mui/icons-material/Close';
import { useServiceStatus } from '@/contexts/ServiceStatusContext';
import type { ServiceWarning } from '@/lib/types';

const SERVICE_LABELS: Record<string, string> = {
  digikey: 'Digikey',
  partsio: 'Parts.io',
  anthropic: 'AI Assistant',
};

function warningMessage(w: ServiceWarning): string {
  const label = SERVICE_LABELS[w.service] ?? w.service;
  return w.severity === 'unavailable'
    ? `${label} is currently unavailable`
    : `${label} is experiencing issues`;
}

export default function ServiceStatusBanner() {
  const { activeWarnings, dismissAll } = useServiceStatus();

  const hasUnavailable = activeWarnings.some((w) => w.severity === 'unavailable');
  const severity: 'error' | 'warning' = hasUnavailable ? 'error' : 'warning';

  return (
    <Collapse in={activeWarnings.length > 0}>
      <Box
        sx={{
          px: 2,
          py: 0.5,
          bgcolor: severity === 'error' ? 'error.dark' : 'warning.dark',
          color: 'common.white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1,
          minHeight: 36,
          position: 'relative',
          zIndex: 10,
        }}
      >
        <WarningAmberRoundedIcon sx={{ fontSize: 16, opacity: 0.9 }} />
        <Typography
          variant="body2"
          sx={{ fontSize: '0.78rem', textAlign: 'center', flex: 1 }}
        >
          {activeWarnings.map((w) => warningMessage(w)).join(' \u00b7 ')}
          {' \u2014 results may be incomplete'}
        </Typography>
        <IconButton
          size="small"
          sx={{ color: 'inherit', p: 0.5 }}
          onClick={dismissAll}
          aria-label="Dismiss service warnings"
        >
          <CloseIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>
    </Collapse>
  );
}
