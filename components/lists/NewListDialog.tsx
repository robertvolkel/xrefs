'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
} from '@mui/material';

interface NewListDialogProps {
  open: boolean;
  fileName: string;
  onConfirm: (name: string, description: string) => void;
  onCancel: () => void;
}

/** Strip file extension to produce a default list name */
function defaultNameFromFile(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '');
}

export default function NewListDialog({
  open,
  fileName,
  onConfirm,
  onCancel,
}: NewListDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  // Reset fields when dialog opens with a new file
  useEffect(() => {
    if (open && fileName) {
      setName(defaultNameFromFile(fileName));
      setDescription('');
    }
  }, [open, fileName]);

  const canConfirm = name.trim().length > 0;

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: { borderRadius: 3, bgcolor: 'background.paper' },
      }}
    >
      <DialogTitle sx={{ pb: 1, fontWeight: 600 }}>
        Create a new list
      </DialogTitle>

      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: '16px !important' }}>
        <TextField
          label="What are you working on?"
          placeholder="Name your list"
          value={name}
          onChange={(e) => setName(e.target.value)}
          fullWidth
          autoFocus
          variant="outlined"
          slotProps={{ inputLabel: { shrink: true } }}
        />

        <TextField
          label="Describe your goals, requirements, constraints..."
          placeholder="e.g., Automotive power supply redesign, need AEC-Q200 qualified replacements"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          fullWidth
          multiline
          minRows={3}
          maxRows={6}
          variant="outlined"
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onCancel} sx={{ borderRadius: 20, textTransform: 'none' }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => onConfirm(name.trim(), description.trim())}
          disabled={!canConfirm}
          sx={{ borderRadius: 20, textTransform: 'none' }}
        >
          Create List
        </Button>
      </DialogActions>
    </Dialog>
  );
}
