'use client';

import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Chip, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';

interface DataSourcesInfo {
  digikey: { configured: boolean; clientIdPrefix: string; baseUrl: string };
  anthropic: { configured: boolean; model: string };
  supabase: { configured: boolean; url: string | null };
  supportedFamilies: number;
  paramMapsConfigured: number;
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
        External services and data providers powering the cross-reference engine.
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 560 }}>
        <SourceCard title="Digikey Product Information API">
          <InfoRow label="Status" value={<StatusChip configured={data.digikey.configured} />} />
          <InfoRow label="Client ID" value={data.digikey.clientIdPrefix || '\u2014'} />
          <InfoRow label="Base URL" value={data.digikey.baseUrl} />
          <InfoRow label="Auth" value="OAuth2 Client Credentials" />
          <InfoRow label="Cache TTL" value="30 minutes" />
        </SourceCard>

        <SourceCard title="Anthropic Claude API">
          <InfoRow label="Status" value={<StatusChip configured={data.anthropic.configured} />} />
          <InfoRow label="Model" value={data.anthropic.model} />
          <InfoRow label="Usage" value="LLM Orchestrator (tool calling)" />
        </SourceCard>

        <SourceCard title="Supabase">
          <InfoRow label="Status" value={<StatusChip configured={data.supabase.configured} />} />
          <InfoRow label="URL" value={data.supabase.url ?? '\u2014'} />
          <InfoRow label="Usage" value="Auth, profiles, conversations" />
        </SourceCard>

        <SourceCard title="Coverage">
          <InfoRow label={t('admin.supportedFamilies')} value={String(data.supportedFamilies)} />
          <InfoRow label={t('admin.paramMapsConfigured')} value={String(data.paramMapsConfigured)} />
          <InfoRow label="Fallback" value="Mock data (9 parts)" />
        </SourceCard>
      </Box>
    </Box>
  );
}
