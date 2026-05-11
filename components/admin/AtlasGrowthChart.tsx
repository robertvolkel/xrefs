'use client';

import { useMemo } from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import { ChartsDataProvider } from '@mui/x-charts/ChartsDataProvider';
import { ChartsWrapper } from '@mui/x-charts/ChartsWrapper';
import { ChartsSurface } from '@mui/x-charts/ChartsSurface';
import { BarPlot } from '@mui/x-charts/BarChart';
import { LinePlot, MarkPlot } from '@mui/x-charts/LineChart';
import { ChartsXAxis } from '@mui/x-charts/ChartsXAxis';
import { ChartsYAxis } from '@mui/x-charts/ChartsYAxis';
import { ChartsTooltip } from '@mui/x-charts/ChartsTooltip';
import { ChartsLegend } from '@mui/x-charts/ChartsLegend';
import { useTranslation } from 'react-i18next';
import type { AtlasGrowthEvent } from '@/app/api/admin/atlas/growth/route';

interface AtlasGrowthChartProps {
  events: AtlasGrowthEvent[];
}

function formatK(v: number | null): string {
  if (v == null) return '';
  if (v >= 1000) {
    const k = v / 1000;
    return Number.isInteger(k) ? `${k}k` : `${k.toFixed(1)}k`;
  }
  return String(v);
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function AtlasGrowthChart({ events }: AtlasGrowthChartProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  const { bandKeys, tickLabelByKey, deltas, cumulative, hasData } = useMemo(() => {
    // Filter to events that actually added products. attributes_enriched and
    // re_ingested events have meaningful work but no product delta — they're
    // visible in the Latest Updates widget below the chart, so leaving them
    // out here keeps the bar chart focused on dataset growth.
    const filtered = events
      .filter((e) => e.partsInserted > 0)
      .slice()
      .sort((a, b) => a.appliedAt.localeCompare(b.appliedAt));

    if (filtered.length === 0) {
      return {
        bandKeys: [] as string[],
        tickLabelByKey: {} as Record<string, string>,
        deltas: [] as number[],
        cumulative: [] as number[],
        hasData: false,
      };
    }

    // Each batch gets its own band slot. Reusing the date string would cause
    // same-day batches to collapse into one slot (bars overlap, cumulative
    // line points stack vertically). Per-batch index keeps every bar visible.
    const bandKeys = filtered.map((_, i) => String(i));
    // Show the date label only when the day changes vs the previous batch.
    // Same-day batches in a row render with a blank label so the axis doesn't
    // repeat "May 8, May 8, May 8".
    const tickLabelByKey: Record<string, string> = {};
    let prevDay = '';
    filtered.forEach((e, i) => {
      const day = e.appliedAt.slice(0, 10);
      tickLabelByKey[String(i)] = day === prevDay ? '' : shortDate(e.appliedAt);
      prevDay = day;
    });

    const deltas = filtered.map((e) => e.partsInserted);
    const cumulative: number[] = [];
    let running = 0;
    for (const d of deltas) {
      running += d;
      cumulative.push(running);
    }
    return { bandKeys, tickLabelByKey, deltas, cumulative, hasData: true };
  }, [events]);

  // Progressive label degradation: at higher batch counts, rotate labels
  // and skip every Nth so they don't overlap. ~15 visible labels reads well
  // at this card width regardless of total batches. Label-count uses unique
  // day labels (not bar count) so heavy same-day batching doesn't trigger
  // unnecessary rotation.
  const { tickRotate, tickInterval } = useMemo(() => {
    const n = Object.values(tickLabelByKey).filter((s) => s !== '').length;
    if (n <= 15) return { tickRotate: 0, tickInterval: undefined };
    if (n <= 30) return { tickRotate: -45, tickInterval: undefined };
    const step = Math.ceil(n / 15);
    return {
      tickRotate: -45,
      tickInterval: (_value: string, index: number) => index % step === 0,
    };
  }, [tickLabelByKey]);

  if (!hasData) {
    return (
      <Box
        sx={{
          p: 3,
          border: 1,
          borderColor: 'divider',
          borderRadius: 2,
          bgcolor: 'background.paper',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 320,
        }}
      >
        <Typography variant="body2" color="text.secondary">
          {t('admin.atlasGrowth.emptyChart')}
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        p: 2,
        border: 1,
        borderColor: 'divider',
        borderRadius: 2,
        bgcolor: 'background.paper',
      }}
    >
      <Typography variant="body1" fontWeight={600} sx={{ mb: 0.5 }}>
        {t('admin.atlasGrowth.chartTitle')}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
        {t('admin.atlasGrowth.chartSubtitle')}
      </Typography>
      <ChartsDataProvider
        series={[
          {
            type: 'bar',
            data: deltas,
            label: t('admin.atlasGrowth.legendDelta'),
            color: theme.palette.primary.light,
          },
          {
            type: 'line',
            data: cumulative,
            label: t('admin.atlasGrowth.legendCumulative'),
            color: theme.palette.success.main,
            showMark: true,
            curve: 'linear',
          },
        ]}
        xAxis={[
          {
            scaleType: 'band',
            data: bandKeys,
            id: 'batches',
            valueFormatter: (key: string) => tickLabelByKey[key] ?? '',
          },
        ]}
        yAxis={[{ valueFormatter: formatK, id: 'count' }]}
        height={360}
      >
        <ChartsWrapper legendPosition={{ horizontal: 'start', vertical: 'top' }}>
          <ChartsLegend />
          <ChartsSurface
            sx={{
              '& .MuiChartsAxis-line': { stroke: theme.palette.divider },
              '& .MuiChartsAxis-tick': { stroke: theme.palette.divider },
              '& .MuiChartsAxis-tickLabel': {
                fill: theme.palette.text.secondary,
                fontSize: '0.7rem',
              },
              '& .MuiChartsAxis-label': {
                fill: theme.palette.text.secondary,
                fontSize: '0.72rem',
              },
            }}
          >
            <BarPlot />
            <LinePlot />
            <MarkPlot />
            <ChartsXAxis
              axisId="batches"
              tickLabelStyle={
                tickRotate
                  ? { transform: `rotate(${tickRotate}deg)`, textAnchor: 'end' }
                  : undefined
              }
              tickInterval={tickInterval}
            />
            <ChartsYAxis axisId="count" />
          </ChartsSurface>
          <ChartsTooltip />
        </ChartsWrapper>
      </ChartsDataProvider>
    </Box>
  );
}
