/**
 * View Configuration Storage
 *
 * Persists multiple named column views in localStorage.
 * Global (not per-list) — the same views apply to all parts lists.
 */

import { DEFAULT_VIEW_COLUMNS } from './columnDefinitions';
import type { CalculatedFieldDef } from './calculatedFields';

// ============================================================
// TYPES
// ============================================================

export interface SavedView {
  id: string;
  name: string;
  columns: string[];
  /** Purpose/instructions for this view — used as context for the chat agent */
  description?: string;
  /** Per-list hidden row indices: { [listId]: number[] } */
  hiddenRows?: Record<string, number[]>;
  /** Maps ss:N column IDs → header text at creation time.
   *  Used to remap columns when a view is applied to a different list. */
  columnMeta?: Record<string, string>;
  /** Calculated field definitions owned by this view */
  calculatedFields?: CalculatedFieldDef[];
}

export interface ViewState {
  /** Which view is currently active (session state) */
  activeViewId: string;
  /** Which view loads by default on page open */
  defaultViewId: string;
  /** All saved views */
  views: SavedView[];
}

// ============================================================
// BUILT-IN VIEWS
// ============================================================

export const BUILTIN_VIEW_IDS = ['default', 'raw'] as const;

const DEFAULT_VIEW: SavedView = {
  id: 'default',
  name: 'Basic',
  columns: DEFAULT_VIEW_COLUMNS,
};

/** The Original view columns are built dynamically from spreadsheet headers */
const RAW_VIEW: SavedView = {
  id: 'raw',
  name: 'Original',
  columns: [], // Populated dynamically at render time
};

function createInitialState(): ViewState {
  return {
    activeViewId: 'default',
    defaultViewId: 'default',
    views: [DEFAULT_VIEW, RAW_VIEW],
  };
}

// ============================================================
// STORAGE
// ============================================================

const STORAGE_KEY = 'xrefs_column_views';

export function loadViewState(): ViewState {
  if (typeof window === 'undefined') return createInitialState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw) as ViewState;
    // Ensure built-in views exist
    if (!parsed.views?.find(v => v.id === 'default')) {
      parsed.views = [DEFAULT_VIEW, ...(parsed.views ?? [])];
    }
    if (!parsed.views.find(v => v.id === 'raw')) {
      parsed.views.splice(1, 0, RAW_VIEW);
    }
    // Migrate: rename old names → current names
    const defView = parsed.views.find(v => v.id === 'default');
    if (defView && (defView.name === 'Default' || defView.name === 'Replacements')) {
      defView.name = 'Basic';
    }
    const rawView = parsed.views.find(v => v.id === 'raw');
    if (rawView && rawView.name === 'Raw') {
      rawView.name = 'Original';
    }
    // Migrate: old sys:* column IDs → new mapped:*/dk:* equivalents (all views)
    const columnMigrations: Record<string, string> = {
      'sys:part': 'mapped:mpn',
      'sys:manufacturer': 'mapped:manufacturer',
      'sys:description': 'mapped:description',
      'sys:price': 'dk:unitPrice',
      'sys:stock': 'dk:quantityAvailable',
    };
    for (const view of parsed.views) {
      if (view.columns.some(id => id in columnMigrations)) {
        view.columns = view.columns.map(id => columnMigrations[id] ?? id);
      }
    }
    if (!parsed.activeViewId) parsed.activeViewId = 'default';
    if (!parsed.defaultViewId) parsed.defaultViewId = 'default';
    return parsed;
  } catch {
    return createInitialState();
  }
}

export function saveViewState(state: ViewState): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function isBuiltinView(viewId: string): boolean {
  return (BUILTIN_VIEW_IDS as readonly string[]).includes(viewId);
}

// ============================================================
// TEMPLATE HELPERS
// ============================================================

/**
 * Strip list-specific ss:* column IDs from a column list.
 * Templates must only contain portable column IDs (sys:*, mapped:*, dk:*, dkp:*, calc:*).
 */
export function sanitizeTemplateColumns(columns: string[]): string[] {
  return columns.filter(id => !id.startsWith('ss:'));
}

/**
 * Strip calculated fields whose formulas reference ss:* columns without headerHint.
 * Calc fields with headerHint are portable (they can remap); those without are list-specific.
 */
export function sanitizeTemplateCalcFields(fields: CalculatedFieldDef[] | undefined): CalculatedFieldDef[] | undefined {
  if (!fields || fields.length === 0) return undefined;
  const portable = fields.filter(f => {
    const refs = [f.formula.left, ...('literal' in f.formula.right ? [] : [f.formula.right])];
    return refs.every(ref => !ref.columnId.startsWith('ss:') || ref.headerHint);
  });
  return portable.length > 0 ? portable : undefined;
}

// ============================================================
// CROSS-LIST COLUMN REMAPPING
// ============================================================

/**
 * Build a header→index lookup map from effective headers.
 * Shared by column and calc field remapping.
 */
function buildHeaderIndex(effectiveHeaders: string[]): Map<string, number> {
  const map = new Map<string, number>();
  effectiveHeaders.forEach((h, i) => {
    const lower = h.toLowerCase();
    if (!map.has(lower)) map.set(lower, i);
  });
  return map;
}

/** Remap a single ss:* column ID using header metadata. Returns the new ID or undefined to drop. */
function remapSsColumnId(
  colId: string,
  columnMeta: Record<string, string>,
  effectiveHeaders: string[],
  headerToIndex: Map<string, number>,
): string | undefined {
  const storedHeader = columnMeta[colId];
  if (!storedHeader) return colId; // No meta — keep as-is

  const idx = parseInt(colId.slice(3), 10);
  const currentHeader = effectiveHeaders[idx];

  // Header at index N still matches — keep ss:N
  if (currentHeader && currentHeader.toLowerCase() === storedHeader.toLowerCase()) {
    return colId;
  }

  // Header mismatch — find by text
  const remappedIdx = headerToIndex.get(storedHeader.toLowerCase());
  return remappedIdx !== undefined ? `ss:${remappedIdx}` : undefined;
}

/**
 * Remap ss:* column IDs using stored header metadata.
 * When a view is applied to a list with different column order,
 * this finds columns by header text instead of raw index.
 */
export function remapSpreadsheetColumns(
  cols: string[],
  columnMeta: Record<string, string> | undefined,
  effectiveHeaders: string[],
): string[] {
  if (!columnMeta || effectiveHeaders.length === 0) return cols;

  const headerToIndex = buildHeaderIndex(effectiveHeaders);

  return cols.flatMap(colId => {
    if (!colId.startsWith('ss:')) return [colId];
    const remapped = remapSsColumnId(colId, columnMeta, effectiveHeaders, headerToIndex);
    return remapped ? [remapped] : [];
  });
}

/**
 * Remap ss:* column references inside calculated field formulas.
 * Uses the same header-hint mechanism as column remapping.
 * Returns a new array with remapped formulas (or drops fields whose refs can't be resolved).
 */
export function remapCalcFieldRefs(
  fields: CalculatedFieldDef[] | undefined,
  effectiveHeaders: string[],
): CalculatedFieldDef[] | undefined {
  if (!fields || fields.length === 0 || effectiveHeaders.length === 0) return fields;

  const headerToIndex = buildHeaderIndex(effectiveHeaders);

  const remapped = fields.map(field => {
    const { formula } = field;
    const newLeft = remapColumnRef(formula.left, effectiveHeaders, headerToIndex);
    if (!newLeft) return null; // Left operand can't be resolved — drop this field

    let newRight = formula.right;
    if (!('literal' in formula.right)) {
      const r = remapColumnRef(formula.right, effectiveHeaders, headerToIndex);
      if (!r) return null;
      newRight = r;
    }

    // Only create a new object if something changed
    if (newLeft === formula.left && newRight === formula.right) return field;
    return { ...field, formula: { ...formula, left: newLeft, right: newRight } };
  });

  const valid = remapped.filter((f): f is CalculatedFieldDef => f !== null);
  return valid.length > 0 ? valid : undefined;
}

/** Remap an ss:* ColumnRef using its headerHint. Returns null if unresolvable. */
function remapColumnRef(
  ref: import('./calculatedFields').ColumnRef,
  effectiveHeaders: string[],
  headerToIndex: Map<string, number>,
): import('./calculatedFields').ColumnRef | null {
  if (!ref.columnId.startsWith('ss:') || !ref.headerHint) return ref;

  const idx = parseInt(ref.columnId.slice(3), 10);
  const currentHeader = effectiveHeaders[idx];

  // Header still matches — keep as-is
  if (currentHeader && currentHeader.toLowerCase() === ref.headerHint.toLowerCase()) return ref;

  // Find by header text
  const remappedIdx = headerToIndex.get(ref.headerHint.toLowerCase());
  if (remappedIdx === undefined) return null; // Column doesn't exist in this list

  return { ...ref, columnId: `ss:${remappedIdx}` };
}
