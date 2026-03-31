'use client';

import { useState } from 'react';
import {
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { ColumnDefinition } from '@/lib/columnDefinitions';
import {
  CalculatedFieldDef,
  FormulaExpression,
  OPERATOR_LABELS,
  FORMAT_LABELS,
  generateCalcFieldId,
} from '@/lib/calculatedFields';

interface CalculatedFieldEditorProps {
  /** All available columns (for operand dropdowns) */
  availableColumns: ColumnDefinition[];
  /** Existing field to edit (undefined = creating new) */
  existingField?: CalculatedFieldDef;
  /** Called when the user saves the field */
  onSave: (field: CalculatedFieldDef) => void;
  /** Called when the user cancels */
  onCancel: () => void;
}

const OPERATORS: FormulaExpression['op'][] = ['multiply', 'divide', 'add', 'subtract'];
const FORMATS: NonNullable<CalculatedFieldDef['format']>[] = ['number', 'currency', 'percentage'];

/** Columns that could contain numeric data — for formula operand dropdowns.
 *  Includes: numeric product/system columns, spreadsheet columns (may contain qty/price),
 *  parametric columns (may contain numeric specs), and other calculated fields.
 *  Excludes: text-only fields (manufacturer, URLs, status, categories, etc.) */
function getOperandColumns(columns: ColumnDefinition[]): ColumnDefinition[] {
  return columns.filter(c => {
    if (!c.label) return false;
    // Spreadsheet columns — user data, might be numeric (qty, price, etc.)
    if (c.source === 'spreadsheet') return true;
    // Parametric columns — specs like capacitance, voltage (often numeric values)
    if (c.source === 'digikey-param') return true;
    // Other calculated fields
    if (c.source === 'calculated') return true;
    // Product/system columns — only those flagged as numeric
    if (c.isNumeric) return true;
    return false;
  });
}

export default function CalculatedFieldEditor({
  availableColumns,
  existingField,
  onSave,
  onCancel,
}: CalculatedFieldEditorProps) {
  const operandColumns = getOperandColumns(availableColumns);

  const [label, setLabel] = useState(existingField?.label ?? '');
  const [leftColumnId, setLeftColumnId] = useState(existingField?.formula.left.columnId ?? '');
  const [op, setOp] = useState<FormulaExpression['op']>(existingField?.formula.op ?? 'multiply');
  const [rightMode, setRightMode] = useState<'column' | 'number'>(
    existingField?.formula.right && 'literal' in existingField.formula.right ? 'number' : 'column',
  );
  const [rightColumnId, setRightColumnId] = useState(
    existingField?.formula.right && !('literal' in existingField.formula.right)
      ? existingField.formula.right.columnId
      : '',
  );
  const [rightLiteral, setRightLiteral] = useState(
    existingField?.formula.right && 'literal' in existingField.formula.right
      ? String(existingField.formula.right.literal)
      : '',
  );
  const [format, setFormat] = useState<CalculatedFieldDef['format']>(existingField?.format ?? 'number');

  const isValid = label.trim() !== '' &&
    leftColumnId !== '' &&
    (rightMode === 'column' ? rightColumnId !== '' : rightLiteral.trim() !== '' && !isNaN(parseFloat(rightLiteral)));

  const handleSave = () => {
    if (!isValid) return;

    const leftCol = operandColumns.find(c => c.id === leftColumnId);
    const rightCol = rightMode === 'column' ? operandColumns.find(c => c.id === rightColumnId) : undefined;

    const field: CalculatedFieldDef = {
      id: existingField?.id ?? generateCalcFieldId(),
      label: label.trim(),
      formula: {
        op,
        left: {
          columnId: leftColumnId,
          ...(leftColumnId.startsWith('ss:') && leftCol ? { headerHint: leftCol.label } : {}),
        },
        right: rightMode === 'number'
          ? { literal: parseFloat(rightLiteral) }
          : {
              columnId: rightColumnId,
              ...(rightColumnId.startsWith('ss:') && rightCol ? { headerHint: rightCol.label } : {}),
            },
      },
      format,
    };

    onSave(field);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, py: 1 }}>
      <Typography variant="subtitle2" color="text.secondary">
        {existingField ? 'Edit Calculated Field' : 'New Calculated Field'}
      </Typography>

      <TextField
        label="Column Name"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        size="small"
        fullWidth
        placeholder="e.g. Extended Price"
      />

      {/* Formula row: Left [op] Right */}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
        {/* Left operand */}
        <FormControl size="small" sx={{ flex: 1 }}>
          <InputLabel>Left</InputLabel>
          <Select
            value={leftColumnId}
            onChange={(e) => setLeftColumnId(e.target.value)}
            label="Left"
          >
            {operandColumns.map(col => (
              <MenuItem key={col.id} value={col.id}>
                {col.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Operator */}
        <FormControl size="small" sx={{ minWidth: 72 }}>
          <InputLabel>Op</InputLabel>
          <Select
            value={op}
            onChange={(e) => setOp(e.target.value as FormulaExpression['op'])}
            label="Op"
          >
            {OPERATORS.map(o => (
              <MenuItem key={o} value={o}>{OPERATOR_LABELS[o]}</MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Right operand */}
        {rightMode === 'column' ? (
          <FormControl size="small" sx={{ flex: 1 }}>
            <InputLabel>Right</InputLabel>
            <Select
              value={rightColumnId}
              onChange={(e) => setRightColumnId(e.target.value)}
              label="Right"
            >
              {operandColumns.map(col => (
                <MenuItem key={col.id} value={col.id}>
                  {col.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        ) : (
          <TextField
            label="Value"
            value={rightLiteral}
            onChange={(e) => setRightLiteral(e.target.value)}
            size="small"
            type="number"
            sx={{ flex: 1 }}
          />
        )}
      </Box>

      {/* Right operand mode toggle */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="caption" color="text.secondary">Right operand:</Typography>
        <ToggleButtonGroup
          value={rightMode}
          exclusive
          onChange={(_, v) => { if (v) setRightMode(v); }}
          size="small"
        >
          <ToggleButton value="column" sx={{ textTransform: 'none', px: 1.5, py: 0.25, fontSize: '0.75rem' }}>
            Column
          </ToggleButton>
          <ToggleButton value="number" sx={{ textTransform: 'none', px: 1.5, py: 0.25, fontSize: '0.75rem' }}>
            Number
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Format selector */}
      <FormControl size="small" sx={{ maxWidth: 160 }}>
        <InputLabel>Format</InputLabel>
        <Select
          value={format}
          onChange={(e) => setFormat(e.target.value as CalculatedFieldDef['format'])}
          label="Format"
        >
          {FORMATS.map(f => (
            <MenuItem key={f} value={f}>{FORMAT_LABELS[f]}</MenuItem>
          ))}
        </Select>
      </FormControl>

      {/* Actions */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 0.5 }}>
        <Button size="small" onClick={onCancel} sx={{ textTransform: 'none' }}>
          Cancel
        </Button>
        <Button
          size="small"
          variant="contained"
          onClick={handleSave}
          disabled={!isValid}
          sx={{ textTransform: 'none' }}
        >
          {existingField ? 'Update' : 'Add'}
        </Button>
      </Box>
    </Box>
  );
}
