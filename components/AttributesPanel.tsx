'use client';
import { useState, useMemo } from 'react';
import {
  Box,
  Link,
  Tooltip,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Skeleton,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { PartAttributes, XrefRecommendation } from '@/lib/types';
import { ATTRIBUTES_HEADER_HEIGHT, ATTRIBUTES_HEADER_HEIGHT_MOBILE, ROW_FONT_SIZE, ROW_FONT_SIZE_MOBILE, ROW_PY, ROW_PY_MOBILE, ROW_HEIGHT, ROW_HEIGHT_MOBILE } from '@/lib/layoutConstants';
import { useScrollIndicators } from '@/hooks/useScrollIndicators';
import type { AttributesTab } from './DesktopLayout';
import { pillGroupSx, OverviewContent, CommercialContent } from './AttributesTabContent';
import DomainChip, { inferContextActive } from './DomainChip';

interface AttributesPanelProps {
  attributes: PartAttributes | null;
  loading?: boolean;
  title: string;
  activeTab: AttributesTab;
  onTabChange: (tab: AttributesTab) => void;
  allRecommendations?: XrefRecommendation[];
  onManufacturerClick?: (manufacturer: string) => void;
}

function SkeletonSectionHeader() {
  return (
    <Box sx={{ bgcolor: 'background.paper', borderTop: 1, borderBottom: 1, borderColor: 'divider', px: 2, py: 0.75 }}>
      <Skeleton width={90} height={14} />
    </Box>
  );
}

function SkeletonFieldRow({ labelWidth, valueWidth }: { labelWidth: number; valueWidth: number }) {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ py: 0.75, px: 2, minHeight: 32 }}>
      <Skeleton width={labelWidth} height={14} />
      <Skeleton width={valueWidth} height={14} />
    </Stack>
  );
}

export function OverviewSkeleton() {
  return (
    <Box sx={{ flex: 1, overflowY: 'auto' }}>
      {/* Hero */}
      <Box sx={{ display: 'flex', gap: 1.5, px: 2, py: 1.5 }}>
        <Skeleton variant="rectangular" width={80} height={80} sx={{ borderRadius: 1, flexShrink: 0 }} />
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 0.5 }}>
          <Skeleton width="50%" height={12} />
          <Skeleton width="70%" height={18} />
          <Skeleton width="40%" height={14} />
        </Box>
      </Box>
      <SkeletonSectionHeader />
      <SkeletonFieldRow labelWidth={80} valueWidth={220} />
      <SkeletonFieldRow labelWidth={70} valueWidth={70} />
      <SkeletonFieldRow labelWidth={110} valueWidth={60} />
      <SkeletonFieldRow labelWidth={90} valueWidth={80} />
      <SkeletonFieldRow labelWidth={120} valueWidth={50} />
      <SkeletonSectionHeader />
      <SkeletonFieldRow labelWidth={80} valueWidth={40} />
      <SkeletonFieldRow labelWidth={90} valueWidth={70} />
      <SkeletonFieldRow labelWidth={100} valueWidth={120} />
      <SkeletonFieldRow labelWidth={90} valueWidth={70} />
      <SkeletonSectionHeader />
      <Box sx={{ px: 2, py: 0.75 }}>
        <Stack direction="row" spacing={0.75}>
          <Skeleton variant="rounded" width={70} height={20} />
          <Skeleton variant="rounded" width={60} height={20} />
          <Skeleton variant="rounded" width={80} height={20} />
        </Stack>
      </Box>
    </Box>
  );
}

export function CommercialSkeleton() {
  return (
    <Box sx={{ flex: 1, overflowY: 'auto', px: 2, py: 1.5 }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <Box key={i} sx={{ mb: 2, p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Skeleton width={120} height={18} />
            <Skeleton width={60} height={18} />
          </Stack>
          <Skeleton width="40%" height={14} sx={{ mb: 0.5 }} />
          <Skeleton width="60%" height={14} sx={{ mb: 0.5 }} />
          <Skeleton width="50%" height={14} />
        </Box>
      ))}
    </Box>
  );
}

export default function AttributesPanel({ attributes, loading, title, activeTab, onTabChange, allRecommendations, onManufacturerClick }: AttributesPanelProps) {
  const { t } = useTranslation();
  const { ref: scrollRef, canScrollUp, canScrollDown } = useScrollIndicators<HTMLDivElement>();
  const [showExtras, setShowExtras] = useState(false);

  // Split Atlas parameters into recognized (in schema) and extras (unrecognized)
  const { recognized, extras } = useMemo(() => {
    if (!attributes?.parameters) return { recognized: [], extras: [] };
    const sorted = [...attributes.parameters].sort((a, b) => a.sortOrder - b.sortOrder);
    // Only split for Atlas-sourced data that has the recognized flag
    const hasRecognizedFlag = sorted.some((p) => p.recognized !== undefined);
    if (!hasRecognizedFlag) return { recognized: sorted, extras: [] };
    return {
      recognized: sorted.filter((p) => p.recognized !== false),
      extras: sorted.filter((p) => p.recognized === false),
    };
  }, [attributes?.parameters]);
  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header — taller to include pill bar */}
      <Box
        sx={{
          height: { xs: ATTRIBUTES_HEADER_HEIGHT_MOBILE, md: ATTRIBUTES_HEADER_HEIGHT },
          minHeight: { xs: ATTRIBUTES_HEADER_HEIGHT_MOBILE, md: ATTRIBUTES_HEADER_HEIGHT },
          px: 2,
          py: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {loading ? (
          <>
            <Skeleton width={80} height={16} sx={{ mb: 0.5 }} />
            <Skeleton width={200} height={22} />
            <Skeleton width={160} height={16} sx={{ mt: 0.5 }} />
            <Skeleton width={180} height={28} sx={{ mt: 1, borderRadius: '14px' }} />
          </>
        ) : attributes ? (
          <>
            <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {title}
            </Typography>
            <Stack direction="row" alignItems="center" spacing={0.75}>
              <Typography variant="h6" sx={{ fontFamily: 'monospace', fontSize: '0.95rem', lineHeight: 1.3 }} noWrap>
                {attributes.part.mpn}
              </Typography>
              <Chip label={attributes.part.status} size="small" color={attributes.part.status === 'Active' ? 'success' : 'warning'} variant="outlined" sx={{ height: 18, fontSize: '0.6rem' }} />
              <DomainChip
                classification={attributes.part.qualificationDomain}
                contextActive={inferContextActive(allRecommendations ?? [])}
              />
              {attributes.part.qualifications?.map(q => (
                <Chip key={q} label={q} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.6rem', color: '#4FC3F7', borderColor: '#4FC3F7' }} />
              ))}
            </Stack>
            <Typography variant="body2" color="text.primary" sx={{ fontSize: '0.78rem', mt: 0.5 }} noWrap component="div">
              {onManufacturerClick && attributes.part.manufacturer && attributes.part.mfrOrigin === 'atlas' ? (
                <Box
                  component="span"
                  onClick={() => onManufacturerClick(attributes.part.manufacturer)}
                  sx={{
                    cursor: 'pointer',
                    '&:hover': { color: 'primary.main', textDecoration: 'underline' },
                    transition: 'color 0.15s ease',
                  }}
                >
                  {attributes.part.manufacturer}
                </Box>
              ) : (
                attributes.part.manufacturer
              )}
              {attributes.part.mfrOrigin === 'atlas' && (
                <Tooltip title="Chinese manufacturer" arrow>
                  <Box component="span" sx={{ ml: 0.5, fontSize: 11, verticalAlign: 'middle', lineHeight: 1 }}>&#127464;&#127475;</Box>
                </Tooltip>
              )}
            </Typography>
            {/* Pill segment control */}
            <ToggleButtonGroup
              value={activeTab}
              exclusive
              onChange={(_, v) => { if (v !== null) onTabChange(v as AttributesTab); }}
              size="small"
              sx={pillGroupSx}
            >
              <ToggleButton value="overview">{t('attributes.tabOverview')}</ToggleButton>
              <ToggleButton value="specs">{t('attributes.tabSpecs')}</ToggleButton>
              <ToggleButton value="commercial">{t('attributes.tabCommercial')}</ToggleButton>
            </ToggleButtonGroup>
          </>
        ) : null}
      </Box>

      {/* Tab content */}
      {activeTab === 'specs' && (
        <Box sx={{ flex: 1, position: 'relative', minHeight: 0 }}>
          {canScrollUp && (
            <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 24, background: 'linear-gradient(to bottom, rgba(0,0,0,0.12), transparent)', pointerEvents: 'none', zIndex: 1 }} />
          )}
          {canScrollDown && (
            <Box sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 24, background: 'linear-gradient(to top, rgba(0,0,0,0.12), transparent)', pointerEvents: 'none', zIndex: 1 }} />
          )}
          <TableContainer ref={scrollRef} sx={{ height: '100%', overflowY: 'auto' }}>
            <Table size="small" stickyHeader sx={{ tableLayout: 'fixed' }}>
              <TableHead>
                <TableRow sx={{ height: { xs: ROW_HEIGHT_MOBILE, md: ROW_HEIGHT } }}>
                  <TableCell sx={{ bgcolor: 'background.paper', fontSize: '0.7rem', fontWeight: 600, borderColor: 'divider', color: 'text.secondary', py: { xs: ROW_PY_MOBILE, md: ROW_PY }, width: '50%' }}>
                    {t('attributes.parameterHeader')}
                  </TableCell>
                  <TableCell sx={{ bgcolor: 'background.paper', fontSize: '0.7rem', fontWeight: 600, borderColor: 'divider', color: 'text.secondary', py: { xs: ROW_PY_MOBILE, md: ROW_PY }, width: '50%' }}>
                    {t('attributes.valueHeader')}
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading
                  ? Array.from({ length: 12 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell sx={{ borderColor: 'divider', py: { xs: ROW_PY_MOBILE, md: ROW_PY } }}>
                          <Skeleton width={120} height={16} />
                        </TableCell>
                        <TableCell sx={{ borderColor: 'divider', py: { xs: ROW_PY_MOBILE, md: ROW_PY } }}>
                          <Skeleton width={80} height={16} />
                        </TableCell>
                      </TableRow>
                    ))
                  : <>
                      {recognized.map((param) => (
                        <TableRow key={param.parameterId} hover sx={{ height: { xs: ROW_HEIGHT_MOBILE, md: ROW_HEIGHT } }}>
                          <TableCell
                            sx={{
                              color: 'text.secondary',
                              fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE },
                              borderColor: 'divider',
                              width: '50%',
                              py: { xs: ROW_PY_MOBILE, md: ROW_PY },
                            }}
                          >
                            {param.parameterName}
                          </TableCell>
                          <TableCell
                            sx={{
                              fontFamily: 'monospace',
                              fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE },
                              borderColor: 'divider',
                              py: { xs: ROW_PY_MOBILE, md: ROW_PY },
                            }}
                          >
                            <Stack direction="row" alignItems="center" spacing={0.75}>
                              <Box component="span" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{param.value}</Box>
                              {param.source && (
                                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: '50%', border: '1px solid', borderColor: 'text.disabled', fontSize: '0.5rem', color: 'text.disabled', fontWeight: 600, fontFamily: 'sans-serif', flexShrink: 0 }}>
                                  {param.source === 'digikey' ? 'D' : param.source === 'partsio' ? 'P' : 'A'}
                                </Box>
                              )}
                            </Stack>
                          </TableCell>
                        </TableRow>
                      ))}
                      {/* Extra unrecognized attributes toggle */}
                      {extras.length > 0 && (
                        <TableRow>
                          <TableCell colSpan={2} sx={{ borderColor: 'divider', py: 0.5, textAlign: 'right' }}>
                            <Link
                              component="button"
                              variant="caption"
                              onClick={() => setShowExtras(!showExtras)}
                              sx={{ color: 'text.disabled', fontSize: '0.7rem', textDecoration: 'none', '&:hover': { color: 'text.secondary' } }}
                            >
                              {showExtras ? 'Less' : `More (${extras.length})`}
                            </Link>
                          </TableCell>
                        </TableRow>
                      )}
                      {showExtras && extras.map((param) => (
                        <TableRow key={param.parameterId} sx={{ height: { xs: ROW_HEIGHT_MOBILE, md: ROW_HEIGHT } }}>
                          <TableCell
                            sx={{
                              color: 'text.disabled',
                              fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE },
                              borderColor: 'divider',
                              width: '50%',
                              py: { xs: ROW_PY_MOBILE, md: ROW_PY },
                            }}
                          >
                            {param.parameterName}
                          </TableCell>
                          <TableCell
                            sx={{
                              fontFamily: 'monospace',
                              fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE },
                              borderColor: 'divider',
                              color: 'text.disabled',
                              py: { xs: ROW_PY_MOBILE, md: ROW_PY },
                            }}
                          >
                            {param.value}
                          </TableCell>
                        </TableRow>
                      ))}
                    </>}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {activeTab === 'overview' && (
        loading ? (
          <OverviewSkeleton />
        ) : attributes ? (
          <OverviewContent
            part={attributes.part}
            t={t}
            allRecommendations={allRecommendations}
            dataSource={attributes.dataSource as 'digikey' | 'atlas' | 'partsio'}
          />
        ) : null
      )}

      {activeTab === 'commercial' && (
        loading ? (
          <CommercialSkeleton />
        ) : attributes ? (
          <CommercialContent part={attributes.part} t={t} />
        ) : null
      )}
    </Box>
  );
}
