#!/usr/bin/env node
// Pull all "Unverified tokens" lists from the post-phase1 audit and filter to ones that look MFR-shaped.
import { readFileSync } from 'fs';
const md = readFileSync('/Users/robvolkel/Developer/xrefs_app/docs/audits/domain-card-audit-2026-05-18-post-phase1.md','utf-8');
const sections = md.split(/^## Family /m).slice(1);
for (const sec of sections) {
  const fam = sec.split(' ')[0];
  const m = sec.match(/\*\*Unverified tokens \(\d+\):\*\*\s*\n([^\n]+)/);
  if (!m) continue;
  const tokens = m[1].split(',').map(s => s.replace(/`/g,'').trim()).filter(Boolean);
  // MFR-shaped: ALLCAPS 3-12 chars OR contains digit and uppercase letters and is short, OR ends in xx/xxxx
  const suspect = tokens.filter(t => {
    if (/^[A-Z]{4,12}$/.test(t)) return true;
    if (/^[A-Z]+\d+[A-Za-z0-9]*$/.test(t)) return true;
    if (/^\d+[A-Z]+/.test(t)) return true;
    if (/[A-Z].*x{2,}/.test(t)) return true;
    return false;
  });
  if (suspect.length === 0) continue;
  console.log(`\n[${fam}] suspect MFR-shaped unverified (${suspect.length}):`);
  for (const t of suspect) console.log(`  ${t}`);
}
