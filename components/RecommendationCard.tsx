'use client';
import { Card, CardActionArea, CardContent, Typography, Stack, Box } from '@mui/material';
import { XrefRecommendation } from '@/lib/types';
import MatchPercentageBadge from './MatchPercentageBadge';

interface RecommendationCardProps {
  recommendation: XrefRecommendation;
  onClick: () => void;
  onManufacturerClick?: (manufacturer: string) => void;
}

export default function RecommendationCard({ recommendation, onClick, onManufacturerClick }: RecommendationCardProps) {
  const { part, matchPercentage, notes } = recommendation;

  return (
    <Card
      variant="outlined"
      sx={{
        bgcolor: 'background.default',
        '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
        transition: 'border-color 0.2s ease, background-color 0.2s ease',
      }}
    >
      <CardActionArea onClick={onClick}>
        <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
          <Stack direction="row" alignItems="center" spacing={2}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                variant="subtitle2"
                color="primary"
                sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                noWrap
              >
                {part.mpn}
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                noWrap
                component="span"
                onClick={onManufacturerClick ? (e: React.MouseEvent) => {
                  e.stopPropagation();
                  onManufacturerClick(part.manufacturer);
                } : undefined}
                sx={onManufacturerClick ? {
                  cursor: 'pointer',
                  display: 'block',
                  '&:hover': { color: 'primary.main', textDecoration: 'underline' },
                  transition: 'color 0.15s ease',
                } : { display: 'block' }}
              >
                {part.manufacturer}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontSize: '0.8rem' }} noWrap>
                {part.description}
              </Typography>
              {notes && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ mt: 0.5, display: 'block', fontStyle: 'italic', opacity: 0.8 }}
                  noWrap
                >
                  {notes}
                </Typography>
              )}
            </Box>
            <MatchPercentageBadge percentage={matchPercentage} />
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
