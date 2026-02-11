'use client';

import { Box } from '@mui/material';
import { usePartsListState } from '@/hooks/usePartsListState';
import PartsListHeader from './PartsListHeader';
import FileUploadZone from './FileUploadZone';
import ColumnMappingDialog from './ColumnMappingDialog';
import PartsListTable from './PartsListTable';
import PartDetailModal from './PartDetailModal';

export default function PartsListShell() {
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

      {phase === 'empty' && (
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
