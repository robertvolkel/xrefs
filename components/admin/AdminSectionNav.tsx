'use client';

import { List, ListItemButton, ListItemIcon, ListItemText, Divider, Typography, Box } from '@mui/material';
import CompareArrowsOutlinedIcon from '@mui/icons-material/CompareArrowsOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import HelpOutlineOutlinedIcon from '@mui/icons-material/HelpOutlineOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import TranslateOutlinedIcon from '@mui/icons-material/TranslateOutlined';
import FactoryOutlinedIcon from '@mui/icons-material/FactoryOutlined';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import AssignmentLateOutlinedIcon from '@mui/icons-material/AssignmentLateOutlined';
import HistoryEduOutlinedIcon from '@mui/icons-material/HistoryEduOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import { useTranslation } from 'react-i18next';

export type AdminSection =
  | 'manufacturers'
  | 'atlas-dictionaries'
  | 'atlas-dict-triage'
  | 'atlas-ai-log'
  | 'atlas-domain-cards'
  | 'atlas-ingest'
  | 'param-mappings'
  | 'logic'
  | 'context'
  | 'taxonomy';

type SectionItem = { id: AdminSection; icon: React.ElementType; labelKey: string };

const atlasSections: SectionItem[] = [
  { id: 'manufacturers', icon: FactoryOutlinedIcon, labelKey: 'admin.manufacturers' },
  { id: 'atlas-ingest', icon: CloudUploadOutlinedIcon, labelKey: 'admin.atlasIngest' },
  { id: 'atlas-dictionaries', icon: TranslateOutlinedIcon, labelKey: 'admin.atlasDictionaries' },
  { id: 'atlas-dict-triage', icon: AssignmentLateOutlinedIcon, labelKey: 'admin.atlasDictTriage' },
  { id: 'atlas-ai-log', icon: HistoryEduOutlinedIcon, labelKey: 'admin.atlasAiLog' },
  { id: 'atlas-domain-cards', icon: MenuBookOutlinedIcon, labelKey: 'admin.atlasDomainCards' },
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

function GroupHeader({ label }: { label: string }) {
  return (
    <Box sx={{ px: 2, pt: 1.5, pb: 0.5 }}>
      <Typography
        variant="overline"
        sx={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.08em', color: 'text.secondary', lineHeight: 1.5 }}
      >
        {label}
      </Typography>
    </Box>
  );
}

export default function AdminSectionNav({ activeSection, onSectionChange }: AdminSectionNavProps) {
  const { t } = useTranslation();

  return (
    <List disablePadding sx={{ pt: 1 }}>
      <GroupHeader label={t('admin.atlasGroup')} />
      <SectionList sections={atlasSections} activeSection={activeSection} onSectionChange={onSectionChange} t={t} />
      <Divider sx={{ my: 1 }} />
      <GroupHeader label={t('admin.attrLogicGroup')} />
      <SectionList sections={dataLogicSections} activeSection={activeSection} onSectionChange={onSectionChange} t={t} />
    </List>
  );
}
