'use client';
import { Button, Stack } from '@mui/material';
import { formatQuantityPreset } from '@/lib/constants/quantityPresets';

interface QuantityPresetButtonsProps {
  presets: readonly number[];
  onSelect: (quantity: number) => void;
  /** When set, the matching preset renders filled (contained) to mark it active. */
  activeValue?: number;
  disabled?: boolean;
  /** Compact sizing for the Commercial-tab control; default is the larger
   *  touch-target sizing used in the chat prompt. */
  compact?: boolean;
}

/**
 * Shared preset-tier button row used by the chat QuantityPrompt and the
 * Commercial-tab QuantityInline. Sizing differs by context (compact), but the
 * preset list, labels, and selection behavior are unified here.
 */
export default function QuantityPresetButtons({ presets, onSelect, activeValue, disabled, compact }: QuantityPresetButtonsProps) {
  return (
    <Stack direction="row" spacing={compact ? 0.5 : 1} sx={{ flexWrap: 'wrap', gap: compact ? 0.5 : 1 }}>
      {presets.map((q) => (
        <Button
          key={q}
          variant={activeValue === q ? 'contained' : 'outlined'}
          size="small"
          color="inherit"
          onClick={() => { if (q !== activeValue) onSelect(q); }}
          disabled={disabled}
          sx={compact
            ? { minWidth: 44, py: 0.1, px: 0.75, fontSize: '0.65rem', textTransform: 'none', lineHeight: 1.4 }
            : { minHeight: { xs: 44, sm: 'auto' }, textTransform: 'none', minWidth: 56 }}
        >
          {formatQuantityPreset(q)}
        </Button>
      ))}
    </Stack>
  );
}
