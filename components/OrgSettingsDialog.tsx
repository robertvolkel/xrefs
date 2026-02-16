'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Skeleton,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import BlockIcon from '@mui/icons-material/Block';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { useAuth } from './AuthProvider';
import { AdminUser, getUsers, updateUserRole, toggleUserDisabled } from '@/lib/api';
import ConfirmDialog from './ConfirmDialog';

interface OrgSettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function OrgSettingsDialog({ open, onClose }: OrgSettingsDialogProps) {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState(0);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'role' | 'disable';
    user: AdminUser;
    newValue: string | boolean;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getUsers();
      setUsers(data);
    } catch {
      // Failed to fetch — leave empty
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) {
      setActiveTab(0);
      fetchUsers();
    }
  }, [open, fetchUsers]);

  const handleConfirm = async () => {
    if (!confirmAction) return;
    setActionLoading(true);
    try {
      if (confirmAction.type === 'role') {
        await updateUserRole(confirmAction.user.id, confirmAction.newValue as 'user' | 'admin');
      } else {
        await toggleUserDisabled(confirmAction.user.id, confirmAction.newValue as boolean);
      }
      await fetchUsers();
    } catch {
      // Error handled silently — user list will reflect current state
    }
    setActionLoading(false);
    setConfirmAction(null);
  };

  const isCurrentUser = (u: AdminUser) => u.id === currentUser?.id;

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return t('orgSettings.never');
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getConfirmTitle = () => {
    if (!confirmAction) return '';
    if (confirmAction.type === 'role') return t('orgSettings.confirmRoleTitle');
    return confirmAction.newValue
      ? t('orgSettings.confirmDisableTitle')
      : t('orgSettings.confirmEnableTitle');
  };

  const getConfirmMessage = () => {
    if (!confirmAction) return '';
    const name = confirmAction.user.full_name || confirmAction.user.email;
    if (confirmAction.type === 'role') {
      return t('orgSettings.confirmRoleMessage', {
        name,
        role: confirmAction.newValue === 'admin' ? t('orgSettings.admin') : t('orgSettings.user'),
      });
    }
    return confirmAction.newValue
      ? t('orgSettings.confirmDisableMessage', { name })
      : t('orgSettings.confirmEnableMessage', { name });
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: { borderRadius: 3, bgcolor: 'background.paper', height: 560 },
        }}
      >
        <DialogTitle
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            pb: 0,
            fontWeight: 600,
          }}
        >
          {t('orgSettings.title')}
          <IconButton onClick={onClose} size="small" sx={{ color: 'text.secondary' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 0, p: 0, mt: 1 }}>
          <Tabs
            value={activeTab}
            onChange={(_, v) => setActiveTab(v)}
            sx={{ borderBottom: 1, borderColor: 'divider', px: 3, flexShrink: 0 }}
          >
            <Tab label={t('orgSettings.userManagement')} sx={{ textTransform: 'none' }} />
          </Tabs>

          {/* User Management tab */}
          {activeTab === 0 && (
            <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.78rem' }}>{t('orgSettings.name')}</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.78rem' }}>{t('orgSettings.email')}</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.78rem' }}>{t('orgSettings.role')}</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.78rem' }}>{t('orgSettings.status')}</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.78rem' }}>{t('orgSettings.lastActive')}</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.78rem' }} align="right">{t('orgSettings.searches')}</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.78rem' }}>{t('orgSettings.joined')}</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.78rem' }}>{t('orgSettings.actions')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading
                    ? Array.from({ length: 4 }).map((_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: 8 }).map((__, j) => (
                            <TableCell key={j}>
                              <Skeleton variant="text" width={j === 0 ? 120 : 80} />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    : users.map((u) => (
                        <TableRow
                          key={u.id}
                          sx={{
                            opacity: u.disabled ? 0.5 : 1,
                            bgcolor: isCurrentUser(u) ? 'action.hover' : 'transparent',
                          }}
                        >
                          <TableCell sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                            {u.full_name || '—'}
                            {isCurrentUser(u) && (
                              <Typography
                                component="span"
                                sx={{ ml: 0.5, fontSize: '0.7rem', color: 'text.secondary' }}
                              >
                                {t('orgSettings.you')}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.8rem' }}>{u.email}</TableCell>
                          <TableCell>
                            <Chip
                              label={u.role === 'admin' ? t('orgSettings.admin') : t('orgSettings.user')}
                              size="small"
                              color={u.role === 'admin' ? 'primary' : 'default'}
                              variant={u.role === 'admin' ? 'filled' : 'outlined'}
                              sx={{ fontSize: '0.72rem', height: 22 }}
                            />
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={u.disabled ? t('orgSettings.disabled') : t('orgSettings.active')}
                              size="small"
                              color={u.disabled ? 'error' : 'success'}
                              variant="outlined"
                              sx={{ fontSize: '0.72rem', height: 22 }}
                            />
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>
                            {formatDate(u.last_active)}
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.78rem', color: 'text.secondary' }} align="right">
                            {u.search_count}
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.78rem', color: 'text.secondary', whiteSpace: 'nowrap' }}>
                            {formatDate(u.created_at)}
                          </TableCell>
                          <TableCell>
                            {!isCurrentUser(u) && (
                              <Box sx={{ display: 'flex', gap: 0.5 }}>
                                <Tooltip
                                  title={u.role === 'admin' ? 'Demote to User' : 'Promote to Admin'}
                                >
                                  <IconButton
                                    size="small"
                                    onClick={() =>
                                      setConfirmAction({
                                        type: 'role',
                                        user: u,
                                        newValue: u.role === 'admin' ? 'user' : 'admin',
                                      })
                                    }
                                  >
                                    {u.role === 'admin' ? (
                                      <PersonOutlineIcon sx={{ fontSize: 18 }} />
                                    ) : (
                                      <AdminPanelSettingsOutlinedIcon sx={{ fontSize: 18 }} />
                                    )}
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title={u.disabled ? 'Enable Account' : 'Disable Account'}>
                                  <IconButton
                                    size="small"
                                    onClick={() =>
                                      setConfirmAction({
                                        type: 'disable',
                                        user: u,
                                        newValue: !u.disabled,
                                      })
                                    }
                                  >
                                    {u.disabled ? (
                                      <CheckCircleOutlineIcon sx={{ fontSize: 18, color: 'success.main' }} />
                                    ) : (
                                      <BlockIcon sx={{ fontSize: 18, color: 'error.main' }} />
                                    )}
                                  </IconButton>
                                </Tooltip>
                              </Box>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmAction !== null}
        title={getConfirmTitle()}
        message={getConfirmMessage()}
        confirmLabel={t('orgSettings.confirm')}
        loading={actionLoading}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmAction(null)}
      />
    </>
  );
}
