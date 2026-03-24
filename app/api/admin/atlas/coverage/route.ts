import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';
import { getLogicTable } from '@/lib/logicTables';
import {
  getAtlasParamDictionary,
  getSharedParamDictionary,
} from '@/lib/services/atlasMapper';
import { getDigikeyAttributeIdsForFamily } from '@/lib/services/digikeyParamMap';
import { reversePartsioParamLookup } from '@/lib/services/partsioParamMap';

/** GET /api/admin/atlas/coverage?manufacturer=RUILON&familyId=B5 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const url = new URL(request.url);
    const manufacturer = url.searchParams.get('manufacturer');
    const familyId = url.searchParams.get('familyId');

    if (!manufacturer || !familyId) {
      return NextResponse.json(
        { success: false, error: 'manufacturer and familyId query parameters required' },
        { status: 400 },
      );
    }

    // 1. Get logic table rules
    const logicTable = getLogicTable(familyId);
    if (!logicTable) {
      return NextResponse.json(
        { success: false, error: `No logic table found for family ${familyId}` },
        { status: 404 },
      );
    }

    // 2. Get Atlas dictionary coverage (unique attributeIds from family + shared dicts)
    const atlasDictAttrs = new Set<string>();
    const familyDict = getAtlasParamDictionary(familyId);
    const sharedDict = getSharedParamDictionary();
    if (familyDict) {
      for (const mapping of Object.values(familyDict)) {
        atlasDictAttrs.add(mapping.attributeId);
      }
    }
    for (const mapping of Object.values(sharedDict)) {
      atlasDictAttrs.add(mapping.attributeId);
    }

    // 3. Get Digikey param map coverage
    const digikeyAttrs = getDigikeyAttributeIdsForFamily(familyId);

    // 3b. Get Parts.io param map coverage
    const partsioReverse = reversePartsioParamLookup(familyId);
    const partsioAttrs = new Set(partsioReverse.keys());

    // 4. Query Atlas products for this manufacturer + family
    const supabase = await createClient();
    const { data: products } = await supabase
      .from('atlas_products')
      .select('parameters')
      .eq('manufacturer', manufacturer)
      .eq('family_id', familyId);

    const totalProducts = products?.length ?? 0;

    // Count per-attribute frequency across products
    const attrFrequency = new Map<string, number>();
    if (products) {
      for (const prod of products) {
        const params = prod.parameters as Record<string, unknown> | null;
        if (!params) continue;
        for (const attrId of Object.keys(params)) {
          attrFrequency.set(attrId, (attrFrequency.get(attrId) ?? 0) + 1);
        }
      }
    }

    // 5. Build gap matrix from logic table rules
    const attributes = logicTable.rules.map(rule => {
      const productCount = attrFrequency.get(rule.attributeId) ?? 0;
      return {
        attributeId: rule.attributeId,
        attributeName: rule.attributeName,
        weight: rule.weight,
        logicType: rule.logicType,
        sortOrder: rule.sortOrder,
        atlasProductCount: productCount,
        atlasProductPct: totalProducts > 0 ? Math.round((productCount / totalProducts) * 100) : 0,
        inAtlasDict: atlasDictAttrs.has(rule.attributeId),
        inDigikey: digikeyAttrs.has(rule.attributeId),
        inPartsio: partsioAttrs.has(rule.attributeId),
      };
    }).sort((a, b) => b.weight - a.weight || a.sortOrder - b.sortOrder);

    return NextResponse.json({
      success: true,
      data: {
        manufacturer,
        familyId,
        familyName: logicTable.familyName,
        totalProducts,
        attributes,
      },
    });
  } catch (error) {
    console.error('Atlas coverage GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
