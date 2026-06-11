/**
 * Atlas family domain-card grounding.
 *
 * Produces a deterministic, data-derived grounding block for the
 * domain-card generator. Phase 1 of the post-audit fix (May 2026):
 * every card generated before this service was hallucinating Western
 * MFR cohorts (Samsung/Murata/TDK for MLCC, etc.) because Opus had
 * only logic-table labels + signature entries as input — no view into
 * what manufacturers actually ship under the family in atlas_products.
 *
 * The grounding block is the model's ONLY authoritative source for:
 *  - MFR cohort that ships under this family
 *  - Sample MPN strings (so the model can call out prefix patterns
 *    it sees in real data instead of guessing common prefixes)
 *  - The family-specific Chinese paramName dictionary
 *
 * The prompt enforces a hard constraint: the model must list ONLY MFRs
 * present in VERIFIED_MFRS — no Western majors, no inferred names. If
 * the family has fewer than expected MFRs (e.g. family 12 currently
 * has 1 MFR), the model is instructed to say so explicitly rather than
 * pad with inventions.
 */

import { createServiceClient } from '@/lib/supabase/service';
import {
  getAtlasParamDictionary,
  type AtlasParamMapping,
} from '@/lib/services/atlasMapper';

export interface VerifiedMfr {
  manufacturer: string;
  productCount: number;
  sampleMpns: string[];
}

export interface ChineseDictEntry {
  chinese: string;
  attributeId: string;
  attributeName: string;
  unit?: string;
}

export interface GroundingCounts {
  totalProductCount: number;
  totalMfrCount: number;
}

export interface GroundingBlock {
  verifiedMfrs: VerifiedMfr[];
  chineseDictEntries: ChineseDictEntry[];
  counts: GroundingCounts;
}

/** Top-N MFR limit. 15 is enough to cover the long tail without
 *  blowing prompt budget — most families have ≤12 active MFRs anyway. */
const MFR_LIMIT = 15;

/** Sample MPNs per MFR. 5 is enough for the model to see prefix
 *  consistency without flooding the prompt. */
const SAMPLE_LIMIT = 5;

/**
 * Build the full grounding block for a family. Single call site:
 * the family-domain-cards Generate endpoint.
 */
export async function buildGroundingBlock(familyId: string): Promise<GroundingBlock> {
  const supabase = createServiceClient();

  const [mfrResult, countsResult] = await Promise.all([
    supabase.rpc('get_atlas_family_mfr_grounding', {
      p_family_id: familyId,
      p_mfr_limit: MFR_LIMIT,
      p_sample_limit: SAMPLE_LIMIT,
    }),
    supabase.rpc('get_atlas_family_grounding_counts', {
      p_family_id: familyId,
    }),
  ]);

  if (mfrResult.error) {
    throw new Error(`get_atlas_family_mfr_grounding failed: ${mfrResult.error.message}`);
  }
  if (countsResult.error) {
    throw new Error(`get_atlas_family_grounding_counts failed: ${countsResult.error.message}`);
  }

  const verifiedMfrs: VerifiedMfr[] = (mfrResult.data ?? []).map((row: {
    manufacturer: string;
    product_count: number | string;
    sample_mpns: string[] | null;
  }) => ({
    manufacturer: row.manufacturer,
    productCount: Number(row.product_count),
    sampleMpns: row.sample_mpns ?? [],
  }));

  const countsRow = (countsResult.data ?? [])[0] as
    | { product_count: number | string; mfr_count: number | string }
    | undefined;
  const counts: GroundingCounts = {
    totalProductCount: countsRow ? Number(countsRow.product_count) : 0,
    totalMfrCount: countsRow ? Number(countsRow.mfr_count) : 0,
  };

  const chineseDictEntries = extractChineseDictEntries(familyId);

  return { verifiedMfrs, chineseDictEntries, counts };
}

/**
 * Pull only the Chinese-character entries from the family's atlasMapper
 * dictionary. We skip English/numeric entries because they don't help the
 * model recognize CJK paramNames in unmapped data — and the prompt is
 * already long.
 *
 * Exported so the composite-domain-card renderer
 * (atlasFamilyCardFacts.ts) can reuse the exact same CJK-filtering
 * convention when it renders the CHINESE→CANONICAL facts section — single
 * source of truth for "what counts as a Chinese dict entry."
 */
export function extractChineseDictEntries(familyId: string): ChineseDictEntry[] {
  const dict = getAtlasParamDictionary(familyId);
  if (!dict) return [];
  const entries: ChineseDictEntry[] = [];
  const CJK = /[一-鿿]/;
  for (const [key, mapping] of Object.entries(dict)) {
    if (!CJK.test(key)) continue;
    const m = mapping as AtlasParamMapping;
    entries.push({
      chinese: key,
      attributeId: m.attributeId,
      attributeName: m.attributeName,
      unit: m.unit,
    });
  }
  return entries;
}

/**
 * Format the grounding block as plain text for injection into the
 * Opus prompt. Kept in this module (not the route) so the formatting
 * convention is single-sourced — Phase 3's diff dialog will re-use this
 * to show engineers exactly what grounding the model received.
 */
export function formatGroundingForPrompt(block: GroundingBlock, familyId: string): string {
  const { verifiedMfrs, chineseDictEntries, counts } = block;

  const mfrLines = verifiedMfrs.length === 0
    ? '(no manufacturers currently ship products under this family in atlas_products)'
    : verifiedMfrs
        .map((m) => {
          const samples = m.sampleMpns.length > 0
            ? ` — samples: ${m.sampleMpns.slice(0, SAMPLE_LIMIT).join(', ')}`
            : '';
          return `- ${m.manufacturer}: ${m.productCount.toLocaleString()} products${samples}`;
        })
        .join('\n');

  const dictLines = chineseDictEntries.length === 0
    ? '(no family-specific Chinese dictionary entries — model should not invent translations)'
    : chineseDictEntries
        .map((e) => {
          const unit = e.unit ? ` [${e.unit}]` : '';
          return `- ${e.chinese} → ${e.attributeId} (${e.attributeName})${unit}`;
        })
        .join('\n');

  return `VERIFIED_MFRS (these are the ONLY manufacturers shipping products under family ${familyId} in our atlas_products dataset; counts and sample MPNs are real):
${mfrLines}

GROUNDING_COUNTS:
- Total products under family ${familyId}: ${counts.totalProductCount.toLocaleString()}
- Distinct manufacturers: ${counts.totalMfrCount}

CHINESE_PARAM_DICTIONARY (family ${familyId} entries already curated in atlasMapper.ts — use these verbatim when describing Chinese conventions; do not paraphrase or invent new mappings):
${dictLines}`;
}
