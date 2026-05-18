/**
 * POST /api/admin/atlas/family-param-signatures
 *
 * Engineer-driven endpoint: persist a new family-param signature AND
 * retroactively reclassify products in atlas_products that already
 * carry the offending paramName under the wrong family.
 *
 * Called from the AI Investigator drawer's "wrong_family" Confirm
 * button (one-click flow). Body shape:
 *   {
 *     paramName: string,        // exact paramName from the queue row
 *     targetFamilyId: string,   // family the param actually belongs to
 *     reasoning: string,        // shown in audit + diagnosis
 *     // Optional explicit overrides; omit to derive from the
 *     // code-defined FAMILY_PARAM_SIGNATURES baseline.
 *     targetCategory?: string,
 *     targetSubcategory?: string,
 *     sourceInvestigationId?: string | null,
 *   }
 *
 * Returns: { success, signatureId, productsReclassified, reclassifyErrors? }.
 *
 * Why two side-effects in one endpoint? Engineer-from-UI flow expects
 * "I clicked Confirm; the system handled it." Splitting insert and
 * reclassify into separate calls leaks coordination concerns into the
 * client and creates a half-done state if the second call fails.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import {
  FAMILY_PARAM_SIGNATURES,
  invalidateFamilyParamSignaturesCache,
} from '@/lib/services/atlasFamilyParamSignatures';

interface PostBody {
  paramName?: string;
  targetFamilyId?: string;
  reasoning?: string;
  targetCategory?: string;
  targetSubcategory?: string;
  sourceInvestigationId?: string | null;
}

// Mirror of the unmapped-param key sanitization in
// atlasMapper.ts → fromParametersJsonb (line 2430). Atlas stores
// unmapped params under this sanitized key, so the retroactive
// reclassify scan uses the same form for the JSONB `?` lookup.
function sanitizeParamKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

// Escape regex metachars so the engineer's paramName stores as a
// literal-text pattern. Anchored ^…$ to avoid partial matches that
// could fire on unrelated params.
function paramNameToRegexSource(paramName: string): string {
  const escaped = paramName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return `^${escaped}$`;
}

// Derive (category, subcategory) from any code-defined entry that
// already targets this family. Falls back to ('Unknown', familyId)
// only if the code registry has no precedent for this family — in
// which case the engineer should pass them explicitly.
function deriveTargetClassification(
  familyId: string,
  bodyCategory?: string,
  bodySubcategory?: string,
): { category: string; subcategory: string } {
  if (bodyCategory && bodySubcategory) {
    return { category: bodyCategory, subcategory: bodySubcategory };
  }
  const sample = FAMILY_PARAM_SIGNATURES.find((s) => s.target.familyId === familyId);
  if (sample) {
    return {
      category: bodyCategory ?? sample.target.category,
      subcategory: bodySubcategory ?? sample.target.subcategory,
    };
  }
  return {
    category: bodyCategory ?? 'Unknown',
    subcategory: bodySubcategory ?? familyId,
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { user, error: authError } = await requireAdmin();
    if (authError) return authError;

    const body = (await request.json()) as PostBody;
    const paramName = body.paramName?.trim();
    const targetFamilyId = body.targetFamilyId?.trim();
    const reasoning = body.reasoning?.trim();

    if (!paramName) {
      return NextResponse.json({ success: false, error: 'paramName required' }, { status: 400 });
    }
    if (!targetFamilyId) {
      return NextResponse.json({ success: false, error: 'targetFamilyId required' }, { status: 400 });
    }
    if (!reasoning) {
      return NextResponse.json({ success: false, error: 'reasoning required' }, { status: 400 });
    }

    const patternSource = paramNameToRegexSource(paramName);
    // Validate the compiled regex up front so we never insert garbage
    // that would crash loadAllFamilyParamSignatures later.
    try {
      new RegExp(patternSource, 'i');
    } catch (e) {
      return NextResponse.json(
        { success: false, error: `Invalid regex pattern: ${(e as Error).message}` },
        { status: 400 },
      );
    }

    const { category, subcategory } = deriveTargetClassification(
      targetFamilyId,
      body.targetCategory,
      body.targetSubcategory,
    );

    const supabase = createServiceClient();

    // 1. Insert the signature row. Unique index on (pattern, target_family_id)
    //    where is_active=true means a duplicate Confirm is a 23505 — handled
    //    explicitly so the UI can show "already in registry" rather than a
    //    raw 500.
    const insertRow = {
      pattern: patternSource,
      target_family_id: targetFamilyId,
      target_category: category,
      target_subcategory: subcategory,
      reasoning,
      source: 'engineer_via_ai',
      source_investigation_id: body.sourceInvestigationId ?? null,
      created_by: user!.id,
    };
    const { data: inserted, error: insertError } = await supabase
      .from('atlas_family_param_signatures')
      .insert(insertRow)
      .select('id')
      .single();

    let signatureId: string;
    if (insertError) {
      if (insertError.code === '23505') {
        // Duplicate — fetch the existing row's id so the reclassify step
        // still runs (engineer may be re-confirming after a partial failure).
        const { data: existing } = await supabase
          .from('atlas_family_param_signatures')
          .select('id')
          .eq('pattern', patternSource)
          .eq('target_family_id', targetFamilyId)
          .eq('is_active', true)
          .maybeSingle();
        if (!existing) {
          return NextResponse.json(
            { success: false, error: 'Signature insert failed and no existing row found', detail: insertError.message },
            { status: 500 },
          );
        }
        signatureId = existing.id as string;
      } else {
        console.error('atlas_family_param_signatures insert failed:', insertError);
        return NextResponse.json(
          { success: false, error: 'Database error', detail: insertError.message },
          { status: 500 },
        );
      }
    } else {
      signatureId = inserted!.id as string;
    }

    // Bust the in-process cache so the queue route's next render sees
    // the new signature without waiting for the 5-min TTL.
    invalidateFamilyParamSignaturesCache();

    // 2. Retroactive reclassify via RPC. Single round trip; Postgres
    //    handles the JSONB key-existence filter + bulk update in one
    //    statement. RPC name + arg order must match
    //    scripts/supabase-atlas-family-param-signatures-schema.sql.
    const sanitizedKey = sanitizeParamKey(paramName);
    let productsReclassified = 0;
    const reclassifyErrors: string[] = [];

    if (sanitizedKey) {
      const { data: count, error: rpcError } = await supabase.rpc(
        'reclassify_products_by_param_key',
        {
          param_key: sanitizedKey,
          target_family_id: targetFamilyId,
          target_category: category,
          target_subcategory: subcategory,
        },
      );
      if (rpcError) {
        reclassifyErrors.push(`reclassify rpc: ${rpcError.message}`);
      } else if (typeof count === 'number') {
        productsReclassified = count;
      }
    }

    return NextResponse.json({
      success: true,
      signatureId,
      productsReclassified,
      ...(reclassifyErrors.length > 0 ? { reclassifyErrors } : {}),
    });
  } catch (err) {
    console.error('family-param-signatures POST error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal error', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
