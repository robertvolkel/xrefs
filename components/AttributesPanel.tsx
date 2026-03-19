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
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
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

      {/* Lifecycle & Compliance — collapsed by default */}
      {attributes && (() => {
        const p = attributes.part;
        const fieldCount = [p.yteol != null, p.riskRank != null, !!p.countryOfOrigin, !!p.reachCompliance, !!p.eccnCode, !!p.htsCode, p.factoryLeadTimeWeeks != null].filter(Boolean).length;
        if (fieldCount === 0) return null;
        return (
          <Accordion defaultExpanded={false} disableGutters elevation={0} sx={{ flexShrink: 0, borderTop: 1, borderColor: 'divider', '&:before': { display: 'none' }, bgcolor: 'transparent' }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: '1rem', color: 'text.secondary' }} />} sx={{ minHeight: 32, px: 2, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {t('attributes.lifecycleHeading', 'Lifecycle & Compliance')} ({fieldCount})
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0 }}>
              <Table size="small">
                <TableBody>
                  {p.yteol != null && (
                    <TableRow hover sx={{ height: { xs: ROW_HEIGHT_MOBILE, md: ROW_HEIGHT } }}>
                      <TableCell sx={{ color: 'text.secondary', fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE }, borderColor: 'divider', width: '50%', py: { xs: ROW_PY_MOBILE, md: ROW_PY } }}>YTEOL</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE }, borderColor: 'divider', py: { xs: ROW_PY_MOBILE, md: ROW_PY } }}>{p.yteol.toFixed(1)} yrs</TableCell>
                    </TableRow>
                  )}
                  {p.riskRank != null && (
                    <TableRow hover sx={{ height: { xs: ROW_HEIGHT_MOBILE, md: ROW_HEIGHT } }}>
                      <TableCell sx={{ color: 'text.secondary', fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE }, borderColor: 'divider', width: '50%', py: { xs: ROW_PY_MOBILE, md: ROW_PY } }}>Risk Rank</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE }, borderColor: 'divider', py: { xs: ROW_PY_MOBILE, md: ROW_PY } }}>
                        <Stack direction="row" alignItems="center" spacing={0.75}>
                          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: p.riskRank <= 2 ? '#69F0AE' : p.riskRank <= 5 ? '#FFD54F' : '#FF5252', flexShrink: 0 }} />
                          <span>{p.riskRank.toFixed(1)}</span>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  )}
                  {p.countryOfOrigin && (
                    <TableRow hover sx={{ height: { xs: ROW_HEIGHT_MOBILE, md: ROW_HEIGHT } }}>
                      <TableCell sx={{ color: 'text.secondary', fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE }, borderColor: 'divider', width: '50%', py: { xs: ROW_PY_MOBILE, md: ROW_PY } }}>Country of Origin</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE }, borderColor: 'divider', py: { xs: ROW_PY_MOBILE, md: ROW_PY } }}>{p.countryOfOrigin}</TableCell>
                    </TableRow>
                  )}
                  {p.reachCompliance && (
                    <TableRow hover sx={{ height: { xs: ROW_HEIGHT_MOBILE, md: ROW_HEIGHT } }}>
                      <TableCell sx={{ color: 'text.secondary', fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE }, borderColor: 'divider', width: '50%', py: { xs: ROW_PY_MOBILE, md: ROW_PY } }}>REACH</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE }, borderColor: 'divider', py: { xs: ROW_PY_MOBILE, md: ROW_PY } }}>{p.reachCompliance}</TableCell>
                    </TableRow>
                  )}
                  {p.eccnCode && (
                    <TableRow hover sx={{ height: { xs: ROW_HEIGHT_MOBILE, md: ROW_HEIGHT } }}>
                      <TableCell sx={{ color: 'text.secondary', fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE }, borderColor: 'divider', width: '50%', py: { xs: ROW_PY_MOBILE, md: ROW_PY } }}>ECCN</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE }, borderColor: 'divider', py: { xs: ROW_PY_MOBILE, md: ROW_PY } }}>{p.eccnCode}</TableCell>
                    </TableRow>
                  )}
                  {p.htsCode && (
                    <TableRow hover sx={{ height: { xs: ROW_HEIGHT_MOBILE, md: ROW_HEIGHT } }}>
                      <TableCell sx={{ color: 'text.secondary', fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE }, borderColor: 'divider', width: '50%', py: { xs: ROW_PY_MOBILE, md: ROW_PY } }}>HTS Code</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE }, borderColor: 'divider', py: { xs: ROW_PY_MOBILE, md: ROW_PY } }}>{p.htsCode}</TableCell>
                    </TableRow>
                  )}
                  {p.factoryLeadTimeWeeks != null && (
                    <TableRow hover sx={{ height: { xs: ROW_HEIGHT_MOBILE, md: ROW_HEIGHT } }}>
                      <TableCell sx={{ color: 'text.secondary', fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE }, borderColor: 'divider', width: '50%', py: { xs: ROW_PY_MOBILE, md: ROW_PY } }}>Factory Lead Time</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE }, borderColor: 'divider', py: { xs: ROW_PY_MOBILE, md: ROW_PY } }}>{p.factoryLeadTimeWeeks} wks</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </AccordionDetails>
          </Accordion>
        );
      })()}
    </Box>
  );
}
