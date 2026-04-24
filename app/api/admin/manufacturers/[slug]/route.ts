import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getLogicTable } from '@/lib/logicTables';
import { invalidateManufacturerCache } from '@/lib/services/atlasClient';
import { invalidateManufacturerAliasCache } from '@/lib/services/manufacturerAliasResolver';
import { invalidateRecommendationsCache } from '@/lib/services/partDataCache';
import { invalidateManufacturersListCache } from '../route';
import { invalidateAtlasCache } from '../../atlas/route';

// ─── Alias normalization / validation (Decision #152) ────
// Exported for unit testing; route handler uses it via normalizeAliasInput.

const MAX_ALIASES = 50;
const MAX_ALIAS_LENGTH = 100;

export type AliasValidationResult =
  | { ok: true; aliases: string[] }
  | { ok: false; error: string };

export function normalizeAliasInput(input: unknown): AliasValidationResult {
  if (!Array.isArray(input)) {
    return { ok: false, error: 'aliases must be an array of strings' };
  }
  if (input.length > MAX_ALIASES) {
    return { ok: false, error: `aliases cannot exceed ${MAX_ALIASES} entries` };
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== 'string') {
      return { ok: false, error: 'every alias entry must be a string' };
    }
    const trimmed = raw.trim();
    if (!trimmed) {
      return { ok: false, error: 'alias entries cannot be empty or whitespace' };
    }
    if (trimmed.length > MAX_ALIAS_LENGTH) {
      return { ok: false, error: `alias entries cannot exceed ${MAX_ALIAS_LENGTH} characters` };
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue; // dedupe case-insensitively, first writer wins
    seen.add(key);
    out.push(trimmed);
  }
  return { ok: true, aliases: out };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const { slug } = await params;
    const supabase = await createClient();

    // Fetch manufacturer record
    const { data: mfr, error: mfrErr } = await supabase
      .from('atlas_manufacturers')
      .select('*')
      .eq('slug', slug)
      .single();

    if (mfrErr || !mfr) {
      return NextResponse.json({ error: 'Manufacturer not found' }, { status: 404 });
    }

    // Fetch all products for this manufacturer (paginated to avoid 1000-row Supabase cap)
    const mfrFilter = `manufacturer.eq.${mfr.name_display},manufacturer.eq.${mfr.name_en}`;
    const allProducts: { family_id: string | null; category: string; subcategory: string; parameters: Record<string, unknown> | null; updated_at: string }[] = [];
    let offset = 0;
    const PAGE_SIZE = 1000;
    let lastProductUpdate: string | null = null;
    while (true) {
      const { data: page } = await supabase
        .from('atlas_products')
        .select('family_id, category, subcategory, parameters, updated_at')
        .or(mfrFilter)
        .order('id')
        .range(offset, offset + PAGE_SIZE - 1);
      if (!page || page.length === 0) break;
      for (const p of page) {
        if (!lastProductUpdate || p.updated_at > lastProductUpdate) lastProductUpdate = p.updated_at;
      }
      allProducts.push(...page);
      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
    const products = allProducts;

    // Last cross-ref upload for this MFR
    const { data: latestXref } = await supabase
      .from('manufacturer_cross_references')
      .select('uploaded_at')
      .eq('manufacturer_slug', slug)
      .eq('is_active', true)
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastCrossRefUpdate = latestXref?.uploaded_at ?? null;

    // Aggregate per-family breakdown
    const familyMap = new Map<string, {
      familyId: string | null;
      category: string;
      subcategory: string;
      count: number;
      scorableCount: number;
      totalCovered: number;
      totalRules: number;
    }>();

    const familyRuleAttrs = new Map<string, Set<string>>();

    for (const p of products) {
      const key = p.family_id ?? `_::${p.category}::${p.subcategory}`;
      let agg = familyMap.get(key);
      if (!agg) {
        agg = { familyId: p.family_id, category: p.category, subcategory: p.subcategory, count: 0, scorableCount: 0, totalCovered: 0, totalRules: 0 };
        familyMap.set(key, agg);
      }
      agg.count++;

      if (p.family_id) {
        agg.scorableCount++;

        if (p.parameters) {
          if (!familyRuleAttrs.has(p.family_id)) {
            const table = getLogicTable(p.family_id);
            if (table) {
              familyRuleAttrs.set(p.family_id, new Set(table.rules.map(r => r.attributeId)));
            }
          }
          const ruleAttrs = familyRuleAttrs.get(p.family_id);
          if (ruleAttrs && ruleAttrs.size > 0) {
            let covered = 0;
            for (const attr of Object.keys(p.parameters as Record<string, unknown>)) {
              if (ruleAttrs.has(attr)) covered++;
            }
            agg.totalCovered += covered;
            agg.totalRules += ruleAttrs.size;
          }
        }
      }
    }

    // Build family names map
    const familyNames: Record<string, string> = {};
    for (const [, agg] of familyMap) {
      if (agg.familyId) {
        const table = getLogicTable(agg.familyId);
        if (table) familyNames[agg.familyId] = table.familyName;
      }
    }

    const familyBreakdown = [...familyMap.values()].map(fb => ({
      ...fb,
      coveragePct: fb.totalRules > 0
        ? Math.round((fb.totalCovered / fb.totalRules) * 100)
        : 0,
    })).sort((a, b) => (a.familyId ?? '').localeCompare(b.familyId ?? ''));

    const totalProducts = products.length;
    const scorableProducts = products.filter(p => p.family_id).length;
    const totalCovered = familyBreakdown.reduce((s, f) => s + f.totalCovered, 0);
    const totalRules = familyBreakdown.reduce((s, f) => s + f.totalRules, 0);

    return NextResponse.json({
      manufacturer: {
        id: mfr.id,
        atlasId: mfr.atlas_id,
        slug: mfr.slug,
        nameEn: mfr.name_en,
        nameZh: mfr.name_zh,
        nameDisplay: mfr.name_display,
        aliases: mfr.aliases,
        partsioId: mfr.partsio_id,
        partsioName: mfr.partsio_name,
        websiteUrl: mfr.website_url,
        logoUrl: mfr.logo_url,
        headquarters: mfr.headquarters,
        country: mfr.country,
        foundedYear: mfr.founded_year,
        summary: mfr.summary,
        isSecondSource: mfr.is_second_source,
        certifications: mfr.certifications,
        manufacturingLocations: mfr.manufacturing_locations,
        productCategories: mfr.product_categories,
        authorizedDistributors: mfr.authorized_distributors,
        complianceFlags: mfr.compliance_flags,
        designResources: mfr.design_resources,
        enabled: mfr.enabled,
        contactInfo: mfr.contact_info ?? null,
        coreProducts: mfr.core_products ?? null,
        stockCode: mfr.stock_code ?? null,
        gaiaId: mfr.gaia_id ?? null,
        apiSyncedAt: mfr.api_synced_at ?? null,
      },
      stats: {
        totalProducts,
        scorableProducts,
        coveragePct: totalRules > 0 ? Math.round((totalCovered / totalRules) * 100) : 0,
      },
      timestamps: {
        products: lastProductUpdate,
        profile: mfr.updated_at ?? null,
        crossRefs: lastCrossRefUpdate,
      },
      familyBreakdown,
      familyNames,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { user, error: authError } = await requireAdmin();
    if (authError) return authError;

    const { slug } = await params;
    const body = await request.json();

    // Allowlisted fields that can be updated
    const allowedFields = [
      'summary', 'headquarters', 'country', 'founded_year', 'website_url',
      'logo_url', 'is_second_source', 'certifications', 'manufacturing_locations',
      'product_categories', 'authorized_distributors', 'compliance_flags',
      'design_resources', 'enabled', 'contact_info', 'core_products',
      'stock_code', 'gaia_id', 'aliases',
    ];

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field];
      }
    }

    // Aliases get normalized + validated; reject the whole PATCH on bad input.
    if ('aliases' in updates) {
      const result = normalizeAliasInput(updates.aliases);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      updates.aliases = result.aliases;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    updates.updated_at = new Date().toISOString();
    updates.updated_by = user!.id;

    const supabase = createServiceClient();
    const { error } = await supabase
      .from('atlas_manufacturers')
      .update(updates)
      .eq('slug', slug);

    if (error) {
      console.error('Manufacturer update error:', error.message);
      return NextResponse.json({ error: 'Failed to update manufacturer' }, { status: 500 });
    }

    // Invalidate caches
    invalidateManufacturerCache();
    invalidateManufacturersListCache();
    invalidateAtlasCache();
    // Resolver cache must flush whenever aliases change so the new spellings
    // take effect immediately instead of waiting out the 5-min TTL.
    if ('aliases' in updates) {
      invalidateManufacturerAliasCache();
    }
    // Only invalidate recommendations cache when enabled status changes —
    // profile/website edits don't affect scoring. Alias edits don't affect
    // scoring either (resolver is used for identity, not ranking weights).
    if ('enabled' in updates) {
      invalidateRecommendationsCache();
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
