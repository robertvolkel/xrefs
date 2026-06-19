'use client';
import { useState, FormEvent } from 'react';
import { Button, TextField, Box, Chip } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import { parseQuantity } from '@/lib/constants/quantityPresets';
import QuantityPresetButtons from './QuantityPresetButtons';

interface QuantityPromptProps {
  presets: number[];
  status: 'pending' | 'submitted';
  /** Final qty the user committed to — used to render a single pill in the
   *  locked state instead of dimmed chips + greyed input. */
  submittedQty?: number;
  onSelect: (quantity: number) => void;
}

export default function QuantityPrompt({ presets, status, submittedQty, onSelect }: QuantityPromptProps) {
  const [custom, setCustom] = useState('');
  const locked = status === 'submitted';

  const handleCustomSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (locked) return;
    const n = parseQuantity(custom);
    if (n === null) return;
    onSelect(n);
  };

  // Locked render: replace the chip row + input with a single qty pill so the
  // chat history reads cleanly (no greyed-out controls cluttering the bubble).
  if (locked && typeof submittedQty === 'number') {
    return (
      <Box sx={{ mt: 1 }}>
        <Chip
          icon={<CheckIcon />}
          label={`Qty: ${submittedQty.toLocaleString()}`}
          color="primary"
          size="small"
          sx={{ fontWeight: 500 }}
        />
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 1, opacity: locked ? 0.5 : 1, pointerEvents: locked ? 'none' : 'auto' }}>
      <Box sx={{ mb: 1 }}>
        <QuantityPresetButtons presets={presets} onSelect={onSelect} disabled={locked} />
      </Box>
      <Box component="form" onSubmit={handleCustomSubmit} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <TextField
          value={custom}
          onChange={(e) => setCustom(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder="Or type a custom quantity"
          size="small"
          disabled={locked}
          inputProps={{ inputMode: 'numeric', pattern: '[0-9]*', 'aria-label': 'Custom quantity' }}
          sx={{ flex: '1 1 auto', maxWidth: 220 }}
        />
        <Button
          type="submit"
          variant="contained"
          size="small"
          disabled={locked || !custom || Number(custom) <= 0}
          sx={{ textTransform: 'none' }}
        >
          Submit
        </Button>
      </Box>
    </Box>
  );
}
