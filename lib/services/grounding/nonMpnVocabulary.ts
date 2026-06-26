/**
 * Non-MPN vocabulary + known MPN-family patterns for the unverified-MPN detector
 * (docs/mpn-grounding-gate-plan.md, step 2).
 *
 * Per the plan's audit (Reviewer A), the list of "ordinary electronics terms that
 * must NOT be mistaken for part numbers" is DERIVED PROGRAMMATICALLY from the logic
 * tables — attribute names and their categorical value vocab (dielectric codes,
 * upgrade hierarchies, value-alias groups) — so it self-maintains as families are
 * added, rather than being a hand-tended denylist that drifts. A curated SEED covers
 * the terms the logic tables don't enumerate (package codes, qualification standards,
 * common interface acronyms).
 *
 * Everything is stored in the detector's loose-normalized form (lowercase, no
 * whitespace) so lookups are O(1).
 */

import { getAllLogicTables } from '../../logicTables';
import { normalizeTokenLoose } from './mpnDetector';

// Terms the logic tables don't carry as enumerated values. Kept focused on purpose:
// the observe-only rollout phase surfaces what's actually emitted in prose, and we
// grow this from real logs rather than guessing exhaustively up front.
const SEED_VOCABULARY: readonly string[] = [
  // Package / case families (and their hyphenated pin-count variants).
  'sot-23', 'sot-23-3', 'sot-23-5', 'sot-23-6', 'sot-223', 'sot-223-4', 'sot-323',
  'sot-363', 'sot-523', 'sot-723', 'sot-89', 'sc-59', 'sc-70', 'sc-75', 'sc-88',
  'to-92', 'to-220', 'to-247', 'to-251', 'to-252', 'to-263', 'to-3', 'to-126',
  'do-15', 'do-27', 'do-35', 'do-41', 'do-201', 'do-204', 'do-213', 'do-214',
  'do-214ac', 'do-214aa', 'do-214ab', 'sma', 'smb', 'smc', 'sod-123', 'sod-323',
  'sod-523', 'sod-723', 'sod-882', 'dfn1006', 'dfn', 'qfn', 'tqfp', 'lqfp', 'tssop',
  'msop', 'soic', 'sop', 'sot', 'wlcsp', 'bga', 'lga', 'dpak', 'd2pak', 'powerpak',
  // Dielectric / temperature-coefficient codes (most also derived from tables).
  'c0g', 'np0', 'x7r', 'x5r', 'x6s', 'x7s', 'x8r', 'x8g', 'y5v', 'z5u', 'u2j',
  // Qualification / interface standards (canonical forms only — tight no-space forms
  // like "iso1042" are deliberately NOT excluded since they collide with real MPNs).
  'aec-q100', 'aec-q101', 'aec-q200', 'aecq100', 'aecq101', 'aecq200',
  'q100', 'q101', 'q200', 'rs-485', 'rs485', 'rs-422', 'rs422', 'rs-232', 'rs232',
  'mil-std', 'mil-std-883', 'ul94', 'ul1577', 'iso', 'iec', 'iatf', 'ipc',
  'rohs', 'reach', 'eccn', 'msl', 'hts',
  // Interface / logic acronyms that are MPN-shaped (letters+digits, len ≥ 4).
  'usb2', 'usb3', 'usb4', 'i2c', 'i3c', 'a2b', 'can', 'canfd', 'can-fd', 'spi',
  'sata2', 'sata3', 'ddr3', 'ddr4', 'ddr5', 'lvds', 'lvpecl', 'cmos', 'hcmos',
];

/**
 * Known MPN-family prefix patterns. A match on an UNVERIFIED token means it looks like
 * a real manufacturer's part-numbering scheme yet we never pulled it → HIGH-confidence
 * fabrication. (Verified tokens are skipped before patterns run, so a real BC847 we
 * did pull is never flagged.) Starter set; expanded from observe-only logs.
 */
export const DEFAULT_MPN_FAMILY_PATTERNS: readonly RegExp[] = [
  /^bc\d/, /^bd\d/, /^2n\d/, /^2sa\d/, /^2sc\d/, /^2sj\d/, /^2sk\d/,
  /^1n\d/, /^mmbt\d/, /^mmsz\d/, /^mmbd/, /^bzx/, /^bzt/, /^bav\d/, /^bat\d/, /^bas\d/,
  /^smaj/, /^smbj/, /^smcj/, /^p6ke/, /^pesd/, /^esda/, /^sm[6b]t/,
  /^max\d/, /^lm\d/, /^lt[c]?\d/, /^tl\d/, /^ne\d/, /^ad[0-9]{3}/, /^adr\d/, /^ref\d/,
  /^op[0-9]{2}/, /^ina\d/, /^ti\d/, /^74[a-z]+\d/, /^cd4\d/, /^sn74/, /^hef4\d/,
  /^pc[0-9]{3}/, /^4n\d/, /^6n\d/, /^hcpl/, /^tlp\d/, /^il\d/,
  /^irf/, /^irl/, /^bss\d/, /^ao\d{3}/, /^si[0-9]{4}/, /^stp\d/, /^stn\d/, /^fdn\d/,
  /^stm32/, /^pic\d/, /^atmega/, /^attiny/, /^esp32/, /^esp8266/, /^nrf\d/,
];

let cached: Set<string> | null = null;

/**
 * Build (and memoize) the non-MPN vocabulary: logic-table-derived terms ∪ seed.
 * Logic tables are static at runtime, so it's computed once.
 */
export function buildNonMpnVocabulary(): Set<string> {
  if (cached) return cached;
  const vocab = new Set<string>();

  const addWords = (phrase: string | undefined) => {
    if (!phrase) return;
    // Whole phrase (e.g. "sot-23") AND each alphanumeric word ≥ 2 chars (e.g.
    // "package", "case" from "Package / Case").
    const loose = normalizeTokenLoose(phrase);
    if (loose.length >= 2) vocab.add(loose);
    for (const word of phrase.toLowerCase().split(/[^a-z0-9]+/)) {
      if (word.length >= 2) vocab.add(word);
    }
  };

  for (const table of getAllLogicTables()) {
    addWords(table.familyName);
    addWords(table.category);
    for (const rule of table.rules) {
      addWords(rule.attributeName);
      for (const v of rule.upgradeHierarchy ?? []) addWords(v);
      for (const v of rule.acceptedValues ?? []) addWords(v);
      for (const group of rule.valueAliases ?? []) for (const v of group) addWords(v);
    }
  }

  for (const term of SEED_VOCABULARY) vocab.add(normalizeTokenLoose(term));

  cached = vocab;
  return vocab;
}

/** Test-only: drop the memoized vocabulary so a rebuild reflects fresh input. */
export function _resetVocabularyCache(): void {
  cached = null;
}
