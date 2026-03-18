'use client';

import { List, ListItemButton, ListItemIcon, ListItemText } from '@mui/material';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import { useTranslation } from 'react-i18next';

export type SettingsSection = 'profile' | 'myProfile' | 'companySettings' | 'account';

const sections: { id: SettingsSection; icon: React.ElementType; label: string }[] = [
  { id: 'profile', icon: PersonOutlineIcon, label: 'My Account' },
  { id: 'myProfile', icon: BadgeOutlinedIcon, label: 'My Profile' },
  { id: 'companySettings', icon: BusinessOutlinedIcon, label: 'Company Settings' },
  { id: 'account', icon: TuneOutlinedIcon, label: 'General Settings' },
];

interface SettingsSectionNavProps {
  activeSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
}

export default function SettingsSectionNav({ activeSection, onSectionChange }: SettingsSectionNavProps) {
  const { t } = useTranslation();

  return (
    <List disablePadding sx={{ pt: 1 }}>
      {sections.map(({ id, icon: Icon, label }) => (
          <ListItemButton
            key={id}
            selected={id === activeSection}
            onClick={() => onSectionChange(id)}
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
              primary={label}
              primaryTypographyProps={{
                variant: 'body2',
                fontWeight: id === activeSection ? 600 : 400,
              }}
            />
          </ListItemButton>
        ))}
    </List>
  );
}
