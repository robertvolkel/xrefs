'use client';

import { useRef, useState, useCallback } from 'react';
import {
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  IconButton,
  Typography,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DescriptionIcon from '@mui/icons-material/Description';
import { PartsListSummary } from '@/lib/partsListStorage';
import { useTranslation } from 'react-i18next';

interface FileUploadZoneProps {
  onFileSelected: (file: File) => void;
  error: string | null;
  savedLists: PartsListSummary[];
  onLoadList: (id: string) => void;
  onDeleteList: (id: string) => void;
}

export default function FileUploadZone({
  onFileSelected,
  error,
  savedLists,
  onLoadList,
  onDeleteList,
}: FileUploadZoneProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = useCallback(
    (file: File) => {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (!ext || !['xlsx', 'xls', 'csv'].includes(ext)) {
        return;
      }
      onFileSelected(file);
    },
    [onFileSelected]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        px: 3,
      }}
    >
      <Typography variant="h5" color="text.primary" sx={{ fontWeight: 600, mb: 1 }}>
        {t('fileUpload.heading')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
        {t('fileUpload.subheading')}
      </Typography>

      <Box
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        sx={{
          border: '2px dashed',
          borderColor: isDragging ? 'primary.main' : 'divider',
          borderRadius: 3,
          p: 6,
          width: '100%',
          maxWidth: 520,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          bgcolor: isDragging ? 'rgba(160, 196, 255, 0.05)' : 'transparent',
          '&:hover': {
            borderColor: 'primary.main',
            bgcolor: 'rgba(160, 196, 255, 0.05)',
          },
        }}
      >
        <CloudUploadIcon sx={{ fontSize: 48, color: 'text.secondary' }} />
        <Button variant="contained" size="large" startIcon={<CloudUploadIcon />}>
          {t('fileUpload.buttonText')}
        </Button>
        <Typography variant="caption" color="text.secondary">
          {t('fileUpload.supportedFormats')}
        </Typography>
      </Box>

      {error && (
        <Typography variant="body2" color="error" sx={{ mt: 2 }}>
          {error}
        </Typography>
      )}

      {savedLists.length > 0 && (
        <Box sx={{ mt: 5, width: '100%', maxWidth: 520 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, fontWeight: 500 }}>
            {t('fileUpload.previousLists')}
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {savedLists.map((list) => (
              <Card
                key={list.id}
                variant="outlined"
                sx={{ bgcolor: 'transparent', borderColor: 'divider' }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <CardActionArea onClick={() => onLoadList(list.id)} sx={{ flex: 1 }}>
                    <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <DescriptionIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {list.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {t('fileUpload.listSummary', { resolved: list.resolvedCount, total: list.totalRows, date: new Date(list.updatedAt).toLocaleDateString() })}
                          </Typography>
                        </Box>
                      </Box>
                    </CardContent>
                  </CardActionArea>
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteList(list.id);
                    }}
                    sx={{ mr: 1, color: 'text.secondary' }}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Card>
            ))}
          </Box>
        </Box>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleInputChange}
        style={{ display: 'none' }}
      />
    </Box>
  );
}
