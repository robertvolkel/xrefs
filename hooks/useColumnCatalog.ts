'use client';

import { useMemo } from 'react';
import { ColumnMapping, PartsListRow } from '@/lib/types';
import {
  buildAvailableColumns,
  collectParameterKeys,
  ColumnDefinition,
} from '@/lib/columnDefinitions';

interface ColumnCatalogResult {
  parameterKeys: Map<string, string>;
  effectiveHeaders: string[];
  availableColumns: ColumnDefinition[];
  inferredMapping: ColumnMapping | null;
}

export function useColumnCatalog(
  rows: PartsListRow[],
  columnMapping: ColumnMapping | null,
  spreadsheetHeaders: string[],
): ColumnCatalogResult {
  const parameterKeys = useMemo(() => collectParameterKeys(rows), [rows]);

  // If spreadsheetHeaders is empty but rows have rawCells, infer column count
  // and recover labels from the column mapping where possible.
  // (handles lists saved before headers were properly persisted)
  const effectiveHeaders = useMemo(() => {
    if (spreadsheetHeaders.length > 0) return spreadsheetHeaders;
    const maxCols = rows.reduce((max, r) => Math.max(max, r.rawCells?.length ?? 0), 0);
    if (maxCols === 0) return [];

    // Try to recover labels from the inferred mapping
    const mapping = columnMapping ?? (() => {
      const row = rows.find(r => r.rawMpn && r.rawCells?.length);
      if (!row) return null;
      return {
        mpnColumn: row.rawCells.findIndex(c => c === row.rawMpn),
        manufacturerColumn: row.rawCells.findIndex(c => c === row.rawManufacturer),
        descriptionColumn: row.rawCells.findIndex(c => c === row.rawDescription),
      };
    })();

    return Array.from({ length: maxCols }, (_, i) => {
      if (mapping?.mpnColumn === i) return 'MPN';
      if (mapping?.manufacturerColumn === i) return 'Manufacturer';
      if (mapping?.descriptionColumn === i) return 'Description';
      return `Column ${i + 1}`;
    });
  }, [spreadsheetHeaders, rows, columnMapping]);

  const availableColumns = useMemo(() => {
    const all = buildAvailableColumns(effectiveHeaders, parameterKeys);
    // Track max content length and non-empty status per spreadsheet column
    const nonEmptyIndices = new Set<number>();
    const maxContentLen = new Map<number, number>();
    for (const row of rows) {
      if (!row.rawCells) continue;
      row.rawCells.forEach((val, i) => {
        if (val !== undefined && val !== null && val.toString().trim() !== '') {
          nonEmptyIndices.add(i);
          const len = val.toString().length;
          maxContentLen.set(i, Math.max(maxContentLen.get(i) ?? 0, len));
        }
      });
    }
    return all
      .filter(col =>
        col.source !== 'spreadsheet' || (col.spreadsheetIndex !== undefined && nonEmptyIndices.has(col.spreadsheetIndex)),
      )
      .map(col => {
        if (col.source !== 'spreadsheet' || col.spreadsheetIndex === undefined) return col;
        // Size spreadsheet columns based on actual content width
        const contentLen = maxContentLen.get(col.spreadsheetIndex) ?? 0;
        const headerLen = col.label.length;
        const maxLen = Math.max(contentLen, headerLen);
        let width: string;
        if (maxLen <= 5) width = '65px';
        else if (maxLen <= 10) width = '100px';
        else if (maxLen <= 20) width = '160px';
        else if (maxLen <= 35) width = '220px';
        else width = '280px';
        return { ...col, defaultWidth: width };
      });
  }, [effectiveHeaders, parameterKeys, rows]);

  // Infer the column mapping from row data (needed when loading saved lists
  // where columnMapping isn't persisted). Matches rawMpn/rawManufacturer/rawDescription
  // back to their rawCells index.
  const inferredMapping = useMemo(() => {
    if (columnMapping) return columnMapping;
    const row = rows.find(r => r.rawMpn && r.rawCells?.length);
    if (!row) return null;
    return {
      mpnColumn: row.rawCells.findIndex(c => c === row.rawMpn),
      manufacturerColumn: row.rawManufacturer
        ? row.rawCells.findIndex(c => c === row.rawManufacturer)
        : -1,
      descriptionColumn: row.rawCells.findIndex(c => c === row.rawDescription),
    };
  }, [columnMapping, rows]);

  return {
    parameterKeys,
    effectiveHeaders,
    availableColumns,
    inferredMapping,
  };
}
