'use client';

/**
 * BatchCard — collapsible card for a single ingest batch.
 *
 * Header (always visible):
 *   risk chip · MFR · counts · action buttons
 *
 * Expanded body (default open for risk='attention', closed otherwise):
 *   - Diff summary (counts, classification flips, removed products)
 *   - Per-product diff table (first 50, expand for more)
 *   - Unmapped params for this batch
 *
 * Two variants: 'pending' (default) shows Proceed/Discard/Regenerate;
 * 'applied' shows Revert + applied timestamp.
 */

import { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  IconButton,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import UndoIcon from '@mui/icons-material/Undo';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ProductDiffTable from './ProductDiffTable';
import { useRouter } from 'next/navigation';
import type { IngestBatch, IngestRisk } from './types';

const RISK_COLOR: Record<IngestRisk, { bg: string; fg: string }> = {
  clean:     { bg: 'success.dark', fg: 'success.contrastText' },
  review:    { bg: 'warning.dark', fg: 'warning.contrastText' },
  attention: { bg: 'error.dark',   fg: 'error.contrastText' },
};

interface Props {
  batch: IngestBatch;
  variant?: 'pending' | 'applied';
  onProceed?: () => void;
  onRevert?: () => void;
  onDiscard?: () => void;
  onRegenerate?: () => void;
  actionInFlight: 'proceed' | 'revert' | 'discard' | 'regenerate' | null;
}

export default function BatchCard({
  batch, variant = 'pending', onProceed, onRevert, onDiscard, onRegenerate, actionInFlight,
}: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(batch.risk === 'attention');
  const r = batch.report;
  const counts = r?.productCounts ?? { willInsert: 0, willUpdate: 0, willDelete: 0, inDb: 0, inNewFile: 0 };
  const attrs = r?.attrChanges ?? { totalNewAttrs: 0, totalChangedValues: 0, totalRemovedAttrs: 0, perProduct: [] };
  const unmappedCount = r?.unmappedParams?.length ?? 0;
  const riskColor = RISK_COLOR[batch.risk];

  const inFlight = actionInFlight !== null;

  return (
    <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
      {/* Header */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          cursor: 'pointer',
          '&:hover': { bgcolor: 'action.hover' },
        }}
        onClick={() => setExpanded((p) => !p)}
      >
        <Chip
          size="small"
          label={batch.risk.toUpperCase()}
          sx={{ bgcolor: riskColor.bg, color: riskColor.fg, fontWeight: 700, minWidth: 90 }}
        />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {batch.manufacturer}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {batch.source_file}
          </Typography>
        </Box>
        <Box sx={{ textAlign: 'right', minWidth: 200 }}>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            +{counts.willInsert} ins · {counts.willUpdate} upd · {counts.willDelete} del
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {attrs.totalNewAttrs} attrs added · {unmappedCount} unmapped
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} onClick={(e) => e.stopPropagation()}>
          {variant === 'pending' && (
            <>
              <Button
                size="small"
                variant="contained"
                color="success"
                startIcon={actionInFlight === 'proceed' ? <CircularProgress size={14} color="inherit" /> : <PlayArrowIcon />}
                onClick={() => {
                  // Surface unmapped-params status so operator knows engineer
                  // review hasn't happened yet (Decision-driven Model 3).
                  // Light friction only — operator can still proceed.
                  if (unmappedCount > 0) {
                    const ok = confirm(
                      `This batch has ${unmappedCount} unmapped parameter${unmappedCount === 1 ? '' : 's'} that haven't been reviewed by an engineer. ` +
                      `Proceeding will apply the batch as-is; the unmapped values will store under raw IDs and can be cleaned up later via Dictionary Triage.\n\n` +
                      `Apply anyway?`
                    );
                    if (!ok) return;
                  }
                  onProceed?.();
                }}
                disabled={inFlight}
              >
                Proceed
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={actionInFlight === 'regenerate' ? <CircularProgress size={14} /> : <RefreshIcon />}
                onClick={onRegenerate}
                disabled={inFlight}
              >
                Regen
              </Button>
              <Button
                size="small"
                color="error"
                startIcon={actionInFlight === 'discard' ? <CircularProgress size={14} color="inherit" /> : <DeleteOutlineIcon />}
                onClick={onDiscard}
                disabled={inFlight}
              >
                Discard
              </Button>
            </>
          )}
          {variant === 'applied' && (
            <>
              <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center', mr: 1 }}>
                Applied {batch.applied_at ? new Date(batch.applied_at).toLocaleString() : ''}
              </Typography>
              <Button
                size="small"
                variant="outlined"
                color="warning"
                startIcon={actionInFlight === 'revert' ? <CircularProgress size={14} /> : <UndoIcon />}
                onClick={onRevert}
                disabled={inFlight}
              >
                Revert
              </Button>
            </>
          )}
        </Stack>
        <IconButton size="small">
          {expanded ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
        </IconButton>
      </Box>

      <Collapse in={expanded}>
        <Divider />
        <Box sx={{ p: 2 }}>
          {/* Counts strip */}
          <Stack direction="row" spacing={3} sx={{ mb: 2, flexWrap: 'wrap' }}>
            <Stat label="In new file" value={counts.inNewFile} />
            <Stat label="In DB" value={counts.inDb} />
            <Stat label="Will insert" value={counts.willInsert} />
            <Stat label="Will update" value={counts.willUpdate} />
            <Stat label="Will delete" value={counts.willDelete} />
            <Stat label="Avg attrs/product" value={`${(r?.attrCountStats?.avgBefore ?? 0).toFixed(1)} → ${(r?.attrCountStats?.avgAfter ?? 0).toFixed(1)}`} />
          </Stack>

          {r?.classificationChanges && r.classificationChanges.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" sx={{ fontWeight: 600 }}>
                Classification changes ({r.classificationChanges.length}):
              </Typography>
              <Box sx={{ pl: 2, fontSize: '0.75rem', color: 'text.secondary' }}>
                {r.classificationChanges.slice(0, 20).map((c, i) => (
                  <Box key={i} component="code" sx={{ display: 'block' }}>
                    {c.mpn} · {c.field}: {String(c.oldValue ?? '∅')} → {String(c.newValue ?? '∅')}
                  </Box>
                ))}
                {r.classificationChanges.length > 20 && (
                  <Typography variant="caption">… and {r.classificationChanges.length - 20} more</Typography>
                )}
              </Box>
            </Box>
          )}

          {r?.deletes && r.deletes.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" sx={{ fontWeight: 600 }}>
                Removed products ({r.deletes.length}):
              </Typography>
              <Box sx={{ pl: 2, fontSize: '0.75rem', color: 'text.secondary' }}>
                {r.deletes.slice(0, 15).map((d) => (
                  <Box key={d.mpn} component="code" sx={{ display: 'block' }}>
                    {d.mpn} → {d.kind} ({d.reason})
                  </Box>
                ))}
                {r.deletes.length > 15 && (
                  <Typography variant="caption">… and {r.deletes.length - 15} more</Typography>
                )}
              </Box>
            </Box>
          )}

          {attrs.perProduct.length > 0 && (
            <ProductDiffTable rows={attrs.perProduct} />
          )}

          {/* Read-only unmapped-params summary (Decision-driven Model 3):
              the operator sees the count + a deep-link to the dedicated
              Dictionary Triage workspace, but doesn't get edit power here.
              Engineers own the editing surface at ?section=atlas-dict-triage. */}
          {r?.unmappedParams && r.unmappedParams.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="caption" sx={{ fontWeight: 600, color: 'warning.main' }}>
                  {r.unmappedParams.length} unmapped parameter{r.unmappedParams.length === 1 ? '' : 's'} in this batch
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/admin?section=atlas-dict-triage&batch=${encodeURIComponent(batch.batch_id)}`);
                  }}
                  sx={{ fontSize: '0.7rem' }}
                >
                  Review in Dictionary Triage
                </Button>
              </Stack>
              <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.5, fontSize: '0.7rem' }}>
                Sample names: {r.unmappedParams.slice(0, 5).map((u) => u.paramName).join(', ')}{r.unmappedParams.length > 5 ? `, +${r.unmappedParams.length - 5} more` : ''}
              </Typography>
            </Box>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textTransform: 'uppercase', fontSize: '0.65rem' }}>{label}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>{value}</Typography>
    </Box>
  );
}
