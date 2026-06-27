/**
 * Deterministic comparison-table builder (docs/mpn-grounding-gate-plan.md, step 4 —
 * structural rendering, the primary fabrication guarantee).
 *
 * When a user asks the chat assistant to compare several parts, the SYSTEM builds the
 * table from real lookup data (the get_batch_attributes projection) and the model only
 * writes the surrounding narration. Because every MPN and every cell here comes from
 * the `parts` input — which is populated by real catalog lookups — the table CANNOT
 * contain a fabricated part number or an invented spec value, by construction. This is
 * the same "pull the LLM out of the surface" pattern as buildSearchSummary /
 * buildRecsSummary, extended to the highest-density MPN surface (tables).
 *
 * Pure and side-effect-free; the chat tool + UI rendering are separate wiring.
 */

/** One part's data as returned by the get_batch_attributes projection. */
export interface ComparisonPartInput {
  mpn: string;
  manufacturer?: string | null;
  status?: string | null;
  qualifications?: ReadonlyArray<string> | null;
  distributorCount?: number | null;
  parameters?: ReadonlyArray<{ name: string; value: string }> | null;
}

export interface ComparisonColumn {
  /** Stable column key. 'mpn' is always first; parameter columns are `p:<name>`. */
  key: string;
  label: string;
}

export interface ComparisonTable {
  columns: ComparisonColumn[];
  /** One row per part; `cells` is keyed by column key, every column present ('—' when absent). */
  rows: Array<{ mpn: string; cells: Record<string, string> }>;
}

export interface BuildComparisonOptions {
  /** Spec terms the user asked about (e.g. ["hFE", "Vce(max)"]). When given, these
   *  drive the parameter columns (matched loosely against the data's param names),
   *  in this order. When omitted, columns are auto-selected by how many parts share
   *  each parameter. */
  preferredAttributes?: ReadonlyArray<string>;
  /** Max parameter columns when auto-selecting. */
  maxParamColumns?: number;
}

const DEFAULT_MAX_PARAM_COLUMNS = 8;
const MISSING = '—';

const norm = (s: string) => s.trim().toLowerCase();

// Tokens that don't pin a concept (qualifiers/fillers) — ignored when token-matching a
// requested spec term against a data param name.
const GENERIC_TOKENS = new Set([
  'max', 'min', 'typ', 'typical', 'maximum', 'minimum', 'rating', 'value', 'the', 'at', 'of', 'a',
]);

const tokenize = (s: string) => norm(s).split(/[^a-z0-9]+/).filter(Boolean);

// Two tokens match if one is a prefix of the other (len ≥ 2) — so "vce" ≈ "vceo".
const tokenPrefixMatch = (a: string, b: string) =>
  a.length >= 2 && b.length >= 2 && (a.startsWith(b) || b.startsWith(a));

/**
 * Score how well a data param `name` matches a requested `term` (higher = better,
 * null = no match). Tiers: exact > whole-word token > substring > token-prefix. Within a
 * tier, prefer the TIGHTER name (fewer extra words) and a name whose HEAD noun (last
 * token) matches the term's last token — so "current" picks "Continuous Collector
 * Current" over "DC Current Gain (hFE)" instead of grabbing whichever appears first
 * (review finding #1). The token tiers require EVERY significant (non-generic) term
 * token to match, so "Vce(sat)" still won't collide with "Vceo Max (...)".
 */
function scoreParamMatch(term: string, name: string): number | null {
  const t = norm(term);
  if (!t) return null;
  const nn = norm(name);
  if (nn === t) return 1000;

  const termToks = tokenize(term).filter((tok) => !GENERIC_TOKENS.has(tok));
  const nameToks = tokenize(name);
  const isSubstr = nn.includes(t) || t.includes(nn);
  const wholeWord = termToks.length > 0 && termToks.every((tt) => nameToks.includes(tt));
  const tokenPrefix =
    termToks.length > 0 && termToks.every((tt) => nameToks.some((nt) => tokenPrefixMatch(tt, nt)));

  if (!isSubstr && !wholeWord && !tokenPrefix) return null;

  let score = wholeWord ? 600 : isSubstr ? 400 : 200;
  score -= nameToks.length; // tighter (fewer extra words) wins ties
  // Head-noun bonus: a spec's subject is usually its last word.
  const lastName = nameToks[nameToks.length - 1];
  const lastTerm = termToks[termToks.length - 1];
  if (lastName && lastTerm && tokenPrefixMatch(lastTerm, lastName)) score += 5;
  return score;
}

/** Best parameter name in the data for a requested `term` (see scoreParamMatch). */
function matchParamName(term: string, allNames: string[]): string | null {
  let best: string | null = null;
  let bestScore = -Infinity;
  for (const name of allNames) {
    const s = scoreParamMatch(term, name);
    if (s !== null && s > bestScore) {
      bestScore = s;
      best = name;
    }
  }
  return best;
}

/**
 * Build a comparison table from already-fetched part data. Deterministic: identical
 * input → identical table. Dedupes parts by MPN (first wins).
 */
export function buildComparisonTable(
  parts: ReadonlyArray<ComparisonPartInput>,
  opts: BuildComparisonOptions = {},
): ComparisonTable {
  // Dedupe by MPN, preserving order.
  const seen = new Set<string>();
  const uniqueParts: ComparisonPartInput[] = [];
  for (const p of parts) {
    if (!p?.mpn) continue;
    const key = norm(p.mpn);
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueParts.push(p);
  }

  // Per-part param lookup (first value wins for duplicate names).
  const paramMaps = uniqueParts.map((p) => {
    const map = new Map<string, string>();
    for (const { name, value } of p.parameters ?? []) {
      if (name && !map.has(name)) map.set(name, value);
    }
    return map;
  });

  // All param names in first-seen order, with a frequency count.
  const firstSeen: string[] = [];
  const freq = new Map<string, number>();
  for (const map of paramMaps) {
    for (const name of map.keys()) {
      if (!freq.has(name)) firstSeen.push(name);
      freq.set(name, (freq.get(name) ?? 0) + 1);
    }
  }

  // Choose parameter columns.
  let paramNames: string[];
  if (opts.preferredAttributes && opts.preferredAttributes.length > 0) {
    // The user named specs — show exactly those that resolve, and nothing else. If NONE
    // resolve, leave the table spec-less rather than auto-filling UNRELATED specs the
    // user didn't ask for: showing "Vceo Max" for a "Vce(sat)" request misrepresents
    // relevance, which is worse than an honest gap (review finding #5 — the honest
    // resolution; the model's takeaway can note the spec isn't available).
    const chosen: string[] = [];
    for (const term of opts.preferredAttributes) {
      const m = matchParamName(term, firstSeen);
      if (m && !chosen.includes(m)) chosen.push(m);
    }
    paramNames = chosen;
  } else {
    const cap = opts.maxParamColumns ?? DEFAULT_MAX_PARAM_COLUMNS;
    // For 1-2 parts, surface the UNION (threshold 1) so a spec only ONE part carries —
    // the actual point of difference — isn't hidden, and a lone resolved part still
    // shows its specs (review finding S7 + the single-part case of #5). For larger sets,
    // require a spec to be shared by at least half the parts to keep it legible. Order
    // by frequency desc, then first-seen.
    const threshold = uniqueParts.length <= 2 ? 1 : Math.max(2, Math.ceil(uniqueParts.length / 2));
    paramNames = firstSeen
      .filter((n) => (freq.get(n) ?? 0) >= threshold)
      .sort((a, b) => (freq.get(b)! - freq.get(a)!) || firstSeen.indexOf(a) - firstSeen.indexOf(b))
      .slice(0, cap);
  }

  // Assemble columns. Fixed columns appear only when at least one part has the data.
  const columns: ComparisonColumn[] = [{ key: 'mpn', label: 'MPN' }];
  if (uniqueParts.some((p) => p.manufacturer)) columns.push({ key: 'manufacturer', label: 'Manufacturer' });
  if (uniqueParts.some((p) => p.status)) columns.push({ key: 'status', label: 'Status' });
  for (const name of paramNames) columns.push({ key: `p:${name}`, label: name });
  if (uniqueParts.some((p) => p.qualifications && p.qualifications.length > 0)) {
    columns.push({ key: 'qualifications', label: 'Qualifications' });
  }
  if (uniqueParts.some((p) => typeof p.distributorCount === 'number')) {
    columns.push({ key: 'distributors', label: 'Distributors' });
  }

  // Assemble rows.
  const rows = uniqueParts.map((p, i) => {
    const cells: Record<string, string> = { mpn: p.mpn };
    cells.manufacturer = p.manufacturer || MISSING;
    cells.status = p.status || MISSING;
    for (const name of paramNames) cells[`p:${name}`] = paramMaps[i].get(name) ?? MISSING;
    cells.qualifications =
      p.qualifications && p.qualifications.length > 0 ? p.qualifications.join(', ') : MISSING;
    cells.distributors =
      typeof p.distributorCount === 'number' ? String(p.distributorCount) : MISSING;
    return { mpn: p.mpn, cells };
  });

  return { columns, rows };
}
