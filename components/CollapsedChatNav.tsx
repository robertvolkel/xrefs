'use client';
import { Box, IconButton, Tooltip } from '@mui/material';
import ChatIcon from '@mui/icons-material/Chat';
import RestartAltIcon from '@mui/icons-material/RestartAlt';

interface CollapsedChatNavProps {
  onExpand: () => void;
  onReset: () => void;
}

export default function CollapsedChatNav({ onExpand, onReset }: CollapsedChatNavProps) {
  return (
    <Box
      sx={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        bgcolor: 'background.paper',
        py: 1.5,
        gap: 1,
      }}
    >
      {/* Logo */}
      <Box
        component="img"
        src="/xrefslogo.png"
        alt="XRefs"
        onClick={onExpand}
        sx={{ height: 24, opacity: 0.55, cursor: 'pointer', '&:hover': { opacity: 0.8 }, mb: 0.5 }}
      />

      {/* Expand chat */}
      <Tooltip title="Show chat" placement="right">
        <IconButton onClick={onExpand} size="small" sx={{ opacity: 0.7, '&:hover': { opacity: 1 } }}>
          <ChatIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      {/* New search */}
      <Tooltip title="New search" placement="right">
        <IconButton onClick={onReset} size="small" sx={{ opacity: 0.7, '&:hover': { opacity: 1 } }}>
          <RestartAltIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
}
