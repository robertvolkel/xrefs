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
 * First parameter name in the data that matches a requested `term`. Tries, in order:
 * exact, substring either direction, then a token match where EVERY significant
 * (non-generic) term token has a prefix-matching token in the name — so "Vce(max)"
 * resolves to "Vceo Max (Collector-Emitter Voltage)" while "Vce(sat)" does not.
 */
function matchParamName(term: string, allNames: string[]): string | null {
  const t = norm(term);
  if (!t) return null;

  const exact = allNames.find((n) => norm(n) === t);
  if (exact) return exact;

  const substr = allNames.find((n) => {
    const nn = norm(n);
    return nn.includes(t) || t.includes(nn);
  });
  if (substr) return substr;

  const termToks = tokenize(term).filter((tok) => !GENERIC_TOKENS.has(tok));
  if (termToks.length === 0) return null;
  return allNames.find((n) => {
    const nameToks = tokenize(n);
    return termToks.every((tt) => nameToks.some((nt) => tokenPrefixMatch(tt, nt)));
  }) ?? null;
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
    const chosen: string[] = [];
    for (const term of opts.preferredAttributes) {
      const m = matchParamName(term, firstSeen);
      if (m && !chosen.includes(m)) chosen.push(m);
    }
    paramNames = chosen;
  } else {
    const cap = opts.maxParamColumns ?? DEFAULT_MAX_PARAM_COLUMNS;
    // Include params shared by at least half the parts; order by frequency desc, then
    // first-seen. Comparable specs (shared across parts) surface first.
    const threshold = Math.max(2, Math.ceil(uniqueParts.length / 2));
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
