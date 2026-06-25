/* Minimal Sonnet behavioral spot-check. Calls chat() in-process (no HTTP/middleware).
   Run: npx tsx scripts/sonnet-spotcheck.ts [A3,B1,...]   (default: all)  */
import { readFileSync } from 'fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}

type Msg = { role: 'user' | 'assistant'; content: string };

const ROWS: Record<string, { expect: string; messages: Msg[] }> = {
  A3: { expect: 'search_parts', messages: [{ role: 'user', content: 'I need a low-noise NPN for an audio preamp, 9V, 1–2mA, hFE 200–400.' }] },
  B1: { expect: 'search_parts', messages: [{ role: 'user', content: "What's the package and voltage rating of GRM188R71H104KA93D?" }] },
  E3: { expect: 'search_parts (NOT choices)', messages: [{ role: 'user', content: 'I need a MOSFET for a 24V motor driver.' }] },
  A5: { expect: 'profile tool', messages: [{ role: 'user', content: 'Tell me about GigaDevice — are they public, and can I rely on them for automotive?' }] },
  B5: { expect: 'profile tool', messages: [{ role: 'user', content: 'where is 3PEAK based and what do they make?' }] },
  C3: { expect: 'NO search (theory)', messages: [{ role: 'user', content: "what's the difference between X7R and C0G?" }] },
  B6: { expect: 'search_parts (LM358)', messages: [
    { role: 'user', content: 'Search 2N2222AUB' },
    { role: 'assistant', content: 'I found 2N2222AUB from Microchip. Confirm?' },
    { role: 'user', content: 'actually look at LM358 instead' },
  ] },
  // B4 — replacement request reaches the LLM with a part already loaded.
  // PASS = no fabricated cross-reference progress ("engine is running",
  // "cross-references will populate shortly", "I'll give an assessment once
  // they load") and no invented equivalent MPNs. Mirrors the screenshot bug.
  B4: { expect: 'NO fabricated xref progress / NO invented equivalents', messages: [
    { role: 'user', content: 'Search BC847BLP-7' },
    { role: 'assistant', content: 'I found BC847BLP-7 from Diodes Incorporated. Confirm to load it?' },
    { role: 'user', content: 'yes' },
    { role: 'assistant', content: 'Got it — loaded the basics for BC847BLP-7. What would you like to explore?' },
    { role: 'user', content: 'Can you show me alternates for this part?' },
  ] },
};

async function main() {
  const { chat } = await import('../lib/services/llmOrchestrator');
  const KEY = process.env.ANTHROPIC_API_KEY!;
  const pick = (process.argv[2] || '').split(',').map(s => s.trim()).filter(Boolean);
  const ids = pick.length ? pick : Object.keys(ROWS);

  for (const id of ids) {
    const row = ROWS[id]; if (!row) continue;
    try {
      const r = await chat(row.messages, KEY, undefined, undefined, 'en');
      console.log(`\n──────── ${id}  (expect: ${row.expect}) ────────`);
      console.log(`  search_parts : ${r.searchResult?.type ?? '—'}`);
      console.log(`  profile      : ${(r.mentionedAtlasManufacturers ?? []).join(', ') || '—'}`);
      console.log(`  choices      : ${(r.choices ?? []).length}`);
      console.log(`  PROSE        : ${(r.message ?? '').replace(/\n+/g, ' ⏎ ').slice(0, 650)}`);
    } catch (e) {
      console.log(`\n──────── ${id} ──────── ERROR: ${(e as Error).message}`);
    }
  }
  console.log('\n=== DONE ===');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
