'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import { ParsedSpreadsheet } from '@/lib/types';
import { parseTextInput } from '@/lib/textParser';

interface InputMethodDialogProps {
  open: boolean;
  onFileSelected: (file: File) => void;
  onTextParsed: (parsed: ParsedSpreadsheet) => void;
  onCancel: () => void;
}

const ACCEPTED_EXTENSIONS = '.xlsx,.xls,.csv';

export default function InputMethodDialog({
  open,
  onFileSelected,
  onTextParsed,
  onCancel,
}: InputMethodDialogProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState(0);
  const [pasteText, setPasteText] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [pastePreview, setPastePreview] = useState<{ rows: number; cols: number } | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setTab(0);
      setPasteText('');
      setPasteError(null);
      setPastePreview(null);
      setSelectedFile(null);
      setIsDragging(false);
    }
  }, [open]);

  // Debounced paste preview
  useEffect(() => {
    if (tab !== 1 || !pasteText.trim()) {
      setPastePreview(null);
      setPasteError(null);
      return;
    }

    const timer = setTimeout(() => {
      try {
        const result = parseTextInput(pasteText);
        setPastePreview({ rows: result.rows.length, cols: result.headers.length });
        setPasteError(null);
      } catch (e) {
        setPastePreview(null);
        setPasteError(e instanceof Error ? e.message : 'Invalid input');
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [pasteText, tab]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext && ['xlsx', 'xls', 'csv'].includes(ext)) {
        setSelectedFile(file);
      }
    }
    if (e.target) e.target.value = '';
  }, []);

  const handleDropZoneClick = () => {
    fileInputRef.current?.click();
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext && ['xlsx', 'xls', 'csv'].includes(ext)) {
        setSelectedFile(file);
      }
    }
  }, []);

  const handleNext = () => {
    if (tab === 0 && selectedFile) {
      onFileSelected(selectedFile);
    } else if (tab === 1 && pastePreview) {
      try {
        const parsed = parseTextInput(pasteText);
        onTextParsed(parsed);
      } catch {
        // Error already shown via preview
      }
    }
  };

  const canProceed = tab === 0 ? selectedFile !== null : pastePreview !== null;

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: { borderRadius: 3, bgcolor: 'background.paper' },
      }}
    >
      <DialogTitle sx={{ pb: 0, fontWeight: 600 }}>
        {t('inputMethod.dialogTitle')}
      </DialogTitle>

      <DialogContent sx={{ pt: '8px !important', pb: 1 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{ mb: 2, minHeight: 40 }}
        >
          <Tab
            icon={<CloudUploadIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
            label={t('inputMethod.uploadTab')}
            sx={{ textTransform: 'none', minHeight: 40, py: 0 }}
          />
          <Tab
            icon={<ContentPasteIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
            label={t('inputMethod.pasteTab')}
            sx={{ textTransform: 'none', minHeight: 40, py: 0 }}
          />
        </Tabs>

        {/* Upload File tab */}
        {tab === 0 && (
          <Box>
            <Box
              onClick={handleDropZoneClick}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              sx={{
                border: '2px dashed',
                borderColor: isDragging ? 'primary.main' : 'divider',
                borderRadius: 2,
                py: 5,
                px: 3,
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'border-color 0.2s ease, background-color 0.2s ease',
                bgcolor: isDragging ? 'rgba(160, 196, 255, 0.06)' : 'transparent',
                '&:hover': {
                  borderColor: 'primary.main',
                  bgcolor: 'rgba(160, 196, 255, 0.04)',
                },
              }}
            >
              {selectedFile ? (
                <>
                  <InsertDriveFileOutlinedIcon sx={{ fontSize: 40, color: 'primary.main', mb: 1 }} />
                  <Typography variant="body2" color="primary.main" fontWeight={500}>
                    {t('inputMethod.fileSelected', { name: selectedFile.name })}
                  </Typography>
                </>
              ) : (
                <>
                  <CloudUploadIcon sx={{ fontSize: 40, color: 'text.secondary', mb: 1, opacity: 0.5 }} />
                  <Typography variant="body2" color="text.secondary">
                    {t('inputMethod.dropZoneText')}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                    {t('inputMethod.dropZoneFormats')}
                  </Typography>
                </>
              )}
            </Box>

            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS}
              onChange={handleFileInputChange}
              style={{ display: 'none' }}
            />
          </Box>
        )}

        {/* Paste Text tab */}
        {tab === 1 && (
          <Box>
            <TextField
              multiline
              minRows={8}
              maxRows={16}
              fullWidth
              placeholder={t('inputMethod.pasteTextPlaceholder')}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              autoFocus
              variant="outlined"
              sx={{
                '& .MuiOutlinedInput-root': {
                  fontFamily: 'monospace',
                  fontSize: '0.8rem',
                },
              }}
            />

            {pastePreview && (
              <Typography variant="caption" color="success.main" sx={{ mt: 1, display: 'block' }}>
                {t('inputMethod.pastePreview', { rows: pastePreview.rows, cols: pastePreview.cols })}
              </Typography>
            )}

            {pasteError && (
              <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block' }}>
                {pasteError}
              </Typography>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onCancel} sx={{ borderRadius: 20, textTransform: 'none' }}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="contained"
          onClick={handleNext}
          disabled={!canProceed}
          sx={{ borderRadius: 20, textTransform: 'none' }}
        >
          {t('inputMethod.nextButton')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
