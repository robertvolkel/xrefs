/**
 * POST /api/admin/atlas/ingest/register-mfrs
 *
 * Bulk-inserts new manufacturers into atlas_manufacturers. Used by the admin
 * UI when uploaded files reference mfr_ids that aren't yet in the master list.
 *
 * Body:
 *   {
 *     manufacturers: Array<{
 *       atlas_id: number;
 *       name_en: string;
 *       name_zh?: string;
 *       name_display: string;
 *       slug: string;
 *       country?: string; // defaults to 'CN'
 *     }>
 *   }
 *
 * Invalidates the alias resolver cache so newly-registered MFRs are immediately
 * reachable from product lookups.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import { invalidateManufacturerAliasCache } from '@/lib/services/manufacturerAliasResolver';

interface NewMfrInput {
  atlas_id: number;
  name_en: string;
  name_zh?: string;
  name_display: string;
  slug: string;
  country?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const body = await request.json();
    const inputs: NewMfrInput[] = body?.manufacturers ?? [];
    if (!Array.isArray(inputs) || inputs.length === 0) {
      return NextResponse.json({ success: false, error: 'manufacturers[] required' }, { status: 400 });
    }

    // Validate each row
    const rowsToInsert: Array<Record<string, unknown>> = [];
    for (const m of inputs) {
      if (typeof m.atlas_id !== 'number' || !m.name_en || !m.name_display || !m.slug) {
        return NextResponse.json({
          success: false,
          error: `Invalid manufacturer entry: requires atlas_id, name_en, name_display, slug`,
        }, { status: 400 });
      }
      rowsToInsert.push({
        atlas_id: m.atlas_id,
        name_en: m.name_en.trim(),
        name_zh: m.name_zh?.trim() || null,
        name_display: m.name_display.trim(),
        slug: m.slug.trim(),
        country: m.country ?? 'CN',
      });
    }

    const supabase = createServiceClient();

    // Refuse duplicates — fail fast if any atlas_id already exists.
    const ids = rowsToInsert.map((r) => r.atlas_id as number);
    const { data: existing, error: existErr } = await supabase
      .from('atlas_manufacturers')
      .select('atlas_id, name_display')
      .in('atlas_id', ids);
    if (existErr) throw new Error(existErr.message);
    if (existing && existing.length > 0) {
      return NextResponse.json({
        success: false,
        error: 'Some atlas_ids already exist in atlas_manufacturers',
        conflicts: existing,
      }, { status: 409 });
    }

    const { data: inserted, error: insertErr } = await supabase
      .from('atlas_manufacturers')
      .insert(rowsToInsert)
      .select('atlas_id, name_display, slug');
    if (insertErr) throw new Error(insertErr.message);

    // Invalidate alias resolver caches so new MFRs are reachable immediately
    invalidateManufacturerAliasCache();

    return NextResponse.json({ success: true, inserted });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
