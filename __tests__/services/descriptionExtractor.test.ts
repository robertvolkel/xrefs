import {
  buildSchemaPrompt,
  buildExtractionPrompt,
  parseExtractionResponse,
  mergeExtractedAttributes,
  type ExtractedAttribute,
} from '../../lib/services/descriptionExtractor';

describe('descriptionExtractor', () => {
  // ─── buildSchemaPrompt ───────────────────────────────────

  describe('buildSchemaPrompt', () => {
    it('generates schema for family 71 (Power Inductors)', () => {
      const schema = buildSchemaPrompt('71');
      expect(schema).not.toBeNull();
      expect(schema).toContain('inductance');
      expect(schema).toContain('package_case');
      expect(schema).toContain('saturation_current');
      expect(schema).toContain('dcr');
      expect(schema).toContain('aec_q200'); // added via AEC routing
    });

    it('generates schema for family B5 (MOSFETs)', () => {
      const schema = buildSchemaPrompt('B5');
      expect(schema).not.toBeNull();
      expect(schema).toContain('vds');
      expect(schema).toContain('rds_on');
      expect(schema).toContain('aec_q101'); // discrete → Q101
    });

    it('generates schema for family C1 (LDOs)', () => {
      const schema = buildSchemaPrompt('C1');
      expect(schema).not.toBeNull();
      expect(schema).toContain('output_voltage');
      expect(schema).toContain('aec_q100'); // IC → Q100
    });

    it('returns null for unknown family', () => {
      const schema = buildSchemaPrompt('UNKNOWN');
      expect(schema).toBeNull();
    });

    it('excludes application_review rules', () => {
      const schema = buildSchemaPrompt('71');
      expect(schema).not.toBeNull();
      // inductance_vs_dc_bias is application_review in family 71
      expect(schema).not.toContain('inductance_vs_dc_bias');
    });

    it('includes unit hints for numeric attributes', () => {
      const schema = buildSchemaPrompt('71')!;
      expect(schema).toMatch(/inductance.*unit: H/);
      expect(schema).toMatch(/dcr.*unit: Ω/);
      expect(schema).toMatch(/tolerance.*±X%/);
    });

    it('includes upgrade hierarchy options', () => {
      const schema = buildSchemaPrompt('71')!;
      // core_material has identity_upgrade with hierarchy
      expect(schema).toMatch(/core_material.*Metal Alloy/);
    });
  });

  // ─── buildExtractionPrompt ───────────────────────────────

  describe('buildExtractionPrompt', () => {
    it('builds a complete prompt with description and schema', () => {
      const prompt = buildExtractionPrompt(
        'Inductance 15.0 uH, tolerance ±20%, AEC-Q200 qualified',
        '71',
      );
      expect(prompt).not.toBeNull();
      expect(prompt).toContain('Inductance 15.0 uH, tolerance ±20%, AEC-Q200 qualified');
      expect(prompt).toContain('Schema attributes:');
      expect(prompt).toContain('Return JSON only');
    });

    it('returns null for unknown family', () => {
      expect(buildExtractionPrompt('some description', 'UNKNOWN')).toBeNull();
    });
  });

  // ─── parseExtractionResponse — Quote Grounding ──────────

  describe('parseExtractionResponse', () => {
    const description = 'Inductance 15.0 uH, tolerance ±20%, operating temperature -55 to +155 °C, AEC-Q200 qualified';

    it('accepts extractions where source is found in description', () => {
      const response = JSON.stringify({
        tolerance: { value: '±20%', source: 'tolerance ±20%' },
        aec_q200: { value: 'Yes', source: 'AEC-Q200 qualified' },
      });

      const result = parseExtractionResponse(response, description, '71');
      expect(result.accepted).toHaveLength(2);
      expect(result.rejected).toHaveLength(0);
      expect(result.accepted[0].attributeId).toBe('tolerance');
      expect(result.accepted[0].value).toBe('±20%');
      expect(result.accepted[1].attributeId).toBe('aec_q200');
    });

    it('rejects extractions where source is NOT found (hallucination)', () => {
      const response = JSON.stringify({
        tolerance: { value: '±5%', source: 'precision tolerance of ±5%' }, // not in description
        aec_q200: { value: 'Yes', source: 'AEC-Q200 qualified' }, // real
      });

      const result = parseExtractionResponse(response, description, '71');
      expect(result.accepted).toHaveLength(1);
      expect(result.accepted[0].attributeId).toBe('aec_q200');
      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].attributeId).toBe('tolerance');
    });

    it('performs case-insensitive source matching', () => {
      const response = JSON.stringify({
        aec_q200: { value: 'Yes', source: 'aec-q200 qualified' }, // lowercase
      });

      const result = parseExtractionResponse(response, description, '71');
      expect(result.accepted).toHaveLength(1);
    });

    it('rejects unknown attribute IDs', () => {
      const response = JSON.stringify({
        tolerance: { value: '±20%', source: 'tolerance ±20%' },
        fake_attribute: { value: '42', source: 'tolerance ±20%' }, // valid source but unknown ID
      });

      const result = parseExtractionResponse(response, description, '71');
      expect(result.accepted).toHaveLength(1);
      expect(result.accepted[0].attributeId).toBe('tolerance');
    });

    it('handles empty JSON response', () => {
      const result = parseExtractionResponse('{}', description, '71');
      expect(result.accepted).toHaveLength(0);
      expect(result.rejected).toHaveLength(0);
    });

    it('handles invalid JSON gracefully', () => {
      const result = parseExtractionResponse('not json', description, '71');
      expect(result.accepted).toHaveLength(0);
      expect(result.rejected).toHaveLength(0);
    });

    it('handles JSON wrapped in markdown fences', () => {
      const response = '```json\n{"aec_q200": {"value": "Yes", "source": "AEC-Q200 qualified"}}\n```';
      const result = parseExtractionResponse(response, description, '71');
      expect(result.accepted).toHaveLength(1);
    });

    it('rejects entries with missing value or source', () => {
      const response = JSON.stringify({
        tolerance: { value: '±20%' }, // missing source
        dcr: { source: 'some text' }, // missing value
        aec_q200: { value: 'Yes', source: 'AEC-Q200 qualified' }, // valid
      });

      const result = parseExtractionResponse(response, description, '71');
      expect(result.accepted).toHaveLength(1);
      expect(result.accepted[0].attributeId).toBe('aec_q200');
    });

    it('returns empty for unknown family', () => {
      const response = JSON.stringify({
        tolerance: { value: '±20%', source: 'tolerance ±20%' },
      });
      const result = parseExtractionResponse(response, description, 'UNKNOWN');
      expect(result.accepted).toHaveLength(0);
    });
  });

  // ─── mergeExtractedAttributes ────────────────────────────

  describe('mergeExtractedAttributes', () => {
    const extracted: ExtractedAttribute[] = [
      { attributeId: 'aec_q200', value: 'Yes', source: 'AEC-Q200 qualified' },
      { attributeId: 'operating_temp', value: '-55°C to +155°C', source: 'operating temperature -55 to +155 °C' },
      { attributeId: 'tolerance', value: '±20%', source: 'tolerance ±20%' },
    ];

    it('returns all attributes when none exist', () => {
      const result = mergeExtractedAttributes(new Set(), extracted);
      expect(result).toHaveLength(3);
    });

    it('filters out attributes that already exist (gap-fill)', () => {
      const existing = new Set(['tolerance', 'operating_temp']);
      const result = mergeExtractedAttributes(existing, extracted);
      expect(result).toHaveLength(1);
      expect(result[0].attributeId).toBe('aec_q200');
    });

    it('returns empty when all attributes already exist', () => {
      const existing = new Set(['aec_q200', 'operating_temp', 'tolerance']);
      const result = mergeExtractedAttributes(existing, extracted);
      expect(result).toHaveLength(0);
    });

    it('handles empty extracted list', () => {
      const result = mergeExtractedAttributes(new Set(['aec_q200']), []);
      expect(result).toHaveLength(0);
    });
  });
});
