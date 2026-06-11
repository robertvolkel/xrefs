'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Switch,
  FormControlLabel,
  FormGroup,
  Checkbox,
  CircularProgress,
} from '@mui/material';
import { useProfile } from '@/lib/hooks/useProfile';
import { getUserPreferences, updateUserPreferences } from '@/lib/api';
import {
  DEFAULT_NOTIFICATION_PREFS,
  NotificationPreferences,
  NotificationType,
} from '@/lib/types';

interface TypeRow {
  type: NotificationType;
  label: string;
  description: string;
  adminOnly?: boolean;
}

const TYPE_ROWS: TypeRow[] = [
  {
    type: 'feedback_reply',
    label: 'Replies to your feedback',
    description: 'When the team responds to feedback you submitted.',
  },
  {
    type: 'feedback_new',
    label: 'New feedback activity',
    description: 'When a user submits or replies to feedback.',
    adminOnly: true,
  },
  {
    type: 'release_note',
    label: 'Release notes',
    description: 'When a new release note is published.',
  },
  {
    type: 'system',
    label: 'System messages',
    description: 'Important account or platform notices.',
  },
];

export default function NotificationsPanel() {
  const { isAdmin } = useProfile();
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getUserPreferences()
      .then((p) => {
        setPrefs(p.notificationPreferences ?? DEFAULT_NOTIFICATION_PREFS);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const persist = useCallback((next: NotificationPreferences) => {
    setPrefs(next);
    // Send the COMPLETE object — the PUT route shallow-merges top-level keys,
    // so a partial byType would clobber the other toggles.
    updateUserPreferences({ notificationPreferences: next }).catch(() => {});
  }, []);

  const handleMasterToggle = (checked: boolean) => {
    persist({ ...prefs, emailEnabled: checked });
  };

  const handleTypeToggle = (type: NotificationType, checked: boolean) => {
    persist({ ...prefs, byType: { ...prefs.byType, [type]: checked } });
  };

  const isTypeOn = (type: NotificationType): boolean =>
    prefs.byType?.[type] ?? DEFAULT_NOTIFICATION_PREFS.byType[type] ?? true;

  const rows = TYPE_ROWS.filter((r) => !r.adminOnly || isAdmin);

  if (!loaded) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  return (
    <Box sx={{ px: 3, pt: '16px', pb: 4, maxWidth: 560 }}>
      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 0.5 }}>
        Email notifications
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        The in-app inbox always shows every notification. These settings only control
        which ones are also emailed to you.
      </Typography>

      <FormControlLabel
        control={
          <Switch
            checked={prefs.emailEnabled}
            onChange={(e) => handleMasterToggle(e.target.checked)}
          />
        }
        label="Send me email notifications"
      />

      <Box sx={{ borderBottom: 1, borderColor: 'divider', my: 3 }} />

      <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }}>
        Email me about
      </Typography>
      <FormGroup>
        {rows.map((row) => (
          <Box key={row.type} sx={{ mb: 1 }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={prefs.emailEnabled && isTypeOn(row.type)}
                  disabled={!prefs.emailEnabled}
                  onChange={(e) => handleTypeToggle(row.type, e.target.checked)}
                />
              }
              label={row.label}
            />
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', ml: 4, mt: -0.5 }}
            >
              {row.description}
            </Typography>
          </Box>
        ))}
      </FormGroup>
    </Box>
  );
}
