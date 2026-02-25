'use client';

import { List, ListItemButton, ListItemIcon, ListItemText } from '@mui/material';
import FlagIcon from '@mui/icons-material/Flag';
import HistoryIcon from '@mui/icons-material/History';
import { useTranslation } from 'react-i18next';

export type QcSection = 'feedback' | 'logs';

const sections: { id: QcSection; icon: React.ElementType; labelKey: string }[] = [
  { id: 'feedback', icon: FlagIcon, labelKey: 'adminQc.tabFeedback' },
  { id: 'logs', icon: HistoryIcon, labelKey: 'adminQc.tabLogs' },
];

interface QcSectionNavProps {
  activeSection: QcSection;
  onSectionChange: (section: QcSection) => void;
}

export default function QcSectionNav({ activeSection, onSectionChange }: QcSectionNavProps) {
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
