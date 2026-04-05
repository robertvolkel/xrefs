'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Button,
  Chip,
  IconButton,
  Switch,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  InputAdornment,
  Pagination,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import LaunchIcon from '@mui/icons-material/Launch';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import FlagIcon from '@mui/icons-material/Flag';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import { useTranslation } from 'react-i18next';
import AtlasCoverageDrawer from './AtlasCoverageDrawer';
import AtlasExplorerDrawer from './AtlasExplorerDrawer';
import FlaggedProductsTab from './FlaggedProductsTab';
import CrossReferencesTab from './CrossReferencesTab';
import { createAtlasFlag, getAtlasFlags, getMfrCrossRefs } from '@/lib/api';
import type { AtlasManufacturer } from '@/lib/types';

interface MfrDetailData {
  manufacturer: AtlasManufacturer;
  stats: {
    totalProducts: number;
    scorableProducts: number;
    coveragePct: number;
  };
  familyBreakdown: {
    familyId: string | null;
    category: string;
    subcategory: string;
    count: number;
    scorableCount: number;
    coveragePct: number;
  }[];
  familyNames: Record<string, string>;
}

interface ProductRow {
  id: string;
  mpn: string;
  description: string | null;
  familyId: string | null;
  category: string;
  subcategory: string;
  status: string;
  package: string | null;
  coveragePct: number;
}

interface ProductsResponse {
  products: ProductRow[];
  total: number;
  page: number;
  totalPages: number;
}

export default function ManufacturerDetailPage({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [data, setData] = useState<MfrDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(0); // 0=Products, 1=Flagged, 2=Coverage, 3=Cross-Refs, 4=Profile

  // Products tab state
  const [products, setProducts] = useState<ProductsResponse | null>(null);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [productPage, setProductPage] = useState(1);
  const [productFamily, setProductFamily] = useState<string | null>(null);

  // Explorer drawer state (for product detail)
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  // Coverage drawer state
  const [coverageOpen, setCoverageOpen] = useState(false);
  const [selectedFamilyId, setSelectedFamilyId] = useState('');

  // Flag dialog state
  const [flagDialogOpen, setFlagDialogOpen] = useState(false);
  const [flagTarget, setFlagTarget] = useState<ProductRow | null>(null);
  const [flagComment, setFlagComment] = useState('');
  const [flagSubmitting, setFlagSubmitting] = useState(false);
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set());
  const [flaggedCount, setFlaggedCount] = useState(0);
  const [crossRefCount, setCrossRefCount] = useState(0);

  // Fetch manufacturer data
  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/manufacturers/${slug}`)
      .then((r) => {
        if (!r.ok) throw new Error('Not found');
        return r.json();
      })
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [slug]);

  // Fetch flagged count for this manufacturer
  useEffect(() => {
    if (!data) return;
    getAtlasFlags('open').then((resp) => {
      const mfrName = data.manufacturer.nameEn;
      const count = resp.flags.filter(f =>
        f.manufacturer === mfrName || f.manufacturer.startsWith(mfrName + ' ')
      ).length;
      setFlaggedCount(count);
    }).catch(() => {});
    getMfrCrossRefs(slug, { page: 1, limit: 1 }).then((resp) => {
      setCrossRefCount(resp.total);
    }).catch(() => {});
  }, [data, slug, flaggedIds]); // re-fetch when new flags are added

  // Fetch products when tab/filters change
  const fetchProducts = useCallback(() => {
    setProductsLoading(true);
    const params = new URLSearchParams({ page: String(productPage), limit: '50' });
    if (productSearch) params.set('search', productSearch);
    if (productFamily) params.set('family', productFamily);

    fetch(`/api/admin/manufacturers/${slug}/products?${params}`)
      .then((r) => r.json())
      .then(setProducts)
      .catch(() => {})
      .finally(() => setProductsLoading(false));
  }, [slug, productPage, productSearch, productFamily]);

  useEffect(() => {
    if (activeTab === 0) fetchProducts();
  }, [activeTab, fetchProducts]);

  // Flag handlers
  const handleFlagClick = (e: React.MouseEvent, p: ProductRow) => {
    e.stopPropagation();
    setFlagTarget(p);
    setFlagComment('');
    setFlagDialogOpen(true);
  };

  const handleFlagSubmit = async () => {
    if (!flagTarget || !flagComment.trim() || !data) return;
    setFlagSubmitting(true);
    try {
      await createAtlasFlag({
        productId: flagTarget.id,
        mpn: flagTarget.mpn,
        manufacturer: data.manufacturer.nameDisplay,
        comment: flagComment.trim(),
      });
      setFlaggedIds((prev) => new Set(prev).add(flagTarget.id));
      setFlagDialogOpen(false);
    } catch (err) {
      console.error('Flag submit failed:', err);
    } finally {
      setFlagSubmitting(false);
    }
  };

  // Enable/disable toggle
  const handleToggle = useCallback(async (enabled: boolean) => {
    if (!data) return;
    const prev = data.manufacturer.enabled;
    setData({ ...data, manufacturer: { ...data.manufacturer, enabled } });

    try {
      const res = await fetch(`/api/admin/manufacturers/${slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
    } catch {
      setData((d) => d ? { ...d, manufacturer: { ...d.manufacturer, enabled: prev } } : d);
    }
  }, [data, slug]);

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography color="text.secondary">{t('common.loading')}</Typography>
      </Box>
    );
  }

  if (!data) {
    return (
      <Box sx={{ p: 3 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => router.push('/admin?section=manufacturers')}>
          Back
        </Button>
        <Typography sx={{ mt: 2 }}>Manufacturer not found.</Typography>
      </Box>
    );
  }

  const { manufacturer: mfr, stats, familyBreakdown, familyNames } = data;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 2, px: 3, py: 1.5,
        borderBottom: 1, borderColor: 'divider', minHeight: 56,
      }}>
        <IconButton onClick={() => router.push('/admin?section=manufacturers')} size="small">
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5 }}>
            <Typography variant="h6" fontWeight={600}>{mfr.nameEn}</Typography>
            {mfr.nameZh && (
              <Typography variant="body2" color="text.secondary">{mfr.nameZh}</Typography>
            )}
          </Box>
          <Typography variant="caption" color="text.secondary">
            {[
              mfr.headquarters,
              mfr.country !== 'CN' ? mfr.country : null,
              mfr.foundedYear ? `Est. ${mfr.foundedYear}` : null,
            ].filter(Boolean).join(' · ') || `Atlas ID: ${mfr.atlasId}`}
          </Typography>
        </Box>
        {mfr.websiteUrl && (
          <Tooltip title={mfr.websiteUrl}>
            <IconButton size="small" onClick={() => window.open(mfr.websiteUrl!, '_blank')}>
              <LaunchIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        <Switch
          size="small"
          checked={mfr.enabled}
          onChange={(e) => handleToggle(e.target.checked)}
        />
      </Box>

      {/* Tabs */}
      <Box sx={{ px: 3 }}>
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          sx={{ minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0.5, textTransform: 'none', fontSize: '0.82rem' } }}
        >
          <Tab label={`Products (${stats.totalProducts})`} />
          <Tab label={`Flagged Products${flaggedCount > 0 ? ` (${flaggedCount})` : ''}`} />
          <Tab label="Coverage" />
          <Tab label={`Cross-References${crossRefCount > 0 ? ` (${crossRefCount})` : ''}`} />
          <Tab label="Profile" />
        </Tabs>
      </Box>

      {/* Tab content */}
      <Box sx={{ flex: 1, overflowY: 'auto', px: 3, pb: 3, pt: 2 }}>

        {/* ── Profile Tab ── */}
        {activeTab === 4 && (
          <Box sx={{ maxWidth: 640 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              {`${stats.totalProducts} products · ${stats.scorableProducts} scorable · ${stats.coveragePct}% avg coverage`}
            </Typography>

            {mfr.summary ? (
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" gutterBottom>About</Typography>
                <Typography variant="body2">{mfr.summary}</Typography>
              </Box>
            ) : (
              <Typography variant="body2" color="text.disabled" sx={{ mb: 3, fontStyle: 'italic' }}>
                No profile data yet — will be populated from enrichment data.
              </Typography>
            )}

            {Array.isArray(mfr.aliases) && mfr.aliases.length > 0 && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" gutterBottom>Aliases</Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {(mfr.aliases as string[]).map((a: string) => (
                    <Chip key={a} label={a} size="small" variant="outlined" sx={{ fontSize: '0.75rem' }} />
                  ))}
                </Box>
              </Box>
            )}

            {mfr.partsioName && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" gutterBottom>Parts.io</Typography>
                <Typography variant="body2">
                  {mfr.partsioName} (ID: {mfr.partsioId})
                </Typography>
              </Box>
            )}

            {Array.isArray(mfr.certifications) && mfr.certifications.length > 0 && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" gutterBottom>Certifications</Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {mfr.certifications.map((c: { name: string; category: string }, i: number) => (
                    <Chip key={i} label={c.name} size="small" sx={{ fontSize: '0.75rem' }} />
                  ))}
                </Box>
              </Box>
            )}

            {Array.isArray(mfr.complianceFlags) && mfr.complianceFlags.length > 0 && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" gutterBottom>Compliance</Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {mfr.complianceFlags.map((f: string) => (
                    <Chip key={f} label={f} size="small" color="success" variant="outlined" sx={{ fontSize: '0.75rem' }} />
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        )}

        {/* ── Products Tab ── */}
        {activeTab === 0 && (
          <Box>
            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
              <TextField
                size="small"
                placeholder="Search by MPN or description..."
                value={productSearch}
                onChange={(e) => { setProductSearch(e.target.value); setProductPage(1); }}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchOutlinedIcon fontSize="small" sx={{ opacity: 0.5 }} />
                      </InputAdornment>
                    ),
                  },
                }}
                sx={{ width: 320 }}
              />
            </Box>

            {productsLoading ? (
              <Typography variant="body2" color="text.secondary">{t('common.loading')}</Typography>
            ) : products && products.products.length > 0 ? (
              <>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>MPN</TableCell>
                        <TableCell>Description</TableCell>
                        <TableCell>Family</TableCell>
                        <TableCell>Category</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell align="right">Coverage</TableCell>
                        <TableCell sx={{ width: 40 }} />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {products.products.map((p) => (
                        <TableRow
                          key={p.id}
                          hover
                          onClick={() => { setSelectedProductId(p.id); setExplorerOpen(true); }}
                          sx={{ cursor: 'pointer' }}
                        >
                          <TableCell>
                            <Typography variant="body2" fontWeight={500} noWrap>{p.mpn}</Typography>
                          </TableCell>
                          <TableCell sx={{ maxWidth: 0 }}>
                            <Tooltip title={p.description || ''} arrow enterDelay={300}>
                              <Typography variant="body2" noWrap sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {p.description || '\u2014'}
                              </Typography>
                            </Tooltip>
                          </TableCell>
                          <TableCell>
                            {p.familyId ? (
                              <Chip label={p.familyId} size="small" sx={{ height: 22, fontSize: '0.72rem' }} />
                            ) : (
                              <Typography variant="caption" sx={{ opacity: 0.3 }}>{'\u2014'}</Typography>
                            )}
                          </TableCell>
                          <TableCell>
                            <Typography variant="caption">{p.category}</Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={p.status}
                              size="small"
                              sx={{
                                height: 22, fontSize: '0.7rem',
                                bgcolor: p.status === 'Active' ? 'success.dark' : p.status === 'Obsolete' ? 'error.dark' : 'warning.dark',
                                color: 'white',
                              }}
                            />
                          </TableCell>
                          <TableCell align="right">
                            <Typography
                              variant="body2"
                              sx={{
                                color: p.coveragePct >= 60 ? 'success.main' : p.coveragePct >= 30 ? 'warning.main' : 'error.main',
                                opacity: p.coveragePct > 0 ? 1 : 0.3,
                              }}
                            >
                              {p.coveragePct > 0 ? `${p.coveragePct}%` : '\u2014'}
                            </Typography>
                          </TableCell>
                          <TableCell sx={{ textAlign: 'center', p: 0 }}>
                            <Tooltip title={flaggedIds.has(p.id) ? 'Flagged' : 'Flag this product'} arrow>
                              <IconButton
                                size="small"
                                onClick={(e) => handleFlagClick(e, p)}
                                sx={{ color: flaggedIds.has(p.id) ? 'warning.main' : 'text.disabled' }}
                              >
                                {flaggedIds.has(p.id) ? <FlagIcon fontSize="small" /> : <FlagOutlinedIcon fontSize="small" />}
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>

                {products.totalPages > 1 && (
                  <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                    <Pagination
                      count={products.totalPages}
                      page={productPage}
                      onChange={(_, p) => setProductPage(p)}
                      size="small"
                    />
                  </Box>
                )}

                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  {`${products.total} products total`}
                </Typography>
              </>
            ) : (
              <Typography variant="body2" color="text.secondary">
                {productSearch ? 'No products match your search.' : 'No products ingested for this manufacturer.'}
              </Typography>
            )}

            <AtlasExplorerDrawer
              open={explorerOpen}
              onClose={() => setExplorerOpen(false)}
              productId={selectedProductId}
              onProductUpdated={fetchProducts}
            />
          </Box>
        )}

        {/* ── Flagged Products Tab ── */}
        {activeTab === 1 && (
          <FlaggedProductsTab manufacturer={mfr.nameEn} />
        )}

        {/* ── Coverage Tab ── */}
        {activeTab === 2 && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {`${stats.totalProducts} products · ${stats.scorableProducts} scorable · ${stats.coveragePct}% avg coverage`}
            </Typography>

            {familyBreakdown.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No products ingested for this manufacturer.
              </Typography>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('admin.atlasFamilyCol', 'Family')}</TableCell>
                      <TableCell>{t('admin.atlasCategoryCol', 'Category')}</TableCell>
                      <TableCell>{t('admin.atlasSubcategoryCol', 'Subcategory')}</TableCell>
                      <TableCell align="right">{t('admin.atlasProductsCol', 'Products')}</TableCell>
                      <TableCell align="right">{t('admin.atlasScorableCol', 'Scorable')}</TableCell>
                      <TableCell align="right">{t('admin.atlasCoverageCol', 'Coverage')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {familyBreakdown.map((fb) => {
                      const hasFamilyId = fb.familyId !== null;
                      return (
                        <TableRow
                          key={fb.familyId ?? `${fb.category}::${fb.subcategory}`}
                          hover={hasFamilyId}
                          onClick={() => {
                            if (hasFamilyId) {
                              setSelectedFamilyId(fb.familyId!);
                              setCoverageOpen(true);
                            }
                          }}
                          sx={{ cursor: hasFamilyId ? 'pointer' : 'default' }}
                        >
                          <TableCell>
                            {hasFamilyId ? (
                              <Tooltip title={familyNames[fb.familyId!] || fb.familyId} arrow>
                                <Chip label={fb.familyId} size="small" sx={{ height: 22, fontSize: '0.72rem' }} />
                              </Tooltip>
                            ) : (
                              <Typography variant="caption" sx={{ opacity: 0.4 }}>{'\u2014'}</Typography>
                            )}
                          </TableCell>
                          <TableCell><Typography variant="caption">{fb.category}</Typography></TableCell>
                          <TableCell><Typography variant="caption">{fb.subcategory}</Typography></TableCell>
                          <TableCell align="right"><Typography variant="caption">{fb.count}</Typography></TableCell>
                          <TableCell align="right">
                            <Typography variant="caption" sx={{ opacity: fb.scorableCount > 0 ? 1 : 0.3 }}>
                              {fb.scorableCount > 0 ? fb.scorableCount : '\u2014'}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="caption" sx={{ opacity: fb.coveragePct > 0 ? 1 : 0.3 }}>
                              {fb.coveragePct > 0 ? `${fb.coveragePct}%` : '\u2014'}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            <AtlasCoverageDrawer
              open={coverageOpen}
              onClose={() => setCoverageOpen(false)}
              manufacturer={mfr.nameDisplay}
              familyId={selectedFamilyId}
              familyName={familyNames[selectedFamilyId] ?? selectedFamilyId}
            />
          </Box>
        )}

        {/* ── Cross-References Tab ── */}
        {activeTab === 3 && (
          <CrossReferencesTab slug={slug} manufacturerName={mfr?.nameDisplay || slug} />
        )}

      </Box>

      {/* Flag dialog */}
      <Dialog open={flagDialogOpen} onClose={() => setFlagDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>Flag Product</DialogTitle>
        <DialogContent>
          {flagTarget && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {flagTarget.mpn} — {mfr.nameEn}
            </Typography>
          )}
          <TextField
            autoFocus
            multiline
            rows={3}
            fullWidth
            placeholder="What's the issue with this product?"
            value={flagComment}
            onChange={(e) => setFlagComment(e.target.value)}
            size="small"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFlagDialogOpen(false)} size="small">Cancel</Button>
          <Button
            onClick={handleFlagSubmit}
            variant="contained"
            size="small"
            disabled={!flagComment.trim() || flagSubmitting}
          >
            {flagSubmitting ? 'Flagging...' : 'Flag'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
