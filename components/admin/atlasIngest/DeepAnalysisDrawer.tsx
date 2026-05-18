'use client';

/**
 * DeepAnalysisDrawer — right-side persistent drawer chrome that wraps any
 * AI Investigation result content. Replaces the inline full-width second-row
 * expansion (which was ~400-600px tall and made the table unscannable when
 * multiple investigations were visible).
 *
 * Engineer flow:
 *   1. Click the Resolved Verdict chip (or the View 👁 icon button) on a row.
 *   2. Drawer opens with verdict, summary, prose, affected products, evidence.
 *   3. Engineer clicks the bucket-specific action button (Accept / Flag / Skip).
 *   4. Drawer auto-closes via the parent's onAfterAction wired to onClose.
 *
 * Single-instance: the parent table holds `drawerParamName` state and clicking
 * a different row's chip swaps the children rather than stacking drawers.
 *
 * Pure chrome: this file imports NOTHING from GlobalUnmappedParamsTable to
 * avoid a circular import (table → drawer → table). The parent owns the
 * content composition.
 */

import { ReactNode } from 'react';
import { Box, Drawer, IconButton, Stack, Typography, Chip } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Short hash UID like "TR-a8f2c1" — header chip the engineer can copy. */
  uid: string | null;
  /** The full paramName string — header title (truncated with ellipsis). */
  paramName: string | null;
  children: ReactNode;
}

export default function DeepAnalysisDrawer({ open, onClose, uid, paramName, children }: Props) {
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: 520, maxWidth: '90vw' } }}
    >
      <Stack sx={{ height: '100%' }}>
        {/* Sticky header — UID chip + paramName + close. Stays visible even
            when the body scrolls (long affected-product lists, deep prose). */}
        <Box
          sx={{
            position: 'sticky',
            top: 0,
            zIndex: 1,
            bgcolor: 'background.paper',
            borderBottom: 1,
            borderColor: 'divider',
            px: 2,
            py: 1.5,
          }}
        >
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
            <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
              {uid && (
                <Chip
                  size="small"
                  label={uid}
                  variant="outlined"
                  sx={{ fontFamily: 'monospace', fontSize: '0.65rem', height: 20, flexShrink: 0 }}
                />
              )}
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={paramName ?? ''}
              >
                {paramName ?? ''}
              </Typography>
            </Stack>
            <IconButton size="small" onClick={onClose} aria-label="Close drawer">
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>
        </Box>

        {/* Scrollable body — caller passes the analysis content as children. */}
        <Box sx={{ flex: 1, overflowY: 'auto', px: 2, py: 1.5 }}>{children}</Box>
      </Stack>
    </Drawer>
  );
}
