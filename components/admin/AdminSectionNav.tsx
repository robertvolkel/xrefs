'use client';

import { List, ListItemButton, ListItemIcon, ListItemText, Divider } from '@mui/material';
import CompareArrowsOutlinedIcon from '@mui/icons-material/CompareArrowsOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import HelpOutlineOutlinedIcon from '@mui/icons-material/HelpOutlineOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import PublicOutlinedIcon from '@mui/icons-material/PublicOutlined';
import TranslateOutlinedIcon from '@mui/icons-material/TranslateOutlined';
import FlagIcon from '@mui/icons-material/Flag';
import HistoryIcon from '@mui/icons-material/History';
import { useTranslation } from 'react-i18next';

export type AdminSection = 'param-mappings' | 'logic' | 'context' | 'taxonomy' | 'atlas' | 'atlas-dictionaries' | 'qc-feedback' | 'qc-logs';

type SectionItem = { id: AdminSection; icon: React.ElementType; labelKey: string };

const dataLogicSections: SectionItem[] = [
  { id: 'param-mappings', icon: CompareArrowsOutlinedIcon, labelKey: 'admin.paramMappings' },
  { id: 'logic', icon: AccountTreeOutlinedIcon, labelKey: 'admin.logicRules' },
  { id: 'context', icon: HelpOutlineOutlinedIcon, labelKey: 'admin.contextQuestions' },
  { id: 'atlas', icon: PublicOutlinedIcon, labelKey: 'admin.atlasProducts' },
  { id: 'atlas-dictionaries', icon: TranslateOutlinedIcon, labelKey: 'admin.atlasDictionaries' },
  { id: 'taxonomy', icon: CategoryOutlinedIcon, labelKey: 'admin.taxonomyNav' },
];

const qcSections: SectionItem[] = [
  { id: 'qc-feedback', icon: FlagIcon, labelKey: 'adminQc.tabFeedback' },
  { id: 'qc-logs', icon: HistoryIcon, labelKey: 'adminQc.tabLogs' },
];

interface AdminSectionNavProps {
  activeSection: AdminSection;
  onSectionChange: (section: AdminSection) => void;
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

export default function AdminSectionNav({ activeSection, onSectionChange }: AdminSectionNavProps) {
  const { t } = useTranslation();

  return (
    <List disablePadding sx={{ pt: 1 }}>
      <SectionList sections={dataLogicSections} activeSection={activeSection} onSectionChange={onSectionChange} t={t} />
      <Divider sx={{ my: 1 }} />
      <SectionList sections={qcSections} activeSection={activeSection} onSectionChange={onSectionChange} t={t} />
    </List>
  );
}
