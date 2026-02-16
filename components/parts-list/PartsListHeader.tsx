'use client';

import { useRouter } from 'next/navigation';
import { Box, IconButton, Link, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SettingsIcon from '@mui/icons-material/Settings';
import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  const router = useRouter();

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
        <IconButton onClick={() => router.back()} size="small" sx={{ color: 'text.secondary' }}>
          <ArrowBackIcon fontSize="small" />
        </IconButton>
        <Link href="/lists" underline="hover">
          <Typography variant="body2" color="text.secondary" component="span">
            {t('sidebar.yourLists')}
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
