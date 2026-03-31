import { NextRequest, NextResponse } from 'next/server';
import { OrchestratorMessage, ListAgentContext } from '@/lib/types';
import { listChat } from '@/lib/services/llmOrchestrator';
import { requireAuth } from '@/lib/supabase/auth-guard';
import { runWithServiceTracking, reportServiceFailure, getServiceWarnings } from '@/lib/services/serviceStatusTracker';
import { fetchUserPreferences } from '@/lib/services/userPreferencesService';
import { createClient } from '@/lib/supabase/server';
import { StoredRow } from '@/lib/partsListStorage';

interface ListChatRequestBody {
  messages: OrchestratorMessage[];
  listContext: ListAgentContext;
  listId: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return runWithServiceTracking(async () => {
    try {
      const { user, error: authError } = await requireAuth();
      if (authError) return authError;

      const body: ListChatRequestBody = await request.json();

      if (!body.messages || body.messages.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Messages are required' },
          { status: 400 }
        );
      }
      if (!body.listId) {
        return NextResponse.json(
          { success: false, error: 'listId is required' },
          { status: 400 }
        );
      }

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        reportServiceFailure('anthropic', 'unavailable', 'API key not configured');
        const warnings = getServiceWarnings();
        return NextResponse.json(
          { success: false, error: 'ANTHROPIC_API_KEY not configured', serviceWarnings: warnings },
          { status: 500 }
        );
      }

      // Load list rows from Supabase (server-side only — never sent to Claude in bulk)
      const supabase = await createClient();
      const { data: listData, error: listError } = await supabase
        .from('parts_lists')
        .select('rows')
        .eq('id', body.listId)
        .eq('user_id', user!.id)
        .single();

      if (listError || !listData) {
        return NextResponse.json(
          { success: false, error: 'List not found or access denied' },
          { status: 404 }
        );
      }

      const rows = (listData.rows as StoredRow[]) ?? [];

      const locale = (user?.user_metadata?.language as string) ?? 'en';
      const prefs = await fetchUserPreferences(user!.id);
      const userName = (user?.user_metadata?.full_name as string) ?? undefined;

      const response = await listChat(
        body.messages,
        apiKey,
        body.listContext,
        rows,
        user?.id,
        locale,
        prefs,
        userName,
      );

      const warnings = getServiceWarnings();
      return NextResponse.json({
        success: true,
        data: response,
        ...(warnings.length > 0 && { serviceWarnings: warnings }),
      });
    } catch (error) {
      console.error('List chat API error:', error);
      reportServiceFailure('anthropic', 'unavailable', 'List chat request failed');
      const warnings = getServiceWarnings();
      return NextResponse.json(
        { success: false, error: 'Internal server error', serviceWarnings: warnings },
        { status: 500 }
      );
    }
  }) as Promise<NextResponse>;
}
