import { mapPartsioStatus } from '@/lib/services/partsioClient';

describe('mapPartsioStatus — parts.io lifecycle → PartStatus', () => {
  it('treats available/orderable codes as Active (so they sort to the top)', () => {
    expect(mapPartsioStatus(undefined)).toBe('Active');
    expect(mapPartsioStatus('')).toBe('Active');
    expect(mapPartsioStatus('Active')).toBe('Active');
    expect(mapPartsioStatus('Production')).toBe('Active');
    expect(mapPartsioStatus('Transferred')).toBe('Active');
    expect(mapPartsioStatus('Acquired')).toBe('Active');
    expect(mapPartsioStatus('Unknown')).toBe('Active');
  });

  it('preserves genuine end-of-life states', () => {
    expect(mapPartsioStatus('Obsolete')).toBe('Obsolete');
    expect(mapPartsioStatus('Discontinued')).toBe('Discontinued');
    expect(mapPartsioStatus('End of Life')).toBe('NRND');
    expect(mapPartsioStatus('EOL')).toBe('NRND');
    expect(mapPartsioStatus('Last Time Buy')).toBe('LastTimeBuy');
    expect(mapPartsioStatus('LTB')).toBe('LastTimeBuy');
  });

  it('is case-insensitive', () => {
    expect(mapPartsioStatus('OBSOLETE')).toBe('Obsolete');
    expect(mapPartsioStatus('transferred')).toBe('Active');
  });
});
