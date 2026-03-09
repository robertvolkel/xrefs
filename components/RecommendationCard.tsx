'use client';
import { Card, CardActionArea, CardContent, Chip, Divider, Typography, Stack, Box } from '@mui/material';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import StarIcon from '@mui/icons-material/Star';
import StarOutlineIcon from '@mui/icons-material/StarOutline';
import { XrefRecommendation } from '@/lib/types';

interface RecommendationCardProps {
  recommendation: XrefRecommendation;
  onClick: () => void;
  onManufacturerClick?: (manufacturer: string) => void;
  showCommercial?: boolean;
  isPreferred?: boolean;
  onTogglePreferred?: () => void;
}

export default function RecommendationCard({ recommendation, onClick, onManufacturerClick, showCommercial, isPreferred, onTogglePreferred }: RecommendationCardProps) {
  const { part, matchDetails } = recommendation;
  const failCount = matchDetails.filter(d => d.ruleResult === 'fail').length;
  const reviewCount = matchDetails.filter(d => d.ruleResult === 'review').length;
  const showSummary = failCount > 0 || reviewCount > 0;

  return (
    <Card
      variant="outlined"
      sx={{
        position: 'relative',
        bgcolor: 'background.default',
        '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
        transition: 'border-color 0.2s ease, background-color 0.2s ease',
      }}
    >
      <CardActionArea onClick={onClick}>
        <CardContent sx={{ py: 1.5, px: { xs: 1.5, sm: 2 }, '&:last-child': { pb: 1.5 } }}>
          <Stack direction="row" alignItems="center" spacing={2}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" alignItems="center" spacing={0.75}>
                <Typography
                  variant="subtitle2"
                  color="primary"
                  sx={{ fontFamily: 'monospace', fontSize: { xs: '0.9rem', sm: '0.85rem' } }}
                  noWrap
                >
                  {part.mpn}
                </Typography>
                <Chip label={part.status} size="small" color={part.status === 'Active' ? 'success' : 'warning'} variant="outlined" sx={{ height: 18, fontSize: '0.6rem' }} />
                {part.qualifications?.map(q => (
                  <Chip key={q} label={q} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.6rem', color: '#4FC3F7', borderColor: '#4FC3F7' }} />
                ))}
                {onTogglePreferred && (
                  <Box
                    component="span"
                    onClick={(e: React.MouseEvent) => { e.stopPropagation(); e.preventDefault(); onTogglePreferred(); }}
                    sx={{
                      ml: 'auto',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      color: isPreferred ? '#FFD54F' : 'text.disabled',
                      '&:hover': { color: '#FFD54F' },
                      transition: 'color 0.15s ease',
                    }}
                  >
                    {isPreferred
                      ? <StarIcon sx={{ fontSize: 18 }} />
                      : <StarOutlineIcon sx={{ fontSize: 18 }} />
                    }
                  </Box>
                )}
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
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontSize: '0.8rem' }} noWrap component="div">
                {part.description}
                {part.datasheetUrl && (
                  <Box
                    component="span"
                    role="link"
                    onClick={(e: React.MouseEvent) => { e.stopPropagation(); e.preventDefault(); window.open(part.datasheetUrl, '_blank'); }}
                    sx={{ ml: 0.5, verticalAlign: 'middle', cursor: 'pointer', display: 'inline-flex', '&:hover': { opacity: 0.8 } }}
                  >
                    <PictureAsPdfOutlinedIcon sx={{ fontSize: 14, color: '#E57373' }} />
                  </Box>
                )}
              </Typography>
              {showCommercial && (
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 0.5 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem' }}>
                    {part.unitPrice != null ? `$${part.unitPrice.toFixed(2)}` : '—'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem', opacity: 0.5 }}>·</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem' }}>
                    {part.quantityAvailable != null ? `${part.quantityAvailable.toLocaleString()} in stock` : '—'}
                  </Typography>
                </Stack>
              )}
              {showSummary && (
                <>
                  <Divider sx={{ my: 1, opacity: 0.4 }} />
                  <Stack direction="row" alignItems="center" spacing={0.75} sx={{ flexWrap: 'wrap', gap: 0.25 }}>
                    {failCount > 0 && (
                      <Stack direction="row" alignItems="center" spacing={0.4}>
                        <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: '#FF5252', flexShrink: 0 }} />
                        <Typography variant="caption" sx={{ fontSize: '0.72rem', color: '#FF5252' }}>
                          {failCount} failing
                        </Typography>
                      </Stack>
                    )}
                    {failCount > 0 && reviewCount > 0 && (
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem', opacity: 0.5 }}>·</Typography>
                    )}
                    {reviewCount > 0 && (
                      <Stack direction="row" alignItems="center" spacing={0.4}>
                        <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: '#FFD54F', flexShrink: 0 }} />
                        <Typography variant="caption" sx={{ fontSize: '0.72rem', color: '#FFD54F' }}>
                          {reviewCount} needs review
                        </Typography>
                      </Stack>
                    )}
                  </Stack>
                </>
              )}
            </Box>
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
