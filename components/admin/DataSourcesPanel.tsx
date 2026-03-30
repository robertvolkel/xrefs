'use client';

import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Chip, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';

interface DataSourcesInfo {
  digikey: { configured: boolean; clientIdPrefix: string; baseUrl: string };
  anthropic: { configured: boolean; model: string };
  partsio: { configured: boolean; baseUrl: string };
  mouser: { configured: boolean; dailyCallsRemaining: number; baseUrl: string };
}

function StatusChip({ configured }: { configured: boolean }) {
  const { t } = useTranslation();
  return (
    <Chip
      label={configured ? t('admin.configured') : t('admin.notConfigured')}
      size="small"
      sx={{
        bgcolor: configured ? '#81C78422' : '#FF525222',
        color: configured ? '#81C784' : '#FF5252',
        fontWeight: 500,
        fontSize: '0.72rem',
        height: 24,
      }}
    />
  );
}

function SourceCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card variant="outlined" sx={{ bgcolor: 'background.default' }}>
      <CardContent sx={{ '&:last-child': { pb: 2 } }}>
        <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
          {title}
        </Typography>
        {children}
      </CardContent>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      {typeof value === 'string' ? (
        <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
          {value}
        </Typography>
      ) : (
        value
      )}
    </Box>
  );
}

export default function DataSourcesPanel() {
  const { t } = useTranslation();
  const [data, setData] = useState<DataSourcesInfo | null>(null);

  useEffect(() => {
    fetch('/api/admin/data-sources')
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data) {
    return (
      <Typography variant="body2" color="text.secondary">
        {t('common.loading')}
      </Typography>
    );
  }

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 0.5 }}>
        {t('admin.dataSources')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {t('admin.dataSourcesDesc', 'External services and data providers powering the cross-reference engine.')}
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2 }}>
        <SourceCard title={t('admin.dsDigikey', 'Digikey Product Information API')}>
          <InfoRow label={t('admin.dsStatus', 'Status')} value={<StatusChip configured={data.digikey.configured} />} />
          <InfoRow label={t('admin.dsClientId', 'Client ID')} value={data.digikey.clientIdPrefix || '\u2014'} />
          <InfoRow label={t('admin.dsBaseUrl', 'Base URL')} value={data.digikey.baseUrl} />
          <InfoRow label={t('admin.dsAuth', 'Auth')} value={t('admin.dsAuthMethod', 'OAuth2 Client Credentials')} />
          <InfoRow label={t('admin.dsCacheTtl', 'Cache TTL')} value={t('admin.dsCacheTtlValue', '30 minutes')} />
        </SourceCard>

        <SourceCard title={t('admin.dsAnthropic', 'Anthropic Claude API')}>
          <InfoRow label={t('admin.dsStatus', 'Status')} value={<StatusChip configured={data.anthropic.configured} />} />
          <InfoRow label={t('admin.dsModel', 'Model')} value={data.anthropic.model} />
          <InfoRow label={t('admin.dsUsage', 'Usage')} value={t('admin.dsLlmUsage', 'LLM Orchestrator (tool calling)')} />
        </SourceCard>

        <SourceCard title={t('admin.dsPartsio', 'Parts.io (Accuris)')}>
          <InfoRow label={t('admin.dsStatus', 'Status')} value={<StatusChip configured={data.partsio.configured} />} />
          <InfoRow label={t('admin.dsBaseUrl', 'Base URL')} value={data.partsio.baseUrl} />
          <InfoRow label={t('admin.dsUsage', 'Usage')} value={t('admin.dsPartsioUsage', 'Parametric gap-fill enrichment')} />
        </SourceCard>

        <SourceCard title={t('admin.dsMouser', 'Mouser')}>
          <InfoRow label={t('admin.dsStatus', 'Status')} value={<StatusChip configured={data.mouser.configured} />} />
          <InfoRow label={t('admin.dsBaseUrl', 'Base URL')} value={data.mouser.baseUrl} />
          <InfoRow label={t('admin.dsDailyRemaining', 'Daily Calls Remaining')} value={String(data.mouser.dailyCallsRemaining)} />
          <InfoRow label={t('admin.dsUsage', 'Usage')} value={t('admin.dsMouserUsage', 'Pricing, stock, lifecycle, compliance')} />
        </SourceCard>
      </Box>
    </Box>
  );
}
