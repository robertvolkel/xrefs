'use client';

import { useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Box, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { PAGE_HEADER_HEIGHT } from '@/lib/layoutConstants';
import SettingsSectionNav, { SettingsSection } from './SettingsSectionNav';
import ProfilePanel from './ProfilePanel';
import MyProfilePanel from './MyProfilePanel';
import CompanySettingsPanel from './CompanySettingsPanel';
import AccountPanel from './AccountPanel';
import AboutPanel from './AboutPanel';

function isValidSection(s: string | null): s is SettingsSection {
  return s === 'profile' || s === 'myProfile' || s === 'companySettings' || s === 'account' || s === 'about';
}

function SettingsShellInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();

  const sectionParam = searchParams.get('section');
  const resolvedDefault = isValidSection(sectionParam) ? sectionParam : 'profile';
  const [activeSection, setActiveSection] = useState<SettingsSection>(resolvedDefault);

  const handleSectionChange = useCallback(
    (section: SettingsSection) => {
      setActiveSection(section);
      router.replace(`/settings?section=${section}`, { scroll: false });
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
          {t('settings.title')}
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
          <SettingsSectionNav
            activeSection={activeSection}
            onSectionChange={handleSectionChange}
          />
        </Box>

        {/* Content */}
        <Box sx={{ flex: 1, overflowY: 'auto' }}>
          {activeSection === 'profile' && <ProfilePanel />}
          {activeSection === 'myProfile' && <MyProfilePanel />}
          {activeSection === 'companySettings' && <CompanySettingsPanel />}
          {activeSection === 'account' && <AccountPanel />}
          {activeSection === 'about' && <AboutPanel />}
        </Box>
      </Box>
    </Box>
  );
}

export default function SettingsShell() {
  return (
    <Suspense>
      <SettingsShellInner />
    </Suspense>
  );
}
