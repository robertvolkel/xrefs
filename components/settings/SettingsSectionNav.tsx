'use client';

import { List, ListItemButton, ListItemIcon, ListItemText } from '@mui/material';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import NotificationsNoneOutlinedIcon from '@mui/icons-material/NotificationsNoneOutlined';
import { useTranslation } from 'react-i18next';

export type SettingsSection = 'profile' | 'account' | 'notifications';

const sections: { id: SettingsSection; icon: React.ElementType; labelKey: string }[] = [
  { id: 'profile', icon: PersonOutlineIcon, labelKey: 'settings.myProfile' },
  { id: 'account', icon: TuneOutlinedIcon, labelKey: 'settings.accountSettings' },
  { id: 'notifications', icon: NotificationsNoneOutlinedIcon, labelKey: 'settings.notifications' },
];

interface SettingsSectionNavProps {
  activeSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
}

export default function SettingsSectionNav({ activeSection, onSectionChange }: SettingsSectionNavProps) {
  const { t } = useTranslation();

  return (
    <List disablePadding sx={{ pt: 1 }}>
      {sections.map(({ id, icon: Icon, labelKey }) => (
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
              primary={t(labelKey)}
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
