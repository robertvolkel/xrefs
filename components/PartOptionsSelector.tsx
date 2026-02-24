'use client';
import { Card, CardActionArea, CardContent, Typography, Stack, Chip } from '@mui/material';
import { PartSummary } from '@/lib/types';

interface PartOptionsSelectorProps {
  parts: PartSummary[];
  onSelect: (part: PartSummary) => void;
}

export default function PartOptionsSelector({ parts, onSelect }: PartOptionsSelectorProps) {
  return (
    <Stack spacing={1} sx={{ mt: 1, maxWidth: 480 }}>
      {parts.map((part) => (
        <Card
          key={part.mpn}
          variant="outlined"
          sx={{
            bgcolor: 'background.default',
            '&:hover': { borderColor: 'primary.main' },
            transition: 'border-color 0.2s ease',
          }}
        >
          <CardActionArea onClick={() => onSelect(part)}>
            <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="subtitle2" color="primary" sx={{ fontFamily: 'monospace' }}>
                  {part.mpn}
                </Typography>
                <Chip label={part.category} size="small" variant="outlined" />
                {part.status && (
                  <Chip label={part.status} size="small" color={part.status === 'Active' ? 'success' : 'warning'} variant="outlined" sx={{ height: 18, fontSize: '0.6rem' }} />
                )}
                {part.qualifications?.map(q => (
                  <Chip key={q} label={q} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.6rem', color: '#4FC3F7', borderColor: '#4FC3F7' }} />
                ))}
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {part.manufacturer} &mdash; {part.description}
              </Typography>
            </CardContent>
          </CardActionArea>
        </Card>
      ))}
    </Stack>
  );
}
