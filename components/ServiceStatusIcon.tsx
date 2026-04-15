'use client';

import { useState } from 'react';
import { Box, Badge, IconButton, Popover, Typography, Button, Tooltip, CircularProgress } from '@mui/material';
import DnsOutlinedIcon from '@mui/icons-material/DnsOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useServiceStatus } from '@/contexts/ServiceStatusContext';
import type { ServiceName, ServiceStatusLevel } from '@/lib/types';

const DISPLAY_NAMES: Record<ServiceName, string> = {
  digikey: 'Digikey',
  partsio: 'Parts.io',
  anthropic: 'Claude AI',
  mouser: 'Mouser',
  findchips: 'FindChips',
  atlas: 'Atlas',
};

const STATUS_LABELS: Record<ServiceStatusLevel, string> = {
  operational: 'Operational',
  degraded: 'Degraded',
  unavailable: 'Unavailable',
  unknown: 'Checking...',
};

function statusColor(status: ServiceStatusLevel): string {
  switch (status) {
    case 'operational': return 'success.main';
    case 'degraded': return 'warning.main';
    case 'unavailable': return 'error.main';
    case 'unknown': return 'text.disabled';
  }
}

function badgeColor(status: ServiceStatusLevel): 'success' | 'warning' | 'error' | 'default' {
  switch (status) {
    case 'operational': return 'success';
    case 'degraded': return 'warning';
    case 'unavailable': return 'error';
    case 'unknown': return 'default';
  }
}

function aggregateTooltip(status: ServiceStatusLevel, services: { status: ServiceStatusLevel }[]): string {
  if (status === 'unknown') return 'Checking services...';
  if (status === 'operational') return 'All systems operational';
  const degradedCount = services.filter((s) => s.status === 'degraded').length;
  const unavailableCount = services.filter((s) => s.status === 'unavailable').length;
  const parts: string[] = [];
  if (unavailableCount > 0) parts.push(`${unavailableCount} unavailable`);
  if (degradedCount > 0) parts.push(`${degradedCount} degraded`);
  return parts.join(', ');
}

function formatTimeAgo(iso?: string): string {
  if (!iso) return '—';
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 5000) return 'just now';
  if (diffMs < 60_000) return `${Math.floor(diffMs / 1000)}s ago`;
  if (diffMs < 3600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  return `${Math.floor(diffMs / 3600_000)}h ago`;
}

export default function ServiceStatusIcon() {
  const { services, aggregateStatus, checking, refresh } = useServiceStatus();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  return (
    <>
      <Tooltip title={aggregateTooltip(aggregateStatus, services)} placement="right">
        <IconButton
          size="small"
          onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={{
            color: 'text.secondary',
            '&:hover': { color: 'text.primary' },
          }}
        >
          <Badge
            variant="dot"
            color={badgeColor(aggregateStatus)}
            overlap="circular"
            sx={{
              '& .MuiBadge-badge': {
                width: 8,
                height: 8,
                minWidth: 8,
                borderRadius: '50%',
              },
            }}
          >
            <DnsOutlinedIcon fontSize="small" />
          </Badge>
        </IconButton>
      </Tooltip>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'center', horizontal: 'right' }}
        transformOrigin={{ vertical: 'center', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              ml: 1,
              p: 2,
              minWidth: 300,
              bgcolor: 'background.paper',
            },
          },
        }}
      >
        <Typography variant="subtitle2" sx={{ mb: 1.5, fontSize: '0.8rem', color: 'text.secondary' }}>
          Data Source Status
        </Typography>

        {services.map((info) => (
          <Box
            key={info.service}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              py: 0.75,
              '&:not(:last-child)': { borderBottom: 1, borderColor: 'divider' },
            }}
          >
            {/* Status dot */}
            <Box
              sx={{
                width: 8,
                height: 8,
                minWidth: 8,
                borderRadius: '50%',
                bgcolor: statusColor(info.status),
              }}
            />

            {/* Service name */}
            <Typography variant="body2" sx={{ fontSize: '0.78rem', flex: 1 }}>
              {DISPLAY_NAMES[info.service]}
            </Typography>

            {/* Status label + optional message */}
            <Box sx={{ textAlign: 'right' }}>
              <Typography variant="body2" sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>
                {STATUS_LABELS[info.status]}
              </Typography>
              {info.message && info.status !== 'operational' && (
                <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.disabled', display: 'block' }}>
                  {info.message}
                </Typography>
              )}
              {info.message && info.status === 'operational' && (
                <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.disabled', display: 'block' }}>
                  {info.message}
                </Typography>
              )}
            </Box>

            {/* Last checked */}
            <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.disabled', minWidth: 48, textAlign: 'right' }}>
              {formatTimeAgo(info.lastChecked)}
            </Typography>
          </Box>
        ))}

        {/* Refresh button */}
        <Box sx={{ mt: 1.5, display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            size="small"
            startIcon={checking ? <CircularProgress size={12} /> : <RefreshIcon sx={{ fontSize: 14 }} />}
            onClick={refresh}
            disabled={checking}
            sx={{ fontSize: '0.72rem', textTransform: 'none' }}
          >
            Refresh
          </Button>
        </Box>
      </Popover>
    </>
  );
}
