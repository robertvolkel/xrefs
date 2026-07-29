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
import { resolveManufacturerAlias } from '@/lib/services/manufacturerAliasResolver';

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

    // 4. Count per-attribute fill rate for this manufacturer + family, in the DB.
    //    Resolve name variants first: the drawer's caller passes a manufacturer's
    //    canonical display name ("ISC 无锡固电"), but products are stored under
    //    the English-only name ("ISC"), so a single-string match would return
    //    zero for variant-stored MFRs. The RPC also dodges PostgREST's 1000-row
    //    cap (which truncated the old .select() for the 66 groups >1000 products).
    const supabase = await createClient();
    const aliasMatch = await resolveManufacturerAlias(manufacturer);
    const variants = aliasMatch?.variants?.length ? aliasMatch.variants : [manufacturer];

    const { data: coverageData, error: coverageErr } = await supabase.rpc(
      'get_atlas_family_attr_coverage',
      { p_manufacturer_variants: variants, p_family_id: familyId },
    );
    if (coverageErr) {
      console.error('get_atlas_family_attr_coverage RPC error:', coverageErr);
      return NextResponse.json(
        { success: false, error: 'Coverage query failed' },
        { status: 500 },
      );
    }

    const coveragePayload = (coverageData ?? {}) as {
      totalProducts?: number;
      attrCounts?: Record<string, number>;
    };
    const totalProducts = Number(coveragePayload.totalProducts ?? 0);
    const attrFrequency = new Map<string, number>(
      Object.entries(coveragePayload.attrCounts ?? {}).map(([k, v]) => [k, Number(v)]),
    );

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
