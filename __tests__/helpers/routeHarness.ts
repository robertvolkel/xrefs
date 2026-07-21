/**
 * routeHarness — invoke a Next.js App Router handler directly in jest.
 *
 * No new dependencies and no jsdom. Verified by running it: NextResponse.json()
 * round-trips status and body under `testEnvironment: 'node'`, and the handlers
 * in scope only ever touch `request.json()`, `request.nextUrl.searchParams` and
 * an awaited `params` promise — so a structurally-typed stand-in is enough. A
 * real NextRequest would drag in edge-runtime plumbing for no benefit.
 */

import type { NextRequest } from 'next/server';

export interface InvokeOptions {
  body?: unknown;
  searchParams?: Record<string, string>;
  /** Dynamic route segment values, e.g. { overrideId: 'ov-1' }. */
  params?: Record<string, string>;
  method?: string;
}

export interface InvokeResult<T = Record<string, unknown>> {
  status: number;
  json: T;
}

/**
 * Generic over the params shape: routes declare their own
 * (`{ params: Promise<{ overrideId: string }> }`), and a fixed
 * `Record<string,string>` would reject every one of them.
 */
type Handler<P extends Record<string, string>> = (
  req: NextRequest,
  ctx: { params: Promise<P> },
) => Promise<Response>;

export async function invokeRoute<
  T = Record<string, unknown>,
  P extends Record<string, string> = Record<string, string>,
>(handler: Handler<P>, opts: InvokeOptions = {}): Promise<InvokeResult<T>> {
  const qs = new URLSearchParams(opts.searchParams ?? {}).toString();
  const url = `http://localhost/api/test${qs ? `?${qs}` : ''}`;

  const request = {
    method: opts.method ?? 'POST',
    url,
    nextUrl: new URL(url),
    headers: new Headers({ 'Content-Type': 'application/json' }),
    // Routes call this unconditionally on write verbs; some wrap it in
    // .catch(() => null), which a rejecting promise must still satisfy.
    json: async () => {
      if (opts.body === undefined) throw new SyntaxError('Unexpected end of JSON input');
      return opts.body;
    },
  } as unknown as NextRequest;

  // Next 16 hands dynamic params as a promise; every handler in scope awaits it.
  const ctx = { params: Promise.resolve((opts.params ?? {}) as P) };

  const res = await handler(request, ctx);
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json: json as T };
}
