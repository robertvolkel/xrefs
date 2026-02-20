'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Select,
  Tooltip,
  Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import StarIcon from '@mui/icons-material/Star';
import StarOutlineIcon from '@mui/icons-material/StarOutline';
import { isBuiltinView } from '@/lib/viewConfigStorage';
import { SavedView } from '@/lib/viewConfigStorage';

interface ViewControlsProps {
  activeView: SavedView;
  views: SavedView[];
  defaultViewId: string;
  selectView: (viewId: string) => void;
  deleteView: (viewId: string) => void;
  setDefaultView: (viewId: string) => void;
  onEditView: () => void;
  onCreateView: () => void;
}

export default function ViewControls({
  activeView,
  views,
  defaultViewId,
  selectView,
  deleteView,
  setDefaultView,
  onEditView,
  onCreateView,
}: ViewControlsProps) {
  const { t } = useTranslation();
  const [viewMenuAnchor, setViewMenuAnchor] = useState<HTMLElement | null>(null);
  const [deleteViewConfirmOpen, setDeleteViewConfirmOpen] = useState(false);

  return (
    <>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, mr: 0.5 }}>
        {t('partsList.viewLabel')}
      </Typography>

      <Select
        value={activeView.id}
        onChange={(e) => selectView(e.target.value)}
        size="small"
        variant="outlined"
        sx={{
          minWidth: 140,
          fontSize: '0.82rem',
          '& .MuiSelect-select': { py: 0.5 },
        }}
      >
        {views.map(v => (
          <MenuItem key={v.id} value={v.id} sx={{ fontSize: '0.82rem' }}>
            {v.name}
          </MenuItem>
        ))}
      </Select>

      <IconButton
        size="small"
        onClick={(e) => setViewMenuAnchor(e.currentTarget)}
      >
        <MoreVertIcon sx={{ fontSize: 18 }} />
      </IconButton>
      <Menu
        anchorEl={viewMenuAnchor}
        open={Boolean(viewMenuAnchor)}
        onClose={() => setViewMenuAnchor(null)}
        slotProps={{ paper: { sx: { minWidth: 200 } } }}
      >
        <MenuItem
          disabled={activeView.id === 'raw'}
          onClick={() => {
            setViewMenuAnchor(null);
            onEditView();
          }}
          sx={{ fontSize: '0.82rem' }}
        >
          <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('partsList.editView')}</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            setViewMenuAnchor(null);
            onCreateView();
          }}
          sx={{ fontSize: '0.82rem' }}
        >
          <ListItemIcon><AddIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('partsList.createNewView')}</ListItemText>
        </MenuItem>
        <MenuItem
          disabled={isBuiltinView(activeView.id)}
          onClick={() => {
            setViewMenuAnchor(null);
            setDeleteViewConfirmOpen(true);
          }}
          sx={{ fontSize: '0.82rem', ...(!isBuiltinView(activeView.id) && { color: 'error.main' }) }}
        >
          <ListItemIcon><DeleteOutlineIcon fontSize="small" sx={{ ...(!isBuiltinView(activeView.id) && { color: 'error.main' }) }} /></ListItemIcon>
          <ListItemText>{t('partsList.deleteThisView')}</ListItemText>
        </MenuItem>
      </Menu>

      <Tooltip title={activeView.id === defaultViewId ? t('partsList.isDefaultView') : t('partsList.setDefaultView')}>
        <IconButton
          size="small"
          onClick={() => setDefaultView(activeView.id)}
        >
          {activeView.id === defaultViewId
            ? <StarIcon sx={{ fontSize: 18, color: 'warning.main' }} />
            : <StarOutlineIcon sx={{ fontSize: 18 }} />
          }
        </IconButton>
      </Tooltip>

      {/* Delete view confirmation dialog */}
      <Dialog
        open={deleteViewConfirmOpen}
        onClose={() => setDeleteViewConfirmOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ pb: 0.5 }}>
          {t('partsList.deleteViewTitle', { name: activeView.name })}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {t('partsList.deleteViewMessage')}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            color="inherit"
            onClick={() => setDeleteViewConfirmOpen(false)}
            sx={{ textTransform: 'none' }}
          >
            {t('common.cancel')}
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              setDeleteViewConfirmOpen(false);
              deleteView(activeView.id);
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
