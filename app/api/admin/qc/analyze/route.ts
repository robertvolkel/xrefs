import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { aggregateQcStats } from '@/lib/services/qcAnalyzer';
import type { QcAnalysisEvent } from '@/lib/types';

const MODEL = 'claude-sonnet-4-5-20250929';

const ANALYSIS_SYSTEM_PROMPT = `You are a QC analyst for an electronic component cross-reference engine. The engine recommends replacement parts by evaluating candidates against family-specific matching rules.

You are given aggregated statistics from recommendation logs. Your job is to identify quality issues and provide actionable insights.

Analyze the data and structure your response with these sections:

## Summary
A brief overview of the dataset and key findings (2-3 sentences).

## Rule Quality Issues
Identify rules with high failure rates. For each, explain whether the failure is:
- **Logic table issue**: Rule is too strict or incorrectly configured
- **Parameter mapping gap**: Digikey data isn't being mapped correctly to this attribute
- **Expected behavior**: Rule is working correctly and failures represent genuine mismatches
Consider the rule weight — high-weight rule failures are more impactful.

## Parameter Mapping Gaps
Identify attributes frequently missing from replacement data. High missing rates suggest the Digikey-to-internal parameter mapping is incomplete for that family.

## Family-Specific Patterns
Note families with unusually low match percentages, high fail rates, or concerning score distributions. Flag bimodal distributions (many high AND many low scores) which may indicate inconsistent search results.

## Feedback Correlation
If user feedback data is present, correlate reported issues with rule failure patterns. High feedback on specific rules validates that users are encountering the same problems the data shows.

## Recommendations
Provide 3-5 specific, actionable recommendations ranked by expected impact. Reference actual attribute names, family names, and percentages.

Be concise and specific. Use actual numbers from the data. Do not speculate beyond what the data supports.`;

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'ANTHROPIC_API_KEY not configured' },
        { status: 500 },
      );
    }

    const body = await request.json();
    const { days, requestSource, familyId, hasFeedback, search } = body;

    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    const sendEvent = async (event: QcAnalysisEvent) => {
      await writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    };

    // Run aggregation + Claude streaming in background
    (async () => {
      try {
        await sendEvent({ type: 'progress', message: 'Querying recommendation logs...' });

        const stats = await aggregateQcStats({
          days: days ?? 30,
          requestSource,
          familyId,
          hasFeedback,
          search,
        });

        if (stats.totalLogs === 0) {
          await sendEvent({ type: 'error', message: 'No log data found for the selected filters.' });
          await writer.close();
          return;
        }

        await sendEvent({
          type: 'progress',
          message: `Aggregated ${stats.totalLogs} logs across ${stats.families.length} families. Sending to AI...`,
        });

        const client = new Anthropic({ apiKey });
        const dataPayload = JSON.stringify(stats, null, 2);

        const messageStream = client.messages.stream({
          model: MODEL,
          max_tokens: 4096,
          system: ANALYSIS_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: `Here is the aggregated QC data:\n\n${dataPayload}` }],
        });

        let fullContent = '';

        messageStream.on('text', async (textDelta) => {
          fullContent += textDelta;
          await sendEvent({ type: 'chunk', content: textDelta });
        });

        // Wait for the stream to complete
        await messageStream.finalMessage();

        await sendEvent({ type: 'complete', fullContent });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Analysis failed';
        console.error('QC analysis error:', error);
        await sendEvent({ type: 'error', message });
      } finally {
        await writer.close();
      }
    })();

    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('QC analyze API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
