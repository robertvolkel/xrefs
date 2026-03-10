'use client';

import { useEffect, useState, Fragment } from 'react';
import {
  Box,
  Collapse,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
  Chip,
} from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import { useTranslation } from 'react-i18next';
import AtlasCoverageDrawer from './AtlasCoverageDrawer';

interface AtlasStats {
  summary: {
    totalProducts: number;
    totalManufacturers: number;
    scorableProducts: number;
    searchOnlyProducts: number;
    familiesCovered: number;
    lastUpdated: string | null;
  };
  manufacturers: {
    manufacturer: string;
    productCount: number;
    scorableCount: number;
    families: string[];
    categories: string[];
    lastUpdated: string;
    coveragePct: number;
  }[];
  familyBreakdown: {
    manufacturer: string;
    familyId: string;
    category: string;
    subcategory: string;
    count: number;
    coveragePct: number;
  }[];
  familyNames: Record<string, string>;
}

function MfrRow({
  row,
  breakdown,
  familyNames,
  onFamilyClick,
}: {
  row: AtlasStats['manufacturers'][number];
  breakdown: AtlasStats['familyBreakdown'];
  familyNames: Record<string, string>;
  onFamilyClick: (manufacturer: string, familyId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const mfrBreakdown = breakdown.filter((b) => b.manufacturer === row.manufacturer);

  return (
    <Fragment>
      <TableRow
        hover
        onClick={() => mfrBreakdown.length > 0 && setOpen(!open)}
        sx={{ cursor: mfrBreakdown.length > 0 ? 'pointer' : 'default', '& > td': { borderBottom: open ? 0 : undefined } }}
      >
        <TableCell sx={{ width: 40, p: 0, pl: 1 }}>
          {mfrBreakdown.length > 0 && (
            <IconButton size="small" onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>
              {open ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
            </IconButton>
          )}
        </TableCell>
        <TableCell>
          <Typography variant="body2" fontWeight={500}>
            {row.manufacturer}
          </Typography>
        </TableCell>
        <TableCell align="right">
          <Typography variant="body2">{row.productCount.toLocaleString()}</Typography>
        </TableCell>
        <TableCell align="right">
          <Typography variant="body2">{row.scorableCount.toLocaleString()}</Typography>
        </TableCell>
        <TableCell align="right">
          <Typography variant="body2" sx={{ opacity: row.coveragePct > 0 ? 1 : 0.3 }}>
            {row.coveragePct > 0 ? `${row.coveragePct}%` : '\u2014'}
          </Typography>
        </TableCell>
        <TableCell>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {row.families.map((f) => (
              <Tooltip key={f} title={familyNames[f] || f} arrow>
                <Chip label={f} size="small" sx={{ height: 22, fontSize: '0.72rem' }} />
              </Tooltip>
            ))}
          </Box>
        </TableCell>
        <TableCell>
          <Typography variant="caption" color="text.secondary">
            {new Date(row.lastUpdated).toLocaleDateString()}
          </Typography>
        </TableCell>
      </TableRow>

      {/* Expanded family breakdown */}
      {mfrBreakdown.length > 0 && (
        <TableRow>
          <TableCell colSpan={7} sx={{ py: 0, px: 0 }}>
            <Collapse in={open} timeout="auto" unmountOnExit>
              <Box sx={{ mx: 4, my: 1.5 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell><Typography variant="caption" fontWeight={600}>Family</Typography></TableCell>
                      <TableCell><Typography variant="caption" fontWeight={600}>Category</Typography></TableCell>
                      <TableCell><Typography variant="caption" fontWeight={600}>Subcategory</Typography></TableCell>
                      <TableCell align="right"><Typography variant="caption" fontWeight={600}>Products</Typography></TableCell>
                      <TableCell align="right"><Typography variant="caption" fontWeight={600}>Coverage</Typography></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {mfrBreakdown.map((fb) => (
                      <TableRow
                        key={fb.familyId}
                        hover
                        onClick={() => onFamilyClick(fb.manufacturer, fb.familyId)}
                        sx={{ cursor: 'pointer' }}
                      >
                        <TableCell>
                          <Tooltip title={familyNames[fb.familyId] || fb.familyId} arrow>
                            <Chip label={fb.familyId} size="small" sx={{ height: 22, fontSize: '0.72rem' }} />
                          </Tooltip>
                        </TableCell>
                        <TableCell><Typography variant="caption">{fb.category}</Typography></TableCell>
                        <TableCell><Typography variant="caption">{fb.subcategory}</Typography></TableCell>
                        <TableCell align="right"><Typography variant="caption">{fb.count}</Typography></TableCell>
                        <TableCell align="right">
                          <Typography variant="caption" sx={{ opacity: fb.coveragePct > 0 ? 1 : 0.3 }}>
                            {fb.coveragePct > 0 ? `${fb.coveragePct}%` : '\u2014'}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            </Collapse>
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  );
}

export default function AtlasPanel() {
  const { t } = useTranslation();
  const [data, setData] = useState<AtlasStats | null>(null);

  // Coverage drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedMfr, setSelectedMfr] = useState('');
  const [selectedFamilyId, setSelectedFamilyId] = useState('');

  const handleFamilyClick = (manufacturer: string, familyId: string) => {
    setSelectedMfr(manufacturer);
    setSelectedFamilyId(familyId);
    setDrawerOpen(true);
  };

  useEffect(() => {
    fetch('/api/admin/atlas')
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

  const { summary } = data;

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 0.5 }}>
        {t('admin.atlas', 'Atlas Manufacturers')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
        {t('admin.atlasDesc', 'Chinese manufacturer product catalog.')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {summary.totalManufacturers} manufacturer{summary.totalManufacturers !== 1 ? 's' : ''}
        {' \u00B7 '}
        {summary.totalProducts.toLocaleString()} products
        {' \u00B7 '}
        {summary.scorableProducts.toLocaleString()} scorable
        {' \u00B7 '}
        {summary.familiesCovered} families
      </Typography>

      {data.manufacturers.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No Atlas manufacturers have been ingested yet.
        </Typography>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 40 }} />
                <TableCell>Manufacturer</TableCell>
                <TableCell align="right">Products</TableCell>
                <TableCell align="right">Scorable</TableCell>
                <TableCell align="right">Coverage</TableCell>
                <TableCell>Families</TableCell>
                <TableCell>Last Updated</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.manufacturers.map((mfr) => (
                <MfrRow key={mfr.manufacturer} row={mfr} breakdown={data.familyBreakdown} familyNames={data.familyNames} onFamilyClick={handleFamilyClick} />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Coverage gap analysis drawer */}
      <AtlasCoverageDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        manufacturer={selectedMfr}
        familyId={selectedFamilyId}
        familyName={data?.familyNames[selectedFamilyId] ?? selectedFamilyId}
      />
    </Box>
  );
}
