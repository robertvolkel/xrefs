'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Button, TextField, Typography, Alert, Link as MuiLink } from '@mui/material';
import NextLink from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function RegisterForm() {
  const router = useRouter();
  const [inviteCode, setInviteCode] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);

    // Validate invite code server-side and create account
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteCode, email, password, firstName, lastName }),
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
          label="Invite Code"
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
          required
          fullWidth
          autoFocus
        />

        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField
            label="First Name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
            fullWidth
          />
          <TextField
            label="Last Name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
            fullWidth
          />
        </Box>

        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          fullWidth
          autoComplete="email"
        />

        <TextField
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          fullWidth
          autoComplete="new-password"
        />

        <TextField
          label="Confirm Password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          fullWidth
          autoComplete="new-password"
        />

        <Button
          type="submit"
          variant="contained"
          fullWidth
          disabled={loading}
          sx={{ mt: 1, py: 1.2 }}
        >
          {loading ? 'Creating Account...' : 'Create Account'}
        </Button>

        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 2 }}>
          Already have an account?{' '}
          <MuiLink component={NextLink} href="/login" underline="always" sx={{ color: 'text.secondary', '&:hover': { color: 'text.primary' } }}>
            Sign In
          </MuiLink>
        </Typography>
      </Box>
    </Box>
  );
}
