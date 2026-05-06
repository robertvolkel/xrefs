import {
  mergeAtlasParameters,
  toParametersJsonb,
  fromParametersJsonb,
  type AtlasParamEntry,
} from '@/lib/services/atlasMapper';

describe('mergeAtlasParameters — provenance-preserving merge', () => {
  it('preserves extraction-tagged entries when atlas re-ingest does not include them', () => {
    const existing: Record<string, AtlasParamEntry> = {
      capacitance: { value: '10 uF', source: 'atlas', ingested_at: '2026-01-01T00:00:00Z' },
      package_case: { value: '0805', source: 'extraction', ingested_at: '2026-02-01T00:00:00Z' },
    };
    const newAtlas: Record<string, AtlasParamEntry> = {
      capacitance: { value: '22 uF', source: 'atlas', ingested_at: '2026-05-01T00:00:00Z' },
    };

    const merged = mergeAtlasParameters(existing, newAtlas);

    expect(merged.capacitance.value).toBe('22 uF');
    expect(merged.capacitance.source).toBe('atlas');
    // Extraction entry survives untouched
    expect(merged.package_case.value).toBe('0805');
    expect(merged.package_case.source).toBe('extraction');
    expect(merged.package_case.ingested_at).toBe('2026-02-01T00:00:00Z');
  });

  it('preserves manual-tagged entries across re-ingest', () => {
    const existing: Record<string, AtlasParamEntry> = {
      tolerance: { value: '5%', source: 'atlas' },
      voltage_rating: { value: '50 V', source: 'manual', ingested_at: '2026-03-01T00:00:00Z' },
    };
    const newAtlas: Record<string, AtlasParamEntry> = {
      tolerance: { value: '1%', source: 'atlas' },
    };

    const merged = mergeAtlasParameters(existing, newAtlas);

    expect(merged.tolerance.value).toBe('1%');
    expect(merged.voltage_rating.value).toBe('50 V');
    expect(merged.voltage_rating.source).toBe('manual');
  });

  it('drops atlas-sourced keys present in existing but absent from newAtlas', () => {
    const existing: Record<string, AtlasParamEntry> = {
      capacitance: { value: '10 uF', source: 'atlas' },
      esr: { value: '50 mOhm', source: 'atlas' },
    };
    const newAtlas: Record<string, AtlasParamEntry> = {
      capacitance: { value: '10 uF', source: 'atlas' },
      // esr removed in new file
    };

    const merged = mergeAtlasParameters(existing, newAtlas);

    expect(merged.capacitance).toBeDefined();
    expect(merged.esr).toBeUndefined();
  });

  it('treats legacy untagged entries as atlas (drops them on re-ingest)', () => {
    // Pre-migration shape: no `source` field
    const existing = {
      capacitance: { value: '10 uF' } as AtlasParamEntry,
      tolerance: { value: '5%' } as AtlasParamEntry,
    };
    const newAtlas: Record<string, AtlasParamEntry> = {
      capacitance: { value: '22 uF', source: 'atlas' },
    };

    const merged = mergeAtlasParameters(existing, newAtlas);

    expect(merged.capacitance.value).toBe('22 uF');
    expect(merged.tolerance).toBeUndefined();
  });

  it('handles empty existing (insert path)', () => {
    const newAtlas: Record<string, AtlasParamEntry> = {
      capacitance: { value: '10 uF', source: 'atlas' },
    };

    const merged = mergeAtlasParameters(null, newAtlas);
    expect(merged.capacitance.value).toBe('10 uF');

    const merged2 = mergeAtlasParameters(undefined, newAtlas);
    expect(merged2.capacitance.value).toBe('10 uF');
  });

  it('handles empty newAtlas (preserves only extraction/manual)', () => {
    const existing: Record<string, AtlasParamEntry> = {
      capacitance: { value: '10 uF', source: 'atlas' },
      package_case: { value: '0805', source: 'extraction' },
    };

    const merged = mergeAtlasParameters(existing, {});

    expect(merged.capacitance).toBeUndefined(); // atlas dropped
    expect(merged.package_case.value).toBe('0805'); // extraction preserved
  });

  it('newAtlas source replaces extraction when same key appears in both (atlas wins on collision)', () => {
    // Edge case: extraction wrote a value, but the new file now provides a real atlas-sourced value.
    // The new atlas value should win — the source-of-truth has caught up to what extraction inferred.
    const existing: Record<string, AtlasParamEntry> = {
      package_case: { value: '0805', source: 'extraction', ingested_at: '2026-02-01T00:00:00Z' },
    };
    const newAtlas: Record<string, AtlasParamEntry> = {
      package_case: { value: '0603', source: 'atlas', ingested_at: '2026-05-01T00:00:00Z' },
    };

    const merged = mergeAtlasParameters(existing, newAtlas);

    expect(merged.package_case.value).toBe('0603');
    expect(merged.package_case.source).toBe('atlas');
  });
});

describe('toParametersJsonb — tags entries as source: atlas', () => {
  it('tags every entry with source=atlas and ingested_at', () => {
    const params = [
      { parameterId: 'capacitance', parameterName: 'Capacitance', value: '10 uF', numericValue: 10, unit: 'uF', sortOrder: 1 },
      { parameterId: 'tolerance', parameterName: 'Tolerance', value: '5%', sortOrder: 2 },
    ];
    const jsonb = toParametersJsonb(params);

    expect(jsonb.capacitance.value).toBe('10 uF');
    expect(jsonb.capacitance.numericValue).toBe(10);
    expect(jsonb.capacitance.unit).toBe('uF');
    expect(jsonb.capacitance.source).toBe('atlas');
    expect(typeof jsonb.capacitance.ingested_at).toBe('string');
    expect(new Date(jsonb.capacitance.ingested_at!).getTime()).not.toBeNaN();

    expect(jsonb.tolerance.source).toBe('atlas');
    expect(jsonb.tolerance.numericValue).toBeUndefined();
    expect(jsonb.tolerance.unit).toBeUndefined();
  });
});

describe('fromParametersJsonb — backwards-compat with legacy shape', () => {
  it('reads new provenance-tagged shape', () => {
    const jsonb: Record<string, AtlasParamEntry> = {
      capacitance: { value: '10 uF', numericValue: 10, unit: 'uF', source: 'atlas', ingested_at: '2026-05-01T00:00:00Z' },
    };
    const result = fromParametersJsonb(jsonb);
    expect(result).toHaveLength(1);
    expect(result[0].parameterId).toBe('capacitance');
    expect(result[0].value).toBe('10 uF');
    expect(result[0].numericValue).toBe(10);
    expect(result[0].unit).toBe('uF');
  });

  it('reads legacy shape without source/ingested_at fields', () => {
    const jsonb = {
      capacitance: { value: '10 uF', numericValue: 10, unit: 'uF' } as AtlasParamEntry,
    };
    const result = fromParametersJsonb(jsonb);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe('10 uF');
  });
});
