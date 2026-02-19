'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import type { SavedView } from '@/lib/viewConfigStorage';

const CURRENCIES = [
  { code: 'USD', label: 'USD — US Dollar' },
  { code: 'EUR', label: 'EUR — Euro' },
  { code: 'CNY', label: 'CNY — Chinese Yuan' },
  { code: 'JPY', label: 'JPY — Japanese Yen' },
  { code: 'GBP', label: 'GBP — British Pound' },
  { code: 'CAD', label: 'CAD — Canadian Dollar' },
  { code: 'AUD', label: 'AUD — Australian Dollar' },
  { code: 'HKD', label: 'HKD — Hong Kong Dollar' },
  { code: 'SGD', label: 'SGD — Singapore Dollar' },
  { code: 'TWD', label: 'TWD — Taiwan Dollar' },
  { code: 'KRW', label: 'KRW — South Korean Won' },
  { code: 'NZD', label: 'NZD — New Zealand Dollar' },
  { code: 'INR', label: 'INR — Indian Rupee' },
  { code: 'CHF', label: 'CHF — Swiss Franc' },
  { code: 'SEK', label: 'SEK — Swedish Krona' },
  { code: 'NOK', label: 'NOK — Norwegian Krone' },
  { code: 'DKK', label: 'DKK — Danish Krone' },
  { code: 'PLN', label: 'PLN — Polish Złoty' },
  { code: 'CZK', label: 'CZK — Czech Koruna' },
  { code: 'HUF', label: 'HUF — Hungarian Forint' },
  { code: 'RON', label: 'RON — Romanian Leu' },
  { code: 'ILS', label: 'ILS — Israeli Shekel' },
  { code: 'MYR', label: 'MYR — Malaysian Ringgit' },
  { code: 'THB', label: 'THB — Thai Baht' },
  { code: 'PHP', label: 'PHP — Philippine Peso' },
  { code: 'ZAR', label: 'ZAR — South African Rand' },
];

interface NewListDialogProps {
  open: boolean;
  fileName: string;
  onConfirm: (name: string, description: string, currency: string, customer: string, defaultViewId: string) => void;
  onCancel: () => void;
  mode?: 'create' | 'edit';
  initialName?: string;
  initialDescription?: string;
  initialCurrency?: string;
  initialCustomer?: string;
  initialDefaultViewId?: string;
  /** Available views for the default view selector */
  views?: SavedView[];
}

/** Strip file extension to produce a default list name */
function defaultNameFromFile(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '');
}

export default function NewListDialog({
  open,
  fileName,
  onConfirm,
  onCancel,
  mode = 'create',
  initialName,
  initialDescription,
  initialCurrency,
  initialCustomer,
  initialDefaultViewId,
  views,
}: NewListDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [customer, setCustomer] = useState('');
  const [defaultViewId, setDefaultViewId] = useState('');

  // Reset fields when dialog opens
  useEffect(() => {
    if (!open) return;
    if (mode === 'edit') {
      setName(initialName ?? '');
      setDescription(initialDescription ?? '');
      setCurrency(initialCurrency ?? 'USD');
      setCustomer(initialCustomer ?? '');
      setDefaultViewId(initialDefaultViewId ?? '');
    } else if (fileName) {
      setName(defaultNameFromFile(fileName));
      setDescription('');
      setCurrency(initialCurrency ?? 'USD');
      setCustomer('');
      setDefaultViewId('');
    }
  }, [open, fileName, mode, initialName, initialDescription, initialCurrency, initialCustomer, initialDefaultViewId]);

  const canConfirm = name.trim().length > 0;

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: { borderRadius: 3, bgcolor: 'background.paper' },
      }}
    >
      <DialogTitle sx={{ pb: 1, fontWeight: 600 }}>
        {mode === 'edit' ? t('newListDialog.editTitle') : t('newListDialog.createTitle')}
      </DialogTitle>

      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: '16px !important' }}>
        <TextField
          label={t('newListDialog.nameLabel')}
          placeholder={t('newListDialog.namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          fullWidth
          autoFocus
          variant="outlined"
          slotProps={{ inputLabel: { shrink: true } }}
        />

        <TextField
          label={t('newListDialog.customerLabel')}
          placeholder={t('newListDialog.customerPlaceholder')}
          value={customer}
          onChange={(e) => setCustomer(e.target.value)}
          fullWidth
          variant="outlined"
          slotProps={{ inputLabel: { shrink: true } }}
        />

        <TextField
          label={t('newListDialog.descriptionLabel')}
          placeholder={t('newListDialog.descriptionPlaceholder')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          fullWidth
          multiline
          minRows={3}
          maxRows={6}
          variant="outlined"
          slotProps={{ inputLabel: { shrink: true } }}
        />

        <FormControl size="small" fullWidth>
          <InputLabel>{t('newListDialog.currencyLabel')}</InputLabel>
          <Select
            value={currency}
            label={t('newListDialog.currencyLabel')}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {CURRENCIES.map((c) => (
              <MenuItem key={c.code} value={c.code}>
                {c.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {views && views.length > 0 && (
          <FormControl size="small" fullWidth>
            <InputLabel>{t('newListDialog.defaultViewLabel')}</InputLabel>
            <Select
              value={defaultViewId}
              label={t('newListDialog.defaultViewLabel')}
              onChange={(e) => setDefaultViewId(e.target.value)}
            >
              <MenuItem value="">
                <em>{t('newListDialog.defaultViewNone')}</em>
              </MenuItem>
              {views.map((v) => (
                <MenuItem key={v.id} value={v.id}>
                  {v.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onCancel} sx={{ borderRadius: 20, textTransform: 'none' }}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="contained"
          onClick={() => onConfirm(name.trim(), description.trim(), currency, customer.trim(), defaultViewId)}
          disabled={!canConfirm}
          sx={{ borderRadius: 20, textTransform: 'none' }}
        >
          {mode === 'edit' ? t('newListDialog.saveButton') : t('newListDialog.createButton')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
