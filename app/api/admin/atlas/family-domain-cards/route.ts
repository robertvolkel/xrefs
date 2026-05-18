/**
 * GET /api/admin/atlas/family-domain-cards
 *
 * Lists every L3 family ID with its current domain-card status:
 *   - source: 'db' (an atlas_family_domain_cards row exists, any status)
 *             'ts' (no DB row; the hand-written TS fallback applies)
 *             'none' (no card anywhere — this family is uncovered)
 *   - status: 'draft' | 'active' | 'archived' | null
 *   - cardText: full content (truncated client-side if needed)
 *   - updatedAt / modelUsed: for DB rows only
 *
 * Powers the Domain Cards admin panel where engineers see at a glance
 * which families have AI-context coverage and which don't.
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { logicTableRegistry, getLogicTable } from '@/lib/logicTables';
import {
  ATLAS_FAMILY_DOMAIN_CARDS,
  listAllDomainCardRows,
  fetchFlagCountsByFamily,
  computeDomainCardHealth,
  type DomainCardListEntry,
} from '@/lib/services/atlasFamilyDomainCards';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    // Batch the slow reads in parallel — both queries take ~50-200ms.
    const [dbRows, flagCounts] = await Promise.all([
      listAllDomainCardRows(),
      fetchFlagCountsByFamily(30),
    ]);

    // Build entries for every L3 family — even those with no card — so the
    // admin can see "B7: needs a card" at a glance.
    const familyIds = Object.keys(logicTableRegistry);

    const entries: Array<DomainCardListEntry & { familyName: string }> = familyIds.map((familyId) => {
      const table = getLogicTable(familyId);
      const familyName = table?.familyName ?? familyId;
      const currentRuleCount = table?.rules.length ?? 0;
      const flagCount = flagCounts.get(familyId) ?? 0;

      const dbRow = dbRows.get(familyId);
      if (dbRow) {
        const health = computeDomainCardHealth({
          source: 'db',
          status: dbRow.status,
          dataSnapshot: dbRow.dataSnapshot,
          currentRuleCount,
          flagCount,
        });
        return {
          familyId,
          familyName,
          source: 'db' as const,
          status: dbRow.status,
          cardText: dbRow.cardText,
          modelUsed: dbRow.modelUsed,
          updatedAt: dbRow.updatedAt,
          dataSnapshot: dbRow.dataSnapshot,
          health,
        };
      }

      const tsCard = ATLAS_FAMILY_DOMAIN_CARDS[familyId];
      if (tsCard) {
        const health = computeDomainCardHealth({
          source: 'ts',
          status: 'active',
          dataSnapshot: null,
          currentRuleCount,
          flagCount,
        });
        return {
          familyId,
          familyName,
          source: 'ts' as const,
          // Built-in cards are treated as "active" since they're injected
          // into prompts. They have no updatedAt because they live in code.
          status: 'active' as const,
          cardText: tsCard,
          modelUsed: null,
          updatedAt: null,
          dataSnapshot: null,
          health,
        };
      }

      const health = computeDomainCardHealth({
        source: 'none',
        status: null,
        dataSnapshot: null,
        currentRuleCount,
        flagCount,
      });
      return {
        familyId,
        familyName,
        source: 'none' as const,
        status: null,
        cardText: null,
        modelUsed: null,
        updatedAt: null,
        dataSnapshot: null,
        health,
      };
    });

    // Sort by health priority — most urgent first. Within tier, sort
    // alphabetically by familyId so order is stable across reloads.
    const healthRank: Record<string, number> = {
      'refresh-recommended': 0,
      'no-card': 1,
      'consider-refresh': 2,
      'no-data': 3,
      'ok': 4,
    };
    entries.sort((a, b) => {
      const ra = healthRank[a.health.level] ?? 99;
      const rb = healthRank[b.health.level] ?? 99;
      if (ra !== rb) return ra - rb;
      // Within "no-card", surface drafts before "none-and-no-draft" so
      // half-done generations don't get buried at the bottom.
      if (a.health.level === b.health.level && a.status !== b.status) {
        if (a.status === 'draft') return -1;
        if (b.status === 'draft') return 1;
      }
      return a.familyId.localeCompare(b.familyId);
    });

    return NextResponse.json({ success: true, entries });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
