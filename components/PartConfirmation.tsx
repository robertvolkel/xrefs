'use client';
import { Button, Stack } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { PartSummary } from '@/lib/types';

interface PartConfirmationProps {
  part: PartSummary;
  onConfirm: (part: PartSummary) => void;
  onReject: () => void;
}

export default function PartConfirmation({ part, onConfirm, onReject }: PartConfirmationProps) {
  return (
    <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
      <Button
        variant="contained"
        size="small"
        startIcon={<CheckIcon />}
        onClick={() => onConfirm(part)}
        sx={{ minHeight: { xs: 44, sm: 'auto' } }}
      >
        Yes, that&apos;s it
      </Button>
      <Button
        variant="outlined"
        size="small"
        startIcon={<CloseIcon />}
        onClick={onReject}
        color="inherit"
        sx={{ minHeight: { xs: 44, sm: 'auto' } }}
      >
        No
      </Button>
    </Stack>
  );
}
