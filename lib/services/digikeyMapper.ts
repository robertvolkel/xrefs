/**
 * Digikey → Internal Type Mapper
 *
 * Converts Digikey API response objects to our internal types
 * (Part, PartAttributes, PartSummary, SearchResult).
 */

import {
  Part,
  PartAttributes,
  ParametricAttribute,
  PartSummary,
  SearchResult,
  ComponentCategory,
  PartStatus,
} from '../types';
import { DigikeyProduct, DigikeyCategory, DigikeyKeywordResponse } from './digikeyClient';
import { getParamMapping, hasCategoryMapping } from './digikeyParamMap';

/** Traverse Digikey's hierarchical category to find the most specific (deepest) name */
function getDeepestCategoryName(category: DigikeyCategory | undefined): string {
  if (!category) return '';
  let current = category;
  while (current.ChildCategories && current.ChildCategories.length > 0) {
    current = current.ChildCategories[0];
  }
  return current.Name;
}

// ============================================================
// CATEGORY MAPPING
// ============================================================

/** Map Digikey category names to our ComponentCategory */
function mapCategory(categoryName: string): ComponentCategory {
  const lower = categoryName.toLowerCase();
  if (lower.includes('capacitor')) return 'Capacitors';
  if (lower.includes('resistor')) return 'Resistors';
  if (lower.includes('inductor')) return 'Inductors';
  if (lower.includes('diode') || lower.includes('rectifier')) return 'Diodes';
  if (lower.includes('transistor') || lower.includes('mosfet') || lower.includes('bjt')) return 'Transistors';
  if (lower.includes('connector') || lower.includes('header') || lower.includes('socket')) return 'Connectors';
  // Default: ICs covers a huge range
  return 'ICs';
}

/** Infer subcategory from Digikey category name */
function mapSubcategory(categoryName: string): string {
  const lower = categoryName.toLowerCase();
  if (lower.includes('ceramic capacitor') || lower.includes('mlcc')) return 'MLCC';
  if (lower.includes('aluminum') && lower.includes('polymer')) return 'Aluminum Polymer';
  if (lower.includes('aluminum')) return 'Aluminum Electrolytic';
  if (lower.includes('tantalum')) return 'Tantalum';
  if (lower.includes('film capacitor')) return 'Film';
  if (lower.includes('thick film')) return 'Thick Film';
  if (lower.includes('thin film')) return 'Thin Film';
  if (lower.includes('chip resistor') || lower.includes('surface mount')) {
    if (lower.includes('resistor')) return 'Thick Film';
  }
  return categoryName;
}

/** Map Digikey product status to our PartStatus */
function mapStatus(status: string): PartStatus {
  const lower = status.toLowerCase();
  if (lower.includes('active')) return 'Active';
  if (lower.includes('obsolete')) return 'Obsolete';
  if (lower.includes('discontinued')) return 'Discontinued';
  if (lower.includes('not recommended') || lower.includes('nrnd')) return 'NRND';
  if (lower.includes('last time buy') || lower.includes('ltb')) return 'LastTimeBuy';
  return 'Active';
}

// ============================================================
// NUMERIC VALUE EXTRACTION
// ============================================================

/** Extract a numeric value and unit from a Digikey value string like "1µF", "25V", "0.90mm" */
function extractNumericValue(valueText: string): { numericValue?: number; unit?: string } {
  // Try patterns like "1µF", "25 V", "0.90 mm", "10 kΩ"
  const match = valueText.match(/([\d.]+)\s*([a-zA-ZµΩ°%]+)/);
  if (!match) return {};

  let numericValue = parseFloat(match[1]);
  const rawUnit = match[2];

  // Handle SI prefixes
  if (rawUnit.startsWith('p') || rawUnit.startsWith('pF')) numericValue *= 1e-12;
  else if (rawUnit.startsWith('n') && !rawUnit.startsWith('no')) numericValue *= 1e-9;
  else if (rawUnit.startsWith('µ') || rawUnit.startsWith('u')) numericValue *= 1e-6;
  else if (rawUnit.startsWith('m') && !rawUnit.startsWith('mm') && !rawUnit.startsWith('M')) numericValue *= 1e-3;
  else if (rawUnit.startsWith('k') || rawUnit.startsWith('K')) numericValue *= 1e3;
  else if (rawUnit.startsWith('M') && !rawUnit.startsWith('MSL')) numericValue *= 1e6;

  return { numericValue, unit: rawUnit };
}

// ============================================================
// VALUE TRANSFORMERS (Digikey → our format)
// ============================================================

/** Transform Digikey's "Features" parameter to our "Flexible Termination" Yes/No */
function transformFeaturesToFlexTerm(valueText: string): string {
  const lower = valueText.toLowerCase();
  if (lower.includes('flex') || lower.includes('flexible')) return 'Yes';
  return 'No';
}

/** Transform Digikey's "Ratings" parameter to our "AEC-Q200" Yes/No */
function transformRatingsToAecQ200(valueText: string): string {
  if (valueText.toUpperCase().includes('AEC-Q200')) return 'Yes';
  return 'No';
}

/** Apply value transformations based on attributeId */
function transformValue(attributeId: string, valueText: string): string {
  switch (attributeId) {
    case 'flexible_termination':
      return transformFeaturesToFlexTerm(valueText);
    case 'aec_q200':
      return transformRatingsToAecQ200(valueText);
    default:
      return valueText;
  }
}

// ============================================================
// MAIN MAPPERS
// ============================================================

/** Map a DigikeyProduct to our Part type */
export function mapDigikeyProductToPart(product: DigikeyProduct): Part {
  const categoryName = getDeepestCategoryName(product.Category);
  return {
    mpn: product.ManufacturerProductNumber,
    manufacturer: product.Manufacturer?.Name ?? 'Unknown',
    description: product.Description?.ProductDescription ?? '',
    detailedDescription: product.Description?.DetailedDescription ?? '',
    category: mapCategory(categoryName),
    subcategory: mapSubcategory(categoryName),
    status: mapStatus(product.ProductStatus?.Status ?? 'Active'),
    datasheetUrl: product.DatasheetUrl || undefined,
    imageUrl: product.PhotoUrl || undefined,
    unitPrice: product.UnitPrice ?? undefined,
    quantityAvailable: product.QuantityAvailable ?? undefined,
  };
}

/** Map a DigikeyProduct to our PartAttributes (Part + parametric attributes) */
export function mapDigikeyProductToAttributes(product: DigikeyProduct): PartAttributes {
  const part = mapDigikeyProductToPart(product);
  const categoryName = getDeepestCategoryName(product.Category);
  const parameters: ParametricAttribute[] = [];

  if (product.Parameters) {
    if (hasCategoryMapping(categoryName)) {
      // Category-specific mapping: use curated param map
      for (const param of product.Parameters) {
        const mapping = getParamMapping(categoryName, param.ParameterText);
        if (!mapping) continue;

        const transformedValue = transformValue(mapping.attributeId, param.ValueText);
        const { numericValue, unit } = extractNumericValue(param.ValueText);

        parameters.push({
          parameterId: mapping.attributeId,
          parameterName: mapping.attributeName,
          value: transformedValue,
          numericValue,
          unit: mapping.unit ?? unit,
          sortOrder: mapping.sortOrder,
        });
      }
    } else {
      // Generic fallback: extract all Digikey parameters as-is
      for (let i = 0; i < product.Parameters.length; i++) {
        const param = product.Parameters[i];
        if (!param.ValueText || param.ValueText === '-') continue;
        const { numericValue, unit } = extractNumericValue(param.ValueText);
        parameters.push({
          parameterId: param.ParameterText.toLowerCase().replace(/[\s/()-]+/g, '_'),
          parameterName: param.ParameterText,
          value: param.ValueText,
          numericValue,
          unit,
          sortOrder: i + 1,
        });
      }
    }
  }

  // If we have a mapped category but no DC bias derating parameter came from Digikey
  // (it usually doesn't), add a placeholder for application_review
  if (hasCategoryMapping(categoryName) && !parameters.find(p => p.parameterId === 'dc_bias_derating')) {
    parameters.push({
      parameterId: 'dc_bias_derating',
      parameterName: 'DC Bias Derating',
      value: 'Consult datasheet',
      sortOrder: 13,
    });
  }

  // Sort by sortOrder
  parameters.sort((a, b) => a.sortOrder - b.sortOrder);

  return { part, parameters };
}

/** Map a DigikeyProduct to our lightweight PartSummary */
export function mapDigikeyProductToSummary(product: DigikeyProduct): PartSummary {
  const categoryName = getDeepestCategoryName(product.Category);
  return {
    mpn: product.ManufacturerProductNumber,
    manufacturer: product.Manufacturer?.Name ?? 'Unknown',
    description: product.Description?.ProductDescription ?? '',
    category: mapCategory(categoryName),
  };
}

/** Map a DigikeyKeywordResponse to our SearchResult */
export function mapKeywordResponseToSearchResult(
  response: DigikeyKeywordResponse
): SearchResult {
  const allProducts = [
    ...(response.ExactMatches ?? []),
    ...(response.Products ?? []),
  ];

  // Deduplicate by MPN
  const seen = new Set<string>();
  const unique: PartSummary[] = [];
  for (const product of allProducts) {
    const mpn = product.ManufacturerProductNumber;
    if (seen.has(mpn)) continue;
    seen.add(mpn);
    unique.push(mapDigikeyProductToSummary(product));
  }

  if (unique.length === 0) return { type: 'none', matches: [] };
  if (unique.length === 1) return { type: 'single', matches: unique };
  return { type: 'multiple', matches: unique };
}
