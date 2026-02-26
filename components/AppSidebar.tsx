'use client';
import { useRouter, usePathname } from 'next/navigation';
import { Box, IconButton } from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import LogoutIcon from '@mui/icons-material/Logout';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import CorporateFareOutlinedIcon from '@mui/icons-material/CorporateFareOutlined';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { useColorScheme } from '@mui/material/styles';
import { createClient } from '@/lib/supabase/client';
import { SIDEBAR_WIDTH, PAGE_HEADER_HEIGHT } from '@/lib/layoutConstants';
import { useProfile } from '@/lib/hooks/useProfile';

interface AppSidebarProps {
  onReset?: () => void;
  onToggleHistory?: () => void;
  historyOpen?: boolean;
}

export default function AppSidebar({ onReset, onToggleHistory, historyOpen }: AppSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAdmin } = useProfile();
  const { mode } = useColorScheme();
  const logoSrc = mode === 'dark' ? '/xq-logo.png' : '/xq-logo-dark.png';

  const isListsActive = pathname === '/lists';
  const isQcActive = pathname === '/qc';
  const isAdminActive = pathname === '/admin';
  const isOrgActive = pathname === '/organization';
  const isAboutActive = pathname === '/about';
  const isSettingsActive = pathname === '/settings';

  const handleLogout = async () => {
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
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {/* Logo — fixed height matches page header bars */}
        <Box
          onClick={onReset}
          sx={{
            cursor: 'pointer',
            opacity: 0.7,
            '&:hover': { opacity: 1 },
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: PAGE_HEADER_HEIGHT,
            width: '100%',
          }}
        >
          <Box component="img" src={logoSrc} alt="XQ" sx={{ width: 28 }} />
        </Box>

        {/* Navigation icons */}
        <IconButton
          onClick={onToggleHistory}
          size="small"
          sx={{
            mt: 1,
            color: historyOpen ? 'text.primary' : 'text.secondary',
            bgcolor: historyOpen ? 'action.selected' : 'transparent',
            borderRadius: 1,
            '&:hover': { color: 'text.primary' },
          }}
        >
          <ChatBubbleOutlineIcon fontSize="small" />
        </IconButton>

        <IconButton
          onClick={() => router.push('/lists')}
          size="small"
          sx={{
            mt: 1.5,
            color: isListsActive ? 'text.primary' : 'text.secondary',
            bgcolor: isListsActive ? 'action.selected' : 'transparent',
            borderRadius: 1,
            '&:hover': { color: 'text.primary' },
          }}
        >
          <DescriptionOutlinedIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Bottom group: Admin + Settings + Logout */}
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {isAdmin && (
          <IconButton
            onClick={() => router.push('/qc')}
            size="small"
            sx={{
              mb: 1.5,
              color: isQcActive ? 'text.primary' : 'text.secondary',
              bgcolor: isQcActive ? 'action.selected' : 'transparent',
              borderRadius: 1,
              '&:hover': { color: 'text.primary' },
            }}
          >
            <RateReviewOutlinedIcon fontSize="small" />
          </IconButton>
        )}
        {isAdmin && (
          <IconButton
            onClick={() => router.push('/admin')}
            size="small"
            sx={{
              mb: 1.5,
              color: isAdminActive ? 'text.primary' : 'text.secondary',
              bgcolor: isAdminActive ? 'action.selected' : 'transparent',
              borderRadius: 1,
              '&:hover': { color: 'text.primary' },
            }}
          >
            <BuildOutlinedIcon fontSize="small" sx={{ transform: 'rotate(90deg)' }} />
          </IconButton>
        )}
        {isAdmin && (
          <IconButton
            onClick={() => router.push('/organization')}
            size="small"
            sx={{
              mb: 1.5,
              color: isOrgActive ? 'text.primary' : 'text.secondary',
              bgcolor: isOrgActive ? 'action.selected' : 'transparent',
              borderRadius: 1,
              '&:hover': { color: 'text.primary' },
            }}
          >
            <CorporateFareOutlinedIcon fontSize="small" />
          </IconButton>
        )}
        <IconButton
          onClick={() => router.push('/about')}
          size="small"
          sx={{
            mb: 1.5,
            color: isAboutActive ? 'text.primary' : 'text.secondary',
            bgcolor: isAboutActive ? 'action.selected' : 'transparent',
            borderRadius: 1,
            '&:hover': { color: 'text.primary' },
          }}
        >
          <HelpOutlineIcon fontSize="small" />
        </IconButton>
        <IconButton
          onClick={() => router.push('/settings')}
          size="small"
          sx={{
            color: isSettingsActive ? 'text.primary' : 'text.secondary',
            bgcolor: isSettingsActive ? 'action.selected' : 'transparent',
            borderRadius: 1,
            '&:hover': { color: 'text.primary' },
          }}
        >
          <SettingsIcon fontSize="small" />
        </IconButton>
        <IconButton
          onClick={handleLogout}
          size="small"
          sx={{
            mt: 1.5,
            color: 'text.secondary',
            '&:hover': { color: 'text.primary' },
          }}
        >
          <LogoutIcon fontSize="small" sx={{ transform: 'scaleX(-1)' }} />
        </IconButton>
      </Box>
    </Box>
  );
}
