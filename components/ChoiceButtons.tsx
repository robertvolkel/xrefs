'use client';
import { Button, Stack } from '@mui/material';
import { ChoiceOption } from '@/lib/types';

interface ChoiceButtonsProps {
  choices: ChoiceOption[];
  onSelect: (choice: ChoiceOption) => void;
}

export default function ChoiceButtons({ choices, onSelect }: ChoiceButtonsProps) {
  return (
    <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', gap: 1 }}>
      {choices.map((choice) => (
        <Button
          key={choice.id}
          variant={choice.action === 'confirm_part' ? 'contained' : 'outlined'}
          size="small"
          color={choice.action === 'confirm_part' ? 'primary' : 'inherit'}
          onClick={() => onSelect(choice)}
          sx={{ minHeight: { xs: 44, sm: 'auto' }, textTransform: 'none' }}
        >
          {choice.label}
        </Button>
      ))}
    </Stack>
  );
}
