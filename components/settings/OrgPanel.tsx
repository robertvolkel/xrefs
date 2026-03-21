'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Chip,
  IconButton,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Tooltip,
  Typography,
} from '@mui/material';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import BlockIcon from '@mui/icons-material/Block';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useAuth } from '@/components/AuthProvider';
import { AdminUser, getUsers, updateUserRole, toggleUserDisabled, deleteUser } from '@/lib/api';
import ConfirmDialog from '@/components/ConfirmDialog';
import { OWNER_EMAIL } from '@/lib/constants';

export default function OrgPanel() {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'role' | 'disable' | 'delete';
    user: AdminUser;
    newValue: string | boolean;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [sortKey, setSortKey] = useState<keyof AdminUser>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

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
    fetchUsers();
  }, [fetchUsers]);

  const handleConfirm = async () => {
    if (!confirmAction) return;
    setActionLoading(true);
    try {
      if (confirmAction.type === 'role') {
        await updateUserRole(confirmAction.user.id, confirmAction.newValue as 'user' | 'admin');
      } else if (confirmAction.type === 'delete') {
        await deleteUser(confirmAction.user.id);
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
  const isOwner = currentUser?.email === OWNER_EMAIL;

  const handleSort = (key: keyof AdminUser) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'search_count' || key === 'list_count' ? 'desc' : 'asc');
    }
  };

  const sortedUsers = [...users].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const av = a[sortKey];
    const bv = b[sortKey];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    if (typeof av === 'boolean' && typeof bv === 'boolean') return (Number(av) - Number(bv)) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });

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
    if (confirmAction.type === 'delete') return 'Delete Account';
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
    if (confirmAction.type === 'delete') {
      return `Permanently delete ${name} (${confirmAction.user.email})? This will remove all their data (searches, lists, conversations, feedback) and free the email for re-registration. This cannot be undone.`;
    }
    return confirmAction.newValue
      ? t('orgSettings.confirmDisableMessage', { name })
      : t('orgSettings.confirmEnableMessage', { name });
  };

  return (
    <>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', px: 3, pt: 2 }}>
          <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  {([
                    { key: 'full_name' as const, label: t('orgSettings.name'), align: 'left' as const },
                    { key: null, label: t('orgSettings.email'), align: 'left' as const },
                    { key: 'role' as const, label: t('orgSettings.role'), align: 'left' as const },
                    { key: 'disabled' as const, label: t('orgSettings.status'), align: 'left' as const },
                    { key: 'last_active' as const, label: t('orgSettings.lastActive'), align: 'left' as const },
                    { key: 'search_count' as const, label: t('orgSettings.searches'), align: 'right' as const },
                    { key: 'list_count' as const, label: t('orgSettings.lists'), align: 'right' as const },
                    { key: 'created_at' as const, label: t('orgSettings.joined'), align: 'left' as const },
                    { key: null, label: t('orgSettings.actions'), align: 'left' as const },
                  ]).map((col, i) => (
                    <TableCell key={i} align={col.align} sx={{ fontWeight: 600, fontSize: '0.78rem' }}>
                      {col.key ? (
                        <TableSortLabel
                          active={sortKey === col.key}
                          direction={sortKey === col.key ? sortDir : 'asc'}
                          onClick={() => handleSort(col.key!)}
                          sx={{ fontSize: '0.78rem' }}
                        >
                          {col.label}
                        </TableSortLabel>
                      ) : (
                        col.label
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {loading
                  ? Array.from({ length: 4 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 9 }).map((__, j) => (
                          <TableCell key={j}>
                            <Skeleton variant="text" width={j === 0 ? 120 : 80} />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  : sortedUsers.map((u) => (
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
                        <TableCell sx={{ fontSize: '0.78rem', color: 'text.secondary' }} align="right">
                          {u.list_count}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.78rem', color: 'text.secondary', whiteSpace: 'nowrap' }}>
                          {formatDate(u.created_at)}
                        </TableCell>
                        <TableCell>
                          {!isCurrentUser(u) && (
                            <Box sx={{ display: 'flex', gap: 0.5 }}>
                              {isOwner && (
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
                              )}
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
                              {isOwner && (
                                <Tooltip title="Delete Account Permanently">
                                  <IconButton
                                    size="small"
                                    onClick={() =>
                                      setConfirmAction({
                                        type: 'delete',
                                        user: u,
                                        newValue: true,
                                      })
                                    }
                                  >
                                    <DeleteOutlineIcon sx={{ fontSize: 18, color: 'error.main' }} />
                                  </IconButton>
                                </Tooltip>
                              )}
                            </Box>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
              </TableBody>
            </Table>
          </TableContainer>
      </Box>

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
