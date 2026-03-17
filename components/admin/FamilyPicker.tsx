'use client';

import {
  Box,
  Chip,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Select,
  Tooltip,
} from '@mui/material';
import TranslateOutlinedIcon from '@mui/icons-material/TranslateOutlined';
import { useTranslation } from 'react-i18next';
import { LogicTable } from '@/lib/types';

export interface PickerItem {
  id: string;
  name: string;
}

export interface CategoryEntry {
  name: string;
  tier: 'l3' | 'l2';
}

interface FamilyPickerProps {
  tables: LogicTable[];
  categories: CategoryEntry[];
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  selectedFamilyId: string;
  onFamilyChange: (familyId: string) => void;
  /** Family IDs to show with an indicator icon (e.g. families with Atlas dictionaries) */
  indicatorFamilyIds?: Set<string>;
  /** Generic items to render instead of filtering tables (used for L2 families) */
  items?: PickerItem[];
}

export default function FamilyPicker({
  tables,
  categories,
  selectedCategory,
  onCategoryChange,
  selectedFamilyId,
  onFamilyChange,
  indicatorFamilyIds,
  items,
}: FamilyPickerProps) {
  const { t } = useTranslation();
  const filtered = tables.filter((tb) => tb.category === selectedCategory);
  const selectedCatEntry = categories.find((c) => c.name === selectedCategory);

  // Use items if provided (L2 mode), otherwise use filtered tables
  const listItems: PickerItem[] = items
    ?? filtered.map((tb) => ({ id: tb.familyId, name: t(`logicTable.${tb.familyId}.name`, tb.familyName) }));

  return (
    <Box
      sx={{
        width: 260,
        flexShrink: 0,
        borderRight: 1,
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <Box sx={{ px: 2, py: 1.5, flexShrink: 0 }}>
        <Select
          value={selectedCategory}
          onChange={(e) => onCategoryChange(e.target.value)}
          size="small"
          fullWidth
          sx={{ fontSize: '0.85rem' }}
        >
          {categories.map((cat) => (
            <MenuItem key={cat.name} value={cat.name}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                {t(`admin.cat.${cat.name}`, cat.name)}
                <Chip
                  label={cat.tier === 'l3' ? t('admin.logicBadge', 'Logic') : t('admin.displayOnly', 'Display')}
                  size="small"
                  variant="outlined"
                  sx={{ height: 18, fontSize: '0.65rem', ml: 'auto', flexShrink: 0 }}
                />
              </Box>
            </MenuItem>
          ))}
        </Select>
      </Box>
      <List disablePadding sx={{ overflowY: 'auto', flex: 1 }}>
        {listItems.map((item) => (
          <ListItemButton
            key={item.id}
            selected={item.id === selectedFamilyId}
            onClick={() => onFamilyChange(item.id)}
            sx={{
              py: 1,
              px: 2,
              '&.Mui-selected': { bgcolor: 'action.selected' },
            }}
          >
            <ListItemText
              primary={item.name}
              primaryTypographyProps={{
                variant: 'body2',
                fontWeight: item.id === selectedFamilyId ? 600 : 400,
              }}
            />
            {/* Atlas dictionary indicator (L3 only) */}
            {!items && indicatorFamilyIds?.has(item.id) && (
              <Tooltip title={t('admin.atlasDictAvailable')} arrow>
                <TranslateOutlinedIcon sx={{ fontSize: 14, opacity: 0.5, ml: 0.5, flexShrink: 0 }} />
              </Tooltip>
            )}
            {/* L2 display chip on items */}
            {selectedCatEntry?.tier === 'l2' && (
              <Chip
                label={t('admin.displayOnly', 'Display')}
                size="small"
                variant="outlined"
                sx={{ height: 16, fontSize: '0.6rem', ml: 0.5, flexShrink: 0, opacity: 0.6 }}
              />
            )}
          </ListItemButton>
        ))}
      </List>
    </Box>
  );
}
