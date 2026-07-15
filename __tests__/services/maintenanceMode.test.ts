import { isOutOfCreditsError } from '@/lib/services/maintenanceMode';

// ============================================================
// isOutOfCreditsError — the safety linchpin.
//
// Maintenance mode has NO manual switch, so this classifier is the only thing
// standing between an ordinary API hiccup and the whole app going dark. It must
// fire ONLY on the genuine out-of-credits signature.
//
// A naive `status >= 400` implementation would pass the "credit" cases but FAIL
// every transient case below (rate limit, overloaded, generic 400, 500) — which
// is exactly the point of these tests.
// ============================================================

describe('isOutOfCreditsError', () => {
  it('returns true for the real out-of-credits error (400 invalid_request_error + credit-balance message)', () => {
    const err = {
      status: 400,
      type: 'invalid_request_error',
      message:
        'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.',
    };
    expect(isOutOfCreditsError(err)).toBe(true);
  });

  it('returns true for a 403 billing_error (regardless of message)', () => {
    const err = { status: 403, type: 'billing_error', message: 'billing problem' };
    expect(isOutOfCreditsError(err)).toBe(true);
  });

  it('returns true when the type/message live under a nested `error` object', () => {
    const err = {
      status: 400,
      error: { type: 'invalid_request_error', message: 'Your credit balance is too low.' },
    };
    expect(isOutOfCreditsError(err)).toBe(true);
  });

  it('returns FALSE for a 429 rate limit (transient — must not black out the app)', () => {
    const err = { status: 429, type: 'rate_limit_error', message: 'rate limit exceeded' };
    expect(isOutOfCreditsError(err)).toBe(false);
  });

  it('returns FALSE for a 529 overloaded error (transient)', () => {
    const err = { status: 529, type: 'overloaded_error', message: 'overloaded' };
    expect(isOutOfCreditsError(err)).toBe(false);
  });

  it('returns FALSE for a generic 400 (bad request that is NOT a credit problem)', () => {
    const err = {
      status: 400,
      type: 'invalid_request_error',
      message: 'messages: roles must alternate between "user" and "assistant"',
    };
    expect(isOutOfCreditsError(err)).toBe(false);
  });

  it('returns FALSE for a 500 server error', () => {
    const err = { status: 500, type: 'api_error', message: 'internal server error' };
    expect(isOutOfCreditsError(err)).toBe(false);
  });

  it('returns FALSE for a network/connection error with no status', () => {
    expect(isOutOfCreditsError(new Error('fetch failed'))).toBe(false);
  });

  it('returns FALSE for null / undefined / non-object inputs', () => {
    expect(isOutOfCreditsError(null)).toBe(false);
    expect(isOutOfCreditsError(undefined)).toBe(false);
    expect(isOutOfCreditsError('credit balance too low')).toBe(false);
  });
});
