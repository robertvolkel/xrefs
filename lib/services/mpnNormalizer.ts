/**
 * MPN normalization helpers.
 *
 * Many distributors, manufacturers, and data sources append packaging
 * suffixes to MPNs (tape-and-reel, cut tape, reel size). The same
 * electrical part may appear as both `TPW4157` and `TPW4157-TR` in
 * different datasets — lookups keyed on the raw MPN will miss.
 *
 * Conservative strip list: only patterns that unambiguously indicate
 * packaging, never part-variant encoding (grade, tolerance, voltage).
 * Extend carefully — over-stripping produces false-positive matches.
 */

const PACKAGING_SUFFIX_PATTERNS: RegExp[] = [
  /-TR$/i,        // Tape & reel — most common
  /-T\/R$/i,      // Tape & reel (TI convention)
  /-REEL$/i,
  /-CT$/i,        // Cut tape
  /-7INCH$/i,     // 7" reel
  /-13INCH$/i,    // 13" reel
  /\/R7$/i,       // Samsung MLCC reel
];

/**
 * Return the MPN with any known packaging suffix removed.
 * Returns the input unchanged if no pattern matches.
 */
export function stripPackagingSuffix(mpn: string): string {
  for (const pattern of PACKAGING_SUFFIX_PATTERNS) {
    const stripped = mpn.replace(pattern, '');
    if (stripped !== mpn) return stripped;
  }
  return mpn;
}

/**
 * Return distinct lookup candidates for an MPN: the raw value, plus
 * a packaging-stripped variant if stripping changed the string.
 */
export function mpnLookupCandidates(mpn: string): string[] {
  const stripped = stripPackagingSuffix(mpn);
  return stripped === mpn ? [mpn] : [mpn, stripped];
}
