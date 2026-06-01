/**
 * GET    /api/admin/atlas/family-domain-cards/[familyId]
 * PATCH  /api/admin/atlas/family-domain-cards/[familyId]
 * DELETE /api/admin/atlas/family-domain-cards/[familyId]  (soft = archive)
 *
 * Per-family card CRUD. PATCH supports editing card_text and/or changing
 * status (draft → active to publish, active → archived to retire).
 *
 * Generation lives at a sibling /generate route — this file is just the
 * persistence layer.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import {
  invalidateDomainCardCache,
  ATLAS_FAMILY_DOMAIN_CARDS,
} from '@/lib/services/atlasFamilyDomainCards';
import { logicTableRegistry } from '@/lib/logicTables';

export const dynamic = 'force-dynamic';

function isValidFamilyId(familyId: string): boolean {
  return familyId in logicTableRegistry;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ familyId: string }> },
): Promise<NextResponse> {
  try {
    const { error: authError, user } = await requireAdmin();
    if (authError) return authError;
    void user;

    const { familyId } = await params;
    if (!isValidFamilyId(familyId)) {
      return NextResponse.json({ success: false, error: 'Invalid familyId' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('atlas_family_domain_cards')
      .select('*')
      .eq('family_id', familyId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Surface the TS fallback so the engineer can see what's currently
    // injected even if no DB row exists yet.
    const tsFallback = ATLAS_FAMILY_DOMAIN_CARDS[familyId] ?? null;
    return NextResponse.json({ success: true, card: data, tsFallback });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ familyId: string }> },
): Promise<NextResponse> {
  try {
    const { error: authError, user } = await requireAdmin();
    if (authError) return authError;

    const { familyId } = await params;
    if (!isValidFamilyId(familyId)) {
      return NextResponse.json({ success: false, error: 'Invalid familyId' }, { status: 400 });
    }

    const body = (await request.json()) as {
      cardText?: string;
      status?: 'draft' | 'active' | 'archived';
    };

    if (body.status && !['draft', 'active', 'archived'].includes(body.status)) {
      return NextResponse.json({ success: false, error: 'Invalid status' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (typeof body.cardText === 'string') updates.card_text = body.cardText;
    if (body.status) {
      updates.status = body.status;
      if (body.status === 'active') {
        updates.approved_by = user?.id ?? null;
        updates.approved_at = new Date().toISOString();
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: 'No updates provided' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // If cardText is being modified, snapshot the prior row into
    // previous_* columns first — same pattern as the generate endpoint.
    // Status-only changes do NOT snapshot (an Approve click shouldn't
    // wipe the diff history that the engineer is approving against).
    if (typeof body.cardText === 'string') {
      const { data: priorRow } = await supabase
        .from('atlas_family_domain_cards')
        .select('card_text, updated_at, audit_results')
        .eq('family_id', familyId)
        .maybeSingle();
      if (priorRow && priorRow.card_text !== body.cardText) {
        updates.previous_card_text = priorRow.card_text;
        updates.previous_updated_at = priorRow.updated_at;
        updates.previous_audit_results = priorRow.audit_results;
      }
    }

    const { data, error } = await supabase
      .from('atlas_family_domain_cards')
      .update(updates)
      .eq('family_id', familyId)
      .select()
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json(
        { success: false, error: error?.message ?? 'No row to update — generate first' },
        { status: error ? 500 : 404 },
      );
    }

    invalidateDomainCardCache();

    // NOTE: we used to also invalidateSuggestCacheForFamily here when the
    // card transitioned to active. That made stale rows silently revert to
    // a "Generate" button, leaving the engineer with no visible signal of
    // what changed. The Triage page now reads schema/card versions stored
    // IN the cached suggestion value and renders proactive staleness UI
    // (left-border stripe + receded verdict chip + ↻ refresh icon + header
    // banner with stale counts). Approve no longer wipes the cache.

    // On status transition to 'active', clear all atlas_ai_context_flags
    // for this family older than approved_at. Those flags are Sonnet
    // self-complaints about the OLD card's content gaps; by approving a
    // new card, the engineer asserts those gaps are now addressed. Without
    // this, the health chip lingers red for ~30 days even after a dense
    // regenerated card lands (the only clearance mechanism was the rolling
    // 30-day window). Fire-and-forget — flag cleanup failure doesn't block
    // the approve action.
    if (body.status === 'active' && data.approved_at) {
      const approvedAt = data.approved_at as string;
      void (async () => {
        try {
          await supabase
            .from('atlas_ai_context_flags')
            .delete()
            .eq('family_id', familyId)
            .lt('flagged_at', approvedAt);
        } catch {
          // Flag cleanup is advisory — never block the approve response.
        }
      })();
    }

    return NextResponse.json({ success: true, card: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ familyId: string }> },
): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const { familyId } = await params;
    if (!isValidFamilyId(familyId)) {
      return NextResponse.json({ success: false, error: 'Invalid familyId' }, { status: 400 });
    }

    // Soft delete = archive. Keeps the row + audit history; just removes it
    // from the active set that gets injected into prompts.
    const supabase = createServiceClient();
    const { error } = await supabase
      .from('atlas_family_domain_cards')
      .update({ status: 'archived' })
      .eq('family_id', familyId);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    invalidateDomainCardCache();
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
