import { createClient } from '@supabase/supabase-js';

const url = 'https://xlgsymrexucuiauwecje.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhsZ3N5bXJleHVjdWlhdXdlY2plIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTAyNTI0MCwiZXhwIjoyMDg2NjAxMjQwfQ.tYvYrMwLpWAImVHB8Rlku4_XslY-8-Te0kTHOEjoD44';

const supabase = createClient(url, key);

async function run() {
  console.log('=== Query 1: atlas_products mpn=1.5KE10 (exact match) ===');
  const { data: exactAllData, error: exactAllErr } = await supabase
    .from('atlas_products')
    .select('id, mpn, manufacturer, description, family_id, status')
    .eq('mpn', '1.5KE10');
  
  if (exactAllErr) console.error('Error:', exactAllErr);
  else {
    console.log(`Found ${exactAllData?.length || 0} rows:`);
    exactAllData?.forEach(row => {
      console.log(`  MPN: ${row.mpn}, MFR: ${row.manufacturer}, Family: ${row.family_id}, Status: ${row.status}`);
    });
  }

  console.log('\n=== Query 2: atlas_products for MPN like 1.5KE10 ===');
  const { data: likeMpnData, error: likeMpnErr } = await supabase
    .from('atlas_products')
    .select('id, mpn, manufacturer, description, family_id, status')
    .ilike('mpn', '%1.5KE10%');
  
  if (likeMpnErr) console.error('Error:', likeMpnErr);
  else {
    console.log(`Found ${likeMpnData?.length || 0} rows:`);
    likeMpnData?.forEach(row => {
      console.log(`  MPN: ${row.mpn}, MFR: ${row.manufacturer}, Family: ${row.family_id}, Status: ${row.status}`);
    });
  }

  console.log('\n=== Query 3: atlas_manufacturers entries with "Galaxy" ===');
  const { data: mfrRecs, error: mfrRecsErr } = await supabase
    .from('atlas_manufacturers')
    .select('slug, name_display, name_en, name_zh, aliases, enabled')
    .or(`name_display.ilike.%Galaxy%,name_en.ilike.%Galaxy%`);
  
  if (mfrRecsErr) console.error('Error:', mfrRecsErr);
  else {
    console.log(`Found ${mfrRecs?.length || 0} records:`);
    mfrRecs?.forEach(row => {
      console.log(`  Slug: ${row.slug}`);
      console.log(`    Display: "${row.name_display}"`);
      console.log(`    English: "${row.name_en}"`);
      console.log(`    Chinese: "${row.name_zh}"`);
      console.log(`    Aliases: ${JSON.stringify(row.aliases)}`);
      console.log(`    Enabled: ${row.enabled}`);
    });
  }

  console.log('\n=== Query 4: atlas_products with manufacturer like Galaxy ===');
  const { data: galaxyMfrData, error: galaxyMfrErr } = await supabase
    .from('atlas_products')
    .select('id, mpn, manufacturer, family_id, status')
    .ilike('manufacturer', '%Galaxy%')
    .limit(20);
  
  if (galaxyMfrErr) console.error('Error:', galaxyMfrErr);
  else {
    console.log(`Found ${galaxyMfrData?.length || 0} rows with Galaxy manufacturer:`);
    const unique = new Set();
    galaxyMfrData?.forEach(row => {
      if (!unique.has(row.manufacturer)) {
        unique.add(row.manufacturer);
        console.log(`  - "${row.manufacturer}"`);
      }
    });
  }

  console.log('\n=== Query 5: Simulating searchAtlasProducts("1.5KE10") ===');
  console.log('Query A: ilike(mpn, "%1.5KE10%")');
  const { data: qA, error: errA } = await supabase
    .from('atlas_products')
    .select('id, mpn, manufacturer')
    .ilike('mpn', '%1.5KE10%')
    .limit(50);
  console.log(`  Result: ${qA?.length || 0} rows`);
  qA?.forEach(r => console.log(`    - ${r.mpn} / ${r.manufacturer}`));

  console.log('Query B: ilike(manufacturer, "%1.5KE10%")');
  const { data: qB, error: errB } = await supabase
    .from('atlas_products')
    .select('id, mpn, manufacturer')
    .ilike('manufacturer', '%1.5KE10%')
    .limit(50);
  console.log(`  Result: ${qB?.length || 0} rows (expected 0 since 1.5KE10 is not a manufacturer)`);
}

run().catch(console.error);
