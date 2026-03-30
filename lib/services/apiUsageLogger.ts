/**
 * API Usage Logger — Logs external API calls to Supabase for cost tracking.
 *
 * Two convenience functions:
 *   - logTokenUsage() — Claude API calls (tokens + cost)
 *   - logApiCall()     — Digikey / Mouser / parts.io (call counts only)
 *
 * Uses service role client for inserts (bypasses RLS).
 * Errors are caught and logged — never fails the parent request.
 */

import { createServiceClient } from '@/lib/supabase/service';
import { estimateCost, normalizeModelName } from '@/lib/constants/apiPricing';

export type ApiService = 'anthropic' | 'digikey' | 'mouser' | 'partsio';

export type ApiOperation =
  | 'chat'
  | 'refinement_chat'
  | 'profile_extract'
  | 'qc_analysis'
  | 'keyword_search'
  | 'product_details'
  | 'batch_search'
  | 'gap_fill';

interface LogTokenUsageParams {
  userId: string;
  model: string;           // 'sonnet-4.5' | 'haiku-4.5'
  operation: ApiOperation;
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  llmCalls?: number;       // Number of API calls in tool-use loop
  metadata?: Record<string, unknown>;
}

interface LogApiCallParams {
  userId: string;
  service: 'digikey' | 'mouser' | 'partsio';
  operation: ApiOperation;
  requestCount?: number;   // For batched calls
  metadata?: Record<string, unknown>;
}

/** Log a Claude API call with token counts and estimated cost. */
export async function logTokenUsage(params: LogTokenUsageParams): Promise<void> {
  try {
    const normalizedModel = normalizeModelName(params.model);
    const cost = estimateCost(params.model, params.inputTokens, params.outputTokens);
    const client = createServiceClient();

    const { error } = await client.from('api_usage_log').insert({
      user_id: params.userId,
      service: 'anthropic' as ApiService,
      model: normalizedModel,
      operation: params.operation,
      input_tokens: params.inputTokens,
      output_tokens: params.outputTokens,
      cached_tokens: params.cachedTokens ?? 0,
      llm_calls: params.llmCalls ?? 1,
      estimated_cost_usd: cost,
      metadata: params.metadata ?? null,
    });

    if (error) {
      console.warn('[apiUsage] Token log insert failed:', error.message);
    }
  } catch (err) {
    console.warn('[apiUsage] Token log error:', err);
  }
}

/** Log a non-Claude API call (Digikey, Mouser, parts.io) — call count only. */
export async function logApiCall(params: LogApiCallParams): Promise<void> {
  try {
    const client = createServiceClient();

    const { error } = await client.from('api_usage_log').insert({
      user_id: params.userId,
      service: params.service,
      model: null,
      operation: params.operation,
      input_tokens: null,
      output_tokens: null,
      request_count: params.requestCount ?? 1,
      estimated_cost_usd: null,
      metadata: params.metadata ?? null,
    });

    if (error) {
      console.warn('[apiUsage] API call log insert failed:', error.message);
    }
  } catch (err) {
    console.warn('[apiUsage] API call log error:', err);
  }
}
