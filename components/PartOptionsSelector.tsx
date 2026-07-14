'use client';
import { useMemo } from 'react';
import { Card, CardActionArea, CardContent, Typography, Stack, Chip, Tooltip, Box } from '@mui/material';
import { PartSummary } from '@/lib/types';

interface PartOptionsSelectorProps {
  parts: PartSummary[];
  onSelect: (part: PartSummary) => void;
}

/** For each part with a colliding description, return up to 3 parametric
 *  values that distinguish it from its siblings (params present on this part
 *  but with different values across the collision group). */
function buildDistinguishingParams(parts: PartSummary[]): Map<string, Array<{ name: string; value: string }>> {
  const result = new Map<string, Array<{ name: string; value: string }>>();
  const groups = new Map<string, PartSummary[]>();
  for (const p of parts) {
    const key = (p.description || '').trim().toLowerCase();
    if (!key) continue;
    const arr = groups.get(key) ?? [];
    arr.push(p);
    groups.set(key, arr);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    // Collect value sets per param name across the group
    const valuesByParam = new Map<string, Set<string>>();
    for (const p of group) {
      for (const kp of p.keyParameters ?? []) {
        const set = valuesByParam.get(kp.name) ?? new Set<string>();
        set.add(kp.value);
        valuesByParam.set(kp.name, set);
      }
    }
    const distinguishingNames = new Set(
      Array.from(valuesByParam.entries()).filter(([, s]) => s.size > 1).map(([n]) => n)
    );
    for (const p of group) {
      const picked = (p.keyParameters ?? [])
        .filter((kp) => distinguishingNames.has(kp.name))
        .slice(0, 3);
      if (picked.length > 0) result.set(p.mpn, picked);
    }
  }
  return result;
}

export default function PartOptionsSelector({ parts, onSelect }: PartOptionsSelectorProps) {
  const distinguishing = useMemo(() => buildDistinguishingParams(parts), [parts]);
  return (
    <Stack spacing={1} sx={{ mt: 1, maxWidth: 480 }}>
      {parts.map((part) => (
        <Card
          key={part.mpn}
          variant="outlined"
          sx={{
            bgcolor: 'background.default',
            '&:hover': { borderColor: 'text.primary' },
            transition: 'border-color 0.2s ease',
          }}
        >
          <CardActionArea onClick={() => onSelect(part)}>
            <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="subtitle2" color="primary" sx={{ fontFamily: 'monospace' }}>
                  {part.mpn}
                </Typography>
                {part.status && (
                  <Chip label={part.status} size="small" color={part.status === 'Active' ? 'success' : 'warning'} variant="outlined" />
                )}
                {/* Logic-vetted descriptive search: a qualitative fit signal. We show a chip (not a
                    raw %) because match % vs a sparse synthetic spec is ~100 for every valid part —
                    the ranking, not the number, carries the signal.

                    ⚠️ THREE states, not two. Read `specFit`, never `hardFail`: a rule only fails when
                    a value DISAGREES, so a part whose specs we could not READ has no failures and
                    used to render as "Fits your specs". Measured on a "1 to 5 A MOSFET" search: 20 of
                    50 results were dual MOSFETs rated 0.115–0.95 A, every one shown as fitting. */}
                {part.specFit === 'below_spec' && (
                  <Tooltip title="Does not meet one or more of your stated specs — kept for reference, ranked last" arrow>
                    <Chip label="Below spec" size="small" color="warning" variant="filled" sx={{ height: 18, fontSize: '0.6rem' }} />
                  </Tooltip>
                )}
                {part.specFit === 'fits' && (
                  <Tooltip title="Meets all of your stated specs" arrow>
                    <Chip label="Fits your specs" size="small" color="success" variant="filled" sx={{ height: 18, fontSize: '0.6rem' }} />
                  </Tooltip>
                )}
                {part.specFit === 'unconfirmed' && (
                  <Tooltip
                    title={`This manufacturer doesn't publish ${
                      typeof part.specsStated === 'number' && typeof part.specsRead === 'number'
                        ? `${part.specsStated - part.specsRead} of the ${part.specsStated} spec${part.specsStated === 1 ? '' : 's'} you asked for`
                        : 'some of the specs you asked for'
                    } in a form we can read, so we could not check them. The part may still be right — check the datasheet.`}
                    arrow
                  >
                    <Chip label="Specs unconfirmed" size="small" color="default" variant="outlined" sx={{ height: 18, fontSize: '0.6rem' }} />
                  </Tooltip>
                )}
                {part.qualifications?.map(q => (
                  <Chip key={q} label={q} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.6rem', color: '#4FC3F7', borderColor: '#4FC3F7' }} />
                ))}
                {typeof part.distributorCount === 'number' && part.distributorCount > 0 && (
                  <Chip
                    label={`${part.distributorCount} ${part.distributorCount === 1 ? 'distributor' : 'distributors'}`}
                    size="small"
                    variant="outlined"
                    sx={{ color: 'text.secondary', borderColor: 'divider' }}
                  />
                )}
                {part.dataSource && part.dataSource !== 'digikey' && (
                  <Chip
                    label={part.dataSource === 'atlas' ? 'Atlas' : part.dataSource === 'partsio' ? 'Parts.io' : 'Mouser'}
                    size="small"
                    variant="outlined"
                    sx={{ height: 18, fontSize: '0.6rem', color: 'text.disabled', borderColor: 'divider' }}
                  />
                )}
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {part.manufacturer}
                {part.dataSource === 'atlas' && (
                  <Tooltip title="Chinese manufacturer" arrow>
                    <Box component="span" sx={{ ml: 0.5, fontSize: 11, verticalAlign: 'middle', lineHeight: 1 }}>&#127464;&#127475;</Box>
                  </Tooltip>
                )}
                {part.description?.trim() ? <> &mdash; {part.description}</> : null}
              </Typography>
              {distinguishing.get(part.mpn) && (
                <Typography
                  variant="caption"
                  color="text.disabled"
                  sx={{ display: 'block', mt: 0.25, fontSize: '0.7rem' }}
                >
                  {distinguishing.get(part.mpn)!
                    .map((kp) => `${kp.name}: ${kp.value}`)
                    .join(' · ')}
                </Typography>
              )}
            </CardContent>
          </CardActionArea>
        </Card>
      ))}
    </Stack>
  );
}
