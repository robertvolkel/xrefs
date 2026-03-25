'use client';
import { useState, useMemo } from 'react';
import {
  Box,
  Link,
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
import { PartAttributes } from '@/lib/types';
import { ATTRIBUTES_HEADER_HEIGHT, ATTRIBUTES_HEADER_HEIGHT_MOBILE, ROW_FONT_SIZE, ROW_FONT_SIZE_MOBILE, ROW_PY, ROW_PY_MOBILE, ROW_HEIGHT, ROW_HEIGHT_MOBILE } from '@/lib/layoutConstants';
import { useScrollIndicators } from '@/hooks/useScrollIndicators';
import type { AttributesTab } from './DesktopLayout';
import { pillGroupSx, RiskContent, CommercialContent } from './AttributesTabContent';

interface AttributesPanelProps {
  attributes: PartAttributes | null;
  loading?: boolean;
  title: string;
  activeTab: AttributesTab;
  onTabChange: (tab: AttributesTab) => void;
}

export default function AttributesPanel({ attributes, loading, title, activeTab, onTabChange }: AttributesPanelProps) {
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
              {attributes.part.qualifications?.map(q => (
                <Chip key={q} label={q} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.6rem', color: '#4FC3F7', borderColor: '#4FC3F7' }} />
              ))}
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.78rem', mt: 0.5 }} noWrap>
              {attributes.part.manufacturer}
            </Typography>
            {/* Pill segment control */}
            <ToggleButtonGroup
              value={activeTab}
              exclusive
              onChange={(_, v) => { if (v !== null) onTabChange(v as AttributesTab); }}
              size="small"
              sx={pillGroupSx}
            >
              <ToggleButton value="specs">{t('attributes.tabSpecs')}</ToggleButton>
              <ToggleButton value="risk">{t('attributes.tabRisk')}</ToggleButton>
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
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow sx={{ height: { xs: ROW_HEIGHT_MOBILE, md: ROW_HEIGHT } }}>
                  <TableCell sx={{ bgcolor: 'background.paper', fontSize: '0.7rem', fontWeight: 600, borderColor: 'divider', color: 'text.secondary', py: { xs: ROW_PY_MOBILE, md: ROW_PY } }}>
                    {t('attributes.parameterHeader')}
                  </TableCell>
                  <TableCell sx={{ bgcolor: 'background.paper', fontSize: '0.7rem', fontWeight: 600, borderColor: 'divider', color: 'text.secondary', py: { xs: ROW_PY_MOBILE, md: ROW_PY } }}>
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

      {activeTab === 'risk' && attributes && (
        <RiskContent part={attributes.part} t={t} />
      )}

      {activeTab === 'commercial' && attributes && (
        <CommercialContent part={attributes.part} t={t} />
      )}
    </Box>
  );
}
