'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Chip,
  Drawer,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CheckIcon from '@mui/icons-material/Check';
import RemoveIcon from '@mui/icons-material/Remove';
import { LogicType } from '@/lib/types';
import { typeColors, typeLabels } from './logicConstants';

interface CoverageAttribute {
  attributeId: string;
  attributeName: string;
  weight: number;
  logicType: LogicType;
  sortOrder: number;
  atlasProductCount: number;
  atlasProductPct: number;
  inAtlasDict: boolean;
  inDigikey: boolean;
  inPartsio: boolean;
}

interface CoverageData {
  manufacturer: string;
  familyId: string;
  familyName: string;
  totalProducts: number;
  attributes: CoverageAttribute[];
}

interface AtlasCoverageDrawerProps {
  open: boolean;
  onClose: () => void;
  manufacturer: string;
  familyId: string;
  familyName: string;
}

/** Row background tint based on coverage status */
function getRowBg(attr: CoverageAttribute): string | undefined {
  if (attr.atlasProductPct >= 80) return 'rgba(76, 175, 80, 0.06)';
  if (attr.atlasProductPct > 0) return 'rgba(255, 183, 77, 0.06)';
  if (!attr.inAtlasDict && !attr.inDigikey) return 'rgba(255, 82, 82, 0.06)';
  return undefined;
}

export default function AtlasCoverageDrawer({
  open,
  onClose,
  manufacturer,
  familyId,
  familyName,
}: AtlasCoverageDrawerProps) {
  const { t } = useTranslation();
  const [data, setData] = useState<CoverageData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(() => {
    if (!manufacturer || !familyId) return;
    setLoading(true);
    fetch(`/api/admin/atlas/coverage?manufacturer=${encodeURIComponent(manufacturer)}&familyId=${encodeURIComponent(familyId)}`)
      .then(r => r.json())
      .then(json => {
        if (json.success) setData(json.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [manufacturer, familyId]);

  useEffect(() => {
    if (open) fetchData();
  }, [open, fetchData]);

  const avgCoverage = data && data.attributes.length > 0
    ? Math.round(data.attributes.reduce((sum, a) => sum + a.atlasProductPct, 0) / data.attributes.length)
    : 0;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: 630, bgcolor: 'background.default' } }}
    >
      <Box sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
          <Typography variant="h6" sx={{ fontSize: '1rem' }}>
            {manufacturer} — {familyName} ({familyId})
          </Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Stack>

        {/* Summary */}
        {data && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('admin.coverageSummary', { products: data.totalProducts, coverage: avgCoverage, rules: data.attributes.length })}
          </Typography>
        )}

        {loading && !data && (
          <Typography variant="body2" color="text.secondary">{t('common.loading')}</Typography>
        )}

        {/* Gap matrix table */}
        {data && (
          <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
            <Table size="small" stickyHeader sx={{ '& td, & th': { borderColor: 'divider' } }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>{t('admin.coverageAttribute')}</TableCell>
                  <TableCell sx={{ fontWeight: 600, width: 36, textAlign: 'center' }}>{t('admin.coverageW')}</TableCell>
                  <TableCell sx={{ fontWeight: 600, width: 100 }}>{t('admin.coverageType')}</TableCell>
                  <TableCell sx={{ fontWeight: 600, width: 70, textAlign: 'right' }}>{t('admin.coverageAtlas')}</TableCell>
                  <TableCell sx={{ fontWeight: 600, width: 44, textAlign: 'center' }}>{t('admin.coverageDict')}</TableCell>
                  <TableCell sx={{ fontWeight: 600, width: 44, textAlign: 'center' }}>{t('admin.coverageDK')}</TableCell>
                  <TableCell sx={{ fontWeight: 600, width: 44, textAlign: 'center' }}>{t('admin.coveragePIO')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.attributes.map(attr => (
                  <TableRow key={attr.attributeId} sx={{ bgcolor: getRowBg(attr) }}>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontSize: '0.78rem' }}>
                        {attr.attributeName}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ textAlign: 'center' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.78rem' }}>
                        {attr.weight}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={typeLabels[attr.logicType] ?? attr.logicType}
                        size="small"
                        sx={{
                          height: 20,
                          fontSize: '0.65rem',
                          fontWeight: 600,
                          bgcolor: `${typeColors[attr.logicType] ?? '#999'}22`,
                          color: typeColors[attr.logicType] ?? '#999',
                        }}
                      />
                    </TableCell>
                    <TableCell sx={{ textAlign: 'right' }}>
                      {attr.atlasProductCount > 0 ? (
                        <Typography variant="caption" sx={{ fontWeight: 500 }}>
                          {attr.atlasProductPct}%
                          <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                            ({attr.atlasProductCount})
                          </Typography>
                        </Typography>
                      ) : (
                        <Typography variant="caption" sx={{ opacity: 0.3 }}>{'\u2014'}</Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ textAlign: 'center' }}>
                      {attr.inAtlasDict ? (
                        <CheckIcon sx={{ fontSize: 14, color: 'success.main' }} />
                      ) : (
                        <RemoveIcon sx={{ fontSize: 14, opacity: 0.2 }} />
                      )}
                    </TableCell>
                    <TableCell sx={{ textAlign: 'center' }}>
                      {attr.inDigikey ? (
                        <CheckIcon sx={{ fontSize: 14, color: 'info.main' }} />
                      ) : (
                        <RemoveIcon sx={{ fontSize: 14, opacity: 0.2 }} />
                      )}
                    </TableCell>
                    <TableCell sx={{ textAlign: 'center' }}>
                      {attr.inPartsio ? (
                        <CheckIcon sx={{ fontSize: 14, color: 'warning.main' }} />
                      ) : (
                        <RemoveIcon sx={{ fontSize: 14, opacity: 0.2 }} />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
    </Drawer>
  );
}
