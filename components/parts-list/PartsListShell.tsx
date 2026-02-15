'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Box } from '@mui/material';
import { usePartsListState } from '@/hooks/usePartsListState';
import { consumePendingFile, peekPendingFile } from '@/lib/pendingFile';
import PartsListHeader from './PartsListHeader';
import FileUploadZone from './FileUploadZone';
import ColumnMappingDialog from './ColumnMappingDialog';
import PartsListTable from './PartsListTable';
import PartDetailModal from './PartDetailModal';

export default function PartsListShell() {
  const searchParams = useSearchParams();
  // Suppress the empty-state flash while we're about to load a list or process a file
  const willAutoLoad = useRef(
    !!searchParams.get('listId') || !!peekPendingFile(),
  );
  const {
    phase,
    parsedData,
    columnMapping,
    rows,
    validationProgress,
    error,
    listName,
    savedLists,
    modalRow,
    modalSelectedRec,
    modalComparisonAttrs,
    modalComparing,
    handleFileSelected,
    handleColumnMappingConfirmed,
    handleColumnMappingCancelled,
    handleLoadList,
    handleDeleteList,
    handleOpenModal,
    handleCloseModal,
    handleModalSelectRec,
    handleModalBackToRecs,
    handleModalConfirmReplacement,
    handleReset,
  } = usePartsListState();

  // Auto-process pending file or load list from URL param
  useEffect(() => {
    const pending = consumePendingFile();
    if (pending) {
      handleFileSelected(pending.file, pending.name, pending.description);
      willAutoLoad.current = false;
      return;
    }

    const listId = searchParams.get('listId');
    if (listId) {
      handleLoadList(listId);
    }
    willAutoLoad.current = false;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        bgcolor: 'background.default',
      }}
    >
      <PartsListHeader
        onReset={handleReset}
        showReset={phase !== 'empty'}
        listName={listName}
      />

      {phase === 'empty' && !willAutoLoad.current && (
        <FileUploadZone
          onFileSelected={handleFileSelected}
          error={error}
          savedLists={savedLists}
          onLoadList={handleLoadList}
          onDeleteList={handleDeleteList}
        />
      )}

      {(phase === 'validating' || phase === 'results') && (
        <PartsListTable
          rows={rows}
          validationProgress={validationProgress}
          isValidating={phase === 'validating'}
          onRowClick={handleOpenModal}
        />
      )}

      <ColumnMappingDialog
        open={phase === 'mapping'}
        parsedData={parsedData}
        initialMapping={columnMapping}
        onConfirm={handleColumnMappingConfirmed}
        onCancel={handleColumnMappingCancelled}
      />

      <PartDetailModal
        open={modalRow !== null}
        row={modalRow}
        selectedRec={modalSelectedRec}
        comparisonAttrs={modalComparisonAttrs}
        isComparing={modalComparing}
        onClose={handleCloseModal}
        onSelectRec={handleModalSelectRec}
        onBackToRecs={handleModalBackToRecs}
        onConfirmReplacement={handleModalConfirmReplacement}
      />
    </Box>
  );
}
