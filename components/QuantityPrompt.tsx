'use client';
import { useState, FormEvent } from 'react';
import { Button, Stack, TextField, Box, Chip } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';

interface QuantityPromptProps {
  presets: number[];
  status: 'pending' | 'submitted';
  /** Final qty the user committed to — used to render a single pill in the
   *  locked state instead of dimmed chips + greyed input. */
  submittedQty?: number;
  onSelect: (quantity: number) => void;
}

const formatPreset = (q: number): string => {
  if (q >= 1_000_000) return `${q / 1_000_000}M`;
  if (q >= 1_000) return `${q / 1_000}K`;
  return String(q);
};

export default function QuantityPrompt({ presets, status, submittedQty, onSelect }: QuantityPromptProps) {
  const [custom, setCustom] = useState('');
  const locked = status === 'submitted';

  const handleCustomSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (locked) return;
    const n = Number(custom);
    if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) return;
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
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1, mb: 1 }}>
        {presets.map((q) => (
          <Button
            key={q}
            variant="outlined"
            size="small"
            color="inherit"
            onClick={() => onSelect(q)}
            disabled={locked}
            sx={{ minHeight: { xs: 44, sm: 'auto' }, textTransform: 'none', minWidth: 56 }}
          >
            {formatPreset(q)}
          </Button>
        ))}
      </Stack>
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
