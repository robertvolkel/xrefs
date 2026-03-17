'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Snackbar,
  Alert,
  MenuItem,
  Chip,
  Autocomplete,
  FormGroup,
  FormControlLabel,
  Checkbox,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/components/AuthProvider';
import { getUserPreferences, updateUserPreferences } from '@/lib/api';
import type { UserPreferences, BusinessRole, IndustryVertical, ComplianceDefaults, ManufacturingRegion } from '@/lib/types';

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

const REGION_OPTIONS: { value: ManufacturingRegion; label: string }[] = [
  { value: 'north_america', label: 'North America' },
  { value: 'europe', label: 'Europe' },
  { value: 'greater_china', label: 'Greater China' },
  { value: 'japan_korea', label: 'Japan/Korea' },
  { value: 'southeast_asia', label: 'Southeast Asia' },
  { value: 'india', label: 'India' },
  { value: 'other', label: 'Other' },
];

const COMPLIANCE_KEYS: { key: keyof ComplianceDefaults; label: string }[] = [
  { key: 'aecQ200', label: 'AEC-Q200 (Passives)' },
  { key: 'aecQ101', label: 'AEC-Q101 (Discrete Semiconductors)' },
  { key: 'aecQ100', label: 'AEC-Q100 (ICs)' },
  { key: 'milStd', label: 'MIL-STD' },
  { key: 'rohs', label: 'RoHS' },
  { key: 'reach', label: 'REACH' },
];

function prefsEqual(a: UserPreferences, b: UserPreferences): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export default function PreferencesPanel() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [prefs, setPrefs] = useState<UserPreferences>({});
  const savedPrefs = useRef<UserPreferences>({});
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (!user) return;
    getUserPreferences()
      .then(p => { setPrefs(p); savedPrefs.current = p; setPrefsLoaded(true); })
      .catch(() => setPrefsLoaded(true));
  }, [user]);

  const hasChanges = !prefsEqual(prefs, savedPrefs.current);

  const handleSave = async () => {
    setSaving(true);
    try {
      const merged = await updateUserPreferences(prefs);
      setPrefs(merged);
      savedPrefs.current = merged;
      setSnackbar({ message: t('settings.preferencesSaved'), severity: 'success' });
    } catch {
      setSnackbar({ message: t('common.error'), severity: 'error' });
    }
    setSaving(false);
  };

  return (
    <Box sx={{ px: 3, pt: '16px', pb: 4 }}>
      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 0.5 }}>
        {t('settings.preferences')}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 2.5, display: 'block' }}>
        {t('settings.preferencesHelp')}
      </Typography>

      {prefsLoaded && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, maxWidth: 360 }}>
          {/* Business Role */}
          <TextField
            select
            label={t('settings.businessRole')}
            value={prefs.businessRole ?? ''}
            onChange={(e) => setPrefs(p => ({ ...p, businessRole: (e.target.value || undefined) as BusinessRole | undefined }))}
            size="small"
            fullWidth
          >
            <MenuItem value="">{t('settings.notSpecified')}</MenuItem>
            {ROLE_OPTIONS.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
          </TextField>

          {/* Industry */}
          <TextField
            select
            label={t('settings.industry')}
            value={prefs.industry ?? ''}
            onChange={(e) => setPrefs(p => ({ ...p, industry: (e.target.value || undefined) as IndustryVertical | undefined }))}
            size="small"
            fullWidth
          >
            <MenuItem value="">{t('settings.notSpecified')}</MenuItem>
            {INDUSTRY_OPTIONS.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
          </TextField>

          {/* Company */}
          <TextField
            label={t('settings.company')}
            value={prefs.company ?? ''}
            onChange={(e) => setPrefs(p => ({ ...p, company: e.target.value || undefined }))}
            size="small"
            fullWidth
          />

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

          {/* Excluded Manufacturers */}
          <Autocomplete
            multiple
            freeSolo
            options={[]}
            value={prefs.excludedManufacturers ?? []}
            onChange={(_, val) => setPrefs(p => ({ ...p, excludedManufacturers: val.length > 0 ? val : undefined }))}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => (
                <Chip {...getTagProps({ index })} key={option} label={option} size="small" />
              ))
            }
            renderInput={(params) => (
              <TextField {...params} label={t('settings.excludedManufacturers')} size="small" placeholder={t('settings.typeAndEnter')} />
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

          {/* Manufacturing Regions */}
          <Autocomplete
            multiple
            options={REGION_OPTIONS}
            getOptionLabel={(o) => typeof o === 'string' ? o : o.label}
            value={REGION_OPTIONS.filter(r => prefs.manufacturingRegions?.includes(r.value))}
            onChange={(_, val) => {
              const regions = val.map(v => typeof v === 'string' ? v as ManufacturingRegion : v.value);
              setPrefs(p => ({ ...p, manufacturingRegions: regions.length > 0 ? regions : undefined }));
            }}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => (
                <Chip {...getTagProps({ index })} key={option.value} label={option.label} size="small" />
              ))
            }
            renderInput={(params) => (
              <TextField {...params} label={t('settings.manufacturingRegions')} size="small" />
            )}
            isOptionEqualToValue={(o, v) => o.value === v.value}
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
