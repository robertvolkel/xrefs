import { NextRequest, NextResponse } from 'next/server';
import { OrchestratorMessage, XrefRecommendation } from '@/lib/types';
import { chat } from '@/lib/services/llmOrchestrator';
import { requireAuth } from '@/lib/supabase/auth-guard';

interface ChatRequestBody {
  messages: OrchestratorMessage[];
  recommendations?: XrefRecommendation[];
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAuth();
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
      return NextResponse.json(
        { success: false, error: 'ANTHROPIC_API_KEY not configured' },
        { status: 500 }
      );
    }

    const response = await chat(body.messages, apiKey, body.recommendations);

    return NextResponse.json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
