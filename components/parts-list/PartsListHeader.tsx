'use client';

import { Box, IconButton, Link, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SettingsIcon from '@mui/icons-material/Settings';
import { ReactNode } from 'react';

interface PartsListHeaderProps {
  listName?: string | null;
  onEditName?: () => void;
  /** Pre-built view controls (dropdown + icons) rendered on the right side */
  viewControls?: ReactNode;
  showViewControls?: boolean;
}

export default function PartsListHeader({
  listName,
  onEditName,
  viewControls,
  showViewControls,
}: PartsListHeaderProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 3,
        py: 1.5,
        borderBottom: 1,
        borderColor: 'divider',
        flexShrink: 0,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <IconButton href="/lists" size="small" sx={{ color: 'text.secondary' }}>
          <ArrowBackIcon fontSize="small" />
        </IconButton>
        <Link href="/lists" sx={{ display: 'flex', alignItems: 'center' }}>
          <Box
            component="img"
            src="/xq-logo.png"
            alt="XQ"
            sx={{ width: 28, opacity: 0.55, '&:hover': { opacity: 0.8 } }}
          />
        </Link>
        <Link href="/lists" underline="hover" sx={{ ml: 1 }}>
          <Typography variant="body2" color="text.secondary" component="span">
            Your Lists
          </Typography>
        </Link>
        {listName && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 0.5 }}>
            <Typography variant="body2" color="text.primary" sx={{ fontWeight: 500 }}>
              / {listName}
            </Typography>
            {onEditName && (
              <IconButton size="small" onClick={onEditName} sx={{ color: 'text.secondary' }}>
                <SettingsIcon sx={{ fontSize: 14 }} />
              </IconButton>
            )}
          </Box>
        )}
      </Box>

      {showViewControls && viewControls && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {viewControls}
        </Box>
      )}
    </Box>
  );
}
