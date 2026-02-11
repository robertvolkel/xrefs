'use client';
import { useState, KeyboardEvent } from 'react';
import { Box, IconButton, InputBase, Paper } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import SearchIcon from '@mui/icons-material/Search';

interface SearchInputProps {
  onSubmit: (query: string) => void;
  disabled: boolean;
  landing: boolean;
}

export default function SearchInput({ onSubmit, disabled, landing }: SearchInputProps) {
  const [value, setValue] = useState('');

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (trimmed && !disabled) {
      onSubmit(trimmed);
      setValue('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: landing ? 600 : '100%',
      }}
    >
      <Paper
        elevation={landing ? 4 : 1}
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: 2,
          py: 0.5,
          borderRadius: 3,
          bgcolor: 'background.paper',
          border: 1,
          borderColor: 'divider',
          transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
          '&:focus-within': {
            borderColor: 'primary.main',
            boxShadow: (theme) => `0 0 0 2px ${theme.palette.primary.main}25`,
          },
        }}
      >
        <SearchIcon sx={{ color: 'text.secondary', mr: 1.5, fontSize: 22 }} />
        <InputBase
          fullWidth
          placeholder="Enter a part number (e.g. EEF-LX0E471R)"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          autoFocus
          sx={{
            fontSize: '0.95rem',
            py: 1,
            '& input::placeholder': {
              opacity: 0.5,
            },
          }}
        />
        <IconButton
          onClick={handleSubmit}
          disabled={disabled || !value.trim()}
          color="primary"
          size="small"
          sx={{
            ml: 1,
            bgcolor: value.trim() ? 'primary.main' : 'transparent',
            color: value.trim() ? 'primary.contrastText' : 'text.secondary',
            '&:hover': {
              bgcolor: value.trim() ? 'primary.dark' : 'action.hover',
            },
            transition: 'all 0.2s ease',
            width: 36,
            height: 36,
          }}
        >
          <SendIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Paper>
    </Box>
  );
}
