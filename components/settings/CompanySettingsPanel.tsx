'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Snackbar,
  Alert,
  Chip,
  Autocomplete,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Skeleton,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/components/AuthProvider';
import { getUserPreferences, updateUserPreferences } from '@/lib/api';
import { CURATED_COUNTRIES } from '@/lib/constants/profileOptions';
import type { UserPreferences, ComplianceDefaults, CountryCode } from '@/lib/types';

const COMPLIANCE_KEYS: { key: keyof ComplianceDefaults; label: string }[] = [
  { key: 'aecQ200', label: 'AEC-Q200 (Passives)' },
  { key: 'aecQ101', label: 'AEC-Q101 (Discrete Semiconductors)' },
  { key: 'aecQ100', label: 'AEC-Q100 (ICs)' },
  { key: 'milStd', label: 'MIL-STD' },
  { key: 'rohs', label: 'RoHS' },
  { key: 'reach', label: 'REACH' },
];

type CountryOption = { code: CountryCode; name: string };

function prefsEqual(a: UserPreferences, b: UserPreferences): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export default function CompanySettingsPanel() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [prefs, setPrefs] = useState<UserPreferences>({});
  const savedPrefs = useRef<UserPreferences>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);

  // Track if user has legacy regions but no country locations
  const hasLegacyRegions = !!(prefs.manufacturingRegions?.length && !prefs.manufacturingLocations?.length);

  useEffect(() => {
    if (!user) return;
    getUserPreferences()
      .then(p => { setPrefs(p); savedPrefs.current = p; setLoaded(true); })
      .catch(() => setLoaded(true));
  }, [user]);

  // Only compare company-settings-relevant fields for change detection
  const relevantFields = (p: UserPreferences) => ({
    preferredManufacturers: p.preferredManufacturers,
    complianceDefaults: p.complianceDefaults,
    manufacturingLocations: p.manufacturingLocations,
    shippingDestinations: p.shippingDestinations,
  });
  const hasChanges = !prefsEqual(
    relevantFields(prefs) as UserPreferences,
    relevantFields(savedPrefs.current) as UserPreferences,
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      // Clear legacy regions on save if user has set locations
      const updates: Partial<UserPreferences> = {
        preferredManufacturers: prefs.preferredManufacturers,
        complianceDefaults: prefs.complianceDefaults,
        manufacturingLocations: prefs.manufacturingLocations,
        shippingDestinations: prefs.shippingDestinations,
      };
      if (prefs.manufacturingLocations?.length) {
        updates.manufacturingRegions = undefined;
      }
      // Remove excludedManufacturers and company if they were previously set
      updates.excludedManufacturers = undefined;
      updates.company = undefined;

      const merged = await updateUserPreferences(updates);
      setPrefs(merged);
      savedPrefs.current = merged;
      setSnackbar({ message: t('settings.preferencesSaved'), severity: 'success' });
    } catch {
      setSnackbar({ message: t('common.error'), severity: 'error' });
    }
    setSaving(false);
  };

  const selectedLocations = CURATED_COUNTRIES.filter(c =>
    prefs.manufacturingLocations?.includes(c.code)
  );
  const selectedShipping = CURATED_COUNTRIES.filter(c =>
    prefs.shippingDestinations?.includes(c.code)
  );

  return (
    <Box sx={{ px: 3, pt: '16px', pb: 4 }}>
      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 0.5 }}>
        Company Settings
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 2.5, display: 'block' }}>
        These settings are used to filter manufacturers, apply compliance requirements, and focus sourcing recommendations to your preferred regions.
      </Typography>

      {!loaded && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, maxWidth: 360 }}>
          <Skeleton variant="rounded" height={40} />
          <Box>
            <Skeleton variant="text" width={160} sx={{ mb: 1 }} />
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} variant="text" width={200} height={28} />
            ))}
          </Box>
          <Skeleton variant="rounded" height={40} />
          <Skeleton variant="rounded" height={40} />
          <Skeleton variant="rounded" width={80} height={36} sx={{ borderRadius: 20 }} />
        </Box>
      )}

      {loaded && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, maxWidth: 360 }}>
          {/* Preferred Manufacturers */}
          <Autocomplete
            multiple
            freeSolo
            options={[]}
            value={prefs.preferredManufacturers ?? []}
            onChange={(_, val) => setPrefs(p => ({ ...p, preferredManufacturers: val.length > 0 ? val : undefined }))}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => (
                <Chip {...getTagProps({ index })} key={option} label={option} size="small" />
              ))
            }
            renderInput={(params) => (
              <TextField {...params} label={t('settings.preferredManufacturers')} size="small" placeholder={t('settings.typeAndEnter')} />
            )}
          />

          {/* Compliance Defaults */}
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {t('settings.complianceDefaults')}
            </Typography>
            <FormGroup>
              {COMPLIANCE_KEYS.map(({ key, label }) => (
                <FormControlLabel
                  key={key}
                  control={
                    <Checkbox
                      checked={prefs.complianceDefaults?.[key] ?? false}
                      onChange={(e) => setPrefs(p => ({
                        ...p,
                        complianceDefaults: { ...p.complianceDefaults, [key]: e.target.checked },
                      }))}
                      size="small"
                    />
                  }
                  label={<Typography variant="body2">{label}</Typography>}
                />
              ))}
            </FormGroup>
          </Box>

          {/* Manufacturing Locations */}
          <Autocomplete<CountryOption, true>
            multiple
            options={CURATED_COUNTRIES}
            getOptionLabel={(o) => o.name}
            value={selectedLocations}
            onChange={(_, val) => {
              const codes = val.map(v => v.code);
              setPrefs(p => ({ ...p, manufacturingLocations: codes.length > 0 ? codes : undefined }));
            }}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => (
                <Chip {...getTagProps({ index })} key={option.code} label={option.name} size="small" />
              ))
            }
            renderInput={(params) => (
              <TextField {...params} label="Manufacturing Locations" size="small" />
            )}
            isOptionEqualToValue={(o, v) => o.code === v.code}
          />

          {hasLegacyRegions && (
            <Typography variant="caption" color="warning.main" sx={{ mt: -1.5 }}>
              Previously set as regions &mdash; please update to specific countries.
            </Typography>
          )}

          {/* Shipping Destinations */}
          <Autocomplete<CountryOption, true>
            multiple
            options={CURATED_COUNTRIES}
            getOptionLabel={(o) => o.name}
            value={selectedShipping}
            onChange={(_, val) => {
              const codes = val.map(v => v.code);
              setPrefs(p => ({ ...p, shippingDestinations: codes.length > 0 ? codes : undefined }));
            }}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => (
                <Chip {...getTagProps({ index })} key={option.code} label={option.name} size="small" />
              ))
            }
            renderInput={(params) => (
              <TextField {...params} label="Shipping Destinations" size="small" />
            )}
            isOptionEqualToValue={(o, v) => o.code === v.code}
          />

          {/* Save */}
          <Box>
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={!hasChanges || saving}
              sx={{ borderRadius: 20, textTransform: 'none' }}
            >
              {t('common.save')}
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
