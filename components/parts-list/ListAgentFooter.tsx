'use client';

import { Box, ButtonBase, Typography } from '@mui/material';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import { LIST_AGENT_FOOTER_HEIGHT, ROW_FONT_SIZE } from '@/lib/layoutConstants';

interface ListAgentFooterProps {
  isOpen: boolean;
  onToggle: () => void;
  isLoading?: boolean;
  lastRefreshedAt?: Date | null;
  itemCount?: number;
}

function formatRefreshTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function ListAgentFooter({ isOpen, onToggle, isLoading, lastRefreshedAt, itemCount }: ListAgentFooterProps) {
  return (
    <Box
      sx={{
        height: LIST_AGENT_FOOTER_HEIGHT,
        flexShrink: 0,
        borderTop: 1,
        borderColor: 'divider',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 3,
        bgcolor: 'background.default',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {itemCount != null && (
          <Typography variant="caption" color="text.disabled" sx={{ fontSize: ROW_FONT_SIZE, letterSpacing: '0.03em' }}>
            {itemCount} {itemCount === 1 ? 'Item' : 'Items'}
          </Typography>
        )}
        {!isLoading && lastRefreshedAt && (
          <Typography variant="caption" color="text.disabled" sx={{ fontSize: ROW_FONT_SIZE, letterSpacing: '0.03em' }}>
            Refreshed at {formatRefreshTime(lastRefreshedAt)}
          </Typography>
        )}
        {isLoading && (
          <Typography variant="caption" color="text.disabled" sx={{ fontSize: ROW_FONT_SIZE, letterSpacing: '0.03em' }}>
            Thinking...
          </Typography>
        )}
      </Box>

      <ButtonBase
        onClick={onToggle}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1,
          py: 0.25,
          borderRadius: 0.5,
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <SmartToyOutlinedIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: ROW_FONT_SIZE }}>
          {isOpen ? 'Close' : 'Ask about this list'}
        </Typography>
        <KeyboardArrowUpIcon
          sx={{
            fontSize: 14,
            color: 'text.secondary',
            transform: isOpen ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s',
          }}
        />
      </ButtonBase>
    </Box>
  );
}
