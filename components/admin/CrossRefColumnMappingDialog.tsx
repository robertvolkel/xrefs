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
import type { ParsedSpreadsheet, CrossRefColumnMapping } from '@/lib/types';

interface CrossRefColumnMappingDialogProps {
  open: boolean;
  parsedData: ParsedSpreadsheet | null;
  onConfirm: (mapping: CrossRefColumnMapping) => void;
  onCancel: () => void;
}

const NOT_MAPPED = -1;

/** Auto-detect columns by matching header text to known patterns */
function autoDetect(headers: string[]): Partial<CrossRefColumnMapping> {
  const mapping: Partial<CrossRefColumnMapping> = {};
  // Normalize: lowercase, trim, replace underscores/hyphens with spaces for pattern matching
  const lower = headers.map(h => h.toLowerCase().trim().replace(/[_-]/g, ' '));

  // Xref MPN patterns
  const xrefMpnPatterns = ['xref mpn', 'xref part', 'cross ref', 'cross-ref', 'replacement mpn', 'replacement part', 'alt mpn', 'alternate mpn', 'alternate part', 'suggested mpn', 'substitute'];
  // Original MPN patterns
  const origMpnPatterns = ['original mpn', 'original part', 'orig mpn', 'orig part', 'source mpn', 'source part', 'reference mpn', 'base mpn', 'base part'];
  // Generic MPN patterns (used as fallback)
  const genericMpnPatterns = ['mpn', 'part number', 'part no', 'part #', 'p/n', 'pn'];
  // Manufacturer patterns
  const mfrPatterns = ['manufacturer', 'mfr', 'mfg', 'brand', 'vendor'];
  // Description patterns
  const descPatterns = ['description', 'desc', 'detail'];
  // Type patterns
  const typePatterns = ['type', 'equivalence', 'equiv', 'category', 'class'];

  for (let i = 0; i < lower.length; i++) {
    const h = lower[i];

    // Xref MPN — look for explicit xref/replacement patterns first
    if (mapping.xrefMpnColumn === undefined && xrefMpnPatterns.some(p => h.includes(p))) {
      mapping.xrefMpnColumn = i;
      continue;
    }
    // Original MPN
    if (mapping.originalMpnColumn === undefined && origMpnPatterns.some(p => h.includes(p))) {
      mapping.originalMpnColumn = i;
      continue;
    }
  }

  // If we didn't find explicit xref/original columns, use generic MPN patterns
  // First generic MPN match becomes original, second becomes xref
  if (mapping.originalMpnColumn === undefined || mapping.xrefMpnColumn === undefined) {
    const genericMatches: number[] = [];
    for (let i = 0; i < lower.length; i++) {
      if (i === mapping.xrefMpnColumn || i === mapping.originalMpnColumn) continue;
      if (genericMpnPatterns.some(p => lower[i].includes(p))) {
        genericMatches.push(i);
      }
    }
    if (mapping.originalMpnColumn === undefined && genericMatches.length > 0) {
      mapping.originalMpnColumn = genericMatches.shift()!;
    }
    if (mapping.xrefMpnColumn === undefined && genericMatches.length > 0) {
      mapping.xrefMpnColumn = genericMatches.shift()!;
    }
  }

  // Manufacturer columns — look for "xref" or "replacement" prefixed ones
  const mfrMatches: number[] = [];
  for (let i = 0; i < lower.length; i++) {
    if (i === mapping.xrefMpnColumn || i === mapping.originalMpnColumn) continue;
    if (mfrPatterns.some(p => lower[i].includes(p))) {
      mfrMatches.push(i);
    }
  }
  // Try to assign: xref MFR first (if header has xref/replacement/alt), then original MFR
  for (const mi of mfrMatches) {
    const h = lower[mi];
    if (mapping.xrefMfrColumn === undefined && (h.includes('xref') || h.includes('replacement') || h.includes('alt') || h.includes('cross'))) {
      mapping.xrefMfrColumn = mi;
    } else if (mapping.originalMfrColumn === undefined && (h.includes('original') || h.includes('source') || h.includes('base'))) {
      mapping.originalMfrColumn = mi;
    }
  }
  // Fallback: assign remaining MFR columns in order
  for (const mi of mfrMatches) {
    if (mi === mapping.xrefMfrColumn || mi === mapping.originalMfrColumn) continue;
    if (mapping.xrefMfrColumn === undefined) { mapping.xrefMfrColumn = mi; continue; }
    if (mapping.originalMfrColumn === undefined) { mapping.originalMfrColumn = mi; }
  }

  // Description
  for (let i = 0; i < lower.length; i++) {
    if (Object.values(mapping).includes(i)) continue;
    if (descPatterns.some(p => lower[i].includes(p))) {
      mapping.xrefDescColumn = i;
      break;
    }
  }

  // Type / equivalence
  for (let i = 0; i < lower.length; i++) {
    if (Object.values(mapping).includes(i)) continue;
    if (typePatterns.some(p => lower[i].includes(p))) {
      mapping.equivalenceTypeColumn = i;
      break;
    }
  }

  return mapping;
}

export default function CrossRefColumnMappingDialog({
  open,
  parsedData,
  onConfirm,
  onCancel,
}: CrossRefColumnMappingDialogProps) {
  const [xrefMpnCol, setXrefMpnCol] = useState<number>(NOT_MAPPED);
  const [xrefMfrCol, setXrefMfrCol] = useState<number>(NOT_MAPPED);
  const [xrefDescCol, setXrefDescCol] = useState<number>(NOT_MAPPED);
  const [origMpnCol, setOrigMpnCol] = useState<number>(NOT_MAPPED);
  const [origMfrCol, setOrigMfrCol] = useState<number>(NOT_MAPPED);
  const [typeCol, setTypeCol] = useState<number>(NOT_MAPPED);

  useEffect(() => {
    if (open && parsedData) {
      const detected = autoDetect(parsedData.headers);
      setXrefMpnCol(detected.xrefMpnColumn ?? NOT_MAPPED);
      setXrefMfrCol(detected.xrefMfrColumn ?? NOT_MAPPED);
      setXrefDescCol(detected.xrefDescColumn ?? NOT_MAPPED);
      setOrigMpnCol(detected.originalMpnColumn ?? NOT_MAPPED);
      setOrigMfrCol(detected.originalMfrColumn ?? NOT_MAPPED);
      setTypeCol(detected.equivalenceTypeColumn ?? NOT_MAPPED);
    }
  }, [open, parsedData]);

  if (!parsedData) return null;

  const { headers, rows } = parsedData;
  const previewRows = rows.slice(0, 5);
  const canConfirm = xrefMpnCol !== NOT_MAPPED && origMpnCol !== NOT_MAPPED;

  const mappedCols = new Set([xrefMpnCol, xrefMfrCol, xrefDescCol, origMpnCol, origMfrCol, typeCol].filter(c => c !== NOT_MAPPED));

  const renderSelector = (label: string, value: number, onChange: (v: number) => void) => (
    <FormControl size="small" sx={{ minWidth: 160 }}>
      <InputLabel>{label}</InputLabel>
      <Select value={value} label={label} onChange={(e) => onChange(e.target.value as number)}>
        <MenuItem value={NOT_MAPPED}><em>Not mapped</em></MenuItem>
        {headers.map((h, i) => (
          <MenuItem key={i} value={i}>{h || `Column ${i + 1}`}</MenuItem>
        ))}
      </Select>
    </FormControl>
  );

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="lg" fullWidth PaperProps={{ sx: { bgcolor: 'background.paper' } }}>
      <DialogTitle>Map Cross-Reference Columns</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Found <strong>{headers.length}</strong> columns and <strong>{rows.length}</strong> rows in <strong>{parsedData.fileName}</strong>. Map the columns below.
        </Typography>

        {/* Column selectors — two rows of 3 */}
        <Box sx={{ mb: 1 }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600}>Cross-Reference (Replacement)</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          {renderSelector('Xref MPN *', xrefMpnCol, setXrefMpnCol)}
          {renderSelector('Xref Manufacturer', xrefMfrCol, setXrefMfrCol)}
          {renderSelector('Xref Description', xrefDescCol, setXrefDescCol)}
        </Box>

        <Box sx={{ mb: 1 }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600}>Original Part</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
          {renderSelector('Original MPN *', origMpnCol, setOrigMpnCol)}
          {renderSelector('Original Manufacturer', origMfrCol, setOrigMfrCol)}
          {renderSelector('Type (Pin-to-Pin / Functional)', typeCol, setTypeCol)}
        </Box>

        {/* Preview table */}
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
          Preview ({previewRows.length} of {rows.length} rows)
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
                      fontSize: '0.72rem',
                      bgcolor: mappedCols.has(i) ? 'rgba(160, 196, 255, 0.15)' : 'background.paper',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {h || `Col ${i + 1}`}
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
                        fontSize: '0.72rem',
                        bgcolor: mappedCols.has(ci) ? 'rgba(160, 196, 255, 0.08)' : 'transparent',
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
        <Button onClick={onCancel} color="inherit">Cancel</Button>
        <Button
          onClick={() => onConfirm({
            xrefMpnColumn: xrefMpnCol,
            originalMpnColumn: origMpnCol,
            ...(xrefMfrCol !== NOT_MAPPED ? { xrefMfrColumn: xrefMfrCol } : {}),
            ...(xrefDescCol !== NOT_MAPPED ? { xrefDescColumn: xrefDescCol } : {}),
            ...(origMfrCol !== NOT_MAPPED ? { originalMfrColumn: origMfrCol } : {}),
            ...(typeCol !== NOT_MAPPED ? { equivalenceTypeColumn: typeCol } : {}),
          })}
          variant="contained"
          disabled={!canConfirm}
        >
          Confirm Mapping
        </Button>
      </DialogActions>
    </Dialog>
  );
}
