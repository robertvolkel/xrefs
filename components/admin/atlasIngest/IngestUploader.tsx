'use client';

/**
 * IngestUploader — drag-drop zone for Atlas manufacturer JSON files.
 * Supports both individual files and folders (via webkitdirectory on the file input).
 *
 * On submit, posts multipart form-data to /api/admin/atlas/ingest/upload.
 * The route validates the filename pattern, writes to data/atlas/, and
 * returns staged metadata including isNewManufacturer flags.
 */

import { useCallback, useRef, useState } from 'react';
import { Box, Button, LinearProgress, Stack, Typography, Paper } from '@mui/material';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import type { StagedFile } from './types';

interface Props {
  onUploadComplete: (staged: StagedFile[], skipped: Array<{ filename: string; reason: string }>) => void | Promise<void>;
  disabled?: boolean;
}

export default function IngestUploader({ onUploadComplete, disabled }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');

  const handleFiles = useCallback(async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((f) => f.name.endsWith('.json'));
    if (files.length === 0) return;

    setUploading(true);
    setUploadProgress(`Uploading ${files.length} file(s)…`);

    try {
      // Chunked upload — keeps each request well under the configured
      // middlewareClientMaxBodySize cap (256MB) and gives better progress
      // feedback during folder uploads. With median file size ~70KB and
      // worst case ~3.5MB, 10 files per chunk averages ~700KB, max ~35MB.
      const CHUNK_SIZE = 10;
      const allStaged: StagedFile[] = [];
      const allSkipped: Array<{ filename: string; reason: string }> = [];

      for (let i = 0; i < files.length; i += CHUNK_SIZE) {
        const chunk = files.slice(i, i + CHUNK_SIZE);
        setUploadProgress(`Uploading ${Math.min(i + CHUNK_SIZE, files.length)} / ${files.length}…`);

        const fd = new FormData();
        for (const f of chunk) fd.append('files', f, f.name);

        const res = await fetch('/api/admin/atlas/ingest/upload', { method: 'POST', body: fd });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || `Upload failed (${res.status})`);
        }
        allStaged.push(...(json.stagedFiles ?? []));
        allSkipped.push(...(json.skipped ?? []));
      }

      await onUploadComplete(allStaged, allSkipped);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      // Surface error via skipped metadata so parent can show a snackbar
      onUploadComplete([], [{ filename: '(upload)', reason: msg }]);
    } finally {
      setUploading(false);
      setUploadProgress('');
    }
  }, [onUploadComplete]);

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled || uploading) return;

    // Browser drag-drop: support both files and folder traversal where supported.
    const items = e.dataTransfer.items;
    if (items && items.length > 0 && typeof items[0].webkitGetAsEntry === 'function') {
      const allFiles: File[] = [];
      const traversals: Promise<void>[] = [];
      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry();
        if (entry) traversals.push(traverseEntry(entry, allFiles));
      }
      await Promise.all(traversals);
      await handleFiles(allFiles);
    } else {
      await handleFiles(e.dataTransfer.files);
    }
  }, [disabled, uploading, handleFiles]);

  return (
    <Paper
      variant="outlined"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      sx={{
        p: 4,
        textAlign: 'center',
        borderStyle: 'dashed',
        borderWidth: 2,
        borderColor: dragOver ? 'primary.main' : 'divider',
        bgcolor: dragOver ? 'action.hover' : 'transparent',
        transition: 'all 0.15s ease',
        cursor: disabled || uploading ? 'not-allowed' : 'copy',
        opacity: disabled ? 0.5 : 1,
        mb: 2,
      }}
    >
      <CloudUploadOutlinedIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
      <Typography variant="h6" sx={{ mb: 0.5 }}>
        Drop Atlas JSON files here
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Filename pattern: <code>mfr_&#123;ID&#125;_&#123;ENGLISH&#125;_&#123;CHINESE&#125;_params.json</code>
      </Typography>

      <Stack direction="row" spacing={1} justifyContent="center">
        <Button
          variant="outlined"
          size="small"
          startIcon={<CloudUploadOutlinedIcon />}
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading}
        >
          Select files
        </Button>
        <Button
          variant="outlined"
          size="small"
          startIcon={<FolderOpenOutlinedIcon />}
          onClick={() => folderInputRef.current?.click()}
          disabled={disabled || uploading}
        >
          Select folder
        </Button>
      </Stack>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />
      <input
        ref={folderInputRef}
        type="file"
        // @ts-expect-error — webkitdirectory is non-standard but widely supported
        webkitdirectory=""
        directory=""
        multiple
        style={{ display: 'none' }}
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />

      {uploading && (
        <Box sx={{ mt: 2 }}>
          <LinearProgress />
          <Typography variant="caption" color="text.secondary">{uploadProgress}</Typography>
        </Box>
      )}
    </Paper>
  );
}

// ─── Recursive folder traversal for drag-drop directories ────
async function traverseEntry(entry: FileSystemEntry, out: File[]): Promise<void> {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    return new Promise<void>((resolve) => {
      fileEntry.file((f) => {
        if (f.name.endsWith('.json')) out.push(f);
        resolve();
      });
    });
  }
  if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry;
    const reader = dirEntry.createReader();
    return new Promise<void>((resolve) => {
      const readBatch = () => {
        reader.readEntries(async (entries) => {
          if (entries.length === 0) return resolve();
          for (const e of entries) await traverseEntry(e, out);
          readBatch(); // FileSystemDirectoryReader returns at most 100 entries per call
        });
      };
      readBatch();
    });
  }
}
