/**
 * Atlas Profile Sync Service
 *
 * Server-side logic for syncing manufacturer profiles from the Atlas
 * external API into atlas_manufacturers. Used by both the CLI script
 * and the admin API routes.
 */

import { fetchAtlasApiPartners, fetchAtlasApiPartnerDetail } from './atlasApiClient';
import type { AtlasApiPartnerDetail } from './atlasApiClient';
import { createServiceClient } from '@/lib/supabase/service';

// ============================================================
// HELPERS
// ============================================================

function clean(s: string | null | undefined): string | null {
  if (!s || s === '-' || s.trim() === '') return null;
  return s.trim();
}

function parseYear(y: string | null | undefined): number | null {
  if (!y || y === '-') return null;
  const n = parseInt(y, 10);
  return n > 1900 && n < 2100 ? n : null;
}

function parseCerts(certsText: string | null): { name: string; category: string }[] {
  if (!certsText) return [];
  const parts = certsText
    .split(/[;,]|(?:\band\b)/gi)
    .map((s) => s.trim())
    .filter((s) => s.length > 2 && s.length < 120);

  return parts.map((name) => {
    let category = 'other';
    const lower = name.toLowerCase();
    if (/iso\s*9001|iatf\s*16949/i.test(lower)) category = 'quality';
    else if (/iso\s*14001|rohs|reach|halogen|weee/i.test(lower)) category = 'environmental';
    else if (/ul|tuv|ce|fcc|ccc|kc|pse/i.test(lower)) category = 'safety';
    else if (/aec|automotive/i.test(lower)) category = 'automotive';
    else if (/iso\s*27001/i.test(lower)) category = 'security';
    else if (/iso\s*45001|ohsas/i.test(lower)) category = 'safety';
    return { name, category };
  });
}

// ============================================================
// BUILD UPDATE
// ============================================================

interface LocalMfr {
  atlas_id: number;
  summary: string | null;
  website_url: string | null;
  logo_url: string | null;
  headquarters: string | null;
  contact_info: string | null;
  core_products: string | null;
  stock_code: string | null;
  gaia_id: string | null;
  founded_year: number | null;
  certifications: { name: string; category: string }[] | null;
  [key: string]: unknown;
}

function buildProfileUpdate(
  local: LocalMfr,
  apiData: AtlasApiPartnerDetail,
  force = false,
): { updates: Record<string, unknown>; changeCount: number } {
  const updates: Record<string, unknown> = {};
  let changeCount = 0;

  const textFields: { api: keyof AtlasApiPartnerDetail; db: string }[] = [
    { api: 'description', db: 'summary' },
    { api: 'homepage', db: 'website_url' },
    { api: 'logoUrl', db: 'logo_url' },
    { api: 'location', db: 'headquarters' },
    { api: 'contact', db: 'contact_info' },
    { api: 'products', db: 'core_products' },
    { api: 'stockcode', db: 'stock_code' },
    { api: 'gaiaId', db: 'gaia_id' },
  ];

  for (const { api, db } of textFields) {
    const newVal = clean(apiData[api] as string | null);
    if (!newVal) continue;
    const existing = local[db] as string | null;
    if ((!existing || force) && existing !== newVal) {
      updates[db] = newVal;
      changeCount++;
    }
  }

  const year = parseYear(apiData.year);
  if (year && (!local.founded_year || force) && local.founded_year !== year) {
    updates.founded_year = year;
    changeCount++;
  }

  const apiCerts = parseCerts(apiData.certs);
  const existingCerts = Array.isArray(local.certifications) ? local.certifications : [];
  if (apiCerts.length > 0 && (existingCerts.length === 0 || force)) {
    const existingNames = new Set(existingCerts.map((c) => c.name?.toLowerCase()));
    const merged = [...existingCerts];
    let added = 0;
    for (const cert of apiCerts) {
      if (!existingNames.has(cert.name.toLowerCase())) {
        merged.push(cert);
        existingNames.add(cert.name.toLowerCase());
        added++;
      }
    }
    if (added > 0) {
      updates.certifications = merged;
      changeCount++;
    }
  }

  if (changeCount > 0) {
    updates.api_synced_at = new Date().toISOString();
    updates.updated_at = new Date().toISOString();
  }

  return { updates, changeCount };
}

// ============================================================
// PUBLIC: Sync single manufacturer
// ============================================================

export interface SyncResult {
  atlasId: number;
  name: string;
  changeCount: number;
  error?: string;
}

export async function syncSingleProfile(atlasId: number): Promise<SyncResult> {
  const supabase = createServiceClient();

  const { data: local, error: fetchErr } = await supabase
    .from('atlas_manufacturers')
    .select('*')
    .eq('atlas_id', atlasId)
    .single();

  if (fetchErr || !local) {
    return { atlasId, name: '', changeCount: 0, error: `Not found: atlas_id=${atlasId}` };
  }

  try {
    const apiData = await fetchAtlasApiPartnerDetail(atlasId);
    const { updates, changeCount } = buildProfileUpdate(local as LocalMfr, apiData);

    if (changeCount === 0) {
      // Still mark as synced even if no changes
      await supabase
        .from('atlas_manufacturers')
        .update({ api_synced_at: new Date().toISOString() })
        .eq('atlas_id', atlasId);
      return { atlasId, name: local.name_display, changeCount: 0 };
    }

    const { error: updateErr } = await supabase
      .from('atlas_manufacturers')
      .update(updates)
      .eq('atlas_id', atlasId);

    if (updateErr) {
      return { atlasId, name: local.name_display, changeCount: 0, error: updateErr.message };
    }

    return { atlasId, name: local.name_display, changeCount };
  } catch (err) {
    return { atlasId, name: local.name_display, changeCount: 0, error: (err as Error).message };
  }
}

// ============================================================
// PUBLIC: Sync all matched profiles
// ============================================================

export interface BatchSyncResult {
  total: number;
  updated: number;
  skipped: number;
  errors: number;
  results: SyncResult[];
}

export async function syncAllProfiles(
  onProgress?: (done: number, total: number) => void,
): Promise<BatchSyncResult> {
  const supabase = createServiceClient();

  // Fetch API partners
  const apiPartners = await fetchAtlasApiPartners('en');

  // Fetch all local manufacturers
  const all: LocalMfr[] = [];
  let from = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('atlas_manufacturers')
      .select('*')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Supabase error: ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...(data as LocalMfr[]));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const localByAtlasId = new Map<number, LocalMfr>();
  for (const m of all) {
    if (m.atlas_id) localByAtlasId.set(m.atlas_id, m);
  }

  // Only sync partners that match our DB
  const toSync = apiPartners.filter((p) => localByAtlasId.has(p.id));

  const result: BatchSyncResult = {
    total: toSync.length,
    updated: 0,
    skipped: 0,
    errors: 0,
    results: [],
  };

  for (let i = 0; i < toSync.length; i++) {
    const partner = toSync[i];
    const local = localByAtlasId.get(partner.id)!;

    try {
      const apiData = await fetchAtlasApiPartnerDetail(partner.id);
      const { updates, changeCount } = buildProfileUpdate(local, apiData);

      if (changeCount === 0) {
        await supabase
          .from('atlas_manufacturers')
          .update({ api_synced_at: new Date().toISOString() })
          .eq('atlas_id', partner.id);
        result.skipped++;
        result.results.push({ atlasId: partner.id, name: local.name_display as string, changeCount: 0 });
      } else {
        const { error: updateErr } = await supabase
          .from('atlas_manufacturers')
          .update(updates)
          .eq('atlas_id', partner.id);

        if (updateErr) {
          result.errors++;
          result.results.push({ atlasId: partner.id, name: local.name_display as string, changeCount: 0, error: updateErr.message });
        } else {
          result.updated++;
          result.results.push({ atlasId: partner.id, name: local.name_display as string, changeCount });
        }
      }
    } catch (err) {
      result.errors++;
      result.results.push({ atlasId: partner.id, name: local.name_display as string, changeCount: 0, error: (err as Error).message });
    }

    onProgress?.(i + 1, toSync.length);

    // Rate limit: ~50ms between API calls
    if (i < toSync.length - 1) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  return result;
}
