'use client';
import { Card, CardActionArea, CardContent, Chip, Divider, Tooltip, Typography, Stack, Box } from '@mui/material';
import StarIcon from '@mui/icons-material/Star';
import StarOutlineIcon from '@mui/icons-material/StarOutline';
import { XrefRecommendation, CertificationSource, deriveRecommendationCategories } from '@/lib/types';
import { computePriceRange, formatPrice } from './AttributesTabContent';
import DomainChip from './DomainChip';
import MatchPercentageBadge from './MatchPercentageBadge';

interface RecommendationCardProps {
  recommendation: XrefRecommendation;
  onClick: () => void;
  onManufacturerClick?: (manufacturer: string) => void;
  showCommercial?: boolean;
  isPreferred?: boolean;
  onTogglePreferred?: () => void;
  isEnrichingFC?: boolean;
  /** Whether the user's application context activates qualification-domain
   *  gating (Decision #155). Drives visibility of the unknown-domain chip. */
  contextActive?: boolean;
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

export default function RecommendationCard({ recommendation, onClick, onManufacturerClick, showCommercial, isPreferred, onTogglePreferred, isEnrichingFC, contextActive }: RecommendationCardProps) {
  const { part, matchDetails, dataSource, certifiedBy, enrichedFrom } = recommendation;
  const mfrOrigin = part.mfrOrigin;
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
          <Stack direction="row" alignItems="flex-start" spacing={2}>
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
                <DomainChip
                  classification={part.qualificationDomain}
                  deviation={recommendation.domainDeviation}
                  contextActive={contextActive}
                />
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
                {onManufacturerClick && mfrOrigin === 'atlas' ? (
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
                {mfrOrigin === 'atlas' && (
                  <Tooltip title="Chinese manufacturer" arrow>
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
              {showCommercial && (() => {
                const quotes = part.supplierQuotes ?? [];
                const distributorCount = quotes.length;
                const priceRange = computePriceRange(quotes);
                const totalStock = quotes.reduce((sum, q) => sum + (q.quantityAvailable ?? 0), 0);

                if (distributorCount === 0) {
                  return (
                    <Typography
                      variant="body2"
                      sx={{ mt: 0.5, fontSize: '0.72rem', color: 'text.disabled', fontStyle: isEnrichingFC ? 'italic' : 'normal' }}
                      noWrap
                    >
                      {isEnrichingFC ? 'Loading pricing…' : 'No distributor data'}
                    </Typography>
                  );
                }

                const priceText = priceRange
                  ? priceRange.min === priceRange.max
                    ? formatPrice(priceRange.min, priceRange.currency)
                    : `${formatPrice(priceRange.min, priceRange.currency)}–${formatPrice(priceRange.max, priceRange.currency)}`
                  : '—';

                return (
                  <Box sx={{ mt: 0.5 }}>
                    <Typography
                      variant="body2"
                      sx={{ fontSize: '0.78rem', color: 'common.white' }}
                      noWrap
                    >
                      Price Range: {priceText} ({distributorCount} Distributor{distributorCount === 1 ? '' : 's'})
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ fontSize: '0.78rem', color: 'common.white' }}
                      noWrap
                    >
                      Total Stock: {totalStock.toLocaleString()}
                    </Typography>
                  </Box>
                );
              })()}
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
            <MatchPercentageBadge
              percentage={Math.round(recommendation.matchPercentage)}
              size="small"
              hasFailures={failCount > 0}
              hasReviews={reviewCount > 0}
            />
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
