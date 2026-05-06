import { NextRequest, NextResponse } from 'next/server';
import { OrchestratorMessage, PartAttributes, SearchResult, XrefRecommendation } from '@/lib/types';
import { chat } from '@/lib/services/llmOrchestrator';
import { requireAuth } from '@/lib/supabase/auth-guard';
import { runWithServiceTracking, reportServiceFailure, getServiceWarnings } from '@/lib/services/serviceStatusTracker';
import { fetchUserPreferences } from '@/lib/services/userPreferencesService';

interface ChatRequestBody {
  messages: OrchestratorMessage[];
  recommendations?: XrefRecommendation[];
  searchResult?: SearchResult;
  /** Source-part attributes for the resolved part on screen — drives the
   *  "Source Part" ground-truth block injected into the LLM context so
   *  follow-up turns can answer distributor / supplier / lifecycle /
   *  compliance questions without fabricating data. */
  sourceAttributes?: PartAttributes;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return runWithServiceTracking(async () => {
    try {
      const { user, error: authError } = await requireAuth();
      if (authError) return authError;

      const body: ChatRequestBody = await request.json();

      if (!body.messages || body.messages.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Messages are required' },
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

      const locale = (user?.user_metadata?.language as string) ?? 'en';
      const prefs = await fetchUserPreferences(user!.id);
      const userName = (user?.user_metadata?.full_name as string) ?? undefined;
      const response = await chat(body.messages, apiKey, body.recommendations, user?.id, locale, prefs, userName, body.searchResult, body.sourceAttributes);

      const warnings = getServiceWarnings();
      return NextResponse.json({
        success: true,
        data: response,
        ...(warnings.length > 0 && { serviceWarnings: warnings }),
      });
    } catch (error) {
      console.error('Chat API error:', error);
      reportServiceFailure('anthropic', 'unavailable', 'Chat request failed');
      const warnings = getServiceWarnings();
      return NextResponse.json(
        { success: false, error: 'Internal server error', serviceWarnings: warnings },
        { status: 500 }
      );
    }
  }) as Promise<NextResponse>;
}
