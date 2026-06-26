/**
 * Verified set — the catalog-grounded allowlist of part numbers (and manufacturer
 * names) the system actually pulled during a conversation.
 *
 * This is the FOUNDATION of the grounded-MPN work (see docs/mpn-grounding-gate-plan.md).
 * Every other piece — the unverified-MPN detector, the observe-only logger, the
 * backstop gate — validates against a VerifiedSet. Nothing in here is wired into the
 * live chat path yet; these are pure, side-effect-free functions so the trickiest
 * logic can be unit-tested in isolation.
 *
 * Two design points the plan's audit made load-bearing:
 *
 *  1. ACCUMULATE ACROSS THE WHOLE CONVERSATION, never a single-turn snapshot. The app
 *     today rebuilds its "known parts" set from the CURRENT search/recommendations only
 *     (replaced on every new search, wiped on reset), so a part the customer saw three
 *     turns ago is forgotten. A gate built on that snapshot would strip legitimate
 *     older-turn parts. `extendVerifiedSet` unions immutably so callers can carry the
 *     set forward turn over turn (keyed on conversation id at the wiring layer).
 *
 *  2. ERROR ASYMMETRY for matching. Treating a token as verified when it's a packaging
 *     variant of a real catalog part (false-SAFE) is harmless — it IS that part. Failing
 *     to match a real verified part because of a suffix/whitespace difference
 *     (false-UNVERIFIED) would strip a legitimate part. So the match-normalizer is
 *     deliberately MORE aggressive than the conservative lookup normalizer
 *     (`mpnNormalizer.stripPackagingSuffix`, which must stay narrow to avoid bad lookups).
 */

/** A batch of things the system surfaced this turn, to fold into the verified set. */
export interface GroundingContribution {
  /** Parts pulled from the catalog (search matches, recommendations, attribute lookups,
   *  the confirmed source part). Each carries its MPN and, when known, its manufacturer. */
  catalogParts?: ReadonlyArray<{ mpn?: string | null; manufacturer?: string | null }>;
  /** Manufacturer names surfaced on their own (e.g. a manufacturer-profile lookup). */
  mfrNames?: ReadonlyArray<string | null | undefined>;
  /** MPNs the USER typed. Mentionable (echoing the user's own input is never a
   *  fabrication) but NOT catalog-verified — tracked separately so the gate can
   *  route them to a lookup rather than treat them as confirmed. */
  userMpns?: ReadonlyArray<string | null | undefined>;
}

/** The accumulated catalog-grounded allowlist for one conversation. All entries are
 *  stored in match-normalized form; use the helpers to test raw tokens against it. */
export interface VerifiedSet {
  /** Normalized MPNs the system pulled from the catalog. */
  readonly mpns: ReadonlySet<string>;
  /** Normalized manufacturer names from those same lookups. */
  readonly mfrs: ReadonlySet<string>;
  /** Normalized MPNs the user typed (mentionable, not catalog-verified). */
  readonly userMpns: ReadonlySet<string>;
}

// Packaging / reel / tape suffixes stripped FOR MATCHING ONLY. Superset of
// mpnNormalizer's conservative lookup list — here a false merge is cheap (see header
// note 2). Applied after lowercasing + whitespace removal, looped to stable.
const MATCH_SUFFIX_PATTERNS: readonly RegExp[] = [
  /-tr$/, // tape & reel
  /-t\/r$/, // tape & reel (TI)
  /-reel$/,
  /-ct$/, // cut tape
  /-tp$/, // tape
  /-tb$/, // tube/bulk
  /-rl$/, // reel
  /-7inch$/,
  /-13inch$/,
  /\/r7$/, // Samsung MLCC reel
  /,\d{2,4}$/, // Nexperia/Philips reel code, e.g. "BC846BW,115"
];

// Corporate-form words dropped when normalizing a manufacturer name, so "Nexperia USA
// Inc." and "Nexperia" can be compared. Order-independent; applied as whole tokens.
const MFR_NOISE_WORDS: ReadonlySet<string> = new Set([
  'inc', 'incorporated', 'corp', 'corporation', 'co', 'company', 'ltd', 'limited',
  'llc', 'gmbh', 'ag', 'plc', 'sa', 'srl', 'bv', 'nv', 'kk', 'pte', 'pty',
  'group', 'holdings', 'electronics', 'semiconductor', 'semiconductors',
  'technology', 'technologies', 'microelectronics',
]);

/**
 * Normalize an MPN for grounding comparison: lowercase, strip whitespace, remove
 * trailing packaging/reel suffixes (looped to stable). Aggressive by design (see
 * header note 2). Returns '' for blank input.
 */
export function normalizeMpnForMatch(raw: string | null | undefined): string {
  if (!raw) return '';
  let s = raw.trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return '';
  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of MATCH_SUFFIX_PATTERNS) {
      const next = s.replace(pattern, '');
      if (next !== s) {
        s = next;
        changed = true;
      }
    }
  }
  return s;
}

/**
 * Normalize a manufacturer name for grounding comparison: lowercase, strip
 * punctuation, drop corporate-form noise words, collapse whitespace. So
 * "Nexperia USA Inc." → "nexperia usa", "onsemi" → "onsemi". Returns '' for blank.
 */
export function normalizeMfrForMatch(raw: string | null | undefined): string {
  if (!raw) return '';
  const cleaned = raw
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  const kept = cleaned.split(' ').filter((w) => w && !MFR_NOISE_WORDS.has(w));
  return kept.join(' ').trim();
}

/** An empty verified set — the starting point for a fresh conversation. */
export function emptyVerifiedSet(): VerifiedSet {
  return { mpns: new Set(), mfrs: new Set(), userMpns: new Set() };
}

/**
 * Fold a turn's contribution into the verified set, returning a NEW immutable set
 * (the input is never mutated). Union semantics: entries only accumulate, so a part
 * surfaced on an earlier turn stays verified after later searches replace the visible
 * cards — the core accumulation fix from the plan's audit.
 */
export function extendVerifiedSet(
  base: VerifiedSet,
  contribution: GroundingContribution,
): VerifiedSet {
  const mpns = new Set(base.mpns);
  const mfrs = new Set(base.mfrs);
  const userMpns = new Set(base.userMpns);

  for (const part of contribution.catalogParts ?? []) {
    const m = normalizeMpnForMatch(part?.mpn);
    if (m) mpns.add(m);
    const mfr = normalizeMfrForMatch(part?.manufacturer);
    if (mfr) mfrs.add(mfr);
  }
  for (const name of contribution.mfrNames ?? []) {
    const mfr = normalizeMfrForMatch(name);
    if (mfr) mfrs.add(mfr);
  }
  for (const u of contribution.userMpns ?? []) {
    const m = normalizeMpnForMatch(u);
    if (m) userMpns.add(m);
  }

  return { mpns, mfrs, userMpns };
}

/** True if `token` matches a part the system pulled from the catalog. */
export function isVerifiedMpn(set: VerifiedSet, token: string): boolean {
  const m = normalizeMpnForMatch(token);
  return m.length > 0 && set.mpns.has(m);
}

/** True if `token` is verified OR was typed by the user (echo-allowed, see plan §"action"). */
export function isMentionableMpn(set: VerifiedSet, token: string): boolean {
  const m = normalizeMpnForMatch(token);
  if (!m) return false;
  return set.mpns.has(m) || set.userMpns.has(m);
}

/**
 * True if `token` matches a verified manufacturer name. Matches on normalized
 * equality OR when one side is a whole-token-prefix of the other (so prose "Nexperia"
 * matches the catalog's "Nexperia USA Inc." and vice-versa). Preliminary — full prose
 * MFR detection is a later step in the plan.
 */
export function isVerifiedMfr(set: VerifiedSet, token: string): boolean {
  const t = normalizeMfrForMatch(token);
  if (!t) return false;
  if (set.mfrs.has(t)) return true;
  for (const known of set.mfrs) {
    if (known === t) return true;
    if (known.startsWith(t + ' ') || t.startsWith(known + ' ')) return true;
  }
  return false;
}
