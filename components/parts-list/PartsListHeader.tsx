'use client';

import { Box, Button, IconButton, Link, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RestartAltIcon from '@mui/icons-material/RestartAlt';

interface PartsListHeaderProps {
  onReset: () => void;
  showReset: boolean;
  listName?: string | null;
}

export default function PartsListHeader({ onReset, showReset, listName }: PartsListHeaderProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 3,
        py: 1.5,
        borderBottom: 1,
        borderColor: 'divider',
        flexShrink: 0,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <IconButton href="/" size="small" sx={{ color: 'text.secondary' }}>
          <ArrowBackIcon fontSize="small" />
        </IconButton>
        <Link href="/" sx={{ display: 'flex', alignItems: 'center' }}>
          <Box
            component="img"
            src="/xq-logo.png"
            alt="XQ"
            sx={{ width: 28, opacity: 0.55, '&:hover': { opacity: 0.8 } }}
          />
        </Link>
        <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
          Your Lists
        </Typography>
        {listName && (
          <Typography variant="body2" color="text.primary" sx={{ ml: 0.5, fontWeight: 500 }}>
            / {listName}
          </Typography>
        )}
      </Box>
      {showReset && (
        <Button
          size="small"
          startIcon={<RestartAltIcon />}
          onClick={onReset}
          sx={{ color: 'text.secondary' }}
        >
          New Upload
        </Button>
      )}
    </Box>
  );
}
