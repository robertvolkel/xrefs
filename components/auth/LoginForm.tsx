'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Box, Button, TextField, Typography, Alert, Link as MuiLink } from '@mui/material';
import GlobalStyles from '@mui/material/GlobalStyles';
import NextLink from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useTranslation } from 'react-i18next';
import ParticleWaveBackground from '@/components/ParticleWaveBackground';

// Muted teal from the login mockup — used for the XQ wordmark + primary button.
const BRAND_TEAL = '#3E918C';
const BRAND_TEAL_HOVER = '#357f7b';

// Neutralize the browser autofill highlight (Chrome/Safari paint a light-blue fill
// over saved credentials, ignoring the theme). The inset box-shadow trick repaints
// the field with the card's own bg; !important is required to beat the UA autofill
// style. CSS vars keep it correct in both light and dark mode. Rendered global (not
// scoped through sx) because the scoped selector loses to the browser's autofill rule.
const autofillResetStyles = {
  'input:-webkit-autofill, input:-webkit-autofill:hover, input:-webkit-autofill:focus, input:-webkit-autofill:active':
    {
      WebkitBoxShadow: '0 0 0 1000px var(--mui-palette-background-paper) inset !important',
      WebkitTextFillColor: 'var(--mui-palette-text-primary) !important',
      caretColor: 'var(--mui-palette-text-primary)',
      transition: 'background-color 9999s ease-in-out 0s !important',
    },
};

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
        position: 'relative',
        minHeight: '100vh',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        px: 2,
      }}
    >
      <GlobalStyles styles={autofillResetStyles} />

      {/* Floating-dot wave — same animation as the app's idle home screen */}
      <ParticleWaveBackground visible />

      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxWidth: 440,
          bgcolor: 'background.paper',
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
          boxShadow: '0 24px 64px rgba(0, 0, 40, 0.12), 0 2px 8px rgba(0, 0, 40, 0.06)',
          p: { xs: 4, sm: 6 },
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* XQ wordmark — real brand asset, tinted teal to match the mockup */}
        <Box
          role="img"
          aria-label="XQ"
          sx={{
            alignSelf: 'center',
            width: 96,
            height: 52,
            bgcolor: BRAND_TEAL,
            maskImage: 'url(/xq-logo-dark.png)',
            maskSize: 'contain',
            maskRepeat: 'no-repeat',
            maskPosition: 'center',
            WebkitMaskImage: 'url(/xq-logo-dark.png)',
            WebkitMaskSize: 'contain',
            WebkitMaskRepeat: 'no-repeat',
            WebkitMaskPosition: 'center',
          }}
        />

        <Typography
          sx={{
            textAlign: 'center',
            color: 'text.secondary',
            fontSize: '1.05rem',
            mt: 1.5,
            mb: 4,
          }}
        >
          Product Intelligence for Chinese Electronics
        </Typography>

        {searchParams.get('disabled') === '1' && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Your account has been disabled. Contact your administrator for assistance.
          </Alert>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Typography
          component="label"
          htmlFor="login-email"
          sx={{ fontSize: '0.9rem', fontWeight: 600, color: 'text.primary', mb: 0.75 }}
        >
          {t('auth.emailLabel')}
        </Typography>
        <TextField
          id="login-email"
          type="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          fullWidth
          autoFocus
          autoComplete="email"
          aria-label={t('auth.emailLabel')}
          sx={{ mb: 3 }}
        />

        <Typography
          component="label"
          htmlFor="login-password"
          sx={{ fontSize: '0.9rem', fontWeight: 600, color: 'text.primary', mb: 0.75 }}
        >
          {t('auth.passwordLabel')}
        </Typography>
        <TextField
          id="login-password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          fullWidth
          autoComplete="current-password"
          aria-label={t('auth.passwordLabel')}
          sx={{ mb: 4 }}
        />

        <Button
          type="submit"
          variant="contained"
          fullWidth
          disabled={loading}
          disableElevation
          sx={{
            py: 1.4,
            borderRadius: 2,
            fontWeight: 700,
            fontSize: '1rem',
            bgcolor: BRAND_TEAL,
            '&:hover': { bgcolor: BRAND_TEAL_HOVER },
          }}
        >
          {loading ? 'Logging in…' : 'Log in'}
        </Button>

        <Typography
          sx={{
            textAlign: 'center',
            color: 'text.secondary',
            fontSize: '0.8rem',
            mt: 4,
          }}
        >
          Siemens Digital Industries Software · Supplyframe
        </Typography>

        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 1.5 }}>
          {t('auth.noAccount')}{' '}
          <MuiLink
            component={NextLink}
            href="/register"
            underline="always"
            sx={{ color: 'text.secondary', '&:hover': { color: 'text.primary' } }}
          >
            {t('auth.registerLink')}
          </MuiLink>
        </Typography>
      </Box>
    </Box>
  );
}
