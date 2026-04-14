'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Button,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ClearIcon from '@mui/icons-material/Clear';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import { PartType } from '@/lib/types';

const PART_TYPES: PartType[] = ['electronic', 'mechanical', 'pcb', 'custom', 'other'];

interface PartsListActionBarProps {
  selectionCount: number;
  visibleRowCount: number;
  searchedRowCount: number;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onRefresh: () => void;
  onDelete: () => void;
  onAddPart: () => void;
  onSetPartType?: (partType: PartType) => void;
}

export default function PartsListActionBar({
  selectionCount,
  visibleRowCount,
  searchedRowCount,
  searchTerm,
  onSearchChange,
  onRefresh,
  onDelete,
  onAddPart,
  onSetPartType,
}: PartsListActionBarProps) {
  const { t } = useTranslation();
  const [typeMenuAnchor, setTypeMenuAnchor] = useState<HTMLElement | null>(null);

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 3,
        py: 0.75,
        borderBottom: 1,
        borderColor: 'divider',
        flexShrink: 0,
      }}
    >
      <Typography variant="caption" color="text.secondary" sx={{ minWidth: 100 }}>
        {selectionCount > 0
          ? t('partsList.selectedCount', { selected: selectionCount, total: visibleRowCount })
          : searchTerm.trim()
            ? t('partsList.searchCount', { filtered: searchedRowCount, total: visibleRowCount, defaultValue: '{{filtered}} of {{total}} parts' })
            : t('partsList.partsCount', { count: visibleRowCount })}
      </Typography>

      <Tooltip title={t('partsList.refreshTooltip')}>
        <span>
          <Button
            size="small"
            startIcon={<RefreshIcon sx={{ fontSize: 16 }} />}
            disabled={selectionCount === 0}
            onClick={onRefresh}
            sx={{ fontSize: '0.78rem', textTransform: 'none', color: 'text.secondary' }}
          >
            {t('partsList.refreshButton')}
          </Button>
        </span>
      </Tooltip>

      <Tooltip title={t('partsList.deleteTooltip')}>
        <span>
          <Button
            size="small"
            startIcon={<DeleteOutlineIcon sx={{ fontSize: 16 }} />}
            disabled={selectionCount === 0}
            onClick={onDelete}
            sx={{ fontSize: '0.78rem', textTransform: 'none', color: 'text.secondary' }}
          >
            {t('partsList.deleteButton')}
          </Button>
        </span>
      </Tooltip>

      <Button
        size="small"
        startIcon={<AddIcon sx={{ fontSize: 16 }} />}
        onClick={onAddPart}
        sx={{ fontSize: '0.78rem', textTransform: 'none', color: 'text.secondary' }}
      >
        {t('partsList.addPart')}
      </Button>

      {onSetPartType && (
        <>
          <Tooltip title={t('partType.setPartType')}>
            <span>
              <Button
                size="small"
                startIcon={<CategoryOutlinedIcon sx={{ fontSize: 16 }} />}
                disabled={selectionCount === 0}
                onClick={(e) => setTypeMenuAnchor(e.currentTarget)}
                sx={{ fontSize: '0.78rem', textTransform: 'none', color: 'text.secondary' }}
              >
                {t('partType.setPartType')}
              </Button>
            </span>
          </Tooltip>
          <Menu
            anchorEl={typeMenuAnchor}
            open={Boolean(typeMenuAnchor)}
            onClose={() => setTypeMenuAnchor(null)}
            slotProps={{ paper: { sx: { minWidth: 140 } } }}
          >
            {PART_TYPES.map(pt => (
              <MenuItem
                key={pt}
                onClick={() => { onSetPartType(pt); setTypeMenuAnchor(null); }}
                sx={{ fontSize: '0.82rem' }}
              >
                {t(`partType.${pt}`)}
              </MenuItem>
            ))}
          </Menu>
        </>
      )}

      <TextField
        size="small"
        placeholder={t('partsList.searchPlaceholder', { defaultValue: 'Search…' })}
        value={searchTerm}
        onChange={e => onSearchChange(e.target.value)}
        sx={{ ml: 'auto', maxWidth: 250 }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
              </InputAdornment>
            ),
            endAdornment: searchTerm ? (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => onSearchChange('')} sx={{ p: 0.25 }}>
                  <ClearIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </InputAdornment>
            ) : null,
            sx: { fontSize: '0.82rem' },
          },
        }}
      />
    </Box>
  );
}
