'use client';
import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Box, IconButton, Menu, MenuItem, ListItemIcon, ListItemText, Divider } from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import LogoutIcon from '@mui/icons-material/Logout';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import CorporateFareOutlinedIcon from '@mui/icons-material/CorporateFareOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import { createClient } from '@/lib/supabase/client';
import { SIDEBAR_WIDTH } from '@/lib/layoutConstants';
import { useProfile } from '@/lib/hooks/useProfile';
import AccountSettingsDialog from './AccountSettingsDialog';
import OrgSettingsDialog from './OrgSettingsDialog';

interface AppSidebarProps {
  onReset?: () => void;
  onToggleHistory?: () => void;
  historyOpen?: boolean;
}

export default function AppSidebar({ onReset, onToggleHistory, historyOpen }: AppSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation();
  const { isAdmin } = useProfile();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [orgSettingsOpen, setOrgSettingsOpen] = useState(false);

  const isListsActive = pathname === '/lists';
  const isAdminActive = pathname === '/admin';

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

  const handleOpenSettings = () => {
    setAnchorEl(null);
    setSettingsOpen(true);
  };

  const handleOpenOrgSettings = () => {
    setAnchorEl(null);
    setOrgSettingsOpen(true);
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

        {/* Navigation icons */}
        <IconButton
          onClick={onToggleHistory}
          size="small"
          sx={{
            mt: '22px',
            opacity: historyOpen ? 1 : 0.7,
            bgcolor: historyOpen ? 'action.selected' : 'transparent',
            borderRadius: 1,
            '&:hover': { opacity: 1 },
          }}
        >
          <ChatBubbleOutlineIcon fontSize="small" />
        </IconButton>

        <IconButton
          onClick={() => router.push('/lists')}
          size="small"
          sx={{
            mt: 1.5,
            opacity: isListsActive ? 1 : 0.7,
            bgcolor: isListsActive ? 'action.selected' : 'transparent',
            borderRadius: 1,
            '&:hover': { opacity: 1 },
          }}
        >
          <DescriptionOutlinedIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Bottom group: Admin + Settings */}
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {isAdmin && (
          <IconButton
            onClick={() => router.push('/admin')}
            size="small"
            sx={{
              mb: 1.5,
              opacity: isAdminActive ? 1 : 0.7,
              bgcolor: isAdminActive ? 'action.selected' : 'transparent',
              borderRadius: 1,
              '&:hover': { opacity: 1 },
            }}
          >
            <BuildOutlinedIcon fontSize="small" />
          </IconButton>
        )}
        <IconButton
          onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={{ opacity: 0.7, '&:hover': { opacity: 1 } }}
        >
          <SettingsIcon />
        </IconButton>
      </Box>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <MenuItem onClick={handleOpenSettings}>
          <ListItemIcon><ManageAccountsIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('sidebar.accountSettings')}</ListItemText>
        </MenuItem>

        {isAdmin && <Divider />}

        {isAdmin && (
          <MenuItem onClick={handleOpenOrgSettings}>
            <ListItemIcon><CorporateFareOutlinedIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t('sidebar.orgSettings')}</ListItemText>
          </MenuItem>
        )}

        <Divider />
        <MenuItem onClick={handleLogout}>
          <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('sidebar.logout')}</ListItemText>
        </MenuItem>
      </Menu>

      <AccountSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <OrgSettingsDialog open={orgSettingsOpen} onClose={() => setOrgSettingsOpen(false)} />
    </Box>
  );
}
