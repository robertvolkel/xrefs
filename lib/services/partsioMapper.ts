/**
 * Parts.io → Internal Type Mapper
 *
 * Converts parts.io listing objects to ParametricAttribute[].
 * Used for gap-fill enrichment after Digikey data is loaded.
 */

import type { ParametricAttribute } from '../types';
import type { ParamMapping, ParamMapEntry } from './digikeyParamMap';
import type { PartsioListing } from './partsioClient';
import { findPartsioParamMap } from './partsioParamMap';

// ============================================================
// VALUE TRANSFORMERS
// ============================================================

/** Convert parts.io value to display string */
function toDisplayValue(value: unknown, unit?: string): string {
  if (value == null || value === '') return '';
  const str = String(value);
  return unit ? `${str} ${unit}` : str;
}

/** Extract numeric value from parts.io field (already typed as number in most cases) */
function toNumericValue(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

/** Merge Operating Temperature Min + Max into range string */
function mergeOperatingTemp(listing: PartsioListing): string | null {
  const min = listing['Operating Temperature-Min'];
  const max = listing['Operating Temperature-Max'];
  if (min != null && max != null) return `${min}°C ~ ${max}°C`;
  return null;
}

/** Merge Supply Voltage Min + Max into range string */
function mergeSupplyVoltageRange(listing: PartsioListing): string | null {
  const min = listing['Supply Voltage-Min (Vsup)'];
  const max = listing['Supply Voltage-Max (Vsup)'];
  if (min != null && max != null) return `${min}V ~ ${max}V`;
  return null;
}

// ============================================================
// MAIN MAPPER
// ============================================================

/**
 * Convert a parts.io listing into ParametricAttribute[].
 * Uses the Class field to find the appropriate param map.
 * Returns empty array if no param map exists for the Class.
 */
export function mapPartsioProductToAttributes(listing: PartsioListing): ParametricAttribute[] {
  const className = listing.Class;
  if (!className) return [];

  const paramMap = findPartsioParamMap(className);
  if (!paramMap) return [];

  const attributes: ParametricAttribute[] = [];

  for (const [fieldName, entry] of Object.entries(paramMap)) {
    const mappings: ParamMapping[] = Array.isArray(entry) ? entry : [entry];

    for (const mapping of mappings) {
      const rawValue = listing[fieldName];
      if (rawValue == null || rawValue === '') continue;

      const displayValue = toDisplayValue(rawValue, mapping.unit);
      if (!displayValue) continue;

      attributes.push({
        parameterId: mapping.attributeId,
        parameterName: mapping.attributeName,
        value: displayValue,
        numericValue: toNumericValue(rawValue),
        unit: mapping.unit,
        sortOrder: mapping.sortOrder,
      });
    }
  }

  // Add merged operating temp range if both fields present
  const tempRange = mergeOperatingTemp(listing);
  if (tempRange) {
    attributes.push({
      parameterId: 'operating_temp',
      parameterName: 'Operating Temperature',
      value: tempRange,
      sortOrder: 90,
    });
  }

  // Add merged supply voltage range if both fields present
  const supplyRange = mergeSupplyVoltageRange(listing);
  if (supplyRange) {
    attributes.push({
      parameterId: 'supply_voltage',
      parameterName: 'Supply Voltage Range',
      value: supplyRange,
      sortOrder: 91,
    });
  }

  for (const a of attributes) a.source = 'partsio';
  return attributes;
}
