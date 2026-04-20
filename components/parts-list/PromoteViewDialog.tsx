'use client';

import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Typography,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import type { ResolvedView } from '@/lib/viewConfigStorage';
import { reverseMapKnownColumns } from '@/lib/viewConfigStorage';
import type { ColumnMapping } from '@/lib/types';

export interface PromoteViewDialogProps {
  open: boolean;
  view: ResolvedView | null;
  effectiveHeaders: string[];
  inferredMapping: ColumnMapping | null;
  onConfirm: (options: { columns: string[]; columnMeta: Record<string, string> }) => void;
  onCancel: () => void;
}

interface SsColumnInfo {
  id: string;       // e.g. "ss:5"
  index: number;
  headerText: string;
}

/**
 * Check whether the view has remaining ss:* columns that need user input.
 * If false, the promote can be handled immediately without showing the dialog.
 */
export function viewNeedsPromoteDialog(
  view: ResolvedView,
  inferredMapping: ColumnMapping | null,
): boolean {
  const { columns } = reverseMapKnownColumns(view.columns, inferredMapping);
  return columns.some(id => id.startsWith('ss:'));
}

/**
 * Build the fast-path promote result (no dialog needed — all ss:* were reverse-mapped).
 */
export function buildFastPathPromoteResult(
  view: ResolvedView,
  inferredMapping: ColumnMapping | null,
): { columns: string[]; columnMeta: Record<string, string> } {
  const { columns } = reverseMapKnownColumns(view.columns, inferredMapping);
  const nonSsColumns = columns.filter(id => !id.startsWith('ss:'));
  return { columns: nonSsColumns, columnMeta: view.columnMeta ? { ...view.columnMeta } : {} };
}

export default function PromoteViewDialog({
  open,
  view,
  effectiveHeaders,
  inferredMapping,
  onConfirm,
  onCancel,
}: PromoteViewDialogProps) {
  const { t } = useTranslation();

  // Compute reverse-mapped columns and remaining ss:* columns
  const { reverseMappedColumns, reverseMappedLabels, remainingSsColumns } = useMemo(() => {
    if (!view) return { reverseMappedColumns: [] as string[], reverseMappedLabels: [] as Array<{ from: string; to: string; header: string }>, remainingSsColumns: [] as SsColumnInfo[] };

    const { columns: mapped, reverseMapped } = reverseMapKnownColumns(view.columns, inferredMapping);

    const labels = Object.entries(reverseMapped).map(([ssId, mappedId]) => {
      const idx = parseInt(ssId.slice(3), 10);
      const header = effectiveHeaders[idx] || `Column ${idx + 1}`;
      return { from: ssId, to: mappedId, header };
    });

    const remaining: SsColumnInfo[] = mapped
      .filter(id => id.startsWith('ss:'))
      .map(id => {
        const idx = parseInt(id.slice(3), 10);
        return {
          id,
          index: idx,
          headerText: effectiveHeaders[idx] || `Column ${idx + 1}`,
        };
      });

    return { reverseMappedColumns: mapped, reverseMappedLabels: labels, remainingSsColumns: remaining };
  }, [view, inferredMapping, effectiveHeaders]);

  // Track which remaining ss:* columns to keep (default: all checked)
  const [keepColumns, setKeepColumns] = useState<Set<string>>(new Set());

  // Reset checkboxes when dialog transition completes (avoids setState in useEffect)
  const handleEntered = useCallback(() => {
    setKeepColumns(new Set(remainingSsColumns.map(c => c.id)));
  }, [remainingSsColumns]);

  if (!view) return null;

  const mappedTypeLabel = (mappedId: string): string => {
    switch (mappedId) {
      case 'mapped:mpn': return 'MPN';
      case 'mapped:manufacturer': return t('partsList.manufacturer', 'Manufacturer');
      case 'mapped:description': return t('partsList.description', 'Description');
      case 'mapped:cpn': return 'CPN';
      case 'mapped:ipn': return 'IPN';
      default: return mappedId;
    }
  };

  const handleToggle = (colId: string) => {
    setKeepColumns(prev => {
      const next = new Set(prev);
      if (next.has(colId)) next.delete(colId);
      else next.add(colId);
      return next;
    });
  };

  const handleConfirm = () => {
    const finalColumns = reverseMappedColumns.filter(id => {
      if (!id.startsWith('ss:')) return true;
      return keepColumns.has(id);
    });

    const columnMeta: Record<string, string> = view.columnMeta ? { ...view.columnMeta } : {};
    for (const col of remainingSsColumns) {
      if (keepColumns.has(col.id)) {
        columnMeta[col.id] = col.headerText;
      } else {
        delete columnMeta[col.id];
      }
    }

    onConfirm({ columns: finalColumns, columnMeta });
  };

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      maxWidth="sm"
      fullWidth
      TransitionProps={{ onEntered: handleEntered }}
    >
      <DialogTitle sx={{ pb: 0.5 }}>
        {t('partsList.promoteToMaster')}
      </DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ mb: 2 }}>
          <Typography variant="body2">
            {t('partsList.promotePortableInfo')}
          </Typography>
        </Alert>

        {/* Auto-detected columns (reverse-mapped to mapped:*) */}
        {reverseMappedLabels.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
              {t('partsList.promoteAutoDetected')}
            </Typography>
            <List dense disablePadding>
              {reverseMappedLabels.map(({ from, to, header }) => (
                <ListItem key={from} sx={{ py: 0.25 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <AutoAwesomeIcon sx={{ fontSize: 16, color: 'primary.main' }} />
                  </ListItemIcon>
                  <ListItemText
                    primary={header}
                    secondary={mappedTypeLabel(to)}
                    slotProps={{
                      primary: { variant: 'body2' },
                      secondary: { variant: 'caption' },
                    }}
                  />
                  <Chip
                    label={t('partsList.promoteAutoDetectChip')}
                    size="small"
                    color="primary"
                    variant="outlined"
                    sx={{ fontSize: '0.65rem', height: 20 }}
                  />
                </ListItem>
              ))}
            </List>
          </Box>
        )}

        {/* Remaining ss:* columns — user chooses which to keep */}
        {remainingSsColumns.length > 0 && (
          <>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
              {t('partsList.promoteHeaderMatch')}
            </Typography>
            <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 1 }}>
              {t('partsList.promoteHeaderMatchHint')}
            </Typography>
            <List dense disablePadding>
              {remainingSsColumns.map(col => (
                <ListItem
                  key={col.id}
                  sx={{ py: 0.25, cursor: 'pointer' }}
                  onClick={() => handleToggle(col.id)}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <Checkbox
                      edge="start"
                      size="small"
                      checked={keepColumns.has(col.id)}
                      tabIndex={-1}
                      disableRipple
                    />
                  </ListItemIcon>
                  <ListItemText
                    primary={col.headerText}
                    secondary={keepColumns.has(col.id)
                      ? t('partsList.promoteWillMatch')
                      : t('partsList.promoteWillDrop')
                    }
                    slotProps={{
                      primary: { variant: 'body2' },
                      secondary: {
                        variant: 'caption',
                        color: keepColumns.has(col.id) ? 'text.secondary' : 'error',
                      },
                    }}
                  />
                </ListItem>
              ))}
            </List>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onCancel} sx={{ textTransform: 'none' }}>
          {t('common.cancel')}
        </Button>
        <Button variant="contained" onClick={handleConfirm} sx={{ textTransform: 'none' }}>
          {t('partsList.promoteToMaster')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
