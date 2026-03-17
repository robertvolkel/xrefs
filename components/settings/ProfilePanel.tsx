'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  IconButton,
  InputAdornment,
  Snackbar,
  Alert,
} from '@mui/material';
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlined from '@mui/icons-material/VisibilityOffOutlined';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/components/AuthProvider';
import { createClient } from '@/lib/supabase/client';

function splitFullName(fullName: string): { first: string; last: string } {
  const trimmed = (fullName || '').trim();
  const spaceIdx = trimmed.indexOf(' ');
  if (spaceIdx === -1) return { first: trimmed, last: '' };
  return { first: trimmed.slice(0, spaceIdx), last: trimmed.slice(spaceIdx + 1) };
}

export default function ProfilePanel() {
  const { t } = useTranslation();
  const { user } = useAuth();

  // --- Profile info state ---
  const savedFullName = (user?.user_metadata?.full_name as string) || '';
  const savedEmail = user?.email || '';
  const saved = splitFullName(savedFullName);

  const [firstName, setFirstName] = useState(saved.first);
  const [lastName, setLastName] = useState(saved.last);
  const [email, setEmail] = useState(savedEmail);
  const [savingProfile, setSavingProfile] = useState(false);

  // --- Password state ---
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  // --- Feedback ---
  const [snackbar, setSnackbar] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);

  // Sync when user data loads/changes
  useEffect(() => {
    const s = splitFullName((user?.user_metadata?.full_name as string) || '');
    setFirstName(s.first);
    setLastName(s.last);
    setEmail(user?.email || '');
  }, [user?.user_metadata?.full_name, user?.email]);

  // --- Profile save ---
  const profileChanged =
    firstName !== saved.first || lastName !== saved.last || email !== savedEmail;

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const supabase = createClient();
      const fullName = `${firstName} ${lastName}`.trim();
      const updates: Parameters<typeof supabase.auth.updateUser>[0] = {
        data: { full_name: fullName },
      };
      if (email !== savedEmail) updates.email = email;

      const { error } = await supabase.auth.updateUser(updates);
      if (error) throw error;

      // Keep profiles table in sync
      if (user?.id) {
        await supabase
          .from('profiles')
          .update({ full_name: fullName, email, updated_at: new Date().toISOString() })
          .eq('id', user.id);
      }

      setSnackbar({ message: t('settings.profileSaved'), severity: 'success' });
    } catch {
      setSnackbar({ message: t('common.error'), severity: 'error' });
    }
    setSavingProfile(false);
  };

  // --- Password change ---
  const canChangePassword =
    currentPassword.length > 0 &&
    newPassword.length >= 6 &&
    confirmPassword === newPassword;

  const handleChangePassword = async () => {
    setPasswordError('');
    if (newPassword !== confirmPassword) {
      setPasswordError(t('settings.passwordMismatch'));
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError(t('settings.passwordTooShort'));
      return;
    }

    setSavingPassword(true);
    try {
      const supabase = createClient();

      // Verify current password
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: savedEmail,
        password: currentPassword,
      });
      if (signInError) {
        setPasswordError(t('settings.wrongPassword'));
        setSavingPassword(false);
        return;
      }

      // Update password
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowCurrent(false);
      setShowNew(false);
      setShowConfirm(false);
      setSnackbar({ message: t('settings.passwordChanged'), severity: 'success' });
    } catch {
      setSnackbar({ message: t('common.error'), severity: 'error' });
    }
    setSavingPassword(false);
  };

  const passwordToggle = (show: boolean, toggle: () => void) => (
    <InputAdornment position="end">
      <IconButton onClick={toggle} edge="end" size="small" tabIndex={-1}>
        {show ? <VisibilityOffOutlined fontSize="small" /> : <VisibilityOutlined fontSize="small" />}
      </IconButton>
    </InputAdornment>
  );

  return (
    <Box sx={{ px: 3, pt: '16px', pb: 4 }}>
      {/* Profile Info */}
      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
        {t('settings.myAccount')}
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mb: 4, maxWidth: 360 }}>
        <TextField
          label={t('settings.firstName')}
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          size="small"
          fullWidth
        />
        <TextField
          label={t('settings.lastName')}
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          size="small"
          fullWidth
        />
        <TextField
          label={t('settings.email')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          size="small"
          fullWidth
          type="email"
        />
        <Box>
          <Button
            variant="contained"
            onClick={handleSaveProfile}
            disabled={!profileChanged || savingProfile}
            sx={{ borderRadius: 20, textTransform: 'none' }}
          >
            {t('common.save')}
          </Button>
        </Box>
      </Box>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 4 }} />

      {/* Change Password */}
      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
        {t('settings.changePassword')}
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mb: 4, maxWidth: 360 }}>
        <TextField
          label={t('settings.currentPassword')}
          value={currentPassword}
          onChange={(e) => { setCurrentPassword(e.target.value); setPasswordError(''); }}
          size="small"
          fullWidth
          type={showCurrent ? 'text' : 'password'}
          error={passwordError === t('settings.wrongPassword')}
          helperText={passwordError === t('settings.wrongPassword') ? passwordError : ''}
          slotProps={{
            input: { endAdornment: passwordToggle(showCurrent, () => setShowCurrent(!showCurrent)) },
          }}
        />
        <TextField
          label={t('settings.newPassword')}
          value={newPassword}
          onChange={(e) => { setNewPassword(e.target.value); setPasswordError(''); }}
          size="small"
          fullWidth
          type={showNew ? 'text' : 'password'}
          error={passwordError === t('settings.passwordTooShort')}
          helperText={passwordError === t('settings.passwordTooShort') ? passwordError : ''}
          slotProps={{
            input: { endAdornment: passwordToggle(showNew, () => setShowNew(!showNew)) },
          }}
        />
        <TextField
          label={t('settings.confirmPassword')}
          value={confirmPassword}
          onChange={(e) => { setConfirmPassword(e.target.value); setPasswordError(''); }}
          size="small"
          fullWidth
          type={showConfirm ? 'text' : 'password'}
          error={passwordError === t('settings.passwordMismatch')}
          helperText={passwordError === t('settings.passwordMismatch') ? passwordError : ''}
          slotProps={{
            input: { endAdornment: passwordToggle(showConfirm, () => setShowConfirm(!showConfirm)) },
          }}
        />
        <Box>
          <Button
            variant="contained"
            onClick={handleChangePassword}
            disabled={!canChangePassword || savingPassword}
            sx={{ borderRadius: 20, textTransform: 'none' }}
          >
            {t('settings.changePassword')}
          </Button>
        </Box>
      </Box>

      {/* Snackbar */}
      <Snackbar
        open={!!snackbar}
        autoHideDuration={4000}
        onClose={() => setSnackbar(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar(null)}
          severity={snackbar?.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackbar?.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
