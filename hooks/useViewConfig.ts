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

  const persist = useCallback((newState: ViewState) => {
    setState(newState);
    saveViewState(newState);
  }, []);

  const activeView = useMemo(
    () => state.views.find(v => v.id === state.activeViewId) ?? state.views[0],
    [state.views, state.activeViewId],
  );

  const selectView = useCallback((viewId: string) => {
    persist({ ...state, activeViewId: viewId });
  }, [state, persist]);

  const createView = useCallback((name: string, columns: string[]): SavedView => {
    const newView: SavedView = { id: generateId(), name, columns };
    persist({
      ...state,
      views: [...state.views, newView],
      activeViewId: newView.id,
    });
    return newView;
  }, [state, persist]);

  const updateView = useCallback((viewId: string, columns: string[], name?: string) => {
    persist({
      ...state,
      views: state.views.map(v => v.id === viewId ? { ...v, columns, ...(name ? { name } : {}) } : v),
    });
  }, [state, persist]);

  const renameView = useCallback((viewId: string, name: string) => {
    persist({
      ...state,
      views: state.views.map(v => v.id === viewId ? { ...v, name } : v),
    });
  }, [state, persist]);

  const deleteView = useCallback((viewId: string) => {
    if (isBuiltinView(viewId)) return;
    const newViews = state.views.filter(v => v.id !== viewId);
    const newActive = state.activeViewId === viewId ? 'default' : state.activeViewId;
    const newDefault = state.defaultViewId === viewId ? 'default' : state.defaultViewId;
    persist({
      ...state,
      views: newViews,
      activeViewId: newActive,
      defaultViewId: newDefault,
    });
  }, [state, persist]);

  const setDefaultView = useCallback((viewId: string) => {
    persist({ ...state, defaultViewId: viewId });
  }, [state, persist]);

  const duplicateView = useCallback((viewId: string, newName: string): SavedView => {
    const source = state.views.find(v => v.id === viewId);
    if (!source) return state.views[0];
    const newView: SavedView = { id: generateId(), name: newName, columns: [...source.columns] };
    persist({
      ...state,
      views: [...state.views, newView],
      activeViewId: newView.id,
    });
    return newView;
  }, [state, persist]);

  /** Hide a row in a specific view for a specific list */
  const hideRowInView = useCallback((viewId: string, listId: string, rowIndex: number) => {
    persist({
      ...state,
      views: state.views.map(v => {
        if (v.id !== viewId) return v;
        const existing = v.hiddenRows?.[listId] ?? [];
        if (existing.includes(rowIndex)) return v;
        return {
          ...v,
          hiddenRows: { ...v.hiddenRows, [listId]: [...existing, rowIndex] },
        };
      }),
    });
  }, [state, persist]);

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
