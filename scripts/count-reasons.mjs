import { readFileSync } from 'fs';
const en = JSON.parse(readFileSync('locales/en.json', 'utf-8'));
const lt = en.logicTable;
const unique = new Map();
for (const [fid, fam] of Object.entries(lt)) {
  for (const [attrId, reason] of Object.entries(fam.reason || {})) {
    if (!unique.has(reason)) unique.set(reason, []);
    unique.get(reason).push(fid + '.' + attrId);
  }
}
console.log('Total reason entries: 719');
console.log('Unique reason texts:', unique.size);
const sorted = [...unique.entries()].sort((a,b) => b[1].length - a[1].length);
console.log('\nMost shared reasons:');
for (const [text, ids] of sorted.slice(0, 15)) {
  console.log('  ' + ids.length + 'x: ' + text.substring(0, 90) + '...');
}
