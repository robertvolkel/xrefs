'use client';
import { useState } from 'react';
import { Box, Button, Stack, TextField, Typography } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import { MissingAttributeInfo } from '@/lib/types';

interface MissingAttributesFormProps {
  missingAttributes: MissingAttributeInfo[];
  onSubmit: (responses: Record<string, string>) => void;
  onSkip: () => void;
}

function getPlaceholder(attr: MissingAttributeInfo): string {
  switch (attr.logicType) {
    case 'identity':
      return `e.g., ${attr.attributeName === 'Capacitance' ? '100nF' : attr.attributeName === 'Package / Case' ? '0603' : attr.attributeName === 'Resistance' ? '10kΩ' : '...'}`;
    case 'identity_upgrade':
      return `e.g., ${attr.attributeName === 'Dielectric' ? 'X7R' : attr.attributeName === 'Resistor Type' ? 'Thick Film' : '...'}`;
    case 'identity_flag':
      return 'Yes or No';
    case 'threshold':
    case 'fit':
      return `e.g., ${attr.attributeName.includes('Voltage') ? '50V' : attr.attributeName.includes('Tolerance') ? '±10%' : attr.attributeName.includes('Temp') ? '-55°C to 125°C' : '...'}`;
    default:
      return '';
  }
}

export default function MissingAttributesForm({
  missingAttributes,
  onSubmit,
  onSkip,
}: MissingAttributesFormProps) {
  const [values, setValues] = useState<Record<string, string>>({});

  const handleChange = (attrId: string, value: string) => {
    setValues(prev => ({ ...prev, [attrId]: value }));
  };

  const handleSubmit = () => {
    onSubmit(values);
  };

  return (
    <Box sx={{ mt: 1.5, maxWidth: 480 }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, fontSize: '0.82rem' }}>
        Fill in what you know to improve replacement accuracy:
      </Typography>
      <Stack spacing={1.5}>
        {missingAttributes.map((attr) => (
          <Box key={attr.attributeId} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography
              variant="body2"
              sx={{
                width: 140,
                flexShrink: 0,
                fontSize: '0.8rem',
                fontWeight: attr.weight >= 7 ? 600 : 400,
                color: attr.weight >= 7 ? 'text.primary' : 'text.secondary',
              }}
            >
              {attr.attributeName}
            </Typography>
            <TextField
              size="small"
              placeholder={getPlaceholder(attr)}
              value={values[attr.attributeId] ?? ''}
              onChange={(e) => handleChange(attr.attributeId, e.target.value)}
              sx={{
                flex: 1,
                '& .MuiInputBase-input': { fontSize: '0.82rem', py: 0.75 },
              }}
            />
          </Box>
        ))}
      </Stack>
      <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
        <Button
          variant="contained"
          size="small"
          startIcon={<CheckIcon />}
          onClick={handleSubmit}
        >
          Continue
        </Button>
        <Button
          size="small"
          startIcon={<SkipNextIcon />}
          onClick={onSkip}
          color="inherit"
          sx={{ opacity: 0.7 }}
        >
          Skip all
        </Button>
      </Stack>
    </Box>
  );
}
