'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputBase,
  Paper,
  Skeleton,
  Typography,
} from '@mui/material';
import { PAGE_HEADER_HEIGHT } from '@/lib/layoutConstants';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { PartsListSummary } from '@/lib/partsListStorage';
import { classifyListTheme } from '@/lib/themeClassifier';
import {
  getSavedListsSupabase,
  deletePartsListSupabase,
  updatePartsListDetailsSupabase,
} from '@/lib/supabasePartsListStorage';
import { setPendingFile, setPendingParsedData } from '@/lib/pendingFile';
import { ParsedSpreadsheet } from '@/lib/types';
import { useViewConfig } from '@/hooks/useViewConfig';
import ListCard from './ListCard';
import NewListDialog from './NewListDialog';
import InputMethodDialog from './InputMethodDialog';

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
  const { views } = useViewConfig();
  const [lists, setLists] = useState<PartsListSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => loadPinnedIds());

  // Drag-and-drop state
  const [isDragging, setIsDragging] = useState(false);

  // InputMethodDialog state
  const [inputMethodOpen, setInputMethodOpen] = useState(false);

  // NewListDialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedFromPaste, setParsedFromPaste] = useState<ParsedSpreadsheet | null>(null);

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
      result = result.filter((l) =>
        l.name.toLowerCase().includes(q) ||
        (l.customer && l.customer.toLowerCase().includes(q)),
      );
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

  // --- Actions ---

  const handleNewListClick = () => {
    setInputMethodOpen(true);
  };

  const handleInputMethodFile = useCallback((file: File) => {
    setInputMethodOpen(false);
    setSelectedFile(file);
    setDialogOpen(true);
  }, []);

  const handleInputMethodPaste = useCallback((parsed: ParsedSpreadsheet) => {
    setInputMethodOpen(false);
    setParsedFromPaste(parsed);
    setDialogOpen(true);
  }, []);

  const handleDialogConfirm = (name: string, description: string, _currency: string, customer: string, defaultViewId: string) => {
    if (parsedFromPaste) {
      setPendingParsedData(parsedFromPaste, name, description, customer, defaultViewId);
      setDialogOpen(false);
      setParsedFromPaste(null);
      router.push('/parts-list');
    } else if (selectedFile) {
      setPendingFile(selectedFile, name, description, customer, defaultViewId);
      setDialogOpen(false);
      setSelectedFile(null);
      router.push('/parts-list');
    }
  };

  const handleDialogCancel = () => {
    setDialogOpen(false);
    setSelectedFile(null);
    setParsedFromPaste(null);
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

  // Currency-change refresh confirmation
  const [refreshPrompt, setRefreshPrompt] = useState<{ listId: string; currency: string } | null>(null);

  const handleSettingsSave = useCallback(async (name: string, description: string, currency: string, customer: string, defaultViewId: string) => {
    if (!settingsList) return;
    const currencyChanged = currency !== (settingsList.currency ?? 'USD');
    await updatePartsListDetailsSupabase(settingsList.id, name, description, currency, customer, defaultViewId);
    const themeIcon = classifyListTheme(name, description, customer);
    setLists(prev => prev.map(l =>
      l.id === settingsList.id ? { ...l, name, description, currency, customer, defaultViewId, themeIcon } : l,
    ));
    setSettingsList(null);
    if (currencyChanged) {
      setRefreshPrompt({ listId: settingsList.id, currency });
    }
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
          height: PAGE_HEADER_HEIGHT,
          borderBottom: 1,
          borderColor: 'divider',
          flexShrink: 0,
        }}
      >
        <Typography variant="h6" fontWeight={400} color="text.secondary" sx={{ lineHeight: 1 }}>
          {t('lists.pageHeader')}
        </Typography>

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
        {/* Search bar — only show when lists exist */}
        {!loading && lists.length > 0 && <Box sx={{ maxWidth: 600, width: '100%', mb: 3, mx: 'auto' }}>
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
        </Box>}

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

      {/* Input method chooser (Upload / Paste) */}
      <InputMethodDialog
        open={inputMethodOpen}
        onFileSelected={handleInputMethodFile}
        onTextParsed={handleInputMethodPaste}
        onCancel={() => setInputMethodOpen(false)}
      />

      {/* New list dialog */}
      <NewListDialog
        open={dialogOpen}
        fileName={selectedFile?.name ?? (parsedFromPaste ? parsedFromPaste.fileName : '')}
        onConfirm={handleDialogConfirm}
        onCancel={handleDialogCancel}
        views={views}
      />

      {/* List settings dialog */}
      <NewListDialog
        open={settingsList !== null}
        fileName=""
        mode="edit"
        initialName={settingsList?.name ?? ''}
        initialDescription={settingsList?.description ?? ''}
        initialCurrency={settingsList?.currency ?? 'USD'}
        initialCustomer={settingsList?.customer ?? ''}
        initialDefaultViewId={settingsList?.defaultViewId ?? ''}
        onConfirm={handleSettingsSave}
        onCancel={() => setSettingsList(null)}
        views={views}
      />

      {/* Currency-change refresh confirmation */}
      <Dialog
        open={refreshPrompt !== null}
        onClose={() => setRefreshPrompt(null)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, bgcolor: 'background.paper' } }}
      >
        <DialogTitle sx={{ fontWeight: 600 }}>
          {t('lists.currencyChangedTitle')}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {t('lists.currencyChangedMessage', { currency: refreshPrompt?.currency })}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button
            onClick={() => setRefreshPrompt(null)}
            sx={{ borderRadius: 20, textTransform: 'none' }}
          >
            {t('lists.notNowButton')}
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              if (refreshPrompt) {
                router.push(`/parts-list?listId=${refreshPrompt.listId}&refresh=true`);
              }
              setRefreshPrompt(null);
            }}
            sx={{ borderRadius: 20, textTransform: 'none' }}
          >
            {t('lists.refreshButton')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
