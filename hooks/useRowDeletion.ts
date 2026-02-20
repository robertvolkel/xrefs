'use client';

import { useCallback, useState } from 'react';

interface RowDeletionResult {
  deleteConfirmOpen: boolean;
  pendingDeleteIndices: number[];
  promptDelete: (indices: number[]) => void;
  handleDeleteConfirmed: () => void;
  handleHideFromViewConfirmed: () => void;
  setDeleteConfirmOpen: (open: boolean) => void;
}

export function useRowDeletion(
  handleDeleteRows: (indices: number[]) => void,
  hideRowInView: (viewId: string, listId: string, rowIndex: number) => void,
  activeViewId: string,
  activeListId: string | null,
  clearSelection: () => void,
): RowDeletionResult {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeleteIndices, setPendingDeleteIndices] = useState<number[]>([]);

  const promptDelete = useCallback((indices: number[]) => {
    setPendingDeleteIndices(indices);
    setDeleteConfirmOpen(true);
  }, []);

  const handleDeleteConfirmed = useCallback(() => {
    handleDeleteRows(pendingDeleteIndices);
    clearSelection();
    setDeleteConfirmOpen(false);
  }, [pendingDeleteIndices, handleDeleteRows, clearSelection]);

  const handleHideFromViewConfirmed = useCallback(() => {
    for (const idx of pendingDeleteIndices) {
      hideRowInView(activeViewId, activeListId ?? '', idx);
    }
    clearSelection();
    setDeleteConfirmOpen(false);
  }, [pendingDeleteIndices, hideRowInView, activeViewId, activeListId, clearSelection]);

  return {
    deleteConfirmOpen,
    pendingDeleteIndices,
    promptDelete,
    handleDeleteConfirmed,
    handleHideFromViewConfirmed,
    setDeleteConfirmOpen,
  };
}
