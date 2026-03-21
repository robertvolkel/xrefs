/**
 * Claude API pricing constants.
 * Used to pre-calculate estimated_cost_usd at log time.
 */
export const CLAUDE_PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  'sonnet-4.5': { inputPer1M: 3.00, outputPer1M: 15.00 },
  'haiku-4.5': { inputPer1M: 0.80, outputPer1M: 4.00 },
};

/**
 * Normalize a full model ID (e.g., 'claude-sonnet-4-5-20250929') to a pricing key ('sonnet-4.5').
 * Returns the original string if no match is found.
 */
export function normalizeModelName(model: string): string {
  if (model.includes('sonnet')) return 'sonnet-4.5';
  if (model.includes('haiku')) return 'haiku-4.5';
  if (model.includes('opus')) return 'opus-4';
  return model;
}

/** Calculate estimated cost from token counts and model (accepts full model ID or short name). */
export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const key = normalizeModelName(model);
  const pricing = CLAUDE_PRICING[key];
  if (!pricing) return 0;
  return (inputTokens / 1_000_000) * pricing.inputPer1M
    + (outputTokens / 1_000_000) * pricing.outputPer1M;
}
