'use client';

import {
  Box,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Select,
} from '@mui/material';
import { LogicTable } from '@/lib/types';

interface FamilyPickerProps {
  tables: LogicTable[];
  categories: string[];
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  selectedFamilyId: string;
  onFamilyChange: (familyId: string) => void;
}

export default function FamilyPicker({
  tables,
  categories,
  selectedCategory,
  onCategoryChange,
  selectedFamilyId,
  onFamilyChange,
}: FamilyPickerProps) {
  const filtered = tables.filter((t) => t.category === selectedCategory);

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
            <MenuItem key={cat} value={cat}>
              {cat}
            </MenuItem>
          ))}
        </Select>
      </Box>
      <List disablePadding sx={{ overflowY: 'auto', flex: 1 }}>
        {filtered.map((table) => (
          <ListItemButton
            key={table.familyId}
            selected={table.familyId === selectedFamilyId}
            onClick={() => onFamilyChange(table.familyId)}
            sx={{
              py: 1,
              px: 2,
              '&.Mui-selected': { bgcolor: 'action.selected' },
            }}
          >
            <ListItemText
              primary={table.familyName}
              primaryTypographyProps={{
                variant: 'body2',
                fontWeight: table.familyId === selectedFamilyId ? 600 : 400,
              }}
            />
          </ListItemButton>
        ))}
      </List>
    </Box>
  );
}
