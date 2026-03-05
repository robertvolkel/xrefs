import { readFileSync } from 'fs';
const en = JSON.parse(readFileSync('locales/en.json', 'utf-8'));
const lt = en.logicTable;
const sentences = new Map();
for (const [fid, fam] of Object.entries(lt)) {
  for (const [attrId, reason] of Object.entries(fam.reason || {})) {
    // Split on sentence boundaries
    const parts = reason.split(/(?<=\.)\s+/);
    for (const s of parts) {
      const trimmed = s.trim();
      if (!trimmed) continue;
      if (!sentences.has(trimmed)) sentences.set(trimmed, 0);
      sentences.set(trimmed, sentences.get(trimmed) + 1);
    }
  }
}
console.log('Total unique sentences:', sentences.size);
// Sort by frequency
const sorted = [...sentences.entries()].sort((a,b) => b[1] - a[1]);
for (const [text, count] of sorted) {
  console.log(`${count}x: ${text}`);
}
