/**
 * Chinese traditional → simplified normalization, via opencc-js.
 *
 * Built for "Traditional + Simplified Atlas" — we accept Chinese param
 * names in either form. Downstream lookups (dict matching, audit checks)
 * call toSimplified() before comparing against atlasMapper.ts entries
 * (which are simplified-only by convention).
 *
 * The converter is lazy-loaded as a module-level singleton — opencc-js
 * builds a trie at construction time, so we want exactly one instance
 * per process.
 *
 * Conversion mode: tw → cn (Taiwan traditional → mainland simplified).
 * Covers ~99% of traditional chars we expect to see in datasheet prose.
 * HK-specific variants are rare in technical Chinese; if they surface we
 * can add a parallel converter.
 *
 * First use point (Decision #195 Phase 2): atlasFamilyCardAudit.ts
 * FABRICATED_DICT check — recognize traditional-char card phrases as
 * matches against simplified dict entries. Wider rollout to
 * scripts/atlas-ingest.mjs param lookup is tracked in BACKLOG.
 */

import { Converter, type ConverterFunction } from 'opencc-js';

let _converter: ConverterFunction | null = null;

function getConverter(): ConverterFunction {
  if (!_converter) {
    _converter = Converter({ from: 'tw', to: 'cn' });
  }
  return _converter;
}

/** Returns the simplified-Chinese form of `s`. ASCII / mixed strings
 *  pass through unchanged; the converter only touches CJK chars. Safe
 *  to call on any string. */
export function toSimplified(s: string): string {
  if (!s) return s;
  return getConverter()(s);
}

/** True if `s` contains at least one character that differs after
 *  traditional→simplified conversion. Use as a cheap guard before
 *  spending a second dict lookup on the simplified form. */
export function hasTraditionalChars(s: string): boolean {
  return toSimplified(s) !== s;
}
