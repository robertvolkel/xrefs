'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Divider, TextField, IconButton, Button, CircularProgress,
} from '@mui/material';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { PAGE_HEADER_HEIGHT } from '@/lib/layoutConstants';
import { useProfile } from '@/lib/hooks/useProfile';
import { createReleaseNote, updateReleaseNote, deleteReleaseNote } from '@/lib/api';
import type { ReleaseNote } from '@/lib/types';

export default function ReleasesShell() {
  const { isAdmin } = useProfile();
  const [notes, setNotes] = useState<ReleaseNote[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  // Fetch notes + mark as seen
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/releases', { signal: controller.signal })
      .then((res) => res.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          setNotes(json.data);
          if (json.data.length > 0) {
            localStorage.setItem('lastSeenReleasesAt', json.data[0].createdAt);
            window.dispatchEvent(new Event('releases-seen'));
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
    return () => controller.abort();
  }, []);

  const handleCreate = useCallback(async () => {
    const text = newContent.trim();
    if (!text) return;

    // Optimistic: show immediately
    const optimisticId = `temp-${Date.now()}`;
    const now = new Date().toISOString();
    const optimistic: ReleaseNote = {
      id: optimisticId, content: text, createdBy: '', createdAt: now, updatedAt: now,
    };
    setNotes((prev) => [optimistic, ...prev]);
    setNewContent('');
    localStorage.setItem('lastSeenReleasesAt', now);
    window.dispatchEvent(new Event('releases-seen'));

    try {
      const note = await createReleaseNote(text);
      // Replace optimistic with real
      setNotes((prev) => prev.map((n) => n.id === optimisticId ? note : n));
      localStorage.setItem('lastSeenReleasesAt', note.createdAt);
    } catch {
      // Revert on failure
      setNotes((prev) => prev.filter((n) => n.id !== optimisticId));
    }
  }, [newContent]);

  const handleUpdate = useCallback(async (id: string) => {
    if (!editContent.trim()) return;
    try {
      await updateReleaseNote(id, editContent.trim());
      setNotes((prev) =>
        prev.map((n) =>
          n.id === id
            ? { ...n, content: editContent.trim(), updatedAt: new Date().toISOString() }
            : n,
        ),
      );
      setEditingId(null);
    } catch { /* ignore */ }
  }, [editContent]);

  const handleDelete = useCallback(async (id: string) => {
    // Optimistic: remove immediately
    const snapshot = notes;
    setNotes((prev) => prev.filter((n) => n.id !== id));
    try {
      await deleteReleaseNote(id);
    } catch {
      // Revert on failure
      setNotes(snapshot);
    }
  }, [notes]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: 'background.default' }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: 3,
          height: PAGE_HEADER_HEIGHT,
          minHeight: PAGE_HEADER_HEIGHT,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Typography variant="h6" fontWeight={400} color="text.secondary" sx={{ lineHeight: 1 }}>
          Release Notes
        </Typography>
      </Box>

      {/* Scrollable content */}
      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        <Box sx={{ maxWidth: 720, mx: 'auto', px: 3, py: 4 }}>
          {/* Admin create form */}
          {isAdmin && (
            <Box sx={{ mb: 3 }}>
              <TextField
                multiline
                minRows={2}
                placeholder="What's new..."
                value={newContent}
                onChange={(e) => setNewContent(e.target.value.slice(0, 1000))}
                size="small"
                fullWidth
                slotProps={{ htmlInput: { maxLength: 1000 } }}
                sx={{ '& .MuiInputBase-root': { fontSize: '0.85rem' } }}
              />
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
                <Button
                  variant="contained"
                  size="small"
                  onClick={handleCreate}
                  disabled={!newContent.trim()}
                  sx={{ textTransform: 'none', fontSize: '0.8rem' }}
                >
                  Post
                </Button>
              </Box>
            </Box>
          )}

          {!loaded && (
            <CircularProgress size={20} sx={{ display: 'block', mx: 'auto', mt: 4 }} />
          )}

          {loaded && notes.length === 0 && (
            <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ mt: 4 }}>
              No release notes yet.
            </Typography>
          )}

          {notes.map((note, i) => (
            <Box key={note.id}>
              {editingId === note.id ? (
                /* Edit mode */
                <Box sx={{ display: 'flex', gap: 1, py: 2 }}>
                  <TextField
                    multiline
                    minRows={1}
                    maxRows={4}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value.slice(0, 1000))}
                    size="small"
                    fullWidth
                    slotProps={{ htmlInput: { maxLength: 1000 } }}
                    sx={{ '& .MuiInputBase-root': { fontSize: '0.85rem' } }}
                  />
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    <IconButton size="small" onClick={() => handleUpdate(note.id)}>
                      <CheckIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => setEditingId(null)}>
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </Box>
              ) : (
                /* Display mode */
                <Box sx={{ py: 2 }}>
                  <Typography variant="subtitle1" color="text.primary" fontWeight={500} sx={{ mb: 1 }}>
                    {new Date(note.createdAt).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, color: 'text.secondary' }}
                  >
                    {note.content}
                  </Typography>
                  {isAdmin && (
                    <Box sx={{ display: 'flex', gap: 0.5, mt: 1 }}>
                      <IconButton
                        size="small"
                        onClick={() => {
                          setEditingId(note.id);
                          setEditContent(note.content);
                        }}
                        sx={{ p: 0.25 }}
                      >
                        <EditOutlinedIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => handleDelete(note.id)}
                        sx={{ p: 0.25 }}
                      >
                        <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Box>
                  )}
                </Box>
              )}
              {i < notes.length - 1 && <Divider />}
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
