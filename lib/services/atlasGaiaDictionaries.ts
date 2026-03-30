/**
 * Gaia parameter dictionaries for Atlas datasheet-extracted parameters.
 *
 * Gaia-prefixed params follow the format: gaia-{snake_case_stem}-{Min|Max|Typ}
 * These are structured, consistent across all manufacturers, and extracted
 * from datasheets via Gaia technology.
 *
 * Dictionaries are stored in atlas-gaia-dicts.json (shared with atlas-ingest.mjs).
 */

import type { AtlasParamMapping } from './atlasMapper';
import gaiaData from './atlas-gaia-dicts.json';

export interface GaiaParamMapping extends AtlasParamMapping {
  /** Which -Min/-Max/-Typ suffix to prefer when multiple appear for the same stem */
  preferredSuffix?: 'Min' | 'Max' | 'Typ' | 'Nom';
}

/** Gaia stems to skip (metadata, not parametric data) */
export const GAIA_SKIP_STEMS = new Set<string>(gaiaData.skipStems);

/** Per-family gaia stem → mapping dictionaries */
export const gaiaFamilyDictionaries: Record<string, Record<string, GaiaParamMapping>> =
  gaiaData.families as Record<string, Record<string, GaiaParamMapping>>;

/** Shared gaia stem mappings (apply across all families) */
export const gaiaSharedDictionary: Record<string, GaiaParamMapping> =
  gaiaData.shared as Record<string, GaiaParamMapping>;

/** L2 category gaia stem → mapping dictionaries (for non-scorable families) */
export const gaiaL2Dictionaries: Record<string, Record<string, GaiaParamMapping>> =
  (gaiaData as Record<string, unknown>).l2Categories as Record<string, Record<string, GaiaParamMapping>>;

/**
 * Converts a gaia stem to a human-readable display name.
 * Input: "drain_source_voltage" → "Drain Source Voltage"
 */
export function humanizeStem(stem: string): string {
  return stem.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Parses a gaia-prefixed parameter name.
 * Returns null if not a gaia param.
 *
 * Input: "gaia-drain_source_voltage-Max"
 * Output: { stem: "drain_source_voltage", suffix: "Max" }
 */
export function parseGaiaParam(name: string): { stem: string; suffix: string } | null {
  if (!name.startsWith('gaia-')) return null;
  const rest = name.slice(5);

  // Check known suffixes (longest first to avoid partial matches)
  for (const suffix of ['-Min', '-Max', '-Typ', '-Nom']) {
    if (rest.endsWith(suffix)) {
      return { stem: rest.slice(0, -suffix.length), suffix: suffix.slice(1) };
    }
  }
  return { stem: rest, suffix: '' };
}

/**
 * Parses a gaia value string that embeds units.
 * Input: "5.8 mΩ", "±20 V", "-55 to +150 °C", "<8.0 mΩ"
 * Output: { displayValue, numericValue, unit }
 */
export function parseGaiaValue(raw: string): { displayValue: string; numericValue?: number; unit?: string } {
  const trimmed = raw.trim();

  // Range values: "-55 to +150 °C" or "-40~125 ℃"
  const rangeMatch = trimmed.match(/^([+-−]?\d+\.?\d*)\s*(?:to|~|–|—)\s*\+?([+-−]?\d+\.?\d*)\s*(.*)$/);
  if (rangeMatch) {
    const unit = rangeMatch[3].trim() || undefined;
    return {
      displayValue: `${rangeMatch[1]} to ${rangeMatch[2]}${unit ? ' ' + unit : ''}`,
      numericValue: parseFloat(rangeMatch[1].replace('−', '-')),
      unit,
    };
  }

  // "< prefix" values: "<8.0 mΩ"
  const ltMatch = trimmed.match(/^<\s*(\d+\.?\d*)\s*(.*)$/);
  if (ltMatch) {
    return {
      displayValue: ltMatch[1],
      numericValue: parseFloat(ltMatch[1]),
      unit: ltMatch[2].trim() || undefined,
    };
  }

  // "± prefix" values: "±20 V"
  const pmMatch = trimmed.match(/^[±]\s*(\d+\.?\d*)\s*(.*)$/);
  if (pmMatch) {
    return {
      displayValue: `±${pmMatch[1]}`,
      numericValue: parseFloat(pmMatch[1]),
      unit: pmMatch[2].trim() || undefined,
    };
  }

  // General: "100 V", "5.8 mΩ", "-40 °C"
  const numUnitMatch = trimmed.match(/^([+-]?\d+\.?\d*)\s+(.+)$/);
  if (numUnitMatch) {
    return {
      displayValue: numUnitMatch[1],
      numericValue: parseFloat(numUnitMatch[1]),
      unit: numUnitMatch[2].trim(),
    };
  }

  // Just a number
  const numMatch = trimmed.match(/^([+-]?\d+\.?\d*)$/);
  if (numMatch) {
    return { displayValue: trimmed, numericValue: parseFloat(numMatch[1]) };
  }

  // Non-numeric
  return { displayValue: trimmed };
}
