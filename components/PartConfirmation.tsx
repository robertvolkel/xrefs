'use client';
import { Button, Stack } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { useTranslation } from 'react-i18next';
import { PartSummary } from '@/lib/types';

interface PartConfirmationProps {
  part: PartSummary;
  onConfirm: (part: PartSummary) => void;
  onReject: () => void;
}

export default function PartConfirmation({ part, onConfirm, onReject }: PartConfirmationProps) {
  const { t } = useTranslation();
  return (
    <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
      <Button
        variant="contained"
        size="small"
        startIcon={<CheckIcon />}
        onClick={() => onConfirm(part)}
        sx={{ minHeight: { xs: 44, sm: 'auto' } }}
      >
        {t('chat.yesThatsIt')}
      </Button>
      <Button
        variant="outlined"
        size="small"
        startIcon={<CloseIcon />}
        onClick={onReject}
        color="inherit"
        sx={{ minHeight: { xs: 44, sm: 'auto' } }}
      >
        {t('chat.no')}
      </Button>
    </Stack>
  );
}
