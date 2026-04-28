/**
 * Tests for normalizeAliasInput — the shared validator that gates
 * PATCH /api/admin/manufacturers/[slug] when aliases are being set
 * (Decision #152 admin alias editor).
 */

import { normalizeAliasInput } from '@/app/api/admin/manufacturers/[slug]/route';

describe('normalizeAliasInput', () => {
  it('accepts an array of simple strings', () => {
    const r = normalizeAliasInput(['GD', 'GIGADEVICE', '兆易创新']);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.aliases).toEqual(['GD', 'GIGADEVICE', '兆易创新']);
  });

  it('accepts an empty array (clearing all aliases)', () => {
    const r = normalizeAliasInput([]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.aliases).toEqual([]);
  });

  it('rejects non-array input', () => {
    const r = normalizeAliasInput('GD');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/array/);
  });

  it('rejects non-string entries', () => {
    const r = normalizeAliasInput(['GD', 42, 'gigadevice']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/string/);
  });

  it('rejects empty or whitespace-only entries', () => {
    expect(normalizeAliasInput(['GD', '']).ok).toBe(false);
    expect(normalizeAliasInput(['GD', '   ']).ok).toBe(false);
  });

  it('rejects entries longer than 100 chars', () => {
    const r = normalizeAliasInput(['GD', 'x'.repeat(101)]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/100/);
  });

  it('rejects when total exceeds 50 entries', () => {
    const many = Array.from({ length: 51 }, (_, i) => `alias${i}`);
    const r = normalizeAliasInput(many);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/50/);
  });

  it('dedupes case-insensitively, first writer wins', () => {
    const r = normalizeAliasInput(['GD', 'gd', 'GIGADEVICE', 'Gigadevice']);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.aliases).toEqual(['GD', 'GIGADEVICE']);
  });

  it('trims surrounding whitespace before dedup', () => {
    const r = normalizeAliasInput(['  GD  ', 'GD', '  gigadevice ']);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.aliases).toEqual(['GD', 'gigadevice']);
  });

  it('preserves CJK characters untouched', () => {
    const r = normalizeAliasInput(['兆易创新', 'gd/兆易创新']);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.aliases).toEqual(['兆易创新', 'gd/兆易创新']);
  });
});
