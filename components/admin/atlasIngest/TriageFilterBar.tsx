'use client';

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
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import NoteAltIcon from '@mui/icons-material/NoteAlt';
import FlagIcon from '@mui/icons-material/Flag';
import type { StatusFilter } from './types';

export type TriageMode = 'synonyms' | 'auto_flagged' | 'all';

export type AiVerdictFilter = 'all' | 'accept' | 'defer' | 'none';

export interface TriageFilters {
  search: string;
  mfrSlugs: string[];
  families: string[];
  minProductCount: number;
  /** When true, show only rows with team notes attached. The "needs to be
   *  revisited" workflow — engineers note params during triage and come
   *  back later to finish the mapping. */
  hasNote: boolean;
  /** When true, show only rows the engineer has flagged via the bookmark
   *  icon. Independent of `hasNote` — a row can be flagged with no note,
   *  noted with no flag, or both. */
  flaggedOnly: boolean;
  /** Filter by the cached AI Triage verdict (Sonnet 4.6 /suggest output).
   *  'all' (default) shows everything; 'accept' / 'defer' surface only
   *  rows where Sonnet returned that verdict; 'none' shows rows that
   *  haven't been AI-evaluated yet (cold rows). Verdict state lives in
   *  the table's RowState (loaded from localStorage); the filter is
   *  applied inside GlobalUnmappedParamsTable's orderedRows useMemo. */
  aiVerdict: AiVerdictFilter;
}

export const EMPTY_FILTERS: TriageFilters = {
  search: '',
  mfrSlugs: [],
  families: [],
  minProductCount: 0,
  hasNote: false,
  flaggedOnly: false,
  aiVerdict: 'all',
};

interface Props {
  /** Distinct MFR options for the dropdown, computed SERVER-SIDE over the full
   *  working set (Decision #231) — the client only holds one page of rows, so
   *  it can't derive complete options locally. */
  mfrOptions: Array<{ slug: string; name: string }>;
  /** Distinct family options, server-computed for the same reason. */
  familyOptions: string[];
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
  /** Lifecycle counts. Open = working queue (lifecycle-open AND not parked);
   *  Accepted = active override; Undone = inactive (reverted) override;
   *  Deferred = engineer-parked for later; Unmappable = engineer-parked
   *  permanently. The OPEN count excludes deferred + unmappable so the badge
   *  matches what the engineer actually sees in the default view. */
  statusCounts?: { open: number; accepted: number; undone: number; deferred: number; unmappable: number };
  /** Total number of params with team notes attached. Surfaced as a chip
   *  badge on the "Has note" toggle so engineers see at a glance how many
   *  rows are pending follow-up. */
  noteCount?: number;
  /** Total number of params the engineer has bookmark-flagged. Surfaced as
   *  a chip badge on the "Flagged" toggle. */
  flaggedCount?: number;
  /** Server-computed durable AI verdict counts over the open synonym queue.
   *  `accept` is surfaced on the Accept chip ("Accepts waiting"), `defer` on
   *  Defer, `none` on None — so the chips are the single source for those
   *  numbers (no separate banner). */
  verdictCounts?: { generatedTotal: number; accept: number; defer: number; none: number };
}

export default function TriageFilterBar({ mfrOptions, familyOptions, filters, onChange, filteredCount, totalCount, mode, onModeChange, triageCounts, status, onStatusChange, statusCounts, noteCount, flaggedCount, verdictCounts }: Props) {
  // mfrOptions / familyOptions are now server-provided (full working set), so
  // the dropdowns stay complete + stable even though the client holds one page.

  const hasActive =
    filters.search.trim().length > 0 ||
    filters.mfrSlugs.length > 0 ||
    filters.families.length > 0 ||
    filters.minProductCount > 0 ||
    filters.hasNote ||
    filters.flaggedOnly ||
    filters.aiVerdict !== 'all';

  const synonymsCount = triageCounts?.synonyms ?? 0;
  const autoFlaggedCount = triageCounts?.autoFlagged ?? 0;
  const allCount = triageCounts?.total ?? (synonymsCount + autoFlaggedCount);

  return (
    <Box sx={{ mb: 2, p: 1.5, bgcolor: 'background.paper', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
      {/* Mode + status selectors share ONE row. Two INDEPENDENT single-select
          groups — mode picks which KIND of row (synonym queue vs auto-flagged
          misclassifications vs both); status picks the lifecycle state
          (open/accepted/…). Kept as separate ToggleButtonGroups so choosing
          one never clears the other. Mode is server-side (a change refetches);
          status filters client-side. Gap between them signals they're two
          distinct controls. */}
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1.5, flexWrap: 'wrap', rowGap: 1 }}>
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
              title="Auto-flagged misclassifications — rows where the param name belongs to a different family — almost certainly upstream misclassification. Click Confirm to flag for investigation, Revert if it's actually correct here."
              placement="top"
            >
              <Stack direction="row" spacing={0.75} alignItems="center">
                <FlagOutlinedIcon fontSize="small" sx={{ color: autoFlaggedCount > 0 ? 'error.main' : undefined }} />
                <Box component="span" sx={{ fontSize: '0.75rem' }}>Auto-flagged</Box>
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
                <Box component="span" sx={{ fontSize: '0.75rem' }}>Both</Box>
                <Chip size="small" label={allCount} sx={{ height: 18, fontSize: '0.65rem', bgcolor: 'action.selected' }} />
              </Stack>
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>

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
          {/* Label is "Reverted", not "Undone" — in plain English "undone" reads as
              "not done yet" (i.e. still to do), which is the OPPOSITE of what this
              bucket holds. The underlying status value stays 'undone' everywhere. */}
          <ToggleButton value="undone" aria-label="Reverted — accepted, then undone">
            <Tooltip title="Params you accepted and later reverted. The mapping is no longer in effect; the record is kept as an audit trail." placement="top">
              <Stack direction="row" spacing={0.75} alignItems="center">
                <HistoryToggleOffIcon fontSize="small" />
                <Box component="span" sx={{ fontSize: '0.75rem' }}>Reverted</Box>
                <Chip size="small" label={statusCounts?.undone ?? 0} sx={{ height: 18, fontSize: '0.65rem', bgcolor: 'action.selected' }} />
              </Stack>
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="deferred" aria-label="Deferred — parked for later">
            <Tooltip title="Rows the engineer parked for later — typically needs upstream work, more context, or a non-mapping fix. Reversible via Reopen." placement="top">
              <Stack direction="row" spacing={0.75} alignItems="center">
                <PauseCircleOutlineIcon fontSize="small" sx={{ color: (statusCounts?.deferred ?? 0) > 0 ? 'warning.main' : undefined }} />
                <Box component="span" sx={{ fontSize: '0.75rem' }}>Deferred</Box>
                <Chip size="small" label={statusCounts?.deferred ?? 0} sx={{ height: 18, fontSize: '0.65rem', bgcolor: 'action.selected' }} />
              </Stack>
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="unmappable" aria-label="Unmappable — never mappable">
            <Tooltip title="Rows the engineer marked as permanently unmappable (e.g. vendor test-condition columns). Reversible via Reopen." placement="top">
              <Stack direction="row" spacing={0.75} alignItems="center">
                <BlockOutlinedIcon fontSize="small" sx={{ color: (statusCounts?.unmappable ?? 0) > 0 ? 'text.disabled' : undefined }} />
                <Box component="span" sx={{ fontSize: '0.75rem' }}>Unmappable</Box>
                <Chip size="small" label={statusCounts?.unmappable ?? 0} sx={{ height: 18, fontSize: '0.65rem', bgcolor: 'action.selected' }} />
              </Stack>
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="all" aria-label="All status">
            <Tooltip title="Open + Accepted + Reverted + Deferred + Unmappable combined." placement="top">
              <Stack direction="row" spacing={0.75} alignItems="center">
                <VisibilityOutlinedIcon fontSize="small" />
                <Box component="span" sx={{ fontSize: '0.75rem' }}>All</Box>
                <Chip
                  size="small"
                  label={(statusCounts?.open ?? 0) + (statusCounts?.accepted ?? 0) + (statusCounts?.undone ?? 0) + (statusCounts?.deferred ?? 0) + (statusCounts?.unmappable ?? 0)}
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

        <Tooltip title={`Show only rows you've flagged for follow-up. ${flaggedCount ?? 0} flagged total.`}>
          <ToggleButton
            size="small"
            value="flaggedOnly"
            selected={filters.flaggedOnly}
            onChange={() => onChange({ ...filters, flaggedOnly: !filters.flaggedOnly })}
            sx={{ whiteSpace: 'nowrap', px: 1.25 }}
          >
            <Stack direction="row" spacing={0.75} alignItems="center">
              <FlagIcon fontSize="small" sx={{ color: filters.flaggedOnly ? 'error.main' : undefined }} />
              <Box component="span" sx={{ fontSize: '0.75rem' }}>Flagged</Box>
              {(flaggedCount ?? 0) > 0 && (
                <Chip
                  size="small"
                  label={flaggedCount}
                  sx={{ height: 18, fontSize: '0.65rem', bgcolor: filters.flaggedOnly ? 'error.main' : 'action.selected', color: filters.flaggedOnly ? 'error.contrastText' : undefined }}
                />
              )}
            </Stack>
          </ToggleButton>
        </Tooltip>

        {/* AI verdict filter. Filters to rows whose cached Sonnet /suggest
            verdict matches the chosen value. 'none' shows cold rows
            (never generated). The actual filtering happens inside
            GlobalUnmappedParamsTable's orderedRows useMemo where the
            per-row suggestion state lives. */}
        <Tooltip title="Filter by AI verdict across the WHOLE queue (server-side): Accept (Sonnet proposes a clean mapping — this is your 'Accepts waiting' pile), Defer (Sonnet wants engineer judgment), None (not generated yet — click Generate). The counts are whole-queue, not just loaded rows.">
          <ToggleButtonGroup
            size="small"
            value={filters.aiVerdict}
            exclusive
            onChange={(_e, v) => v && onChange({ ...filters, aiVerdict: v as AiVerdictFilter })}
            aria-label="AI verdict filter"
            sx={{ ml: 0.5 }}
          >
            <ToggleButton value="all" sx={{ whiteSpace: 'nowrap', px: 1, fontSize: '0.7rem' }}>
              <Box component="span" sx={{ fontSize: '0.75rem' }}>AI: All</Box>
            </ToggleButton>
            <ToggleButton value="accept" sx={{ whiteSpace: 'nowrap', px: 1, fontSize: '0.7rem' }}>
              <Box component="span" sx={{ fontSize: '0.75rem', color: filters.aiVerdict === 'accept' ? 'success.main' : undefined }}>Accept</Box>
              {verdictCounts && (
                <Chip size="small" label={verdictCounts.accept.toLocaleString()} sx={{ ml: 0.5, height: 18, fontSize: '0.65rem', bgcolor: 'success.dark', color: 'success.contrastText' }} />
              )}
            </ToggleButton>
            <ToggleButton value="defer" sx={{ whiteSpace: 'nowrap', px: 1, fontSize: '0.7rem' }}>
              <Box component="span" sx={{ fontSize: '0.75rem', color: filters.aiVerdict === 'defer' ? 'warning.main' : undefined }}>Defer</Box>
              {verdictCounts && (
                <Chip size="small" label={verdictCounts.defer.toLocaleString()} sx={{ ml: 0.5, height: 18, fontSize: '0.65rem', bgcolor: 'action.selected' }} />
              )}
            </ToggleButton>
            <ToggleButton value="none" sx={{ whiteSpace: 'nowrap', px: 1, fontSize: '0.7rem' }}>
              <Box component="span" sx={{ fontSize: '0.75rem' }}>None</Box>
              {verdictCounts && (
                <Chip size="small" label={verdictCounts.none.toLocaleString()} sx={{ ml: 0.5, height: 18, fontSize: '0.65rem', bgcolor: 'action.selected' }} />
              )}
            </ToggleButton>
          </ToggleButtonGroup>
        </Tooltip>

        <TextField
          size="small"
          placeholder="Search raw attribute name or UID (TR-…)"
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
