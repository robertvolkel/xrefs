'use client';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { MissingAttributeInfo } from '@/lib/types';

interface MissingAttributesFormProps {
  missingAttributes: MissingAttributeInfo[];
  onSubmit: (responses: Record<string, string>) => void;
  onSkip: () => void;
}

function getPlaceholder(attr: MissingAttributeInfo, t: (key: string) => string): string {
  switch (attr.logicType) {
    case 'identity':
      return `e.g., ${attr.attributeName === 'Capacitance' ? '100nF' : attr.attributeName === 'Package / Case' ? '0603' : attr.attributeName === 'Resistance' ? '10kΩ' : '...'}`;
    case 'identity_upgrade':
      return `e.g., ${attr.attributeName === 'Dielectric' ? 'X7R' : attr.attributeName === 'Resistor Type' ? 'Thick Film' : '...'}`;
    case 'identity_flag':
      return t('chat.yesOrNo');
    case 'threshold':
    case 'fit':
      return `e.g., ${attr.attributeName.includes('Voltage') ? '50V' : attr.attributeName.includes('Tolerance') ? '±10%' : attr.attributeName.includes('Temp') ? '-55°C to 125°C' : '...'}`;
    default:
      return '';
  }
}

function AttributeField({
  attr,
  value,
  onChange,
  isCritical,
  t,
}: {
  attr: MissingAttributeInfo;
  value: string;
  onChange: (value: string) => void;
  isCritical: boolean;
  t: (key: string) => string;
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <Typography
        variant="body2"
        sx={{
          width: { xs: 100, sm: 140 },
          flexShrink: 0,
          fontSize: { xs: '0.78rem', sm: '0.8rem' },
          fontWeight: isCritical ? 600 : 400,
          color: isCritical ? 'text.primary' : 'text.secondary',
        }}
      >
        {attr.attributeName}
      </Typography>
      <TextField
        size="small"
        placeholder={getPlaceholder(attr, t)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        sx={{
          flex: 1,
          '& .MuiInputBase-input': { fontSize: '0.82rem', py: 0.75 },
        }}
      />
    </Box>
  );
}

export default function MissingAttributesForm({
  missingAttributes,
  onSubmit,
  onSkip,
}: MissingAttributesFormProps) {
  const { t } = useTranslation();
  const [values, setValues] = useState<Record<string, string>>({});

  const { critical, optional } = useMemo(() => ({
    critical: missingAttributes.filter(a => a.weight >= 7),
    optional: missingAttributes.filter(a => a.weight < 7),
  }), [missingAttributes]);

  const handleChange = (attrId: string, value: string) => {
    setValues(prev => ({ ...prev, [attrId]: value }));
  };

  return (
    <Box sx={{ mt: 1.5, maxWidth: { xs: '100%', sm: 480 } }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, fontSize: '0.82rem' }}>
        {t('chat.fillInAttributes')}
      </Typography>

      {/* Critical attributes — always visible */}
      <Stack spacing={1.5}>
        {critical.map((attr) => (
          <AttributeField
            key={attr.attributeId}
            attr={attr}
            value={values[attr.attributeId] ?? ''}
            onChange={(v) => handleChange(attr.attributeId, v)}
            isCritical
            t={t}
          />
        ))}
      </Stack>

      {/* Optional attributes — collapsible */}
      {optional.length > 0 && (
        <Accordion
          disableGutters
          elevation={0}
          sx={{
            mt: 1.5,
            '&::before': { display: 'none' },
            bgcolor: 'transparent',
          }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon sx={{ fontSize: '1rem' }} />}
            sx={{ px: 0, minHeight: 'auto', '& .MuiAccordionSummary-content': { my: 0.5 } }}
          >
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.78rem' }}>
              {t('chat.additionalDetails', { count: optional.length })}
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ px: 0, pt: 0.5 }}>
            <Stack spacing={1.5}>
              {optional.map((attr) => (
                <AttributeField
                  key={attr.attributeId}
                  attr={attr}
                  value={values[attr.attributeId] ?? ''}
                  onChange={(v) => handleChange(attr.attributeId, v)}
                  isCritical={false}
                  t={t}
                />
              ))}
            </Stack>
          </AccordionDetails>
        </Accordion>
      )}

      <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
        <Button
          variant="contained"
          size="small"
          startIcon={<CheckIcon />}
          onClick={() => onSubmit(values)}
        >
          {t('chat.continue')}
        </Button>
        <Button
          size="small"
          startIcon={<SkipNextIcon />}
          onClick={onSkip}
          color="inherit"
          sx={{ opacity: 0.7 }}
        >
          {t('chat.skipAll')}
        </Button>
      </Stack>
    </Box>
  );
}
