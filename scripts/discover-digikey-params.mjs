/**
 * Digikey Parameter Discovery Script
 *
 * Fetches parametric data for a given MPN from Digikey API and prints
 * all ParameterText/ValueText pairs. Used to build parameter maps in
 * lib/services/digikeyParamMap.ts.
 *
 * Usage:
 *   node scripts/discover-digikey-params.mjs <MPN> [MPN2] [MPN3] ...
 *
 * Reads DIGIKEY_CLIENT_ID and DIGIKEY_CLIENT_SECRET from .env.local.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env.local
function loadEnv() {
  try {
    const envPath = resolve(process.cwd(), '.env.local');
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // .env.local not found, rely on existing env vars
  }
}

loadEnv();

const CLIENT_ID = process.env.DIGIKEY_CLIENT_ID;
const CLIENT_SECRET = process.env.DIGIKEY_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Error: DIGIKEY_CLIENT_ID and DIGIKEY_CLIENT_SECRET must be set in .env.local or environment.');
  process.exit(1);
}

const mpns = process.argv.slice(2);
if (mpns.length === 0) {
  console.error('Usage: node scripts/discover-digikey-params.mjs <MPN> [MPN2] [MPN3] ...');
  process.exit(1);
}

/** Get the deepest category name from Digikey's nested category structure */
function getDeepestCategory(category) {
  if (!category) return '(none)';
  let current = category;
  while (current.ChildCategories && current.ChildCategories.length > 0) {
    current = current.ChildCategories[0];
  }
  return current.Name;
}

async function run() {
  // Step 1: Get OAuth token
  console.log('Getting OAuth token...');
  const tokenRes = await fetch('https://api.digikey.com/v1/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  });

  if (!tokenRes.ok) {
    console.error('Token error:', tokenRes.status, await tokenRes.text());
    return;
  }

  const tokenData = await tokenRes.json();
  const token = tokenData.access_token;
  console.log('Token obtained.\n');

  // Step 2: Fetch product details for each MPN
  for (const mpn of mpns) {
    console.log('='.repeat(70));
    console.log(`MPN: ${mpn}`);
    console.log('='.repeat(70));

    const detailRes = await fetch(
      `https://api.digikey.com/products/v4/search/${encodeURIComponent(mpn)}/productdetails`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-DIGIKEY-Client-Id': CLIENT_ID,
          'Accept': 'application/json',
        },
      }
    );

    if (!detailRes.ok) {
      console.error(`  Error fetching ${mpn}: ${detailRes.status} ${await detailRes.text()}`);
      console.log();
      continue;
    }

    const detailData = await detailRes.json();
    const product = detailData.Product;

    if (!product) {
      console.error(`  No product data returned for ${mpn}`);
      console.log();
      continue;
    }

    // Product info
    console.log(`  Manufacturer:  ${product.Manufacturer?.Name ?? 'Unknown'}`);
    console.log(`  Description:   ${product.Description?.ProductDescription ?? ''}`);
    console.log(`  Category:      ${getDeepestCategory(product.Category)}`);
    console.log(`  Status:        ${product.ProductStatus?.Status ?? 'Unknown'}`);
    console.log(`  DigiKey PN:    ${product.DigiKeyPartNumber ?? ''}`);

    // Classifications
    if (product.Classifications) {
      const c = product.Classifications;
      if (c.RohsStatus) console.log(`  RoHS:          ${c.RohsStatus}`);
      if (c.MoistureSensitivityLevel) console.log(`  MSL:           ${c.MoistureSensitivityLevel}`);
    }

    // Parameters table
    const params = product.Parameters ?? [];
    console.log(`\n  Parameters (${params.length}):`);
    console.log(`  ${'ID'.padEnd(8)} | ${'ParameterText'.padEnd(40)} | ValueText`);
    console.log(`  ${'-'.repeat(8)}-+-${'-'.repeat(40)}-+----------`);
    for (const p of params) {
      console.log(`  ${String(p.ParameterId).padEnd(8)} | ${(p.ParameterText ?? '').padEnd(40)} | ${p.ValueText ?? ''}`);
    }

    console.log();
  }
}

run().catch(e => console.error('Error:', e));
