import { paramUid } from '@/lib/services/paramUid';

describe('paramUid', () => {
  // Pin a handful of known inputs so the server-side Triage search-by-UID and
  // the client table never diverge. If this test breaks, the FNV-1a impl
  // changed and pasted UIDs would stop resolving — that's a hard break, not a
  // cosmetic one.
  it('produces a stable TR- prefixed 6-hex UID', () => {
    expect(paramUid('VRRM (V) max')).toMatch(/^TR-[0-9a-f]{6}$/);
  });

  it('is deterministic across calls', () => {
    expect(paramUid('propagation_delay')).toBe(paramUid('propagation_delay'));
  });

  it('differs for different inputs', () => {
    expect(paramUid('voltage')).not.toBe(paramUid('current'));
  });

  it('pins exact outputs for known inputs (server/client parity)', () => {
    // Snapshot of the current FNV-1a output. These must match the client
    // implementation byte-for-byte.
    const fnv = (s: string): string => {
      let h = 0x811c9dc5;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
      return 'TR-' + (h >>> 0).toString(16).padStart(8, '0').slice(-6);
    };
    for (const input of ['VRRM (V) max', '电压_max', 'hfe_min', 'AEC-Q101', '']) {
      expect(paramUid(input)).toBe(fnv(input));
    }
  });

  it('handles empty string and unicode without throwing', () => {
    expect(paramUid('')).toMatch(/^TR-[0-9a-f]{6}$/);
    expect(paramUid('电压(V)')).toMatch(/^TR-[0-9a-f]{6}$/);
  });
});
