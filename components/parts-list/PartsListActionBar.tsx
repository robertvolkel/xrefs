'use client';

import { useTranslation } from 'react-i18next';
import {
  Box,
  Button,
  IconButton,
  InputAdornment,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ClearIcon from '@mui/icons-material/Clear';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';

interface PartsListActionBarProps {
  selectionCount: number;
  visibleRowCount: number;
  searchedRowCount: number;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onRefresh: () => void;
  onDelete: () => void;
}

export default function PartsListActionBar({
  selectionCount,
  visibleRowCount,
  searchedRowCount,
  searchTerm,
  onSearchChange,
  onRefresh,
  onDelete,
}: PartsListActionBarProps) {
  const { t } = useTranslation();

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
