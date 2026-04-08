import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';
import { getLogicTable } from '@/lib/logicTables';
import { getL2ParamMapForCategory } from '@/lib/services/digikeyParamMap';

interface AtlasParam {
  value: string;
  numericValue?: number;
  unit?: string;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const { id } = await params;
    const body = await request.json();

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    // Description update
    if ('description' in body && typeof body.description === 'string') {
      updates.description = body.description;
      updates.clean_description = body.description;
    }

    // Parameters merge (patch individual keys into existing JSONB)
    if (body.parameters && typeof body.parameters === 'object') {
      const supabaseRead = await createClient();
      const { data: existing } = await supabaseRead
        .from('atlas_products')
        .select('parameters')
        .eq('id', id)
        .single();

      const merged = { ...((existing?.parameters as Record<string, unknown>) ?? {}), ...body.parameters };
      updates.parameters = merged;
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from('atlas_products')
      .update(updates)
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const { id } = await params;

    const supabase = await createClient();

    const { data, error } = await supabase
      .from('atlas_products')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const familyId = data.family_id as string | null;
    const table = familyId ? getLogicTable(familyId) : null;
    const parameters = (data.parameters ?? {}) as Record<string, AtlasParam>;

    // Build product identity
    const product = {
      id: data.id as string,
      mpn: data.mpn as string,
      manufacturer: data.manufacturer as string,
      description: (data.description as string | null) ?? null,
      category: data.category as string,
      subcategory: data.subcategory as string,
      familyId,
      familyName: table?.familyName ?? null,
      status: (data.status as string) || 'Active',
      datasheetUrl: (data.datasheet_url as string | null) ?? null,
      package: (data.package as string | null) ?? null,
    };

    // All Atlas attributes
    const atlasAttributes = Object.entries(parameters).map(([attributeId, p]) => ({
      attributeId,
      value: p.value,
      numericValue: p.numericValue ?? null,
      unit: p.unit ?? null,
    }));

    // Schema comparison (only if we have a logic table)
    let schemaComparison = null;
    const schemaAttrIds = new Set<string>();

    if (table) {
      const rules = table.rules.map((r) => {
        schemaAttrIds.add(r.attributeId);
        const atlasParam = parameters[r.attributeId];
        return {
          attributeId: r.attributeId,
          attributeName: r.attributeName,
          weight: r.weight,
          logicType: r.logicType,
          blockOnMissing: r.blockOnMissing ?? false,
          sortOrder: r.sortOrder,
          atlasValue: atlasParam?.value ?? null,
          atlasNumericValue: atlasParam?.numericValue ?? null,
          atlasUnit: atlasParam?.unit ?? null,
        };
      });

      const matched = rules.filter((r) => r.atlasValue !== null).length;
      schemaComparison = {
        familyId: familyId!,
        familyName: table.familyName,
        totalRules: rules.length,
        matched,
        coverage: rules.length > 0 ? Math.round((matched / rules.length) * 100) : 0,
        rules: rules.sort((a, b) => b.weight - a.weight || a.sortOrder - b.sortOrder),
      };
    }

    // L2 schema comparison fallback (no weight/logicType — display-only param maps)
    let l2SchemaComparison = null;
    if (!table) {
      const l2Map = getL2ParamMapForCategory(data.category as string);
      if (l2Map) {
        const l2Fields: {
          attributeId: string;
          attributeName: string;
          sortOrder: number;
          atlasValue: string | null;
          atlasUnit: string | null;
        }[] = [];

        for (const entry of Object.values(l2Map)) {
          const mappings = Array.isArray(entry) ? entry : [entry];
          for (const m of mappings) {
            if (schemaAttrIds.has(m.attributeId)) continue;
            schemaAttrIds.add(m.attributeId);
            const atlasParam = parameters[m.attributeId];
            l2Fields.push({
              attributeId: m.attributeId,
              attributeName: m.attributeName,
              sortOrder: m.sortOrder,
              atlasValue: atlasParam?.value ?? null,
              atlasUnit: atlasParam?.unit ?? null,
            });
          }
        }

        const matched = l2Fields.filter((f) => f.atlasValue !== null).length;
        l2SchemaComparison = {
          category: data.category as string,
          totalFields: l2Fields.length,
          matched,
          coverage: l2Fields.length > 0 ? Math.round((matched / l2Fields.length) * 100) : 0,
          fields: l2Fields.sort((a, b) => a.sortOrder - b.sortOrder),
        };
      }
    }

    // Extra attributes (in Atlas but not in schema)
    const extraAttributes = atlasAttributes.filter((a) => !schemaAttrIds.has(a.attributeId));

    // Raw parameters from atlas_raw (original unmapped data)
    let rawParameters: { name: string; value: string }[] | null = null;
    const atlasRaw = data.atlas_raw as { parameters?: { name: string; value: string }[] } | null;
    if (atlasRaw?.parameters && Array.isArray(atlasRaw.parameters)) {
      rawParameters = atlasRaw.parameters.map((p) => ({
        name: p.name ?? String(p),
        value: p.value ?? '',
      }));
    }

    return NextResponse.json({
      product,
      schemaComparison,
      l2SchemaComparison,
      atlasAttributes,
      extraAttributes,
      rawParameters,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
