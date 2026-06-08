/**
 * Composite domain card — deterministic FACTS renderer (server-only).
 *
 * Atlas family "domain cards" used to be fully AI-generated prose. Opus
 * was asked to *re-state* facts already known authoritatively in code/DB
 * (logic-table rules, the Chinese→canonical dictionary, the verified MFR
 * cohort), and the auto-audit (atlasFamilyCardAudit.ts) then *re-extracted*
 * those facts from prose to verify them — a round-trip through prose that
 * produced recurring false-positive blocks (the audit misreading the AI's
 * idioms).
 *
 * This module renders the factual sections DETERMINISTICALLY from source,
 * so the AI only writes the engineering narrative. A composite card is:
 *
 *   ===FAMILY FACTS (source-of-truth, auto-generated — do not edit)===
 *   <rendered facts: rules + dictionary + units + MFR cohort>
 *   ===END FAMILY FACTS===
 *
 *   ===ENGINEERING NOTES===
 *   <AI-written narrative>
 *
 * Composition happens at GENERATION time (composeCardText), not read time —
 * the Triage hot path (/suggest, /investigate) consumes card_text verbatim
 * as one coherent LLM-readable blob, and the engineer approves the exact
 * bytes that get injected.
 *
 * The audit scopes its fact-shaped checks to the NARRATIVE region only
 * (via splitCardText), so the facts — correct by construction — can never
 * trip a false positive. Legacy prose cards (no sentinel) keep the full-
 * text audit path for backward compat.
 *
 * The pure string helpers (sentinels, composeCardText, splitCardText) live
 * in the dependency-free atlasFamilyCardComposite.ts so client components
 * can import them without dragging this server-only renderer into the
 * bundle. They are re-exported here for server callers' convenience.
 */

import { getLogicTable } from '@/lib/logicTables';
import type { LogicTable, MatchingRule } from '@/lib/types';
import {
  getAtlasParamDictionary,
  getSharedParamDictionary,
} from '@/lib/services/atlasMapper';
import {
  buildGroundingBlock,
  extractChineseDictEntries,
  type GroundingBlock,
  type GroundingCounts,
  type VerifiedMfr,
  type ChineseDictEntry,
} from '@/lib/services/atlasFamilyCardGrounding';

// Re-export the pure composite helpers so existing server imports of these
// from this module keep working.
export {
  FACTS_START_SENTINEL,
  FACTS_END_SENTINEL,
  NARRATIVE_SENTINEL,
  CARD_FORMAT_VERSION,
  composeCardText,
  splitCardText,
  type SplitCardText,
} from '@/lib/services/atlasFamilyCardComposite';

// ── structured facts (for future UI tables; renderedText is the prose) ──

export interface RenderedRule {
  attributeId: string;
  attributeName: string;
  logicType: string;
  weight: number;
  blockOnMissing: boolean;
}

export interface RenderedUnit {
  attributeId: string;
  unit: string;
}

export interface RenderedFacts {
  familyId: string;
  /** The deterministic facts prose injected between the FACTS sentinels. */
  renderedText: string;
  /** Structured arrays — reserved for the follow-up UI that renders facts
   *  as proper tables (LogicPanel-style). The renderedText is what ships
   *  in card_text today. */
  rules: RenderedRule[];
  dict: ChineseDictEntry[];
  units: RenderedUnit[];
  mfrs: VerifiedMfr[];
  counts: GroundingCounts;
}

const CJK_RE = /[一-鿿]/;

/** Build the deterministic units list (canonical → standard unit) from the
 *  family dictionary's `unit` field. First non-empty unit per attributeId
 *  wins; deduped. This is the "data half" of CONVENTIONAL UNITS — the AI
 *  narrative carries the judgment half ("don't suffix the canonical"). */
function buildUnitsFromDict(familyId: string): RenderedUnit[] {
  const dict = getAtlasParamDictionary(familyId);
  if (!dict) return [];
  const byAttr = new Map<string, string>();
  for (const mapping of Object.values(dict)) {
    const id = mapping.attributeId;
    const unit = mapping.unit?.trim();
    if (!id || !unit) continue;
    // Skip satellite/internal canonicals (leading underscore) — they're not
    // schema attributes the model should anchor on.
    if (id.startsWith('_')) continue;
    if (!byAttr.has(id)) byAttr.set(id, unit);
  }
  return [...byAttr.entries()]
    .map(([attributeId, unit]) => ({ attributeId, unit }))
    .sort((a, b) => a.attributeId.localeCompare(b.attributeId));
}

/** Collect CJK→canonical dict entries: family-specific (via the shared
 *  extractChineseDictEntries helper) plus shared-dictionary CJK entries.
 *  Family entries win on key collision. */
function collectChineseDict(familyId: string): ChineseDictEntry[] {
  const familyEntries = extractChineseDictEntries(familyId);
  const seen = new Set(familyEntries.map((e) => e.chinese));
  const merged: ChineseDictEntry[] = [...familyEntries];
  const shared = getSharedParamDictionary();
  for (const [key, mapping] of Object.entries(shared)) {
    if (!CJK_RE.test(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({
      chinese: key,
      attributeId: mapping.attributeId,
      attributeName: mapping.attributeName,
      unit: mapping.unit,
    });
  }
  return merged;
}

function renderRulesSection(table: LogicTable): { text: string; rules: RenderedRule[] } {
  const rules: RenderedRule[] = table.rules.map((r: MatchingRule) => ({
    attributeId: r.attributeId,
    attributeName: r.attributeName,
    logicType: r.logicType,
    weight: r.weight,
    blockOnMissing: r.blockOnMissing === true,
  }));
  const lines = rules.length === 0
    ? '(no rules in logic table)'
    : rules
        .map((r) => {
          const block = r.blockOnMissing ? ', blockOnMissing' : '';
          return `- ${r.attributeId} (${r.attributeName}) — ${r.logicType}, weight=${r.weight}${block}`;
        })
        .join('\n');
  return {
    text: `RULES (logic table — what the matching engine scores; type, weight, blocking-on-missing):\n${lines}`,
    rules,
  };
}

function renderDictSection(dict: ChineseDictEntry[]): string {
  const lines = dict.length === 0
    ? '(no Chinese dictionary entries for this family — do not invent translations)'
    : dict
        .map((e) => {
          const unit = e.unit ? ` [${e.unit}]` : '';
          return `- ${e.chinese} → ${e.attributeId} (${e.attributeName})${unit}`;
        })
        .join('\n');
  return `CHINESE→CANONICAL DICTIONARY (family + shared entries, curated in atlasMapper.ts — use verbatim):\n${lines}`;
}

function renderUnitsSection(units: RenderedUnit[]): string {
  const lines = units.length === 0
    ? '(no conventional units recorded for this family)'
    : units.map((u) => `- ${u.attributeId}: ${u.unit}`).join('\n');
  return `CONVENTIONAL UNITS (canonical → standard unit; these are industry-standard — do NOT unit-suffix the canonical name):\n${lines}`;
}

function renderMfrSection(mfrs: VerifiedMfr[], counts: GroundingCounts, familyId: string): string {
  const mfrLines = mfrs.length === 0
    ? '(no manufacturers currently ship products under this family in atlas_products)'
    : mfrs
        .map((m) => {
          const samples = m.sampleMpns.length > 0
            ? ` — samples: ${m.sampleMpns.join(', ')}`
            : '';
          return `- ${m.manufacturer}: ${m.productCount.toLocaleString()} products${samples}`;
        })
        .join('\n');
  return `MFR COHORT (the ONLY manufacturers shipping under family ${familyId} in atlas_products; counts + sample MPNs are real):\n${mfrLines}\n\nTotals: ${counts.totalProductCount.toLocaleString()} products across ${counts.totalMfrCount} distinct manufacturer(s).`;
}

/**
 * Render the deterministic facts for a family. The caller may pass an
 * already-fetched logic table and grounding block (the generate route
 * has both in scope) to avoid redundant DB round-trips; otherwise this
 * fetches them.
 */
export async function renderCardFacts(
  familyId: string,
  opts?: { table?: LogicTable | null; groundingBlock?: GroundingBlock },
): Promise<RenderedFacts> {
  const table = opts?.table ?? getLogicTable(familyId);
  const groundingBlock = opts?.groundingBlock ?? (await buildGroundingBlock(familyId));

  const dict = collectChineseDict(familyId);
  const units = buildUnitsFromDict(familyId);

  const rulesSection = table
    ? renderRulesSection(table)
    : { text: 'RULES: (no logic table for this family)', rules: [] as RenderedRule[] };
  const dictSection = renderDictSection(dict);
  const unitsSection = renderUnitsSection(units);
  const mfrSection = renderMfrSection(
    groundingBlock.verifiedMfrs,
    groundingBlock.counts,
    familyId,
  );

  const header = table
    ? `Family ${familyId} — ${table.familyName} (category: ${table.category})`
    : `Family ${familyId}`;

  const renderedText = [
    header,
    rulesSection.text,
    dictSection,
    unitsSection,
    mfrSection,
  ].join('\n\n');

  return {
    familyId,
    renderedText,
    rules: rulesSection.rules,
    dict,
    units,
    mfrs: groundingBlock.verifiedMfrs,
    counts: groundingBlock.counts,
  };
}
