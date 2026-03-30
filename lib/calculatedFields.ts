/**
 * Calculated Fields
 *
 * Defines user-created computed columns for list views.
 * Phase 1: simple binary operations (A op B) with column or literal operands.
 */

import type { PartsListRow } from './types';

// ============================================================
// TYPES
// ============================================================

/** Reference to another column by ID, with portability metadata */
export interface ColumnRef {
  /** The column ID, e.g. "dk:unitPrice" or "ss:2" */
  columnId: string;
  /** For ss:* columns: the header text at creation time (cross-list portability) */
  headerHint?: string;
}

/** A literal number operand */
export interface LiteralRef {
  literal: number;
}

/** Phase 1: simple binary operations */
export interface FormulaExpression {
  op: 'multiply' | 'divide' | 'add' | 'subtract';
  /** Left operand: always a column reference */
  left: ColumnRef;
  /** Right operand: a column reference or a literal number */
  right: ColumnRef | LiteralRef;
}

/** A calculated field definition stored on a SavedView */
export interface CalculatedFieldDef {
  /** Unique ID — becomes calc:<id> in the column list */
  id: string;
  /** Display label for the column header */
  label: string;
  /** The formula expression */
  formula: FormulaExpression;
  /** Number format hint for rendering */
  format?: 'number' | 'currency' | 'percentage';
  /** CSS text alignment */
  align?: 'left' | 'right' | 'center';
}

// ============================================================
// HELPERS
// ============================================================

export function isLiteralRef(ref: ColumnRef | LiteralRef): ref is LiteralRef {
  return 'literal' in ref;
}

/** Parse a cell value to a number, handling locale-formatted strings */
function toNumber(val: string | number | undefined): number | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  if (typeof val === 'number') return isNaN(val) ? undefined : val;
  // Strip commas and whitespace, then parse
  const cleaned = String(val).replace(/[,\s]/g, '').replace(/^\$/, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? undefined : num;
}

const OP_FNS: Record<FormulaExpression['op'], (a: number, b: number) => number | undefined> = {
  multiply: (a, b) => a * b,
  divide: (a, b) => (b === 0 ? undefined : a / b),
  add: (a, b) => a + b,
  subtract: (a, b) => a - b,
};

// ============================================================
// VALUE COMPUTATION
// ============================================================

/**
 * Compute the value of a calculated field for a given row.
 *
 * @param fieldDef - The calculated field definition
 * @param row - The parts list row
 * @param resolveColumn - Callback to get a cell value by column ID
 *   (should call getCellValue on the corresponding ColumnDefinition)
 * @param depth - Recursion depth for cycle protection (max 5)
 */
export function getCalculatedValue(
  fieldDef: CalculatedFieldDef,
  row: PartsListRow,
  resolveColumn: (columnId: string, row: PartsListRow, depth: number) => string | number | undefined,
  depth: number = 0,
): number | undefined {
  if (depth > 5) return undefined; // Cycle protection

  const { formula } = fieldDef;

  // Resolve left operand (always a column ref)
  const leftRaw = resolveColumn(formula.left.columnId, row, depth + 1);
  const leftNum = toNumber(leftRaw);
  if (leftNum === undefined) return undefined;

  // Resolve right operand (column ref or literal)
  let rightNum: number | undefined;
  if (isLiteralRef(formula.right)) {
    rightNum = formula.right.literal;
  } else {
    const rightRaw = resolveColumn(formula.right.columnId, row, depth + 1);
    rightNum = toNumber(rightRaw);
  }
  if (rightNum === undefined) return undefined;

  return OP_FNS[formula.op](leftNum, rightNum);
}

/** Operator display labels for the UI */
export const OPERATOR_LABELS: Record<FormulaExpression['op'], string> = {
  multiply: '×',
  divide: '÷',
  add: '+',
  subtract: '−',
};

/** Format display labels for the UI */
export const FORMAT_LABELS: Record<NonNullable<CalculatedFieldDef['format']>, string> = {
  number: 'Number',
  currency: 'Currency',
  percentage: 'Percentage',
};

/** Generate a unique ID for a new calculated field */
export function generateCalcFieldId(): string {
  return `cf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}
