'use client';
import { Box, IconButton } from '@mui/material';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import { HEADER_HEIGHT } from '@/lib/layoutConstants';

interface CollapsedChatNavProps {
  onExpand: () => void;
}

export default function CollapsedChatNav({ onExpand }: CollapsedChatNavProps) {
  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        bgcolor: 'background.default',
      }}
    >
      {/* Top-aligned in HEADER_HEIGHT zone to match "SOURCE PART" label */}
      <Box sx={{ height: HEADER_HEIGHT, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', pt: '24px' }}>
        <IconButton onClick={onExpand} size="small" sx={{ opacity: 0.7, '&:hover': { opacity: 1 } }}>
          <SmartToyIcon fontSize="small" />
        </IconButton>
      </Box>
    </Box>
  );
}
