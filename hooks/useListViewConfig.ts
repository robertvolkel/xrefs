'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  SavedView,
  ViewState,
  ListViewState,
  MasterView,
  ResolvedView,
  isBuiltinView,
  isLegacyBuiltinView,
} from '@/lib/viewConfigStorage';
import { saveListViewConfigsSupabase } from '@/lib/supabasePartsListStorage';

function generateId(): string {
  return `view_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** The Original (raw) view — always present, dynamically populated */
const RAW_RESOLVED: ResolvedView = {
  id: 'raw',
  name: 'Original',
  columns: [],
  scope: 'builtin',
};

/** Convert a MasterView to a ResolvedView for UI consumption */
function masterToResolved(mv: MasterView): ResolvedView {
  return {
    id: mv.id,
    name: mv.name,
    columns: mv.columns,
    description: mv.description,
    columnMeta: mv.columnMeta,
    calculatedFields: mv.calculatedFields,
    scope: 'master',
  };
}

/** Convert a list-specific SavedView to a ResolvedView */
function listToResolved(sv: SavedView): ResolvedView {
  return { ...sv, scope: 'list' };
}

// ============================================================
// MIGRATION: Old ViewState → ListViewState
// ============================================================

/**
 * Migrate old-format viewConfigs (full ViewState with copied views)
 * to new ListViewState (list-specific views only, master refs by ID).
 */
function migrateToListViewState(
  old: ViewState,
  masterViews: MasterView[],
): ListViewState {
  const masterByName = new Map(masterViews.map(mv => [mv.name.toLowerCase(), mv]));
  const masterById = new Set(masterViews.map(mv => mv.id));

  const listSpecificViews: SavedView[] = [];
  const masterViewOverrides: ListViewState['masterViewOverrides'] = {};
  let activeViewId = old.activeViewId;
  let defaultViewId = old.defaultViewId;

  for (const view of old.views) {
    // Skip builtins (raw is code-generated, default becomes master "Basic")
    if (isLegacyBuiltinView(view.id)) {
      // Remap 'default' → the user's default master view
      if (view.id === 'default') {
        const basicMaster = masterByName.get('basic');
        if (basicMaster) {
          if (activeViewId === 'default') activeViewId = basicMaster.id;
          if (defaultViewId === 'default') defaultViewId = basicMaster.id;
          // Preserve hidden rows
          if (view.hiddenRows && Object.keys(view.hiddenRows).length > 0) {
            masterViewOverrides[basicMaster.id] = { hiddenRows: view.hiddenRows };
          }
        }
      }
      continue;
    }

    // Check if this view matches a master view (by ID or name)
    if (masterById.has(view.id)) {
      // Already a master view reference — preserve hidden rows
      if (view.hiddenRows && Object.keys(view.hiddenRows).length > 0) {
        masterViewOverrides[view.id] = { hiddenRows: view.hiddenRows };
      }
      continue;
    }

    const masterByNameMatch = masterByName.get(view.name.toLowerCase());
    if (masterByNameMatch) {
      // Name matches a master view — remap IDs
      if (activeViewId === view.id) activeViewId = masterByNameMatch.id;
      if (defaultViewId === view.id) defaultViewId = masterByNameMatch.id;
      if (view.hiddenRows && Object.keys(view.hiddenRows).length > 0) {
        masterViewOverrides[masterByNameMatch.id] = { hiddenRows: view.hiddenRows };
      }
      continue;
    }

    // No master match — keep as list-specific
    listSpecificViews.push(view);
  }

  // Ensure activeViewId/defaultViewId point to something valid
  const allValidIds = new Set([
    'raw',
    ...masterViews.map(mv => mv.id),
    ...listSpecificViews.map(v => v.id),
  ]);
  if (!allValidIds.has(activeViewId)) {
    activeViewId = masterViews.find(mv => mv.isDefault)?.id ?? masterViews[0]?.id ?? 'raw';
  }
  if (!allValidIds.has(defaultViewId)) {
    defaultViewId = activeViewId;
  }

  return {
    activeViewId,
    defaultViewId,
    views: listSpecificViews,
    masterViewOverrides: Object.keys(masterViewOverrides).length > 0 ? masterViewOverrides : undefined,
    migrated: true,
  };
}

// ============================================================
// HOOK
// ============================================================

/**
 * Per-list view configuration hook.
 *
 * Manages list-specific views in Supabase and merges them with master views
 * to produce the full available view list for the UI.
 *
 * Master views are read-only from this hook's perspective — mutations
 * are handled by useMasterViews.
 */
export function useListViewConfig(
  listId: string | null,
  viewConfigs: ViewState | ListViewState | null,
  masterViews: MasterView[],
) {
  // Initialize state
  const [state, setState] = useState<ListViewState>(() => {
    if (!viewConfigs) {
      // No saved state — start with empty list-specific views
      const defaultMaster = masterViews.find(mv => mv.isDefault) ?? masterViews[0];
      return {
        activeViewId: defaultMaster?.id ?? 'raw',
        defaultViewId: defaultMaster?.id ?? 'raw',
        views: [],
        migrated: true,
      };
    }
    // Check if already migrated (ListViewState has migrated flag)
    if ('migrated' in viewConfigs && viewConfigs.migrated) {
      return viewConfigs as ListViewState;
    }
    // Old format — migrate
    return migrateToListViewState(viewConfigs as ViewState, masterViews);
  });

  // Track which listId we've initialized for
  const initializedListRef = useRef<string | null>(null);

  // Re-initialize when a different list loads
  useEffect(() => {
    if (!listId || initializedListRef.current === listId) return;
    // Wait for master views to be loaded before initializing
    if (masterViews.length === 0) return;
    initializedListRef.current = listId;

    let newState: ListViewState;

    if (!viewConfigs) {
      // New list — start clean
      const defaultMaster = masterViews.find(mv => mv.isDefault) ?? masterViews[0];
      newState = {
        activeViewId: defaultMaster?.id ?? 'raw',
        defaultViewId: defaultMaster?.id ?? 'raw',
        views: [],
        migrated: true,
      };
      saveListViewConfigsSupabase(listId, newState).catch(() => {});
    } else if ('migrated' in viewConfigs && viewConfigs.migrated) {
      // Already migrated — use as-is, apply default
      newState = viewConfigs as ListViewState;
      if (newState.defaultViewId && newState.defaultViewId !== newState.activeViewId) {
        newState = { ...newState, activeViewId: newState.defaultViewId };
      }
    } else {
      // Old format — migrate
      newState = migrateToListViewState(viewConfigs as ViewState, masterViews);
      saveListViewConfigsSupabase(listId, newState).catch(() => {});
    }

    setState(newState);
  }, [listId, viewConfigs, masterViews]);

  // ----------------------------------------------------------
  // Debounced save to Supabase
  // ----------------------------------------------------------

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingStateRef = useRef<ListViewState | null>(null);

  const persistToSupabase = useCallback((nextState: ListViewState) => {
    if (!listId) return;
    pendingStateRef.current = nextState;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const toSave = pendingStateRef.current;
      if (toSave) {
        saveListViewConfigsSupabase(listId, toSave).catch(() => {});
        pendingStateRef.current = null;
      }
    }, 500);
  }, [listId]);

  // Flush pending save on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      const toSave = pendingStateRef.current;
      if (toSave && listId) {
        saveListViewConfigsSupabase(listId, toSave).catch(() => {});
      }
    };
  }, [listId]);

  // Helper: update state and persist
  const update = useCallback((updater: (prev: ListViewState) => ListViewState) => {
    setState(prev => {
      const next = updater(prev);
      persistToSupabase(next);
      return next;
    });
  }, [persistToSupabase]);

  // ----------------------------------------------------------
  // Merged view list: raw + master views + list-specific views
  // ----------------------------------------------------------

  const views: ResolvedView[] = useMemo(() => [
    RAW_RESOLVED,
    ...masterViews.map(masterToResolved),
    ...state.views.map(listToResolved),
  ], [masterViews, state.views]);

  const activeView: ResolvedView = useMemo(() => {
    return views.find(v => v.id === state.activeViewId) ?? views[0];
  }, [views, state.activeViewId]);

  // ----------------------------------------------------------
  // Actions
  // ----------------------------------------------------------

  const selectView = useCallback((viewId: string) => {
    update(prev => ({ ...prev, activeViewId: viewId }));
  }, [update]);

  /** Create a list-specific view */
  const createView = useCallback((
    name: string,
    columns: string[],
    description?: string,
    columnMeta?: Record<string, string>,
    calculatedFields?: import('@/lib/calculatedFields').CalculatedFieldDef[],
  ): SavedView => {
    const newView: SavedView = {
      id: generateId(),
      name,
      columns,
      ...(description ? { description } : {}),
      ...(columnMeta ? { columnMeta } : {}),
      ...(calculatedFields ? { calculatedFields } : {}),
    };
    update(prev => ({
      ...prev,
      views: [...prev.views, newView],
      activeViewId: newView.id,
    }));
    return newView;
  }, [update]);

  /** Update a list-specific view */
  const updateView = useCallback((
    viewId: string,
    columns: string[],
    name?: string,
    description?: string,
    columnMeta?: Record<string, string>,
    calculatedFields?: import('@/lib/calculatedFields').CalculatedFieldDef[],
  ) => {
    update(prev => ({
      ...prev,
      views: prev.views.map(v => v.id === viewId
        ? {
            ...v,
            columns,
            ...(name ? { name } : {}),
            ...(description !== undefined ? { description } : {}),
            ...(columnMeta ? { columnMeta } : {}),
            calculatedFields: calculatedFields ?? v.calculatedFields,
          }
        : v),
    }));
  }, [update]);

  /** Delete a list-specific view */
  const deleteView = useCallback((viewId: string) => {
    if (isBuiltinView(viewId)) return;
    update(prev => {
      const newViews = prev.views.filter(v => v.id !== viewId);
      const fallbackId = masterViews.find(mv => mv.isDefault)?.id ?? masterViews[0]?.id ?? 'raw';
      return {
        ...prev,
        views: newViews,
        activeViewId: prev.activeViewId === viewId ? fallbackId : prev.activeViewId,
        defaultViewId: prev.defaultViewId === viewId ? fallbackId : prev.defaultViewId,
      };
    });
  }, [update, masterViews]);

  /** Set the per-list default (starred) view */
  const setDefaultView = useCallback((viewId: string) => {
    update(prev => ({ ...prev, defaultViewId: viewId }));
  }, [update]);

  /** Hide a row in a view for this list */
  const hideRowInView = useCallback((viewId: string, _listId: string, rowIndex: number) => {
    // Check if this is a master view — store in overrides
    const isMaster = masterViews.some(mv => mv.id === viewId);

    if (isMaster) {
      update(prev => {
        const overrides = prev.masterViewOverrides ?? {};
        const viewOverride = overrides[viewId] ?? {};
        const existing = viewOverride.hiddenRows?.[_listId] ?? [];
        if (existing.includes(rowIndex)) return prev;
        return {
          ...prev,
          masterViewOverrides: {
            ...overrides,
            [viewId]: {
              ...viewOverride,
              hiddenRows: { ...viewOverride.hiddenRows, [_listId]: [...existing, rowIndex] },
            },
          },
        };
      });
    } else {
      // List-specific view — store on the view itself
      update(prev => ({
        ...prev,
        views: prev.views.map(v => {
          if (v.id !== viewId) return v;
          const existing = v.hiddenRows?.[_listId] ?? [];
          if (existing.includes(rowIndex)) return v;
          return {
            ...v,
            hiddenRows: { ...v.hiddenRows, [_listId]: [...existing, rowIndex] },
          };
        }),
      }));
    }
  }, [update, masterViews]);

  /** Get hidden rows for a view on this list */
  const getHiddenRows = useCallback((viewId: string, _listId: string): Set<number> => {
    // Check master view overrides first
    const override = state.masterViewOverrides?.[viewId];
    if (override?.hiddenRows?.[_listId]) {
      return new Set(override.hiddenRows[_listId]);
    }
    // Then check list-specific views
    const view = state.views.find(v => v.id === viewId);
    if (!view?.hiddenRows?.[_listId]) return new Set();
    return new Set(view.hiddenRows[_listId]);
  }, [state.views, state.masterViewOverrides]);

  return {
    activeView,
    views,
    defaultViewId: state.defaultViewId,
    selectView,
    createView,
    updateView,
    deleteView,
    setDefaultView,
    hideRowInView,
    getHiddenRows,
  };
}
