import { sanitizeChoiceOptions } from '@/lib/services/choiceGuard';

describe('sanitizeChoiceOptions (present_choices hard-line enforcement)', () => {
  it('strips mpn/manufacturer and neuters confirm_part → other', () => {
    const out = sanitizeChoiceOptions([
      { id: 'a', label: 'N-channel', action: 'confirm_part', mpn: 'IRF540N', manufacturer: 'Infineon' },
    ]);
    expect(out).toEqual([{ id: 'a', label: 'N-channel', action: 'other' }]);
    expect(out[0]).not.toHaveProperty('mpn');
    expect(out[0]).not.toHaveProperty('manufacturer');
  });

  it('drops any choice whose label names a specific part', () => {
    const out = sanitizeChoiceOptions([
      { id: 'a', label: 'Use BC847C' },
      { id: 'b', label: 'Confirm MMBT3904 (automotive)' },
      { id: 'c', label: 'P-channel instead' },
    ]);
    expect(out.map(c => c.id)).toEqual(['c']);
  });

  it('preserves legitimate categorical / workflow labels untouched', () => {
    const choices = [
      { id: '1', label: 'N-channel', action: 'other' as const },
      { id: '2', label: 'P-channel', action: 'other' as const },
      { id: '3', label: 'X7R dielectric' },
      { id: '4', label: 'AEC-Q200 only' },
      { id: '5', label: '100V rail' },
      { id: '6', label: 'Get full specs' },
      { id: '7', label: 'Search for alternatives', action: 'search' as const },
    ];
    const out = sanitizeChoiceOptions(choices);
    expect(out).toHaveLength(7);
    expect(out.map(c => c.label)).toEqual(choices.map(c => c.label));
  });

  it('keeps a passthrough search/other action unchanged', () => {
    expect(sanitizeChoiceOptions([{ id: 'x', label: 'Start a new search', action: 'search' }]))
      .toEqual([{ id: 'x', label: 'Start a new search', action: 'search' }]);
    expect(sanitizeChoiceOptions([{ id: 'y', label: 'Continue' }]))
      .toEqual([{ id: 'y', label: 'Continue' }]);
  });

  it('is defensive against malformed input', () => {
    expect(sanitizeChoiceOptions(undefined)).toEqual([]);
    expect(sanitizeChoiceOptions(null)).toEqual([]);
    expect(sanitizeChoiceOptions('nope')).toEqual([]);
    expect(sanitizeChoiceOptions([null, { id: 1, label: 'x' }, { id: 'z' }, { label: 'no id' }])).toEqual([]);
  });
});
