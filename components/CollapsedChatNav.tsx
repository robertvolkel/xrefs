'use client';
import { Box, IconButton } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';

interface CollapsedChatNavProps {
  onExpand: () => void;
}

export default function CollapsedChatNav({ onExpand }: CollapsedChatNavProps) {
  return (
    <Box
      sx={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        bgcolor: 'background.paper',
        pt: 2,
      }}
    >
      <IconButton onClick={onExpand} size="small" sx={{ opacity: 0.7, '&:hover': { opacity: 1 } }}>
        <MenuIcon fontSize="small" />
      </IconButton>
    </Box>
  );
}
