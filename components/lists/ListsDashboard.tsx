'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Button,
  IconButton,
  InputBase,
  Paper,
  Skeleton,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { PartsListSummary } from '@/lib/partsListStorage';
import {
  getSavedListsSupabase,
  deletePartsListSupabase,
  updatePartsListDetailsSupabase,
} from '@/lib/supabasePartsListStorage';
import { setPendingFile } from '@/lib/pendingFile';
import ListCard from './ListCard';
import NewListDialog from './NewListDialog';

const PINNED_KEY = 'xrefs_pinned_lists';

function loadPinnedIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(PINNED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function savePinnedIds(ids: Set<string>): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PINNED_KEY, JSON.stringify([...ids]));
}

export default function ListsDashboard() {
  const router = useRouter();
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [lists, setLists] = useState<PartsListSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => loadPinnedIds());

  // Drag-and-drop state
  const [isDragging, setIsDragging] = useState(false);

  // NewListDialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Load lists on mount
  useEffect(() => {
    getSavedListsSupabase().then((data) => {
      setLists(data);
      setLoading(false);
    });
  }, []);

  // Client-side filtering + sort pinned to top
  const filteredLists = useMemo(() => {
    let result = lists;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((l) => l.name.toLowerCase().includes(q));
    }
    return [...result].sort((a, b) => {
      const aPinned = pinnedIds.has(a.id) ? 1 : 0;
      const bPinned = pinnedIds.has(b.id) ? 1 : 0;
      return bPinned - aPinned;
    });
  }, [lists, searchQuery, pinnedIds]);

  // --- File handling ---

  const handleFile = useCallback((file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !['xlsx', 'xls', 'csv'].includes(ext)) return;
    setSelectedFile(file);
    setDialogOpen(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      // Reset so same file can be re-selected
      if (e.target) e.target.value = '';
    },
    [handleFile],
  );

  // --- Actions ---

  const handleNewListClick = () => {
    fileInputRef.current?.click();
  };

  const handleDialogConfirm = (name: string, description: string) => {
    if (!selectedFile) return;
    setPendingFile(selectedFile, name, description);
    setDialogOpen(false);
    setSelectedFile(null);
    router.push('/parts-list');
  };

  const handleDialogCancel = () => {
    setDialogOpen(false);
    setSelectedFile(null);
  };

  const handleCardClick = (id: string) => {
    router.push(`/parts-list?listId=${id}`);
  };

  const handleDelete = async (id: string) => {
    await deletePartsListSupabase(id);
    setLists((prev) => prev.filter((l) => l.id !== id));
  };

  const handleTogglePin = useCallback((id: string) => {
    setPinnedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      savePinnedIds(next);
      return next;
    });
  }, []);

  // Settings dialog state
  const [settingsList, setSettingsList] = useState<PartsListSummary | null>(null);

  const handleSettingsSave = useCallback(async (name: string, description: string) => {
    if (!settingsList) return;
    await updatePartsListDetailsSupabase(settingsList.id, name, description);
    setLists(prev => prev.map(l =>
      l.id === settingsList.id ? { ...l, name, description } : l,
    ));
    setSettingsList(null);
  }, [settingsList]);

  return (
    <Box
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        bgcolor: 'background.default',
        position: 'relative',
      }}
    >
      {/* Drag overlay */}
      {isDragging && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            zIndex: 10,
            bgcolor: 'rgba(160, 196, 255, 0.06)',
            border: '2px dashed',
            borderColor: 'primary.main',
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <Typography variant="h6" color="primary.main" sx={{ opacity: 0.8 }}>
            {t('lists.dragDropOverlay')}
          </Typography>
        </Box>
      )}

      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 3,
          py: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton onClick={() => router.push('/')} size="small" sx={{ color: 'text.secondary' }}>
            <ArrowBackIcon fontSize="small" />
          </IconButton>
          <Typography variant="body2" color="text.secondary">
            {t('lists.pageHeader')}
          </Typography>
        </Box>

        <Button
          variant="contained"
          size="small"
          startIcon={<AddIcon />}
          onClick={handleNewListClick}
          sx={{ borderRadius: 20, textTransform: 'none' }}
        >
          {t('lists.newListButton')}
        </Button>
      </Box>

      {/* Content area */}
      <Box sx={{ flex: 1, overflow: 'auto', px: { xs: 2, md: 4 }, py: 3, display: 'flex', flexDirection: 'column' }}>
        {/* Search bar */}
        <Box sx={{ maxWidth: 480, mb: 3, mx: 'auto' }}>
          <Paper
            elevation={0}
            sx={{
              display: 'flex',
              alignItems: 'center',
              px: 2,
              py: 0.5,
              borderRadius: 3,
              bgcolor: 'background.paper',
              border: 1,
              borderColor: 'divider',
              transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
              '&:focus-within': {
                borderColor: 'primary.main',
                boxShadow: (theme) =>
                  `0 0 0 2px ${theme.palette.primary.main}25`,
              },
            }}
          >
            <SearchIcon sx={{ color: 'text.secondary', mr: 1.5, fontSize: 22 }} />
            <InputBase
              fullWidth
              placeholder={t('lists.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              sx={{ fontSize: '0.95rem', py: 0.75 }}
            />
          </Paper>
        </Box>

        {/* Loading skeleton */}
        {loading && (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                sm: 'repeat(2, 1fr)',
                md: 'repeat(3, 1fr)',
              },
              gap: 2,
            }}
          >
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton
                key={i}
                variant="rounded"
                height={120}
                sx={{ borderRadius: 3 }}
              />
            ))}
          </Box>
        )}

        {/* Empty state — no lists at all */}
        {!loading && lists.length === 0 && (
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CloudUploadIcon
              sx={{ fontSize: 48, color: 'text.secondary', mb: 2, opacity: 0.5 }}
            />
            <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
              {t('lists.emptyHeading')}
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mb: 3 }}
            >
              {t('lists.emptySubheading')}
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleNewListClick}
              sx={{ borderRadius: 20, textTransform: 'none' }}
            >
              {t('lists.newListButton')}
            </Button>
          </Box>
        )}

        {/* Empty state — search yields no results */}
        {!loading && lists.length > 0 && filteredLists.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <Typography variant="body2" color="text.secondary">
              {t('lists.noMatching', { query: searchQuery })}
            </Typography>
          </Box>
        )}

        {/* Cards — masonry layout */}
        {!loading && filteredLists.length > 0 && (
          <Box
            sx={{
              columns: { xs: 1, sm: 2, md: 3 },
              columnGap: 2,
            }}
          >
            {filteredLists.map((list) => (
              <ListCard
                key={list.id}
                list={list}
                pinned={pinnedIds.has(list.id)}
                onClick={() => handleCardClick(list.id)}
                onDelete={() => handleDelete(list.id)}
                onTogglePin={() => handleTogglePin(list.id)}
                onSettings={() => setSettingsList(list)}
              />
            ))}
          </Box>
        )}
      </Box>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleInputChange}
        style={{ display: 'none' }}
      />

      {/* New list dialog */}
      <NewListDialog
        open={dialogOpen}
        fileName={selectedFile?.name ?? ''}
        onConfirm={handleDialogConfirm}
        onCancel={handleDialogCancel}
      />

      {/* List settings dialog */}
      <NewListDialog
        open={settingsList !== null}
        fileName=""
        mode="edit"
        initialName={settingsList?.name ?? ''}
        initialDescription={settingsList?.description ?? ''}
        onConfirm={handleSettingsSave}
        onCancel={() => setSettingsList(null)}
      />
    </Box>
  );
}
