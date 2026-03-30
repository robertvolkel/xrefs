'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Chip,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Typography,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
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
  const [menuAnchor, setMenuAnchor] = useState<{ el: HTMLElement; user: AdminUser } | null>(null);

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

  const DESCENDING_FIRST_KEYS = new Set<keyof AdminUser>([
    'search_count', 'list_count', 'total_tokens', 'estimated_cost', 'dk_calls', 'mouser_calls',
  ]);

  const handleSort = (key: keyof AdminUser) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(DESCENDING_FIRST_KEYS.has(key) ? 'desc' : 'asc');
    }
  };

  /** Format large token counts: 1234567 → "1.2M", 45678 → "45.7K" */
  const formatTokens = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  };

  /** Format cost: 0.0456 → "$0.05", 1.234 → "$1.23", 0 → "—" */
  const formatCost = (n: number) => {
    if (n === 0) return '—';
    if (n < 0.01) return '<$0.01';
    return `$${n.toFixed(2)}`;
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
                    { key: 'role' as const, label: t('orgSettings.role'), align: 'left' as const },
                    { key: 'disabled' as const, label: t('orgSettings.status'), align: 'left' as const },
                    { key: 'search_count' as const, label: t('orgSettings.searches'), align: 'right' as const },
                    { key: 'list_count' as const, label: t('orgSettings.lists'), align: 'right' as const },
                    { key: 'total_tokens' as const, label: 'Tokens', align: 'right' as const },
                    { key: 'estimated_cost' as const, label: 'Cost', align: 'right' as const },
                    { key: 'dk_calls' as const, label: 'DK', align: 'right' as const },
                    { key: 'mouser_calls' as const, label: 'Mouser', align: 'right' as const },
                    { key: 'last_active' as const, label: t('orgSettings.lastActive'), align: 'left' as const },
                    { key: 'created_at' as const, label: t('orgSettings.joined'), align: 'left' as const },
                    { key: null, label: '', align: 'center' as const },
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
                        {Array.from({ length: 12 }).map((__, j) => (
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
                        <TableCell sx={{ fontSize: '0.78rem', color: 'text.secondary' }} align="right">
                          {u.search_count}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.78rem', color: 'text.secondary' }} align="right">
                          {u.list_count}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.78rem', color: 'text.secondary' }} align="right">
                          {u.total_tokens > 0 ? formatTokens(u.total_tokens) : '—'}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.78rem', color: 'text.secondary' }} align="right">
                          {formatCost(u.estimated_cost)}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.78rem', color: 'text.secondary' }} align="right">
                          {u.dk_calls || '—'}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.78rem', color: 'text.secondary' }} align="right">
                          {u.mouser_calls || '—'}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>
                          {formatDate(u.last_active)}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.78rem', color: 'text.secondary', whiteSpace: 'nowrap' }}>
                          {formatDate(u.created_at)}
                        </TableCell>
                        <TableCell align="center" sx={{ px: 0, width: 40 }}>
                          {!isCurrentUser(u) && (
                            <IconButton
                              size="small"
                              onClick={(e) => setMenuAnchor({ el: e.currentTarget, user: u })}
                            >
                              <MoreVertIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
              </TableBody>
            </Table>
          </TableContainer>
      </Box>

      {/* Kebab action menu */}
      <Menu
        anchorEl={menuAnchor?.el}
        open={!!menuAnchor}
        onClose={() => setMenuAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { minWidth: 180 } } }}
      >
        {menuAnchor && isOwner && (
          <MenuItem
            onClick={() => {
              setConfirmAction({
                type: 'role',
                user: menuAnchor.user,
                newValue: menuAnchor.user.role === 'admin' ? 'user' : 'admin',
              });
              setMenuAnchor(null);
            }}
          >
            <ListItemIcon>
              {menuAnchor.user.role === 'admin' ? (
                <PersonOutlineIcon fontSize="small" />
              ) : (
                <AdminPanelSettingsOutlinedIcon fontSize="small" />
              )}
            </ListItemIcon>
            <ListItemText>
              {menuAnchor.user.role === 'admin' ? 'Demote to User' : 'Promote to Admin'}
            </ListItemText>
          </MenuItem>
        )}
        {menuAnchor && (
          <MenuItem
            onClick={() => {
              setConfirmAction({
                type: 'disable',
                user: menuAnchor.user,
                newValue: !menuAnchor.user.disabled,
              });
              setMenuAnchor(null);
            }}
          >
            <ListItemIcon>
              {menuAnchor.user.disabled ? (
                <CheckCircleOutlineIcon fontSize="small" sx={{ color: 'success.main' }} />
              ) : (
                <BlockIcon fontSize="small" sx={{ color: 'error.main' }} />
              )}
            </ListItemIcon>
            <ListItemText>
              {menuAnchor.user.disabled ? 'Enable Account' : 'Disable Account'}
            </ListItemText>
          </MenuItem>
        )}
        {menuAnchor && isOwner && (
          <MenuItem
            onClick={() => {
              setConfirmAction({
                type: 'delete',
                user: menuAnchor.user,
                newValue: true,
              });
              setMenuAnchor(null);
            }}
          >
            <ListItemIcon>
              <DeleteOutlineIcon fontSize="small" sx={{ color: 'error.main' }} />
            </ListItemIcon>
            <ListItemText sx={{ color: 'error.main' }}>Delete Account</ListItemText>
          </MenuItem>
        )}
      </Menu>

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
