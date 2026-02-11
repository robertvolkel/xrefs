/**
 * Digikey Parameter Mapping
 *
 * Maps Digikey ParameterText strings to our internal attributeId values.
 * Organized per Digikey category. Only MLCC (category ~12) mapped initially.
 *
 * NOTE: These mappings are based on Digikey's known ParameterText labels.
 * When we get valid API credentials, run `scripts/discover-digikey-params.mjs`
 * to verify ParameterText strings and add numeric ParameterId for reference.
 */

/** Mapping entry: Digikey ParameterText → internal attributeId + display name */
export interface ParamMapping {
  attributeId: string;
  attributeName: string;
  /** Optional unit for numeric extraction (e.g., 'µF', 'V', 'mm') */
  unit?: string;
  sortOrder: number;
}

/**
 * MLCC parameter mapping.
 * Keys are Digikey ParameterText values (case-insensitive matching applied at lookup).
 */
const mlccParamMap: Record<string, ParamMapping> = {
  'Capacitance': {
    attributeId: 'capacitance',
    attributeName: 'Capacitance',
    unit: 'µF',
    sortOrder: 1,
  },
  'Package / Case': {
    attributeId: 'package_case',
    attributeName: 'Package / Case',
    sortOrder: 2,
  },
  'Voltage - Rated': {
    attributeId: 'voltage_rated',
    attributeName: 'Voltage Rating',
    unit: 'V',
    sortOrder: 3,
  },
  'Temperature Coefficient': {
    attributeId: 'dielectric',
    attributeName: 'Dielectric / Temp Characteristic',
    sortOrder: 4,
  },
  'Tolerance': {
    attributeId: 'tolerance',
    attributeName: 'Tolerance',
    sortOrder: 5,
  },
  'Operating Temperature': {
    attributeId: 'operating_temp',
    attributeName: 'Operating Temp Range',
    sortOrder: 6,
  },
  'Height - Seated (Max)': {
    attributeId: 'height',
    attributeName: 'Height (Seated Max)',
    unit: 'mm',
    sortOrder: 7,
  },
  'ESR (Equivalent Series Resistance)': {
    attributeId: 'esr',
    attributeName: 'ESR',
    sortOrder: 8,
  },
  'ESL (Equivalent Series Inductance)': {
    attributeId: 'esl',
    attributeName: 'ESL',
    sortOrder: 9,
  },
  'Features': {
    attributeId: 'flexible_termination',
    attributeName: 'Flexible Termination',
    sortOrder: 10,
  },
  'Moisture Sensitivity Level (MSL)': {
    attributeId: 'msl',
    attributeName: 'Moisture Sensitivity Level',
    sortOrder: 11,
  },
  'Ratings': {
    attributeId: 'aec_q200',
    attributeName: 'AEC-Q200',
    sortOrder: 12,
  },
  'Packaging': {
    attributeId: 'packaging',
    attributeName: 'Packaging',
    sortOrder: 14,
  },
};

/**
 * Category name patterns → which param map to use.
 * Digikey category names are like "Ceramic Capacitors", "Chip Resistor - Surface Mount", etc.
 */
const categoryParamMaps: Record<string, Record<string, ParamMapping>> = {
  'Ceramic Capacitors': mlccParamMap,
};

/**
 * Look up the parameter mapping for a given Digikey ParameterText within a category.
 * Falls back to a generic passthrough if no mapping exists.
 */
export function getParamMapping(
  categoryName: string,
  parameterText: string
): ParamMapping | null {
  // Find the right category map
  const map = Object.entries(categoryParamMaps).find(([key]) =>
    categoryName.toLowerCase().includes(key.toLowerCase())
  )?.[1];

  if (!map) return null;

  // Try exact match first
  if (map[parameterText]) return map[parameterText];

  // Try case-insensitive match
  const lowerParam = parameterText.toLowerCase();
  for (const [key, value] of Object.entries(map)) {
    if (key.toLowerCase() === lowerParam) return value;
  }

  return null;
}

/**
 * Get all mapped parameter texts for a category (useful for filtering).
 */
export function getMappedParameterTexts(categoryName: string): string[] {
  const map = Object.entries(categoryParamMaps).find(([key]) =>
    categoryName.toLowerCase().includes(key.toLowerCase())
  )?.[1];

  return map ? Object.keys(map) : [];
}

/**
 * Check if a Digikey category name has a parameter mapping defined.
 */
export function hasCategoryMapping(categoryName: string): boolean {
  return Object.keys(categoryParamMaps).some((key) =>
    categoryName.toLowerCase().includes(key.toLowerCase())
  );
}
