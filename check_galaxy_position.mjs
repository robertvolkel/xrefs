import { createClient } from '@supabase/supabase-js';

const url = 'https://xlgsymrexucuiauwecje.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhsZ3N5bXJleHVjdWlhdXdlY2plIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTAyNTI0MCwiZXhwIjoyMDg2NjAxMjQwfQ.tYvYrMwLpWAImVHB8Rlku4_XslY-8-Te0kTHOEjoD44';

const supabase = createClient(url, key);

const { data: mpnData } = await supabase
  .from('atlas_products')
  .select('id, mpn, manufacturer')
  .ilike('mpn', '%1.5KE10%')
  .limit(50);

console.log('=== All 50 rows from MPN query ===\n');
mpnData?.forEach((row, i) => {
  const mark = row.manufacturer === 'Galaxy' ? ' ← GALAXY' : '';
  console.log(`${String(i + 1).padStart(2, ' ')}. ${row.mpn} / ${row.manufacturer}${mark}`);
});

const galaxyIndex = mpnData?.findIndex(r => r.manufacturer === 'Galaxy');
console.log(`\nGalaxy row appears at index ${galaxyIndex} (position ${(galaxyIndex ?? -1) + 1})`);
console.log(`Trim limit is 20, so Galaxy row is ${galaxyIndex >= 20 ? 'EXCLUDED' : 'INCLUDED'}`);

