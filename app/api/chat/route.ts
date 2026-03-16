import { NextRequest, NextResponse } from 'next/server';
import { OrchestratorMessage, XrefRecommendation } from '@/lib/types';
import { chat } from '@/lib/services/llmOrchestrator';
import { requireAuth } from '@/lib/supabase/auth-guard';
import { runWithServiceTracking, reportServiceFailure, getServiceWarnings } from '@/lib/services/serviceStatusTracker';

interface ChatRequestBody {
  messages: OrchestratorMessage[];
  recommendations?: XrefRecommendation[];
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
      const response = await chat(body.messages, apiKey, body.recommendations, user?.id, locale);

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
