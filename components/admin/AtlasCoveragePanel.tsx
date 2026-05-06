'use client';

import { useCallback, useEffect, useState } from 'react';
import { Box, Tabs, Tab, Skeleton, Alert } from '@mui/material';
import { useTranslation } from 'react-i18next';
import AtlasOverviewTab from './AtlasOverviewTab';
import AtlasActivityTab from './AtlasActivityTab';
import AtlasLatestUpdatesWidget from './AtlasLatestUpdatesWidget';
import type { AtlasResponse } from './atlasCoverage/types';
import type { AtlasGrowthResponse } from '@/app/api/admin/atlas/growth/route';

type TabValue = 'overview' | 'activity';

export default function AtlasCoveragePanel() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabValue>('overview');
  const [coverage, setCoverage] = useState<AtlasResponse | null>(null);
  const [growth, setGrowth] = useState<AtlasGrowthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [coverageRefreshing, setCoverageRefreshing] = useState(false);
  const [growthRefreshing, setGrowthRefreshing] = useState(false);

  const fetchCoverage = useCallback(async (forceRefresh: boolean): Promise<AtlasResponse | null> => {
    const url = `/api/admin/atlas${forceRefresh ? '?refresh=1' : ''}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Atlas HTTP ${res.status}`);
    return (await res.json()) as AtlasResponse;
  }, []);

  const fetchGrowth = useCallback(async (forceRefresh: boolean): Promise<AtlasGrowthResponse | null> => {
    const url = `/api/admin/atlas/growth?mode=full${forceRefresh ? '&refresh=1' : ''}`;
    const res = await fetch(url, { cache: 'no-store' });
    // Growth endpoint failure is non-fatal — Overview can still render.
    if (!res.ok) return null;
    return (await res.json()) as AtlasGrowthResponse;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cov, g] = await Promise.all([fetchCoverage(false), fetchGrowth(false)]);
        if (!cancelled) {
          setCoverage(cov);
          setGrowth(g);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchCoverage, fetchGrowth]);

  const handleRefreshCoverage = useCallback(async () => {
    setCoverageRefreshing(true);
    try {
      const cov = await fetchCoverage(true);
      if (cov) setCoverage(cov);
    } catch (e) {
      console.error('coverage refresh failed:', e);
    } finally {
      setCoverageRefreshing(false);
    }
  }, [fetchCoverage]);

  const handleRefreshGrowth = useCallback(async () => {
    setGrowthRefreshing(true);
    try {
      const g = await fetchGrowth(true);
      if (g) setGrowth(g);
    } catch (e) {
      console.error('growth refresh failed:', e);
    } finally {
      setGrowthRefreshing(false);
    }
  }, [fetchGrowth]);

  if (loading) {
    return <PanelSkeleton />;
  }

  if (error || !coverage) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error || 'No data'}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 3 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v as TabValue)}
          sx={{ minHeight: 40, '& .MuiTab-root': { minHeight: 40, textTransform: 'none', fontSize: '0.85rem' } }}
        >
          <Tab value="overview" label={t('admin.atlasGrowth.tabOverview')} />
          <Tab value="activity" label={t('admin.atlasGrowth.tabActivity')} />
        </Tabs>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {tab === 'overview' && (
          <AtlasOverviewTab
            data={coverage}
            cachedAt={coverage.cachedAt ?? null}
            onRefresh={handleRefreshCoverage}
            refreshing={coverageRefreshing}
            latestUpdatesSlot={
              growth ? (
                <AtlasLatestUpdatesWidget
                  events={growth.recentEvents}
                  onViewAll={() => setTab('activity')}
                />
              ) : null
            }
          />
        )}
        {tab === 'activity' && growth && (
          <AtlasActivityTab
            data={growth}
            cachedAt={growth.cachedAt ?? null}
            onRefresh={handleRefreshGrowth}
            refreshing={growthRefreshing}
          />
        )}
        {tab === 'activity' && !growth && (
          <Box sx={{ p: 3 }}>
            <Alert severity="warning">{t('admin.atlasGrowth.growthUnavailable')}</Alert>
          </Box>
        )}
      </Box>
    </Box>
  );
}

function PanelSkeleton() {
  return (
    <Box sx={{ px: 3, pt: '16px', pb: 6, maxWidth: 960, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Skeleton variant="rounded" width={120} height={32} />
        <Skeleton variant="rounded" width={120} height={32} />
      </Box>
      <Skeleton variant="rounded" width="100%" height={120} sx={{ mb: 3 }} />
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2, mb: 3 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} variant="rounded" height={88} />
        ))}
      </Box>
      <Skeleton variant="rounded" width="100%" height={300} />
    </Box>
  );
}
