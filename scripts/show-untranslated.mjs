import { readFileSync } from 'fs';
const en = JSON.parse(readFileSync('locales/en.json', 'utf-8'));
const de = JSON.parse(readFileSync('locales/de.json', 'utf-8'));
const enLT = en.logicTable;

// Show reasons that are still English in DE
let count = 0;
for (const [fid, fam] of Object.entries(enLT)) {
  for (const [attrId, enReason] of Object.entries(fam.reason || {})) {
    const deR = de.logicTable[fid]?.reason?.[attrId];
    if (deR === enReason) {
      count++;
      if (count <= 30) {
        console.log(`[${fid}.${attrId}] ${enReason.substring(0, 120)}`);
      }
    }
  }
}
console.log(`\nTotal untranslated DE reasons: ${count}/719`);
