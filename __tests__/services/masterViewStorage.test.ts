/**
 * Pins the error->{ok:false} mapping in fetchMasterViews.
 *
 * This is the function that CONTAINED the duplicate-starter-views bug: it used
 * to swallow a failed read into `[]`, which the seeding path could not tell
 * apart from an empty account. decideSeedAction's unit tests construct
 * `{ok:false}` by hand and would stay green if this mapping regressed, so the
 * mapping needs its own test.
 *
 * jest.mock paths must be RELATIVE — the `@/` alias resolves for `import` but
 * not inside jest.mock.
 */

const mockGetUser = jest.fn();
const mockSelect = jest.fn();

jest.mock('../../lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    from: () => ({
      select: () => ({
        order: () => ({
          order: mockSelect,
        }),
      }),
    }),
  }),
}));

import { fetchMasterViews, getCurrentUserId } from '@/lib/supabaseMasterViewStorage';

const ROW = {
  id: 'v1',
  name: 'Basic View',
  columns: ['sys:status'],
  description: '',
  column_meta: null,
  calculated_fields: null,
  is_default: true,
  sort_order: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('fetchMasterViews', () => {
  it('reports a Supabase error as a FAILED read, not an empty account', async () => {
    mockSelect.mockResolvedValue({ data: null, error: { message: 'boom' } });

    const result = await fetchMasterViews();

    expect(result.ok).toBe(false);
    // The specific regression: it must not present as a readable empty account.
    expect(result).not.toEqual({ ok: true, views: [] });
  });

  it('reports a thrown error as a FAILED read', async () => {
    mockSelect.mockRejectedValue(new Error('network down'));

    expect(await fetchMasterViews()).toEqual({ ok: false });
  });

  it('reports a genuinely empty account as a SUCCESSFUL empty read', async () => {
    mockSelect.mockResolvedValue({ data: [], error: null });

    expect(await fetchMasterViews()).toEqual({ ok: true, views: [] });
  });

  it('maps rows on a successful read', async () => {
    mockSelect.mockResolvedValue({ data: [ROW], error: null });

    const result = await fetchMasterViews();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.views).toEqual([
      expect.objectContaining({ id: 'v1', name: 'Basic View', isDefault: true }),
    ]);
  });
});

describe('getCurrentUserId', () => {
  it('returns the signed-in user id', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    expect(await getCurrentUserId()).toBe('u1');
  });

  it('returns null when there is no session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    expect(await getCurrentUserId()).toBeNull();
  });

  it('returns null instead of throwing when auth fails', async () => {
    mockGetUser.mockRejectedValue(new Error('auth down'));
    expect(await getCurrentUserId()).toBeNull();
  });
});
