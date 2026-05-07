'use client';

import { useMemo } from 'react';
import {
  Autocomplete, Box, Button, Chip, Stack, TextField, InputAdornment, ToggleButton, ToggleButtonGroup, Tooltip,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import SwapHorizOutlinedIcon from '@mui/icons-material/SwapHorizOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HistoryToggleOffIcon from '@mui/icons-material/HistoryToggleOff';
import NoteAltIcon from '@mui/icons-material/NoteAlt';
import type { GlobalUnmappedParam, StatusFilter } from './types';

export type TriageMode = 'synonyms' | 'auto_flagged' | 'all';

export interface TriageFilters {
  search: string;
  mfrSlugs: string[];
  families: string[];
  minProductCount: number;
  /** When true, show only rows with team notes attached. The "needs to be
   *  revisited" workflow — engineers note params during triage and come
   *  back later to finish the mapping. */
  hasNote: boolean;
}

export const EMPTY_FILTERS: TriageFilters = {
  search: '',
  mfrSlugs: [],
  families: [],
  minProductCount: 0,
  hasNote: false,
};

interface Props {
  rows: GlobalUnmappedParam[];
  filters: TriageFilters;
  onChange: (next: TriageFilters) => void;
  filteredCount: number;
  totalCount: number;
  mode: TriageMode;
  onModeChange: (next: TriageMode) => void;
  /** Server-computed bucket counts so the chip badges show how many rows
   *  exist in each mode without requiring per-mode refetches. */
  triageCounts?: { synonyms: number; autoFlagged: number; total: number };
  status: StatusFilter;
  onStatusChange: (next: StatusFilter) => void;
  /** Open / Accepted / Undone counts. Open = working queue; Accepted = active
   *  override; Undone = inactive (reverted) override. */
  statusCounts?: { open: number; accepted: number; undone: number };
  /** Total number of params with team notes attached. Surfaced as a chip
   *  badge on the "Has note" toggle so engineers see at a glance how many
   *  rows are pending follow-up. */
  noteCount?: number;
}

export default function TriageFilterBar({ rows, filters, onChange, filteredCount, totalCount, mode, onModeChange, triageCounts, status, onStatusChange, statusCounts, noteCount }: Props) {
  // Build option lists from the unfiltered row set so the dropdowns stay
  // stable as the user toggles filters (otherwise selecting a filter would
  // remove its own option from the list).
  const mfrOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) {
      for (const m of r.affectedManufacturers ?? []) {
        if (!map.has(m.slug)) map.set(m.slug, m.name);
      }
    }
    return [...map.entries()]
      .map(([slug, name]) => ({ slug, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const familyOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.dominantFamily) set.add(r.dominantFamily);
    return [...set].sort();
  }, [rows]);

  const hasActive =
    filters.search.trim().length > 0 ||
    filters.mfrSlugs.length > 0 ||
    filters.families.length > 0 ||
    filters.minProductCount > 0 ||
    filters.hasNote;

  const synonymsCount = triageCounts?.synonyms ?? 0;
  const autoFlaggedCount = triageCounts?.autoFlagged ?? 0;
  const allCount = triageCounts?.total ?? (synonymsCount + autoFlaggedCount);

  return (
    <Box sx={{ mb: 2, p: 1.5, bgcolor: 'background.paper', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
      {/* View mode chip group — switches the queue between the synonym
          mapping workflow (default) and the auto-flagged misclassification
          review queue. Modes are server-side: changing the mode triggers
          a refetch via the parent's URL contract. */}
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5, flexWrap: 'wrap' }}>
        <ToggleButtonGroup
          size="small"
          value={mode}
          exclusive
          onChange={(_, next) => { if (next) onModeChange(next as TriageMode); }}
          aria-label="Triage view mode"
        >
          <ToggleButton value="synonyms" aria-label="Open synonyms">
            <Tooltip title="Unmapped parameters waiting for canonical attribute mapping. Default workflow." placement="top">
              <Stack direction="row" spacing={0.75} alignItems="center">
                <SwapHorizOutlinedIcon fontSize="small" />
                <Box component="span" sx={{ fontSize: '0.75rem' }}>Open synonyms</Box>
                <Chip size="small" label={synonymsCount} sx={{ height: 18, fontSize: '0.65rem', bgcolor: 'action.selected' }} />
              </Stack>
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="auto_flagged" aria-label="Auto-flagged misclassifications">
            <Tooltip
              title="Rows where the param name belongs to a different family — almost certainly upstream misclassification. Click Confirm to flag for investigation, Revert if it's actually correct here."
              placement="top"
            >
              <Stack direction="row" spacing={0.75} alignItems="center">
                <FlagOutlinedIcon fontSize="small" sx={{ color: autoFlaggedCount > 0 ? 'error.main' : undefined }} />
                <Box component="span" sx={{ fontSize: '0.75rem' }}>Auto-flagged misclassifications</Box>
                <Chip
                  size="small"
                  label={autoFlaggedCount}
                  sx={{
                    height: 18,
                    fontSize: '0.65rem',
                    bgcolor: autoFlaggedCount > 0 ? 'error.dark' : 'action.selected',
                    color: autoFlaggedCount > 0 ? 'error.contrastText' : undefined,
                    fontWeight: autoFlaggedCount > 0 ? 700 : 400,
                  }}
                />
              </Stack>
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="all" aria-label="All rows">
            <Tooltip title="Both modes combined — diagnostic view." placement="top">
              <Stack direction="row" spacing={0.75} alignItems="center">
                <VisibilityOutlinedIcon fontSize="small" />
                <Box component="span" sx={{ fontSize: '0.75rem' }}>All</Box>
                <Chip size="small" label={allCount} sx={{ height: 18, fontSize: '0.65rem', bgcolor: 'action.selected' }} />
              </Stack>
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {/* Status filter — orthogonal to mode. 'Open' is the working queue
          (no override yet); 'Accepted' / 'Undone' surface the audit trail
          of past Accepts; 'All' shows everything. */}
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5, flexWrap: 'wrap' }}>
        <ToggleButtonGroup
          size="small"
          value={status}
          exclusive
          onChange={(_, next) => { if (next) onStatusChange(next as StatusFilter); }}
          aria-label="Triage status filter"
        >
          <ToggleButton value="open" aria-label="Open — un-accepted">
            <Tooltip title="Params that haven't been accepted yet. Default working queue." placement="top">
              <Stack direction="row" spacing={0.75} alignItems="center">
                <RadioButtonUncheckedIcon fontSize="small" />
                <Box component="span" sx={{ fontSize: '0.75rem' }}>Open</Box>
                <Chip size="small" label={statusCounts?.open ?? 0} sx={{ height: 18, fontSize: '0.65rem', bgcolor: 'action.selected' }} />
              </Stack>
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="accepted" aria-label="Accepted">
            <Tooltip title="Params with active dictionary overrides. Inline Revert available per row." placement="top">
              <Stack direction="row" spacing={0.75} alignItems="center">
                <CheckCircleOutlineIcon fontSize="small" sx={{ color: 'success.main' }} />
                <Box component="span" sx={{ fontSize: '0.75rem' }}>Accepted</Box>
                <Chip size="small" label={statusCounts?.accepted ?? 0} sx={{ height: 18, fontSize: '0.65rem', bgcolor: 'action.selected' }} />
              </Stack>
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="undone" aria-label="Undone — reverted">
            <Tooltip title="Params with previously-accepted overrides that were later reverted. Audit trail." placement="top">
              <Stack direction="row" spacing={0.75} alignItems="center">
                <HistoryToggleOffIcon fontSize="small" />
                <Box component="span" sx={{ fontSize: '0.75rem' }}>Undone</Box>
                <Chip size="small" label={statusCounts?.undone ?? 0} sx={{ height: 18, fontSize: '0.65rem', bgcolor: 'action.selected' }} />
              </Stack>
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="all" aria-label="All status">
            <Tooltip title="Open + Accepted + Undone combined." placement="top">
              <Stack direction="row" spacing={0.75} alignItems="center">
                <VisibilityOutlinedIcon fontSize="small" />
                <Box component="span" sx={{ fontSize: '0.75rem' }}>All</Box>
                <Chip
                  size="small"
                  label={(statusCounts?.open ?? 0) + (statusCounts?.accepted ?? 0) + (statusCounts?.undone ?? 0)}
                  sx={{ height: 18, fontSize: '0.65rem', bgcolor: 'action.selected' }}
                />
              </Stack>
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}>
        {/* Has-note toggle. Placed at the LEFT end of the row (far from
            "Clear all" on the right) so the affordances can't be visually
            conflated. Notes themselves are managed strictly per-row via
            the note popover; this toggle only filters which rows show. */}
        <Tooltip title={`Show only rows with a team note attached. ${noteCount ?? 0} note${noteCount === 1 ? '' : 's'} total.`}>
          <ToggleButton
            size="small"
            value="hasNote"
            selected={filters.hasNote}
            onChange={() => onChange({ ...filters, hasNote: !filters.hasNote })}
            sx={{ whiteSpace: 'nowrap', px: 1.25 }}
          >
            <Stack direction="row" spacing={0.75} alignItems="center">
              <NoteAltIcon fontSize="small" sx={{ color: filters.hasNote ? 'primary.main' : undefined }} />
              <Box component="span" sx={{ fontSize: '0.75rem' }}>Has note</Box>
              {(noteCount ?? 0) > 0 && (
                <Chip
                  size="small"
                  label={noteCount}
                  sx={{ height: 18, fontSize: '0.65rem', bgcolor: filters.hasNote ? 'primary.main' : 'action.selected', color: filters.hasNote ? 'primary.contrastText' : undefined }}
                />
              )}
            </Stack>
          </ToggleButton>
        </Tooltip>

        <TextField
          size="small"
          placeholder="Search raw attribute name…"
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          sx={{ minWidth: 240, flex: 1 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />
              </InputAdornment>
            ),
            endAdornment: filters.search ? (
              <InputAdornment position="end">
                <ClearIcon
                  fontSize="small"
                  sx={{ cursor: 'pointer', color: 'text.secondary' }}
                  onClick={() => onChange({ ...filters, search: '' })}
                />
              </InputAdornment>
            ) : null,
          }}
        />

        <Autocomplete
          multiple
          size="small"
          options={mfrOptions}
          getOptionLabel={(o) => o.name}
          isOptionEqualToValue={(a, b) => a.slug === b.slug}
          value={mfrOptions.filter((o) => filters.mfrSlugs.includes(o.slug))}
          onChange={(_, value) => onChange({ ...filters, mfrSlugs: value.map((v) => v.slug) })}
          renderTags={(value, getTagProps) =>
            value.map((opt, i) => {
              const { key, ...tagProps } = getTagProps({ index: i });
              return <Chip key={key} {...tagProps} size="small" label={opt.name} />;
            })
          }
          renderInput={(params) => <TextField {...params} placeholder="MFR" />}
          sx={{ minWidth: 180, flex: 1 }}
        />

        <Autocomplete
          multiple
          size="small"
          options={familyOptions}
          value={filters.families}
          onChange={(_, value) => onChange({ ...filters, families: value })}
          renderTags={(value, getTagProps) =>
            value.map((opt, i) => {
              const { key, ...tagProps } = getTagProps({ index: i });
              return <Chip key={key} {...tagProps} size="small" label={opt} />;
            })
          }
          renderInput={(params) => <TextField {...params} placeholder="Family" />}
          sx={{ minWidth: 140, flex: 1 }}
        />

        <TextField
          size="small"
          type="number"
          placeholder="Min prods"
          value={filters.minProductCount || ''}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            onChange({ ...filters, minProductCount: Number.isFinite(n) && n > 0 ? n : 0 });
          }}
          sx={{ width: 110 }}
          inputProps={{ min: 0 }}
        />

        {hasActive && (
          <Button size="small" onClick={() => onChange(EMPTY_FILTERS)} sx={{ whiteSpace: 'nowrap' }}>
            Clear all
          </Button>
        )}
      </Stack>

      {hasActive && (
        <Box sx={{ mt: 1, fontSize: '0.75rem', color: 'text.secondary' }}>
          Showing {filteredCount} of {totalCount} param{totalCount === 1 ? '' : 's'}
        </Box>
      )}
    </Box>
  );
}
