'use client';
import { Card, CardActionArea, CardContent, Chip, Divider, Tooltip, Typography, Stack, Box } from '@mui/material';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import StarIcon from '@mui/icons-material/Star';
import StarOutlineIcon from '@mui/icons-material/StarOutline';
import { XrefRecommendation, CertificationSource, deriveRecommendationCategories } from '@/lib/types';

interface RecommendationCardProps {
  recommendation: XrefRecommendation;
  onClick: () => void;
  onManufacturerClick?: (manufacturer: string) => void;
  showCommercial?: boolean;
  isPreferred?: boolean;
  onTogglePreferred?: () => void;
}

const THIRD_PARTY_LABELS: Record<string, string> = {
  partsio_fff: 'Pin to Pin (Parts.io)',
  partsio_functional: 'Functional (Parts.io)',
  mouser: 'Mouser Suggested',
};

function formatThirdPartyTooltip(sources: CertificationSource[]): string {
  const thirdParty = sources.filter(s => s !== 'manufacturer');
  if (thirdParty.length === 0) return '';
  return thirdParty.map(s => THIRD_PARTY_LABELS[s] || s).join(', ');
}

export default function RecommendationCard({ recommendation, onClick, onManufacturerClick, showCommercial, isPreferred, onTogglePreferred }: RecommendationCardProps) {
  const { part, matchDetails, dataSource, certifiedBy, enrichedFrom } = recommendation;
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
                {(() => {
                  const cats = deriveRecommendationCategories(recommendation);
                  const thirdPartySources = certifiedBy?.filter(s => s !== 'manufacturer') || [];
                  return (
                    <>
{cats.includes('manufacturer_certified') && (
                        <Chip label="MFR Certified" size="small" variant="outlined" sx={{ height: 18, fontSize: '0.6rem', color: '#66BB6A', borderColor: '#66BB6A' }} />
                      )}
                      {cats.includes('third_party_certified') && (
                        <Tooltip title={formatThirdPartyTooltip(thirdPartySources)} arrow>
                          <Chip label="Accuris Certified" size="small" variant="outlined" sx={{ height: 18, fontSize: '0.6rem', color: '#FFA726', borderColor: '#FFA726' }} />
                        </Tooltip>
                      )}
                    </>
                  );
                })()}
                {part.datasheetUrl && (
                  <Box
                    component="span"
                    role="link"
                    onClick={(e: React.MouseEvent) => { e.stopPropagation(); e.preventDefault(); window.open(part.datasheetUrl, '_blank'); }}
                    sx={{ cursor: 'pointer', display: 'inline-flex', '&:hover': { opacity: 0.8 } }}
                  >
                    <PictureAsPdfOutlinedIcon sx={{ fontSize: 14, color: '#E57373' }} />
                  </Box>
                )}
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
              <Typography variant="body2" color="text.primary" noWrap component="div">
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
                {dataSource === 'atlas' && (
                  <Tooltip title="Atlas — Chinese manufacturer" arrow>
                    <Box component="span" sx={{ ml: 0.5, fontSize: 11, verticalAlign: 'middle', lineHeight: 1 }}>&#127464;&#127475;</Box>
                  </Tooltip>
                )}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontSize: '0.8rem' }} noWrap>
                {part.description}
              </Typography>
              {dataSource && (
                <Typography variant="body2" sx={{ mt: 0.25, fontSize: '0.65rem', color: 'text.disabled', fontStyle: 'italic' }} noWrap>
                  Attributes: {[
                    dataSource === 'digikey' ? 'Digikey' : dataSource === 'atlas' ? 'Atlas' : dataSource === 'partsio' ? 'Parts.io' : dataSource,
                    enrichedFrom === 'partsio' && dataSource !== 'partsio' ? 'Parts.io' : null,
                  ].filter(Boolean).join(', ')}
                </Typography>
              )}
              {showCommercial && (part.unitPrice != null || part.quantityAvailable != null || part.supplierQuotes?.length) && (
                <Box sx={{ mt: 0.25 }}>
                  {part.supplierQuotes && part.supplierQuotes.length > 0 ? (
                    part.supplierQuotes.map(q => (
                      <Typography key={q.supplier} variant="body2" color="text.secondary" noWrap>
                        {q.supplier === 'digikey' ? 'Digikey' : q.supplier === 'mouser' ? 'Mouser' : q.supplier}: {q.unitPrice != null ? `$${q.unitPrice.toFixed(2)}` : '—'} · {q.quantityAvailable != null ? `${q.quantityAvailable.toLocaleString()} in stock` : '—'}
                      </Typography>
                    ))
                  ) : (
                    <Typography variant="body2" color="text.secondary" noWrap>
                      Digikey: {part.unitPrice != null ? `$${part.unitPrice.toFixed(2)}` : '—'} · {part.quantityAvailable != null ? `${part.quantityAvailable.toLocaleString()} in stock` : '—'}
                    </Typography>
                  )}
                </Box>
              )}
              {showSummary && (
                <>
                  <Divider sx={{ my: 1, opacity: 0.4 }} />
                  <Typography variant="caption" sx={{ fontSize: '0.72rem' }} component="div">
                    <Box component="span" sx={{ color: 'text.secondary' }}>Replacement attributes: </Box>
                    {failCount > 0 && (
                      <Box component="span" sx={{ color: '#FF5252' }}>
                        {failCount} failed
                      </Box>
                    )}
                    {failCount > 0 && reviewCount > 0 && (
                      <Box component="span" sx={{ color: 'text.secondary' }}> · </Box>
                    )}
                    {reviewCount > 0 && (
                      <Box component="span" sx={{ color: '#FFD54F' }}>
                        {reviewCount} need review
                      </Box>
                    )}
                  </Typography>
                </>
              )}
            </Box>
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
