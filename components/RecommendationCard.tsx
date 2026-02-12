'use client';
import { Card, CardActionArea, CardContent, Chip, Typography, Stack, Box } from '@mui/material';
import { XrefRecommendation } from '@/lib/types';

interface RecommendationCardProps {
  recommendation: XrefRecommendation;
  onClick: () => void;
  onManufacturerClick?: (manufacturer: string) => void;
}

export default function RecommendationCard({ recommendation, onClick, onManufacturerClick }: RecommendationCardProps) {
  const { part, matchDetails, notes } = recommendation;
  const hasFailures = matchDetails.some(d => d.ruleResult === 'fail');
  const hasReviews = !hasFailures && matchDetails.some(d => d.ruleResult === 'review');

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
              <Stack direction="row" alignItems="center" spacing={0.75}>
                <Typography
                  variant="subtitle2"
                  color="primary"
                  sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                  noWrap
                >
                  {part.mpn}
                </Typography>
                <Chip label={part.status} size="small" color={part.status === 'Active' ? 'success' : 'warning'} variant="outlined" sx={{ height: 18, fontSize: '0.6rem' }} />
              </Stack>
              <Typography variant="body2" color="text.secondary" noWrap component="div">
                {onManufacturerClick ? (
                  <Box
                    component="span"
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      e.preventDefault();
                      onManufacturerClick(part.manufacturer);
                    }}
                    sx={{
                      cursor: 'pointer',
                      '&:hover': { color: 'primary.main', textDecoration: 'underline' },
                      transition: 'color 0.15s ease',
                    }}
                  >
                    {part.manufacturer}
                  </Box>
                ) : (
                  part.manufacturer
                )}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontSize: '0.8rem' }} noWrap>
                {part.description}
              </Typography>
              {notes && (
                <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.5 }}>
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      bgcolor: hasFailures ? '#FF5252' : hasReviews ? '#FFD54F' : '#90A4AE',
                      flexShrink: 0,
                    }}
                  />
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontSize: '0.75rem', fontStyle: 'italic', opacity: 0.8 }}
                    noWrap
                  >
                    {notes}
                  </Typography>
                </Stack>
              )}
            </Box>
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
