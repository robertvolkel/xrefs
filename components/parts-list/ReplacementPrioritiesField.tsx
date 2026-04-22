'use client';

import { Box, Checkbox, FormControl, FormControlLabel, IconButton, InputLabel, List, ListItem, MenuItem, Select, Typography, Tooltip, Button } from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import {
  DEFAULT_REPLACEMENT_PRIORITIES,
  type RecommendationBucket,
  type ReplacementAxis,
  type ReplacementPriorities,
} from '@/lib/types';

const ALL_BUCKETS: RecommendationBucket[] = ['accuris', 'manufacturer', 'logic'];
const BUCKET_LABELS: Record<RecommendationBucket, string> = {
  accuris: 'Accuris Certified',
  manufacturer: 'MFR Certified',
  logic: 'Logic Driven',
};

const MAX_REPLACEMENTS_OPTIONS = [1, 2, 3, 4, 5];

interface AxisDescriptor {
  key: ReplacementAxis;
  label: string;
  helper: string;
}

const AXIS_DESCRIPTORS: Record<ReplacementAxis, AxisDescriptor> = {
  lifecycle: {
    key: 'lifecycle',
    label: 'Lifecycle & Risk',
    helper: 'Prefer Active parts with better risk scores',
  },
  compliance: {
    key: 'compliance',
    label: 'Compliance',
    helper: 'Prefer parts with broader certifications (RoHS, REACH, AEC-Q)',
  },
  cost: {
    key: 'cost',
    label: 'Cost',
    helper: 'Prefer cheaper alternates (compares best unit price across distributors)',
  },
  stock: {
    key: 'stock',
    label: 'Stock (activates when source scarce)',
    helper: 'Auto-triggered when source has fewer than 100 units in stock',
  },
};

interface ReplacementPrioritiesFieldProps {
  value: ReplacementPriorities;
  onChange: (next: ReplacementPriorities) => void;
}

export default function ReplacementPrioritiesField({ value, onChange }: ReplacementPrioritiesFieldProps) {
  const moveUp = (idx: number) => {
    if (idx <= 0) return;
    const next = [...value.order];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    onChange({ ...value, order: next });
  };

  const moveDown = (idx: number) => {
    if (idx >= value.order.length - 1) return;
    const next = [...value.order];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    onChange({ ...value, order: next });
  };

  const toggleEnabled = (axis: ReplacementAxis) => {
    onChange({
      ...value,
      enabled: { ...value.enabled, [axis]: !value.enabled[axis] },
    });
  };

  const reset = () => onChange(DEFAULT_REPLACEMENT_PRIORITIES);

  return (
    <Box>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
        Rank how alternates should be prioritized when ranking suggestions. Uncheck to ignore an axis entirely.
      </Typography>

      <List dense disablePadding sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
        {value.order.map((axisKey, idx) => {
          const desc = AXIS_DESCRIPTORS[axisKey];
          const isEnabled = value.enabled[axisKey];
          const position = idx + 1;
          return (
            <ListItem
              key={axisKey}
              divider={idx < value.order.length - 1}
              sx={{
                py: 1.25,
                px: 1.5,
                opacity: isEnabled ? 1 : 0.55,
              }}
              secondaryAction={
                <Box sx={{ display: 'flex', gap: 0.25 }}>
                  <IconButton
                    size="small"
                    onClick={() => moveUp(idx)}
                    disabled={idx === 0}
                    aria-label={`Move ${desc.label} up`}
                  >
                    <ArrowUpwardIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => moveDown(idx)}
                    disabled={idx === value.order.length - 1}
                    aria-label={`Move ${desc.label} down`}
                  >
                    <ArrowDownwardIcon fontSize="small" />
                  </IconButton>
                </Box>
              }
            >
              <Checkbox
                size="small"
                checked={isEnabled}
                onChange={() => toggleEnabled(axisKey)}
                sx={{ mr: 1, p: 0.5 }}
              />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {position}. {desc.label}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.3 }}>
                  {desc.helper}
                </Typography>
              </Box>
            </ListItem>
          );
        })}
      </List>

      <Box sx={{ mt: 2.5 }}>
        <Typography variant="overline" sx={{ fontSize: '0.65rem', color: 'text.secondary', display: 'block', mb: 0.5 }}>
          Filters
        </Typography>
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={value.hideZeroStock ?? false}
              onChange={(e) => onChange({ ...value, hideZeroStock: e.target.checked })}
              sx={{ p: 0.5 }}
            />
          }
          label={
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>Hide zero-stock replacements</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.3 }}>
                Skip replacements with known totalStock of 0 across all distributors. Replacements with unknown stock stay visible.
              </Typography>
            </Box>
          }
          sx={{ ml: 0, alignItems: 'flex-start', mb: 2 }}
        />

        {/* Max suggestions per row */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>Max replacements per row</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.3 }}>
              Show up to N replacements in the list view (top + alternates).
            </Typography>
          </Box>
          <FormControl size="small" sx={{ minWidth: 80 }}>
            <Select
              value={value.maxReplacements ?? value.maxSuggestions ?? 3}
              onChange={(e) => {
                const { maxSuggestions: _legacy, ...rest } = value;
                void _legacy;
                onChange({ ...rest, maxReplacements: Number(e.target.value) });
              }}
              inputProps={{ 'aria-label': 'Max replacements per row' }}
            >
              {MAX_REPLACEMENTS_OPTIONS.map(n => (
                <MenuItem key={n} value={n}>{n}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        {/* Bucket multi-select */}
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.25 }}>Show replacements from:</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.3, mb: 0.5 }}>
            Check one or more buckets. If all are unchecked, all buckets are shown.
          </Typography>
          {ALL_BUCKETS.map(bucket => {
            // Read new `buckets` key; fall back to legacy `suggestionBuckets` for lists saved pre-rename.
            const selected = value.buckets ?? value.suggestionBuckets ?? ALL_BUCKETS;
            const checked = selected.includes(bucket);
            return (
              <FormControlLabel
                key={bucket}
                control={
                  <Checkbox
                    size="small"
                    checked={checked}
                    onChange={(e) => {
                      const current = value.buckets ?? value.suggestionBuckets ?? ALL_BUCKETS;
                      const next = e.target.checked
                        ? Array.from(new Set([...current, bucket]))
                        : current.filter(b => b !== bucket);
                      // Drop the legacy key on write so it stops round-tripping.
                      const { suggestionBuckets: _legacy, ...rest } = value;
                      void _legacy;
                      onChange({ ...rest, buckets: next });
                    }}
                    sx={{ p: 0.5 }}
                  />
                }
                label={<Typography variant="body2">{BUCKET_LABELS[bucket]}</Typography>}
                sx={{ ml: 0, mr: 2, display: 'inline-flex' }}
              />
            );
          })}
        </Box>
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1.5 }}>
        <Tooltip title="Restore default priority order, enable all axes, and clear filters">
          <Button
            size="small"
            startIcon={<RestartAltIcon fontSize="small" />}
            onClick={reset}
            sx={{ textTransform: 'none' }}
          >
            Reset to defaults
          </Button>
        </Tooltip>
      </Box>
    </Box>
  );
}
