'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { ParsedSpreadsheet, ColumnMapping } from '@/lib/types';

interface ColumnMappingDialogProps {
  open: boolean;
  parsedData: ParsedSpreadsheet | null;
  initialMapping: ColumnMapping | null;
  onConfirm: (mapping: ColumnMapping) => void;
  onCancel: () => void;
  /** Re-parse the uploaded workbook using a different sheet. Only invoked when
   *  the workbook has more than one sheet. */
  onSheetChange?: (sheetName: string) => void;
}

const NOT_MAPPED = -1;

export default function ColumnMappingDialog({
  open,
  parsedData,
  initialMapping,
  onConfirm,
  onCancel,
  onSheetChange,
}: ColumnMappingDialogProps) {
  const { t } = useTranslation();
  const [mpnCol, setMpnCol] = useState<number>(NOT_MAPPED);
  const [mfrCol, setMfrCol] = useState<number>(NOT_MAPPED);
  const [descCol, setDescCol] = useState<number>(NOT_MAPPED);
  const [cpnCol, setCpnCol] = useState<number>(NOT_MAPPED);
  const [qtyCol, setQtyCol] = useState<number>(NOT_MAPPED);
  const [unitCostCol, setUnitCostCol] = useState<number>(NOT_MAPPED);

  // Sync from auto-detected mapping when dialog opens or when the user
  // switches sheets (which produces a fresh mapping from auto-detect).
  useEffect(() => {
    if (!open) return;
    if (initialMapping) {
      setMpnCol(initialMapping.mpnColumn);
      setMfrCol(initialMapping.manufacturerColumn);
      setDescCol(initialMapping.descriptionColumn);
      setCpnCol(initialMapping.cpnColumn ?? NOT_MAPPED);
      setQtyCol(initialMapping.qtyColumn ?? NOT_MAPPED);
      setUnitCostCol(initialMapping.unitCostColumn ?? NOT_MAPPED);
    } else {
      setMpnCol(NOT_MAPPED);
      setMfrCol(NOT_MAPPED);
      setDescCol(NOT_MAPPED);
      setCpnCol(NOT_MAPPED);
      setQtyCol(NOT_MAPPED);
      setUnitCostCol(NOT_MAPPED);
    }
  }, [open, initialMapping]);

  if (!parsedData) return null;

  const { headers, rows, sheetNames, activeSheet } = parsedData;
  const previewRows = rows.slice(0, 5);
  const showSheetPicker = !!onSheetChange && !!sheetNames && sheetNames.length > 1;
  // Allow confirm if at least MPN or Description is mapped
  const canConfirm = mpnCol !== NOT_MAPPED || descCol !== NOT_MAPPED;

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { bgcolor: 'background.paper' } }}
    >
      <DialogTitle>{t('columnMapping.dialogTitle')}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          <span dangerouslySetInnerHTML={{ __html: t('columnMapping.instructions', { columnCount: headers.length, rowCount: rows.length, fileName: parsedData.fileName }) }} />
        </Typography>

        {showSheetPicker && (
          <Box sx={{ mb: 3 }}>
            <FormControl size="small" sx={{ minWidth: 240 }}>
              <InputLabel>Sheet</InputLabel>
              <Select
                value={activeSheet ?? sheetNames![0]}
                label="Sheet"
                onChange={(e) => onSheetChange!(e.target.value as string)}
              >
                {sheetNames!.map((name) => (
                  <MenuItem key={name} value={name}>{name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        )}

        {/* Column selectors */}
        <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>{t('columnMapping.mpnLabel')}</InputLabel>
            <Select
              value={mpnCol}
              label={t('columnMapping.mpnLabel')}
              onChange={(e) => setMpnCol(e.target.value as number)}
            >
              <MenuItem value={NOT_MAPPED}><em>{t('columnMapping.notMapped')}</em></MenuItem>
              {headers.map((h, i) => (
                <MenuItem key={i} value={i}>{h || t('columnMapping.columnFallback', { number: i + 1 })}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>{t('columnMapping.manufacturerLabel')}</InputLabel>
            <Select
              value={mfrCol}
              label={t('columnMapping.manufacturerLabel')}
              onChange={(e) => setMfrCol(e.target.value as number)}
            >
              <MenuItem value={NOT_MAPPED}><em>{t('columnMapping.notMapped')}</em></MenuItem>
              {headers.map((h, i) => (
                <MenuItem key={i} value={i}>{h || t('columnMapping.columnFallback', { number: i + 1 })}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>{t('columnMapping.descriptionLabel')}</InputLabel>
            <Select
              value={descCol}
              label={t('columnMapping.descriptionLabel')}
              onChange={(e) => setDescCol(e.target.value as number)}
            >
              <MenuItem value={NOT_MAPPED}><em>{t('columnMapping.notMapped')}</em></MenuItem>
              {headers.map((h, i) => (
                <MenuItem key={i} value={i}>{h || t('columnMapping.columnFallback', { number: i + 1 })}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>{t('columnMapping.cpnLabel')}</InputLabel>
            <Select
              value={cpnCol}
              label={t('columnMapping.cpnLabel')}
              onChange={(e) => setCpnCol(e.target.value as number)}
            >
              <MenuItem value={NOT_MAPPED}><em>{t('columnMapping.notMapped')}</em></MenuItem>
              {headers.map((h, i) => (
                <MenuItem key={i} value={i}>{h || t('columnMapping.columnFallback', { number: i + 1 })}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Quantity (optional)</InputLabel>
            <Select
              value={qtyCol}
              label="Quantity (optional)"
              onChange={(e) => setQtyCol(e.target.value as number)}
            >
              <MenuItem value={NOT_MAPPED}><em>{t('columnMapping.notMapped')}</em></MenuItem>
              {headers.map((h, i) => (
                <MenuItem key={i} value={i}>{h || t('columnMapping.columnFallback', { number: i + 1 })}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Unit Cost (optional)</InputLabel>
            <Select
              value={unitCostCol}
              label="Unit Cost (optional)"
              onChange={(e) => setUnitCostCol(e.target.value as number)}
            >
              <MenuItem value={NOT_MAPPED}><em>{t('columnMapping.notMapped')}</em></MenuItem>
              {headers.map((h, i) => (
                <MenuItem key={i} value={i}>{h || t('columnMapping.columnFallback', { number: i + 1 })}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        {/* Preview table */}
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
          {t('columnMapping.previewCaption', { count: previewRows.length })}
        </Typography>
        <TableContainer sx={{ maxHeight: 240, border: 1, borderColor: 'divider', borderRadius: 1 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                {headers.map((h, i) => (
                  <TableCell
                    key={i}
                    sx={{
                      fontWeight: 600,
                      fontSize: '0.75rem',
                      bgcolor: i === mpnCol || i === mfrCol || i === descCol || i === cpnCol || i === qtyCol || i === unitCostCol
                        ? 'rgba(160, 196, 255, 0.15)'
                        : 'background.paper',
                    }}
                  >
                    {h || t('columnMapping.colFallback', { number: i + 1 })}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {previewRows.map((row, ri) => (
                <TableRow key={ri}>
                  {headers.map((_, ci) => (
                    <TableCell
                      key={ci}
                      sx={{
                        fontSize: '0.75rem',
                        bgcolor: ci === mpnCol || ci === mfrCol || ci === descCol || ci === cpnCol || ci === qtyCol || ci === unitCostCol
                          ? 'rgba(160, 196, 255, 0.08)'
                          : 'transparent',
                      }}
                    >
                      {row[ci] ?? ''}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onCancel} color="inherit">{t('common.cancel')}</Button>
        <Button
          onClick={() => onConfirm({
            mpnColumn: mpnCol,
            manufacturerColumn: mfrCol,
            descriptionColumn: descCol,
            ...(cpnCol !== NOT_MAPPED ? { cpnColumn: cpnCol } : {}),
            ...(qtyCol !== NOT_MAPPED ? { qtyColumn: qtyCol } : {}),
            ...(unitCostCol !== NOT_MAPPED ? { unitCostColumn: unitCostCol } : {}),
          })}
          variant="contained"
          disabled={!canConfirm}
        >
          {t('columnMapping.confirmButton')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
