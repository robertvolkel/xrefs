'use client';

import { List, ListItemButton, ListItemIcon, ListItemText, Badge } from '@mui/material';
import HistoryIcon from '@mui/icons-material/History';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import FeedbackOutlinedIcon from '@mui/icons-material/FeedbackOutlined';
import FlagIcon from '@mui/icons-material/Flag';
import { useTranslation } from 'react-i18next';

export type MonitoringSection =
  | 'activity-logs'
  | 'distributor-clicks'
  | 'app-feedback'
  | 'logic-feedback';

type SectionItem = { id: MonitoringSection; icon: React.ElementType; labelKey: string };

const monitoringSections: SectionItem[] = [
  { id: 'activity-logs', icon: HistoryIcon, labelKey: 'monitoring.activityLogs' },
  { id: 'distributor-clicks', icon: OpenInNewIcon, labelKey: 'monitoring.distributorClicks' },
  { id: 'app-feedback', icon: FeedbackOutlinedIcon, labelKey: 'monitoring.appFeedback' },
  { id: 'logic-feedback', icon: FlagIcon, labelKey: 'monitoring.logicFeedback' },
];

export const MONITORING_SECTION_ITEMS: SectionItem[] = monitoringSections;

interface MonitoringSectionNavProps {
  activeSection: MonitoringSection;
  onSectionChange: (section: MonitoringSection) => void;
  appFeedbackOpenCount?: number;
}

export default function MonitoringSectionNav({
  activeSection,
  onSectionChange,
  appFeedbackOpenCount = 0,
}: MonitoringSectionNavProps) {
  const { t } = useTranslation();

  return (
    <List disablePadding sx={{ pt: 1 }}>
      {monitoringSections.map(({ id, icon: Icon, labelKey }) => {
        const isActive = id === activeSection;
        const showBadge = id === 'app-feedback' && appFeedbackOpenCount > 0;
        return (
          <ListItemButton
            key={id}
            selected={isActive}
            onClick={() => onSectionChange(id)}
            sx={{
              py: 1.25,
              px: 2,
              '&.Mui-selected': { bgcolor: 'action.selected' },
            }}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>
              {showBadge ? (
                <Badge variant="dot" color="error">
                  <Icon fontSize="small" sx={{ opacity: isActive ? 1 : 0.7 }} />
                </Badge>
              ) : (
                <Icon fontSize="small" sx={{ opacity: isActive ? 1 : 0.7 }} />
              )}
            </ListItemIcon>
            <ListItemText
              primary={t(labelKey)}
              primaryTypographyProps={{
                variant: 'body2',
                fontWeight: isActive ? 600 : 400,
              }}
            />
          </ListItemButton>
        );
      })}
    </List>
  );
}
