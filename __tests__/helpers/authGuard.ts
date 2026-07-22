/**
 * authGuard — mock factories for `requireAdmin` / `requireAuth`.
 *
 * No precedent existed: zero tests in this repo mention requireAdmin, because
 * zero tests execute a route handler. The contract is small — every admin
 * route does `const { user, error } = await requireAdmin(); if (error) return error;`
 * — so the mock only has to return that shape.
 *
 * Usage (the factory is lazy, so `require` inside it dodges jest hoisting):
 *   jest.mock('@/lib/supabase/auth-guard', () => require('../helpers/authGuard').adminGuard());
 */

import { NextResponse } from 'next/server';

export const TEST_ADMIN_ID = 'admin-1';

/** Signed-in admin. */
export function adminGuard(userId: string = TEST_ADMIN_ID) {
  return {
    requireAdmin: jest.fn(async () => ({ user: { id: userId }, error: null })),
    requireAuth: jest.fn(async () => ({ user: { id: userId }, error: null })),
  };
}

/**
 * Not an admin. Every route suite gets one case using this — it pins that no
 * handler does work before the guard, which is the only thing standing between
 * a non-admin and the mapping tables.
 */
export function forbiddenGuard() {
  return {
    requireAdmin: jest.fn(async () => ({
      user: null,
      error: NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }),
    })),
    requireAuth: jest.fn(async () => ({
      user: null,
      error: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }),
    })),
  };
}
