import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';
import { resolveAdminNames } from '@/lib/services/overrideHistoryHelper';
import { getLogicTable } from '@/lib/logicTables';
import { mapRowToRecord } from '@/app/api/admin/overrides/rules/route';
import { RuleOverrideHistoryEntry, MatchingRule } from '@/lib/types';

/**
 * GET /api/admin/overrides/rules/history?family_id=X&attribute_id=Y
 *
 * Returns the full audit trail for a specific rule — all override records
 * (active + inactive) plus the TS base rule for reference.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const url = new URL(request.url);
    const familyId = url.searchParams.get('family_id');
    const attributeId = url.searchParams.get('attribute_id');

    if (!familyId || !attributeId) {
      return NextResponse.json(
        { success: false, error: 'family_id and attribute_id are required' },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    // Fetch ALL records (active + inactive) for this family+attribute
    const { data, error } = await supabase
      .from('rule_overrides')
      .select('*')
      .eq('family_id', familyId)
      .eq('attribute_id', attributeId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Rule override history query error:', error.message);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch history' },
        { status: 500 },
      );
    }

    const rows = data ?? [];
    const records = rows.map(mapRowToRecord);

    // Resolve admin names
    const userIds = records.map(r => r.createdBy);
    const nameMap = await resolveAdminNames(userIds);

    const history: RuleOverrideHistoryEntry[] = records.map(r => ({
      ...r,
      createdByName: nameMap.get(r.createdBy) ?? 'Unknown',
    }));

    // Include TS base rule for reference
    let baseRule: MatchingRule | null = null;
    const table = getLogicTable(familyId);
    if (table) {
      baseRule = table.rules.find(r => r.attributeId === attributeId) ?? null;
    }

    return NextResponse.json({
      success: true,
      data: { baseRule, history },
    });
  } catch (error) {
    console.error('Rule override history GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
