import { buildComparisonTable, ComparisonPartInput } from '@/lib/services/comparisonTable';

const labels = (t: ReturnType<typeof buildComparisonTable>) => t.columns.map((c) => c.label);

describe('buildComparisonTable', () => {
  it('always puts MPN first and aligns shared parameters', () => {
    const parts: ComparisonPartInput[] = [
      { mpn: 'A1', parameters: [{ name: 'Voltage', value: '45V' }, { name: 'Current', value: '100mA' }] },
      { mpn: 'B2', parameters: [{ name: 'Voltage', value: '65V' }, { name: 'Current', value: '100mA' }] },
    ];
    const t = buildComparisonTable(parts);
    expect(t.columns[0]).toEqual({ key: 'mpn', label: 'MPN' });
    expect(labels(t)).toContain('Voltage');
    expect(labels(t)).toContain('Current');
    expect(t.rows[0].cells['p:Voltage']).toBe('45V');
    expect(t.rows[1].cells['p:Voltage']).toBe('65V');
  });

  it('renders an em dash when a part is missing a parameter', () => {
    const parts: ComparisonPartInput[] = [
      { mpn: 'A1', parameters: [{ name: 'Voltage', value: '45V' }, { name: 'Gain', value: '200' }] },
      { mpn: 'B2', parameters: [{ name: 'Voltage', value: '65V' }] },
    ];
    const t = buildComparisonTable(parts, { preferredAttributes: ['Voltage', 'Gain'] });
    expect(t.rows[1].cells['p:Gain']).toBe('—');
  });

  it('uses preferredAttributes (loosely matched) to drive the columns', () => {
    const parts: ComparisonPartInput[] = [
      { mpn: 'BC847B', parameters: [{ name: 'DC Current Gain (hFE)', value: '200 @ 2mA, 5V' }] },
    ];
    const t = buildComparisonTable(parts, { preferredAttributes: ['hFE'] });
    // "hFE" matched "DC Current Gain (hFE)" by loose substring.
    expect(labels(t)).toContain('DC Current Gain (hFE)');
    expect(t.rows[0].cells['p:DC Current Gain (hFE)']).toBe('200 @ 2mA, 5V');
  });

  it('only adds fixed columns when at least one part has the data', () => {
    const noExtras = buildComparisonTable([{ mpn: 'A1', parameters: [] }]);
    expect(labels(noExtras)).toEqual(['MPN']); // no manufacturer/status/quals/distributors

    const withExtras = buildComparisonTable([
      { mpn: 'A1', manufacturer: 'onsemi', status: 'Active', distributorCount: 11, qualifications: ['AEC-Q101'] },
    ]);
    expect(labels(withExtras)).toEqual(['MPN', 'Manufacturer', 'Status', 'Qualifications', 'Distributors']);
  });

  it('dedupes parts by MPN (first wins)', () => {
    const t = buildComparisonTable([
      { mpn: 'A1', manufacturer: 'X' },
      { mpn: 'a1', manufacturer: 'Y' },
    ]);
    expect(t.rows).toHaveLength(1);
    expect(t.rows[0].cells.manufacturer).toBe('X');
  });

  it('builds the screenshot scenario entirely from supplied data', () => {
    const parts: ComparisonPartInput[] = [
      {
        mpn: 'SBC847CLT1G', manufacturer: 'onsemi', status: 'Active',
        qualifications: ['AEC-Q101'], distributorCount: 11,
        parameters: [
          { name: 'DC Current Gain (hFE)', value: '420 @ 2mA, 5V' },
          { name: 'Vceo Max', value: '45 V' },
          { name: 'Package', value: 'SOT-23' },
        ],
      },
      {
        mpn: 'BC846BW,115', manufacturer: 'Nexperia', status: 'Active',
        qualifications: [], distributorCount: 11,
        parameters: [
          { name: 'DC Current Gain (hFE)', value: '200 @ 2mA, 5V' },
          { name: 'Vceo Max', value: '65 V' },
          { name: 'Package', value: 'SOT-323' },
        ],
      },
    ];
    const t = buildComparisonTable(parts, { preferredAttributes: ['hFE', 'Vceo', 'Package'] });
    // Every value traces to the input — nothing invented.
    expect(t.rows[0].mpn).toBe('SBC847CLT1G');
    expect(t.rows[0].cells['p:DC Current Gain (hFE)']).toBe('420 @ 2mA, 5V');
    expect(t.rows[0].cells.qualifications).toBe('AEC-Q101');
    expect(t.rows[1].cells['p:Vceo Max']).toBe('65 V');
    expect(t.rows[1].cells.qualifications).toBe('—');
    expect(t.rows[1].cells.distributors).toBe('11');
  });

  it('token-matches a requested term to a differently-worded param ("Vce(max)" → "Vceo Max ...")', () => {
    const parts: ComparisonPartInput[] = [
      { mpn: 'BC847B', parameters: [{ name: 'Vceo Max (Collector-Emitter Voltage)', value: '45 V' }] },
    ];
    const matched = buildComparisonTable(parts, { preferredAttributes: ['Vce(max)'] });
    expect(labels(matched)).toContain('Vceo Max (Collector-Emitter Voltage)');
    expect(matched.rows[0].cells['p:Vceo Max (Collector-Emitter Voltage)']).toBe('45 V');

    // But a genuinely different spec must NOT collide with it.
    const notMatched = buildComparisonTable(parts, { preferredAttributes: ['Vce(sat)'] });
    expect(labels(notMatched)).not.toContain('Vceo Max (Collector-Emitter Voltage)');
  });
});
