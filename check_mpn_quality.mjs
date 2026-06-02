import { createClient } from '@supabase/supabase-js';

const url = 'https://xlgsymrexucuiauwecje.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhsZ3N5bXJleHVjdWlhdXdlY2plIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTAyNTI0MCwiZXhwIjoyMDg2NjAxMjQwfQ.tYvYrMwLpWAImVHB8Rlku4_XslY-8-Te0kTHOEjoD44';

const supabase = createClient(url, key);

// Get Galaxy's 1.5KE10
const { data: galaxyParts } = await supabase
  .from('atlas_products')
  .select('id, mpn, manufacturer')
  .eq('mpn', '1.5KE10')
  .eq('manufacturer', 'Galaxy');

console.log('=== Galaxy 1.5KE10 entries ===');
galaxyParts?.forEach(p => {
  console.log(`MPN: "${p.mpn}" (exact match)`);
  
  // Simple placeholder detection (matching the validator logic)
  const hasDot = /\./.test(p.mpn);
  const hasSlash = /\//.test(p.mpn);
  const hasSeries = /\bseries\b/i.test(p.mpn);
  const hasThru = /\b(thru|thur|through|to)\b/i.test(p.mpn);
  const trailingX = /[a-z0-9]x$/i.test(p.mpn);
  const midwordXX = /[a-z0-9-]xx[A-Za-z][A-Za-z0-9-]*$/i.test(p.mpn);
  
  const issues = [];
  if (hasDot) issues.push('has dot (.)');
  if (hasSlash) issues.push('has slash (/)');
  if (hasSeries) issues.push('has "Series"');
  if (hasThru) issues.push('has range keyword');
  if (trailingX) issues.push('trailing x');
  if (midwordXX) issues.push('mid-word xx');
  
  console.log(`  Quality issues: ${issues.length > 0 ? issues.join(', ') : 'NONE'}`);
});

