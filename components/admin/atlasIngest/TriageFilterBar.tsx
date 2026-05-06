'use client';

import { useMemo } from 'react';
import {
  Autocomplete, Box, Button, Chip, Stack, TextField, InputAdornment,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import type { GlobalUnmappedParam } from './types';

export interface TriageFilters {
  search: string;
  mfrSlugs: string[];
  families: string[];
  minProductCount: number;
}

export const EMPTY_FILTERS: TriageFilters = {
  search: '',
  mfrSlugs: [],
  families: [],
  minProductCount: 0,
};

interface Props {
  rows: GlobalUnmappedParam[];
  filters: TriageFilters;
  onChange: (next: TriageFilters) => void;
  filteredCount: number;
  totalCount: number;
}

export default function TriageFilterBar({ rows, filters, onChange, filteredCount, totalCount }: Props) {
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
    filters.minProductCount > 0;

  return (
    <Box sx={{ mb: 2, p: 1.5, bgcolor: 'background.paper', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}>
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
