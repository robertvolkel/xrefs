import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';
import { AtlasDictOverrideRecord } from '@/lib/types';
import {
  getAtlasParamDictionary,
  getSharedParamDictionary,
  getSkipParams,
  applyDictOverrides,
  invalidateDictOverrideCache,
  type AtlasParamMapping,
} from '@/lib/services/atlasMapper';

/** GET /api/admin/atlas/dictionaries?familyId=B5 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const familyId = new URL(request.url).searchParams.get('familyId');
    if (!familyId) {
      return NextResponse.json(
        { success: false, error: 'familyId query parameter required' },
        { status: 400 },
      );
    }

    const baseDict = getAtlasParamDictionary(familyId);
    const sharedDict = getSharedParamDictionary();
    const skipSet = getSkipParams();

    // Fetch active overrides from Supabase
    const supabase = await createClient();
    const { data: overrideRows } = await supabase
      .from('atlas_dictionary_overrides')
      .select('*')
      .eq('family_id', familyId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    const overrides = (overrideRows ?? []) as Array<Record<string, unknown>>;
    const overrideRecords: AtlasDictOverrideRecord[] = overrides.map(mapRowToRecord);

    // Build override rows for merge function
    const mergeOverrides = overrides.map((r) => ({
      id: r.id as string,
      family_id: r.family_id as string,
      param_name: r.param_name as string,
      action: r.action as 'modify' | 'add' | 'remove',
      attribute_id: r.attribute_id as string | null,
      attribute_name: r.attribute_name as string | null,
      unit: r.unit as string | null,
      sort_order: r.sort_order as number | null,
    }));

    // Merge overrides onto base dictionary
    const mergedDict = baseDict ? applyDictOverrides(baseDict, mergeOverrides) : {};

    // Build entry list from merged dictionary
    const entries = Object.entries(mergedDict).map(([paramName, mapping]) => ({
      paramName,
      attributeId: mapping.attributeId,
      attributeName: mapping.attributeName,
      unit: mapping.unit,
      sortOrder: mapping.sortOrder,
    }));

    // Build shared entries list
    const sharedEntries = Object.entries(sharedDict).map(([paramName, mapping]) => ({
      paramName,
      attributeId: mapping.attributeId,
      attributeName: mapping.attributeName,
      unit: mapping.unit,
      sortOrder: mapping.sortOrder,
    }));

    // Fetch unmapped Atlas params for this family from atlas_products
    let unmapped: { paramName: string; count: number }[] = [];
    try {
      const { data: products } = await supabase
        .from('atlas_products')
        .select('raw_parameters')
        .eq('family_id', familyId)
        .limit(500);

      if (products && products.length > 0) {
        const paramCounts = new Map<string, number>();
        const allMappedKeys = new Set([
          ...Object.keys(mergedDict),
          ...Object.keys(sharedDict),
        ]);

        for (const prod of products) {
          const rawParams = prod.raw_parameters as Array<{ name: string; value: string }> | null;
          if (!rawParams) continue;
          for (const p of rawParams) {
            const lower = p.name.toLowerCase().trim();
            if (skipSet.has(p.name) || skipSet.has(lower)) continue;
            if (lower === '状态' || lower === 'status' || lower === '零件状态') continue;
            if (allMappedKeys.has(lower)) continue;
            paramCounts.set(p.name, (paramCounts.get(p.name) ?? 0) + 1);
          }
        }

        unmapped = Array.from(paramCounts.entries())
          .map(([paramName, count]) => ({ paramName, count }))
          .sort((a, b) => b.count - a.count);
      }
    } catch {
      // raw_parameters column might not exist — skip unmapped
    }

    // Compute unique attribute IDs
    const uniqueAttrs = new Set(entries.map((e) => e.attributeId));

    return NextResponse.json({
      success: true,
      data: {
        familyId,
        entries: entries.sort((a, b) => a.sortOrder - b.sortOrder),
        sharedEntries: sharedEntries.sort((a, b) => a.sortOrder - b.sortOrder),
        unmapped,
        overrides: overrideRecords,
        stats: {
          totalEntries: entries.length,
          uniqueAttributes: uniqueAttrs.size,
          unmappedCount: unmapped.length,
        },
      },
    });
  } catch (error) {
    console.error('Atlas dictionaries GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}

/** POST /api/admin/atlas/dictionaries — create override */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { user, error: authError } = await requireAdmin();
    if (authError) return authError;

    const body = await request.json();

    // Validate
    const validation = validateDictOverride(body);
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    // Deactivate any existing active override for this family+param_name
    await supabase
      .from('atlas_dictionary_overrides')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('family_id', body.familyId)
      .eq('param_name', body.paramName)
      .eq('is_active', true);

    const insert: Record<string, unknown> = {
      family_id: body.familyId,
      param_name: body.paramName,
      action: body.action,
      change_reason: body.changeReason,
      created_by: user!.id,
    };

    if (body.attributeId !== undefined) insert.attribute_id = body.attributeId;
    if (body.attributeName !== undefined) insert.attribute_name = body.attributeName;
    if (body.unit !== undefined) insert.unit = body.unit;
    if (body.sortOrder !== undefined) insert.sort_order = body.sortOrder;

    const { data, error } = await supabase
      .from('atlas_dictionary_overrides')
      .insert(insert)
      .select()
      .single();

    if (error) {
      console.error('Atlas dict override insert error:', error.message);
      return NextResponse.json(
        { success: false, error: 'Failed to create dictionary override' },
        { status: 500 },
      );
    }

    invalidateDictOverrideCache(body.familyId);

    return NextResponse.json({ success: true, data: mapRowToRecord(data) }, { status: 201 });
  } catch (error) {
    console.error('Atlas dictionaries POST error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// ── Validation ─────────────────────────────────────────────

function validateDictOverride(body: Record<string, unknown>): { valid: boolean; error?: string } {
  if (!body.familyId || typeof body.familyId !== 'string') {
    return { valid: false, error: 'familyId is required' };
  }
  if (!body.paramName || typeof body.paramName !== 'string') {
    return { valid: false, error: 'paramName is required' };
  }
  if (!['modify', 'add', 'remove'].includes(body.action as string)) {
    return { valid: false, error: 'action must be modify, add, or remove' };
  }
  if (!body.changeReason || typeof body.changeReason !== 'string' || !(body.changeReason as string).trim()) {
    return { valid: false, error: 'changeReason is required' };
  }

  const baseDict = getAtlasParamDictionary(body.familyId as string);
  const paramName = (body.paramName as string).toLowerCase();
  const existsInBase = baseDict?.[paramName] !== undefined;

  if (body.action === 'modify' && !existsInBase) {
    return { valid: false, error: 'Cannot modify: param name not found in base dictionary' };
  }
  if (body.action === 'remove' && !existsInBase) {
    return { valid: false, error: 'Cannot remove: param name not found in base dictionary' };
  }
  if (body.action === 'add') {
    if (!body.attributeId || typeof body.attributeId !== 'string') {
      return { valid: false, error: 'attributeId is required for add action' };
    }
    if (!body.attributeName || typeof body.attributeName !== 'string') {
      return { valid: false, error: 'attributeName is required for add action' };
    }
  }
  if (body.sortOrder !== undefined && (typeof body.sortOrder !== 'number' || body.sortOrder < 0)) {
    return { valid: false, error: 'sortOrder must be a non-negative number' };
  }

  return { valid: true };
}

// ── Helpers ────────────────────────────────────────────────

function mapRowToRecord(row: Record<string, unknown>): AtlasDictOverrideRecord {
  return {
    id: row.id as string,
    familyId: row.family_id as string,
    paramName: row.param_name as string,
    action: row.action as AtlasDictOverrideRecord['action'],
    attributeId: row.attribute_id as string | undefined,
    attributeName: row.attribute_name as string | undefined,
    unit: row.unit as string | undefined,
    sortOrder: row.sort_order as number | undefined,
    isActive: row.is_active as boolean,
    changeReason: row.change_reason as string,
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
