'use client';

import {
  Drawer,
  Box,
  Typography,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Button,
  CircularProgress,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useTranslation } from 'react-i18next';
import { ConversationSummary } from '@/lib/types';
import { SIDEBAR_WIDTH } from '@/lib/layoutConstants';

interface ChatHistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  conversations: ConversationSummary[];
  loading: boolean;
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onDeleteConversation: (id: string) => void;
}

const DRAWER_WIDTH = 260;

export default function ChatHistoryDrawer({
  open,
  onClose,
  conversations,
  loading,
  activeConversationId,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
}: ChatHistoryDrawerProps) {
  const { t } = useTranslation();

  return (
    <Drawer
      variant="temporary"
      anchor="left"
      open={open}
      onClose={onClose}
      slotProps={{
        root: {
          sx: { left: SIDEBAR_WIDTH },
        },
        paper: {
          sx: {
            width: DRAWER_WIDTH,
            left: SIDEBAR_WIDTH,
            bgcolor: 'background.default',
            borderRight: 1,
            borderColor: 'divider',
          },
        },
        backdrop: {
          sx: {
            left: SIDEBAR_WIDTH,
          },
        },
      }}
    >
      {/* Header */}
      <Box sx={{ px: 2, pt: '62px', pb: 1.5 }}>
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={onNewChat}
          fullWidth
          sx={{
            textTransform: 'none',
            justifyContent: 'flex-start',
            borderRadius: 5,
            py: 0.75,
          }}
        >
          {t('history.newChat')}
        </Button>
      </Box>

      {/* Conversation list */}
      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        )}

        {!loading && conversations.length === 0 && (
          <Box sx={{ px: 2, py: 4, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.82rem' }}>
              {t('history.empty')}
            </Typography>
          </Box>
        )}

        {!loading && (
          <List dense disablePadding>
            {conversations.map((convo) => (
              <ListItemButton
                key={convo.id}
                selected={convo.id === activeConversationId}
                onClick={() => onSelectConversation(convo.id)}
                sx={{
                  px: 2,
                  py: 0.75,
                  borderRadius: 1,
                  mx: 0.5,
                  '&.Mui-selected': { bgcolor: 'action.selected' },
                  '& .delete-btn': { opacity: 0, transition: 'opacity 0.15s ease' },
                  '&:hover .delete-btn': { opacity: 0.7 },
                }}
              >
                <ListItemText
                  primary={convo.title || 'Untitled'}
                  primaryTypographyProps={{
                    noWrap: true,
                    sx: { fontSize: '0.82rem', fontWeight: convo.id === activeConversationId ? 600 : 400 },
                  }}
                />
                <IconButton
                  className="delete-btn"
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteConversation(convo.id);
                  }}
                  sx={{ ml: 0.5, '&:hover': { opacity: 1, color: 'error.main' } }}
                >
                  <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </ListItemButton>
            ))}
          </List>
        )}
      </Box>
    </Drawer>
  );
}
