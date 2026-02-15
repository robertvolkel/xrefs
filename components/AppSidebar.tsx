'use client';
import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Box, IconButton, Menu, MenuItem, ListItemIcon, ListItemText, Divider } from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import LogoutIcon from '@mui/icons-material/Logout';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import { createClient } from '@/lib/supabase/client';
import { SIDEBAR_WIDTH } from '@/lib/layoutConstants';

interface AppSidebarProps {
  onReset?: () => void;
}

export default function AppSidebar({ onReset }: AppSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const isListsActive = pathname === '/lists';

  const handleLogout = async () => {
    setAnchorEl(null);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      // Supabase not configured
    }
    router.push('/login');
    router.refresh();
  };

  return (
    <Box
      sx={{
        width: SIDEBAR_WIDTH,
        minWidth: SIDEBAR_WIDTH,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        bgcolor: 'background.default',
        borderRight: 1,
        borderColor: 'divider',
        pt: 0,
        pb: 2,
      }}
    >
      {/* Top group: Logo + nav icons */}
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', pt: '30px' }}>
        {/* Logo */}
        <Box
          onClick={onReset}
          sx={{
            cursor: 'pointer',
            opacity: 0.7,
            '&:hover': { opacity: 1 },
          }}
        >
          <Box component="img" src="/xq-logo.png" alt="XQ" sx={{ width: 28 }} />
        </Box>

        {/* Navigation icons — 3x the 30px logo top padding */}
        <IconButton
          onClick={() => router.push('/lists')}
          size="small"
          sx={{
            mt: '51px',
            opacity: isListsActive ? 1 : 0.7,
            bgcolor: isListsActive ? 'action.selected' : 'transparent',
            borderRadius: 1,
            '&:hover': { opacity: 1 },
          }}
        >
          <DescriptionOutlinedIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Settings */}
      <IconButton
        onClick={(e) => setAnchorEl(e.currentTarget)}
        sx={{ opacity: 0.7, '&:hover': { opacity: 1 } }}
      >
        <SettingsIcon />
      </IconButton>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <MenuItem disabled>
          <ListItemIcon><ManageAccountsIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Account Settings</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleLogout}>
          <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Log Out</ListItemText>
        </MenuItem>
      </Menu>
    </Box>
  );
}
