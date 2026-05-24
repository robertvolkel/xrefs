#!/usr/bin/env node

/**
 * Atlas Family Domain Card — Auto-Audit
 *
 * Cross-checks every active + draft card in atlas_family_domain_cards
 * against atlas_products and atlasMapper.ts to catch the four hallucination
 * patterns surfaced by the May 21, 2026 C4 review (Decision #194 follow-up):
 *
 *   1. BOGUS MFR — Card names an MFR that doesn't ship under this family
 *      in atlas_products (e.g. Murata under family 12, OR Corebai when not
 *      in family).
 *   2. MFR OMISSION — A top-volume MFR in this family is NOT mentioned in
 *      the card text (e.g. COSINE missing from C4 jellybean cohort even
 *      though it's the 3rd-largest).
 *   3. WRONG PREFIX — Card claims an MPN prefix for an MFR that doesn't
 *      match any of that MFR's actual MPN samples (e.g. "DIA- (DIOO)" but
 *      DIOO ships DIO-prefix MPNs).
 *   4. FABRICATED DICT — Card claims a Chinese→canonical mapping that
 *      doesn't exist in lib/services/atlasMapper.ts (e.g. "放大器数 →
 *      channels" when only 通道数 is mapped).
 *
 * Heuristic / regex-driven — some false positives expected. Goal is to
 * surface things engineers should EYEBALL, not to gate publication.
 *
 * Usage:
 *   node scripts/atlas-audit-domain-cards.mjs                  # all cards
 *   node scripts/atlas-audit-domain-cards.mjs --family C4      # one card
 *   node scripts/atlas-audit-domain-cards.mjs --status active  # only active
 *   node scripts/atlas-audit-domain-cards.mjs --detailed       # show full per-card
 *
 * Read-only — does not modify any data.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Converter as OpenCCConverter } from 'opencc-js';

// Mirrored from lib/services/chineseNormalize.ts — singleton tw→cn
// converter. Used by the FABRICATED_DICT check to recognize traditional
// card phrases as matches against simplified atlasMapper.ts entries.
let _tcConverter = null;
function toSimplified(s) {
  if (!s) return s;
  if (!_tcConverter) _tcConverter = OpenCCConverter({ from: 'tw', to: 'cn' });
  return _tcConverter(s);
}

// ── env loading ──
function loadEnv() {
  try {
    const c = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8');
    for (const line of c.split('\n')) {
      const t = line.trim(); if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('='); if (i === -1) continue;
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {}
}
loadEnv();

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}
const sb = createClient(URL, KEY);

// ── args ──
const argv = process.argv.slice(2);
const familyArg = ((argv.indexOf('--family') >= 0) && argv[argv.indexOf('--family') + 1]) || null;
const statusArg = ((argv.indexOf('--status') >= 0) && argv[argv.indexOf('--status') + 1]) || null;
const detailed = argv.includes('--detailed');

// ── helpers ──
const PREFIX_OMISSION_MFR_COUNT = 10; // top N MFRs we expect to see mentioned
const SAMPLE_MPN_LIMIT = 20;          // MPNs per MFR for prefix checks

// MFRs whose names collide with common technical abbreviations / units used
// in datasheet prose. The mention-detection regex correctly identifies these
// strings but they're almost always referring to the concept, not the MFR.
// Skip them in the BOGUS_MFR check to avoid noise. If a card legitimately
// discusses one of these MFRs by name, the check has a small blind spot —
// acceptable trade.
const MFR_NAME_BLOCKLIST = new Set([
  'DC',         // DC-DC, DC voltage, DC bias
  'AC',         // AC mains, AC coupling
  'HC',         // 74HC logic family
  'PTC',        // positive temperature coefficient (resistor type, fuse type)
  'NTC',        // negative temperature coefficient (thermistor type)
  'Fast',       // "fast recovery", "fast switching"
  'Milliohm',   // milliohm — unit of resistance
  'TVS',        // TVS diode type
  'LED',        // common term
  'IC',         // integrated circuit
  'VIBRATION',  // a real Chinese MFR (振浩微); collides with prose "vibration"
  'CTR',        // "Current Transfer Ratio" — central optocoupler spec; collides with MFR 长泰尔电子
]);

// Trigger phrases that, when they appear shortly BEFORE a MFR mention,
// mean the mention is a NEGATIVE-LIST instruction ("do not introduce X")
// rather than a positive claim. Mirrored verbatim from
// lib/services/atlasFamilyCardAudit.ts — keep these two lists in sync.
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
  'such as',
  // "Competitor MFR being described, not claimed as shipping" patterns.
  // Mirrored from lib/services/atlasFamilyCardAudit.ts.
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

// Mirrored from lib/services/atlasFamilyCardAudit.ts — Chinese unit words.
// Units, never parameter names; FABRICATED_DICT check skips them.
const CHINESE_UNIT_WORDS = new Set([
  '英吋', '英时', '英寸',
  '公釐', '毫米',
  '公分', '厘米',
  '伏特', '安培', '欧姆', '歐姆',
  '瓦特', '赫兹', '赫茲',
  '法拉', '亨利',
]);

function isNegativeListContext(text, mfrMatchIndex) {
  const lookbackStart = Math.max(0, mfrMatchIndex - 60);
  const window = text.slice(lookbackStart, mfrMatchIndex).toLowerCase();
  return NEGATIVE_LIST_TRIGGERS.some((trigger) => window.includes(trigger));
}

// Mirrored from lib/services/atlasFamilyCardAudit.ts — `"AM" suffix` style
// MPN-affix descriptions, not MFR claims.
const QUOTED_DESCRIPTOR_WORDS = ['suffix', 'prefix', 'series', 'designator', 'code', 'marker', 'tag'];

function isQuotedDescriptorContext(text, mentionIndex, name) {
  const before = mentionIndex > 0 ? text[mentionIndex - 1] : '';
  const after = text[mentionIndex + name.length] ?? '';
  const isQuotedBothSides =
    (before === '"' || before === "'" || before === '`') &&
    (after === '"' || after === "'" || after === '`');
  if (!isQuotedBothSides) return false;
  const afterQuoteStart = mentionIndex + name.length + 1;
  const window = text.slice(afterQuoteStart, afterQuoteStart + 30).toLowerCase();
  return QUOTED_DESCRIPTOR_WORDS.some((w) => window.includes(w));
}

// Mirrored from lib/services/atlasFamilyCardAudit.ts — `RS-485`, `USB-2`
// shape. Token followed by `-<digit>` is part of a standard/protocol
// designator, not a MFR claim.
function isProtocolNumberContext(text, mentionIndex, name) {
  const afterStart = mentionIndex + name.length;
  if (text[afterStart] !== '-') return false;
  const next = text[afterStart + 1] ?? '';
  return /\d/.test(next);
}

// Mirrored from lib/services/atlasFamilyCardAudit.ts — `TC-prefix` shape.
// Token is describing an MPN affix convention, not a MFR claim.
function isDashDescriptorContext(text, mentionIndex, name) {
  const afterStart = mentionIndex + name.length;
  if (text[afterStart] !== '-') return false;
  const window = text.slice(afterStart + 1, afterStart + 1 + 20).toLowerCase();
  return QUOTED_DESCRIPTOR_WORDS.some((w) => window.startsWith(w));
}

// Mirrored from lib/services/atlasFamilyCardAudit.ts — MPN-suffix shape
// `5.0SMDJ10A-AM`. Token is a part-number variant code, not a MFR.
function isMpnSuffixContext(text, mentionIndex) {
  if (mentionIndex < 2) return false;
  if (text[mentionIndex - 1] !== '-') return false;
  let cursor = mentionIndex - 2;
  const minStart = Math.max(0, mentionIndex - 1 - 12);
  while (cursor >= minStart && /[A-Z0-9.]/.test(text[cursor] ?? '')) cursor--;
  const mpnCandidate = text.slice(cursor + 1, mentionIndex - 1);
  if (mpnCandidate.length < 4) return false;
  return /[0-9]/.test(mpnCandidate);
}

function chip(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

// Escape regex special chars in a string for use in `new RegExp`.
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// Mirrored from lib/services/atlasFamilyCardAudit.ts — every contiguous
// `/`-joined sub-span containing a captured phrase (e.g. for
// `电阻类型/技术/工艺` → ['技术/工艺', '电阻类型/技术/工艺']).
function getSlashCompoundCandidates(text, mentionIndex, phrase) {
  const isHan = (c) => /[\p{Script=Han}]/u.test(c);
  let start = mentionIndex;
  let end = mentionIndex + phrase.length;
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
  if (phraseIdx === -1) return [full];
  const candidates = [];
  for (let i = 0; i <= phraseIdx; i++) {
    for (let j = phraseIdx; j < parts.length; j++) {
      if (i === j) continue;
      candidates.push(parts.slice(i, j + 1).join('/'));
    }
  }
  return candidates;
}

// True if `s` mentions `name` as a standalone token.
// Strategy:
//  - Names with Chinese characters: case-insensitive substring (CJK has no case).
//  - Long names (≥8 chars) OR names with spaces: case-insensitive substring.
//  - Short ASCII names (e.g. "ISC", "BL", "AK"): require EXACT-CASE match with
//    word boundaries — case-insensitive matching collides with circuit-analysis
//    abbreviations like "isc(ma)" (ISC manufacturer), "(CMOS/JFET)" (Cmos
//    manufacturer), "Iq" (no MFR), etc. The atlas_products manufacturer column
//    is the authoritative case for these short codes.
function mentionsName(text, name) {
  return findMentionIndex(text, name) !== -1;
}

function findMentionIndex(text, name) {
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
  return m[1] && m[1].length > 0 ? m.index + m[1].length : m.index;
}

// Fetch accepted dict overrides for a family. Mirrored from
// lib/services/atlasFamilyCardAudit.ts — see notes there. Returns Set
// of canonicalized (NFC + lowercase + trim) param_name strings.
async function fetchAcceptedOverrideParamNames(familyId) {
  const out = new Set();
  if (!familyId) return out;
  try {
    const { data, error } = await sb
      .from('atlas_dictionary_overrides')
      .select('param_name')
      .eq('family_id', familyId)
      .eq('is_active', true);
    if (error || !data) return out;
    for (const row of data) {
      if (row.param_name) out.add(row.param_name);
    }
  } catch {
    // fail-open
  }
  return out;
}

// Fetch every row from a Supabase table that matches the given filter,
// paginating in 1000-row chunks (Supabase JS default cap).
async function fetchAllPages(buildQuery) {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}

// ── load atlasMapper.ts source (for dict-claim verification) ──
const atlasMapperSrc = (() => {
  try { return readFileSync(resolve(process.cwd(), 'lib/services/atlasMapper.ts'), 'utf-8'); }
  catch { return ''; }
})();

// ── main ──
console.log('\n╔════════════════════════════════════════════════════════════════════╗');
console.log('║  Atlas Family Domain Card — Auto-Audit                              ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

// 1. Fetch cards
let cardsQuery = sb.from('atlas_family_domain_cards').select('family_id, status, card_text, updated_at');
if (familyArg) cardsQuery = cardsQuery.eq('family_id', familyArg);
if (statusArg) cardsQuery = cardsQuery.eq('status', statusArg);
else cardsQuery = cardsQuery.in('status', ['active', 'draft']);
const { data: cards, error: cardErr } = await cardsQuery;
if (cardErr) { console.error('Card fetch failed:', cardErr.message); process.exit(1); }
if (!cards?.length) { console.log('No cards matched the filter.'); process.exit(0); }
console.log(`Auditing ${cards.length} card(s)\n`);

// 2. Build MFR-identity index (one query, used for every card)
const { data: mfrIndex } = await sb
  .from('atlas_manufacturers')
  .select('name_display, name_en, name_zh, aliases');
const allMfrIdentities = [];
for (const m of mfrIndex ?? []) {
  const names = new Set();
  if (m.name_display) names.add(m.name_display);
  if (m.name_en) names.add(m.name_en);
  if (m.name_zh) names.add(m.name_zh);
  for (const a of m.aliases ?? []) names.add(a);
  // Drop aliases that are JUST the lowercase form of an existing primary name.
  // The atlas_manufacturers.aliases array often carries normalizer-style
  // lowercased copies (e.g. ISC has 'isc' as an alias). Treating those as
  // mention candidates breaks the case-sensitive short-ASCII match — they
  // collide with circuit-analysis abbreviations like "isc(ma)" (short-circuit
  // current). The MFR is still findable by its name_en or any uppercased alias.
  const primaryNames = new Set();
  if (m.name_display) primaryNames.add(m.name_display.toLowerCase());
  if (m.name_en) primaryNames.add(m.name_en.toLowerCase());
  if (m.name_zh) primaryNames.add(m.name_zh.toLowerCase());
  const filtered = [...names].filter((n) => {
    const isLowerOfPrimary = n === n.toLowerCase() && primaryNames.has(n);
    return !isLowerOfPrimary;
  });
  allMfrIdentities.push({ canonical: m.name_display ?? m.name_en, names: filtered });
}

// 3. Per-card audit
const summary = [];

for (const card of cards) {
  const { family_id, status, card_text } = card;
  const result = {
    family_id,
    status,
    bogusMfrs: [],        // MFRs in card but not shipping under this family
    omittedMfrs: [],      // top-N MFRs in family not mentioned in card
    wrongPrefixes: [],    // claimed prefix doesn't match MFR's MPNs
    fabricatedDict: [],   // claimed mapping not in atlasMapper.ts
  };

  // Per-family MFR ranking. Paginates atlas_products to defeat the Supabase
  // 1000-row default cap — families like C4 (~1.25K rows) hide their long-tail
  // MFRs below the cap, which previously surfaced as bogus "NOVOSENSE doesn't
  // ship under C4" false positives in an early run.
  const rankRows = await fetchAllPages(() =>
    sb.from('atlas_products').select('manufacturer').eq('family_id', family_id),
  );
  const mfrCounts = {};
  for (const r of rankRows) mfrCounts[r.manufacturer] = (mfrCounts[r.manufacturer] ?? 0) + 1;
  const rankedMfrs = Object.entries(mfrCounts).sort((a, b) => b[1] - a[1]);

  // Engineer-accepted dict overrides for this family. Used in CHECK 4
  // alongside the static atlasMapper.ts lookup.
  const acceptedOverrideParams = await fetchAcceptedOverrideParamNames(family_id);

  // ── CHECK 1: BOGUS MFRs — MFRs named in card text that don't ship this family ──
  for (const mfr of allMfrIdentities) {
    // Skip MFRs whose primary names are technical-term collisions.
    const primaryNames = mfr.names.filter((n) => !/[\p{Script=Han}]/u.test(n));
    if (primaryNames.some((n) => MFR_NAME_BLOCKLIST.has(n))) continue;

    // Only count POSITIVE mentions — skip if every occurrence sits in a
    // negative-list context ("do not introduce X", "Western majors such
    // as Y"), or in a quoted-descriptor context (`"AM" suffix`). The card
    // is either constraining the Triage AI or describing an MPN affix,
    // not claiming X ships.
    let positiveMention = false;
    for (const n of mfr.names) {
      const idx = findMentionIndex(card_text, n);
      if (idx === -1) continue;
      if (isNegativeListContext(card_text, idx)) continue;
      const isShortAscii = !/[\p{Script=Han}]/u.test(n) && n.length < 8 && !n.includes(' ');
      if (isShortAscii && isQuotedDescriptorContext(card_text, idx, n)) continue;
      if (isShortAscii && isProtocolNumberContext(card_text, idx, n)) continue;
      if (isShortAscii && isDashDescriptorContext(card_text, idx, n)) continue;
      if (isShortAscii && isMpnSuffixContext(card_text, idx)) continue;
      positiveMention = true;
      break;
    }
    if (!positiveMention) continue;
    const shipping = mfr.names.some((n) => {
      return rankedMfrs.some(([rmfr]) => rmfr.toLowerCase() === n.toLowerCase());
    });
    if (!shipping) {
      result.bogusMfrs.push(mfr.canonical);
    }
  }
  // Dedupe
  result.bogusMfrs = [...new Set(result.bogusMfrs)];

  // ── CHECK 2: OMISSIONS — top-N MFRs in family missing from card text ──
  // Only flag MFRs that are SIGNIFICANT — ≥100 products AND ≥3% of family.
  // Skipping <100-product MFRs cuts noise from editorial choices (a card
  // legitimately omitting a tiny long-tail MFR like Fortior Tech with 3
  // products in C3 isn't a hallucination, it's a focus decision).
  const totalFamilyProducts = rankedMfrs.reduce((acc, [, c]) => acc + c, 0);
  const OMIT_MIN_PRODUCTS = 100;
  const OMIT_MIN_SHARE = 0.03;
  for (const [mfrName, count] of rankedMfrs.slice(0, PREFIX_OMISSION_MFR_COUNT)) {
    if (count < OMIT_MIN_PRODUCTS) continue;
    if (totalFamilyProducts > 0 && count / totalFamilyProducts < OMIT_MIN_SHARE) continue;
    const identity = allMfrIdentities.find((i) => i.names.some((n) => n.toLowerCase() === mfrName.toLowerCase()));
    const names = identity ? identity.names : [mfrName];
    const mentioned = names.some((n) => mentionsName(card_text, n));
    if (!mentioned) {
      result.omittedMfrs.push({ name: mfrName, productCount: count, share: Math.round((count / totalFamilyProducts) * 100) });
    }
  }

  // ── CHECK 3: WRONG PREFIXES — "PREFIX (MFR)" or "MFR (PREFIX-...)" patterns ──
  // Prefix length cap 2-5 chars: real MPN prefixes are 2-5 letters (DIO, NSi,
  // CBM, AW, COS). Longer claimed "prefixes" (e.g. "NCA9545", "N4007", "IF")
  // are MPN-fragment false positives — the original card text included full
  // MPN substrings that the regex mistakenly extracted.
  // Pattern A: "PREFIX- (MFR)" — e.g. "DIA- (DIOO)"
  const patA = /([A-Z][A-Z0-9]{1,4})-\s*\(([A-Z][A-Za-z0-9 ]{1,30}?)[,)]/g;
  // Pattern B: "MFR (PREFIX-prefix)" or "MFR (PREFIX-..." — e.g. "Sunlord (SDV-prefix"
  const patB = /([A-Z][A-Za-z0-9 ]{2,30}?)\s*\(([A-Z][A-Z0-9]{1,4})-(?:\s*prefix|[\s,)])/g;

  const prefixClaims = [];
  let m;
  while ((m = patA.exec(card_text)) !== null) {
    prefixClaims.push({ prefix: m[1], mfr: m[2].trim(), source: 'patA' });
  }
  while ((m = patB.exec(card_text)) !== null) {
    prefixClaims.push({ mfr: m[1].trim(), prefix: m[2], source: 'patB' });
  }

  for (const claim of prefixClaims) {
    // Skip obviously-noisy matches (single-letter MFR, generic words)
    if (claim.mfr.length < 3) continue;
    const generic = /^(NOTE|MFR|PREFIX|FOR|THE|AND|BUT|NOT|USE|MAX|MIN|MUST|CAN|ARE|TYP|WITH|ONLY|FROM|INTO|VS|OR|ALSO|ONE|TWO|THREE|FOUR|FIVE|TOP|EACH|ANY|THIS|THAT|HARD|GATE|BLOCK|RULE|MATCH|TYPE|SET|LIST|FAMILY|TODAY|YESTERDAY)$/i;
    if (generic.test(claim.mfr.split(' ')[0])) continue;

    // Look up MFR's MPNs
    const identity = allMfrIdentities.find((i) => i.names.some((n) => n.toLowerCase() === claim.mfr.toLowerCase()));
    if (!identity) continue; // not a known MFR — false positive, skip
    const mfrNames = identity.names;
    const { data: mpnRows } = await sb
      .from('atlas_products')
      .select('mpn')
      .eq('family_id', family_id)
      .in('manufacturer', mfrNames)
      .limit(SAMPLE_MPN_LIMIT);
    if (!mpnRows?.length) {
      // MFR doesn't ship this family — handled by CHECK 1
      continue;
    }
    // Prefix-distribution analysis: extract the leading letter run from each
    // sample and rank. A claimed prefix is acceptable iff it accounts for ≥20%
    // of samples (and is at least 2nd-most-common). Catches "DIA- (DIOO)"
    // where ONE part (DIA20722) exists alongside 19 DIO-prefix parts — a
    // simple "any sample starts with prefix" check would mistakenly pass.
    const samples = mpnRows.map((r) => (r.mpn ?? '').toUpperCase());
    const prefixUpper = claim.prefix.toUpperCase();
    const samplePrefixCounts = {};
    for (const s of samples) {
      const lead = (s.match(/^[A-Z]+/) ?? [''])[0];
      if (lead) samplePrefixCounts[lead] = (samplePrefixCounts[lead] ?? 0) + 1;
    }
    const ranked = Object.entries(samplePrefixCounts).sort((a, b) => b[1] - a[1]);
    const claimedCount = samplePrefixCounts[prefixUpper] ?? 0;
    const claimedShare = samples.length === 0 ? 0 : claimedCount / samples.length;
    const claimedRank = ranked.findIndex(([p]) => p === prefixUpper); // -1 = not present
    const acceptable = claimedShare >= 0.2 && claimedRank >= 0 && claimedRank <= 1;
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
  // Dedupe by (mfr, claimed)
  result.wrongPrefixes = result.wrongPrefixes.filter(
    (w, i, arr) => arr.findIndex((x) => x.mfr === w.mfr && x.claimed === w.claimed) === i,
  );

  // ── CHECK 4: FABRICATED DICT — Chinese phrases CLAIMED to map to a target,
  // where the phrase doesn't exist in atlasMapper.ts. To distinguish a CLAIM
  // from PROSE mention, require the Chinese phrase to be in proximity to a
  // mapping signal within ~50 chars: an arrow (→/->), or a quoted lowercase
  // identifier (attributeId-shaped like `output_current` / `'channels'`).
  // Catches:
  //   "放大器数 and 通道数 both → channels"  (arrow within 50 chars)
  //   "放大器数 maps to channels"            (still flagged via attributeId proximity if 'channels' follows)
  // Does NOT flag:
  //   "concerns about 漏电 (leakage)"        (no arrow, no attributeId nearby)
  if (atlasMapperSrc) {
    const phrasesSeen = new Set();
    const allChinesePhrasesPat = /[\p{Script=Han}]{2,8}/gu;
    while ((m = allChinesePhrasesPat.exec(card_text)) !== null) {
      const phrase = m[0];
      if (phrasesSeen.has(phrase)) continue;
      phrasesSeen.add(phrase);

      // Skip known Chinese unit words — units, not parameter names.
      if (CHINESE_UNIT_WORDS.has(phrase)) continue;
      const foundInDict = atlasMapperSrc.includes(`'${phrase}`) || atlasMapperSrc.includes(`"${phrase}`);
      if (foundInDict) continue;
      // Traditional → simplified retry. atlasMapper.ts entries are
      // simplified-only by convention.
      const simplified = toSimplified(phrase);
      if (simplified !== phrase) {
        const foundSimplified =
          atlasMapperSrc.includes(`'${simplified}`) || atlasMapperSrc.includes(`"${simplified}`);
        if (foundSimplified) continue;
      }
      // Engineer-accepted overrides (NFC + lowercase + trim normalization
      // matches the POST handler at app/api/admin/atlas/dictionaries/route.ts).
      const canonOriginal = phrase.normalize('NFC').toLowerCase().trim();
      if (acceptedOverrideParams.has(canonOriginal)) continue;
      if (simplified !== phrase) {
        const canonSimplified = simplified.normalize('NFC').toLowerCase().trim();
        if (acceptedOverrideParams.has(canonSimplified)) continue;
      }
      // Slash-compound reconstruction — `封装/外壳`-style combined keys,
      // checking every sub-span containing the phrase.
      const compoundCandidates = getSlashCompoundCandidates(card_text, m.index, phrase);
      let compoundResolved = false;
      for (const candidate of compoundCandidates) {
        const candSimplified = toSimplified(candidate);
        const forms = candSimplified !== candidate ? [candidate, candSimplified] : [candidate];
        for (const form of forms) {
          if (atlasMapperSrc.includes(`'${form}`) || atlasMapperSrc.includes(`"${form}`)) {
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

      // Skip parenthetical clarifiers — `<Chinese>(<phrase>) → ...` is a
      // disambiguation note on the preceding Chinese term, not a standalone
      // mapping subject. Real example: `稳压值(范围) → _vz_range`.
      const before = m.index > 0 ? card_text[m.index - 1] : '';
      const after = card_text[m.index + phrase.length] ?? '';
      const isParenthetical = (before === '(' || before === '（') && (after === ')' || after === '）');
      if (isParenthetical) {
        const beforeParen = m.index >= 2 ? card_text[m.index - 2] : '';
        if (beforeParen && /[\p{Script=Han}]/u.test(beforeParen)) continue;
      }
      // Skip compound-suffix fragments — `<Han>-<phrase>` means the
      // phrase is a sub-component of a Chinese compound, not a standalone
      // mapping subject. Example: `电流-最大值 → max_fault_current` maps
      // the whole compound; the regex captures 最大值 separately because
      // the dash breaks the Han run.
      if (before === '-' && m.index >= 2) {
        const beforeDash = card_text[m.index - 2] ?? '';
        if (/[\p{Script=Han}]/u.test(beforeDash)) continue;
      }

      // Proximity check: within 50 chars AFTER the phrase, look for arrow or
      // attributeId-shaped quoted identifier.
      const afterStart = m.index + phrase.length;
      const afterWindow = card_text.slice(afterStart, afterStart + 50);
      // Require explicit mapping SYNTAX — an arrow OR a quoted/backticked
      // lowercase identifier (the canonical-name shape). Bare English prose
      // words ("verify", "invent", "map") are NOT a mapping claim and were
      // the dominant false-positive class in the May 21 audit.
      const hasMappingSignal =
        /(?:→|->)/.test(afterWindow) ||
        /['"`][a-z][a-z_0-9]{2,}['"`]/.test(afterWindow);

      if (hasMappingSignal) {
        result.fabricatedDict.push({ phrase, claimedTarget: '(referenced in mapping-like context, not in dict)' });
      }
    }
  }

  summary.push(result);
}

// 4. Output
let totalIssues = 0;
const cleanCards = [];
const dirtyCards = [];

for (const r of summary) {
  const issueCount = r.bogusMfrs.length + r.omittedMfrs.length + r.wrongPrefixes.length + r.fabricatedDict.length;
  totalIssues += issueCount;
  if (issueCount === 0) cleanCards.push(r);
  else dirtyCards.push({ ...r, issueCount });
}

// Sort dirty by issue count desc
dirtyCards.sort((a, b) => b.issueCount - a.issueCount);

console.log('═══ DIRTY CARDS (issues found) ═══');
if (dirtyCards.length === 0) console.log('  (none)');
for (const r of dirtyCards) {
  console.log(`\n▸ ${r.family_id} (${r.status}) — ${r.issueCount} issue(s)`);
  if (r.bogusMfrs.length) {
    console.log(`    ❌ BOGUS MFRs (${r.bogusMfrs.length}): mentioned but don't ship under family ${r.family_id}`);
    for (const b of r.bogusMfrs) console.log(`       • ${b}`);
  }
  if (r.omittedMfrs.length) {
    console.log(`    ⚠️  OMITTED MFRs (${r.omittedMfrs.length}): top-${PREFIX_OMISSION_MFR_COUNT} MFRs not mentioned in card`);
    for (const o of r.omittedMfrs) console.log(`       • ${o.name} — ${o.productCount} products (${o.share}% of family)`);
  }
  if (r.wrongPrefixes.length) {
    console.log(`    ❌ WRONG PREFIX (${r.wrongPrefixes.length}): claimed prefix doesn't match MFR's MPN samples`);
    for (const w of r.wrongPrefixes) console.log(`       • ${w.mfr}: claimed "${w.claimed}", actual samples: ${w.actualSamples.join(', ')}`);
  }
  if (r.fabricatedDict.length) {
    console.log(`    ❌ FABRICATED DICT (${r.fabricatedDict.length}): claimed Chinese→canonical not in atlasMapper.ts`);
    for (const f of r.fabricatedDict) console.log(`       • "${f.phrase}" → ${f.claimedTarget}  (no '${f.phrase}' key in atlasMapper.ts)`);
  }
}

console.log('\n═══ CLEAN CARDS ═══');
if (cleanCards.length === 0) console.log('  (none)');
else {
  for (const r of cleanCards) console.log(`  ✓ ${r.family_id} (${r.status})`);
}

console.log('\n═══ SUMMARY ═══');
console.log(`  Cards audited:    ${summary.length}`);
console.log(`  Clean:            ${cleanCards.length}`);
console.log(`  With issues:      ${dirtyCards.length}`);
console.log(`  Total issues:     ${totalIssues}`);
console.log('');
console.log('  Heuristic audit — some false positives expected. Eyeball flagged items.');
console.log('  False positive? Check whether the MFR is referenced by an alias not in atlas_manufacturers.');
console.log('  False negative? Card may use unusual prose patterns the regex doesn\'t match.');
console.log('');
