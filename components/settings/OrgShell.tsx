'use client';

import { useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Box, List, ListItemButton, ListItemIcon, ListItemText, Typography } from '@mui/material';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutline';
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';
import { useTranslation } from 'react-i18next';
import { PAGE_HEADER_HEIGHT } from '@/lib/layoutConstants';
import OrgPanel from './OrgPanel';
import DataSourcesPanel from '@/components/admin/DataSourcesPanel';

type OrgSection = 'users' | 'data-sources';

const sections: { id: OrgSection; icon: React.ElementType; labelKey: string }[] = [
  { id: 'users', icon: PeopleOutlineIcon, labelKey: 'orgSettings.users' },
  { id: 'data-sources', icon: StorageOutlinedIcon, labelKey: 'admin.dataSources' },
];

function isValidSection(s: string | null): s is OrgSection {
  return s === 'users' || s === 'data-sources';
}

function OrgShellInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();

  const sectionParam = searchParams.get('section');
  const [activeSection, setActiveSection] = useState<OrgSection>(
    isValidSection(sectionParam) ? sectionParam : 'users',
  );

  const handleSectionChange = useCallback(
    (section: OrgSection) => {
      setActiveSection(section);
      router.replace(`/organization?section=${section}`, { scroll: false });
    },
    [router],
  );

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
            {sections.map(({ id, icon: Icon, labelKey }) => (
              <ListItemButton
                key={id}
                selected={id === activeSection}
                onClick={() => handleSectionChange(id)}
                sx={{
                  py: 1.25,
                  px: 2,
                  '&.Mui-selected': { bgcolor: 'action.selected' },
                }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <Icon fontSize="small" sx={{ opacity: id === activeSection ? 1 : 0.7 }} />
                </ListItemIcon>
                <ListItemText
                  primary={t(labelKey)}
                  primaryTypographyProps={{
                    variant: 'body2',
                    fontWeight: id === activeSection ? 600 : 400,
                  }}
                />
              </ListItemButton>
            ))}
          </List>
        </Box>

        {/* Content */}
        <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {activeSection === 'users' && <OrgPanel />}
          {activeSection === 'data-sources' && (
            <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 3, pb: 3, pt: '16px' }}>
              <DataSourcesPanel />
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}

export default function OrgShell() {
  return (
    <Suspense>
      <OrgShellInner />
    </Suspense>
  );
}
