'use client';

import { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Box, Typography, Switch, Stack, Chip } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { getQcSettings, updateQcSettings } from '@/lib/api';
import { getAllLogicTables } from '@/lib/logicTables';
import { PAGE_HEADER_HEIGHT } from '@/lib/layoutConstants';
import {
  getL2Categories,
  getL2Families,
  getL2FamiliesForCategory,
  getFullParamMap,
} from '@/lib/services/digikeyParamMap';
import AdminSectionNav, { AdminSection } from './AdminSectionNav';
import FamilyPicker, { CategoryEntry, PickerItem } from './FamilyPicker';
import ParamMappingsPanel, { L2ParamMapData } from './ParamMappingsPanel';
import LogicPanel from './LogicPanel';
import ContextPanel from './ContextPanel';
import TaxonomyPanel from './TaxonomyPanel';
import AtlasPanel from './AtlasPanel';
import AtlasDictionaryPanel from './AtlasDictionaryPanel';
import QcFeedbackTab from './QcFeedbackTab';
import QcLogsTab from './QcLogsTab';
import { getAtlasDictionaryFamilyIds } from '@/lib/services/atlasMapper';

// --- Static data (computed once at module level) ---

const allTables = getAllLogicTables();
const atlasDictFamilyIds = new Set(getAtlasDictionaryFamilyIds());
const l3Categories = [...new Set(allTables.map((t) => t.category))];

// L2 data
const l2Categories = getL2Categories();
const l2Families = getL2Families();
const l2FamilyParentCats = [...new Set(l2Families.map((f) => f.category))]; // e.g. ['Sensors']

/** Precomputed L2 admin category: items for the family list + param map lookup */
interface L2AdminCategory {
  items: PickerItem[];
  paramMaps: Map<string, L2ParamMapData>;
}

const l2AdminCategoryMap = new Map<string, L2AdminCategory>();

// 1. Sub-family parent categories (e.g., Sensors → 8 sub-families + fallback)
for (const parentCat of l2FamilyParentCats) {
  const families = getL2FamiliesForCategory(parentCat);
  const items: PickerItem[] = [];
  const paramMaps = new Map<string, L2ParamMapData>();

  for (const fam of families) {
    items.push({ id: fam.id, name: fam.name });
    const pm = getFullParamMap(fam.digikeyPatterns[0]);
    if (pm) {
      paramMaps.set(fam.id, { name: fam.name, digikeyPatterns: fam.digikeyPatterns, paramMap: pm });
    }
  }

  // Add the "(Other)" fallback if it exists
  const otherCat = l2Categories.find((c) => c.name === `${parentCat} (Other)`);
  if (otherCat) {
    const otherId = `l2:${otherCat.name}`;
    items.push({ id: otherId, name: otherCat.name });
    paramMaps.set(otherId, {
      name: otherCat.name,
      digikeyPatterns: otherCat.registrationKeys,
      paramMap: otherCat.paramMap,
    });
  }

  l2AdminCategoryMap.set(parentCat, { items, paramMaps });
}

// 2. Standalone L2 categories (no sub-families)
const subFamilyNames = new Set(l2Families.map((f) => f.name));
for (const cat of l2Categories) {
  if (subFamilyNames.has(cat.name)) continue; // sensor sub-family — handled above
  if (cat.name.includes('(Other)')) continue;  // catch-all — handled above
  const catId = `l2:${cat.name}`;
  const paramMaps = new Map<string, L2ParamMapData>();
  paramMaps.set(catId, {
    name: cat.name,
    digikeyPatterns: cat.registrationKeys,
    paramMap: cat.paramMap,
  });
  l2AdminCategoryMap.set(cat.name, {
    items: [{ id: catId, name: cat.name }],
    paramMaps,
  });
}

// Build unified category lists
const l3CategoryEntries: CategoryEntry[] = l3Categories.map((c) => ({ name: c, tier: 'l3' as const }));
const l2CategoryEntries: CategoryEntry[] = [...l2AdminCategoryMap.keys()]
  .sort()
  .map((name) => ({ name, tier: 'l2' as const }));

/** For param-mappings: L3 + L2 categories */
const paramMappingCategoryEntries: CategoryEntry[] = [...l3CategoryEntries, ...l2CategoryEntries];
/** For other sections: L3 only */
const l3OnlyCategoryEntries: CategoryEntry[] = l3CategoryEntries;

const SECTIONS_WITH_PICKER: AdminSection[] = ['param-mappings', 'logic', 'context', 'atlas-dictionaries'];

function isValidSection(s: string | null): s is AdminSection {
  return s === 'param-mappings' || s === 'logic' || s === 'context' || s === 'taxonomy' || s === 'atlas' || s === 'atlas-dictionaries' || s === 'qc-feedback' || s === 'qc-logs';
}

const QC_SECTIONS: AdminSection[] = ['qc-feedback', 'qc-logs'];

/** Check if a category name is an L2 category */
function isL2Category(cat: string): boolean {
  return l2AdminCategoryMap.has(cat);
}

function AdminShellInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();

  const sectionParam = searchParams.get('section');
  const [activeSection, setActiveSection] = useState<AdminSection>(
    isValidSection(sectionParam) ? sectionParam : 'param-mappings',
  );

  const [selectedCategory, setSelectedCategory] = useState(l3Categories[0] ?? '');
  const [selectedFamilyId, setSelectedFamilyId] = useState(allTables[0]?.familyId ?? '');

  // QC logging toggle state
  const [loggingEnabled, setLoggingEnabled] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    getQcSettings()
      .then((s) => setLoggingEnabled(s.qcLoggingEnabled))
      .catch(() => {})
      .finally(() => setSettingsLoaded(true));
  }, []);

  const handleToggleLogging = async (enabled: boolean) => {
    setLoggingEnabled(enabled);
    try {
      await updateQcSettings({ qcLoggingEnabled: enabled });
    } catch {
      setLoggingEnabled(!enabled);
    }
  };

  const isQcSection = QC_SECTIONS.includes(activeSection);

  // Determine which categories to show based on active section
  const categoryEntries = activeSection === 'param-mappings'
    ? paramMappingCategoryEntries
    : l3OnlyCategoryEntries;

  // For L3: filter tables by category
  const filteredTables = useMemo(
    () => allTables.filter((tb) => tb.category === selectedCategory),
    [selectedCategory],
  );

  // Determine if we're in L2 mode
  const inL2Mode = isL2Category(selectedCategory);
  const l2AdminCat = inL2Mode ? l2AdminCategoryMap.get(selectedCategory) : undefined;

  // Selected L3 table (only meaningful in L3 mode)
  const selectedTable = !inL2Mode
    ? (filteredTables.find((tb) => tb.familyId === selectedFamilyId) ?? filteredTables[0] ?? null)
    : null;

  // Selected L2 param map data (only meaningful in L2 mode)
  const selectedL2ParamMap = useMemo(() => {
    if (!inL2Mode || !l2AdminCat) return null;
    return l2AdminCat.paramMaps.get(selectedFamilyId) ?? l2AdminCat.paramMaps.values().next().value ?? null;
  }, [inL2Mode, l2AdminCat, selectedFamilyId]);

  const handleSectionChange = useCallback(
    (section: AdminSection) => {
      setActiveSection(section);
      router.replace(`/admin?section=${section}`, { scroll: false });
      // If switching to a non-param-mappings section while L2 is selected, reset to L3
      if (section !== 'param-mappings' && isL2Category(selectedCategory)) {
        setSelectedCategory(l3Categories[0] ?? '');
        setSelectedFamilyId(allTables[0]?.familyId ?? '');
      }
    },
    [router, selectedCategory],
  );

  const handleCategoryChange = useCallback(
    (category: string) => {
      setSelectedCategory(category);
      if (isL2Category(category)) {
        // Select first L2 item
        const l2Cat = l2AdminCategoryMap.get(category);
        if (l2Cat && l2Cat.items.length > 0) {
          setSelectedFamilyId(l2Cat.items[0].id);
        }
      } else {
        // Select first L3 family in category
        const firstInCategory = allTables.find((tb) => tb.category === category);
        if (firstInCategory) setSelectedFamilyId(firstInCategory.familyId);
      }
    },
    [],
  );

  const showPicker = SECTIONS_WITH_PICKER.includes(activeSection);

  // Effective selected ID for the picker
  const effectiveSelectedId = inL2Mode
    ? selectedFamilyId
    : (selectedTable?.familyId ?? '');

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default' }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 3,
          height: PAGE_HEADER_HEIGHT,
          borderBottom: 1,
          borderColor: 'divider',
          flexShrink: 0,
        }}
      >
        <Typography variant="h6" fontWeight={400} color="text.secondary" sx={{ lineHeight: 1 }}>
          {t('admin.title')}
        </Typography>

        {isQcSection && settingsLoaded && (
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.78rem' }}>
              {t('adminQc.toggleLabel')}
            </Typography>
            <Switch
              checked={loggingEnabled}
              onChange={(e) => handleToggleLogging(e.target.checked)}
              size="small"
            />
            <Chip
              label={loggingEnabled ? t('adminQc.collecting') : t('adminQc.paused')}
              size="small"
              color={loggingEnabled ? 'success' : 'default'}
              variant="outlined"
              sx={{ height: 22, fontSize: '0.7rem' }}
            />
          </Stack>
        )}
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
            categories={categoryEntries}
            selectedCategory={selectedCategory}
            onCategoryChange={handleCategoryChange}
            selectedFamilyId={effectiveSelectedId}
            onFamilyChange={setSelectedFamilyId}
            indicatorFamilyIds={activeSection === 'atlas-dictionaries' ? atlasDictFamilyIds : undefined}
            items={inL2Mode ? l2AdminCat?.items : undefined}
          />
        )}

        {/* Content */}
        {isQcSection ? (
          <Box sx={{ flex: 1, overflow: 'hidden' }}>
            {activeSection === 'qc-feedback' && <QcFeedbackTab />}
            {activeSection === 'qc-logs' && <QcLogsTab />}
          </Box>
        ) : (
          <Box sx={{ flex: 1, overflowY: 'auto', px: 3, pb: 3, pt: '16px' }}>
            {activeSection === 'param-mappings' && (
              <ParamMappingsPanel table={selectedTable} l2ParamMap={selectedL2ParamMap} />
            )}
            {activeSection === 'logic' && <LogicPanel table={selectedTable} />}
            {activeSection === 'context' && <ContextPanel table={selectedTable} />}
            {activeSection === 'taxonomy' && <TaxonomyPanel />}
            {activeSection === 'atlas' && <AtlasPanel />}
            {activeSection === 'atlas-dictionaries' && <AtlasDictionaryPanel table={selectedTable} />}
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
