'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Button,
  Chip,
  Collapse,
  Drawer,
  IconButton,
  Link,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { LogicType } from '@/lib/types';
import { typeColors, typeLabels } from './logicConstants';
import { getAtlasExplorerDetail, updateAtlasProduct, type AtlasExplorerDetail } from '@/lib/api';

interface AtlasExplorerDrawerProps {
  open: boolean;
  onClose: () => void;
  productId: string | null;
  onProductUpdated?: () => void;
}

function getRowBg(hasValue: boolean, blockOnMissing: boolean): string | undefined {
  if (hasValue) return 'rgba(76, 175, 80, 0.06)';
  if (blockOnMissing) return 'rgba(255, 82, 82, 0.08)';
  return 'rgba(255, 183, 77, 0.04)';
}

export default function AtlasExplorerDrawer({ open, onClose, productId, onProductUpdated }: AtlasExplorerDrawerProps) {
  const { t } = useTranslation();
  const [data, setData] = useState<AtlasExplorerDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [rawOpen, setRawOpen] = useState(false);

  // Edit mode state
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editDescription, setEditDescription] = useState('');
  const [editParams, setEditParams] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    setData(null);
    setExtrasOpen(false);
    setRawOpen(false);
    setEditing(false);
    try {
      const detail = await getAtlasExplorerDetail(productId);
      setData(detail);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    if (open && productId) fetchData();
  }, [open, productId, fetchData]);

  const handleStartEdit = () => {
    if (!data) return;
    setEditDescription(data.product.description ?? '');
    setEditParams({});
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
    setEditParams({});
  };

  const handleSave = async () => {
    if (!data || !productId) return;
    setSaving(true);

    const updates: { description?: string; parameters?: Record<string, { value: string }> } = {};

    // Description changed?
    if (editDescription !== (data.product.description ?? '')) {
      updates.description = editDescription;
    }

    // Parameters changed?
    if (Object.keys(editParams).length > 0) {
      updates.parameters = {};
      for (const [attrId, value] of Object.entries(editParams)) {
        updates.parameters[attrId] = { value };
      }
    }

    if (Object.keys(updates).length > 0) {
      const ok = await updateAtlasProduct(productId, updates);
      if (ok) {
        await fetchData();
        onProductUpdated?.();
      }
    } else {
      setEditing(false);
    }

    setSaving(false);
  };

  const getEditParamValue = (attributeId: string, currentValue: string | null): string => {
    if (attributeId in editParams) return editParams[attributeId];
    return currentValue ?? '';
  };

  const setParamEdit = (attributeId: string, value: string) => {
    setEditParams(prev => ({ ...prev, [attributeId]: value }));
  };

  const sc = data?.schemaComparison;
  const l2 = data?.l2SchemaComparison;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: 660, bgcolor: 'background.default' } }}
    >
      <Box sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1, flexShrink: 0 }}>
          <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 600 }}>
            {data?.product.mpn ?? '...'}
          </Typography>
          <Stack direction="row" spacing={0.5} alignItems="center">
            {data && !editing && (
              <IconButton onClick={handleStartEdit} size="small" title="Edit">
                <EditIcon sx={{ fontSize: 18 }} />
              </IconButton>
            )}
            {editing && (
              <>
                <Button
                  size="small"
                  variant="text"
                  onClick={handleCancel}
                  disabled={saving}
                  sx={{ fontSize: '0.75rem', minWidth: 'auto', px: 1 }}
                >
                  Cancel
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  onClick={handleSave}
                  disabled={saving}
                  sx={{ fontSize: '0.75rem', minWidth: 'auto', px: 1.5 }}
                >
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              </>
            )}
            <IconButton onClick={onClose} size="small">
              <CloseIcon />
            </IconButton>
          </Stack>
        </Stack>

        {loading && !data && (
          <Typography variant="body2" color="text.secondary">{t('common.loading')}</Typography>
        )}

        {data && (
          <Box sx={{ flex: 1, overflow: 'auto' }}>
            {/* Identity block */}
            <Stack spacing={0.5} sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.78rem' }}>
                {data.product.manufacturer} &middot; {data.product.category} &middot; {data.product.subcategory}
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                {data.product.familyName ? (
                  <Chip
                    label={`${data.product.familyName} (${data.product.familyId})`}
                    size="small"
                    sx={{ height: 22, fontSize: '0.7rem', fontWeight: 600 }}
                  />
                ) : (
                  <Chip label="No family" size="small" variant="outlined" sx={{ height: 22, fontSize: '0.7rem' }} />
                )}
                <Chip
                  label={data.product.status}
                  size="small"
                  color={data.product.status === 'Active' ? 'success' : data.product.status === 'Obsolete' ? 'error' : 'default'}
                  variant="outlined"
                  sx={{ height: 22, fontSize: '0.7rem' }}
                />
                {data.product.package && (
                  <Typography variant="caption" color="text.secondary">{data.product.package}</Typography>
                )}
              </Stack>
              {editing ? (
                <TextField
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  multiline
                  minRows={1}
                  maxRows={4}
                  fullWidth
                  size="small"
                  placeholder="Product description"
                  sx={{ mt: 0.5, '& .MuiInputBase-input': { fontSize: '0.75rem' } }}
                />
              ) : (
                data.product.description && (
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem', mt: 0.5 }}>
                    {data.product.description}
                  </Typography>
                )
              )}
              {data.product.datasheetUrl && (
                <Link
                  href={data.product.datasheetUrl}
                  target="_blank"
                  rel="noopener"
                  variant="caption"
                  sx={{ fontSize: '0.72rem' }}
                >
                  Datasheet
                </Link>
              )}
            </Stack>

            {/* Coverage summary */}
            {sc && (
              <Box sx={{ mb: 2, p: 1.5, borderRadius: 1, bgcolor: 'action.hover' }}>
                <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.82rem' }}>
                  {t('admin.atlasCoverage', {
                    matched: sc.matched,
                    total: sc.totalRules,
                    pct: sc.coverage,
                  })}
                </Typography>
              </Box>
            )}

            {/* L2 coverage summary */}
            {!sc && l2 && (
              <Box sx={{ mb: 2, p: 1.5, borderRadius: 1, bgcolor: 'action.hover' }}>
                <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.82rem' }}>
                  {t('admin.atlasL2Coverage', {
                    matched: l2.matched,
                    total: l2.totalFields,
                    pct: l2.coverage,
                    category: l2.category,
                  })}
                </Typography>
              </Box>
            )}

            {/* No family and no L2 notice */}
            {!sc && !l2 && (
              <Box sx={{ mb: 2, p: 1.5, borderRadius: 1, bgcolor: 'action.hover' }}>
                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.78rem' }}>
                  {t('admin.atlasNoFamily')}
                </Typography>
              </Box>
            )}

            {/* Schema Comparison Table */}
            {sc && sc.rules.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1, fontSize: '0.82rem' }}>
                  {t('admin.atlasSchemaComparison')}
                </Typography>
                <TableContainer>
                  <Table size="small" sx={{ '& td, & th': { borderColor: 'divider' } }}>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600 }}>Attribute</TableCell>
                        <TableCell sx={{ fontWeight: 600, width: 36, textAlign: 'center' }}>W</TableCell>
                        <TableCell sx={{ fontWeight: 600, width: 100 }}>Type</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Atlas Value</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {sc.rules.map((rule) => (
                        <TableRow key={rule.attributeId} sx={{ bgcolor: getRowBg(rule.atlasValue !== null, rule.blockOnMissing) }}>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontSize: '0.78rem' }}>
                              {rule.attributeName}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.62rem' }}>
                              {rule.attributeId}
                            </Typography>
                          </TableCell>
                          <TableCell sx={{ textAlign: 'center' }}>
                            <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.78rem' }}>
                              {rule.weight}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={typeLabels[rule.logicType as LogicType] ?? rule.logicType}
                              size="small"
                              sx={{
                                height: 20,
                                fontSize: '0.65rem',
                                fontWeight: 600,
                                bgcolor: `${typeColors[rule.logicType as LogicType] ?? '#999'}22`,
                                color: typeColors[rule.logicType as LogicType] ?? '#999',
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            {editing ? (
                              <TextField
                                value={getEditParamValue(rule.attributeId, rule.atlasValue)}
                                onChange={(e) => setParamEdit(rule.attributeId, e.target.value)}
                                size="small"
                                variant="standard"
                                placeholder="—"
                                sx={{ '& .MuiInputBase-input': { fontSize: '0.78rem', py: 0 } }}
                              />
                            ) : rule.atlasValue !== null ? (
                              <Typography variant="body2" sx={{ fontSize: '0.78rem' }}>
                                {rule.atlasValue}
                                {rule.atlasUnit && (
                                  <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                                    {rule.atlasUnit}
                                  </Typography>
                                )}
                              </Typography>
                            ) : (
                              <Typography variant="body2" sx={{ fontSize: '0.78rem', color: rule.blockOnMissing ? 'error.main' : 'text.secondary', fontStyle: 'italic' }}>
                                {rule.blockOnMissing ? 'Missing (blocking)' : 'Missing'}
                              </Typography>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}

            {/* L2 Schema Comparison Table */}
            {!sc && l2 && l2.fields.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1, fontSize: '0.82rem' }}>
                  {t('admin.atlasL2Category', { category: l2.category })}
                </Typography>
                <TableContainer>
                  <Table size="small" sx={{ '& td, & th': { borderColor: 'divider' } }}>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600 }}>Attribute</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Atlas Value</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {l2.fields.map((field) => (
                        <TableRow
                          key={field.attributeId}
                          sx={{ bgcolor: field.atlasValue !== null ? 'rgba(76, 175, 80, 0.06)' : 'rgba(255, 183, 77, 0.04)' }}
                        >
                          <TableCell>
                            <Typography variant="body2" sx={{ fontSize: '0.78rem' }}>
                              {field.attributeName}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.62rem' }}>
                              {field.attributeId}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            {editing ? (
                              <TextField
                                value={getEditParamValue(field.attributeId, field.atlasValue)}
                                onChange={(e) => setParamEdit(field.attributeId, e.target.value)}
                                size="small"
                                variant="standard"
                                placeholder="—"
                                sx={{ '& .MuiInputBase-input': { fontSize: '0.78rem', py: 0 } }}
                              />
                            ) : field.atlasValue !== null ? (
                              <Typography variant="body2" sx={{ fontSize: '0.78rem' }}>
                                {field.atlasValue}
                                {field.atlasUnit && (
                                  <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                                    {field.atlasUnit}
                                  </Typography>
                                )}
                              </Typography>
                            ) : (
                              <Typography variant="body2" sx={{ fontSize: '0.78rem', color: 'text.secondary', fontStyle: 'italic' }}>
                                Missing
                              </Typography>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}

            {/* All Atlas attributes (shown when no family AND no L2) */}
            {!sc && !l2 && data.atlasAttributes.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1, fontSize: '0.82rem' }}>
                  Atlas Attributes ({data.atlasAttributes.length})
                </Typography>
                <TableContainer>
                  <Table size="small" sx={{ '& td, & th': { borderColor: 'divider' } }}>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600 }}>Attribute ID</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Value</TableCell>
                        <TableCell sx={{ fontWeight: 600, width: 60 }}>Unit</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.atlasAttributes.map((attr) => (
                        <TableRow key={attr.attributeId}>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontSize: '0.78rem' }}>{attr.attributeId}</Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontSize: '0.78rem' }}>{attr.value}</Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontSize: '0.78rem', opacity: 0.6 }}>{attr.unit ?? ''}</Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}

            {/* Extra attributes (collapsible) */}
            {data.extraAttributes.length > 0 && (sc || l2) && (
              <Box sx={{ mb: 2 }}>
                <Box
                  onClick={() => setExtrasOpen(!extrasOpen)}
                  sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 0.5, mb: 0.5 }}
                >
                  {extrasOpen ? <ExpandLessIcon sx={{ fontSize: 18 }} /> : <ExpandMoreIcon sx={{ fontSize: 18 }} />}
                  <Typography variant="subtitle2" sx={{ fontSize: '0.78rem' }}>
                    {t('admin.atlasExtraAttrs', { count: data.extraAttributes.length })}
                  </Typography>
                </Box>
                <Collapse in={extrasOpen}>
                  <TableContainer>
                    <Table size="small" sx={{ '& td, & th': { borderColor: 'divider' } }}>
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 600 }}>Attribute ID</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Value</TableCell>
                          <TableCell sx={{ fontWeight: 600, width: 60 }}>Unit</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {data.extraAttributes.map((attr) => (
                          <TableRow key={attr.attributeId}>
                            <TableCell>
                              <Typography variant="body2" sx={{ fontSize: '0.78rem' }}>{attr.attributeId}</Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" sx={{ fontSize: '0.78rem' }}>{attr.value}</Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" sx={{ fontSize: '0.78rem', opacity: 0.6 }}>{attr.unit ?? ''}</Typography>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Collapse>
              </Box>
            )}

            {/* Raw parameters (collapsible) */}
            {data.rawParameters && data.rawParameters.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Box
                  onClick={() => setRawOpen(!rawOpen)}
                  sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 0.5, mb: 0.5 }}
                >
                  {rawOpen ? <ExpandLessIcon sx={{ fontSize: 18 }} /> : <ExpandMoreIcon sx={{ fontSize: 18 }} />}
                  <Typography variant="subtitle2" sx={{ fontSize: '0.78rem' }}>
                    {t('admin.atlasRawParams', { count: data.rawParameters.length })}
                  </Typography>
                </Box>
                <Collapse in={rawOpen}>
                  <TableContainer>
                    <Table size="small" sx={{ '& td, & th': { borderColor: 'divider' } }}>
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 600 }}>Original Name</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Value</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {data.rawParameters.map((p, i) => (
                          <TableRow key={i}>
                            <TableCell>
                              <Typography variant="body2" sx={{ fontSize: '0.78rem' }}>{p.name}</Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" sx={{ fontSize: '0.78rem' }}>{p.value}</Typography>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Collapse>
              </Box>
            )}

            {/* Empty attributes */}
            {data.atlasAttributes.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2, fontStyle: 'italic' }}>
                No mapped parameters found for this product.
              </Typography>
            )}
          </Box>
        )}
      </Box>
    </Drawer>
  );
}
