'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  SavedView,
  ViewState,
  loadViewState,
  saveViewState,
  isBuiltinView,
} from '@/lib/viewConfigStorage';

function generateId(): string {
  return `view_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useViewConfig() {
  const [state, setState] = useState<ViewState>(() => loadViewState());

  // Helper: update state and persist to localStorage in one step.
  // Uses functional updater to avoid stale closure issues.
  const update = useCallback((updater: (prev: ViewState) => ViewState) => {
    setState(prev => {
      const next = updater(prev);
      saveViewState(next);
      return next;
    });
  }, []);

  const activeView = useMemo(
    () => state.views.find(v => v.id === state.activeViewId) ?? state.views[0],
    [state.views, state.activeViewId],
  );

  const selectView = useCallback((viewId: string) => {
    update(prev => ({ ...prev, activeViewId: viewId }));
  }, [update]);

  const createView = useCallback((name: string, columns: string[], description?: string): SavedView => {
    const newView: SavedView = { id: generateId(), name, columns, ...(description ? { description } : {}) };
    update(prev => ({
      ...prev,
      views: [...prev.views, newView],
      activeViewId: newView.id,
    }));
    return newView;
  }, [update]);

  const updateView = useCallback((viewId: string, columns: string[], name?: string, description?: string) => {
    update(prev => ({
      ...prev,
      views: prev.views.map(v => v.id === viewId
        ? { ...v, columns, ...(name ? { name } : {}), ...(description !== undefined ? { description } : {}) }
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
      newView = { id: generateId(), name: newName, columns: [...source.columns] };
      return {
        ...prev,
        views: [...prev.views, newView],
        activeViewId: newView.id,
      };
    });
    return newView ?? state.views[0];
  }, [update, state.views]);

  /** Hide a row in a specific view for a specific list */
  const hideRowInView = useCallback((viewId: string, listId: string, rowIndex: number) => {
    update(prev => ({
      ...prev,
      views: prev.views.map(v => {
        if (v.id !== viewId) return v;
        const existing = v.hiddenRows?.[listId] ?? [];
        if (existing.includes(rowIndex)) return v;
        return {
          ...v,
          hiddenRows: { ...v.hiddenRows, [listId]: [...existing, rowIndex] },
        };
      }),
    }));
  }, [update]);

  /** Get the set of hidden row indices for a view + list combination */
  const getHiddenRows = useCallback((viewId: string, listId: string): Set<number> => {
    const view = state.views.find(v => v.id === viewId);
    if (!view?.hiddenRows?.[listId]) return new Set();
    return new Set(view.hiddenRows[listId]);
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
