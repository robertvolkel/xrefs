'use client';

import { useState, useMemo, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Box, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { getAllLogicTables } from '@/lib/logicTables';
import AdminSectionNav, { AdminSection } from './AdminSectionNav';
import FamilyPicker from './FamilyPicker';
import DataSourcesPanel from './DataSourcesPanel';
import ParamMappingsPanel from './ParamMappingsPanel';
import LogicPanel from './LogicPanel';
import ContextPanel from './ContextPanel';
import TaxonomyPanel from './TaxonomyPanel';
import QcPanel from './QcPanel';

const allTables = getAllLogicTables();
const allCategories = [...new Set(allTables.map((t) => t.category))];

const SECTIONS_WITH_PICKER: AdminSection[] = ['param-mappings', 'logic', 'context'];

function isValidSection(s: string | null): s is AdminSection {
  return s === 'data-sources' || s === 'param-mappings' || s === 'logic' || s === 'context' || s === 'taxonomy' || s === 'qc';
}

function AdminShellInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();

  const sectionParam = searchParams.get('section');
  const [activeSection, setActiveSection] = useState<AdminSection>(
    isValidSection(sectionParam) ? sectionParam : 'data-sources',
  );

  const [selectedCategory, setSelectedCategory] = useState(allCategories[0] ?? '');
  const [selectedFamilyId, setSelectedFamilyId] = useState(allTables[0]?.familyId ?? '');

  const filteredTables = useMemo(
    () => allTables.filter((t) => t.category === selectedCategory),
    [selectedCategory],
  );
  const selectedTable = filteredTables.find((t) => t.familyId === selectedFamilyId) ?? filteredTables[0] ?? null;

  const handleSectionChange = useCallback(
    (section: AdminSection) => {
      setActiveSection(section);
      router.replace(`/admin?section=${section}`, { scroll: false });
    },
    [router],
  );

  const handleCategoryChange = useCallback(
    (category: string) => {
      setSelectedCategory(category);
      const firstInCategory = allTables.find((t) => t.category === category);
      if (firstInCategory) setSelectedFamilyId(firstInCategory.familyId);
    },
    [],
  );

  const showPicker = SECTIONS_WITH_PICKER.includes(activeSection);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default' }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: 3,
          py: 2.5,
          borderBottom: 1,
          borderColor: 'divider',
          flexShrink: 0,
        }}
      >
        <Typography variant="body2" color="text.secondary">
          {t('admin.title')}
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
          <AdminSectionNav activeSection={activeSection} onSectionChange={handleSectionChange} />
        </Box>

        {/* Family Picker (conditional) */}
        {showPicker && (
          <FamilyPicker
            tables={allTables}
            categories={allCategories}
            selectedCategory={selectedCategory}
            onCategoryChange={handleCategoryChange}
            selectedFamilyId={selectedTable?.familyId ?? ''}
            onFamilyChange={setSelectedFamilyId}
          />
        )}

        {/* Content */}
        {activeSection === 'qc' ? (
          <Box sx={{ flex: 1, overflow: 'hidden' }}>
            <QcPanel />
          </Box>
        ) : (
          <Box sx={{ flex: 1, overflowY: 'auto', px: 3, pb: 3, pt: '16px' }}>
            {activeSection === 'data-sources' && <DataSourcesPanel />}
            {activeSection === 'param-mappings' && <ParamMappingsPanel table={selectedTable} />}
            {activeSection === 'logic' && <LogicPanel table={selectedTable} />}
            {activeSection === 'context' && <ContextPanel table={selectedTable} />}
            {activeSection === 'taxonomy' && <TaxonomyPanel />}
          </Box>
        )}
      </Box>
    </Box>
  );
}

export default function AdminShell() {
  return (
    <Suspense>
      <AdminShellInner />
    </Suspense>
  );
}
