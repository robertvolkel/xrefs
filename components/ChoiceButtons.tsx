'use client';
import { Button, Stack } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import { ChoiceOption } from '@/lib/types';

interface ChoiceButtonsProps {
  choices: ChoiceOption[];
  /** When set, marks the matching choice as selected and disables all interaction.
   *  Used in place of echoing the user's pick as a separate chat message. */
  clickedChoiceId?: string;
  onSelect: (choice: ChoiceOption) => void;
}

export default function ChoiceButtons({ choices, clickedChoiceId, onSelect }: ChoiceButtonsProps) {
  const locked = !!clickedChoiceId;
  return (
    <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', gap: 1 }}>
      {choices.map((choice) => {
        const isSelected = clickedChoiceId === choice.id;
        const isUnselected = locked && !isSelected;
        return (
          <Button
            key={choice.id}
            variant={isSelected || choice.action === 'confirm_part' ? 'contained' : 'outlined'}
            size="small"
            color={isSelected || choice.action === 'confirm_part' ? 'primary' : 'inherit'}
            startIcon={isSelected ? <CheckIcon /> : undefined}
            onClick={() => onSelect(choice)}
            disabled={locked}
            sx={{
              minHeight: { xs: 44, sm: 'auto' },
              textTransform: 'none',
              opacity: isUnselected ? 0.4 : 1,
              // Override MUI's disabled styling on the picked button so it keeps
              // its primary look once the user has committed — disabled ≠ greyed-out here.
              '&.Mui-disabled': isSelected
                ? { color: 'primary.contrastText', backgroundColor: 'primary.main' }
                : undefined,
            }}
          >
            {choice.label}
          </Button>
        );
      })}
    </Stack>
  );
}
