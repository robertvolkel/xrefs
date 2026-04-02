#!/usr/bin/env npx tsx

/**
 * Atlas Description Extractor — Batch Script
 *
 * Reads Atlas products with descriptions from Supabase, uses Claude Haiku to
 * extract structured attribute values with quote grounding, and merges them
 * back as gap-fill into the product's parameters JSONB.
 *
 * Usage:
 *   npx tsx scripts/atlas-extract-descriptions.ts [options]
 *
 * Options:
 *   --dry-run           Show extractions without writing to DB
 *   --family <id>       Only process products matching this family (e.g., 71, B5)
 *   --limit <n>         Process at most N products (default: all)
 *   --concurrency <n>   Concurrent Haiku calls (default: 5)
 *   --verbose           Show per-product extraction details
 *
 * Reads ANTHROPIC_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY from .env.local.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import {
  buildExtractionPrompt,
  parseExtractionResponse,
  mergeExtractedAttributes,
  type ExtractedAttribute,
} from '../lib/services/descriptionExtractor';

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

// ─── Marker for description-extracted params ──────────────

const DESC_EXTRACT_MARKER = 'desc_extract';

// ─── Fetch products ───────────────────────────────────────

interface AtlasProduct {
  id: string;
  mpn: string;
  family_id: string | null;
  description: string;
  parameters: Record<string, { value?: string; numericValue?: number; unit?: string; _source?: string }>;
}

async function fetchProducts(): Promise<AtlasProduct[]> {
  let query = supabase
    .from('atlas_products')
    .select('id, mpn, family_id, description, parameters')
    .not('description', 'is', null)
    .not('description', 'eq', '')
    .not('family_id', 'is', null);

  if (familyFilter) {
    query = query.eq('family_id', familyFilter);
  }

  // Fetch in pages of 1000
  const allProducts: AtlasProduct[] = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    let pageQuery = query.range(offset, offset + pageSize - 1);
    if (limitArg && offset + pageSize > limitArg) {
      pageQuery = query.range(offset, offset + (limitArg - offset) - 1);
    }

    const { data, error } = await pageQuery;
    if (error) {
      console.error(`Supabase fetch error at offset ${offset}:`, error.message);
      break;
    }
    if (!data || data.length === 0) break;

    allProducts.push(...(data as AtlasProduct[]));
    offset += data.length;

    if (limitArg && allProducts.length >= limitArg) break;
    if (data.length < pageSize) break;
  }

  return limitArg ? allProducts.slice(0, limitArg) : allProducts;
}

// ─── Get existing attribute IDs from parameters JSONB ─────

function getExistingAttrIds(parameters: Record<string, unknown>): Set<string> {
  return new Set(Object.keys(parameters || {}));
}

// ─── Check if product was already processed ───────────────

function wasAlreadyProcessed(parameters: Record<string, unknown>): boolean {
  // Check if any parameter key starts with the marker prefix
  return Object.keys(parameters || {}).some(key => {
    const val = parameters[key] as Record<string, unknown> | undefined;
    return val && typeof val === 'object' && val._source === DESC_EXTRACT_MARKER;
  });
}

// ─── Call Haiku ───────────────────────────────────────────

async function callHaiku(prompt: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  // Extract text from response
  const textBlock = response.content.find(b => b.type === 'text');
  return textBlock ? textBlock.text : '';
}

// ─── Process a single product ─────────────────────────────

interface ProcessResult {
  mpn: string;
  familyId: string;
  accepted: number;
  rejected: number;
  skippedGapFill: number;
  error?: string;
}

async function processProduct(product: AtlasProduct): Promise<ProcessResult> {
  const { id, mpn, family_id, description, parameters } = product;
  const familyId = family_id!;

  const result: ProcessResult = {
    mpn,
    familyId,
    accepted: 0,
    rejected: 0,
    skippedGapFill: 0,
  };

  try {
    // Build prompt
    const prompt = buildExtractionPrompt(description, familyId);
    if (!prompt) {
      result.error = 'no schema for family';
      return result;
    }

    // Call Haiku
    const responseText = await callHaiku(prompt);

    // Parse with quote grounding
    const { accepted, rejected } = parseExtractionResponse(responseText, description, familyId);
    result.rejected = rejected.length;

    // Gap-fill merge
    const existingIds = getExistingAttrIds(parameters);
    const newAttrs = mergeExtractedAttributes(existingIds, accepted);
    result.skippedGapFill = accepted.length - newAttrs.length;
    result.accepted = newAttrs.length;

    if (verbose) {
      console.log(`  ${mpn} [${familyId}]: +${newAttrs.length} accepted, ${rejected.length} rejected, ${result.skippedGapFill} already existed`);
      for (const attr of newAttrs) {
        console.log(`    ✓ ${attr.attributeId} = "${attr.value}" (source: "${attr.source}")`);
      }
      for (const attr of rejected) {
        console.log(`    ✗ ${attr.attributeId} = "${attr.value}" — FAILED grounding (source: "${attr.source}")`);
      }
    }

    // Write to Supabase
    if (!dryRun && newAttrs.length > 0) {
      const updatedParams = { ...parameters };
      for (const attr of newAttrs) {
        updatedParams[attr.attributeId] = {
          value: attr.value,
          _source: DESC_EXTRACT_MARKER,
        };
      }

      const { error } = await supabase
        .from('atlas_products')
        .update({ parameters: updatedParams })
        .eq('id', id);

      if (error) {
        result.error = `DB write failed: ${error.message}`;
      }
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }

  return result;
}

// ─── Batch processor with concurrency control ─────────────

async function processBatch(products: AtlasProduct[]): Promise<ProcessResult[]> {
  const results: ProcessResult[] = [];
  let idx = 0;

  async function worker() {
    while (idx < products.length) {
      const product = products[idx++];
      const result = await processProduct(product);
      results.push(result);
    }
  }

  // Launch concurrent workers
  const workers = Array.from({ length: Math.min(concurrency, products.length) }, () => worker());
  await Promise.all(workers);

  return results;
}

// ─── Main ─────────────────────────────────────────────────

async function main() {
  console.log('Atlas Description Extractor');
  console.log('─'.repeat(50));
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  if (familyFilter) console.log(`Family filter: ${familyFilter}`);
  if (limitArg) console.log(`Limit: ${limitArg}`);
  console.log(`Concurrency: ${concurrency}`);
  console.log();

  // Fetch products
  console.log('Fetching products from Supabase...');
  const products = await fetchProducts();
  console.log(`Found ${products.length} products with descriptions`);

  // Filter out already-processed products
  const unprocessed = products.filter(p => !wasAlreadyProcessed(p.parameters));
  const skipped = products.length - unprocessed.length;
  if (skipped > 0) {
    console.log(`Skipping ${skipped} already-processed products`);
  }
  console.log(`Processing ${unprocessed.length} products...`);
  console.log();

  if (unprocessed.length === 0) {
    console.log('Nothing to process.');
    return;
  }

  // Process in batches
  const startTime = Date.now();
  const results = await processBatch(unprocessed);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // Aggregate stats
  const totalAccepted = results.reduce((sum, r) => sum + r.accepted, 0);
  const totalRejected = results.reduce((sum, r) => sum + r.rejected, 0);
  const totalGapSkipped = results.reduce((sum, r) => sum + r.skippedGapFill, 0);
  const errors = results.filter(r => r.error);

  // Per-family breakdown
  const familyStats = new Map<string, { products: number; accepted: number; rejected: number }>();
  for (const r of results) {
    const s = familyStats.get(r.familyId) || { products: 0, accepted: 0, rejected: 0 };
    s.products++;
    s.accepted += r.accepted;
    s.rejected += r.rejected;
    familyStats.set(r.familyId, s);
  }

  // Print summary
  console.log();
  console.log('═'.repeat(50));
  console.log('SUMMARY');
  console.log('═'.repeat(50));
  console.log(`Products processed: ${results.length}`);
  console.log(`Time: ${elapsed}s`);
  console.log(`Attributes accepted (gap-fill): ${totalAccepted}`);
  console.log(`Attributes rejected (grounding): ${totalRejected}`);
  console.log(`Attributes skipped (already existed): ${totalGapSkipped}`);
  if (errors.length > 0) {
    console.log(`Errors: ${errors.length}`);
    for (const e of errors.slice(0, 10)) {
      console.log(`  ${e.mpn}: ${e.error}`);
    }
    if (errors.length > 10) console.log(`  ... and ${errors.length - 10} more`);
  }

  console.log();
  console.log('Per-family breakdown:');
  console.log(`${'Family'.padEnd(8)} ${'Products'.padStart(9)} ${'Accepted'.padStart(9)} ${'Rejected'.padStart(9)}`);
  console.log('─'.repeat(40));
  for (const [fid, s] of [...familyStats.entries()].sort((a, b) => b[1].accepted - a[1].accepted)) {
    console.log(`${fid.padEnd(8)} ${String(s.products).padStart(9)} ${String(s.accepted).padStart(9)} ${String(s.rejected).padStart(9)}`);
  }

  if (dryRun) {
    console.log();
    console.log('(Dry run — no changes written to database)');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
