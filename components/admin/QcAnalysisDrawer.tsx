'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Box,
  Drawer,
  Typography,
  Stack,
  Button,
  IconButton,
  ToggleButton,
  ToggleButtonGroup,
  Chip,
  CircularProgress,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import { analyzeQcLogs } from '@/lib/api';
import type { QcAnalysisEvent } from '@/lib/types';

interface QcAnalysisDrawerProps {
  open: boolean;
  onClose: () => void;
  filters: {
    requestSource?: string;
    hasFeedback?: boolean;
    search?: string;
  };
}

export default function QcAnalysisDrawer({ open, onClose, filters }: QcAnalysisDrawerProps) {
  const { t } = useTranslation();
  const [days, setDays] = useState<number>(30);
  const [loading, setLoading] = useState(false);
  const [progressMessages, setProgressMessages] = useState<string[]>([]);
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll during streaming
  useEffect(() => {
    if (loading && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [content, loading]);

  // Cleanup on unmount or close
  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
    }
  }, [open]);

  const handleRun = useCallback(async () => {
    setLoading(true);
    setContent('');
    setError(null);
    setProgressMessages([]);
    abortRef.current = new AbortController();

    try {
      const stream = await analyzeQcLogs({
        days: days === 0 ? undefined : days,
        requestSource: filters.requestSource,
        hasFeedback: filters.hasFeedback,
        search: filters.search,
      });

      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';

      while (true) {
        if (abortRef.current?.signal.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const segments = buffer.split('\n\n');
        buffer = segments.pop() ?? '';

        for (const segment of segments) {
          if (!segment.startsWith('data: ')) continue;
          try {
            const event: QcAnalysisEvent = JSON.parse(segment.slice(6));
            switch (event.type) {
              case 'progress':
                setProgressMessages(prev => [...prev, event.message]);
                break;
              case 'chunk':
                fullContent += event.content;
                setContent(fullContent);
                break;
              case 'complete':
                setContent(event.fullContent);
                break;
              case 'error':
                setError(event.message);
                break;
            }
          } catch {
            // Ignore malformed SSE events
          }
        }
      }
    } catch (err) {
      if (!abortRef.current?.signal.aborted) {
        setError(err instanceof Error ? err.message : t('adminQc.analysisError'));
      }
    } finally {
      setLoading(false);
    }
  }, [days, filters, t]);

  const activeFilters: string[] = [];
  if (filters.requestSource) activeFilters.push(filters.requestSource);
  if (filters.hasFeedback) activeFilters.push('Has Feedback');
  if (filters.search) activeFilters.push(`"${filters.search}"`);

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      sx={{
        '& .MuiDrawer-paper': {
          width: { xs: '100%', md: 'min(50vw, 600px)' },
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      {/* Header */}
      <Box sx={{ px: 3, py: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Stack direction="row" alignItems="center" spacing={1}>
            <AutoFixHighIcon sx={{ fontSize: '1.1rem', color: 'primary.main' }} />
            <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 600 }}>
              {t('adminQc.analysisTitle')}
            </Typography>
          </Stack>
          <IconButton size="small" onClick={onClose}>
            <CloseIcon sx={{ fontSize: '1.1rem' }} />
          </IconButton>
        </Stack>
      </Box>

      {/* Controls */}
      <Box sx={{ px: 3, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <Stack spacing={1.5}>
          {/* Time range */}
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem', minWidth: 70 }}>
              {t('adminQc.analysisTimeRange')}
            </Typography>
            <ToggleButtonGroup
              value={days}
              exclusive
              onChange={(_, v) => { if (v !== null) setDays(v); }}
              size="small"
              sx={{ '& .MuiToggleButton-root': { height: 26, fontSize: '0.7rem', textTransform: 'none', px: 1.5 } }}
            >
              <ToggleButton value={7}>{t('adminQc.analysisDays7')}</ToggleButton>
              <ToggleButton value={30}>{t('adminQc.analysisDays30')}</ToggleButton>
              <ToggleButton value={90}>{t('adminQc.analysisDays90')}</ToggleButton>
              <ToggleButton value={0}>{t('adminQc.analysisDaysAll')}</ToggleButton>
            </ToggleButtonGroup>
          </Stack>

          {/* Active filters */}
          {activeFilters.length > 0 && (
            <Stack direction="row" alignItems="center" spacing={0.5} flexWrap="wrap">
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                Filters:
              </Typography>
              {activeFilters.map((f) => (
                <Chip key={f} label={f} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
              ))}
            </Stack>
          )}

          {/* Run button */}
          <Button
            variant="contained"
            size="small"
            startIcon={loading ? <CircularProgress size={14} color="inherit" /> : <PlayArrowIcon />}
            onClick={handleRun}
            disabled={loading}
            sx={{ alignSelf: 'flex-start', height: 30, fontSize: '0.78rem', textTransform: 'none' }}
          >
            {loading ? t('adminQc.analysisRunning') : t('adminQc.analysisRun')}
          </Button>
        </Stack>
      </Box>

      {/* Content area */}
      <Box ref={contentRef} sx={{ flex: 1, overflowY: 'auto', px: 3, py: 2 }}>
        {/* Progress messages */}
        {progressMessages.length > 0 && (
          <Stack spacing={0.5} sx={{ mb: 2 }}>
            {progressMessages.map((msg, i) => (
              <Typography key={i} variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem' }}>
                {msg}
              </Typography>
            ))}
          </Stack>
        )}

        {/* Error */}
        {error && (
          <Typography color="error" sx={{ fontSize: '0.85rem' }}>
            {error}
          </Typography>
        )}

        {/* Streamed markdown content */}
        {content && (
          <Typography
            component="div"
            variant="body2"
            sx={{
              fontSize: '0.82rem',
              lineHeight: 1.6,
              '& h2': { fontSize: '0.95rem', fontWeight: 600, mt: 2.5, mb: 1 },
              '& h3': { fontSize: '0.88rem', fontWeight: 600, mt: 2, mb: 0.5 },
              '& p': { mb: 1 },
              '& ul, & ol': { pl: 2.5, mb: 1 },
              '& li': { mb: 0.5, fontSize: '0.82rem' },
              '& strong': { fontWeight: 600 },
              '& code': {
                fontFamily: 'monospace',
                fontSize: '0.78rem',
                bgcolor: 'action.hover',
                px: 0.5,
                py: 0.25,
                borderRadius: 0.5,
              },
              '& table': { borderCollapse: 'collapse', mb: 1, width: '100%' },
              '& th, & td': { border: 1, borderColor: 'divider', px: 1, py: 0.5, textAlign: 'left', fontSize: '0.78rem' },
              '& th': { fontWeight: 600, bgcolor: 'action.hover' },
            }}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </Typography>
        )}

        {/* Empty state */}
        {!loading && !content && !error && (
          <Box sx={{ mt: 3, px: 1 }}>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.82rem', mb: 2 }}>
              {t('adminQc.analysisEmpty')}
            </Typography>
            <Stack component="ul" spacing={1} sx={{ pl: 2.5, m: 0 }}>
              {(['ruleFailures', 'paramGaps', 'familyPatterns', 'scoreDistribution', 'dataSourceQuality'] as const).map((key) => (
                <Typography key={key} component="li" variant="body2" color="text.secondary" sx={{ fontSize: '0.78rem' }}>
                  {t(`adminQc.analysisExample_${key}`)}
                </Typography>
              ))}
            </Stack>
          </Box>
        )}

        {/* Loading indicator while streaming */}
        {loading && content && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
            <CircularProgress size={12} />
          </Box>
        )}
      </Box>
    </Drawer>
  );
}
