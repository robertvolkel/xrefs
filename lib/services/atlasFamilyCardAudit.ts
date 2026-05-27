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

// ── public types ──
// Types live in a sibling file so client components (e.g. the admin panel)
// can import them without dragging fs / supabase into the bundle.
export type {
  CardAuditSeverity,
  OmittedMfr,
  WrongPrefix,
  FabricatedDictEntry,
  CardAuditResult,
} from './atlasFamilyCardAuditTypes';
import type { CardAuditResult } from './atlasFamilyCardAuditTypes';

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
    wrongPrefixes: [],
    fabricatedDict: [],
    issueCount: 0,
    severity: 'clean',
  };

  const [mfrIdentities, rankedMfrs, acceptedOverrideParams] = await Promise.all([
    fetchMfrIdentities(),
    fetchFamilyMfrCounts(familyId),
    fetchAcceptedOverrideParamNames(familyId),
  ]);

  // ── CHECK 1: BOGUS_MFR ──
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
      const compoundCandidates = getSlashCompoundCandidates(cardText, m.index, phrase);
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

  // ── severity (Decision #197) ──
  // BLOCK-level: BOGUS_MFR + WRONG_PREFIX only. Both are grounded in
  // atlas_products (real data) — reliable, dangerous-if-wrong.
  // WARN-level: FABRICATED_DICT + OMITTED_MFR. FABRICATED_DICT was
  // downgraded block→warn — it substring-matches atlasMapper.ts source,
  // can't cleanly verify rich param-name forms (compounds, parentheticals,
  // synonym groups, traditional chars), and in practice surfaces dict
  // COVERAGE GAPS, not hallucinations (5 consecutive cards: 0 real catches
  // / 5 false positives). OMITTED_MFR is editorial. Neither gates Approve.
  const hallucinationCount = result.bogusMfrs.length + result.wrongPrefixes.length;
  const advisoryCount = result.fabricatedDict.length + result.omittedMfrs.length;
  result.issueCount = hallucinationCount;
  if (hallucinationCount >= 1) result.severity = 'block';
  else if (advisoryCount >= 1) result.severity = 'warn';
  else result.severity = 'clean';

  return result;
}
