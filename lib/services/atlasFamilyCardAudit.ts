/**
 * Atlas Family Domain Card — Auto-Audit (Decision #195 Phase 2)
 *
 * TS port of scripts/atlas-audit-domain-cards.mjs. Cross-checks one card's
 * text against atlas_products + lib/services/atlasMapper.ts to surface four
 * hallucination classes:
 *
 *   1. BOGUS_MFR       — Card names an MFR that doesn't ship under family.
 *   2. OMITTED_MFR     — Top-volume MFR in family not mentioned in card.
 *   3. WRONG_PREFIX    — Claimed MPN prefix doesn't match MFR's actual MPNs.
 *   4. FABRICATED_DICT — Claimed Chinese→canonical mapping not in atlasMapper.
 *
 * Heuristic / regex-driven — false positives expected. Goal: surface things
 * for engineer eyeball, not gate publication silently.
 *
 * Severity (Decision #197 — revised from #195 Phase 2):
 *   - issueCount (BLOCK-level) counts BOGUS_MFR + WRONG_PREFIX only. Both
 *     are verified against atlas_products — reliable.
 *   - FABRICATED_DICT + OMITTED_MFR are WARN-level (advisory, don't gate
 *     Approve). FABRICATED_DICT was downgraded from block because it
 *     substring-matches atlasMapper.ts and surfaces dict COVERAGE GAPS,
 *     not hallucinations — 5 consecutive cards produced 0 real catches.
 *   - severity 'block' when issueCount >= 1.
 *   - severity 'warn'  when only advisory items present.
 *   - severity 'clean' otherwise.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createServiceClient } from '@/lib/supabase/service';
import { toSimplified } from './chineseNormalize';

// ── tuneables (mirror of .mjs constants) ──
const PREFIX_OMISSION_MFR_COUNT = 10;
const SAMPLE_MPN_LIMIT = 20;
const OMIT_MIN_PRODUCTS = 100;
const OMIT_MIN_SHARE = 0.03;
// Share threshold at which an OMITTED_MFR escalates from editorial advisory
// to block-level. 15% is below the typical top-2 / top-3 cohort share —
// any MFR shipping ≥15% of a family is large enough that omitting it
// silently means the card asserts a cohort that doesn't match the data.
// Below this threshold (e.g. 5%), the omission stays advisory — minor
// editorial trim that doesn't justify blocking Approve.
const OMIT_BLOCK_SHARE = 0.15;

// MFRs whose names collide with common technical abbreviations used in
// datasheet prose. Mirror of .mjs blocklist — see notes there.
const MFR_NAME_BLOCKLIST = new Set([
  'DC', 'AC', 'HC', 'PTC', 'NTC', 'TC', 'BC', 'RS', 'CS', 'MAX', 'Fast', 'Milliohm', 'TVS', 'LED', 'IC',
  // VIBRATION (a real Chinese MFR, display name "VIBRATION 振浩微") collides
  // with the English word "vibration" used in datasheet prose around shock/
  // vibration characterization. Same trade as DC/AC/HC — small blind spot,
  // less false-positive noise.
  'VIBRATION',
  // CTR — "Current Transfer Ratio", THE central optocoupler spec
  // (output current ÷ input current). Every E1 card mentions it many
  // times. Collides with minor Chinese MFR "CTR 长泰尔电子".
  'CTR',
  // FTR — tolerance/packaging letter-code suffix on resistor MPNs
  // (e.g. AMF03FTTR001, RAS12FTN1000, MRF6432(2512)LR001FTR). Cards for
  // resistor families 52/53/54/55 routinely cite these suffixes in their
  // NAMING sections. Collides with minor Chinese MFR "FTR 乔光电子".
  'FTR',
  // HT — "High Temperature" qualifier used in datasheet prose
  // (e.g. "SiC HT 175°C" on the C3 Gate Drivers card). Collides with
  // minor Chinese MFR "HT 金誉" which ships zero products in any family
  // — yet its registration alone was tripping the word-boundary regex
  // on space-bounded " HT " in temperature-anchor prose.
  'HT',
  // SY — Silergy MPN prefix shorthand. C2 Switching Regulators card cites
  // "SM/SY (SILERGY)" in its prefix-attribution list. Collides with minor
  // Chinese MFR "SY 顺烨" which ships zero C2 products. Same trade as TC/BC/RS.
  'SY',
  // THD — "Total Harmonic Distortion", a central ADC/DAC/op-amp spec.
  // C9 ADCs card cites it in its UNITS line. Collides with minor Chinese
  // MFR "THD 台华达" (0 C9 products). Will also help future C4/C10 cards.
  'THD',
  // TLC — TI's TLC-series MPN prefix (TLC1543, TLC555, etc.) cited as a
  // second-source clone anchor in C9 (HGSEMI clones) and likely future
  // C1/C4/C8 cards. Collides with minor Chinese MFR "TLC 竞沃".
  'TLC',
  // TR — UNIVERSAL packaging suffix for Tape-and-Reel (M/TR, /TR, -TR,
  // etc.) on virtually every SMD IC and discrete. Cards across all IC
  // families cite this in NAMING / vendor-suffix prose. Collides with
  // minor Chinese MFR "TR 湖北天瑞" (0 products in C4, near-zero elsewhere).
  'TR',
  // SST — SMC's actual TRIAC MPN prefix (SST04K-800SW, SST06A-800BW,
  // SST138C-600E, etc.) cited in B8 Thyristors card as "SST (SMC)".
  // Collides with minor Chinese MFR "SST 索斯特" which ships zero
  // products in any family — yet its registration alone trips the
  // word-boundary regex on standalone "SST" tokens in prefix prose.
  'SST',
  // HR — Hanrun's actual MPN prefix on family-69 CM chokes (HR01XXXX,
  // HR110XXX, HR34XXXX, HR630201/501/602/610-XXX). Card 69 cites it as
  // "Hanrun (HR)". Collides with minor Chinese MFR "HR 灿达" (slug 'hr',
  // 0 family-69 products) — auditor's alias resolver picks the wrong row
  // and false-flags the legitimate prefix annotation as a bogus MFR.
  'HR',
  // CW — YMIN's aluminum-electrolytic MPN series prefix (CW32G221MNNZS04S2,
  // CW62G101MNNZS02S2) cited in Family 58 card as a YMIN series anchor.
  // Collides with minor Chinese MFR "CW 武汉芯源" which ships zero F58
  // products. Same trade as TR/SST/HR.
  'CW',
  // AM — INPAQ's bidirectional-variant packaging suffix on the 5.0SMDJ TVS
  // series (5.0SMDJxxxA-A / -AM). Family 70 TVS Diodes card cites it in
  // MPN-prefix prose as "5.0SMDJxxxA-A / -AM (INPAQ)". Collides with minor
  // Chinese MFR "AM 安美" which ships zero B4 products. Same trade as
  // TR/SST/HR/CW. Also produces a "Fix with AI" no-op loop: the AI can't
  // find anything to fix in the legitimate -AM suffix annotation, returns
  // a near-no-op proposal, audit re-fires the same false positive on accept.
  'AM',
  // HX — HGC's actual op-amp MPN prefix (HX358, HX324, etc.) cited on
  // card C4 Op-Amps in the house-prefixes line as "HX... (HGC)". Collides
  // with TWO minor Chinese MFRs sharing the bare ASCII name "HX" ("HX 红星"
  // and "HX 恒生兴") that ship zero C4 products. Both rows trip the same
  // false flag. Also produced the Fix-with-AI no-op loop. Same trade as
  // TR/SST/HR/CW/AM.
  'HX',
  // TD — TDSEMIC's clone-suffix annotation on C9 ADC card ("-TD" (TDSEMIC)
  // alongside "-HXY" (HXYMOS) in the MFR COHORT clone-suffix list).
  // Collides with minor Chinese MFR "TD 钍地半导体" which ships zero C9
  // products. TD is also a common suffix shape in MPN naming conventions
  // generally. Same trade as TR/SST/HR/CW/AM/HX. Also caused Fix-with-AI
  // no-op loop.
  'TD',
]);

// Trigger phrases that, when they appear shortly BEFORE a MFR mention, mean
// the mention is a NEGATIVE-LIST instruction ("do not introduce X") rather
// than a positive claim that X ships under this family. Card authors and
// engineers legitimately list "Do not introduce Epson, SiTime, Abracon, …"
// to constrain the Triage AI — those mentions shouldn't get flagged as
// hallucinations. We look back ~60 chars before each MFR mention; if any
// of these phrases is found in the lookback, the mention is exempt.
const NEGATIVE_LIST_TRIGGERS = [
  'do not introduce',
  'do not include',
  'do not mention',
  'do not use',
  'don\'t introduce',
  'don\'t include',
  'don\'t use',
  'not present in',
  'not in atlas',
  'avoid ',
  'exclude ',
  'never ',
  'etc.',
  'such as',  // "Western majors such as X / Y / Z" — same shape
  // "Competitor MFR being described, not claimed as shipping" patterns —
  // common in Chinese-MFR cohort cards explaining what Western MFRs the
  // Chinese second-sources are cloning ("MPNs echo MAX/ADM legacy
  // numbering", "Slkor parts are pin-compatible with TI").
  'echo ',
  'clone ',
  'cloning ',
  'compatible with ',
  'second-source ',
  'second-sources ',
  'drop-in for ',
  'pin-compatible ',
  'mimics ',
  'successor to ',
];

// Chinese unit words. These are UNITS, never parameter names — they show
// up in card prose as annotations like `英吋(公釐)` ("inch(mm)") on
// package-size mappings. The FABRICATED_DICT check skips them so a unit
// word adjacent to a mapping arrow doesn't get mistaken for a fabricated
// canonical mapping. Expand as new unit words surface. Both traditional
// and simplified forms listed since cards use either.
const CHINESE_UNIT_WORDS = new Set([
  '英吋', '英时', '英寸',        // inch (traditional / variant / simplified)
  '公釐', '毫米',                // millimetre
  '公分', '厘米',                // centimetre
  '伏特', '安培', '欧姆', '歐姆', // volt / amp / ohm
  '瓦特', '赫兹', '赫茲',        // watt / hertz
  '法拉', '亨利',                // farad / henry
]);

function isNegativeListContext(text: string, mfrMatchIndex: number): boolean {
  // Look back ~60 chars from the start of the MFR mention. Bound the window
  // so a trigger phrase far earlier in the card doesn't immunize unrelated
  // later mentions.
  const lookbackStart = Math.max(0, mfrMatchIndex - 60);
  const window = text.slice(lookbackStart, mfrMatchIndex).toLowerCase();
  return NEGATIVE_LIST_TRIGGERS.some((trigger) => window.includes(trigger));
}

// Descriptor words that — when they appear immediately after a quoted
// short-ASCII token — signal the token is describing an MPN affix/series/
// code, not a MFR. Real example: `"AM" suffix` on LRC parts in B3 Zener
// cards — "AM" the suffix is unrelated to "AM 安美" the MFR.
const QUOTED_DESCRIPTOR_WORDS = ['suffix', 'prefix', 'series', 'designator', 'code', 'marker', 'tag'];

function isQuotedDescriptorContext(text: string, mentionIndex: number, name: string): boolean {
  const before = mentionIndex > 0 ? text[mentionIndex - 1] : '';
  const after = text[mentionIndex + name.length] ?? '';
  const isQuotedBothSides =
    (before === '"' || before === "'" || before === '`') &&
    (after === '"' || after === "'" || after === '`');
  if (!isQuotedBothSides) return false;
  // Look at the ~30 chars after the closing quote for a descriptor word.
  const afterQuoteStart = mentionIndex + name.length + 1;
  const window = text.slice(afterQuoteStart, afterQuoteStart + 30).toLowerCase();
  return QUOTED_DESCRIPTOR_WORDS.some((w) => window.includes(w));
}

/** True if the short-ASCII MFR token is followed by `-<digit>` — the
 *  token is part of a standard / protocol / model-number designator,
 *  not a MFR claim. Real examples: `RS-485`, `RS-422` (serial standards),
 *  `USB-2`, `USB-3` (USB versions), `IEC-61000` (standards body codes).
 *  RS collides with `RS 容硕`; MAX collides with Maxim. */
function isProtocolNumberContext(text: string, mentionIndex: number, name: string): boolean {
  const afterStart = mentionIndex + name.length;
  if (text[afterStart] !== '-') return false;
  const next = text[afterStart + 1] ?? '';
  return /\d/.test(next);
}

/** True if the short-ASCII MFR token is followed by `-<descriptor>` —
 *  the token is describing an MPN affix convention, not making a MFR
 *  claim. Real example: `TKD (TC-prefix)` on C8 cards. Sibling of
 *  isQuotedDescriptorContext (handles `"TC" suffix`) and
 *  isMpnSuffixContext (handles `5.0SMDJ10A-AM`). */
function isDashDescriptorContext(text: string, mentionIndex: number, name: string): boolean {
  const afterStart = mentionIndex + name.length;
  if (text[afterStart] !== '-') return false;
  const window = text.slice(afterStart + 1, afterStart + 1 + 20).toLowerCase();
  return QUOTED_DESCRIPTOR_WORDS.some((w) => window.startsWith(w));
}

/** True if the short-ASCII MFR token appears as an MPN suffix —
 *  preceded by `-` immediately following an MPN-shaped string (4-12
 *  alphanumeric chars containing at least one digit). Real example:
 *  `5.0SMDJ10A-AM` (INPAQ part-variant suffix) collides with MFR
 *  AM 安美; `1.5KE10A-AM` is the same shape. The token is a
 *  part-number suffix, not a MFR claim. */
function isMpnSuffixContext(text: string, mentionIndex: number): boolean {
  if (mentionIndex < 2) return false;
  if (text[mentionIndex - 1] !== '-') return false;
  // Walk backward from the hyphen, gathering MPN-shape chars (uppercase
  // alphanumerics + dot). Cap at 12 chars to avoid catching long prose.
  let cursor = mentionIndex - 2;
  const minStart = Math.max(0, mentionIndex - 1 - 12);
  while (cursor >= minStart && /[A-Z0-9.]/.test(text[cursor] ?? '')) cursor--;
  const mpnCandidate = text.slice(cursor + 1, mentionIndex - 1);
  if (mpnCandidate.length < 4) return false;
  // Must contain at least one digit — bare alpha prefixes like "ABC-XYZ"
  // shouldn't be treated as MPNs.
  return /[0-9]/.test(mpnCandidate);
}

/** True if the short-ASCII token sits inside a slash- or comma-separated
 *  acronym enumeration in parens — e.g. `(FS/HS/SS)`, `(HBM/MM/CDM)`,
 *  `(LV/HV)`. The token is one item in a list of technical acronyms
 *  (USB speed grades, ESD model classes, voltage tech families, etc.),
 *  not a MFR claim.
 *
 *  Safety: requires ≥2 chunks AND every chunk to be ≤6 chars of pure
 *  alphanumerics. Single-token parens (`(LX)`) are handled by
 *  isMfrAttributionContext; longer/multi-word names won't match.
 *
 *  Replaces the manual blocklist for HS (USB High-Speed) and pre-empts
 *  the same shape in future cards. */
function isAcronymListContext(
  text: string,
  mentionIndex: number,
  name: string,
): boolean {
  const before = text.slice(Math.max(0, mentionIndex - 60), mentionIndex);
  const after = text.slice(mentionIndex + name.length, mentionIndex + name.length + 60);
  const lastOpen = before.lastIndexOf('(');
  if (lastOpen === -1) return false;
  // Bail if a close-paren appears between open and mention (we'd be outside).
  if (before.slice(lastOpen + 1).includes(')')) return false;
  const firstClose = after.indexOf(')');
  if (firstClose === -1) return false;
  const inner = before.slice(lastOpen + 1) + name + after.slice(0, firstClose);
  if (!/[/,]/.test(inner)) return false;
  const chunks = inner.split(/[/,]/).map((s) => s.trim()).filter(Boolean);
  if (chunks.length < 2) return false;
  return chunks.every((c) => /^[A-Za-z0-9]{1,6}$/.test(c));
}

/** True if the short-ASCII token sits in an MFR-attribution shape — the
 *  card is annotating an MPN prefix / suffix and pointing it AT another
 *  real MFR, rather than asserting this token itself ships parts.
 *
 *  Two shapes catch ~all observed cases:
 *    1. Forward attribution:  `<X>...  (<REAL_MFR>)`
 *       e.g. `"-TD" (TDSEMIC)`, `"HX..." (HGC)`, `"-AM" (INPAQ)`,
 *            `SM/SY (SILERGY)`, `CY... (Sunlord)`
 *    2. Inverse attribution:  `<REAL_MFR> (<X>...)`
 *       e.g. `Hanrun (HR)`, `Linear Tech (LT)`
 *
 *  Safety: only exempts when the parenthetical (or pre-paren) word is a
 *  KNOWN MFR in the alias resolver. Generic English words in parens
 *  ("clones", "suffix") won't false-exempt — those are already covered
 *  by isDashDescriptorContext / isQuotedDescriptorContext.
 *
 *  Replaces ~8 manual blocklist additions (TR/SST/HR/CW/AM/HT/HX/TD) and
 *  pre-empts future ones — every one of those tokens fits one of these
 *  two shapes in the card that triggered the false positive. */
function isMfrAttributionContext(
  text: string,
  mentionIndex: number,
  name: string,
  knownMfrNames: Set<string>,
): boolean {
  // Forward: `<X>...  (<MFR>)` — mention followed (within ~20 chars of
  // wrapping punctuation/whitespace) by a parenthetical that names a real
  // MFR. Accept comma-separated first chunk so `(YANGJIE, dual common-anode)`
  // resolves on YANGJIE.
  const afterStart = mentionIndex + name.length;
  const fwdWindow = text.slice(afterStart, afterStart + 60);
  const fwdMatch = fwdWindow.match(/^[.…"'`\-\s/]{0,20}\(([^)]{1,80})\)/);
  if (fwdMatch) {
    const inner = fwdMatch[1].split(/[,;]/)[0].trim().toLowerCase();
    if (inner && knownMfrNames.has(inner)) return true;
  }
  // Inverse: `<MFR> (<X>...)` — mention is inside an unclosed paren whose
  // preceding token (right up to the open-paren) is a real MFR.
  const beforeWindow = text.slice(Math.max(0, mentionIndex - 80), mentionIndex);
  const lastOpen = beforeWindow.lastIndexOf('(');
  if (lastOpen !== -1) {
    const inBeforeParens = beforeWindow.slice(lastOpen + 1);
    // Only "inside parens" if no close-paren appeared between open and mention.
    if (!inBeforeParens.includes(')')) {
      const preParen = beforeWindow.slice(0, lastOpen).replace(/\s+$/, '');
      // Trailing MFR-shaped word: capital-led, ≤30 chars, may have space/dash/dot.
      // Walk back through up to ~3 words to handle "Linear Tech (LT)".
      const tail = preParen.match(/([A-Z][A-Za-z0-9./\- ]{1,40})$/);
      if (tail) {
        const candidate = tail[1].trim().toLowerCase();
        if (knownMfrNames.has(candidate)) return true;
        // Try last single word too (handles "the Hanrun (HR)" → "Hanrun")
        const lastWord = candidate.split(/\s+/).pop();
        if (lastWord && knownMfrNames.has(lastWord)) return true;
      }
    }
  }
  return false;
}

// ── public types ──
// Types live in a sibling file so client components (e.g. the admin panel)
// can import them without dragging fs / supabase into the bundle.
export type {
  CardAuditSeverity,
  OmittedMfr,
  WrongPrefix,
  FabricatedDictEntry,
  WrongRuleClaim,
  WrongDictArrow,
  CardAuditResult,
} from './atlasFamilyCardAuditTypes';
import type { CardAuditResult, WrongRuleClaim, WrongDictArrow } from './atlasFamilyCardAuditTypes';
import { getLogicTable } from '@/lib/logicTables';
import {
  getAtlasParamDictionary,
  getSharedParamDictionary,
} from './atlasMapper';

// ── helpers ──

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** If the Han phrase at `mentionIndex` is part of a slash-joined compound
 *  (e.g. `电阻类型/技术/工艺`), return every contiguous `/`-joined sub-span
 *  that CONTAINS the phrase (excluding the bare phrase itself). Atlas
 *  exports some param names as slash-joined alternatives; atlasMapper.ts
 *  stores them verbatim as combined keys — but it may store ANY sub-span
 *  (`技术/工艺` is a key even though the card writes `电阻类型/技术/工艺`).
 *  The FABRICATED_DICT check tries them all before deciding a fragment is
 *  fabricated. Returns [] when the phrase isn't in a slash compound. */
function getSlashCompoundCandidates(text: string, mentionIndex: number, phrase: string): string[] {
  const isHan = (c: string) => /[\p{Script=Han}]/u.test(c);
  let start = mentionIndex;
  let end = mentionIndex + phrase.length;
  // Extend left/right over `/Han…` runs to find the maximal compound.
  while (start >= 2 && text[start - 1] === '/' && isHan(text[start - 2] ?? '')) {
    let p = start - 2;
    while (p >= 0 && isHan(text[p] ?? '')) p--;
    start = p + 1;
  }
  while (text[end] === '/' && isHan(text[end + 1] ?? '')) {
    let p = end + 1;
    while (p < text.length && isHan(text[p] ?? '')) p++;
    end = p;
  }
  const full = text.slice(start, end);
  if (!full.includes('/')) return [];
  const parts = full.split('/');
  const phraseIdx = parts.indexOf(phrase);
  if (phraseIdx === -1) return [full]; // fallback — check the maximal span
  // Every contiguous window [i..j] with i ≤ phraseIdx ≤ j, size ≥ 2.
  const candidates: string[] = [];
  for (let i = 0; i <= phraseIdx; i++) {
    for (let j = phraseIdx; j < parts.length; j++) {
      if (i === j) continue; // bare phrase — already checked standalone
      candidates.push(parts.slice(i, j + 1).join('/'));
    }
  }
  return candidates;
}

/** If the Han phrase at `mentionIndex` is immediately followed by a
 *  parenthesized qualifier (e.g. `耐電壓(v)` / `共模抑制比(cmrr)` /
 *  `絕緣阻抗(mΩ)`), return the full `<phrase>(<qualifier>)` compound.
 *  Atlas dict / overrides commonly hold the compound key — the bare phrase
 *  alone is what the extraction regex grabs, leading to false positives.
 *  Handles both ASCII `(...)` and full-width `（...）` paren pairs. Returns
 *  [] when no following paren-qualifier exists. */
function getParenQualifierCandidates(text: string, mentionIndex: number, phrase: string): string[] {
  const afterStart = mentionIndex + phrase.length;
  const open = text[afterStart];
  if (open !== '(' && open !== '（') return [];
  const close = open === '(' ? ')' : '）';
  const closeIdx = text.indexOf(close, afterStart + 1);
  if (closeIdx === -1) return [];
  // Sanity-bound the qualifier — anything past ~40 chars is unlikely to be
  // a unit qualifier and more likely a misparse.
  if (closeIdx - afterStart > 40) return [];
  return [text.slice(mentionIndex, closeIdx + 1)];
}

/** If the Han phrase at `mentionIndex` is part of a longer contiguous Han
 *  run (e.g. `不同温度时的使用寿命` — 10 chars, exceeds the extractor's 8-char
 *  max so `寿命` gets matched separately as the tail), return the maximal
 *  Han run plus every contiguous sub-span containing the phrase. Atlas dict
 *  may hold the FULL run as a single key — the bare-phrase regex extraction
 *  alone misses it. Returns [] when the phrase is the entire Han run. */
function getMaximalHanRunCandidates(text: string, mentionIndex: number, phrase: string): string[] {
  const isHan = (c: string) => /[\p{Script=Han}]/u.test(c);
  let start = mentionIndex;
  let end = mentionIndex + phrase.length;
  while (start > 0 && isHan(text[start - 1] ?? '')) start--;
  while (end < text.length && isHan(text[end] ?? '')) end++;
  const fullRun = text.slice(start, end);
  if (fullRun === phrase) return [];
  // Cap the maximal run to avoid pathological lookups on giant Han blobs.
  if (fullRun.length > 40) return [fullRun];
  // Phrase position within the full run.
  const phraseOffset = mentionIndex - start;
  const phraseEnd = phraseOffset + phrase.length;
  const candidates: string[] = [fullRun];
  // Also try sub-spans that CONTAIN the phrase but are shorter than the
  // maximal run — covers cases where dict has e.g. `使用寿命` (4 chars)
  // even though card writes `不同温度时的使用寿命`.
  for (let i = 0; i <= phraseOffset; i++) {
    for (let j = phraseEnd; j <= fullRun.length; j++) {
      const span = fullRun.slice(i, j);
      if (span === phrase || span === fullRun) continue;
      if (span.length < 2) continue;
      candidates.push(span);
    }
  }
  return candidates;
}

function mentionsName(text: string, name: string): boolean {
  return findMentionIndex(text, name) !== -1;
}

/** Returns the index of the FIRST match of `name` in `text`, or -1.
 *  Used by callers that need the position to look back for negative-list
 *  context. Lookup rules mirror mentionsName (CJK = case-insensitive
 *  substring; long/spaced names = case-insensitive substring; short ASCII
 *  = case-sensitive word-boundary). */
function findMentionIndex(text: string, name: string): number {
  if (!name) return -1;
  const n = name.trim();
  if (n.length < 2) return -1;
  const hasChinese = /[\p{Script=Han}]/u.test(n);
  if (hasChinese || n.length >= 8 || n.includes(' ')) {
    return text.toLowerCase().indexOf(n.toLowerCase());
  }
  const re = new RegExp(`(^|[^A-Za-z0-9])${escapeRe(n)}([^A-Za-z0-9]|$)`);
  const m = re.exec(text);
  if (!m) return -1;
  // m.index points at the boundary char (or start-of-string). Advance past
  // the leading boundary char if there was one, so callers get the position
  // of the name itself.
  return m[1] && m[1].length > 0 ? m.index + m[1].length : m.index;
}

// ─────────────────────────────────────────────────────────────────────
// DO NOT CACHE atlasMapper.ts source.
//
// Pre-May-21-2026 this function used a process-lifetime cache
// (`_atlasMapperSrc`) to avoid re-reading the file on every audit. That
// shipped a silent bug: engineer adds a dict entry to atlasMapper.ts,
// audit keeps flagging the phrase as fabricated because the cached
// snapshot pre-dated the edit. Symptom was "the dict has it but audit
// won't recognize it" — extremely confusing because the file IS edited,
// but the running process never re-reads it.
//
// Reading ~50KB from disk is sub-millisecond. The OS file cache makes
// it cheaper still. There is no scenario where caching this file is
// worth the staleness risk.
//
// If you're tempted to add caching back for perf reasons:
//   - Don't. Measure first; you won't find a hotspot here.
//   - If you genuinely need it, use mtime-based invalidation
//     (statSync().mtimeMs) — process-lifetime caches WILL go stale.
// ─────────────────────────────────────────────────────────────────────
function getAtlasMapperSrc(): string {
  try {
    return readFileSync(resolve(process.cwd(), 'lib/services/atlasMapper.ts'), 'utf-8');
  } catch {
    // File not readable (bundling oddity, wrong CWD) — return empty so
    // FABRICATED_DICT check no-ops rather than throwing the whole audit.
    return '';
  }
}

interface MfrIdentity {
  canonical: string;
  names: string[];
}

async function fetchMfrIdentities(): Promise<MfrIdentity[]> {
  const sb = createServiceClient();
  const { data, error } = await sb
    .from('atlas_manufacturers')
    .select('name_display, name_en, name_zh, aliases');
  if (error) throw new Error(`atlas_manufacturers fetch failed: ${error.message}`);
  const out: MfrIdentity[] = [];
  for (const m of data ?? []) {
    const namesSet = new Set<string>();
    if (m.name_display) namesSet.add(m.name_display);
    if (m.name_en) namesSet.add(m.name_en);
    if (m.name_zh) namesSet.add(m.name_zh);
    for (const a of m.aliases ?? []) if (a) namesSet.add(a);
    const primaryLowers = new Set<string>();
    if (m.name_display) primaryLowers.add(m.name_display.toLowerCase());
    if (m.name_en) primaryLowers.add(m.name_en.toLowerCase());
    if (m.name_zh) primaryLowers.add(m.name_zh.toLowerCase());
    const filtered = [...namesSet].filter((n) => {
      const isLowerOfPrimary = n === n.toLowerCase() && primaryLowers.has(n);
      return !isLowerOfPrimary;
    });
    out.push({ canonical: m.name_display ?? m.name_en ?? '(unknown)', names: filtered });
  }
  return out;
}

async function fetchFamilyMfrCounts(familyId: string): Promise<Array<[string, number]>> {
  const sb = createServiceClient();
  const pageSize = 1000;
  const counts: Record<string, number> = {};
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await sb
      .from('atlas_products')
      .select('manufacturer')
      .eq('family_id', familyId)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`atlas_products page fetch failed: ${error.message}`);
    if (!data?.length) break;
    for (const r of data) {
      const mfr = (r as { manufacturer?: string }).manufacturer;
      if (!mfr) continue;
      counts[mfr] = (counts[mfr] ?? 0) + 1;
    }
    if (data.length < pageSize) break;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

/** Fetch the set of normalized param_name strings from active
 *  atlas_dictionary_overrides for this family. These are engineer-
 *  accepted Chinese↔canonical mappings that aren't in the static
 *  atlasMapper.ts but ARE legitimate dict entries from the audit's
 *  perspective. Returns a Set for O(1) membership checks.
 *
 *  Storage format matches the POST /api/admin/atlas/dictionaries
 *  canonicalization: `.normalize('NFC').toLowerCase().trim()`. Callers
 *  must apply the SAME transform before doing `.has()`. */
async function fetchAcceptedOverrideParamNames(familyId: string): Promise<Set<string>> {
  const out = new Set<string>();
  if (!familyId) return out;
  try {
    const sb = createServiceClient();
    const { data, error } = await sb
      .from('atlas_dictionary_overrides')
      .select('param_name')
      .eq('family_id', familyId)
      .eq('is_active', true);
    if (error || !data) return out;
    for (const row of data) {
      const p = (row as { param_name?: string }).param_name;
      if (p) out.add(p);
    }
  } catch {
    // Fail-open — engineer-accepted overrides unavailable, fall back to
    // static-dict-only check. Same posture as the rest of the audit.
  }
  return out;
}

async function fetchMfrMpnSamples(
  familyId: string,
  mfrNames: string[],
): Promise<string[]> {
  const sb = createServiceClient();
  const { data, error } = await sb
    .from('atlas_products')
    .select('mpn')
    .eq('family_id', familyId)
    .in('manufacturer', mfrNames)
    .limit(SAMPLE_MPN_LIMIT);
  if (error) return [];
  return (data ?? [])
    .map((r) => (r as { mpn?: string }).mpn ?? '')
    .filter(Boolean)
    .map((s) => s.toUpperCase());
}

// ── main ──

export async function auditFamilyDomainCard(
  familyId: string,
  cardText: string,
): Promise<CardAuditResult> {
  const result: CardAuditResult = {
    auditedAt: new Date().toISOString(),
    bogusMfrs: [],
    omittedMfrs: [],
    criticalOmittedMfrs: [],
    wrongPrefixes: [],
    fabricatedDict: [],
    wrongRuleClaims: [],
    wrongDictArrows: [],
    issueCount: 0,
    severity: 'clean',
  };

  const [mfrIdentities, rankedMfrs, acceptedOverrideParams] = await Promise.all([
    fetchMfrIdentities(),
    fetchFamilyMfrCounts(familyId),
    fetchAcceptedOverrideParamNames(familyId),
  ]);

  // ── CHECK 1: BOGUS_MFR ──
  // Pre-build a flat lowercase set of every known MFR name (across all
  // identities). Used by isMfrAttributionContext to confirm a parenthetical
  // is a REAL MFR — generic English words won't match, so the exemption
  // is precise.
  const knownMfrNames = new Set<string>();
  for (const mfr of mfrIdentities) {
    for (const n of mfr.names) {
      knownMfrNames.add(n.toLowerCase());
    }
  }
  for (const mfr of mfrIdentities) {
    const asciiNames = mfr.names.filter((n) => !/[\p{Script=Han}]/u.test(n));
    if (asciiNames.some((n) => MFR_NAME_BLOCKLIST.has(n))) continue;
    // Find every mention of this MFR. If EVERY mention sits in a negative-
    // list context ("do not introduce X", "Western majors such as Y"), the
    // card is actually constraining the Triage AI to NOT use this MFR —
    // not claiming it ships under the family. Don't flag.
    let positiveMention = false;
    for (const n of mfr.names) {
      const idx = findMentionIndex(cardText, n);
      if (idx === -1) continue;
      if (isNegativeListContext(cardText, idx)) continue;
      // Skip mentions that are quoted short tokens with a descriptor word
      // nearby — e.g. `"AM" suffix`. The token is describing an MPN affix,
      // not the MFR. Only applies to short ASCII names (CJK or long names
      // wouldn't false-positive on this pattern).
      const isShortAscii = !/[\p{Script=Han}]/u.test(n) && n.length < 8 && !n.includes(' ');
      if (isShortAscii && isQuotedDescriptorContext(cardText, idx, n)) continue;
      // Skip protocol/standard designators — `RS-485`, `USB-2` shape.
      // Token followed by `-<digit>` is part of a standard name, not
      // a MFR claim.
      if (isShortAscii && isProtocolNumberContext(cardText, idx, n)) continue;
      // Skip dash-descriptor mentions — `TC-prefix` / `XX-suffix` shape.
      // Token is describing an MPN affix convention, not a MFR claim.
      if (isShortAscii && isDashDescriptorContext(cardText, idx, n)) continue;
      // Skip MPN-suffix mentions — `5.0SMDJ10A-AM` shape. Same intent
      // as the quoted-descriptor exemption but for unquoted suffix
      // tokens on real MPNs.
      if (isShortAscii && isMpnSuffixContext(cardText, idx)) continue;
      // Skip MFR-attribution mentions — `"-TD" (TDSEMIC)`, `"HX..." (HGC)`,
      // `Hanrun (HR)` shapes. Token is annotating an MPN affix and pointing
      // it at a real MFR; not a standalone MFR claim. Replaces the manual
      // blocklist additions for TR/SST/HR/CW/AM/HT/HX/TD; pre-empts the
      // same pattern for future cards.
      if (isShortAscii && isMfrAttributionContext(cardText, idx, n, knownMfrNames)) continue;
      // Skip slash-list acronym enumerations — `(FS/HS/SS)`, `(HBM/MM/CDM)`,
      // `(LV/HV)`. Token is one item in a technical-acronym list, not a
      // MFR claim. Replaces blocklisting HS (USB High-Speed). Distinct
      // shape from isMfrAttributionContext: prose (not a MFR) precedes
      // the open paren, and the paren contents are slash-separated peers.
      if (isShortAscii && isAcronymListContext(cardText, idx, n)) continue;
      positiveMention = true;
      break;
    }
    if (!positiveMention) continue;
    const shipping = mfr.names.some((n) =>
      rankedMfrs.some(([rmfr]) => rmfr.toLowerCase() === n.toLowerCase()),
    );
    if (!shipping) result.bogusMfrs.push(mfr.canonical);
  }
  result.bogusMfrs = [...new Set(result.bogusMfrs)];

  // ── CHECK 2: OMITTED_MFR ──
  const totalFamilyProducts = rankedMfrs.reduce((acc, [, c]) => acc + c, 0);
  for (const [mfrName, count] of rankedMfrs.slice(0, PREFIX_OMISSION_MFR_COUNT)) {
    if (count < OMIT_MIN_PRODUCTS) continue;
    if (totalFamilyProducts > 0 && count / totalFamilyProducts < OMIT_MIN_SHARE) continue;
    const identity = mfrIdentities.find((i) =>
      i.names.some((n) => n.toLowerCase() === mfrName.toLowerCase()),
    );
    const names = identity ? identity.names : [mfrName];
    const mentioned = names.some((n) => mentionsName(cardText, n));
    if (!mentioned) {
      result.omittedMfrs.push({
        name: mfrName,
        productCount: count,
        share: totalFamilyProducts > 0 ? Math.round((count / totalFamilyProducts) * 100) : 0,
      });
    }
  }

  // ── CHECK 3: WRONG_PREFIX ──
  const patA = /([A-Z][A-Z0-9]{1,4})-\s*\(([A-Z][A-Za-z0-9 ]{1,30}?)[,)]/g;
  const patB = /([A-Z][A-Za-z0-9 ]{2,30}?)\s*\(([A-Z][A-Z0-9]{1,4})-(?:\s*prefix|[\s,)])/g;
  const genericMfrToken = /^(NOTE|MFR|PREFIX|FOR|THE|AND|BUT|NOT|USE|MAX|MIN|MUST|CAN|ARE|TYP|WITH|ONLY|FROM|INTO|VS|OR|ALSO|ONE|TWO|THREE|FOUR|FIVE|TOP|EACH|ANY|THIS|THAT|HARD|GATE|BLOCK|RULE|MATCH|TYPE|SET|LIST|FAMILY|TODAY|YESTERDAY)$/i;

  const prefixClaims: Array<{ prefix: string; mfr: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = patA.exec(cardText)) !== null) {
    prefixClaims.push({ prefix: m[1], mfr: m[2].trim() });
  }
  while ((m = patB.exec(cardText)) !== null) {
    prefixClaims.push({ mfr: m[1].trim(), prefix: m[2] });
  }

  for (const claim of prefixClaims) {
    if (claim.mfr.length < 3) continue;
    if (genericMfrToken.test(claim.mfr.split(' ')[0])) continue;
    const identity = mfrIdentities.find((i) =>
      i.names.some((n) => n.toLowerCase() === claim.mfr.toLowerCase()),
    );
    if (!identity) continue;
    const samples = await fetchMfrMpnSamples(familyId, identity.names);
    if (!samples.length) continue;
    const prefixUpper = claim.prefix.toUpperCase();
    const samplePrefixCounts: Record<string, number> = {};
    for (const s of samples) {
      const lead = (s.match(/^[A-Z]+/) ?? [''])[0];
      if (lead) samplePrefixCounts[lead] = (samplePrefixCounts[lead] ?? 0) + 1;
    }
    const ranked = Object.entries(samplePrefixCounts).sort((a, b) => b[1] - a[1]);
    // Count samples whose extracted lead STARTS WITH the claimed prefix.
    // The leading uppercase-letter run captures variant suffixes (JMTQ/JMTG/
    // JMTP all share the "JMT" prefix family; the trailing Q/G/P is a variant
    // code, not a different prefix family). Without startsWith matching, an
    // engineer-accurate "JMT-family" claim gets falsely flagged as 0% match
    // because no individual sample starts with literally "JMT" alone.
    let claimedCount = 0;
    for (const [lead, count] of Object.entries(samplePrefixCounts)) {
      if (lead.startsWith(prefixUpper)) claimedCount += count;
    }
    const claimedShare = claimedCount / samples.length;
    const acceptable = claimedShare >= 0.2;
    if (!acceptable) {
      result.wrongPrefixes.push({
        mfr: identity.canonical,
        claimed: claim.prefix,
        claimedShare: Math.round(claimedShare * 100),
        actualTop: ranked.slice(0, 3).map(([p, c]) => `${p} (${c}/${samples.length})`),
        actualSamples: samples.slice(0, 3),
      });
    }
  }
  result.wrongPrefixes = result.wrongPrefixes.filter(
    (w, i, arr) => arr.findIndex((x) => x.mfr === w.mfr && x.claimed === w.claimed) === i,
  );

  // ── CHECK 4: FABRICATED_DICT ──
  const mapperSrc = getAtlasMapperSrc();
  if (mapperSrc) {
    const phrasesSeen = new Set<string>();
    const allChinesePhrasesPat = /[\p{Script=Han}]{2,8}/gu;
    while ((m = allChinesePhrasesPat.exec(cardText)) !== null) {
      const phrase = m[0];
      if (phrasesSeen.has(phrase)) continue;
      phrasesSeen.add(phrase);
      // Skip known Chinese unit words — they're units, not parameter
      // names, so they can never be a fabricated canonical mapping even
      // when they sit next to a mapping arrow (`英吋(公釐)→package_case`).
      if (CHINESE_UNIT_WORDS.has(phrase)) continue;
      const foundInDict = mapperSrc.includes(`'${phrase}`) || mapperSrc.includes(`"${phrase}`);
      if (foundInDict) continue;
      // Traditional + Simplified Atlas: if the phrase is traditional,
      // retry the dict lookup with the simplified form. atlasMapper.ts
      // entries are simplified-only by convention, so 通道數 (traditional)
      // matches the existing 通道数 (simplified) entry once normalized.
      const simplified = toSimplified(phrase);
      if (simplified !== phrase) {
        const foundSimplified =
          mapperSrc.includes(`'${simplified}`) || mapperSrc.includes(`"${simplified}`);
        if (foundSimplified) continue;
      }
      // Also check engineer-accepted overrides for this family. param_name
      // in atlas_dictionary_overrides is stored canonicalized via
      // .normalize('NFC').toLowerCase().trim() (see POST handler at
      // app/api/admin/atlas/dictionaries/route.ts — apply the same
      // transform on both the original and simplified forms before lookup.
      const canonOriginal = phrase.normalize('NFC').toLowerCase().trim();
      if (acceptedOverrideParams.has(canonOriginal)) continue;
      if (simplified !== phrase) {
        const canonSimplified = simplified.normalize('NFC').toLowerCase().trim();
        if (acceptedOverrideParams.has(canonSimplified)) continue;
      }
      // Slash-compound reconstruction: if this phrase is part of a
      // `A/B/C` param name (Atlas exports some params slash-joined,
      // stored verbatim as combined dict keys — and the dict may hold
      // ANY sub-span, e.g. `技术/工艺` even when the card writes
      // `电阻类型/技术/工艺`), check every sub-span containing the phrase
      // — each plus its simplified form — against the dict + overrides.
      const compoundCandidates = [
        ...getSlashCompoundCandidates(cardText, m.index, phrase),
        ...getParenQualifierCandidates(cardText, m.index, phrase),
        ...getMaximalHanRunCandidates(cardText, m.index, phrase),
      ];
      let compoundResolved = false;
      for (const candidate of compoundCandidates) {
        const candSimplified = toSimplified(candidate);
        const forms = candSimplified !== candidate ? [candidate, candSimplified] : [candidate];
        for (const form of forms) {
          if (mapperSrc.includes(`'${form}`) || mapperSrc.includes(`"${form}`)) {
            compoundResolved = true;
            break;
          }
          if (acceptedOverrideParams.has(form.normalize('NFC').toLowerCase().trim())) {
            compoundResolved = true;
            break;
          }
        }
        if (compoundResolved) break;
      }
      if (compoundResolved) continue;
      // Skip parenthetical clarifiers — pattern `<Chinese>(<phrase>) → ...`
      // is a disambiguation note on the preceding Chinese term, not a
      // standalone mapping subject. Real example: `稳压值(范围) → _vz_range`
      // maps 稳压值, with (范围) being a parenthetical meaning "range."
      const before = m.index > 0 ? cardText[m.index - 1] : '';
      const after = cardText[m.index + phrase.length] ?? '';
      const isParenthetical = (before === '(' || before === '（') && (after === ')' || after === '）');
      if (isParenthetical) {
        // Walk back through any chain of preceding parentheticals — e.g.
        // `电阻-初始(ri)(最小值)` has 最小值 wrapped in parens but preceded
        // by another `(ri)` paren-group, not a bare Han char. Skip past
        // each `(...)` group, then check whether the underlying root is Han.
        let cursor = m.index - 2;
        while (cursor >= 0) {
          const c = cardText[cursor];
          if (c === ')' || c === '）') {
            let depth = 1;
            cursor--;
            while (cursor >= 0 && depth > 0) {
              const cc = cardText[cursor];
              if (cc === ')' || cc === '）') depth++;
              else if (cc === '(' || cc === '（') depth--;
              cursor--;
            }
            continue;
          }
          break;
        }
        const rootChar = cursor >= 0 ? cardText[cursor] : '';
        if (rootChar && /[\p{Script=Han}]/u.test(rootChar)) continue;
      }
      // Skip compound-suffix fragments — `<Han>-<phrase>` pattern means
      // the phrase is the tail of a multi-part Chinese term, not a
      // standalone mapping subject. Real example: `电流-最大值 → max_fault_current`
      // maps 电流-最大值 as a whole; the regex captures 最大值 separately
      // because the dash breaks the Han run. Only `-` triggers — `/` is
      // "or" (both alternatives ARE mapping subjects, e.g. 通道数/电路数).
      if (before === '-' && m.index >= 2) {
        const beforeDash = cardText[m.index - 2] ?? '';
        if (/[\p{Script=Han}]/u.test(beforeDash)) continue;
      }
      const afterStart = m.index + phrase.length;
      const afterWindow = cardText.slice(afterStart, afterStart + 50);
      // A real FABRICATED_DICT signal requires explicit mapping SYNTAX —
      // an arrow (→ / ->) OR a quoted/backticked lowercase identifier (the
      // canonical-name shape). Bare English prose words in proximity —
      // "verify", "invent", "map" — are NOT a mapping claim and were the
      // dominant false-positive class in the May 21 audit. If a card
      // actually claims a Chinese→canonical mapping, the syntax will be
      // there.
      const hasMappingSignal =
        /(?:→|->)/.test(afterWindow) ||
        /['"`][a-z][a-z_0-9]{2,}['"`]/.test(afterWindow);
      if (hasMappingSignal) {
        result.fabricatedDict.push({
          phrase,
          claimedTarget: '(referenced in mapping-like context, not in dict)',
        });
      }
    }
  }

  // ── CHECK 5: WRONG_RULE_CLAIM ──
  // Card cites rule types/weights that don't match this family's logic
  // table. Cards routinely use the shape `attributeId (type, w=N)` or
  // `attributeId (weight=N, type)`. We only inspect attributeIds that
  // EXIST in the logic table (false-positive guard) and only flag the
  // claims that were ACTUALLY made (a card asserting type-only is
  // checked for type only). Engineering errors here silently misinform
  // downstream consumers — engineers reading the card, the Triage AI
  // — so they're block-level.
  const logicTable = getLogicTable(familyId);
  if (logicTable) {
    const ruleByAttr = new Map<string, { logicType: string; weight: number }>();
    for (const r of logicTable.rules) {
      ruleByAttr.set(r.attributeId.toLowerCase(), {
        logicType: r.logicType,
        weight: r.weight,
      });
    }
    // Longer type tokens first so 'identity_upgrade' wins over 'identity'.
    const TYPE_TOKENS = [
      'identity_upgrade',
      'identity_range',
      'identity_flag',
      'application_review',
      'vref_check',
      'threshold',
      'operational',
      'identity',
      'fit',
    ];
    const claimSeen = new Set<string>();
    // Attribute followed (within ≤3 chars of whitespace) by `(...)`.
    // Conservative: only look inside the parens — covers ~95% of the
    // claim shape used in cards and avoids prose false positives.
    const claimPat = /\b([a-z][a-z_0-9]{2,})\s{0,3}\(([^)]{1,120})\)/g;
    let cm: RegExpExecArray | null;
    while ((cm = claimPat.exec(cardText)) !== null) {
      const attr = cm[1].toLowerCase();
      const actual = ruleByAttr.get(attr);
      if (!actual) continue;
      const inside = cm[2];
      // Type claim: first TYPE_TOKEN matched (with word-boundary guard).
      let claimedType: string | undefined;
      for (const t of TYPE_TOKENS) {
        const re = new RegExp(`(?:^|[^a-z_0-9])${t}(?:[^a-z_0-9]|$)`, 'i');
        if (re.test(inside)) {
          claimedType = t;
          break;
        }
      }
      // Weight claim: `w=10`, `weight=10`, `weight 10`, or `w10` (bare).
      // Bare `w10` is bounded by non-alnum on both sides to avoid matching
      // suffixes inside identifiers like `aec_q200`.
      let claimedWeight: number | undefined;
      const wMatch =
        inside.match(/(?:^|[^a-z_0-9])w(?:eight)?\s*=?\s*(\d+)(?:[^a-z_0-9]|$)/i) ||
        inside.match(/(?:^|[^a-z_0-9])weight\s+(\d+)(?:[^a-z_0-9]|$)/i);
      if (wMatch) {
        const n = parseInt(wMatch[1], 10);
        if (!Number.isNaN(n) && n >= 0 && n <= 10) claimedWeight = n;
      }
      if (claimedType === undefined && claimedWeight === undefined) continue;
      const typeWrong = claimedType !== undefined && claimedType !== actual.logicType;
      const weightWrong = claimedWeight !== undefined && claimedWeight !== actual.weight;
      if (!typeWrong && !weightWrong) continue;
      const key = `${attr}|${claimedType ?? ''}|${claimedWeight ?? ''}`;
      if (claimSeen.has(key)) continue;
      claimSeen.add(key);
      result.wrongRuleClaims.push({
        attributeId: attr,
        claimedType: typeWrong ? claimedType : undefined,
        actualType: typeWrong ? actual.logicType : undefined,
        claimedWeight: weightWrong ? claimedWeight : undefined,
        actualWeight: weightWrong ? actual.weight : undefined,
      });
    }
  }

  // ── CHECK 6: WRONG_DICT_ARROW ──
  // Card asserts `<Chinese>→<canonical>` mappings — these are the
  // dictionary direction claims that feed downstream Atlas extraction.
  // FABRICATED_DICT catches phrases the dict doesn't carry at all.
  // This check catches phrases the dict DOES carry but the card
  // points at the wrong canonical. The dict lookup pulls from BOTH
  // the family-specific dictionary and the shared/L2 fallback so
  // legitimate cross-family canonicals don't false-flag.
  try {
    const familyDict = getAtlasParamDictionary(familyId);
    const sharedDict = getSharedParamDictionary();
    // Walk Chinese-phrase followed by → and a lowercase canonical.
    const arrowPat = /([\p{Script=Han}（）()/、,，·\-+\s]{2,40}?)\s*[→]\s*([a-z][a-z_0-9]{2,})/gu;
    const seenArrow = new Set<string>();
    let am: RegExpExecArray | null;
    while ((am = arrowPat.exec(cardText)) !== null) {
      const leftRaw = am[1];
      const claimedTarget = am[2].toLowerCase();
      // Split on slash/comma to handle `感值/电感值/电感(μh)→inductance`
      // — each subterm should resolve to the same canonical.
      const subterms = leftRaw
        .split(/[/、,，]/)
        .map((s) => s.trim())
        .filter(Boolean);
      for (const subterm of subterms) {
        // Strip leading/trailing parens and whitespace. Keep inner Han.
        const cleaned = subterm.replace(/^[\s()（）]+|[\s()（）]+$/g, '');
        if (!cleaned) continue;
        if (!/[\p{Script=Han}]/u.test(cleaned)) continue;
        const lookups = [cleaned];
        const simp = toSimplified(cleaned);
        if (simp !== cleaned) lookups.push(simp);
        // Try the family dict first, then the shared dict.
        let dictTarget: string | undefined;
        for (const key of lookups) {
          const fam = familyDict?.[key];
          if (fam) { dictTarget = fam.attributeId.toLowerCase(); break; }
          const sh = sharedDict[key];
          if (sh) { dictTarget = sh.attributeId.toLowerCase(); break; }
        }
        // Phrase not in dict at all → already handled by FABRICATED_DICT.
        if (!dictTarget) continue;
        if (dictTarget === claimedTarget) continue;
        const key = `${cleaned}|${claimedTarget}`;
        if (seenArrow.has(key)) continue;
        seenArrow.add(key);
        result.wrongDictArrows.push({
          phrase: cleaned,
          claimedTarget,
          actualTarget: dictTarget,
        });
      }
    }

    // ── CHECK 6b: ENGLISH-QUOTED DICT ARROWS ──
    // Cards also assert mappings with English-quoted sources:
    //   '"reference voltage" → adjustability'
    //   '"vref_typ" → output_voltage'
    // These bypassed the Han-only regex above. Quoting is a strong
    // dict-claim signal (prose doesn't quote attribute names), so
    // this branch flags BOTH directional errors (source in dict, wrong
    // target) AND fabrications (source not in dict). We do NOT extend
    // FABRICATED_DICT to bare snake_case sources (`vref_typ → x` without
    // quotes) — that's too easy to confuse with descriptive prose like
    // `tc → BLOCKING` (and our canonical regex already filters caps).
    const enQuotedPat = /["'`]([a-zA-Z][a-zA-Z_0-9 ()/.\-]{1,40})["'`]\s*[→]\s*([a-z][a-z_0-9]{2,})/g;
    while ((am = enQuotedPat.exec(cardText)) !== null) {
      const phrase = am[1].trim().toLowerCase();
      const claimedTarget = am[2].toLowerCase();
      if (!phrase) continue;
      // Skip if phrase contains Han chars (handled by the Chinese path above).
      if (/[\p{Script=Han}]/u.test(phrase)) continue;
      const fam = familyDict?.[phrase];
      const sh = sharedDict[phrase];
      const dictTarget = fam?.attributeId.toLowerCase() ?? sh?.attributeId.toLowerCase();
      if (dictTarget) {
        // Source in dict — check direction.
        if (dictTarget === claimedTarget) continue;
        const key = `en|${phrase}|${claimedTarget}`;
        if (seenArrow.has(key)) continue;
        seenArrow.add(key);
        result.wrongDictArrows.push({
          phrase,
          claimedTarget,
          actualTarget: dictTarget,
        });
      } else {
        // Source not in TS dict — consult engineer-accepted DB overrides
        // before flagging. atlas_dictionary_overrides stores accepted
        // mappings keyed by normalized param name (.normalize('NFC')
        // .toLowerCase().trim()). Mirror that normalization here so an
        // accepted override silently suppresses the flag, parallel to
        // the Chinese FABRICATED_DICT path above. If the phrase IS in
        // the overrides set, the engineer has explicitly blessed the
        // mapping — we can't verify the target from the override set
        // (which only stores keys), but presence is enough to demote
        // from "fabricated" to "trusted."
        const canonOverride = phrase.normalize('NFC').toLowerCase().trim();
        if (acceptedOverrideParams.has(canonOverride)) continue;
        const fabKey = `en-fab|${phrase}`;
        if (seenArrow.has(fabKey)) continue;
        seenArrow.add(fabKey);
        result.fabricatedDict.push({
          phrase,
          claimedTarget: `claimed → ${claimedTarget} (English phrase not in dictionary)`,
        });
      }
    }
  } catch {
    // Defensive — dict lookups should never throw, but if they do
    // skip the check rather than failing the whole audit.
  }

  // ── severity (Decision #197, extended for critical omissions) ──
  // BLOCK-level: BOGUS_MFR + WRONG_PREFIX + critical OMITTED_MFR. The
  // first two are grounded in atlas_products (real data — reliable,
  // dangerous-if-wrong). Critical omissions are top-volume MFRs missing
  // from a cohort claim — large enough share (≥OMIT_BLOCK_SHARE) that
  // the card's "ships from X, Y, Z" assertion is materially false. The
  // editorial threshold (3–14% share) stays advisory.
  //
  // WARN-level: FABRICATED_DICT + editorial OMITTED_MFR. FABRICATED_DICT
  // was downgraded block→warn — it substring-matches atlasMapper.ts source,
  // can't cleanly verify rich param-name forms (compounds, parentheticals,
  // synonym groups, traditional chars), and in practice surfaces dict
  // COVERAGE GAPS, not hallucinations.
  result.criticalOmittedMfrs = result.omittedMfrs.filter(
    (o) => o.share >= OMIT_BLOCK_SHARE * 100,
  );
  const hallucinationCount = result.bogusMfrs.length + result.wrongPrefixes.length;
  const criticalOmissionCount = result.criticalOmittedMfrs.length;
  const editorialOmissionCount = result.omittedMfrs.length - criticalOmissionCount;
  const engineeringClaimCount =
    result.wrongRuleClaims.length + result.wrongDictArrows.length;
  const advisoryCount = result.fabricatedDict.length + editorialOmissionCount;
  result.issueCount =
    hallucinationCount + criticalOmissionCount + engineeringClaimCount;
  if (result.issueCount >= 1) result.severity = 'block';
  else if (advisoryCount >= 1) result.severity = 'warn';
  else result.severity = 'clean';

  return result;
}
