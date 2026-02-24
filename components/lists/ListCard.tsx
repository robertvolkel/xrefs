'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import SettingsIcon from '@mui/icons-material/Settings';
import { PartsListSummary } from '@/lib/partsListStorage';
import { THEME_ICON_MAP, type ListThemeId } from '@/lib/themeClassifier';
import type { TFunction } from 'i18next';

interface ListCardProps {
  list: PartsListSummary;
  pinned?: boolean;
  onClick: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onSettings: () => void;
}

function formatLastEdited(iso: string, t: TFunction, locale?: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const time = date.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });

  if (diffDays === 0) return t('listCard.lastEditedToday', { time });
  if (diffDays === 1) return t('listCard.lastEditedYesterday', { time });
  if (diffDays < 7) return t('listCard.lastEditedDaysAgo', { days: diffDays });
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return t('listCard.lastEditedWeeksAgo', { count: weeks });
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return t('listCard.lastEditedMonthsAgo', { count: months });
  }
  return t('listCard.lastEditedDate', { date: date.toLocaleDateString(locale) });
}

export default function ListCard({ list, pinned, onClick, onDelete, onTogglePin, onSettings }: ListCardProps) {
  const { t, i18n } = useTranslation();
  const notResolved = list.totalRows - list.resolvedCount;

  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  return (
    <>
      <Card
        variant="outlined"
        sx={{
          bgcolor: 'background.default',
          borderColor: 'divider',
          borderRadius: 1.5,
          transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
          '&:hover': {
            borderColor: 'primary.main',
            boxShadow: (theme) => `0 0 0 1px ${theme.palette.primary.main}40`,
          },
          breakInside: 'avoid',
          mb: 2,
          display: 'inline-block',
          width: '100%',
        }}
      >
        <Box onClick={onClick} sx={{ cursor: 'pointer', p: 0 }}>
          <CardContent
            sx={{
              p: 2.5,
              '&:last-child': { pb: 0 },
              position: 'relative',
            }}
          >
            {pinned && (
              <PushPinIcon
                sx={{
                  fontSize: 14,
                  color: 'success.dark',
                  position: 'absolute',
                  top: 24,
                  right: 12,
                }}
              />
            )}
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
              {(() => {
                const ThemeIcon = THEME_ICON_MAP[(list.themeIcon as ListThemeId) || 'general'];
                return <ThemeIcon sx={{ fontSize: 24, color: 'grey.400', mt: 0.25, opacity: 0.85 }} />;
              })()}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography
                    variant="body1"
                    sx={{
                      fontWeight: 600,
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {list.name}
                  </Typography>

                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setMenuAnchor(e.currentTarget);
                    }}
                    sx={{
                      flexShrink: 0,
                      ml: 0.5,
                      color: 'text.secondary',
                      opacity: { xs: 0.6, md: 0 },
                      '.MuiCard-root:hover &': { opacity: 0.7 },
                      '&:hover': { opacity: 1 },
                      transition: 'opacity 0.2s ease',
                    }}
                  >
                    <MoreVertIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Box>

                {list.customer && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ mt: 0.25, fontWeight: 500 }}
                  >
                    {list.customer}
                  </Typography>
                )}

                {list.description && (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{
                      mb: 0.75,
                      mt: 0.5,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      lineHeight: 1.4,
                    }}
                  >
                    {list.description}
                  </Typography>
                )}

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap', mt: list.description ? 0 : 0.5 }}>
                  <Typography variant="caption" color="text.secondary">
                    {t('listCard.totalParts', { count: list.totalRows })}
                  </Typography>
                  {notResolved > 0 && (
                    <Typography variant="caption" sx={{ color: 'error.main', ml: 1 }}>
                      {t('listCard.notResolved', { count: notResolved })}
                    </Typography>
                  )}
                </Box>

                <Box sx={{ borderTop: 1, borderColor: 'divider', mt: 1.5, py: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    {formatLastEdited(list.updatedAt, t, i18n.language)}
                  </Typography>
                </Box>
              </Box>
            </Box>
          </CardContent>
        </Box>

      </Card>

      {/* Actions menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
        onClick={(e) => e.stopPropagation()}
        slotProps={{ paper: { sx: { minWidth: 180 } } }}
      >
        <MenuItem
          onClick={() => {
            setMenuAnchor(null);
            onTogglePin();
          }}
          sx={{ fontSize: '0.82rem' }}
        >
          <ListItemIcon>
            {pinned
              ? <PushPinOutlinedIcon fontSize="small" />
              : <PushPinOutlinedIcon fontSize="small" />
            }
          </ListItemIcon>
          <ListItemText>{pinned ? t('listCard.unpin') : t('listCard.pinToTop')}</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            setMenuAnchor(null);
            onSettings();
          }}
          sx={{ fontSize: '0.82rem' }}
        >
          <ListItemIcon><SettingsIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('listCard.settings')}</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            setMenuAnchor(null);
            setDeleteConfirmOpen(true);
          }}
          sx={{ fontSize: '0.82rem', color: 'error.main' }}
        >
          <ListItemIcon>
            <DeleteOutlineIcon fontSize="small" sx={{ color: 'error.main' }} />
          </ListItemIcon>
          <ListItemText>{t('common.delete')}</ListItemText>
        </MenuItem>
      </Menu>

      {/* Delete confirmation dialog */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ pb: 0.5 }}>
          {t('listCard.deleteConfirmTitle', { name: list.name })}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {t('listCard.deleteConfirmMessage')}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            color="inherit"
            onClick={() => setDeleteConfirmOpen(false)}
            sx={{ textTransform: 'none' }}
          >
            {t('common.cancel')}
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              setDeleteConfirmOpen(false);
              onDelete();
            }}
            sx={{ textTransform: 'none' }}
          >
            {t('common.delete')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
