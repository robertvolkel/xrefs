'use client';

import { Box, List, ListItemButton, ListItemIcon, ListItemText, Typography } from '@mui/material';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutline';
import { useTranslation } from 'react-i18next';
import { PAGE_HEADER_HEIGHT } from '@/lib/layoutConstants';
import OrgPanel from './OrgPanel';

export default function OrgShell() {
  const { t } = useTranslation();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default' }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: 3,
          height: PAGE_HEADER_HEIGHT,
          borderBottom: 1,
          borderColor: 'divider',
          flexShrink: 0,
        }}
      >
        <Typography variant="h6" fontWeight={400} color="text.secondary" sx={{ lineHeight: 1 }}>
          {t('orgSettings.title')}
        </Typography>
      </Box>

      {/* Body */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Section Nav */}
        <Box
          sx={{
            width: 240,
            flexShrink: 0,
            borderRight: 1,
            borderColor: 'divider',
            overflow: 'hidden',
          }}
        >
          <List disablePadding sx={{ pt: 1 }}>
            <ListItemButton
              selected
              sx={{
                py: 1.25,
                px: 2,
                '&.Mui-selected': { bgcolor: 'action.selected' },
              }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                <PeopleOutlineIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary={t('orgSettings.users')}
                primaryTypographyProps={{
                  variant: 'body2',
                  fontWeight: 600,
                }}
              />
            </ListItemButton>
          </List>
        </Box>

        {/* Content */}
        <Box sx={{ flex: 1, overflow: 'hidden' }}>
          <OrgPanel />
        </Box>
      </Box>
    </Box>
  );
}
