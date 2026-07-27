import { describeSearchConstraints } from '@/lib/services/searchSummary';
import { getLogicTable } from '@/lib/logicTables';
import type { SearchConstraint } from '@/lib/types';

/**
 * Mutation-grade tests for the reflect-back line. The value it protects is that the user can SEE
 * what the system parsed — so the assertions pin: bound → operator (≥/≤), exact/categorical →
 * bare, unit rendering, label resolution via the real logic table, and the empty-constraint case.
 */

describe('describeSearchConstraints', () => {
  it('renders a min bound as ≥ and a max bound as ≤, with units', () => {
    const cs: SearchConstraint[] = [
      { attribute: 'drain-source voltage', value: 30, unit: 'V', bound: 'min' },
      { attribute: 'height', value: 1.2, unit: 'mm', bound: 'max' },
    ];
    const out = describeSearchConstraints('N-channel MOSFET', cs);
    expect(out).toContain('≥ 30 V');
    expect(out).toContain('≤ 1.2 mm');
    // Type name casing is preserved (a regular hyphen is NOT a split point).
    expect(out.startsWith('Searching N-channel MOSFET with:')).toBe(true);
  });

  it('shortens a verbose family name to its clean head, preserving casing', () => {
    const out = describeSearchConstraints(
      'MOSFETs — N-Channel & P-Channel',
      [{ attribute: 'channel type', value: 'N-Channel' }, { attribute: 'drain-source voltage', value: 30, unit: 'V', bound: 'min' }],
    );
    expect(out.startsWith('Searching MOSFETs with:')).toBe(true);
    // The "& P-Channel" dash-tail is dropped, so it can't clash with the N-Channel constraint.
    expect(out).not.toContain('P-Channel & ');
    expect(out).not.toContain('n-channel & p-channel');
    // Acronym casing survives (not flattened to "mosfets").
    expect(out).not.toContain('mosfets');
  });

  it('drops a trailing parenthetical from the type name', () => {
    const out = describeSearchConstraints(
      'Linear Voltage Regulators (LDOs)',
      [{ attribute: 'output voltage', value: 3.3, unit: 'V', bound: 'min' }],
    );
    expect(out.startsWith('Searching Linear Voltage Regulators with:')).toBe(true);
    expect(out).not.toContain('(LDOs)');
  });

  it('renders an exact/categorical value with NO operator', () => {
    const out = describeSearchConstraints('MLCC', [{ attribute: 'dielectric', value: 'X7R' }], '12');
    expect(out).toContain('X7R');
    expect(out).not.toContain('≥');
    expect(out).not.toContain('≤');
  });

  it('resolves the human label from the family logic table (not the raw attributeId)', () => {
    // Guided constraints carry attribute = attributeId; the reflect-back must show the readable name.
    const rule = getLogicTable('12')!.rules.find(r => r.attributeId === 'dielectric')!;
    const cleanName = rule.attributeName.replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();
    const out = describeSearchConstraints('MLCC', [{ attribute: 'dielectric', value: 'X7R' }], '12');
    expect(out).toContain(cleanName); // e.g. "dielectric / temperature characteristic"
  });

  it('prettifies an unknown attributeId when no family is given (underscores → spaces)', () => {
    const out = describeSearchConstraints('thing', [{ attribute: 'drain_source_voltage', value: 30, unit: 'V', bound: 'min' }]);
    expect(out).toContain('drain source voltage ≥ 30 V');
  });

  it('returns an empty string when there are no constraints (nothing to reflect)', () => {
    expect(describeSearchConstraints('MLCC', [])).toBe('');
    expect(describeSearchConstraints('MLCC', undefined)).toBe('');
  });
});
