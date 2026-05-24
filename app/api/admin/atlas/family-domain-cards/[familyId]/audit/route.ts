/**
 * POST /api/admin/atlas/family-domain-cards/[familyId]/audit
 *
 * Manual re-run of the domain-card audit (Decision #195 Phase 2, Piece 5).
 * Reads the current card_text from DB (or TS fallback), runs
 * auditFamilyDomainCard, persists results onto the DB row if one exists,
 * and returns the result.
 *
 * Built-in (TS-fallback) cards have no DB row to write to — we still run
 * the audit and return results so the engineer can see them, but the
 * result isn't persisted. To get a persistent audit on a built-in card,
 * the engineer must Customize the card first.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import { logicTableRegistry } from '@/lib/logicTables';
import {
  ATLAS_FAMILY_DOMAIN_CARDS,
  invalidateDomainCardCache,
} from '@/lib/services/atlasFamilyDomainCards';
import { auditFamilyDomainCard } from '@/lib/services/atlasFamilyCardAudit';

export const dynamic = 'force-dynamic';

function isValidFamilyId(familyId: string): boolean {
  return familyId in logicTableRegistry;
}

export async function POST(
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

    const supabase = createServiceClient();

    // Prefer the DB row if it exists — that's the live card. Fall back to
    // the TS constant for the 7 hand-written initial cards.
    const { data: dbRow } = await supabase
      .from('atlas_family_domain_cards')
      .select('card_text')
      .eq('family_id', familyId)
      .maybeSingle();

    const cardText: string | null =
      (dbRow?.card_text as string | undefined) ?? ATLAS_FAMILY_DOMAIN_CARDS[familyId] ?? null;

    if (!cardText) {
      return NextResponse.json(
        { success: false, error: 'No card to audit — generate one first' },
        { status: 404 },
      );
    }

    const auditResults = await auditFamilyDomainCard(familyId, cardText);

    // Persist onto the DB row when one exists. Built-in cards return the
    // result without persistence — the response payload still carries
    // auditResults so the engineer sees them inline.
    let persisted = false;
    if (dbRow) {
      const { error: updateError } = await supabase
        .from('atlas_family_domain_cards')
        .update({ audit_results: auditResults })
        .eq('family_id', familyId);
      if (!updateError) {
        persisted = true;
        invalidateDomainCardCache();
      }
    }

    return NextResponse.json({ success: true, auditResults, persisted });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
