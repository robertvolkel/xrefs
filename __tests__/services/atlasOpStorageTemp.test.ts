import { gaiaSharedDictionary } from '@/lib/services/atlasGaiaDictionaries';
import { fromParametersJsonb } from '@/lib/services/atlasMapper';

/**
 * "Combined operating + storage temperature" columns (~2.6k products, all in
 * discrete-semi families B1/B3/B4/B5/B6) map to a DISPLAY-ONLY attribute
 * `op_storage_temp` — never `operating_temp`. Three of those families
 * (B1/B3/B4) score operating temperature, and a combined junction/storage
 * range is an absolute-max rating wider than the true ambient operating range;
 * folding it into operating_temp would overstate operating capability.
 * `op_storage_temp` has no logic-table rule, so it is captured and displayed
 * but never scored.
 */
describe('combined operating+storage temperature → display-only op_storage_temp', () => {
  it('routes combined spellings (incl. the 3 re-homed ones) to op_storage_temp', () => {
    const combined = [
      'operating_junction_and_storage_temperature_range', // largest (~2.4k)
      'junction_and_storage_temperature',
      'operating_and_storage_temperature',
      // the three re-homed from operating_temp:
      'operating_and_storage_temperature_range',
      'operating_storage_temperature_range',
      'junction_and_storage_temperature_range',
    ];
    for (const stem of combined) {
      expect(gaiaSharedDictionary[stem]?.attributeId).toBe('op_storage_temp');
    }
  });

  it('does NOT re-home genuine operating-only spellings', () => {
    expect(gaiaSharedDictionary['operating_temperature_range']?.attributeId).toBe('operating_temp');
    expect(gaiaSharedDictionary['operating_temperature']?.attributeId).toBe('operating_temp');
  });

  it('op_storage_temp renders with its label + recognized on a family with no rule (B6)', () => {
    const jsonb: Record<string, { value: string; numericValue: number; unit: string }> = {
      op_storage_temp: { value: '-55 to 150 °C', numericValue: -55, unit: '°C' },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = fromParametersJsonb(jsonb as any, 'B6', 'Discrete Semiconductors', []);
    const ops = out.find((p) => p.parameterId === 'op_storage_temp');
    expect(ops?.parameterName).toBe('Operating & Storage Temperature');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((ops as any)?.recognized).toBe(true);
  });
});
