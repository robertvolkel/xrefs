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

export default function SearchLogicPanel() {
  return (
    <Box sx={{ p: 3, maxWidth: 780, overflow: 'auto', height: '100%' }}>
      <Typography variant="h6" sx={{ mb: 0.5 }}>Search Logic</Typography>
      <Typography sx={{ ...BODY_SX, mb: 3 }}>
        How a single-part search works — from MPN lookup to scored recommendations.
      </Typography>
      <Divider sx={{ mb: 3 }} />

      <Section title="1. Source Part Resolution">
        <Typography sx={BODY_SX}>
          When a user searches for a part, the system resolves its attributes through a priority-ordered fallback chain:
        </Typography>
        <Typography component="div" sx={LIST_SX}>
          1. <strong>Digikey Product Details API</strong> — exact MPN lookup (primary source)<br />
          2. <strong>Digikey Keyword Search</strong> — fallback if product details miss (e.g., MPNs with commas like &quot;BC847CW,115&quot;)<br />
          3. <strong>Atlas Database</strong> — Supabase lookup by MPN (covers Chinese manufacturers)<br />
          4. <strong>Parts.io API</strong> — exact MPN lookup (covers niche parts not in Digikey/Atlas)<br />
          5. If all fail &rarr; returns null (part not found)
        </Typography>
      </Section>

      <Section title="2. Source Enrichment">
        <Typography sx={BODY_SX}>
          After Digikey resolves the source part, two enrichment calls run <strong>in parallel</strong>:
        </Typography>
        <Typography component="div" sx={LIST_SX}>
          &bull; <strong>Parts.io gap-fill</strong> — fills parametric specs Digikey lacks (e.g., thyristor tq, relay coil specs, LDO dropout). Digikey values always win on conflicts.<br />
          &bull; <strong>Mouser commercial data</strong> — pricing, stock, lifecycle status, suggested replacements, HTS codes, ECCN. No parametric data.
        </Typography>
      </Section>

      <Section title="3. Caching (L2 Supabase)">
        <Typography sx={BODY_SX}>
          All API responses are cached in the <code>part_data_cache</code> Supabase table. Cross-user, survives cold starts.
        </Typography>
        <Typography component="div" sx={LIST_SX}>
          &bull; <strong>Digikey parametric</strong> — cached indefinitely (specs don&apos;t change)<br />
          &bull; <strong>Digikey commercial</strong> — 24-hour TTL (pricing/stock change daily)<br />
          &bull; <strong>Parts.io</strong> — 90-day TTL<br />
          &bull; <strong>Mouser</strong> — 24-hour TTL<br />
          &bull; <strong>Not-found results</strong> — 24-hour TTL (avoids repeated misses)<br />
          &bull; <strong>Search results</strong> — 7-day TTL
        </Typography>
      </Section>

      <Section title="4. Family Classification">
        <Typography sx={BODY_SX}>
          The source part&apos;s subcategory string is mapped to a family ID via the <code>subcategoryToFamily</code> registry
          in <code>logicTables/index.ts</code>. For variant families (e.g., Current Sense Resistors from Chip Resistors,
          Schottky from Rectifier Diodes), the <code>familyClassifier</code> examines part attributes and description keywords
          to detect the specific variant.
        </Typography>
        <Typography sx={{ ...BODY_SX, mt: 1 }}>
          When parts.io is the source and only a broad Class name is available (e.g., &quot;Capacitors&quot;),
          a disambiguation step uses description keywords and parametric hints (dielectric type, channel polarity, etc.)
          to resolve the correct family.
        </Typography>
      </Section>

      <Section title="5. Candidate Sourcing">
        <Typography sx={BODY_SX}>
          Four sources are queried <strong>in parallel</strong> for replacement candidates:
        </Typography>
        <Typography component="div" sx={LIST_SX}>
          &bull; <strong>Digikey keyword search</strong> — up to 20 candidates, filtered by critical parameters<br />
          &bull; <strong>Atlas database</strong> — up to 50 candidates by family ID (Chinese manufacturer coverage)<br />
          &bull; <strong>Parts.io FFF/Functional equivalents</strong> — up to 10 human-verified replacements extracted from the source part&apos;s listing<br />
          &bull; <strong>Mouser suggested replacement</strong> — 0-1 candidates (Mouser&apos;s human-verified replacement MPN)
        </Typography>
        <Typography sx={BODY_SX}>
          Candidates are deduplicated by MPN with priority: Digikey &gt; Atlas &gt; Mouser &gt; Parts.io.
          After dedup, all Digikey candidates are enriched with parts.io gap-fill data (parallel calls).
        </Typography>
      </Section>

      <Section title="6. Scoring">
        <Typography sx={BODY_SX}>
          The matching engine evaluates every candidate against the family&apos;s logic table rules. Each rule has a <strong>weight (0-10)</strong> and a type
          (identity, threshold, identity_upgrade, identity_flag, fit, etc.).
        </Typography>
        <Typography component="div" sx={LIST_SX}>
          &bull; <strong>Match % = earnedWeight / totalWeight &times; 100</strong><br />
          &bull; A part <strong>fails</strong> if any rule result is &apos;fail&apos;<br />
          &bull; <code>application_review</code> rules get 50% credit (can&apos;t be automated)<br />
          &bull; <code>operational</code> mismatches get 80% credit (non-electrical)
        </Typography>
      </Section>

      <Section title="7. Post-Scoring Filters">
        <Typography sx={BODY_SX}>
          After scoring, family-specific blocking gates remove candidates with confirmed architectural mismatches
          (e.g., wrong topology for switching regulators, wrong protocol for interface ICs, wrong logic function code).
          User-excluded manufacturers are also filtered out.
        </Typography>
      </Section>

      <Section title="8. LLM Assessment">
        <Typography sx={BODY_SX}>
          Recommendations display immediately in the UI. The LLM assessment (Claude Sonnet) is <strong>deferred</strong> —
          it streams into the chat panel after the recommendations are already visible. This avoids blocking the critical path.
        </Typography>
      </Section>

      <Section title="9. Admin Overrides">
        <Typography sx={BODY_SX}>
          Admin rule overrides (modify/add/remove) are merged onto the TypeScript logic table base at runtime via <code>overrideMerger</code>.
          Context question overrides modify application context. User preferences (compliance defaults, manufacturer preferences)
          apply effects before per-family context questions. More specific context always wins.
        </Typography>
      </Section>
    </Box>
  );
}
