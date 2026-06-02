import { createClient } from '@supabase/supabase-js';

const url = 'https://xlgsymrexucuiauwecje.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhsZ3N5bXJleHVjdWlhdXdlY2plIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTAyNTI0MCwiZXhwIjoyMDg2NjAxMjQwfQ.tYvYrMwLpWAImVHB8Rlku4_XslY-8-Te0kTHOEjoD44';

const supabase = createClient(url, key);

// Check disabled manufacturers
console.log('=== Step 1: Check atlas_manufacturer_settings (disabled MFRs) ===');
const { data: legacySettings } = await supabase
  .from('atlas_manufacturer_settings')
  .select('manufacturer, enabled');

const disabledLegacy = new Set(
  (legacySettings ?? [])
    .filter(r => !r.enabled)
    .map(r => r.manufacturer)
);

console.log(`Found ${disabledLegacy.size} disabled manufacturers in legacy table`);
if (disabledLegacy.has('Galaxy')) {
  console.log('  *** GALAXY IS DISABLED IN LEGACY TABLE ***');
} else {
  console.log('  Galaxy is NOT disabled in legacy table');
}

// Also check new table
console.log('\n=== Step 2: Check atlas_manufacturers (new table) ===');
const { data: newMfrs } = await supabase
  .from('atlas_manufacturers')
  .select('name_display, enabled');

const disabledNew = new Set(
  (newMfrs ?? [])
    .filter(r => !r.enabled)
    .map(r => r.name_display)
);

console.log(`Found ${disabledNew.size} disabled manufacturers in new table`);
if (disabledNew.has('Galaxy 银河微')) {
  console.log('  *** GALAXY IS DISABLED IN NEW TABLE ***');
} else {
  console.log('  Galaxy is NOT disabled in new table');
}

// Now simulate the full searchAtlasProducts logic from atlasClient.ts
console.log('\n=== Step 3: Simulate searchAtlasProducts("1.5KE10") ===');

// Get all disabled manufacturers
const allDisabled = new Set([...disabledLegacy, ...disabledNew, 'Galaxy 银河微']);

// Query MPN
const { data: mpnData } = await supabase
  .from('atlas_products')
  .select('id, mpn, manufacturer, description, clean_description, category, subcategory, family_id, status, datasheet_url, package, parameters, manufacturer_country')
  .ilike('mpn', '%1.5KE10%')
  .limit(50);

// Query manufacturer (with no alias match since resolveManufacturerAlias('1.5KE10') returns null)
const { data: mfrData } = await supabase
  .from('atlas_products')
  .select('id, mpn, manufacturer, description, clean_description, category, subcategory, family_id, status, datasheet_url, package, parameters, manufacturer_country')
  .ilike('manufacturer', '%1.5KE10%')
  .limit(50);

console.log(`MPN query returned ${mpnData?.length || 0} rows`);
console.log(`MFR query returned ${mfrData?.length || 0} rows`);

// Merge and deduplicate
const byId = new Map();
for (const row of (mpnData ?? [])) byId.set(row.id, row);
for (const row of (mfrData ?? [])) byId.set(row.id, row);
const merged = [...byId.values()];

console.log(`After merge: ${merged.length} unique rows`);

// Filter out disabled manufacturers
const filtered = merged.filter(row => {
  const isDisabled = allDisabled.has(row.manufacturer);
  if (isDisabled) {
    console.log(`  FILTERED OUT: ${row.mpn} / ${row.manufacturer} (disabled)`);
  }
  return !isDisabled;
});

console.log(`After filtering disabled: ${filtered.length} rows`);

// Trim to 20
const trimmed = filtered.slice(0, 20);

console.log(`\nFinal results (first 20):`);
trimmed.forEach(row => {
  console.log(`  ${row.mpn} / ${row.manufacturer}`);
});

if (merged.some(r => r.manufacturer === 'Galaxy')) {
  console.log('\n⚠️  ISSUE FOUND: Galaxy row WAS in merged data but appears in final output?');
} else {
  console.log('\n✓ Galaxy row was correctly found in MPN query');
}

