'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { consumePendingFile, peekPendingFile } from '@/lib/pendingFile';
import { ParsedSpreadsheet, PartsListRow } from '@/lib/types';
import { SavedView } from '@/lib/viewConfigStorage';

interface AutoLoadParams {
  phase: string;
  rows: PartsListRow[];
  activeListId: string | null;
  listDefaultViewId: string | null;
  views: SavedView[];
  selectView: (viewId: string) => void;
  handleFileSelected: (file: File, name?: string, description?: string, customer?: string, defaultViewId?: string) => void;
  handleParsedDataReady: (parsed: ParsedSpreadsheet, name?: string, description?: string, customer?: string, defaultViewId?: string) => void;
  handleLoadList: (id: string) => void;
  handleRefreshRows: (indices: number[]) => void;
}

/**
 * Side-effect hook: handles auto-loading from pending file or URL params,
 * deferred full refresh, redirect on empty, and per-list default view application.
 */
export function usePartsListAutoLoad({
  phase,
  rows,
  activeListId,
  listDefaultViewId,
  views,
  selectView,
  handleFileSelected,
  handleParsedDataReady,
  handleLoadList,
  handleRefreshRows,
}: AutoLoadParams) {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Guard: will auto-load prevent premature redirect?
  const willAutoLoad = useRef(
    !!searchParams.get('listId') || !!peekPendingFile(),
  );

  // Guard against React Strict Mode double-invoking the effect.
  // consumePendingFile() is destructive (nullifies the singleton), so the
  // second invocation would find nothing and incorrectly clear willAutoLoad.
  const autoLoadFired = useRef(false);

  // Flag for auto-refreshing all rows after load (e.g. currency change)
  const pendingRefreshAll = useRef(false);

  // Auto-process pending file or load list from URL param
  useEffect(() => {
    if (autoLoadFired.current) return;
    autoLoadFired.current = true;

    const pending = consumePendingFile();
    if (pending) {
      if (pending.parsedData) {
        handleParsedDataReady(pending.parsedData, pending.name, pending.description, pending.customer, pending.defaultViewId);
      } else if (pending.file) {
        handleFileSelected(pending.file, pending.name, pending.description, pending.customer, pending.defaultViewId);
      }
      return;
    }

    const listId = searchParams.get('listId');
    if (listId) {
      if (searchParams.get('refresh') === 'true') {
        pendingRefreshAll.current = true;
      }
      handleLoadList(listId);
      return;
    }

    // Nothing to auto-load — clear the flag so the redirect effect can fire
    willAutoLoad.current = false;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Trigger full refresh once list loads with rows available
  useEffect(() => {
    if (pendingRefreshAll.current && phase === 'results' && rows.length > 0) {
      pendingRefreshAll.current = false;
      handleRefreshRows(rows.map(r => r.rowIndex));
    }
  }, [phase, rows, handleRefreshRows]);

  // Redirect to /lists whenever phase falls back to 'empty' (e.g. cancel mapping)
  useEffect(() => {
    if (phase !== 'empty') {
      // Phase moved past empty — auto-load succeeded, safe to clear the flag
      willAutoLoad.current = false;
      return;
    }
    if (!willAutoLoad.current) {
      router.replace('/lists');
    }
  }, [phase, router]);

  // Apply per-list default view when a list loads
  const appliedListViewRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeListId || !listDefaultViewId) return;
    // Only apply once per list load (avoid re-applying on every render)
    if (appliedListViewRef.current === activeListId) return;
    // Verify the view still exists
    if (views.some(v => v.id === listDefaultViewId)) {
      appliedListViewRef.current = activeListId;
      selectView(listDefaultViewId);
    }
  }, [activeListId, listDefaultViewId, views, selectView]);
}
