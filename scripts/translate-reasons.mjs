#!/usr/bin/env node
/**
 * Apply Chinese translations for ALL engineering reasons.
 *
 * Uses a text-keyed lookup: { "English reason text": "Chinese translation" }
 * This de-duplicates shared texts (719 entries → 611 unique).
 *
 * Usage: node scripts/translate-reasons.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const en = JSON.parse(readFileSync(join(root, 'locales/en.json'), 'utf-8'));
const zh = JSON.parse(readFileSync(join(root, 'locales/zh-CN.json'), 'utf-8'));

// Load Chinese translations lookup (English text → Chinese text)
const lookupPath = join(__dirname, 'zh-translations.json');
if (!existsSync(lookupPath)) {
  console.error('ERROR: zh-translations.json not found');
  process.exit(1);
}
const zhLookup = JSON.parse(readFileSync(lookupPath, 'utf-8'));
console.log(`Loaded ${Object.keys(zhLookup).length} Chinese translations`);

// Apply translations
const enLT = en.logicTable;
let stats = { zh: 0, total: 0, missing: [] };

for (const [fid, enFamily] of Object.entries(enLT)) {
  for (const [attrId, enReason] of Object.entries(enFamily.reason || {})) {
    stats.total++;

    if (zh.logicTable[fid]) {
      if (!zh.logicTable[fid].reason) zh.logicTable[fid].reason = {};
      if (zhLookup[enReason]) {
        zh.logicTable[fid].reason[attrId] = zhLookup[enReason];
        stats.zh++;
      } else {
        zh.logicTable[fid].reason[attrId] = enReason; // English fallback
        stats.missing.push(`${fid}.${attrId}`);
      }
    }
  }
}

writeFileSync(join(root, 'locales/zh-CN.json'), JSON.stringify(zh, null, 2) + '\n');

console.log('\n=== Engineering Reason Translation Stats ===');
console.log(`ZH: ${stats.zh}/${stats.total} (${Math.round(stats.zh/stats.total*100)}%) translated`);
if (stats.missing.length > 0) {
  console.log(`\nMissing translations (${stats.missing.length}):`);
  for (const id of stats.missing.slice(0, 20)) console.log(`  ${id}`);
  if (stats.missing.length > 20) console.log(`  ... and ${stats.missing.length - 20} more`);
}
