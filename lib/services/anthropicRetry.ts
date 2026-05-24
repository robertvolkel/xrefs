/**
 * Retry wrapper for Anthropic SDK calls. Handles transient 529 (overloaded)
 * and 429 (rate-limited) responses with exponential backoff. Anthropic's
 * docs explicitly recommend this pattern — overloads typically clear in
 * 1-4 seconds. Without this wrapper, a single bad moment of Anthropic
 * capacity surfaces as a hard error to the engineer/user.
 *
 * What this does NOT do: retry 4xx errors other than 429 (those are bugs
 * or auth issues, retry won't help) or 5xx errors other than 529 (those
 * indicate something genuinely wrong, escalate).
 *
 * Usage:
 *   const response = await withAnthropicRetry(() =>
 *     client.messages.create({ ... })
 *   );
 *
 * First use sites (May 2026): generate + fix-issues card routes. Apply
 * to any future Anthropic call site where transient overload should be
 * absorbed transparently.
 */

interface RetryOptions {
  /** Max attempts including the first. Default 4 → 1 initial + 3 retries. */
  maxAttempts?: number;
  /** Initial backoff in ms. Default 1000 — doubles each retry. */
  initialDelayMs?: number;
  /** Optional label for log output. */
  label?: string;
}

/** Status codes we treat as transient and worth retrying. */
const RETRYABLE_STATUS_CODES = new Set([429, 529]);

/** Best-effort extraction of HTTP status from an Anthropic SDK error.
 *  The SDK exposes `.status` on its APIError class; we also handle raw
 *  fetch-style errors with a `.status` numeric. */
function extractStatus(err: unknown): number | null {
  if (typeof err !== 'object' || err === null) return null;
  const maybeStatus = (err as { status?: unknown }).status;
  if (typeof maybeStatus === 'number') return maybeStatus;
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withAnthropicRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 4;
  const initialDelayMs = opts.initialDelayMs ?? 1000;
  const label = opts.label ?? 'anthropic call';

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const status = extractStatus(err);
      const isRetryable = status !== null && RETRYABLE_STATUS_CODES.has(status);
      const hasMoreAttempts = attempt < maxAttempts;
      if (!isRetryable || !hasMoreAttempts) throw err;
      // Exponential backoff: 1s, 2s, 4s for 3 retries.
      const delay = initialDelayMs * Math.pow(2, attempt - 1);
      // Lightweight log — useful in dev to see retries happening.
      // eslint-disable-next-line no-console
      console.warn(`[${label}] ${status} on attempt ${attempt}/${maxAttempts}, retrying in ${delay}ms`);
      await sleep(delay);
    }
  }
  // Unreachable in practice — loop either returns or throws — but TS
  // can't prove it.
  throw lastError;
}
