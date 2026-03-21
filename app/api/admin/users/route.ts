import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

export async function GET() {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const supabase = await createClient();

    // Get all profiles
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, disabled, created_at')
      .order('created_at', { ascending: true });

    if (profilesError) {
      return NextResponse.json(
        { success: false, error: profilesError.message },
        { status: 500 },
      );
    }

    // Use service client to bypass RLS for cross-user stats queries
    // Gracefully degrade if service role key is not configured
    let serviceClient: ReturnType<typeof createServiceClient> | null = null;
    try {
      serviceClient = createServiceClient();
    } catch {
      // SUPABASE_SERVICE_ROLE_KEY not set — stats will be zeros
    }

    // Get activity stats from search_history (aggregated per user)
    const activityMap = new Map<string, { search_count: number; last_active: string }>();
    const listsMap = new Map<string, number>();
    const tokensMap = new Map<string, number>();
    const costMap = new Map<string, number>();
    const dkCallsMap = new Map<string, number>();
    const mouserCallsMap = new Map<string, number>();

    if (serviceClient) {
      const { data: stats } = await serviceClient
        .from('search_history')
        .select('user_id, created_at');

      for (const row of stats ?? []) {
        const existing = activityMap.get(row.user_id);
        if (!existing) {
          activityMap.set(row.user_id, {
            search_count: 1,
            last_active: row.created_at,
          });
        } else {
          existing.search_count += 1;
          if (row.created_at > existing.last_active) {
            existing.last_active = row.created_at;
          }
        }
      }

      // Get list counts per user from parts_lists
      const { data: lists } = await serviceClient
        .from('parts_lists')
        .select('user_id');

      for (const row of lists ?? []) {
        listsMap.set(row.user_id, (listsMap.get(row.user_id) ?? 0) + 1);
      }

      // Get API usage stats per user from api_usage_log (table may not exist yet)
      const { data: usageRows } = await serviceClient
        .from('api_usage_log')
        .select('user_id, service, input_tokens, output_tokens, request_count, estimated_cost_usd');

      for (const row of usageRows ?? []) {
        const uid = row.user_id;
        if (row.service === 'anthropic') {
          tokensMap.set(uid, (tokensMap.get(uid) ?? 0) + (row.input_tokens ?? 0) + (row.output_tokens ?? 0));
          costMap.set(uid, (costMap.get(uid) ?? 0) + (Number(row.estimated_cost_usd) || 0));
        }
        const count = row.request_count ?? 1;
        if (row.service === 'digikey') {
          dkCallsMap.set(uid, (dkCallsMap.get(uid) ?? 0) + count);
        } else if (row.service === 'mouser') {
          mouserCallsMap.set(uid, (mouserCallsMap.get(uid) ?? 0) + count);
        }
      }
    }

    // Merge profiles with activity stats
    const users = (profiles ?? []).map((p) => {
      const activity = activityMap.get(p.id);
      return {
        ...p,
        search_count: activity?.search_count ?? 0,
        list_count: listsMap.get(p.id) ?? 0,
        last_active: activity?.last_active ?? null,
        total_tokens: tokensMap.get(p.id) ?? 0,
        estimated_cost: costMap.get(p.id) ?? 0,
        dk_calls: dkCallsMap.get(p.id) ?? 0,
        mouser_calls: mouserCallsMap.get(p.id) ?? 0,
      };
    });

    return NextResponse.json({ success: true, data: users });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
