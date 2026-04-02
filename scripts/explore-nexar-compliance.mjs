/**
 * Nexar API Compliance Exploration Script
 *
 * Discovers what compliance data (REACH, RoHS, material declarations)
 * is available through the Nexar/Octopart GraphQL API.
 *
 * Usage:
 *   node scripts/explore-nexar-compliance.mjs [MPN]
 *
 * Default MPN: GRM155R71C104KA88 (Murata 0402 100nF MLCC)
 * Reads NEXAR_CLIENT_ID and NEXAR_CLIENT_SECRET from .env.local.
 *
 * Budget: Uses ~3 GraphQL calls (2 parts consumed from your quota).
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── Config ──────────────────────────────────────────────────────────
const MAX_CALLS = 5;
const DEFAULT_MPN = 'GRM155R71C104KA88';
const TOKEN_URL = 'https://identity.nexar.com/connect/token';
const GRAPHQL_URL = 'https://api.nexar.com/graphql/';
const COMPLIANCE_KEYWORDS = ['compliance', 'rohs', 'reach', 'document', 'material', 'svhc', 'hazard', 'environ', 'certif'];

let callCount = 0;

// ── Env loading (same pattern as discover-digikey-params.mjs) ───────
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

const CLIENT_ID = process.env.NEXAR_CLIENT_ID;
const CLIENT_SECRET = process.env.NEXAR_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Error: NEXAR_CLIENT_ID and NEXAR_CLIENT_SECRET must be set in .env.local or environment.');
  process.exit(1);
}

const mpn = process.argv[2] || DEFAULT_MPN;

// ── Helpers ─────────────────────────────────────────────────────────
function separator(char = '=', len = 70) {
  console.log(char.repeat(len));
}

function heading(text) {
  console.log();
  separator();
  console.log(text);
  separator();
}

function isComplianceRelated(text) {
  const lower = (text || '').toLowerCase();
  return COMPLIANCE_KEYWORDS.some(kw => lower.includes(kw));
}

// ── GraphQL helper ──────────────────────────────────────────────────
async function nexarGraphQL(token, query, variables = {}) {
  if (callCount >= MAX_CALLS) {
    console.error(`\n  BUDGET GUARD: Refusing call — already made ${callCount}/${MAX_CALLS} calls.`);
    return null;
  }

  callCount++;
  console.log(`  [call ${callCount}/${MAX_CALLS}]`);

  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`  HTTP ${res.status}: ${text}`);
    return null;
  }

  const json = await res.json();

  if (json.errors) {
    console.error('  GraphQL errors:');
    for (const err of json.errors) {
      console.error(`    - ${err.message}`);
    }
  }

  return json.data;
}

// ── Step 1: Authenticate ────────────────────────────────────────────
async function getToken() {
  heading('STEP 1: OAuth2 Authentication');
  console.log('  Requesting token from identity.nexar.com...');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`  Token error ${res.status}: ${text}`);
    process.exit(1);
  }

  const data = await res.json();
  console.log('  Token obtained. (does not count against part budget)');
  return data.access_token;
}

// ── Step 2: Schema Introspection ────────────────────────────────────
async function introspectSchema(token) {
  heading('STEP 2: Schema Introspection');
  console.log('  Discovering compliance-related types and fields...');

  const query = `
    query IntrospectSchema {
      partType: __type(name: "SupPart") {
        name
        fields {
          name
          description
          type {
            name
            kind
            ofType { name kind ofType { name kind } }
          }
        }
      }
      docCollectionType: __type(name: "SupDocumentCollection") {
        name
        fields {
          name
          description
          type {
            name
            kind
            ofType { name kind }
          }
        }
      }
      documentType: __type(name: "SupDocument") {
        name
        fields {
          name
          description
          type {
            name
            kind
            ofType { name kind }
          }
        }
      }
      specType: __type(name: "SupPartSpec") {
        name
        fields {
          name
          description
          type {
            name
            kind
            ofType { name kind }
          }
        }
      }
      attributeType: __type(name: "SupAttribute") {
        name
        fields {
          name
          description
          type {
            name
            kind
            ofType { name kind }
          }
        }
      }
    }
  `;

  const data = await nexarGraphQL(token, query);
  if (!data) return;

  for (const [alias, typeInfo] of Object.entries(data)) {
    if (!typeInfo) {
      console.log(`\n  ${alias}: (type not found)`);
      continue;
    }

    console.log(`\n  ${typeInfo.name} fields:`);
    console.log(`  ${'Field'.padEnd(30)} | ${'Type'.padEnd(25)} | Description`);
    console.log(`  ${'-'.repeat(30)}-+-${'-'.repeat(25)}-+-${'-'.repeat(40)}`);

    for (const field of typeInfo.fields || []) {
      const typeName = resolveTypeName(field.type);
      const marker = isComplianceRelated(field.name) || isComplianceRelated(field.description)
        ? ' >>> COMPLIANCE'
        : '';
      console.log(
        `  ${field.name.padEnd(30)} | ${typeName.padEnd(25)} | ${(field.description || '').slice(0, 40)}${marker}`
      );
    }
  }
}

function resolveTypeName(type) {
  if (!type) return '?';
  if (type.name) return type.name;
  if (type.kind === 'LIST') return `[${resolveTypeName(type.ofType)}]`;
  if (type.kind === 'NON_NULL') return `${resolveTypeName(type.ofType)}!`;
  if (type.ofType) return resolveTypeName(type.ofType);
  return type.kind || '?';
}

// ── Step 3: Comprehensive Part Query ────────────────────────────────
async function queryPart(token, partMpn) {
  heading(`STEP 3: Part Query — ${partMpn}`);
  console.log('  Fetching all compliance-relevant fields...');

  const query = `
    query ExploreCompliance($mpn: String!) {
      supSearchMpn(q: $mpn, limit: 1) {
        hits
        results {
          description
          part {
            id
            mpn
            name
            shortDescription
            manufacturer {
              name
              homepageUrl
            }
            category {
              id
              name
              path
            }
            descriptions {
              text
              creditString
              creditUrl
            }
            specs {
              attribute {
                name
                id
                shortname
              }
              displayValue
            }
            documentCollections {
              name
              documents {
                name
                pageCount
                createdAt
                url
                creditString
                creditUrl
                mimeType
              }
            }
            bestDatasheet {
              name
              url
              mimeType
              pageCount
            }
            bestImage {
              url
            }
            medianPrice1000 {
              quantity
              price
              currency
              convertedPrice
              convertedCurrency
            }
            totalAvail
          }
        }
      }
    }
  `;

  const data = await nexarGraphQL(token, query, { mpn: partMpn });
  if (!data) return null;

  const search = data.supSearchMpn;
  console.log(`  Hits: ${search.hits}`);

  if (!search.results || search.results.length === 0) {
    console.log('  No results found.');
    return null;
  }

  const result = search.results[0];
  const part = result.part;

  // ── Identity ──
  console.log('\n  --- Part Identity ---');
  console.log(`  MPN:          ${part.mpn}`);
  console.log(`  Name:         ${part.name}`);
  console.log(`  Manufacturer: ${part.manufacturer?.name}`);
  console.log(`  Category:     ${part.category?.name}`);
  console.log(`  Path:         ${part.category?.path}`);
  console.log(`  Description:  ${part.shortDescription || result.description}`);

  // ── Specs ──
  const specs = part.specs || [];
  console.log(`\n  --- Specs (${specs.length}) ---`);
  console.log(`  ${'Attribute'.padEnd(35)} | ${'Shortname'.padEnd(20)} | Value`);
  console.log(`  ${'-'.repeat(35)}-+-${'-'.repeat(20)}-+-${'-'.repeat(30)}`);
  for (const s of specs) {
    const marker = isComplianceRelated(s.attribute.name) ? ' >>> ' : '';
    console.log(
      `  ${(s.attribute.name || '').padEnd(35)} | ${(s.attribute.shortname || '').padEnd(20)} | ${s.displayValue || ''}${marker}`
    );
  }

  // ── Document Collections ──
  const docCollections = part.documentCollections || [];
  console.log(`\n  --- Document Collections (${docCollections.length}) ---`);
  let complianceDocs = 0;
  for (const coll of docCollections) {
    const marker = isComplianceRelated(coll.name) ? ' >>> COMPLIANCE COLLECTION' : '';
    console.log(`\n  Collection: "${coll.name}"${marker}`);
    for (const doc of coll.documents || []) {
      const docMarker = isComplianceRelated(doc.name) ? ' >>> ' : '';
      console.log(`    - ${doc.name} (${doc.mimeType}, ${doc.pageCount ?? '?'} pages)${docMarker}`);
      console.log(`      URL: ${doc.url}`);
      console.log(`      Credit: ${doc.creditString || '(none)'}`);
      if (isComplianceRelated(coll.name) || isComplianceRelated(doc.name)) complianceDocs++;
    }
  }

  // ── Descriptions ──
  const descriptions = part.descriptions || [];
  if (descriptions.length > 0) {
    console.log(`\n  --- Descriptions (${descriptions.length}) ---`);
    for (const d of descriptions) {
      console.log(`  - ${(d.text || '').slice(0, 100)}`);
      console.log(`    Source: ${d.creditString || '(none)'}`);
    }
  }

  // ── Datasheet ──
  if (part.bestDatasheet) {
    console.log('\n  --- Best Datasheet ---');
    console.log(`  ${part.bestDatasheet.name} (${part.bestDatasheet.mimeType})`);
    console.log(`  URL: ${part.bestDatasheet.url}`);
  }

  // ── Pricing ──
  if (part.medianPrice1000) {
    const p = part.medianPrice1000;
    console.log('\n  --- Pricing (1000 qty median) ---');
    console.log(`  ${p.price} ${p.currency} (converted: ${p.convertedPrice} ${p.convertedCurrency})`);
  }
  console.log(`  Total availability: ${part.totalAvail ?? 'unknown'}`);

  return { complianceDocs, specCount: specs.length, docCount: docCollections.length };
}

// ── Step 4: RoHS Filter Test ────────────────────────────────────────
async function testRohsFilter(token, partMpn) {
  heading('STEP 4: RoHS Filter Test');
  console.log('  Testing supSearchMpn with rohs filter...');

  const query = `
    query RohsFiltered($mpn: String!) {
      supSearchMpn(q: $mpn, limit: 1, filters: { rohs: "Compliant" }) {
        hits
        results {
          part {
            mpn
            specs {
              attribute { name shortname }
              displayValue
            }
          }
        }
      }
    }
  `;

  const data = await nexarGraphQL(token, query, { mpn: partMpn });
  if (!data) {
    console.log('  Filter query failed — may not be supported on this plan.');
    return;
  }

  const search = data.supSearchMpn;
  console.log(`  Hits with RoHS filter: ${search.hits}`);

  if (search.results && search.results.length > 0) {
    const part = search.results[0].part;
    const rohsSpec = (part.specs || []).find(s =>
      (s.attribute.name || '').toLowerCase().includes('rohs')
    );
    if (rohsSpec) {
      console.log(`  RoHS spec value: ${rohsSpec.displayValue}`);
    } else {
      console.log('  No explicit RoHS spec field found in results.');
    }
  }
}

// ── Step 5: Summary ─────────────────────────────────────────────────
function printSummary(stats) {
  heading('SUMMARY');

  console.log(`  GraphQL calls made: ${callCount}/${MAX_CALLS}`);
  console.log(`  Estimated parts consumed: ${callCount - 1} (introspection likely free)`);
  console.log(`  Remaining budget: ~${100 - (callCount - 1)} of 100`);

  if (stats) {
    console.log();
    console.log(`  Specs returned: ${stats.specCount}`);
    console.log(`  Document collections: ${stats.docCount}`);
    console.log(`  Compliance-related docs: ${stats.complianceDocs}`);
  }

  console.log();
  console.log('  Existing ComplianceData fields in codebase:');
  console.log('    rohsStatus     — check specs for "ROHS Status" or similar');
  console.log('    eccnCode       — check specs for "ECCN" or document collections');
  console.log('    htsCodesByRegion — check document collections for HTS/tariff docs');
  console.log('    (no REACH yet) — check document collections for REACH/SVHC docs');
  console.log();
  console.log('  Review the output above to determine which fields Nexar actually populates.');
}

// ── Main ────────────────────────────────────────────────────────────
async function run() {
  console.log(`Nexar Compliance Explorer — querying: ${mpn}`);
  console.log(`Budget: ${MAX_CALLS} max GraphQL calls\n`);

  const token = await getToken();
  await introspectSchema(token);
  const stats = await queryPart(token, mpn);
  await testRohsFilter(token, mpn);
  printSummary(stats);
}

run().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
