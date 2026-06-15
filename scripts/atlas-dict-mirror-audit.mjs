#!/usr/bin/env node
/**
 * Atlas dict mirror audit — compares dict contents between
 * lib/services/atlasMapper.ts and scripts/atlas-ingest.mjs.
 *
 * Both files MUST stay byte-equivalent in their dict content (per Decision
 * #174 mirror discipline). This script extracts each dict's key set and
 * reports per-dict drift.
 *
 * Decision #235 follow-up: Item 2 (L2 LEDs) discovered 16 missing English-
 * side entries in the mjs L2 LEDs block, silently dropping ingest data for
 * 481+ Refond products. Other dicts likely have similar drift.
 *
 * Usage: node scripts/atlas-dict-mirror-audit.mjs [--out docs/audits/mjs-ts-drift-YYYY-MM-DD.md]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const TS_PATH = resolve(ROOT, 'lib/services/atlasMapper.ts');
const MJS_PATH = resolve(ROOT, 'scripts/atlas-ingest.mjs');

// Dict-block locator regexes. The TS and mjs naming is different but the
// content structure is identical.
const TOP_LEVEL_DICTS = [
  {
    label: 'FAMILY_PARAMS',
    ts: /const atlasParamDictionaries: Record<string, Record<string, AtlasParamMapping>>\s*=\s*\{/,
    mjs: /const FAMILY_PARAMS\s*=\s*\{/,
    inner: 'nested', // each inner key is a family ID with its own inner block
  },
  {
    label: 'L2_PARAMS',
    ts: /const atlasL2ParamDictionaries: Record<string, Record<string, AtlasParamMapping>>\s*=\s*\{/,
    mjs: /const L2_PARAMS\s*=\s*\{/,
    inner: 'nested',
  },
  {
    label: 'SHARED_PARAMS',
    ts: /const sharedParamDictionary:[^=]*=\s*\{/,
    mjs: /const SHARED_PARAMS\s*=\s*\{/,
    inner: 'flat', // direct key map, no per-scope nesting
  },
  {
    label: 'METADATA_PARAMS',
    ts: /const metadataParamDictionary:[^=]*=\s*\{/,
    mjs: /const METADATA_PARAMS\s*=\s*\{/,
    inner: 'flat',
  },
  {
    label: 'SKIP_PARAMS',
    ts: /const skipParams\s*=\s*new Set\(\[/,
    mjs: /const SKIP_PARAMS\s*=\s*new Set\(\[/,
    inner: 'set',
  },
];

// Extracts the contents between an open `{` (or `[` for sets) and its
// matching close, respecting brace depth + string literals.
function extractBlock(source, startIdx, openChar = '{', closeChar = '}') {
  let depth = 1;
  let i = startIdx;
  let inString = false;
  let stringChar = '';
  let inLineComment = false;
  let inBlockComment = false;
  while (i < source.length && depth > 0) {
    const c = source[i];
    const next = source[i + 1];
    if (inLineComment) {
      if (c === '\n') inLineComment = false;
      i++;
      continue;
    }
    if (inBlockComment) {
      if (c === '*' && next === '/') { inBlockComment = false; i += 2; continue; }
      i++;
      continue;
    }
    if (inString) {
      if (c === '\\') { i += 2; continue; }
      if (c === stringChar) inString = false;
      i++;
      continue;
    }
    if (c === '/' && next === '/') { inLineComment = true; i += 2; continue; }
    if (c === '/' && next === '*') { inBlockComment = true; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') { inString = true; stringChar = c; i++; continue; }
    if (c === openChar) depth++;
    else if (c === closeChar) depth--;
    i++;
  }
  return { content: source.slice(startIdx, i - 1), endIdx: i };
}

// Extracts top-level dict declaration block. Returns content between `{...}`.
function findDictBlock(source, pattern) {
  const match = pattern.exec(source);
  if (!match) return null;
  const openIdx = match.index + match[0].length;
  const { content } = extractBlock(source, openIdx, '{', '}');
  return content;
}

function findSetBlock(source, pattern) {
  const match = pattern.exec(source);
  if (!match) return null;
  const openIdx = match.index + match[0].length;
  const { content } = extractBlock(source, openIdx, '[', ']');
  return content;
}

// Parse FLAT dict — direct map of 'key': { ... } entries.
function extractFlatKeys(blockContent) {
  const keys = new Set();
  // Match: 'key': or "key": at the start of a logical entry, where the key
  // can contain any non-quote characters (incl. special chars / Chinese).
  // Need to be careful: skip strings inside { ... } values.
  let depth = 0;
  let i = 0;
  let inString = false;
  let stringChar = '';
  let lineStart = true;
  let inLineComment = false;
  let inBlockComment = false;
  while (i < blockContent.length) {
    const c = blockContent[i];
    const next = blockContent[i + 1];
    if (inLineComment) {
      if (c === '\n') { inLineComment = false; lineStart = true; }
      i++;
      continue;
    }
    if (inBlockComment) {
      if (c === '*' && next === '/') { inBlockComment = false; i += 2; continue; }
      i++;
      continue;
    }
    if (inString) {
      if (c === '\\') { i += 2; continue; }
      if (c === stringChar) inString = false;
      i++;
      continue;
    }
    if (c === '/' && next === '/') { inLineComment = true; i += 2; continue; }
    if (c === '/' && next === '*') { inBlockComment = true; i += 2; continue; }

    // At depth 0, look for key entries (only at line start, ignoring whitespace).
    if (depth === 0 && (c === "'" || c === '"')) {
      // Find matching close quote.
      const quote = c;
      let j = i + 1;
      while (j < blockContent.length) {
        const cc = blockContent[j];
        if (cc === '\\') { j += 2; continue; }
        if (cc === quote) break;
        j++;
      }
      const key = blockContent.slice(i + 1, j);
      // Must be followed by ':' (with optional whitespace)
      let k = j + 1;
      while (k < blockContent.length && /\s/.test(blockContent[k])) k++;
      if (blockContent[k] === ':') {
        keys.add(key);
      }
      i = j + 1;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') depth--;
    if (c === '\n') lineStart = true;
    else if (!/\s/.test(c)) lineStart = false;
    i++;
  }
  return keys;
}

// Parse NESTED dict — { 'familyId': { 'key': {...}, ... }, ... }
function extractNestedKeys(blockContent) {
  const familyDicts = new Map(); // familyKey -> Set of inner keys
  let depth = 0;
  let i = 0;
  let inString = false;
  let stringChar = '';
  let inLineComment = false;
  let inBlockComment = false;
  let currentFamily = null;
  let currentInnerStart = -1;

  while (i < blockContent.length) {
    const c = blockContent[i];
    const next = blockContent[i + 1];
    if (inLineComment) {
      if (c === '\n') inLineComment = false;
      i++;
      continue;
    }
    if (inBlockComment) {
      if (c === '*' && next === '/') { inBlockComment = false; i += 2; continue; }
      i++;
      continue;
    }
    if (inString) {
      if (c === '\\') { i += 2; continue; }
      if (c === stringChar) inString = false;
      i++;
      continue;
    }
    if (c === '/' && next === '/') { inLineComment = true; i += 2; continue; }
    if (c === '/' && next === '*') { inBlockComment = true; i += 2; continue; }

    // At depth 0, look for `familyId: {` patterns
    if (depth === 0 && currentFamily === null) {
      // Could be: B1: { ... }  OR  'LEDs and Optoelectronics': { ... }
      // Identify the family key
      let key = null;
      let scanFrom = i;
      if (c === "'" || c === '"') {
        const quote = c;
        let j = i + 1;
        while (j < blockContent.length) {
          const cc = blockContent[j];
          if (cc === '\\') { j += 2; continue; }
          if (cc === quote) break;
          j++;
        }
        key = blockContent.slice(i + 1, j);
        scanFrom = j + 1;
      } else if (/[A-Za-z0-9_]/.test(c)) {
        let j = i;
        while (j < blockContent.length && /[A-Za-z0-9_]/.test(blockContent[j])) j++;
        key = blockContent.slice(i, j);
        scanFrom = j;
      }
      if (key !== null) {
        // Look for `: {` after the key (with optional whitespace)
        let k = scanFrom;
        while (k < blockContent.length && /\s/.test(blockContent[k])) k++;
        if (blockContent[k] === ':') {
          k++;
          while (k < blockContent.length && /\s/.test(blockContent[k])) k++;
          if (blockContent[k] === '{') {
            currentFamily = key;
            currentInnerStart = k + 1;
            depth++;
            i = k + 1;
            continue;
          }
        }
      }
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0 && currentFamily !== null) {
        // End of inner block for currentFamily
        const innerContent = blockContent.slice(currentInnerStart, i);
        const keys = extractFlatKeys(innerContent);
        familyDicts.set(currentFamily, keys);
        currentFamily = null;
        currentInnerStart = -1;
      }
    }
    i++;
  }
  return familyDicts;
}

// Parse SET — `'val1', 'val2', ...` inside `new Set([ ... ])`
function extractSetMembers(blockContent) {
  const members = new Set();
  let i = 0;
  let inLineComment = false;
  let inBlockComment = false;
  while (i < blockContent.length) {
    const c = blockContent[i];
    const next = blockContent[i + 1];
    if (inLineComment) {
      if (c === '\n') inLineComment = false;
      i++;
      continue;
    }
    if (inBlockComment) {
      if (c === '*' && next === '/') { inBlockComment = false; i += 2; continue; }
      i++;
      continue;
    }
    if (c === '/' && next === '/') { inLineComment = true; i += 2; continue; }
    if (c === '/' && next === '*') { inBlockComment = true; i += 2; continue; }
    if (c === "'" || c === '"') {
      const quote = c;
      let j = i + 1;
      while (j < blockContent.length) {
        const cc = blockContent[j];
        if (cc === '\\') { j += 2; continue; }
        if (cc === quote) break;
        j++;
      }
      members.add(blockContent.slice(i + 1, j));
      i = j + 1;
      continue;
    }
    i++;
  }
  return members;
}

// Load both files
const tsSource = readFileSync(TS_PATH, 'utf-8');
const mjsSource = readFileSync(MJS_PATH, 'utf-8');

// Audit each dict
const audits = [];
for (const spec of TOP_LEVEL_DICTS) {
  if (spec.inner === 'set') {
    const tsBlock = findSetBlock(tsSource, spec.ts);
    const mjsBlock = findSetBlock(mjsSource, spec.mjs);
    if (!tsBlock || !mjsBlock) {
      audits.push({ label: spec.label, error: `Could not find block (TS=${!!tsBlock}, mjs=${!!mjsBlock})` });
      continue;
    }
    const tsMembers = extractSetMembers(tsBlock);
    const mjsMembers = extractSetMembers(mjsBlock);
    const onlyInTs = [...tsMembers].filter(k => !mjsMembers.has(k));
    const onlyInMjs = [...mjsMembers].filter(k => !tsMembers.has(k));
    audits.push({ label: spec.label, type: 'set', tsCount: tsMembers.size, mjsCount: mjsMembers.size, onlyInTs, onlyInMjs });
    continue;
  }

  const tsBlock = findDictBlock(tsSource, spec.ts);
  const mjsBlock = findDictBlock(mjsSource, spec.mjs);
  if (!tsBlock || !mjsBlock) {
    audits.push({ label: spec.label, error: `Could not find block (TS=${!!tsBlock}, mjs=${!!mjsBlock})` });
    continue;
  }

  if (spec.inner === 'flat') {
    const tsKeys = extractFlatKeys(tsBlock);
    const mjsKeys = extractFlatKeys(mjsBlock);
    const onlyInTs = [...tsKeys].filter(k => !mjsKeys.has(k));
    const onlyInMjs = [...mjsKeys].filter(k => !tsKeys.has(k));
    audits.push({ label: spec.label, type: 'flat', tsCount: tsKeys.size, mjsCount: mjsKeys.size, onlyInTs, onlyInMjs });
    continue;
  }

  // nested
  const tsNested = extractNestedKeys(tsBlock);
  const mjsNested = extractNestedKeys(mjsBlock);
  const allFamilies = new Set([...tsNested.keys(), ...mjsNested.keys()]);
  const perFamily = [];
  for (const fam of [...allFamilies].sort()) {
    const tsKeys = tsNested.get(fam) ?? new Set();
    const mjsKeys = mjsNested.get(fam) ?? new Set();
    const onlyInTs = [...tsKeys].filter(k => !mjsKeys.has(k));
    const onlyInMjs = [...mjsKeys].filter(k => !tsKeys.has(k));
    perFamily.push({
      familyId: fam,
      tsCount: tsKeys.size,
      mjsCount: mjsKeys.size,
      onlyInTs,
      onlyInMjs,
      isMissingFromMjs: !mjsNested.has(fam),
      isMissingFromTs: !tsNested.has(fam),
    });
  }
  audits.push({ label: spec.label, type: 'nested', perFamily });
}

// Pretty-print summary to console
function fmt(s) { return JSON.stringify(s); }
let summaryLines = [];
let totalDrift = 0;
for (const a of audits) {
  summaryLines.push(`\n═══ ${a.label} ═══`);
  if (a.error) { summaryLines.push(`  ERROR: ${a.error}`); continue; }
  if (a.type === 'flat' || a.type === 'set') {
    summaryLines.push(`  TS: ${a.tsCount} keys; mjs: ${a.mjsCount} keys`);
    if (a.onlyInTs.length === 0 && a.onlyInMjs.length === 0) {
      summaryLines.push(`  ✓ No drift`);
    } else {
      totalDrift += a.onlyInTs.length + a.onlyInMjs.length;
      if (a.onlyInTs.length) {
        summaryLines.push(`  Only in TS (${a.onlyInTs.length}):`);
        for (const k of a.onlyInTs.slice(0, 30)) summaryLines.push(`    + ${fmt(k)}`);
        if (a.onlyInTs.length > 30) summaryLines.push(`    ... and ${a.onlyInTs.length - 30} more`);
      }
      if (a.onlyInMjs.length) {
        summaryLines.push(`  Only in mjs (${a.onlyInMjs.length}):`);
        for (const k of a.onlyInMjs.slice(0, 30)) summaryLines.push(`    + ${fmt(k)}`);
        if (a.onlyInMjs.length > 30) summaryLines.push(`    ... and ${a.onlyInMjs.length - 30} more`);
      }
    }
    continue;
  }
  // nested
  for (const fam of a.perFamily) {
    const drift = fam.onlyInTs.length + fam.onlyInMjs.length;
    totalDrift += drift;
    let header = `  ▸ ${fam.familyId}: TS=${fam.tsCount}, mjs=${fam.mjsCount}`;
    if (fam.isMissingFromMjs) header += ' (NOT IN MJS)';
    if (fam.isMissingFromTs) header += ' (NOT IN TS)';
    if (drift === 0) header += '  ✓';
    summaryLines.push(header);
    if (fam.onlyInTs.length) {
      summaryLines.push(`    Only in TS (${fam.onlyInTs.length}):`);
      for (const k of fam.onlyInTs.slice(0, 20)) summaryLines.push(`      + ${fmt(k)}`);
      if (fam.onlyInTs.length > 20) summaryLines.push(`      ... and ${fam.onlyInTs.length - 20} more`);
    }
    if (fam.onlyInMjs.length) {
      summaryLines.push(`    Only in mjs (${fam.onlyInMjs.length}):`);
      for (const k of fam.onlyInMjs.slice(0, 20)) summaryLines.push(`      + ${fmt(k)}`);
      if (fam.onlyInMjs.length > 20) summaryLines.push(`      ... and ${fam.onlyInMjs.length - 20} more`);
    }
  }
}

console.log(`\nAtlas dict mirror audit — ${new Date().toISOString().slice(0, 10)}`);
console.log(`Total drift entries (sum of one-sided keys across all dicts): ${totalDrift}`);
console.log(summaryLines.join('\n'));

// Optional markdown output
const outArg = process.argv.findIndex(a => a === '--out');
if (outArg !== -1 && process.argv[outArg + 1]) {
  const outPath = resolve(ROOT, process.argv[outArg + 1]);
  mkdirSync(dirname(outPath), { recursive: true });
  const mdLines = [
    `# Atlas Dict Mirror Audit`,
    ``,
    `**Generated**: ${new Date().toISOString().slice(0, 10)}`,
    `**Total drift entries** (one-sided keys across all dicts): **${totalDrift}**`,
    ``,
    `Compares dict contents between [lib/services/atlasMapper.ts](../../lib/services/atlasMapper.ts) and [scripts/atlas-ingest.mjs](../../scripts/atlas-ingest.mjs).`,
    ``,
    `Per Decision #174 mirror discipline, both files MUST stay byte-equivalent in dict content. Drift means silently-failed ingest mappings.`,
    ``,
  ];
  for (const a of audits) {
    mdLines.push(`## ${a.label}`);
    mdLines.push(``);
    if (a.error) { mdLines.push(`> ERROR: ${a.error}`); mdLines.push(``); continue; }
    if (a.type === 'flat' || a.type === 'set') {
      mdLines.push(`- TS: ${a.tsCount} keys`);
      mdLines.push(`- mjs: ${a.mjsCount} keys`);
      mdLines.push(``);
      if (a.onlyInTs.length === 0 && a.onlyInMjs.length === 0) {
        mdLines.push(`✓ No drift.`);
        mdLines.push(``);
      } else {
        if (a.onlyInTs.length) {
          mdLines.push(`### Only in TS (${a.onlyInTs.length})`);
          mdLines.push(``);
          for (const k of a.onlyInTs) mdLines.push(`- \`${k}\``);
          mdLines.push(``);
        }
        if (a.onlyInMjs.length) {
          mdLines.push(`### Only in mjs (${a.onlyInMjs.length})`);
          mdLines.push(``);
          for (const k of a.onlyInMjs) mdLines.push(`- \`${k}\``);
          mdLines.push(``);
        }
      }
      continue;
    }
    for (const fam of a.perFamily) {
      const drift = fam.onlyInTs.length + fam.onlyInMjs.length;
      const status = drift === 0 ? '✓' : '⚠';
      mdLines.push(`### ${status} ${fam.familyId} — TS=${fam.tsCount}, mjs=${fam.mjsCount}${fam.isMissingFromMjs ? ' (NOT IN MJS)' : ''}${fam.isMissingFromTs ? ' (NOT IN TS)' : ''}`);
      mdLines.push(``);
      if (drift === 0) { mdLines.push(`No drift.`); mdLines.push(``); continue; }
      if (fam.onlyInTs.length) {
        mdLines.push(`**Only in TS (${fam.onlyInTs.length}):**`);
        mdLines.push(``);
        for (const k of fam.onlyInTs) mdLines.push(`- \`${k}\``);
        mdLines.push(``);
      }
      if (fam.onlyInMjs.length) {
        mdLines.push(`**Only in mjs (${fam.onlyInMjs.length}):**`);
        mdLines.push(``);
        for (const k of fam.onlyInMjs) mdLines.push(`- \`${k}\``);
        mdLines.push(``);
      }
    }
  }
  writeFileSync(outPath, mdLines.join('\n'));
  console.log(`\nWrote markdown report to ${outPath}`);
}
