'use client';
import { Box, Typography, Stack } from '@mui/material';
import { XrefRecommendation } from '@/lib/types';
import RecommendationCard from './RecommendationCard';

interface RecommendationsPanelProps {
  recommendations: XrefRecommendation[];
  onSelect: (rec: XrefRecommendation) => void;
  onManufacturerClick?: (manufacturer: string) => void;
}

export default function RecommendationsPanel({ recommendations, onSelect, onManufacturerClick }: RecommendationsPanelProps) {
  const sorted = [...recommendations].sort((a, b) => b.matchPercentage - a.matchPercentage);

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Box
        sx={{
          height: 100,
          minHeight: 100,
          p: 2,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Recommended Replacements
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.78rem', mt: 0.5 }}>
          {recommendations.length} match{recommendations.length !== 1 ? 'es' : ''} found — click to compare
        </Typography>
      </Box>
      <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
        <Stack spacing={1.5}>
          {sorted.map((rec) => (
            <RecommendationCard
              key={rec.part.mpn}
              recommendation={rec}
              onClick={() => onSelect(rec)}
              onManufacturerClick={onManufacturerClick}
            />
          ))}
        </Stack>
      </Box>
    </Box>
  );
}
