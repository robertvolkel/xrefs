'use client';
import { Badge, Box, Tab, Tabs } from '@mui/material';
import ChatIcon from '@mui/icons-material/Chat';
import ListAltIcon from '@mui/icons-material/ListAlt';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import FactoryIcon from '@mui/icons-material/Factory';
import { TAB_BAR_HEIGHT } from '@/lib/layoutConstants';

export interface MobileTab {
  label: string;
  icon: React.ReactElement;
  badge?: boolean;
}

interface MobileTabBarProps {
  activeTab: number;
  onTabChange: (tab: number) => void;
  tabs: MobileTab[];
}

export const MOBILE_TAB_ICONS = {
  chat: <ChatIcon />,
  attributes: <ListAltIcon />,
  matches: <CompareArrowsIcon />,
  manufacturer: <FactoryIcon />,
} as const;

export default function MobileTabBar({ activeTab, onTabChange, tabs }: MobileTabBarProps) {
  if (tabs.length <= 1) return null;

  return (
    <Box
      sx={{
        height: TAB_BAR_HEIGHT,
        borderTop: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        flexShrink: 0,
        pb: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <Tabs
        value={activeTab}
        onChange={(_, v) => onTabChange(v)}
        variant="fullWidth"
        sx={{
          minHeight: TAB_BAR_HEIGHT,
          '& .MuiTab-root': {
            minHeight: TAB_BAR_HEIGHT,
            textTransform: 'none',
            fontSize: '0.68rem',
            minWidth: 0,
            py: 0.5,
          },
        }}
      >
        {tabs.map((tab, i) => (
          <Tab
            key={i}
            icon={
              tab.badge ? (
                <Badge variant="dot" color="primary">
                  {tab.icon}
                </Badge>
              ) : (
                tab.icon
              )
            }
            label={tab.label}
            iconPosition="top"
          />
        ))}
      </Tabs>
    </Box>
  );
}
