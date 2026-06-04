'use client';

import { useState, MouseEvent } from 'react';
import {
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { AppFeedbackListItem } from '@/lib/types';
import { deleteAppFeedback } from '@/lib/api';

interface Props {
  feedback: AppFeedbackListItem;
  viewerRole: 'user' | 'admin';
  /** Called after a successful delete. Parent should drop the row locally. */
  onDeleted: (feedbackId: string) => void;
  /** Optional sx applied to the kebab button. */
  size?: 'small' | 'medium';
}

export default function FeedbackRowMenu({ feedback, viewerRole, onDeleted, size = 'small' }: Props) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuOpen = Boolean(anchorEl);

  const handleKebabClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setAnchorEl(e.currentTarget);
  };

  const handleMenuClose = (e?: object) => {
    if (e && 'stopPropagation' in (e as Event)) (e as Event).stopPropagation();
    setAnchorEl(null);
  };

  const handleDeleteClick = (e: MouseEvent<HTMLLIElement>) => {
    e.stopPropagation();
    setAnchorEl(null);
    setConfirmOpen(true);
  };

  const handleConfirmCancel = () => {
    if (deleting) return;
    setConfirmOpen(false);
    setError(null);
  };

  const handleConfirmDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await deleteAppFeedback(feedback.id);
      setConfirmOpen(false);
      onDeleted(feedback.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  const confirmCopy = viewerRole === 'user'
    ? 'This permanently deletes the entire thread — your original submission, every comment from both sides, and any attached images. It cannot be undone, and the admin will no longer see this feedback either.'
    : 'This permanently deletes the entire thread for both you and the user — the original submission, every comment, and any attached images. It cannot be undone, and the user will no longer see this feedback.';

  return (
    <>
      <IconButton
        size={size}
        onClick={handleKebabClick}
        aria-label="Open feedback actions"
        sx={{ color: 'text.secondary', '&:hover': { color: 'text.primary' } }}
      >
        <MoreVertIcon fontSize={size === 'small' ? 'small' : 'medium'} />
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        open={menuOpen}
        onClose={handleMenuClose}
        onClick={(e) => e.stopPropagation()}
        slotProps={{ paper: { sx: { minWidth: 180 } } }}
      >
        <MenuItem onClick={handleDeleteClick} sx={{ color: 'error.main' }}>
          <ListItemIcon sx={{ color: 'error.main' }}>
            <DeleteOutlineIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Delete thread" />
        </MenuItem>
      </Menu>

      <Dialog
        open={confirmOpen}
        onClose={handleConfirmCancel}
        onClick={(e) => e.stopPropagation()}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontSize: '1rem' }}>Delete this feedback thread?</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ fontSize: '0.86rem' }}>
            {confirmCopy}
          </DialogContentText>
          {error && (
            <DialogContentText color="error" sx={{ fontSize: '0.78rem', mt: 1 }}>
              {error}
            </DialogContentText>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleConfirmCancel} disabled={deleting} color="inherit">
            Cancel
          </Button>
          <Button onClick={handleConfirmDelete} disabled={deleting} color="error" variant="contained">
            {deleting ? 'Deleting…' : 'Delete thread'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
