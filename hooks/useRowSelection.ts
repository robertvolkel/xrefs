'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { PartsListRow } from '@/lib/types';

interface RowSelectionResult {
  selectedRows: Set<number>;
  selectionCount: number;
  handleToggleRow: (rowIndex: number) => void;
  handleToggleAll: () => void;
  handleRefreshSelected: () => void;
  clearSelection: () => void;
}

export function useRowSelection(
  rows: PartsListRow[],
  handleRefreshRows: (indices: number[]) => void,
): RowSelectionResult {
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());

  // Clear selection when rows change (e.g., after delete or validation)
  const rowCountRef = useRef(rows.length);
  useEffect(() => {
    if (rows.length !== rowCountRef.current) {
      setSelectedRows(new Set());
      rowCountRef.current = rows.length;
    }
  }, [rows.length]);

  const handleToggleRow = useCallback((rowIndex: number) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(rowIndex)) next.delete(rowIndex);
      else next.add(rowIndex);
      return next;
    });
  }, []);

  const handleToggleAll = useCallback(() => {
    setSelectedRows(prev => {
      const allSelected = rows.length > 0 && rows.every(r => prev.has(r.rowIndex));
      if (allSelected) return new Set();
      return new Set(rows.map(r => r.rowIndex));
    });
  }, [rows]);

  const handleRefreshSelected = useCallback(() => {
    handleRefreshRows([...selectedRows]);
    setSelectedRows(new Set());
  }, [selectedRows, handleRefreshRows]);

  const clearSelection = useCallback(() => {
    setSelectedRows(new Set());
  }, []);

  return {
    selectedRows,
    selectionCount: selectedRows.size,
    handleToggleRow,
    handleToggleAll,
    handleRefreshSelected,
    clearSelection,
  };
}
