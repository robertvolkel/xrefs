'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Stack,
  Chip,
  Button,
  IconButton,
  TextField,
  Collapse,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import { AppFeedbackListItem, AppFeedbackStatus, AppFeedbackCategory } from '@/lib/types';
import { updateAppFeedback } from '@/lib/api';

interface Props {
  item: AppFeedbackListItem;
  onBack: () => void;
  onUpdated: () => Promise<void> | void;
}

function statusChipColor(status: AppFeedbackStatus): 'default' | 'warning' | 'info' | 'success' {
  switch (status) {
    case 'open': return 'warning';
    case 'reviewed': return 'info';
    case 'resolved': return 'success';
    case 'dismissed': return 'default';
  }
}

function categoryIcon(category: AppFeedbackCategory) {
  switch (category) {
    case 'idea': return <LightbulbOutlinedIcon sx={{ fontSize: '1rem' }} />;
    case 'issue': return <BugReportOutlinedIcon sx={{ fontSize: '1rem' }} />;
    case 'other': return <ChatBubbleOutlineIcon sx={{ fontSize: '1rem' }} />;
  }
}

function categoryLabel(category: AppFeedbackCategory): string {
  switch (category) {
    case 'idea': return 'Idea';
    case 'issue': return 'Issue';
    case 'other': return 'Other';
  }
}

function formatAbsolute(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} mo ago`;
  return `${Math.round(months / 12)} yr ago`;
}

export default function AppFeedbackDetailView({ item, onBack, onUpdated }: Props) {
  const [status, setStatus] = useState<AppFeedbackStatus>(item.status);
  const [adminNotes, setAdminNotes] = useState<string>(item.adminNotes ?? '');
  const [saving, setSaving] = useState(false);
  const [techOpen, setTechOpen] = useState(false);

  const dirty = status !== item.status || adminNotes !== (item.adminNotes ?? '');

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateAppFeedback(item.id, {
        status: status !== item.status ? status : undefined,
        adminNotes: adminNotes !== (item.adminNotes ?? '') ? adminNotes : undefined,
      });
      await onUpdated();
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <Box sx={{ px: 3, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <IconButton size="small" onClick={onBack}>
            <ArrowBackIcon fontSize="small" />
          </IconButton>
          <Typography variant="subtitle1" sx={{ fontSize: '0.95rem', fontWeight: 600 }}>
            Feedback Detail
          </Typography>
        </Stack>
      </Box>

      {/* Body */}
      <Box sx={{ flex: 1, overflowY: 'auto', px: 3, py: 2 }}>
        <Stack spacing={2.5}>
          {/* Summary row */}
          <Stack direction="row" spacing={3} alignItems="flex-start" flexWrap="wrap" rowGap={2}>
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                User
              </Typography>
              <Typography variant="body2" sx={{ fontSize: '0.85rem', fontWeight: 500, mt: 0.25 }}>
                {item.userName || '—'}
              </Typography>
              {item.userEmail && (
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem', display: 'block' }}>
                  {item.userEmail}
                </Typography>
              )}
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Submitted
              </Typography>
              <Typography variant="body2" sx={{ fontSize: '0.85rem', fontWeight: 500, mt: 0.25 }}>
                {formatAbsolute(item.createdAt)}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem', display: 'block' }}>
                {formatRelative(item.createdAt)}
              </Typography>
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Category
              </Typography>
              <Box sx={{ mt: 0.5 }}>
                <Chip
                  icon={categoryIcon(item.category)}
                  label={categoryLabel(item.category)}
                  size="small"
                  variant="outlined"
                  sx={{ height: 24, fontSize: '0.75rem' }}
                />
              </Box>
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Status
              </Typography>
              <Box sx={{ mt: 0.5 }}>
                <Chip
                  label={item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                  size="small"
                  color={statusChipColor(item.status)}
                  variant="outlined"
                  sx={{ height: 24, fontSize: '0.75rem' }}
                />
              </Box>
            </Box>
          </Stack>

          {/* Comment */}
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Comment
            </Typography>
            <Box sx={{ mt: 0.5, p: 2, bgcolor: 'background.default', borderRadius: 1, border: 1, borderColor: 'divider' }}>
              <Typography variant="body2" sx={{ fontSize: '0.86rem', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                {item.userComment}
              </Typography>
            </Box>
          </Box>

          {/* Technical info */}
          {(item.userAgent || item.viewport) && (
            <Box>
              <Stack
                direction="row"
                alignItems="center"
                onClick={() => setTechOpen((v) => !v)}
                sx={{ cursor: 'pointer', userSelect: 'none' }}
              >
                {techOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                  Technical info
                </Typography>
              </Stack>
              <Collapse in={techOpen}>
                <Stack spacing={0.5} sx={{ mt: 1, pl: 3 }}>
                  {item.viewport && (
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem', fontFamily: 'monospace' }}>
                      viewport: {item.viewport}
                    </Typography>
                  )}
                  {item.userAgent && (
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                      user-agent: {item.userAgent}
                    </Typography>
                  )}
                </Stack>
              </Collapse>
            </Box>
          )}

          {/* Resolved metadata */}
          {item.resolvedAt && (
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
              {item.status === 'resolved' ? 'Resolved' : 'Dismissed'} by {item.resolvedByName || 'admin'} on {formatAbsolute(item.resolvedAt)}
            </Typography>
          )}

          {/* Status + notes editor */}
          <Box sx={{ pt: 2, borderTop: 1, borderColor: 'divider' }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Update
            </Typography>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <FormControl size="small" sx={{ maxWidth: 220 }}>
                <InputLabel id="app-feedback-status">Status</InputLabel>
                <Select
                  labelId="app-feedback-status"
                  label="Status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as AppFeedbackStatus)}
                >
                  <MenuItem value="open">Open</MenuItem>
                  <MenuItem value="reviewed">Reviewed</MenuItem>
                  <MenuItem value="resolved">Resolved</MenuItem>
                  <MenuItem value="dismissed">Dismissed</MenuItem>
                </Select>
              </FormControl>

              <TextField
                label="Admin notes"
                placeholder="Investigation notes, follow-up actions, context for future review…"
                multiline
                minRows={3}
                maxRows={8}
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                fullWidth
              />

              <Stack direction="row" spacing={1}>
                <Button
                  variant="contained"
                  size="small"
                  disabled={!dirty || saving}
                  onClick={handleSave}
                >
                  {saving ? 'Saving…' : 'Save'}
                </Button>
                <Button size="small" color="inherit" onClick={onBack}>
                  Back to list
                </Button>
              </Stack>
            </Stack>
          </Box>
        </Stack>
      </Box>
    </Box>
  );
}
