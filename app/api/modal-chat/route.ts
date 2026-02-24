import { NextRequest, NextResponse } from 'next/server';
import { ApplicationContext, OrchestratorMessage, XrefRecommendation } from '@/lib/types';
import { refinementChat } from '@/lib/services/llmOrchestrator';
import { requireAuth } from '@/lib/supabase/auth-guard';

interface ModalChatRequestBody {
  messages: OrchestratorMessage[];
  mpn: string;
  overrides?: Record<string, string>;
  applicationContext?: ApplicationContext;
  recommendations?: XrefRecommendation[];
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { user, error: authError } = await requireAuth();
    if (authError) return authError;

    const body: ModalChatRequestBody = await request.json();

    if (!body.messages || body.messages.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Messages are required' },
        { status: 400 }
      );
    }
    if (!body.mpn) {
      return NextResponse.json(
        { success: false, error: 'MPN is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'ANTHROPIC_API_KEY not configured' },
        { status: 500 }
      );
    }

    const response = await refinementChat(
      body.messages,
      body.mpn,
      body.overrides ?? {},
      body.applicationContext,
      apiKey,
      body.recommendations,
      user?.id,
    );

    return NextResponse.json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error('Modal chat API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
