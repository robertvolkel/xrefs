/**
 * Atlas MPN quality validator (phase 1: detection only).
 *
 * Detects un-matchable MPN patterns that get ingested as single rows
 * but actually encode either a range of parts or a placeholder that no
 * exact-MPN lookup will hit. Surfaced in the per-batch IngestDiffReport
 * so engineers see the problem at ingest time instead of months later
 * when a user search misses.
 *
 * Phase 1 scope: detect only. No auto-expansion — that requires per-MFR
 * voltage-code sequence tables that we'd rather not maintain
 * speculatively. Engineers see the count + sample list and either:
 *   - Hand-fix in SQL (one-shot for known cases)
 *   - Push the upstream MFR / dataset provider to clean their export
 *   - Accept the un-matchable row (some are "Series" entries with no
 *     specific MPN to enumerate, e.g. "BAS40T Series")
 *
 * Phase 2 (separate BACKLOG item) adds per-MFR expansion tables.
 *
 * Three patterns observed across the dataset (May 2026 survey, 250+ rows):
 *   - CREATEK "thru"/"thur"/"through" ranges in B1, B3, B6
 *   - CREATEK/AWINIC/KEXIN "X Series" entries across many families
 *   - GIGADEVICE trailing-x placeholders (single-char variant)
 *   - Geehy slash-delimited two-MPNs-in-one-row
 */

export type MpnQualityIssueKind =
  | 'range_thru'
  | 'range_series'
  | 'placeholder_x'
  | 'placeholder_xx_midword'
  | 'slash_variant';

export interface MpnQualityIssue {
  /** The original raw MPN as it appeared in the source data. */
  originalMpn: string;
  /** Which detection rule fired. */
  kind: MpnQualityIssueKind;
  /** Engineer-facing one-line summary of what needs to be fixed. */
  reason: string;
}

/**
 * Inspect an MPN string for known un-matchable patterns. Returns the
 * matching issue or null when clean. The first matching pattern wins —
 * an MPN that fits multiple kinds (rare) gets the most specific match
 * we check first.
 */
export function detectMpnQualityIssue(rawMpn: string | null | undefined): MpnQualityIssue | null {
  if (!rawMpn) return null;
  const mpn = rawMpn.trim();
  if (!mpn) return null;

  // (1) Range delimiter words. CREATEK ships "Thru" / "thru" / "Thur" (their
  // own typo) / "Through" / "to". Each range row collapses 10-50 individual
  // MPNs. The match is case-insensitive on a whole-word boundary so we don't
  // false-positive on legitimate substrings like "TRU" inside a part code.
  if (/\b(thru|thur|through)\b/i.test(mpn)) {
    return { originalMpn: rawMpn, kind: 'range_thru', reason: 'Range entry — encodes multiple MPNs as a single row. Expand to individual parts or flag for upstream cleanup.' };
  }

  // (2) "Series" sentinel. CREATEK and AWINIC both use this; KEXIN was seen
  // using Chinese full-width parens around "Series" too. Match either.
  // Requires a leading non-alphanumeric or start-of-string so we don't
  // collide with MPNs that legitimately contain "series" as a substring
  // (none observed, but defensive).
  if (/(?:^|[^a-zA-Z])series\b/i.test(mpn) || /Series[）)]/.test(mpn)) {
    return { originalMpn: rawMpn, kind: 'range_series', reason: 'Series entry — refers to a family of parts rather than a single MPN. Replace with the specific variant(s) needed.' };
  }

  // (3) Trailing literal x/X placeholder. GIGADEVICE-style. The character
  // before the trailing x must be alphanumeric to avoid false positives
  // on legitimate suffixes (e.g., "-x" used by some MFRs as a real suffix).
  // We also exempt "TX"/"RX" word endings (transmit/receive code) by
  // requiring lowercase 'x' OR an uppercase 'X' that doesn't follow T/R.
  if (/[a-z0-9]x$/.test(mpn) || (/[a-z0-9]X$/.test(mpn) && !/[TR]X$/.test(mpn))) {
    return { originalMpn: rawMpn, kind: 'placeholder_x', reason: 'Placeholder MPN — trailing x/X encodes "any variant" rather than a specific part number. Enumerate the actual variants from the MFR datasheet.' };
  }

  // (3b) Mid-MPN "xx" placeholder. Gainsil-style — `GS2019-xxTR` /
  // `GS2019-xxCR` encode a variant code as literal "xx" between a prefix
  // and a packaging suffix. Lowercase double-x preceded by alphanumeric
  // or hyphen, followed by an alphabetic character + suffix to end of
  // MPN. Conservative — requires the alphabetic suffix so we don't false-
  // positive on legitimate MPNs that happen to contain "xx" mid-word.
  if (/[a-z0-9-]xx[A-Za-z][A-Za-z0-9-]*$/.test(mpn)) {
    return { originalMpn: rawMpn, kind: 'placeholder_xx_midword', reason: 'Placeholder MPN — mid-MPN "xx" encodes "any variant" between a prefix and a suffix (e.g. GS2019-xxTR). Enumerate the actual variant codes from the MFR datasheet.' };
  }

  // (4) Slash-delimited variants. Geehy "GHD3440/3440R" — two related MPNs
  // collapsed into one row. Slash isn't a legal MPN character at any MFR
  // we've seen, so its presence reliably flags this pattern.
  if (/[A-Za-z0-9]\/[A-Za-z0-9]/.test(mpn)) {
    return { originalMpn: rawMpn, kind: 'slash_variant', reason: 'Slash-delimited row — two related MPNs collapsed into one. Split on slash and ingest as separate rows.' };
  }

  return null;
}

/**
 * Per-MFR rollup helper. Given an iterable of detection results, returns
 * counts by kind plus the first N samples for the diff-report UI.
 */
export interface MpnQualitySummary {
  totalIssues: number;
  byKind: Record<MpnQualityIssueKind, number>;
  /** First N issue samples for engineer review (sorted by kind). */
  samples: MpnQualityIssue[];
}

export function summarizeMpnQualityIssues(
  issues: Iterable<MpnQualityIssue>,
  maxSamples = 25,
): MpnQualitySummary {
  const byKind: Record<MpnQualityIssueKind, number> = {
    range_thru: 0,
    range_series: 0,
    placeholder_x: 0,
    placeholder_xx_midword: 0,
    slash_variant: 0,
  };
  const all: MpnQualityIssue[] = [];
  for (const i of issues) {
    byKind[i.kind]++;
    all.push(i);
  }
  // Sort samples by kind (stable ordering) so the UI is predictable.
  const KIND_ORDER: MpnQualityIssueKind[] = ['range_thru', 'range_series', 'placeholder_x', 'placeholder_xx_midword', 'slash_variant'];
  all.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  return {
    totalIssues: all.length,
    byKind,
    samples: all.slice(0, maxSamples),
  };
}
