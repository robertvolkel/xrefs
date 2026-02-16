'use client';
import { useState, useRef, KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Divider, IconButton, InputBase, Paper } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import SearchIcon from '@mui/icons-material/Search';
import UploadFileIcon from '@mui/icons-material/UploadFile';

interface SearchInputProps {
  onSubmit: (query: string) => void;
  disabled: boolean;
  landing: boolean;
  onFileSelect?: (file: File) => void;
}

export default function SearchInput({ onSubmit, disabled, landing, onFileSelect }: SearchInputProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onFileSelect) {
      onFileSelect(file);
    }
    // Reset so the same file can be re-selected
    e.target.value = '';
  };

  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: landing ? { xs: '100%', sm: 600 } : '100%',
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
        {landing && onFileSelect && (
          <>
            <IconButton
              onClick={() => fileInputRef.current?.click()}
              size="small"
              sx={{
                color: 'text.secondary',
                opacity: 0.6,
                '&:hover': { opacity: 1 },
                mr: 0.5,
              }}
            >
              <UploadFileIcon sx={{ fontSize: 20 }} />
            </IconButton>
            <Divider orientation="vertical" flexItem sx={{ mr: 1.5, my: 1 }} />
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              hidden
              onChange={handleFileChange}
            />
          </>
        )}
        <InputBase
          fullWidth
          placeholder={t('chat.searchPlaceholder')}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          autoFocus
          sx={{
            fontSize: { xs: '1rem', sm: '0.95rem' },
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
            width: { xs: 44, sm: 36 },
            height: { xs: 44, sm: 36 },
          }}
        >
          <SendIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Paper>
    </Box>
  );
}
