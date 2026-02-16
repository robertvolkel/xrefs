'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Box, Button, TextField, Typography, Alert, Link as MuiLink } from '@mui/material';
import NextLink from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useTranslation } from 'react-i18next';

export default function LoginForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(t('auth.invalidCredentials'));
      setLoading(false);
      return;
    }

    const redirect = searchParams.get('redirect') || '/';
    router.push(redirect);
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
        {searchParams.get('disabled') === '1' && (
          <Alert severity="warning" sx={{ mb: 1 }}>
            Your account has been disabled. Contact your administrator for assistance.
          </Alert>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 1 }}>
            {error}
          </Alert>
        )}

        <TextField
          label={t('auth.emailLabel')}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          fullWidth
          autoFocus
          autoComplete="email"
        />

        <TextField
          label={t('auth.passwordLabel')}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          fullWidth
          autoComplete="current-password"
        />

        <Button
          type="submit"
          variant="contained"
          fullWidth
          disabled={loading}
          sx={{ mt: 1, py: 1.2 }}
        >
          {loading ? t('auth.signingInButton') : t('auth.signInButton')}
        </Button>

        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 2 }}>
          {t('auth.noAccount')}{' '}
          <MuiLink component={NextLink} href="/register" underline="always" sx={{ color: 'text.secondary', '&:hover': { color: 'text.primary' } }}>
            {t('auth.registerLink')}
          </MuiLink>
        </Typography>
      </Box>
    </Box>
  );
}
