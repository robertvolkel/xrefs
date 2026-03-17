'use client';
import {
  Box,
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
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { PartAttributes } from '@/lib/types';
import { HEADER_HEIGHT, HEADER_HEIGHT_MOBILE, ROW_FONT_SIZE, ROW_FONT_SIZE_MOBILE, ROW_PY, ROW_PY_MOBILE, ROW_HEIGHT, ROW_HEIGHT_MOBILE } from '@/lib/layoutConstants';
import { useScrollIndicators } from '@/hooks/useScrollIndicators';

interface AttributesPanelProps {
  attributes: PartAttributes | null;
  loading?: boolean;
  title: string;
}

export default function AttributesPanel({ attributes, loading, title }: AttributesPanelProps) {
  const { t } = useTranslation();
  const { ref: scrollRef, canScrollUp, canScrollDown } = useScrollIndicators<HTMLDivElement>();
  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header — fixed height to align with right panel */}
      <Box
        sx={{
          height: { xs: HEADER_HEIGHT_MOBILE, md: HEADER_HEIGHT },
          minHeight: { xs: HEADER_HEIGHT_MOBILE, md: HEADER_HEIGHT },
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
          </>
        ) : null}
      </Box>

      {/* Attributes table */}
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
              : attributes?.parameters
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((param) => (
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
          </TableBody>
        </Table>
      </TableContainer>
      </Box>

      {/* Lifecycle & Compliance */}
      {attributes && (attributes.part.yteol != null || attributes.part.riskRank != null || attributes.part.countryOfOrigin || attributes.part.reachCompliance || attributes.part.eccnCode || attributes.part.htsCode || attributes.part.factoryLeadTimeWeeks != null) && (
        <Box sx={{ borderTop: 1, borderColor: 'divider', flexShrink: 0 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', px: 2, pt: 1.5, pb: 0.5 }}>
            {t('attributes.lifecycleHeading', 'Lifecycle & Compliance')}
          </Typography>
          <Table size="small">
            <TableBody>
              {attributes.part.yteol != null && (
                <TableRow hover sx={{ height: { xs: ROW_HEIGHT_MOBILE, md: ROW_HEIGHT } }}>
                  <TableCell sx={{ color: 'text.secondary', fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE }, borderColor: 'divider', width: '50%', py: { xs: ROW_PY_MOBILE, md: ROW_PY } }}>YTEOL</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE }, borderColor: 'divider', py: { xs: ROW_PY_MOBILE, md: ROW_PY } }}>{attributes.part.yteol.toFixed(1)} yrs</TableCell>
                </TableRow>
              )}
              {attributes.part.riskRank != null && (
                <TableRow hover sx={{ height: { xs: ROW_HEIGHT_MOBILE, md: ROW_HEIGHT } }}>
                  <TableCell sx={{ color: 'text.secondary', fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE }, borderColor: 'divider', width: '50%', py: { xs: ROW_PY_MOBILE, md: ROW_PY } }}>Risk Rank</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE }, borderColor: 'divider', py: { xs: ROW_PY_MOBILE, md: ROW_PY } }}>
                    <Stack direction="row" alignItems="center" spacing={0.75}>
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: attributes.part.riskRank <= 2 ? '#69F0AE' : attributes.part.riskRank <= 5 ? '#FFD54F' : '#FF5252', flexShrink: 0 }} />
                      <span>{attributes.part.riskRank.toFixed(1)}</span>
                    </Stack>
                  </TableCell>
                </TableRow>
              )}
              {attributes.part.countryOfOrigin && (
                <TableRow hover sx={{ height: { xs: ROW_HEIGHT_MOBILE, md: ROW_HEIGHT } }}>
                  <TableCell sx={{ color: 'text.secondary', fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE }, borderColor: 'divider', width: '50%', py: { xs: ROW_PY_MOBILE, md: ROW_PY } }}>Country of Origin</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE }, borderColor: 'divider', py: { xs: ROW_PY_MOBILE, md: ROW_PY } }}>{attributes.part.countryOfOrigin}</TableCell>
                </TableRow>
              )}
              {attributes.part.reachCompliance && (
                <TableRow hover sx={{ height: { xs: ROW_HEIGHT_MOBILE, md: ROW_HEIGHT } }}>
                  <TableCell sx={{ color: 'text.secondary', fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE }, borderColor: 'divider', width: '50%', py: { xs: ROW_PY_MOBILE, md: ROW_PY } }}>REACH</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE }, borderColor: 'divider', py: { xs: ROW_PY_MOBILE, md: ROW_PY } }}>{attributes.part.reachCompliance}</TableCell>
                </TableRow>
              )}
              {attributes.part.eccnCode && (
                <TableRow hover sx={{ height: { xs: ROW_HEIGHT_MOBILE, md: ROW_HEIGHT } }}>
                  <TableCell sx={{ color: 'text.secondary', fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE }, borderColor: 'divider', width: '50%', py: { xs: ROW_PY_MOBILE, md: ROW_PY } }}>ECCN</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE }, borderColor: 'divider', py: { xs: ROW_PY_MOBILE, md: ROW_PY } }}>{attributes.part.eccnCode}</TableCell>
                </TableRow>
              )}
              {attributes.part.htsCode && (
                <TableRow hover sx={{ height: { xs: ROW_HEIGHT_MOBILE, md: ROW_HEIGHT } }}>
                  <TableCell sx={{ color: 'text.secondary', fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE }, borderColor: 'divider', width: '50%', py: { xs: ROW_PY_MOBILE, md: ROW_PY } }}>HTS Code</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE }, borderColor: 'divider', py: { xs: ROW_PY_MOBILE, md: ROW_PY } }}>{attributes.part.htsCode}</TableCell>
                </TableRow>
              )}
              {attributes.part.factoryLeadTimeWeeks != null && (
                <TableRow hover sx={{ height: { xs: ROW_HEIGHT_MOBILE, md: ROW_HEIGHT } }}>
                  <TableCell sx={{ color: 'text.secondary', fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE }, borderColor: 'divider', width: '50%', py: { xs: ROW_PY_MOBILE, md: ROW_PY } }}>Factory Lead Time</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE }, borderColor: 'divider', py: { xs: ROW_PY_MOBILE, md: ROW_PY } }}>{attributes.part.factoryLeadTimeWeeks} wks</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>
      )}
    </Box>
  );
}
