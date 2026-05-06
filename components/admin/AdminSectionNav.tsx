'use client';

import { List, ListItemButton, ListItemIcon, ListItemText, Divider } from '@mui/material';
import CompareArrowsOutlinedIcon from '@mui/icons-material/CompareArrowsOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import HelpOutlineOutlinedIcon from '@mui/icons-material/HelpOutlineOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import TranslateOutlinedIcon from '@mui/icons-material/TranslateOutlined';
import FactoryOutlinedIcon from '@mui/icons-material/FactoryOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import AssignmentLateOutlinedIcon from '@mui/icons-material/AssignmentLateOutlined';
import { useTranslation } from 'react-i18next';

export type AdminSection =
  | 'atlas-coverage'
  | 'manufacturers'
  | 'atlas-dictionaries'
  | 'atlas-dict-triage'
  | 'atlas-ingest'
  | 'param-mappings'
  | 'logic'
  | 'context'
  | 'taxonomy';

type SectionItem = { id: AdminSection; icon: React.ElementType; labelKey: string };

const atlasSections: SectionItem[] = [
  { id: 'atlas-coverage', icon: InsightsOutlinedIcon, labelKey: 'admin.atlasCoverageNav' },
  { id: 'manufacturers', icon: FactoryOutlinedIcon, labelKey: 'admin.manufacturers' },
  { id: 'atlas-dictionaries', icon: TranslateOutlinedIcon, labelKey: 'admin.atlasDictionaries' },
  { id: 'atlas-dict-triage', icon: AssignmentLateOutlinedIcon, labelKey: 'admin.atlasDictTriage' },
  { id: 'atlas-ingest', icon: CloudUploadOutlinedIcon, labelKey: 'admin.atlasIngest' },
];

const dataLogicSections: SectionItem[] = [
  { id: 'param-mappings', icon: CompareArrowsOutlinedIcon, labelKey: 'admin.paramMappings' },
  { id: 'logic', icon: AccountTreeOutlinedIcon, labelKey: 'admin.logicRules' },
  { id: 'context', icon: HelpOutlineOutlinedIcon, labelKey: 'admin.contextQuestions' },
  { id: 'taxonomy', icon: CategoryOutlinedIcon, labelKey: 'admin.taxonomyNav' },
];

/** Single source of truth for nav items — also drives the page header title. */
export const ADMIN_SECTION_ITEMS: SectionItem[] = [...atlasSections, ...dataLogicSections];

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
      <SectionList sections={atlasSections} activeSection={activeSection} onSectionChange={onSectionChange} t={t} />
      <Divider sx={{ my: 1 }} />
      <SectionList sections={dataLogicSections} activeSection={activeSection} onSectionChange={onSectionChange} t={t} />
    </List>
  );
}
