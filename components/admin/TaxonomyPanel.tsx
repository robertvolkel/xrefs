'use client';

import { useEffect, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { useTranslation } from 'react-i18next';
import type {
  TaxonomyResponse,
  TaxonomyCategory,
  TaxonomySubcategory,
  FamilyCoverageInfo,
} from '@/lib/types';

function CoverageChip({ covered }: { covered: boolean }) {
  const { t } = useTranslation();
  return (
    <Chip
      label={covered ? t('admin.covered') : t('admin.notCovered')}
      size="small"
      sx={{
        bgcolor: covered ? '#81C78422' : '#90A4AE18',
        color: covered ? '#81C784' : '#90A4AE',
        fontWeight: 500,
        fontSize: '0.7rem',
        height: 22,
      }}
    />
  );
}

function FamilyInfoCard({ family }: { family: FamilyCoverageInfo }) {
  const { t } = useTranslation();
  return (
    <Card variant="outlined" sx={{ bgcolor: 'background.default', mb: 1 }}>
      <CardContent sx={{ py: 1.25, px: 2, '&:last-child': { pb: 1.25 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
          <CheckCircleOutlineIcon sx={{ fontSize: 16, color: '#81C784' }} />
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {family.familyName}
          </Typography>
          <Chip
            label={`ID: ${family.familyId}`}
            size="small"
            sx={{ height: 20, fontSize: '0.68rem', bgcolor: 'action.hover' }}
          />
          <Chip
            label={family.category}
            size="small"
            sx={{ height: 20, fontSize: '0.68rem', bgcolor: 'action.hover' }}
          />
        </Box>

        <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <InfoStat label={t('admin.ruleCount', { count: family.ruleCount })} />
          <InfoStat label={`${t('admin.totalWeight')}: ${family.totalWeight}`} />
          <InfoStat label={`${t('admin.matchableWeight')}: ${family.matchableWeight}`} />
          <InfoStat label={`${t('admin.lastUpdated')}: ${family.lastUpdated}`} />
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1 }}>
          <Typography variant="caption" color="text.secondary">
            {t('admin.paramCoverage')}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={family.paramCoverage}
            sx={{
              flex: 1,
              maxWidth: 160,
              height: 6,
              borderRadius: 3,
              bgcolor: 'action.hover',
              '& .MuiLinearProgress-bar': {
                borderRadius: 3,
                bgcolor: family.paramCoverage >= 70 ? '#81C784' : family.paramCoverage >= 40 ? '#FFB74D' : '#FF5252',
              },
            }}
          />
          <Typography variant="caption" sx={{ fontFamily: 'monospace', minWidth: 32 }}>
            {family.paramCoverage}%
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}

function InfoStat({ label }: { label: string }) {
  return (
    <Typography variant="caption" color="text.secondary">
      {label}
    </Typography>
  );
}

function SubcategoryRow({ sub }: { sub: TaxonomySubcategory }) {
  return (
    <Box sx={{ py: 0.75, borderBottom: 1, borderColor: 'divider', '&:last-child': { borderBottom: 0 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: sub.covered ? 1 : 0 }}>
        <CoverageChip covered={sub.covered} />
        <Typography
          variant="body2"
          sx={{ opacity: sub.covered ? 1 : 0.5, fontWeight: sub.covered ? 500 : 400 }}
        >
          {sub.name}
        </Typography>
        {sub.productCount > 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
            {sub.productCount.toLocaleString()} products
          </Typography>
        )}
      </Box>
      {sub.families.map((f) => (
        <Box key={f.familyId} sx={{ pl: 2 }}>
          <FamilyInfoCard family={f} />
        </Box>
      ))}
    </Box>
  );
}

function CategoryAccordion({ cat }: { cat: TaxonomyCategory }) {
  const { t } = useTranslation();
  const hasCoverage = cat.coveredCount > 0;

  return (
    <Accordion
      defaultExpanded={false}
      disableGutters
      sx={{
        bgcolor: 'transparent',
        '&::before': { display: 'none' },
        border: 1,
        borderColor: 'divider',
        borderRadius: '8px !important',
        mb: 1,
        overflow: 'hidden',
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        sx={{ px: 2, minHeight: 48, '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1.5 } }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600, opacity: hasCoverage ? 1 : 0.6 }}>
          {cat.name}
        </Typography>
        {cat.subcategories.length > 0 && (
          <Chip
            label={t('admin.subcategoriesCovered', { count: cat.coveredCount, total: cat.subcategories.length })}
            size="small"
            sx={{
              height: 22,
              fontSize: '0.68rem',
              bgcolor: hasCoverage ? '#81C78422' : '#90A4AE18',
              color: hasCoverage ? '#81C784' : '#90A4AE',
            }}
          />
        )}
        {cat.productCount > 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto', mr: 1 }}>
            {cat.coveredProductCount > 0
              ? `${cat.coveredProductCount.toLocaleString()} of ${cat.productCount.toLocaleString()} products`
              : `${cat.productCount.toLocaleString()} products`}
          </Typography>
        )}
      </AccordionSummary>
      <AccordionDetails sx={{ px: 2, pt: 0, pb: 1.5 }}>
        {cat.subcategories.map((sub) => (
          <SubcategoryRow key={sub.categoryId} sub={sub} />
        ))}
      </AccordionDetails>
    </Accordion>
  );
}

export default function TaxonomyPanel() {
  const { t } = useTranslation();
  const [data, setData] = useState<TaxonomyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/taxonomy')
      .then((r) => {
        if (!r.ok) return r.json().then(d => { throw new Error(d.error || `HTTP ${r.status}`); });
        return r.json();
      })
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <Box>
        <Typography variant="h6" sx={{ mb: 0.5 }}>
          {t('admin.taxonomy')}
        </Typography>
        <Typography variant="body2" color="error">
          {t('admin.fetchError')}: {error}
        </Typography>
      </Box>
    );
  }

  if (!data) {
    return (
      <Box>
        <Typography variant="h6" sx={{ mb: 0.5 }}>
          {t('admin.taxonomy')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t('common.loading')}
        </Typography>
      </Box>
    );
  }

  const { summary, categories } = data;

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 0.5 }}>
        {t('admin.taxonomy')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {t('admin.taxonomyDescription')}
      </Typography>

      {/* Summary card */}
      <Card variant="outlined" sx={{ bgcolor: 'background.default', mb: 3, maxWidth: 560 }}>
        <CardContent sx={{ '&:last-child': { pb: 2 } }}>
          <Typography variant="subtitle2">
            {t('admin.coverageSummary', {
              covered: summary.coveredSubcategories,
              total: summary.totalSubcategories,
              percentage: summary.coveragePercentage,
            })}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {t('admin.productCoverageSummary', {
              covered: summary.coveredProducts.toLocaleString(),
              total: summary.totalProducts.toLocaleString(),
              percentage: summary.productCoveragePercentage,
            })}
          </Typography>
        </CardContent>
      </Card>

      {/* Category accordions */}
      <Box sx={{ maxWidth: 800 }}>
        {categories.map((cat) => (
          <CategoryAccordion key={cat.categoryId} cat={cat} />
        ))}
      </Box>
    </Box>
  );
}
