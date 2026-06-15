#!/usr/bin/env node
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
const __dirname = dirname(fileURLToPath(import.meta.url));
function loadEnv() {
  const c = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf-8');
  for (const l of c.split('\n')) {
    const t = l.trim(); if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('='); if (i === -1) continue;
    if (!process.env[t.slice(0, i).trim()]) process.env[t.slice(0, i).trim()] = t.slice(i+1).trim();
  }
}
loadEnv();
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Read STEIPU source file to see what c3 strings these "F1 terminals" actually had
const path = resolve(__dirname, '..', 'data', 'atlas', 'mfr_737_STEIPU_斯泰普_params.json');
const data = JSON.parse(readFileSync(path, 'utf-8'));
console.log(`STEIPU source file: ${data.models.length} products total`);

// Tally c3 strings
const c3Counts = new Map();
for (const m of data.models) {
  const c3 = m.category?.c3?.name ?? '(no c3)';
  c3Counts.set(c3, (c3Counts.get(c3) ?? 0) + 1);
}
console.log('\nc3 distribution:');
for (const [c3, count] of [...c3Counts.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${count.toString().padStart(4)}  ${c3}`);
}

// Look at first sample product per top c3
console.log('\nSample product per c3:');
const samples = new Map();
for (const m of data.models) {
  const c3 = m.category?.c3?.name ?? '(no c3)';
  if (!samples.has(c3)) {
    samples.set(c3, {
      mpn: m.componentName,
      c1: m.category?.c1?.name,
      c2: m.category?.c2?.name,
      paramNames: m.parameters.map(p => p.name).slice(0, 6),
    });
  }
}
for (const [c3, s] of samples) {
  console.log(`  c3="${c3}"`);
  console.log(`    c1=${s.c1} / c2=${s.c2}`);
  console.log(`    MPN=${s.mpn}`);
  console.log(`    paramNames: ${s.paramNames.join(', ')}`);
  console.log('');
}
