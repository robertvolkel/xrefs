'use client';

import { useMemo } from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import { LineChart } from '@mui/x-charts/LineChart';
import { useTranslation } from 'react-i18next';
import type { AtlasGrowthSeriesPoint } from '@/app/api/admin/atlas/growth/route';

interface AtlasGrowthChartProps {
  series: AtlasGrowthSeriesPoint[];
}

export default function AtlasGrowthChart({ series }: AtlasGrowthChartProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  const { dates, mfrs, products, hasData } = useMemo(() => {
    if (series.length === 0) {
      return { dates: [], mfrs: [], products: [], hasData: false };
    }
    const dates = series.map((p) => new Date(p.date));
    const mfrs = series.map((p) => p.cumulativeMfrs);
    const products = series.map((p) => p.cumulativeProducts);
    return { dates, mfrs, products, hasData: true };
  }, [series]);

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
      <LineChart
        height={320}
        xAxis={[
          {
            data: dates,
            scaleType: 'time',
            valueFormatter: (d) => new Date(d).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }),
          },
        ]}
        yAxis={[
          {
            id: 'mfrs',
            position: 'left',
            label: t('admin.atlasGrowth.axisMfrs'),
          },
          {
            id: 'products',
            position: 'right',
            label: t('admin.atlasGrowth.axisProducts'),
          },
        ]}
        series={[
          {
            id: 'mfrs',
            data: mfrs,
            label: t('admin.atlasGrowth.axisMfrs'),
            yAxisId: 'mfrs',
            color: theme.palette.primary.main,
            curve: 'stepAfter',
            showMark: false,
          },
          {
            id: 'products',
            data: products,
            label: t('admin.atlasGrowth.axisProducts'),
            yAxisId: 'products',
            color: theme.palette.success.main,
            curve: 'stepAfter',
            showMark: false,
          },
        ]}
        margin={{ left: 60, right: 60, top: 20, bottom: 30 }}
        grid={{ horizontal: true }}
        sx={{
          '& .MuiChartsAxis-line': { stroke: theme.palette.divider },
          '& .MuiChartsAxis-tick': { stroke: theme.palette.divider },
          '& .MuiChartsAxis-tickLabel': { fill: theme.palette.text.secondary, fontSize: '0.7rem' },
          '& .MuiChartsAxis-label': { fill: theme.palette.text.secondary, fontSize: '0.72rem' },
          '& .MuiChartsGrid-line': { stroke: theme.palette.divider, strokeDasharray: '2 4' },
        }}
      />
    </Box>
  );
}
