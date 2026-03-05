'use client';
import { useState, KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Button, IconButton, InputBase, Paper } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';

interface SearchInputProps {
  onSubmit: (query: string) => void;
  disabled: boolean;
  landing: boolean;
}

export default function SearchInput({ onSubmit, disabled, landing }: SearchInputProps) {
  const { t } = useTranslation();
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

  // Active chat: compact single-line input with send button inline
  if (!landing) {
    return (
      <Box sx={{ width: '100%' }}>
        <Paper
          elevation={1}
          sx={{
            display: 'flex',
            alignItems: 'flex-end',
            px: 2,
            py: 0.75,
            borderRadius: '20px',
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
          <InputBase
            fullWidth
            multiline
            minRows={1}
            maxRows={6}
            placeholder="Reply..."
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            autoFocus
            sx={{
              fontSize: '0.95rem',
              '& textarea::placeholder, & input::placeholder': {
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
              flexShrink: 0,
              bgcolor: value.trim() ? 'primary.main' : 'transparent',
              color: value.trim() ? 'primary.contrastText' : 'text.secondary',
              '&:hover': {
                bgcolor: value.trim() ? 'primary.dark' : 'action.hover',
              },
              transition: 'all 0.2s ease',
              width: 32,
              height: 32,
            }}
          >
            <SendIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Paper>
      </Box>
    );
  }

  // Landing: tall input with bottom toolbar
  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: { xs: '100%', sm: 680 },
      }}
    >
      <Paper
        elevation={4}
        sx={{
          display: 'flex',
          flexDirection: 'column',
          px: 3,
          pt: 2,
          pb: 1,
          borderRadius: '20px',
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
        <InputBase
          fullWidth
          multiline
          minRows={3}
          maxRows={6}
          placeholder={t('chat.searchPlaceholder')}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          autoFocus
          sx={{
            fontSize: { xs: '1rem', sm: '0.95rem' },
            py: 0.5,
            '& textarea::placeholder, & input::placeholder': {
              opacity: 0.5,
            },
          }}
        />
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            mt: 0.5,
          }}
        >
          <Button
            size="small"
            endIcon={<KeyboardArrowDownIcon />}
            sx={{
              color: 'text.secondary',
              fontSize: '0.8rem',
              textTransform: 'none',
              fontWeight: 400,
              px: 0,
              pl: 0,
              '&:hover': {
                bgcolor: 'action.hover',
              },
            }}
          >
            Basic Questions
          </Button>
          <IconButton
            onClick={handleSubmit}
            disabled={disabled || !value.trim()}
            color="primary"
            size="small"
            sx={{
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
        </Box>
      </Paper>
    </Box>
  );
}
