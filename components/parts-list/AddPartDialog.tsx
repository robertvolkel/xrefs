'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link,
  Skeleton,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { ColumnMapping, PartSummary } from '@/lib/types';
import { searchPartQuick } from '@/lib/api';

interface AddPartDialogProps {
  open: boolean;
  onAdd: (mpn: string, manufacturer: string, resolvedPart?: PartSummary, extraCells?: Record<number, string>) => void;
  onCancel: () => void;
  spreadsheetHeaders: string[];
  inferredMapping: ColumnMapping | null;
  /** 'add' (default): Add Part flow. 'replace': row-identity picker — seeds mpn/mfr,
   *  skips search step if candidates supplied, and calls onReplace instead of onAdd. */
  mode?: 'add' | 'replace';
  initialMpn?: string;
  initialManufacturer?: string;
  /** Pre-populated candidates for replace mode — dialog opens directly on the results list. */
  initialCandidates?: PartSummary[];
  onReplace?: (picked: PartSummary) => void;
}

export default function AddPartDialog({
  open,
  onAdd,
  onCancel,
  spreadsheetHeaders,
  inferredMapping,
  mode = 'add',
  initialMpn,
  initialManufacturer,
  initialCandidates,
  onReplace,
}: AddPartDialogProps) {
  const { t } = useTranslation();
  const [mpn, setMpn] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [extraValues, setExtraValues] = useState<Record<number, string>>({});
  const [searching, setSearching] = useState(false);
  const [matches, setMatches] = useState<PartSummary[] | null>(null);
  const [noResults, setNoResults] = useState(false);

  const isReplace = mode === 'replace';

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setMpn(initialMpn ?? '');
      setManufacturer(initialManufacturer ?? '');
      setExtraValues({});
      setSearching(false);
      // Replace mode can pre-populate the results list from batch-validation candidates.
      setMatches(initialCandidates && initialCandidates.length > 0 ? initialCandidates : null);
      setNoResults(false);
    }
  }, [open, initialMpn, initialManufacturer, initialCandidates]);

  // Replace mode with an initial MPN but no candidates: auto-run search on open.
  useEffect(() => {
    if (!open || !isReplace) return;
    const trimmedMpn = (initialMpn ?? '').trim();
    const hasCandidates = !!(initialCandidates && initialCandidates.length > 0);
    if (!trimmedMpn || hasCandidates) return;

    let cancelled = false;
    setSearching(true);
    setMatches(null);
    setNoResults(false);
    searchPartQuick(trimmedMpn, (initialManufacturer ?? '').trim() || undefined)
      .then(result => {
        if (cancelled) return;
        if (result.matches.length === 0) setNoResults(true);
        else setMatches(result.matches);
      })
      .catch(() => { if (!cancelled) setNoResults(true); })
      .finally(() => { if (!cancelled) setSearching(false); });
    return () => { cancelled = true; };
  }, [open, isReplace, initialMpn, initialManufacturer, initialCandidates]);

  // Determine which columns are "extra" (not MPN, MFR, or description)
  const mappedIndices = new Set<number>();
  if (inferredMapping) {
    if (inferredMapping.mpnColumn >= 0) mappedIndices.add(inferredMapping.mpnColumn);
    if (inferredMapping.manufacturerColumn >= 0) mappedIndices.add(inferredMapping.manufacturerColumn);
    if (inferredMapping.descriptionColumn >= 0) mappedIndices.add(inferredMapping.descriptionColumn);
    if (inferredMapping.cpnColumn != null && inferredMapping.cpnColumn >= 0) mappedIndices.add(inferredMapping.cpnColumn);
    if (inferredMapping.unitCostColumn != null && inferredMapping.unitCostColumn >= 0) mappedIndices.add(inferredMapping.unitCostColumn);
  } else {
    // Default empty-list layout: 0=MPN, 1=MFR
    mappedIndices.add(0);
    mappedIndices.add(1);
  }

  const extraColumns = spreadsheetHeaders
    .map((header, idx) => ({ header, idx }))
    .filter(({ idx }) => !mappedIndices.has(idx) && idx < spreadsheetHeaders.length);

  const extras = Object.keys(extraValues).length > 0 ? extraValues : undefined;

  const handleSearch = async () => {
    const trimmedMpn = mpn.trim();
    if (!trimmedMpn) return;

    setMatches(null);
    setNoResults(false);
    setSearching(true);

    try {
      const result = await searchPartQuick(trimmedMpn, manufacturer.trim() || undefined);

      if (result.matches.length === 0) {
        setNoResults(true);
      } else {
        setMatches(result.matches);
      }
    } catch {
      // On error, show no-results state so user can still add manually
      setNoResults(true);
    } finally {
      setSearching(false);
    }
  };

  const handleSelectMatch = (match: PartSummary) => {
    if (isReplace && onReplace) {
      onReplace(match);
      return;
    }
    onAdd(match.mpn, match.manufacturer ?? manufacturer, match, extras);
  };

  const handleAddAnyway = () => {
    // In replace mode, we need a verified catalog identity — don't let the user
    // force an unverified row. They can cancel (reverts) and retry.
    if (isReplace) return;
    onAdd(mpn.trim(), manufacturer, undefined, extras);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && mpn.trim() && !searching && !matches) {
      e.preventDefault();
      handleSearch();
    }
  };

  const handleBackToSearch = () => {
    setMatches(null);
    setNoResults(false);
  };

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3, bgcolor: 'background.paper' } }}
    >
      <DialogTitle sx={{ pb: 0, fontWeight: 600 }}>
        {isReplace
          ? (mpn.trim() ? `Select match for ${mpn.trim()}` : 'Select matching part')
          : t('addPartDialog.title')}
      </DialogTitle>

      <DialogContent sx={{ pt: '16px !important', pb: 1 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            label={t('addPartDialog.mpnLabel')}
            placeholder={t('addPartDialog.mpnPlaceholder')}
            value={mpn}
            onChange={e => { setMpn(e.target.value); setMatches(null); setNoResults(false); }}
            onKeyDown={handleKeyDown}
            autoFocus
            fullWidth
            size="small"
            required
            disabled={searching}
          />
          <TextField
            label={t('addPartDialog.manufacturerLabel')}
            placeholder={t('addPartDialog.manufacturerPlaceholder')}
            value={manufacturer}
            onChange={e => { setManufacturer(e.target.value); setMatches(null); setNoResults(false); }}
            onKeyDown={handleKeyDown}
            fullWidth
            size="small"
            disabled={searching}
          />

          {extraColumns.length > 0 && !matches && (
            <Accordion
              disableGutters
              elevation={0}
              sx={{
                '&:before': { display: 'none' },
                bgcolor: 'transparent',
              }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 0, minHeight: 36 }}>
                <Typography variant="body2" color="text.secondary">
                  {t('addPartDialog.additionalColumns')}
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ px: 0, pt: 0, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {extraColumns.map(({ header, idx }) => (
                  <TextField
                    key={idx}
                    label={header}
                    value={extraValues[idx] ?? ''}
                    onChange={e => setExtraValues(prev => ({ ...prev, [idx]: e.target.value }))}
                    fullWidth
                    size="small"
                  />
                ))}
              </AccordionDetails>
            </Accordion>
          )}

          {/* Searching — skeleton list showing where matches will land. More
              legible than the tiny button spinner, especially in replace mode
              where the search kicks off automatically on open. */}
          {searching && (
            <Box sx={{ mt: 0.5 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Searching for matches…
              </Typography>
              <Box
                sx={{
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1,
                  overflow: 'hidden',
                }}
              >
                {[0, 1, 2].map(i => (
                  <Box
                    key={i}
                    sx={{
                      px: 1.5,
                      py: 1,
                      borderBottom: i < 2 ? 1 : 0,
                      borderColor: 'divider',
                    }}
                  >
                    <Skeleton variant="text" width="45%" height={16} sx={{ fontSize: '0.82rem' }} />
                    <Skeleton variant="text" width="75%" height={14} />
                  </Box>
                ))}
              </Box>
            </Box>
          )}

          {/* No results warning */}
          {noResults && (
            <Typography variant="body2" color="warning.main" sx={{ mt: 0.5 }}>
              {t('addPartDialog.noResults')}
            </Typography>
          )}

          {/* Search results picker */}
          {matches && matches.length > 0 && (
            <Box sx={{ mt: 0.5 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {t('addPartDialog.selectPart')}
              </Typography>
              <Box
                sx={{
                  maxHeight: 240,
                  overflow: 'auto',
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1,
                }}
              >
                {matches.map((match, i) => {
                  const isExactMpn = match.mpn.toLowerCase() === mpn.trim().toLowerCase();
                  return (
                    <Box
                      key={`${match.mpn}-${i}`}
                      onClick={() => handleSelectMatch(match)}
                      sx={{
                        px: 1.5,
                        py: 1,
                        cursor: 'pointer',
                        '&:hover': { bgcolor: 'action.hover' },
                        borderBottom: i < matches.length - 1 ? 1 : 0,
                        borderColor: 'divider',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 1,
                      }}
                    >
                      {isExactMpn && (
                        <CheckCircleOutlineIcon sx={{ fontSize: 16, color: 'success.main', mt: 0.25, flexShrink: 0 }} />
                      )}
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.82rem' }}>
                          {match.mpn}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                          {match.manufacturer}{match.description ? ` — ${match.description}` : ''}
                        </Typography>
                        {match.dataSource && (
                          <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.65rem' }}>
                            {match.dataSource}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  );
                })}
              </Box>
              {!isReplace && (
                <Link
                  component="button"
                  variant="caption"
                  onClick={handleAddAnyway}
                  sx={{ mt: 0.5, display: 'block' }}
                >
                  {t('addPartDialog.addAnyway')}
                </Link>
              )}
            </Box>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button
          onClick={matches ? handleBackToSearch : onCancel}
          sx={{ borderRadius: 20, textTransform: 'none' }}
        >
          {matches ? t('common.back') : t('common.cancel')}
        </Button>
        {!matches && (
          <Button
            variant="contained"
            onClick={noResults && !isReplace ? handleAddAnyway : handleSearch}
            disabled={!mpn.trim() || searching}
            sx={{ borderRadius: 20, textTransform: 'none', minWidth: 100 }}
          >
            {searching
              ? <CircularProgress size={20} color="inherit" />
              : noResults && !isReplace
                ? t('addPartDialog.addAnyway')
                : t('addPartDialog.searchButton')
            }
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
