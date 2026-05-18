/**
 * POST /api/admin/atlas/family-domain-cards/[familyId]/customize
 *
 * Copies a Built-in (TS-fallback) card's text into a DB row with
 * status='draft' so the engineer can edit + Approve without losing the
 * existing hand-written text to an Opus regeneration. No AI call.
 *
 * Use case: an engineer wants to ADD a note to the existing B5 MOSFETs
 * card (e.g., "we always prefer Vishay over IRF for new designs") rather
 * than have Opus rewrite the whole thing.
 *
 * Errors:
 *   - 400 if familyId isn't a valid logic-table family
 *   - 404 if no built-in card exists for that family (use /generate instead)
 *   - 409 if a DB row already exists for that family (avoid silently
 *         overwriting an existing draft / active card)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import { logicTableRegistry } from '@/lib/logicTables';
import {
  ATLAS_FAMILY_DOMAIN_CARDS,
  invalidateDomainCardCache,
} from '@/lib/services/atlasFamilyDomainCards';

export const dynamic = 'force-dynamic';

function isValidFamilyId(familyId: string): boolean {
  return familyId in logicTableRegistry;
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ familyId: string }> },
): Promise<NextResponse> {
  try {
    const { error: authError, user } = await requireAdmin();
    if (authError) return authError;

    const { familyId } = await params;
    if (!isValidFamilyId(familyId)) {
      return NextResponse.json({ success: false, error: 'Invalid familyId' }, { status: 400 });
    }

    const builtInText = ATLAS_FAMILY_DOMAIN_CARDS[familyId];
    if (!builtInText) {
      return NextResponse.json(
        { success: false, error: 'No built-in card for this family. Use /generate to create one with Opus.' },
        { status: 404 },
      );
    }

    const supabase = createServiceClient();

    // Refuse to overwrite an existing DB row. The engineer would lose
    // their previous draft / active card if we silently upserted here.
    const { data: existing } = await supabase
      .from('atlas_family_domain_cards')
      .select('family_id, status')
      .eq('family_id', familyId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        {
          success: false,
          error: `A DB card already exists for ${familyId} (status=${existing.status}). Edit it directly instead of Customizing.`,
        },
        { status: 409 },
      );
    }

    const { data, error } = await supabase
      .from('atlas_family_domain_cards')
      .insert({
        family_id: familyId,
        card_text: builtInText,
        status: 'draft',
        model_used: null,
        data_snapshot: null,
        created_by: user?.id ?? null,
        approved_by: null,
        approved_at: null,
      })
      .select()
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json(
        { success: false, error: error?.message ?? 'Insert failed' },
        { status: 500 },
      );
    }

    invalidateDomainCardCache();
    return NextResponse.json({ success: true, card: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
