'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Box, Button, IconButton, Popover, Stack, TextField, Tooltip, Typography, CircularProgress,
} from '@mui/material';
import NoteAltOutlinedIcon from '@mui/icons-material/NoteAltOutlined';
import NoteAltIcon from '@mui/icons-material/NoteAlt';

export type NoteRecord = {
  paramName: string;
  note: string;
  /** Triage status for the row — null is the default (open synonym mapping
   *  case or free-form note). 'wrong_family' = engineer Confirmed a registry
   *  auto-flag (or manually flagged). 'confirmed_in_family' = engineer
   *  rejected an auto-flag, suppressing the registry hit for this paramName. */
  status?: 'wrong_family' | 'confirmed_in_family' | 'unmappable' | null;
  flaggedBy?: 'auto' | 'engineer' | null;
  autoDiagnosis?: Record<string, unknown> | null;
  /** Generic engineer bookmark — independent of `status`. Set via the flag
   *  toggle icon in the Triage row UI; used to mark a row for later review
   *  without committing to a specific status. */
  flagged?: boolean;
  updatedBy: string;
  updatedByName: string;
  updatedAt: string;
  createdAt: string;
};

interface Props {
  paramName: string;
  note: NoteRecord | undefined;
  onChange: (paramName: string, next: NoteRecord | null) => void;
  /** Pre-fill text from the per-row AI suggestion's explanation (defer-only).
   *  Seeded into the textarea ONLY when no existing note is present — the
   *  user's saved note always wins. */
  aiDraft?: string | null;
  /** When true AND no existing note, color the icon button warning.main as a
   *  visual cue that an AI draft is waiting. The only nudge in the row — Accept
   *  button styling stays unchanged regardless of suggestion. */
  aiDraftHint?: boolean;
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function UnmappedParamNoteCell({ paramName, note, onChange, aiDraft, aiDraftHint }: Props) {
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const [draft, setDraft] = useState(note?.note ?? '');
  // Tracks whether the current draft was seeded from aiDraft (vs typed by the
  // user vs loaded from an existing note). Drives the "Pre-filled by AI"
  // caption above the textarea.
  const [draftSeededFromAI, setDraftSeededFromAI] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = Boolean(anchorEl);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Reset draft to current note whenever the popover opens or the note prop
  // updates upstream (someone else edited it on the server). When no existing
  // note AND aiDraft is non-empty, seed with aiDraft so the engineer can edit
  // and Save instead of pasting from a separate browser tab.
  useEffect(() => {
    if (open) {
      if (note?.note) {
        setDraft(note.note);
        setDraftSeededFromAI(false);
      } else if (aiDraft && aiDraft.trim()) {
        setDraft(aiDraft);
        setDraftSeededFromAI(true);
      } else {
        setDraft('');
        setDraftSeededFromAI(false);
      }
    }
  }, [open, note?.note, aiDraft]);

  const close = () => {
    setAnchorEl(null);
    setError(null);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/atlas/unmapped-param-notes/${encodeURIComponent(paramName)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: draft }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Save failed');
      }
      // Empty draft → server deleted the row; reflect locally.
      if (json.deleted || !draft.trim()) {
        onChange(paramName, null);
      } else if (json.item) {
        onChange(paramName, json.item as NoteRecord);
      }
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/atlas/unmapped-param-notes/${encodeURIComponent(paramName)}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Delete failed');
      }
      onChange(paramName, null);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setSaving(false);
    }
  };

  const hasNote = !!note;
  // Only show the AI draft hint color when an AI draft is actually waiting AND
  // the user hasn't already written their own note. Once a note exists, the
  // primary-color "saved note" state takes over.
  const showAiHint = !!aiDraftHint && !hasNote && !!aiDraft && aiDraft.trim().length > 0;
  const tooltipBody = hasNote
    ? `${note!.note.length > 100 ? `${note!.note.slice(0, 100)}…` : note!.note}\n— by ${note!.updatedByName} · ${formatRelative(note!.updatedAt)}`
    : showAiHint
      ? 'AI draft ready — open to review and save'
      : 'Add a team note';

  // Three icon-color states (highest priority first):
  //   hasNote      → primary.main  (saved note exists)
  //   showAiHint   → warning.main  (AI draft waiting; user should review)
  //   default      → text.disabled (no note, no draft)
  const iconColor = hasNote ? 'primary.main' : showAiHint ? 'warning.main' : 'text.disabled';
  const iconHoverColor = hasNote ? 'primary.light' : showAiHint ? 'warning.light' : 'text.secondary';

  return (
    <>
      <Tooltip title={<Box sx={{ whiteSpace: 'pre-wrap' }}>{tooltipBody}</Box>} placement="right" arrow>
        <IconButton
          ref={buttonRef}
          size="small"
          onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={{
            color: iconColor,
            '&:hover': { color: iconHoverColor },
          }}
          aria-label={hasNote ? 'Edit team note' : showAiHint ? 'Review AI-drafted note' : 'Add team note'}
        >
          {hasNote || showAiHint ? <NoteAltIcon fontSize="small" /> : <NoteAltOutlinedIcon fontSize="small" />}
        </IconButton>
      </Tooltip>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{ paper: { sx: { p: 2, width: 640, maxWidth: '90vw' } } }}
      >
        <Stack spacing={1}>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
            Team note · {paramName}
          </Typography>
          {draftSeededFromAI && (
            <Typography variant="caption" sx={{ color: 'warning.main', fontStyle: 'italic' }}>
              Pre-filled by AI — edit before saving.
            </Typography>
          )}
          <TextField
            multiline
            minRows={8}
            maxRows={20}
            autoFocus
            fullWidth
            placeholder="Capture reasoning, research, or open questions for this parameter…"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              // First user keystroke clears the "from AI" marker — caption hides
              // because it's now the engineer's text.
              if (draftSeededFromAI) setDraftSeededFromAI(false);
            }}
            disabled={saving}
            inputProps={{ maxLength: 5000 }}
          />
          {hasNote && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Last edited by {note!.updatedByName} · {formatRelative(note!.updatedAt)}
            </Typography>
          )}
          {error && (
            <Typography variant="caption" sx={{ color: 'error.main' }}>{error}</Typography>
          )}
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            {hasNote && (
              <Button
                size="small"
                color="error"
                onClick={remove}
                disabled={saving}
              >
                Delete
              </Button>
            )}
            <Button size="small" onClick={close} disabled={saving}>Cancel</Button>
            <Button
              size="small"
              variant="contained"
              onClick={save}
              disabled={saving || draft === (note?.note ?? '')}
              startIcon={saving ? <CircularProgress size={12} color="inherit" /> : null}
            >
              Save
            </Button>
          </Stack>
        </Stack>
      </Popover>
    </>
  );
}
