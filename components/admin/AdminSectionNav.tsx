'use client';

import { List, ListItemButton, ListItemIcon, ListItemText, Divider, Badge } from '@mui/material';
import CompareArrowsOutlinedIcon from '@mui/icons-material/CompareArrowsOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import HelpOutlineOutlinedIcon from '@mui/icons-material/HelpOutlineOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import TranslateOutlinedIcon from '@mui/icons-material/TranslateOutlined';
import FactoryOutlinedIcon from '@mui/icons-material/FactoryOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import FlagIcon from '@mui/icons-material/Flag';
import HistoryIcon from '@mui/icons-material/History';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import ListAltOutlinedIcon from '@mui/icons-material/ListAltOutlined';
import FeedbackOutlinedIcon from '@mui/icons-material/FeedbackOutlined';
import { useTranslation } from 'react-i18next';

export type AdminSection = 'manufacturers' | 'atlas-coverage' | 'param-mappings' | 'logic' | 'context' | 'taxonomy' | 'atlas' | 'atlas-dictionaries' | 'search-logic' | 'list-logic' | 'app-feedback' | 'qc-feedback' | 'qc-logs' | 'distributor-clicks';

type SectionItem = { id: AdminSection; icon: React.ElementType; labelKey: string };

const manufacturersSections: SectionItem[] = [
  { id: 'manufacturers', icon: FactoryOutlinedIcon, labelKey: 'admin.manufacturers' },
  { id: 'atlas-coverage', icon: InsightsOutlinedIcon, labelKey: 'admin.atlasCoverageNav' },
  { id: 'atlas-dictionaries', icon: TranslateOutlinedIcon, labelKey: 'admin.atlasDictionaries' },
];

const dataLogicSections: SectionItem[] = [
  { id: 'param-mappings', icon: CompareArrowsOutlinedIcon, labelKey: 'admin.paramMappings' },
  { id: 'logic', icon: AccountTreeOutlinedIcon, labelKey: 'admin.logicRules' },
  { id: 'context', icon: HelpOutlineOutlinedIcon, labelKey: 'admin.contextQuestions' },
  { id: 'taxonomy', icon: CategoryOutlinedIcon, labelKey: 'admin.taxonomyNav' },
];

const logicDocsSections: SectionItem[] = [
  { id: 'search-logic', icon: SearchOutlinedIcon, labelKey: 'admin.searchLogicNav' },
  { id: 'list-logic', icon: ListAltOutlinedIcon, labelKey: 'admin.listLogicNav' },
];

const qcSections: SectionItem[] = [
  { id: 'qc-feedback', icon: FlagIcon, labelKey: 'adminQc.tabFeedback' },
  { id: 'qc-logs', icon: HistoryIcon, labelKey: 'adminQc.tabLogs' },
  { id: 'distributor-clicks', icon: OpenInNewIcon, labelKey: 'admin.distributorClicks' },
];

interface AdminSectionNavProps {
  activeSection: AdminSection;
  onSectionChange: (section: AdminSection) => void;
  appFeedbackOpenCount?: number;
}

function SectionList({ sections, activeSection, onSectionChange, t }: {
  sections: SectionItem[];
  activeSection: AdminSection;
  onSectionChange: (section: AdminSection) => void;
  t: (key: string) => string;
}) {
  return (
    <>
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
    </>
  );
}

export default function AdminSectionNav({ activeSection, onSectionChange, appFeedbackOpenCount = 0 }: AdminSectionNavProps) {
  const { t } = useTranslation();

  return (
    <List disablePadding sx={{ pt: 1 }}>
      <SectionList sections={manufacturersSections} activeSection={activeSection} onSectionChange={onSectionChange} t={t} />
      <Divider sx={{ my: 1 }} />
      <SectionList sections={dataLogicSections} activeSection={activeSection} onSectionChange={onSectionChange} t={t} />
      <Divider sx={{ my: 1 }} />
      <SectionList sections={logicDocsSections} activeSection={activeSection} onSectionChange={onSectionChange} t={t} />
      <Divider sx={{ my: 1 }} />
      {/* App Feedback — with badge for open items */}
      <ListItemButton
        selected={activeSection === 'app-feedback'}
        onClick={() => onSectionChange('app-feedback')}
        sx={{
          py: 1.25,
          px: 2,
          '&.Mui-selected': { bgcolor: 'action.selected' },
        }}
      >
        <ListItemIcon sx={{ minWidth: 36 }}>
          <Badge
            variant="dot"
            color="error"
            invisible={appFeedbackOpenCount === 0}
          >
            <FeedbackOutlinedIcon fontSize="small" sx={{ opacity: activeSection === 'app-feedback' ? 1 : 0.7 }} />
          </Badge>
        </ListItemIcon>
        <ListItemText
          primary={t('admin.appFeedback')}
          primaryTypographyProps={{
            variant: 'body2',
            fontWeight: activeSection === 'app-feedback' ? 600 : 400,
          }}
        />
      </ListItemButton>
      <Divider sx={{ my: 1 }} />
      <SectionList sections={qcSections} activeSection={activeSection} onSectionChange={onSectionChange} t={t} />
    </List>
  );
}
