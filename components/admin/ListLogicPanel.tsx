'use client';

import { Box, Typography, Divider } from '@mui/material';
import { ROW_FONT_SIZE } from '@/lib/layoutConstants';

const SECTION_MB = 3;
const BODY_SX = { fontSize: ROW_FONT_SIZE, color: 'text.secondary', lineHeight: 1.7 } as const;
const LIST_SX = { ...BODY_SX, pl: 2, mb: 1 } as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box sx={{ mb: SECTION_MB }}>
      <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 600 }}>{title}</Typography>
      {children}
    </Box>
  );
}

export default function ListLogicPanel() {
  return (
    <Box sx={{ p: 3, maxWidth: 780, overflow: 'auto', height: '100%' }}>
      <Typography variant="h6" sx={{ mb: 0.5 }}>List Logic</Typography>
      <Typography sx={{ ...BODY_SX, mb: 3 }}>
        How batch validation works for uploaded BOMs — differences from single-part search, performance optimizations, and filtering.
      </Typography>
      <Divider sx={{ mb: 3 }} />

      <Section title="1. Per-Row Processing">
        <Typography sx={BODY_SX}>
          Each row in the uploaded list is processed through the same pipeline as single-part search, with key optimizations.
          Rows are processed in <strong>parallel chunks of 3</strong> (CONCURRENCY=3) and results stream back as NDJSON.
        </Typography>
      </Section>

      <Section title="2. Part Resolution (Search Phase)">
        <Typography sx={BODY_SX}>
          For each row, <code>searchParts()</code> queries <strong>Digikey + Atlas + Parts.io</strong> in parallel (Mouser is skipped in batch).
          If the MPN column is empty, the description column is used with the manufacturer prepended for better results.
        </Typography>
        <Typography sx={{ ...BODY_SX, mt: 1 }}>
          <strong>Direct lookup fallback:</strong> If search returns no matches, the system tries <code>getAttributes()</code> directly
          before marking the row as &quot;not-found&quot;. This uses exact MPN lookup (not keyword/prefix search) against
          Digikey &rarr; Atlas &rarr; parts.io, and can resolve parts that prefix search misses.
        </Typography>
      </Section>

      <Section title="3. Parts.io Family Disambiguation">
        <Typography sx={BODY_SX}>
          When parts.io is the primary source and only provides a broad Class name (e.g., &quot;Capacitors&quot;, &quot;Transistors&quot;),
          the system disambiguates using description keywords and parametric hints:
        </Typography>
        <Typography component="div" sx={LIST_SX}>
          &bull; <strong>Capacitors</strong> &rarr; dielectric type (Ceramic&rarr;MLCC, Aluminum&rarr;Electrolytic, Tantalum, Film, Supercap)<br />
          &bull; <strong>Transistors</strong> &rarr; channel type (N-Ch/P-Ch&rarr;MOSFET, NPN/PNP&rarr;BJT, IGBT)<br />
          &bull; <strong>Diodes</strong> &rarr; description (TVS, Zener, Schottky, Bridge, Rectifier)<br />
          &bull; <strong>Power Circuits</strong> &rarr; description (LDO, switching/buck/boost, voltage reference)<br />
          &bull; <strong>Converters</strong> &rarr; description (ADC vs DAC)<br />
          &bull; <strong>Drivers And Interfaces</strong> &rarr; description (gate driver vs RS-485/CAN/I2C)<br />
          &bull; <strong>Filters</strong> &rarr; description (common mode choke vs ferrite bead)
        </Typography>
      </Section>

      <Section title="4. Performance Optimizations (vs. Search)">
        <Typography sx={BODY_SX}>
          Batch validation applies two optimizations that single-part search does not:
        </Typography>
        <Typography component="div" sx={LIST_SX}>
          &bull; <strong>Skip parts.io candidate enrichment</strong> — single-part search enriches all ~20 Digikey candidates
          with parts.io gap-fill (20 parallel API calls). Batch skips this entirely. Parts.io gap-fill adds ~5-15% weight
          coverage but is the biggest latency contributor.<br />
          &bull; <strong>Skip Mouser search</strong> — Mouser is rate-limited (30/min, 1K/day). Batch skips Mouser in the
          search phase to conserve quota for on-demand use.
        </Typography>
      </Section>

      <Section title="5. Recommendation Filtering (Batch Only)">
        <Typography sx={BODY_SX}>
          After scoring, batch validation applies a smart filter that keeps only actionable recommendations.
          Single-part search returns all results; the list filter reduces noise and storage.
        </Typography>
        <Typography sx={{ ...BODY_SX, mt: 1, fontWeight: 500 }}>
          A recommendation is kept if ANY of these are true:
        </Typography>
        <Typography component="div" sx={LIST_SX}>
          &bull; <strong>No failing rules</strong> — clean match<br />
          &bull; <strong>All fails are missing-attribute</strong> — attribute not in candidate data, could still pass
          if found manually from the datasheet<br />
          &bull; <strong>At most 1 real mismatch</strong> — exactly one fail where both parts have the attribute but values
          don&apos;t match. Rest are pass or missing.<br />
          &bull; <strong>Parts.io certified</strong> — FFF or Functional equivalents are always kept regardless of fails
          (human-verified cross-references)
        </Typography>
        <Typography sx={{ ...BODY_SX, mt: 1, fontWeight: 500 }}>
          Always excluded:
        </Typography>
        <Typography component="div" sx={LIST_SX}>
          &bull; <strong>Obsolete</strong> or <strong>Discontinued</strong> parts — filtered before scoring (saves computation)
          and double-checked after scoring. NRND and LastTimeBuy are kept.
        </Typography>
      </Section>

      <Section title="6. Caching">
        <Typography sx={BODY_SX}>
          Batch validation uses the <strong>same L2 Supabase cache</strong> as single-part search. All underlying API responses
          (Digikey product details, parts.io listings, Mouser data) are cached with the same TTLs. This means:
        </Typography>
        <Typography component="div" sx={LIST_SX}>
          &bull; First validation of a list is slowest (cold cache)<br />
          &bull; Subsequent refreshes are significantly faster (L2 cache hits skip API calls)<br />
          &bull; Cache is cross-user — one user&apos;s search warms the cache for another user&apos;s list
        </Typography>
      </Section>

      <Section title="7. Data Persistence">
        <Typography sx={BODY_SX}>
          When a list is saved to Supabase, each row stores:
        </Typography>
        <Typography component="div" sx={LIST_SX}>
          &bull; <strong>Resolved part</strong> — MPN, manufacturer, description, category, status<br />
          &bull; <strong>Top suggestion</strong> — the #1 recommendation (full XrefRecommendation)<br />
          &bull; <strong>Top 2 sub-recs</strong> — next best non-failing recommendations (for inline sub-rows)<br />
          &bull; <strong>Recommendation count</strong> — total number of scored recommendations<br />
          &bull; <strong>Enriched data</strong> — flattened parametric data for table column display<br />
          &bull; <strong>Preferred MPN</strong> — user&apos;s explicit pick (persists across refreshes)
        </Typography>
        <Typography sx={{ ...BODY_SX, mt: 1 }}>
          <strong>Not stored</strong> (to keep JSONB size manageable): full source attributes and the complete
          recommendation list. These are recomputed on demand when a user opens the detail modal for a row.
          The underlying API responses are in L2 cache, so recomputation is fast.
        </Typography>
      </Section>

      <Section title="8. Footer Timestamp">
        <Typography sx={BODY_SX}>
          The list footer shows &quot;Refreshed at HH:MM&quot; reflecting when the data was actually last validated — not when the page
          was loaded. When loading a saved list, the timestamp comes from the Supabase <code>updated_at</code> column.
          When validation completes or rows are manually refreshed, the timestamp updates to the current time.
        </Typography>
      </Section>

      <Section title="9. Parts.io Timeout">
        <Typography sx={BODY_SX}>
          All parts.io API calls have an <strong>8-second timeout</strong>. If parts.io is unreachable (e.g., VPN not connected),
          calls fail fast instead of hanging at the OS-level TCP timeout (~60s). Each retry attempt gets its own 8s timeout.
          This prevents a single unreachable service from blocking the entire batch.
        </Typography>
      </Section>
    </Box>
  );
}
