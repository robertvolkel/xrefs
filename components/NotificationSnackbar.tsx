'use client';

import { Alert, Button, Snackbar } from '@mui/material';

interface NotificationSnackbarProps {
  open: boolean;
  message: string;
  severity?: 'warning' | 'error' | 'info' | 'success';
  onClose: () => void;
  actionLabel?: string;
  onAction?: () => void;
  autoHideDuration?: number;
}

export default function NotificationSnackbar({
  open,
  message,
  severity = 'info',
  onClose,
  actionLabel,
  onAction,
  autoHideDuration = 8000,
}: NotificationSnackbarProps) {
  return (
    <Snackbar
      open={open}
      autoHideDuration={autoHideDuration}
      onClose={(_, reason) => { if (reason !== 'clickaway') onClose(); }}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      sx={{ mb: 5 }}
    >
      <Alert
        onClose={onClose}
        severity={severity}
        variant="filled"
        sx={{ width: '100%', alignItems: 'center' }}
        action={
          actionLabel && onAction ? (
            <Button color="inherit" size="small" onClick={onAction} sx={{ textTransform: 'none', fontWeight: 600 }}>
              {actionLabel}
            </Button>
          ) : undefined
        }
      >
        {message}
      </Alert>
    </Snackbar>
  );
}
