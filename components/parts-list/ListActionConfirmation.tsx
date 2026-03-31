'use client';

import { Box, Button, Chip, Stack, Typography } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import StarIcon from '@mui/icons-material/Star';
import { PendingListAction } from '@/lib/types';

interface ListActionConfirmationProps {
  action: PendingListAction;
  status: 'pending' | 'confirmed' | 'cancelled';
  onConfirm: () => void;
  onCancel: () => void;
}

function getActionSummary(action: PendingListAction): { icon: React.ReactNode; label: string; detail: string } {
  switch (action.type) {
    case 'delete_rows':
      return {
        icon: <DeleteOutlineIcon fontSize="small" />,
        label: `Delete ${action.rowIndices.length} row${action.rowIndices.length !== 1 ? 's' : ''}`,
        detail: action.reason,
      };
    case 'refresh_rows':
      return {
        icon: <RefreshIcon fontSize="small" />,
        label: `Refresh ${action.rowIndices.length} row${action.rowIndices.length !== 1 ? 's' : ''}`,
        detail: action.reason,
      };
    case 'set_preferred':
      return {
        icon: <StarIcon fontSize="small" />,
        label: `Set preferred: ${action.mpn}`,
        detail: `Row ${action.rowIndex} — ${action.reason}`,
      };
  }
}

export default function ListActionConfirmation({
  action,
  status,
  onConfirm,
  onCancel,
}: ListActionConfirmationProps) {
  const { icon, label, detail } = getActionSummary(action);
  const isDone = status !== 'pending';

  return (
    <Box
      sx={{
        mt: 1.5,
        p: 1.5,
        border: 1,
        borderColor: status === 'confirmed' ? 'success.main' : status === 'cancelled' ? 'text.disabled' : 'primary.main',
        borderRadius: 1,
        bgcolor: 'background.paper',
        opacity: isDone ? 0.7 : 1,
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
        {icon}
        <Typography variant="body2" fontWeight={600}>{label}</Typography>
        {isDone && (
          <Chip
            label={status === 'confirmed' ? 'Confirmed' : 'Cancelled'}
            size="small"
            color={status === 'confirmed' ? 'success' : 'default'}
            sx={{ height: 20, fontSize: '0.7rem' }}
          />
        )}
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        {detail}
      </Typography>
      {!isDone && (
        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            size="small"
            startIcon={<CheckIcon />}
            onClick={onConfirm}
            sx={{ textTransform: 'none', fontSize: '0.75rem' }}
          >
            Confirm
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<CloseIcon />}
            onClick={onCancel}
            color="inherit"
            sx={{ textTransform: 'none', fontSize: '0.75rem' }}
          >
            Cancel
          </Button>
        </Stack>
      )}
    </Box>
  );
}
