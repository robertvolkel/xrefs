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
import type { AtlasGrowthSeriesPoint } from '@/app/api/admin/atlas/growth/route';

interface AtlasGrowthChartProps {
  /** Daily cumulative series from /api/admin/atlas/growth. Right-edge
   *  cumulativeProducts == live enabled-MFR product count (KPI). */
  series: AtlasGrowthSeriesPoint[];
}

function formatK(v: number | null): string {
  if (v == null) return '';
  if (v >= 1000) {
    const k = v / 1000;
    return Number.isInteger(k) ? `${k}k` : `${k.toFixed(1)}k`;
  }
  return String(v);
}

/** ISO Monday-start week. Returns YYYY-MM-DD of the Monday for the week
 *  containing the given UTC date string. */
function weekStartKey(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const offsetToMon = (dow + 6) % 7; // 0=Mon, 1=Tue, ..., 6=Sun
  d.setUTCDate(d.getUTCDate() - offsetToMon);
  return d.toISOString().slice(0, 10);
}

function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function shortDate(ymd: string): string {
  return new Date(`${ymd}T00:00:00Z`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export default function AtlasGrowthChart({ series }: AtlasGrowthChartProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  const { bandKeys, tickLabelByKey, deltas, cumulative, hasData } = useMemo(() => {
    if (series.length === 0) {
      return {
        bandKeys: [] as string[],
        tickLabelByKey: {} as Record<string, string>,
        deltas: [] as number[],
        cumulative: [] as number[],
        hasData: false,
      };
    }

    // Take the LAST cumulative value seen for each ISO week — that's the
    // end-of-week running total. Series is daily so a week with three
    // ingest days contributes three points; the latest one wins.
    const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
    const cumulativeByWeek = new Map<string, number>();
    for (const point of sorted) {
      cumulativeByWeek.set(weekStartKey(point.date), point.cumulativeProducts);
    }

    // Fill empty weeks between the first and last observed week so the
    // X-axis reflects honest calendar spacing (zero-add weeks render as
    // flat line + zero bar instead of compressing time).
    const firstWeek = weekStartKey(sorted[0].date);
    const lastWeek = weekStartKey(sorted[sorted.length - 1].date);
    const allWeeks: string[] = [];
    let cursor = firstWeek;
    while (cursor <= lastWeek) {
      allWeeks.push(cursor);
      cursor = addDays(cursor, 7);
    }

    // Forward-fill cumulative across empty weeks (flat segment).
    let lastSeen = 0;
    const cumulativeOut: number[] = [];
    for (const w of allWeeks) {
      const v = cumulativeByWeek.get(w);
      if (v != null) lastSeen = v;
      cumulativeOut.push(lastSeen);
    }

    // Per-week delta = cumulative[i] − cumulative[i-1]; first week's delta
    // is its cumulative (everything that landed up to and including that
    // week, including the pre-pipeline bulk seed).
    const deltasOut: number[] = [];
    for (let i = 0; i < cumulativeOut.length; i++) {
      deltasOut.push(i === 0 ? cumulativeOut[i] : cumulativeOut[i] - cumulativeOut[i - 1]);
    }

    return {
      bandKeys: allWeeks,
      tickLabelByKey: Object.fromEntries(allWeeks.map((w) => [w, shortDate(w)])),
      deltas: deltasOut,
      cumulative: cumulativeOut,
      hasData: true,
    };
  }, [series]);

  // Progressive label degradation: too many weeks make the axis unreadable.
  // ~15 visible labels reads well at this card width.
  const { tickRotate, tickInterval } = useMemo(() => {
    const n = bandKeys.length;
    if (n <= 15) return { tickRotate: 0, tickInterval: undefined };
    if (n <= 30) return { tickRotate: -45, tickInterval: undefined };
    const step = Math.ceil(n / 15);
    return {
      tickRotate: -45,
      tickInterval: (_value: string, index: number) => index % step === 0,
    };
  }, [bandKeys]);

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
            id: 'weeks',
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
              axisId="weeks"
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
