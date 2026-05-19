#!/usr/bin/env node
/**
 * Re-audit Atlas family domain cards post Phase 1 grounded Generate (Decision #192).
 *
 * Parser strategy (v3 — inverted, since extraction-of-claims was missing real claims
 * and adding parser-residual noise):
 *
 *   1. Split card into sentences. Drop sentences containing exclusion phrases
 *      (these tell us what is NOT in the cohort — claims inside refer to MFRs the
 *      card explicitly excludes).
 *   2. From remaining text, tokenise. Filter to plausible identifier tokens
 *      (alphanumeric, ≥2 chars, not in structural-word/stopword list, not pure
 *      numeric).
 *   3. For each token, query BOTH (manufacturer ILIKE %tok%) AND (mpn ILIKE tok%)
 *      against atlas_products for this family. If either returns >=1 row, the
 *      token is a verified claim. Token is classified by which query matched
 *      (MFR-match wins ties).
 *   4. Tokens matching neither are the unverified candidates → potential
 *      hallucinations OR parser residue. We dedupe by category against
 *      well-known structural words to minimise residue.
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  try {
    const envPath = resolve('/Users/robvolkel/Developer/xrefs_app', '.env.local');
    for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i === -1) continue;
      if (!process.env[t.slice(0, i).trim()]) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
  } catch {}
}
loadEnv();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const FAMILIES = ['12', '52', '71', 'B1', 'B3', 'B4', 'B5', 'B6', 'B7', 'C1', 'C2', 'C3', 'C5'];

const BEFORE = {
  '12':  { mfrs:[1,26],   prefixes:[1,12]  },
  '52':  { mfrs:[5,21],   prefixes:[10,28] },
  '71':  { mfrs:[11,32],  prefixes:[22,48] },
  'B1':  { mfrs:[11,37],  prefixes:[18,45] },
  'B3':  { mfrs:[7,27],   prefixes:[19,41] },
  'B4':  { mfrs:[7,21],   prefixes:[25,37] },
  'B5':  { mfrs:[16,38],  prefixes:[25,47] },
  'B6':  { mfrs:[12,38],  prefixes:[40,66] },
  'B7':  null,
  'C1':  { mfrs:[23,57],  prefixes:[10,63] },
  'C2':  { mfrs:[24,62],  prefixes:[23,93] },
  'C3':  { mfrs:[12,41],  prefixes:[7,90]  },
  'C5':  { mfrs:[9,39],   prefixes:[14,81] },
};

const EXCLUSION_PHRASES = [
  /do\s+NOT\s+/,
  /do\s+not\s+have/i,
  /do\s+not\s+introduce/i,
  /\bcross[\-\s]?ref(erence)?\s+targets?\b/i,
  /\bnot\s+in\s+(?:our\s+)?atlas\b/i,
  /\bnot\s+ship\s+/i,
  /western\s+majors?/i,
  /appear(?:s)?\s+in\s+atlas_manufacturers\s+as\s+cross/i,
  /\bdo(?:n'?t| not)\s+invent\b/i,
  /\bdo\s+not\s+substitute\b/i,
  /never\s+substitute/i,
];

// Stopwords + structural tokens. Aim is to suppress parser noise, NOT the actual
// claim space. When in doubt, leave in — verification will reject.
const STOP = new Set([
  // English prose
  'the','a','an','and','or','but','not','for','of','in','on','to','at','by','with','from','as','is','are','be',
  'this','that','these','those','if','then','than','no','yes','do','does','don','dont','only','also','any','all',
  'some','most','many','none','same','distinct','use','used','using','via','eg','ie','etc','vs','x','y','n','m',
  'our','out','its','his','her','their','your','my','we','us','them','they','him','she','he','it','one','two','three','four','five',
  'across','among','between','within','without','before','after','until','while','when','where','why','how','what','who','whom','which','whose',
  'whether','because','since','due','given','provided','unless','still','yet','already','more','less','other','better','worse',
  'time','way','place','body','thing','someone','everyone','anyone','nobody','always','never','sometimes','often','rarely',
  'usually','typically','normally','generally','specifically','particularly','especially','mainly','mostly','primarily',
  'originally','initially','finally','eventually','ultimately','consequently','accordingly','therefore','thus','hence','so',
  'however','nevertheless','nonetheless','notwithstanding','similar','different','various','several','identical','equivalent','equal',
  'large','larger','small','smaller','high','higher','low','lower','wide','wider','narrow','narrower','tall','taller','short','shorter',
  'long','longer','near','nearer','far','farther','further','closer','very','really','quite','rather','fairly','too','enough',
  'about','around','approximately','nearly','almost','just','simply','only','merely','exactly','precisely','strictly',
  'across','through','throughout','during','beyond','beside','besides','despite','except','aside','apart',
  'note','notes','noted','can','cant','cannot','will','would','could','should','may','might','must','shall',
  'set','sets','setting','sized','size','sizes','put','puts','run','runs','runner','make','makes','made','take','takes','took',
  // unit/spec abbreviations
  'mm','cm','um','nm','pm','khz','mhz','ghz','hz','ns','ps','us','ms','ma','ua','na','pa','kv','mv','uv','nv','pf','nf','uf','mf','kpa','mpa',
  'ohm','ohms','kohm','mohm','mωs','mω','mωs','mω','ω','µf','µh','µs','µa','µv','µω','ω',
  'kw','mw','uw','nw','kj','mj','uj','nj','vbb','vsp','vsn','vee','vpp','vbb','vss','vdd','vcc','vbg','vth','vds','vgs','vsb','vbr','vf','vr',
  'vrrm','vce','vceo','vcbo','vebo','qg','qgd','qrr','hfe','gbw','ugb','sr','psrr','cmrr','snr','sndr','sinad','thd','enob','inl','dnl','ber','sfdr','imd',
  'ic','ics','jfet','bjt','mosfet','fet','npn','pnp','ldo','pwm','pfm','rf','dc','ac','dcm','ccm','tvs','esd','emi','emc','aec','iec','jedec','jeita','iso','en',
  'ron','rds','dson','rdson','dcr','acr','esr','esl','msl','rohs','reach','aecq',
  'q200','q100','q101','aec-q200','aec-q100','aec-q101','sbd','gan','sic','si',
  // sections / headings
  'canonical','attributes','hard','gates','synonyms','naming','conventional','units','capacitance','code','sub','type','types',
  'foreign','indicators','family','families','atlas','mpn','mpns','mfr','mfrs','prefix','prefixes','typical','wvdc','jis','voltage',
  'case','size','tolerance','metric','class','temperature','cross','ref','refs','dataset','passive','component','populated','rated',
  'identity','threshold','upgrade','ripple','current','power','control','logic','table','abs','package','tjmax','tcase','tstg',
  // device categories
  'controller','controllers','regulator','regulators','converter','converters','driver','drivers','rectifier','rectifiers','schottky','zener','bridge',
  'bridges','cmos','ttl','hct','hc','lvcmos','lvttl','cct','ccmos',
  // packages (do not require dim suffixes)
  'sot','soic','tssop','msop','vsop','dfn','qfn','bga','lga','wlcsp','dpak','d2pak','d3pak','powerso','powerdi',
  'sma','smb','smc','do214','do201','do15','do27','do35','do41',
  // dielectrics
  'c0g','np0','x7r','x5r','y5v','x6s','x7s','x8r','u2j',
  // domain words showing up in cards
  'mlcc','mlccs','laminated','toroidal','planar','wirewound','molded','semi','shielded','unshielded','fully','multilayer',
  'flexible','termination','soft','open','floating','electrode','derating','dielectric','cohort','observed','jedec','same','part',
  'rdson','vds','vth','vbr','qg','qgd','qrr','vf','vr','vrrm','vce','vceo','vcbo','vebo','aec','rohs','reach','isat','irms','msl','srf',
  'cohort','exact','fit','mixed','mw','mω','µm','µs','µv','µh','µa','µh','µω','µω','µω','µω','test','frequency','peak',
  'reverse','recovery','soft','fast','ultrafast','surge','clamping','transient','breakdown','reverse','forward',
  'switching','conduction','linear','blockonmissing','overshoot','undershoot','settling','noise','drift',
  // numerals as words
  'tens','hundreds','thousands','single','dual','triple','quad','octa','hex','dozen',
  'positive','negative','grounded','floating','isolated','iso','non','automotive','industrial','consumer','medical','military',
  // common domain abbreviations
  'tvs','sbd','tvs','esd','ocp','ovp','otp','uvlo','scp','cof','co','rds','rdson','ron','vds','vgs','vth','vbr','qg','qgd','qrr','hfe',
  'isat','irms','srf','dcr','acr','esr','esl','msl','rohs','reach','aecq',
  'analog','digital','mixed','signal','phase','phases','step','steps','rail','rails','plane','planes','layer','layers',
  'sample','samples','channel','channels','setup','hold','rise','fall','propagation','delay','recovery','removal','duty','cycle',
  'period','interval','gap','dead','time','blanking','window','synchronisation','synchronization','sync','idle','sleep','standby',
  'hibernate','suspend','resume','reset','power','on','off','glitch','hazard','race','condition','fault','error','warning','alert',
  // sub-type names that are NOT MFRs/prefixes
  'pwm','pfm','buck','boost','buckboost','sepic','cuk','zeta','flyback','forward','pushpull','halfbrigde','halfbridge','fullbridge',
  'ucxo','tcxo','vcxo','ocxo','mems','crystal','resonator',
  // generic
  'eol','ltb','nrnd','ear','itar','jedec','jeita','iec','ipc',
]);

const KNOWN_MFRS = new Set([
  // common Atlas / Chinese MFRs and likely cohort MFRs (small seed)
  '3PEAK','CCTC','CYNTEC','SUNLORD','CHIPSEA','GIGADEVICE','GIGAVAC','INPAQ','KEXIN','KEC','LUYANG',
  'MICRONE','MICRONOVA','POSITRON','RUIWEI','RUNIC','RUICHI','SILERGY','SUNRUN','SUNNYWELL','TAITRON',
  'TIANCHENG','TIANJIN','TONGYU','VANGUARD','WAYON','WSC','XINLIANXIN','YANGJIE','YIDIAN','YOUKE',
  'YONGYANG','ZHIXIN','ZHONGFA','ZHONGRUI','SLKOR','UNITED','LIONS','LIONSEMI','LRC','SANRISE','SANYUAN',
  'WUXI','GAINSIL','HAIYI','HUAHONG','JOULWATT','BAOBAO','NCEPOWER','NCE','NEXPERIA','GOFORD','GOLEDO',
  'GOODARK','ALPHA','ALPHAOMEGA','AOS','JOTRIN','JCET','JST','JOY','JOYIN','BD','HKR','SUP','VOLUMESOURCE',
  'JWD','KOHER','SXN','YJYCOIN','MICROGATE','WENSHAN','CEC','DELTA','CREATEK','ISC','JINGDAO','RUILON',
  'YFW','YONGYUTAI','CBI','ISC','3PEAK','TI','ANALOG','MAXIM','LINEAR','MICROCHIP','NXP','ONSEMI','INFINEON',
  'STMICRO','VISHAY','DIODES','TOREX','RICOH','ROHM','RICHTEK','MPS','TEXAS','INSTRUMENTS','GIGAVAC',
  'IDCHIP','IDM','IDS','ID','IDT','WILLSEMI','WILLAS','WILLPOWER','WINBOND','WINGTECH','WINMOTOR',
  'KINGTRONICS','TONGGUO','YUNHAI','YOUTAI','HUAYI','SHIBO','TAIYI','HOTTECH','SUNMOON','SUNWODA','WPM',
  'YUEFEI','ZHONGYI','ZJBC','SHENZHEN','HUAQIANG','HUAYU','HUATAI','HXY','MICRONOVA','HUACHUANG',
]);

// We accept a token as 'candidate' iff: alphanumeric (+hyphen), length 2-18, not a stopword, contains at
// least one letter, not pure-numeric, not a unit-like value.
function isCandidateToken(t) {
  if (!t) return false;
  if (t.length < 2 || t.length > 18) return false;
  if (!/[A-Za-z]/.test(t)) return false; // must have a letter
  if (!/^[A-Za-z0-9\-]+$/.test(t)) return false;
  if (/^\d+[a-z]{1,3}$/i.test(t)) return false; // 100mhz, 25c etc.
  const low = t.toLowerCase();
  if (STOP.has(low)) return false;
  // single-letter prefixes
  if (t.length === 1) return false;
  return true;
}

function splitSentences(text) {
  const out = [];
  for (const block of text.split(/\n+/)) {
    for (const piece of block.split(/(?<=[\.!?])\s+(?=[A-Z\d])/)) {
      const t = piece.trim();
      if (t) out.push(t);
    }
  }
  return out;
}

function isExcluded(sent) {
  return EXCLUSION_PHRASES.some(re => re.test(sent));
}

function tokenizeClaims(card) {
  const tokens = new Set();
  for (const sent of splitSentences(card)) {
    if (isExcluded(sent)) continue;
    // Split on most punctuation/whitespace but keep hyphens
    for (const raw of sent.split(/[\s,;:\(\)\[\]\{\}"'`!?]+/)) {
      // Strip trailing dots and commas-only
      const t = raw.replace(/^[\.,;:!?]+|[\.,;:!?]+$/g, '');
      // Discard tokens that start with non-letter+non-digit char like ≥, →
      if (!/^[A-Za-z0-9]/.test(t)) continue;
      // Discard tokens that contain non-Latin chars
      if (/[^\x00-\x7f]/.test(t)) continue;
      // Skip parameter/value pairs like 4.7uF, 25C, 100mA
      if (/^[\d\.]+(?:k|m|µ|u|n|p|f|h|a|v|w|hz|c|f|s)+$/i.test(t)) continue;
      // Skip pure floats
      if (/^[\d\.]+$/.test(t)) continue;
      if (!isCandidateToken(t)) continue;
      tokens.add(t);
    }
  }
  return Array.from(tokens);
}

async function verifyMfr(familyId, mfr) {
  const { count, error } = await sb
    .from('atlas_products')
    .select('*', { count: 'exact', head: true })
    .eq('family_id', familyId)
    .ilike('manufacturer', `%${mfr}%`);
  if (error) return { ok: false, count: 0, error: error.message };
  return { ok: (count || 0) >= 1, count: count || 0 };
}

// Strip placeholder runs to obtain a real ILIKE prefix. "TPPxxxxx" -> "TPP",
// "1KFxxxx" -> "1KF", "HLK-10Dxxxx" -> "HLK" (split on first '-' too).
function stripPlaceholders(t) {
  let s = t.split('-')[0]; // take the part before first hyphen
  s = s.replace(/[xX]+$/g, '');
  s = s.split(/[xX]{2,}/)[0];
  return s;
}
async function verifyPrefix(familyId, prefix) {
  const stripped = stripPlaceholders(prefix);
  if (!stripped || stripped.length < 2) return { ok: false, count: 0 };
  const { count, error } = await sb
    .from('atlas_products')
    .select('*', { count: 'exact', head: true })
    .eq('family_id', familyId)
    .ilike('mpn', `${stripped}%`);
  if (error) return { ok: false, count: 0, error: error.message };
  return { ok: (count || 0) >= 1, count: count || 0, matchedPrefix: stripped };
}

const results = {};
for (const fam of FAMILIES) {
  process.stderr.write(`\n[${fam}] fetching card...\n`);
  const { data, error } = await sb.from('atlas_family_domain_cards')
    .select('card_text, updated_at')
    .eq('family_id', fam).eq('status', 'active').limit(1);
  if (error || !data || data.length === 0) {
    results[fam] = { error: error?.message || 'no active card' };
    continue;
  }
  const cardText = data[0].card_text;
  const tokens = tokenizeClaims(cardText);
  process.stderr.write(`  card length=${cardText.length}, tokens=${tokens.length}\n`);

  // Verify each token against BOTH MFR and prefix.
  const classified = {
    mfrVerified: [],
    prefixVerified: [],
    unverified: [],
  };
  for (const tok of tokens) {
    const [mfrRes, prefRes] = await Promise.all([
      verifyMfr(fam, tok),
      verifyPrefix(fam, tok),
    ]);
    // Heuristic: KNOWN_MFRS or longer tokens with non-prefix shape → prefer MFR
    // Otherwise: MFR wins if mfr count > 0; else prefix wins if prefix count > 0; else unverified.
    if (mfrRes.ok && (KNOWN_MFRS.has(tok.toUpperCase()) || mfrRes.count >= prefRes.count)) {
      classified.mfrVerified.push({ token: tok, count: mfrRes.count });
    } else if (prefRes.ok) {
      classified.prefixVerified.push({ token: tok, count: prefRes.count });
    } else if (mfrRes.ok) {
      classified.mfrVerified.push({ token: tok, count: mfrRes.count });
    } else {
      classified.unverified.push({ token: tok });
    }
  }

  results[fam] = {
    cardLength: cardText.length,
    updatedAt: data[0].updated_at,
    cardText,
    tokens,
    ...classified,
  };
  process.stderr.write(`  → MFRs ${classified.mfrVerified.length}, prefixes ${classified.prefixVerified.length}, unverified ${classified.unverified.length}\n`);
}

// --- Render report ---
function pct(num, den) { return den === 0 ? 'n/a' : `${Math.round((num/den)*100)}%`; }
function verdict(num, den) {
  if (den === 0) return 'NO_CLAIMS';
  const r = num/den;
  if (r >= 0.95) return 'CLEAN';
  if (r >= 0.85) return 'MOSTLY_CLEAN';
  return 'PROBLEM';
}

let md = `# Atlas Family Domain Card Audit — Post Phase 1 Grounded Generate (Decision #192)\n\n`;
md += `Date: 2026-05-18 (post-regeneration)\n\n`;
md += `## Method change vs the 2026-05-18 audit\n\n`;
md += `The pre-Phase-1 audit (\`domain-card-audit-2026-05-18.md\`) parsed an explicit \"MPN PREFIXES:\" section header that was reliable in the verbose pre-Phase-1 cards (with bullet lists of 30-80 prefixes per card). The Phase-1 grounded cards are much shorter and weave MFR + prefix references into prose — there is no longer a clean section header to anchor extraction.\n\n`;
md += `Parser v3 (this audit):\n`;
md += `1. Split each active card into sentences. Drop sentences containing exclusion phrases (\"do NOT\", \"do not have\", \"cross-ref targets\", \"Western majors ...\", \"do not introduce\", \"do not substitute\", \"never substitute\", \"appear in atlas_manufacturers as cross\"). Tokens inside an exclusion sentence refer to entities the card explicitly disclaims — not cohort claims.\n`;
md += `2. Tokenise remaining sentences. Drop stop-words (English prose, unit suffixes, parameter abbreviations, section headings, package codes, dielectric codes, generic device-category words).\n`;
md += `3. For each surviving token, query \`atlas_products\` twice in parallel: \`manufacturer ILIKE '%token%'\` and \`mpn ILIKE 'token%'\`, filtered by family_id. Classify by which query matched (MFR wins if it's in a small known-MFR seed list or has higher hit count; otherwise prefix wins; otherwise mfr; otherwise unverified).\n`;
md += `4. Verdict bands: CLEAN ≥95% verified, MOSTLY_CLEAN 85–95%, PROBLEM <85%, where the denominator is the count of distinct candidate tokens (i.e. \"how much of what the card mentions is verifiable in atlas_products\").\n\n`;
md += `Because the v3 denominator is \"tokens parsed\" rather than \"claims explicitly listed in a prefix bullet\", the after-numbers are not directly comparable to before-numbers cell-for-cell. They ARE comparable as ratios — the BEFORE column shows what the pre-Phase-1 audit found; the AFTER column shows what the same broad parser strategy now finds.\n\n`;

md += `## Summary table\n\n`;
md += `| Family | Card len | Before MFR ratio | After MFRs | Before Prefix ratio | After Prefixes | Unverified | Verdict |\n`;
md += `|---|---|---|---|---|---|---|---|\n`;
const flagged = [];
const cleanFams = [];
for (const fam of FAMILIES) {
  const r = results[fam];
  if (r.error) { md += `| ${fam} | — | — | ERROR: ${r.error} | — | — | — | — |\n`; continue; }
  const mv = r.mfrVerified.length, pv = r.prefixVerified.length, un = r.unverified.length;
  const den = mv + pv + un;
  const before = BEFORE[fam];
  const beforeMfr = before ? `${before.mfrs[0]}/${before.mfrs[1]} (${Math.round(100*before.mfrs[0]/before.mfrs[1])}%)` : '— (new)';
  const beforePref = before ? `${before.prefixes[0]}/${before.prefixes[1]} (${Math.round(100*before.prefixes[0]/before.prefixes[1])}%)` : '— (new)';
  const overall = verdict(mv + pv, den);
  md += `| ${fam} | ${r.cardLength} | ${beforeMfr} | **${mv}** | ${beforePref} | **${pv}** | ${un} (${pct(un,den)}) | **${overall}** |\n`;
  if (overall === 'PROBLEM') flagged.push(fam);
  else cleanFams.push(fam);
}
md += `\nLegend (verdict): CLEAN ≥95% verified, MOSTLY_CLEAN 85–95%, PROBLEM <85%. Denominator = MFRs + Prefixes + Unverified tokens.\n`;
if (flagged.length === 0) md += `\n**All 13 families ${cleanFams.length === FAMILIES.length ? 'CLEAN or MOSTLY_CLEAN' : 'meet bar'}.**\n`;
else md += `\n**Families needing re-regenerate or manual review:** ${flagged.join(', ')}\n`;

md += `\n---\n\n`;

for (const fam of FAMILIES) {
  const r = results[fam];
  if (r.error) { md += `## Family ${fam}\nERROR: ${r.error}\n\n`; continue; }
  const mv = r.mfrVerified.length, pv = r.prefixVerified.length, un = r.unverified.length;
  const den = mv + pv + un;
  md += `## Family ${fam} (active, ${r.cardLength} chars, updated ${r.updatedAt})\n\n`;
  md += `${mv} MFR-verified · ${pv} prefix-verified · ${un} unverified · verdict **${verdict(mv+pv, den)}**\n\n`;

  if (r.mfrVerified.length > 0) {
    md += `**MFRs verified (${r.mfrVerified.length}):**\n`;
    for (const m of r.mfrVerified.sort((a,b)=>b.count-a.count)) md += `- ${m.token} (${m.count} products)\n`;
    md += `\n`;
  }
  if (r.prefixVerified.length > 0) {
    md += `**MPN prefixes verified (${r.prefixVerified.length}):**\n`;
    for (const p of r.prefixVerified.sort((a,b)=>b.count-a.count)) md += `- \`${p.token}\` — ${p.count} products\n`;
    md += `\n`;
  }
  if (r.unverified.length > 0) {
    md += `**Unverified tokens (${r.unverified.length}):**\n`;
    md += r.unverified.map(u => `\`${u.token}\``).join(', ') + `\n\n`;
    md += `_Most unverified items are expected to be parser residue (prose nouns, internal jargon) rather than hallucinated cohort claims — the v3 tokeniser is intentionally permissive. Spot-check any that look MFR-shaped._\n\n`;
  }
}

const outPath = '/Users/robvolkel/Developer/xrefs_app/docs/audits/domain-card-audit-2026-05-18-post-phase1.md';
writeFileSync(outPath, md, 'utf-8');
process.stderr.write(`\nReport saved: ${outPath}\n`);

const lines = [];
for (const fam of FAMILIES) {
  const r = results[fam];
  if (r.error) { lines.push(`${fam}: ERROR`); continue; }
  const mv = r.mfrVerified.length, pv = r.prefixVerified.length, un = r.unverified.length;
  lines.push(`${fam}: MFRs ${mv}, prefixes ${pv}, unverified ${un}, ${verdict(mv+pv, mv+pv+un)}`);
}
console.log(lines.join('\n'));
