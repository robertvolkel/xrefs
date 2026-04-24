#!/usr/bin/env npx tsx

/**
 * Atlas Description Cleanup — Batch Script
 *
 * Uses Claude Haiku to rewrite raw Atlas product descriptions into clean,
 * standardized one-liners (max 200 chars) and stores them in the
 * clean_description column.
 *
 * Usage:
 *   npx tsx scripts/atlas-clean-descriptions.ts [options]
 *
 * Options:
 *   --dry-run           Show cleaned descriptions without writing to DB
 *   --family <id>       Only process products matching this family (e.g., 71, B5)
 *   --limit <n>         Process at most N products (default: all)
 *   --concurrency <n>   Concurrent Haiku calls (default: 5)
 *   --verbose           Show per-product details
 *
 * Requires: ANTHROPIC_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env.local.
 * Prerequisite: ALTER TABLE atlas_products ADD COLUMN IF NOT EXISTS clean_description TEXT;
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

// ─── Load environment ─────────────────────────────────────

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
    // .env.local not found
  }
}

loadEnv();

// ─── Parse CLI args ───────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose');
const familyFilter = args.includes('--family') ? args[args.indexOf('--family') + 1] : null;
const limitArg = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1], 10) : null;
const concurrency = args.includes('--concurrency') ? parseInt(args[args.indexOf('--concurrency') + 1], 10) : 5;

// ─── Init clients ─────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}
if (!ANTHROPIC_API_KEY) {
  console.error('Missing ANTHROPIC_API_KEY in .env.local');
  process.exit(1);
}

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// ─── Cleanup prompt ──────────────────────────────────────

const SYSTEM_PROMPT = `You rewrite messy electronic component descriptions into clean, standardized one-liners.

FORMAT (max 200 characters):
[Component type]: [key specs]; [features if notable]; [applications if available]; [qualifications/temp range]

PRIORITY ORDER:
1. Electrical specs (inductance, current, resistance, voltage, etc.) — always include
2. Key differentiating features (shielded, low-noise, high-frequency capable) — only if selling points
3. Applications — include if available (automotive, industrial, consumer, etc.)
4. Qualifications & operating range — include certifications (AEC-Q200, RoHS) and temp range

CLEANUP RULES:
- Remove stray quotes, extra spaces, formatting artifacts
- Fix OCR errors (lsat → Isat, 丨 → bullet point)
- Standardize units (µH, mΩ, A, °C)
- Capitalize consistently
- Remove marketing fluff ("Ultra low," "High performance" → describe the actual benefit)
- If the description is in Chinese, translate the key specs to English

Return ONLY the cleaned description, nothing else. No quotes around it.`;

// ─── Fetch products ───────────────────────────────────────

interface ProductRow {
  id: string;
  mpn: string;
  family_id: string | null;
  description: string;
  clean_description: string | null;
}

async function fetchProducts(): Promise<ProductRow[]> {
  const allProducts: ProductRow[] = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    let query = supabase
      .from('atlas_products')
      .select('id, mpn, family_id, description, clean_description')
      .not('description', 'is', null)
      .not('description', 'eq', '');

    if (familyFilter) {
      query = query.eq('family_id', familyFilter);
    }

    const end = limitArg ? Math.min(offset + pageSize - 1, offset + (limitArg - allProducts.length) - 1) : offset + pageSize - 1;
    query = query.range(offset, end);

    const { data, error } = await query;
    if (error) {
      console.error(`Supabase fetch error at offset ${offset}:`, error.message);
      break;
    }
    if (!data || data.length === 0) break;

    allProducts.push(...(data as ProductRow[]));
    offset += data.length;

    if (limitArg && allProducts.length >= limitArg) break;
    if (data.length < pageSize) break;
  }

  return limitArg ? allProducts.slice(0, limitArg) : allProducts;
}

// ─── Call Haiku ───────────────────────────────────────────

async function cleanDescription(rawDescription: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: rawDescription }],
  });

  const textBlock = response.content.find(b => b.type === 'text');
  return textBlock ? textBlock.text.trim() : '';
}

// ─── Process a single product ─────────────────────────────

interface ProcessResult {
  mpn: string;
  cleaned: boolean;
  error?: string;
}

async function processProduct(product: ProductRow): Promise<ProcessResult> {
  try {
    const cleaned = await cleanDescription(product.description);

    if (!cleaned) {
      return { mpn: product.mpn, cleaned: false, error: 'empty response' };
    }

    if (verbose) {
      console.log(`  ${product.mpn}:`);
      console.log(`    Raw:   ${product.description.slice(0, 100)}...`);
      console.log(`    Clean: ${cleaned}`);
    }

    if (!dryRun) {
      const { error } = await supabase
        .from('atlas_products')
        .update({ clean_description: cleaned })
        .eq('id', product.id);

      if (error) {
        return { mpn: product.mpn, cleaned: false, error: `DB write: ${error.message}` };
      }
    }

    return { mpn: product.mpn, cleaned: true };
  } catch (err) {
    return { mpn: product.mpn, cleaned: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Batch processor with concurrency control ─────────────

async function processBatch(products: ProductRow[]): Promise<ProcessResult[]> {
  const results: ProcessResult[] = [];
  let idx = 0;

  async function worker() {
    while (idx < products.length) {
      const product = products[idx++];
      const result = await processProduct(product);
      results.push(result);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, products.length) }, () => worker());
  await Promise.all(workers);

  return results;
}

// ─── Main ─────────────────────────────────────────────────

async function main() {
  console.log('Atlas Description Cleanup');
  console.log('─'.repeat(50));
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  if (familyFilter) console.log(`Family filter: ${familyFilter}`);
  if (limitArg) console.log(`Limit: ${limitArg}`);
  console.log(`Concurrency: ${concurrency}`);
  console.log();

  console.log('Fetching products from Supabase...');
  const products = await fetchProducts();
  console.log(`Found ${products.length} products with descriptions`);

  // Skip already-cleaned products
  const unprocessed = products.filter(p => !p.clean_description);
  const skipped = products.length - unprocessed.length;
  if (skipped > 0) {
    console.log(`Skipping ${skipped} already-cleaned products`);
  }
  console.log(`Processing ${unprocessed.length} products...`);
  console.log();

  if (unprocessed.length === 0) {
    console.log('Nothing to process.');
    return;
  }

  const startTime = Date.now();
  const results = await processBatch(unprocessed);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  const cleaned = results.filter(r => r.cleaned).length;
  const errors = results.filter(r => r.error);

  console.log();
  console.log('═'.repeat(50));
  console.log('SUMMARY');
  console.log('═'.repeat(50));
  console.log(`Products processed: ${results.length}`);
  console.log(`Time: ${elapsed}s`);
  console.log(`Cleaned: ${cleaned}`);
  if (errors.length > 0) {
    console.log(`Errors: ${errors.length}`);
    for (const e of errors.slice(0, 10)) {
      console.log(`  ${e.mpn}: ${e.error}`);
    }
    if (errors.length > 10) console.log(`  ... and ${errors.length - 10} more`);
  }

  if (dryRun) {
    console.log();
    console.log('(Dry run — no changes written to database)');
  } else {
    // Invalidate Atlas Coverage cache so admin pages recompute on next visit
    await supabase.from('admin_stats_cache').delete().eq('key', 'atlas-coverage');
    console.log('\nAtlas Coverage cache invalidated.');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
