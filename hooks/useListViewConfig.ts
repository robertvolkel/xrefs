'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  SavedView,
  ViewState,
  isBuiltinView,
  loadViewState,
} from '@/lib/viewConfigStorage';
import { saveListViewConfigsSupabase } from '@/lib/supabasePartsListStorage';

function generateId(): string {
  return `view_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Per-list view configuration hook.
 *
 * Unlike useViewConfig (global templates), this manages views scoped to a
 * specific parts list. Changes are persisted to Supabase per-list.
 *
 * When viewConfigs from Supabase is null (first load of a pre-migration list),
 * the hook copies global templates as the initial per-list views and saves them.
 */
export function useListViewConfig(
  listId: string | null,
  viewConfigs: ViewState | null,
) {
  // Initialize from Supabase data or fall back to global templates
  const [state, setState] = useState<ViewState>(() => {
    if (viewConfigs) return viewConfigs;
    return loadViewState(); // Global templates as fallback
  });

  // Track which listId we've initialized for to avoid re-init on re-renders
  const initializedListRef = useRef<string | null>(null);

  // Re-initialize when a different list loads
  useEffect(() => {
    if (!listId || initializedListRef.current === listId) return;
    initializedListRef.current = listId;

    if (viewConfigs) {
      // Apply the starred default view on list load (not the last-active view)
      const initialState = viewConfigs.defaultViewId && viewConfigs.defaultViewId !== viewConfigs.activeViewId
        ? { ...viewConfigs, activeViewId: viewConfigs.defaultViewId }
        : viewConfigs;
      setState(initialState);
    } else {
      // Migration: copy global templates into this list
      const templates = loadViewState();
      setState(templates);
      // Persist the migration immediately
      saveListViewConfigsSupabase(listId, templates).catch(() => {});
    }
  }, [listId, viewConfigs]);

  // Debounced save to Supabase
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingStateRef = useRef<ViewState | null>(null);

  const persistToSupabase = useCallback((nextState: ViewState) => {
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
  const update = useCallback((updater: (prev: ViewState) => ViewState) => {
    setState(prev => {
      const next = updater(prev);
      persistToSupabase(next);
      return next;
    });
  }, [persistToSupabase]);

  const activeView = useMemo(
    () => state.views.find(v => v.id === state.activeViewId) ?? state.views[0],
    [state.views, state.activeViewId],
  );

  const selectView = useCallback((viewId: string) => {
    update(prev => ({ ...prev, activeViewId: viewId }));
  }, [update]);

  const createView = useCallback((name: string, columns: string[], description?: string, columnMeta?: Record<string, string>, calculatedFields?: import('@/lib/calculatedFields').CalculatedFieldDef[]): SavedView => {
    const newView: SavedView = { id: generateId(), name, columns, ...(description ? { description } : {}), ...(columnMeta ? { columnMeta } : {}), ...(calculatedFields ? { calculatedFields } : {}) };
    update(prev => ({
      ...prev,
      views: [...prev.views, newView],
      activeViewId: newView.id,
    }));
    return newView;
  }, [update]);

  const updateView = useCallback((viewId: string, columns: string[], name?: string, description?: string, columnMeta?: Record<string, string>, calculatedFields?: import('@/lib/calculatedFields').CalculatedFieldDef[]) => {
    update(prev => ({
      ...prev,
      views: prev.views.map(v => v.id === viewId
        ? { ...v, columns, ...(name ? { name } : {}), ...(description !== undefined ? { description } : {}), ...(columnMeta ? { columnMeta } : {}), calculatedFields: calculatedFields ?? v.calculatedFields }
        : v),
    }));
  }, [update]);

  const renameView = useCallback((viewId: string, name: string) => {
    update(prev => ({
      ...prev,
      views: prev.views.map(v => v.id === viewId ? { ...v, name } : v),
    }));
  }, [update]);

  const deleteView = useCallback((viewId: string) => {
    if (isBuiltinView(viewId)) return;
    update(prev => {
      const newViews = prev.views.filter(v => v.id !== viewId);
      return {
        ...prev,
        views: newViews,
        activeViewId: prev.activeViewId === viewId ? 'default' : prev.activeViewId,
        defaultViewId: prev.defaultViewId === viewId ? 'default' : prev.defaultViewId,
      };
    });
  }, [update]);

  const setDefaultView = useCallback((viewId: string) => {
    update(prev => ({ ...prev, defaultViewId: viewId }));
  }, [update]);

  const duplicateView = useCallback((viewId: string, newName: string): SavedView => {
    let newView: SavedView | null = null;
    update(prev => {
      const source = prev.views.find(v => v.id === viewId);
      if (!source) return prev;
      newView = { id: generateId(), name: newName, columns: [...source.columns], ...(source.columnMeta ? { columnMeta: { ...source.columnMeta } } : {}), ...(source.calculatedFields ? { calculatedFields: source.calculatedFields.map(f => ({ ...f })) } : {}) };
      return {
        ...prev,
        views: [...prev.views, newView],
        activeViewId: newView.id,
      };
    });
    return newView ?? state.views[0];
  }, [update, state.views]);

  /** Hide a row in a specific view for a specific list */
  const hideRowInView = useCallback((viewId: string, _listId: string, rowIndex: number) => {
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
  }, [update]);

  /** Get the set of hidden row indices for a view + list combination */
  const getHiddenRows = useCallback((viewId: string, _listId: string): Set<number> => {
    const view = state.views.find(v => v.id === viewId);
    if (!view?.hiddenRows?.[_listId]) return new Set();
    return new Set(view.hiddenRows[_listId]);
  }, [state.views]);

  return {
    activeView,
    views: state.views,
    defaultViewId: state.defaultViewId,
    selectView,
    createView,
    updateView,
    renameView,
    deleteView,
    setDefaultView,
    duplicateView,
    hideRowInView,
    getHiddenRows,
  };
}
