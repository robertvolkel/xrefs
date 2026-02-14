'use client';
import { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { XrefRecommendation } from '@/lib/types';
import RecommendationCard from './RecommendationCard';
import { HEADER_HEIGHT, HEADER_HEIGHT_MOBILE } from '@/lib/layoutConstants';

interface RecommendationsPanelProps {
  recommendations: XrefRecommendation[];
  onSelect: (rec: XrefRecommendation) => void;
  onManufacturerClick?: (manufacturer: string) => void;
}

export default function RecommendationsPanel({ recommendations, onSelect, onManufacturerClick }: RecommendationsPanelProps) {
  const sorted = [...recommendations].sort((a, b) => b.matchPercentage - a.matchPercentage);
  const obsoleteCount = sorted.filter(r => r.part.status === 'Obsolete').length;
  const activeCount = sorted.length - obsoleteCount;
  const [filtered, setFiltered] = useState(false);

  useEffect(() => {
    setFiltered(false);
    if (obsoleteCount === 0) return;
    const timer = setTimeout(() => setFiltered(true), 2000);
    return () => clearTimeout(timer);
  }, [obsoleteCount]);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
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
        <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Recommended Replacements
        </Typography>
        <Typography variant="h6" sx={{ fontSize: '0.95rem', lineHeight: 1.3 }} noWrap>
          {filtered && obsoleteCount > 0
            ? `${activeCount} active match${activeCount !== 1 ? 'es' : ''} · ${obsoleteCount} obsolete hidden`
            : `${recommendations.length} match${recommendations.length !== 1 ? 'es' : ''} found — click to compare`
          }
        </Typography>
      </Box>
      <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
        {sorted.map((rec) => {
          const isObsolete = rec.part.status === 'Obsolete';
          const shouldHide = filtered && isObsolete;
          return (
            <Box
              key={rec.part.mpn}
              sx={{
                maxHeight: shouldHide ? 0 : 300,
                opacity: shouldHide ? 0 : 1,
                overflow: 'hidden',
                mb: shouldHide ? 0 : 1.5,
                transition: 'opacity 0.3s ease, max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1) 0.15s, margin-bottom 0.4s cubic-bezier(0.4, 0, 0.2, 1) 0.15s',
              }}
            >
              <RecommendationCard
                recommendation={rec}
                onClick={() => onSelect(rec)}
                onManufacturerClick={onManufacturerClick}
              />
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
