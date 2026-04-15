'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Button,
  Chip,
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
import IosShareIcon from '@mui/icons-material/IosShare';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import StarIcon from '@mui/icons-material/Star';
import StarOutlineIcon from '@mui/icons-material/StarOutline';
import { isBuiltinView, type ResolvedView } from '@/lib/viewConfigStorage';

interface ViewControlsProps {
  activeView: ResolvedView;
  views: ResolvedView[];
  defaultViewId: string;
  selectView: (viewId: string) => void;
  deleteView: (viewId: string) => void;
  setDefaultView: (viewId: string) => void;
  onEditView: () => void;
  onCreateView: () => void;
  onPromoteView?: (view: ResolvedView) => void;
  onDemoteView?: (view: ResolvedView) => void;
  onDeleteMasterView?: (view: ResolvedView) => void;
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
  onPromoteView,
  onDemoteView,
  onDeleteMasterView,
}: ViewControlsProps) {
  const { t } = useTranslation();
  const [viewMenuAnchor, setViewMenuAnchor] = useState<HTMLElement | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [promoteConfirmOpen, setPromoteConfirmOpen] = useState(false);
  const [demoteConfirmOpen, setDemoteConfirmOpen] = useState(false);

  const isMaster = activeView.scope === 'master';
  const isListSpecific = activeView.scope === 'list';
  const isRaw = isBuiltinView(activeView.id);

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
          <MenuItem key={v.id} value={v.id} sx={{ fontSize: '0.82rem', display: 'flex', justifyContent: 'space-between', gap: 1 }}>
            <span>{v.name}</span>
            {v.scope === 'master' && (
              <Chip label={t('partsList.masterBadge')} size="small" sx={{ fontSize: '0.6rem', height: 16, ml: 1 }} color="primary" variant="outlined" />
            )}
            {v.scope === 'list' && (
              <Chip label={t('partsList.listBadge')} size="small" sx={{ fontSize: '0.6rem', height: 16, ml: 1 }} variant="outlined" />
            )}
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
        slotProps={{ paper: { sx: { minWidth: 220 } } }}
      >
        {/* Edit — disabled for raw, available for master + list */}
        <MenuItem
          disabled={isRaw}
          onClick={() => {
            setViewMenuAnchor(null);
            onEditView();
          }}
          sx={{ fontSize: '0.82rem' }}
        >
          <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('partsList.editView')}</ListItemText>
        </MenuItem>

        {/* Create new */}
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

        {/* Promote list-specific → master */}
        {isListSpecific && onPromoteView && (
          <MenuItem
            onClick={() => {
              setViewMenuAnchor(null);
              setPromoteConfirmOpen(true);
            }}
            sx={{ fontSize: '0.82rem' }}
          >
            <ListItemIcon><IosShareIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t('partsList.promoteToMaster')}</ListItemText>
          </MenuItem>
        )}

        {/* Demote master → list-specific */}
        {isMaster && onDemoteView && (
          <MenuItem
            onClick={() => {
              setViewMenuAnchor(null);
              setDemoteConfirmOpen(true);
            }}
            sx={{ fontSize: '0.82rem' }}
          >
            <ListItemIcon><LockOutlinedIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t('partsList.demoteToListSpecific')}</ListItemText>
          </MenuItem>
        )}

        {/* Delete — scope-aware */}
        <MenuItem
          disabled={isRaw}
          onClick={() => {
            setViewMenuAnchor(null);
            setDeleteConfirmOpen(true);
          }}
          sx={{ fontSize: '0.82rem', ...(!isRaw && { color: 'error.main' }) }}
        >
          <ListItemIcon><DeleteOutlineIcon fontSize="small" sx={{ ...(!isRaw && { color: 'error.main' }) }} /></ListItemIcon>
          <ListItemText>{t('partsList.deleteThisView')}</ListItemText>
        </MenuItem>
      </Menu>

      {/* Star (per-list default) */}
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

      {/* Delete confirmation */}
      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ pb: 0.5 }}>
          {isMaster
            ? t('partsList.deleteMasterTitle', { name: activeView.name })
            : t('partsList.deleteViewTitle', { name: activeView.name })}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {isMaster
              ? t('partsList.deleteMasterWarning')
              : t('partsList.deleteViewMessage')}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setDeleteConfirmOpen(false)} sx={{ textTransform: 'none' }}>
            {t('common.cancel')}
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              setDeleteConfirmOpen(false);
              if (isMaster && onDeleteMasterView) {
                onDeleteMasterView(activeView);
              } else {
                deleteView(activeView.id);
              }
            }}
            sx={{ textTransform: 'none' }}
          >
            {t('common.delete')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Promote confirmation */}
      <Dialog open={promoteConfirmOpen} onClose={() => setPromoteConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ pb: 0.5 }}>
          {t('partsList.promoteToMaster')}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {t('partsList.promoteWarning')}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setPromoteConfirmOpen(false)} sx={{ textTransform: 'none' }}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              setPromoteConfirmOpen(false);
              onPromoteView?.(activeView);
            }}
            sx={{ textTransform: 'none' }}
          >
            {t('partsList.promoteToMaster')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Demote confirmation */}
      <Dialog open={demoteConfirmOpen} onClose={() => setDemoteConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ pb: 0.5 }}>
          {t('partsList.demoteToListSpecific')}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {t('partsList.demoteWarning')}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setDemoteConfirmOpen(false)} sx={{ textTransform: 'none' }}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="contained"
            color="warning"
            onClick={() => {
              setDemoteConfirmOpen(false);
              onDemoteView?.(activeView);
            }}
            sx={{ textTransform: 'none' }}
          >
            {t('partsList.demoteToListSpecific')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
