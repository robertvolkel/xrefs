/**
 * View Configuration Storage
 *
 * Persists multiple named column views in localStorage.
 * Global (not per-list) — the same views apply to all parts lists.
 */

import { DEFAULT_VIEW_COLUMNS } from './columnDefinitions';

// ============================================================
// TYPES
// ============================================================

export interface SavedView {
  id: string;
  name: string;
  columns: string[];
  /** Per-list hidden row indices: { [listId]: number[] } */
  hiddenRows?: Record<string, number[]>;
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
