'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Button, TextField, Typography, Alert, Link as MuiLink, MenuItem } from '@mui/material';
import NextLink from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useTranslation } from 'react-i18next';
import type { BusinessRole, IndustryVertical } from '@/lib/types';

const ROLE_OPTIONS: { value: BusinessRole; label: string }[] = [
  { value: 'design_engineer', label: 'Design Engineer' },
  { value: 'procurement', label: 'Procurement / Buyer' },
  { value: 'supply_chain', label: 'Supply Chain' },
  { value: 'commodity_manager', label: 'Commodity Manager' },
  { value: 'quality', label: 'Quality Engineer' },
  { value: 'executive', label: 'Executive' },
  { value: 'other', label: 'Other' },
];

const INDUSTRY_OPTIONS: { value: IndustryVertical; label: string }[] = [
  { value: 'automotive', label: 'Automotive' },
  { value: 'aerospace_defense', label: 'Aerospace & Defense' },
  { value: 'medical', label: 'Medical' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'consumer_electronics', label: 'Consumer Electronics' },
  { value: 'telecom_networking', label: 'Telecom & Networking' },
  { value: 'energy', label: 'Energy' },
  { value: 'other', label: 'Other' },
];

export default function RegisterForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const [inviteCode, setInviteCode] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [businessRole, setBusinessRole] = useState('');
  const [industry, setIndustry] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }

    if (password.length < 6) {
      setError(t('auth.passwordTooShort'));
      return;
    }

    setLoading(true);

    // Validate invite code server-side and create account
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inviteCode, email, password, firstName, lastName,
        ...(businessRole && { businessRole }),
        ...(industry && { industry }),
      }),
    });

    const data = await res.json();

    if (!data.success) {
      setError(data.error);
      setLoading(false);
      return;
    }

    // Account created — sign in automatically
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      // Account was created but auto-login failed — send to login page
      router.push('/login');
      return;
    }

    router.push('/');
    router.refresh();
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        px: 2,
      }}
    >
      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{
          width: '100%',
          maxWidth: 360,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {error && (
          <Alert severity="error" sx={{ mb: 1 }}>
            {error}
          </Alert>
        )}

        <TextField
          label={t('auth.inviteCodeLabel')}
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
          required
          fullWidth
          autoFocus
        />

        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField
            label={t('auth.firstNameLabel')}
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
            fullWidth
          />
          <TextField
            label={t('auth.lastNameLabel')}
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
            fullWidth
          />
        </Box>

        <TextField
          label={t('auth.emailLabel')}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          fullWidth
          autoComplete="email"
        />

        <TextField
          label={t('auth.passwordLabel')}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          fullWidth
          autoComplete="new-password"
        />

        <TextField
          label={t('auth.confirmPasswordLabel')}
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          fullWidth
          autoComplete="new-password"
        />

        <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
          {t('auth.optionalProfileHeading')}
        </Typography>

        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField
            select
            label={t('auth.businessRoleLabel')}
            value={businessRole}
            onChange={(e) => setBusinessRole(e.target.value)}
            fullWidth
            size="small"
          >
            <MenuItem value="">&mdash;</MenuItem>
            {ROLE_OPTIONS.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
          </TextField>

          <TextField
            select
            label={t('auth.industryLabel')}
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            fullWidth
            size="small"
          >
            <MenuItem value="">&mdash;</MenuItem>
            {INDUSTRY_OPTIONS.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
          </TextField>
        </Box>

        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', lineHeight: 1.3 }}>
          {t('auth.profileTransparencyNote')}
        </Typography>

        <Button
          type="submit"
          variant="contained"
          fullWidth
          disabled={loading}
          sx={{ mt: 1, py: 1.2 }}
        >
          {loading ? t('auth.creatingAccountButton') : t('auth.createAccountButton')}
        </Button>

        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 2 }}>
          {t('auth.haveAccount')}{' '}
          <MuiLink component={NextLink} href="/login" underline="always" sx={{ color: 'text.secondary', '&:hover': { color: 'text.primary' } }}>
            {t('auth.signInLink')}
          </MuiLink>
        </Typography>
      </Box>
    </Box>
  );
}
