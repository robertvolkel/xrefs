'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Snackbar,
  Alert,
  Skeleton,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/components/AuthProvider';
import { getUserPreferences, updateUserPreferences } from '@/lib/api';

const PLACEHOLDER = `Tell us about your role, industry, what you build, production volumes, and what matters most when evaluating components.

For example: "I'm a procurement buyer in the automotive industry. We build ADAS control modules at mid-volume (50K/yr). My priorities are AEC-Q compliance and reducing sole-source risk."`;

export default function MyProfilePanel() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [prompt, setPrompt] = useState('');
  const savedPrompt = useRef('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (!user) return;
    getUserPreferences()
      .then(p => {
        const val = p.profilePrompt ?? '';
        setPrompt(val);
        savedPrompt.current = val;
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [user]);

  const hasChanges = prompt !== savedPrompt.current;

  const handleSave = async () => {
    setSaving(true);
    try {
      const merged = await updateUserPreferences({ profilePrompt: prompt });
      const val = merged.profilePrompt ?? '';
      setPrompt(val);
      savedPrompt.current = val;
      setSnackbar({ message: t('settings.preferencesSaved'), severity: 'success' });
    } catch {
      setSnackbar({ message: t('common.error'), severity: 'error' });
    }
    setSaving(false);
  };

  return (
    <Box sx={{ px: 3, pt: '16px', pb: 4 }}>
      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 0.5 }}>
        My Profile
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 2.5, display: 'block' }}>
        This helps the AI assistant personalize recommendations, conversation style, and BOM analysis to your specific needs.
      </Typography>

      {!loaded && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 560 }}>
          <Skeleton variant="rounded" height={180} />
          <Skeleton variant="rounded" width={80} height={36} sx={{ borderRadius: 20 }} />
        </Box>
      )}

      {loaded && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, maxWidth: 560 }}>
          <TextField
            multiline
            minRows={8}
            maxRows={16}
            fullWidth
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={PLACEHOLDER}
            sx={{
              '& .MuiInputBase-root': { fontSize: '0.88rem', lineHeight: 1.7 },
            }}
          />

          {!prompt && (
            <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
              Not set &mdash; this helps personalize your recommendations.
            </Typography>
          )}

          {/* Save */}
          <Box>
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={!hasChanges || saving}
              sx={{ borderRadius: 20, textTransform: 'none' }}
            >
              {saving ? 'Saving...' : t('common.save')}
            </Button>
          </Box>
        </Box>
      )}

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
