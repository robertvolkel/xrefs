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
import { DigikeyProduct, DigikeyCategory, DigikeyKeywordResponse, DigikeyParameter } from './digikeyClient';
import { getParamMappings, hasCategoryMapping } from './digikeyParamMap';

/** Traverse Digikey's hierarchical category to find the most specific (deepest) name */
function getDeepestCategoryName(category: DigikeyCategory | undefined): string {
  if (!category) return '';
  let current = category;
  while (current.ChildCategories && current.ChildCategories.length > 0) {
    current = current.ChildCategories[0];
  }
  return current.Name;
}

/** Traverse Digikey's hierarchical category to find the most specific (deepest) CategoryId */
function getDeepestCategoryId(category: DigikeyCategory | undefined): number | undefined {
  if (!category) return undefined;
  let current = category;
  while (current.ChildCategories && current.ChildCategories.length > 0) {
    current = current.ChildCategories[0];
  }
  return current.CategoryId;
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
  if (lower.includes('transistor') || lower.includes('mosfet') || lower.includes('bjt') || lower.includes('igbt')) return 'Transistors';
  if (lower.includes('connector') || lower.includes('header') || lower.includes('socket')) return 'Connectors';
  if (lower.includes('varistor') || lower.includes('thermistor') || lower.includes('fuse')) return 'Protection';
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
  if (lower.includes('supercapacitor') || lower.includes('double layer')) return 'Supercapacitor';
  if (lower.includes('film capacitor')) return 'Film Capacitor';
  if (lower.includes('thick film')) return 'Thick Film';
  if (lower.includes('thin film')) return 'Thin Film';
  if (lower.includes('chip resistor') || lower.includes('surface mount')) {
    if (lower.includes('resistor')) return 'Thick Film';
  }
  if (lower.includes('fixed inductor')) return 'Fixed Inductor';
  if (lower.includes('ferrite bead')) return 'Ferrite Bead and Chip';
  if (lower.includes('common mode choke')) return 'Common Mode Choke';
  if (lower.includes('varistor')) return 'Varistor';
  if (lower.includes('ptc resettable') || lower.includes('polyfuse') || lower.includes('pptc')) return 'PTC Resettable Fuse';
  if (lower.includes('ntc thermistor')) return 'NTC Thermistor';
  if (lower.includes('ptc thermistor')) return 'PTC Thermistor';
  if (lower.includes('schottky')) return 'Schottky Diode';
  if (lower.includes('zener diode array')) return 'Diodes - Zener - Array';
  if (lower.includes('single zener') || lower.includes('zener diode')) return 'Zener Diode';
  if (lower.includes('tvs diode') || lower.includes('tvs -')) return 'TVS Diode';
  if (lower.includes('bridge rectifier')) return 'Diodes - Bridge Rectifiers';
  if (lower.includes('single diode')) return 'Rectifier Diode';
  // IGBTs (Family B7) — must be before MOSFET check
  if (lower.includes('igbt')) return 'IGBT';
  // MOSFETs (Family B5)
  if (lower.includes('mosfet') || (lower.includes('fet') && !lower.includes('fett'))) {
    if (lower.includes('p-channel') || lower.includes('p-ch')) return 'P-Channel MOSFET';
    if (lower.includes('n-channel') || lower.includes('n-ch')) return 'N-Channel MOSFET';
    if (lower.includes('sic') || lower.includes('silicon carbide')) return 'SiC MOSFET';
    if (lower.includes('gan') || lower.includes('gallium nitride')) return 'GaN FET';
    return 'MOSFET';
  }
  // BJTs (Family B6)
  if (lower.includes('bjt') || (lower.includes('bipolar') && lower.includes('transistor'))) {
    if (lower.includes('pnp')) return 'PNP BJT';
    if (lower.includes('npn')) return 'NPN BJT';
    return 'BJT';
  }
  // General transistor fallback — BJT if not MOSFET/IGBT/JFET
  if (lower.includes('transistor') && !lower.includes('mosfet') && !lower.includes('fet') && !lower.includes('igbt') && !lower.includes('jfet')) {
    if (lower.includes('pnp')) return 'PNP BJT';
    if (lower.includes('npn')) return 'NPN BJT';
    return 'BJT';
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

/** Check for AEC-Q200 in Digikey "Ratings" or "Features" text → Yes/No */
function transformToAecQ200(valueText: string): string {
  if (valueText.toUpperCase().includes('AEC-Q200')) return 'Yes';
  return 'No';
}

/** Check for anti-sulfur indication in Digikey "Features" text → Yes/No */
function transformToAntiSulfur(valueText: string): string {
  const lower = valueText.toLowerCase();
  if (lower.includes('anti-sulfur') || lower.includes('anti sulfur') || lower.includes('sulphur resistant')) return 'Yes';
  return 'No';
}

/**
 * Extract metric diameter from Digikey "Size / Dimension" field.
 * Patterns: "0.197" Dia (5.00mm)", "0.276" Dia (7.00mm)"
 * Returns the metric mm value string, e.g., "5.00mm"
 */
function transformToDiameter(valueText: string): string {
  // Try metric diameter in parentheses: "Dia (5.00mm)"
  const diaMatch = valueText.match(/Dia\s*\((\d+\.?\d*)\s*mm\)/i);
  if (diaMatch) return `${diaMatch[1]}mm`;
  // Fall back: try any "X.XXmm" in the string after "Dia"
  const diaFallback = valueText.match(/Dia[^(]*?(\d+\.?\d*)\s*mm/i);
  if (diaFallback) return `${diaFallback[1]}mm`;
  return valueText;
}

/**
 * Extract metric body length from Digikey "Size / Dimension" field.
 * Pattern: "0.906" L x 0.453" W (23.00mm x 11.50mm)"
 * Returns the metric length, e.g., "23.00mm"
 */
function transformToBodyLength(valueText: string): string {
  // Try metric dimensions in parentheses: "(23.00mm x 11.50mm)"
  const dimMatch = valueText.match(/\((\d+\.?\d*)\s*mm\s*x\s*\d+\.?\d*\s*mm\)/i);
  if (dimMatch) return `${dimMatch[1]}mm`;
  return valueText;
}

/**
 * Extract dielectric type abbreviation from Digikey "Dielectric Material" field.
 * Pattern: "Polypropylene (PP), Metallized" → "PP"
 *          "Polyester, Metallized" → "PET"
 *          "Polyphenylene Sulfide (PPS)" → "PPS"
 */
function transformToDielectricType(valueText: string): string {
  const lower = valueText.toLowerCase();
  // Try parenthesized abbreviation first: "(PP)", "(PPS)", "(PEN)"
  const abbrMatch = valueText.match(/\(([A-Z]{2,4})\)/);
  if (abbrMatch) return abbrMatch[1];
  // Fallback on material name
  if (lower.includes('polypropylene')) return 'PP';
  if (lower.includes('polyphenylene')) return 'PPS';
  if (lower.includes('polyethylene naphthalate')) return 'PEN';
  if (lower.includes('polyester') || lower.includes('polyethylene terephthalate')) return 'PET';
  return valueText;
}

/**
 * Infer self-healing capability from Digikey "Dielectric Material" field.
 * "Metallized" construction implies self-healing capability.
 */
function transformToSelfHealing(valueText: string): string {
  if (valueText.toLowerCase().includes('metallized')) return 'Yes';
  return 'No';
}

/**
 * Extract safety class (X1/X2/Y1/Y2) from Digikey "Ratings" field.
 * Pattern: "AEC-Q200, X2" → "X2", "X2" → "X2", "-" → "-"
 */
function transformToSafetyRating(valueText: string): string {
  const match = valueText.match(/\b([XY][12])\b/i);
  return match ? match[1].toUpperCase() : valueText;
}

/**
 * Extract recovery category from Digikey "Speed" compound field.
 * Values: "Standard Recovery >500ns, > 200mA (Io)" → "Standard"
 *         "Fast Recovery =< 500ns, > 200mA (Io)" → "Fast"
 *         Contains "ultrafast" → "Ultrafast"
 * Output must match the upgradeHierarchy in rectifierDiodes.ts exactly.
 */
function transformToRecoveryCategory(valueText: string): string {
  const lower = valueText.toLowerCase();
  if (lower.includes('ultrafast') || lower.includes('ultra fast')) return 'Ultrafast';
  if (lower.includes('fast')) return 'Fast';
  if (lower.includes('standard')) return 'Standard';
  return valueText;
}

/**
 * Preserve raw B-value text without SI scaling.
 * NTC B-values like "3380K" — the "K" is Kelvin, not kilo.
 * extractNumericValue would misinterpret this as 3,380,000.
 * This transformer returns the value as-is.
 */
function transformBValue(valueText: string): string {
  return valueText;
}

/**
 * Check for AEC-Q101 (or AEC-Q100) in Digikey text → Yes/No (for discrete semiconductors).
 * Digikey uses "AEC-Q100" for Zener diode categories despite Q101 being the correct
 * discrete semiconductor qualification. Both indicate automotive qualification.
 */
function transformToAecQ101(valueText: string): string {
  const upper = valueText.toUpperCase();
  if (upper.includes('AEC-Q101') || upper.includes('AEC-Q100')) return 'Yes';
  return 'No';
}

/** Normalize Schottky technology from Digikey "Technology" field */
function transformToSchottkyTechnology(valueText: string): string {
  if (valueText.toLowerCase().includes('schottky')) return 'Schottky';
  return valueText;
}

/**
 * Extract semiconductor material from Digikey "Technology" field.
 * "Schottky" → Silicon (default), "SiC (Silicon Carbide) Schottky" → SiC.
 */
function transformToSemiconductorMaterial(valueText: string): string {
  const lower = valueText.toLowerCase();
  if (lower.includes('sic') || lower.includes('silicon carbide')) return 'SiC';
  return 'Silicon';
}

/**
 * Normalize MOSFET "Technology" field to internal technology names.
 * Digikey uses: "MOSFET (Metal Oxide)" for Si, "SiCFET (Silicon Carbide)" for SiC,
 * "GaNFET (Gallium Nitride)" for GaN.
 */
function transformToMosfetTechnology(valueText: string): string {
  const lower = valueText.toLowerCase();
  if (lower.includes('sic') || lower.includes('silicon carbide')) return 'SiC';
  if (lower.includes('gan') || lower.includes('gallium nitride')) return 'GaN';
  return 'Si';
}

/**
 * Normalize TVS "Type" field to internal topology names.
 * Digikey uses "Zener" for traditional clamp TVS and "Steering (Rail to Rail)" for steering arrays.
 */
function transformToTvsTopology(valueText: string): string {
  const lower = valueText.toLowerCase();
  if (lower.includes('steering')) return 'Steering Diode Array';
  if (lower === 'zener') return 'Discrete';
  return valueText;
}

/**
 * Normalize IGBT "IGBT Type" field to internal technology abbreviations.
 * Digikey uses: "Trench Field Stop" → FS, "NPT and Trench" → NPT,
 * "PT" or "Punch-Through" → PT, "-" → empty string.
 */
function transformToIgbtTechnology(valueText: string): string {
  const lower = valueText.toLowerCase();
  if (lower === '-' || lower === '') return '';
  if (lower.includes('field stop') || lower === 'fs') return 'FS';
  if (lower.includes('npt') || lower.includes('non-punch') || lower.includes('non punch')) return 'NPT';
  if (lower.includes('pt') || lower.includes('punch-through') || lower.includes('punch through')) return 'PT';
  // "Trench" alone (without Field Stop) is typically a FS variant
  if (lower === 'trench') return 'FS';
  return valueText;
}

/**
 * Extract Eon (turn-on energy) from Digikey compound "Switching Energy" field.
 * Pattern: "600µJ (on), 580µJ (off)" → "600µJ"
 *          "4.1mJ (on), 960µJ (off)" → "4.1mJ"
 *          "1.4mJ (off)" → "" (no Eon present)
 */
function transformToEon(valueText: string): string {
  const match = valueText.match(/([\d.]+\s*[µumk]?J)\s*\(on\)/i);
  return match ? match[1].trim() : '';
}

/**
 * Extract Eoff (turn-off energy) from Digikey compound "Switching Energy" field.
 * Pattern: "600µJ (on), 580µJ (off)" → "580µJ"
 *          "1.4mJ (off)" → "1.4mJ"
 */
function transformToEoff(valueText: string): string {
  const match = valueText.match(/([\d.]+\s*[µumk]?J)\s*\(off\)/i);
  return match ? match[1].trim() : '';
}

/**
 * Extract td(on) from Digikey compound "Td (on/off) @ 25°C" field.
 * Pattern: "60ns/160ns" → "60ns"
 *          "19.5ns/103ns" → "19.5ns"
 *          "-/360ns" → "" (no td_on present)
 */
function transformToTdOn(valueText: string): string {
  const match = valueText.match(/^([\d.]+\s*[nµum]?s)\s*\//i);
  return match ? match[1].trim() : '';
}

/**
 * Extract td(off) from Digikey compound "Td (on/off) @ 25°C" field.
 * Pattern: "60ns/160ns" → "160ns"
 *          "-/360ns" → "360ns"
 */
function transformToTdOff(valueText: string): string {
  const match = valueText.match(/\/\s*([\d.]+\s*[nµum]?s)/i);
  return match ? match[1].trim() : '';
}

/** Apply value transformations based on attributeId */
function transformValue(attributeId: string, valueText: string): string {
  switch (attributeId) {
    case 'flexible_termination':
      return transformFeaturesToFlexTerm(valueText);
    case 'aec_q200':
      return transformToAecQ200(valueText);
    case 'anti_sulfur':
      return transformToAntiSulfur(valueText);
    case 'diameter':
      return transformToDiameter(valueText);
    case 'body_length':
      return transformToBodyLength(valueText);
    case 'dielectric_type':
      return transformToDielectricType(valueText);
    case 'self_healing':
      return transformToSelfHealing(valueText);
    case 'safety_rating':
      return transformToSafetyRating(valueText);
    case 'recovery_category':
      return transformToRecoveryCategory(valueText);
    case 'b_value':
      return transformBValue(valueText);
    case 'aec_q101':
      return transformToAecQ101(valueText);
    case 'schottky_technology':
      return transformToSchottkyTechnology(valueText);
    case 'semiconductor_material':
      return transformToSemiconductorMaterial(valueText);
    case 'technology':
      return transformToMosfetTechnology(valueText);
    case 'configuration':
      return transformToTvsTopology(valueText);
    case 'igbt_technology':
      return transformToIgbtTechnology(valueText);
    case 'eon':
      return transformToEon(valueText);
    case 'eoff':
      return transformToEoff(valueText);
    case 'td_on':
      return transformToTdOn(valueText);
    case 'td_off':
      return transformToTdOff(valueText);
    default:
      return valueText;
  }
}

/** Extract AEC qualifications from Digikey product parameters (scans all known fields) */
function extractQualifications(parameters: DigikeyParameter[]): string[] {
  const qualifications: string[] = [];
  const qualFields = ['Ratings', 'Features', 'Qualification'];
  for (const param of parameters) {
    if (!qualFields.includes(param.ParameterText)) continue;
    const upper = param.ValueText.toUpperCase();
    if (upper.includes('AEC-Q200') && !qualifications.includes('AEC-Q200')) qualifications.push('AEC-Q200');
    if (upper.includes('AEC-Q101') && !qualifications.includes('AEC-Q101')) qualifications.push('AEC-Q101');
    if (upper.includes('AEC-Q100') && !qualifications.includes('AEC-Q100')) qualifications.push('AEC-Q100');
  }
  return qualifications;
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
    productUrl: product.ProductUrl || undefined,
    digikeyPartNumber: product.DigiKeyPartNumber || undefined,
    rohsStatus: product.Classifications?.RohsStatus || undefined,
    moistureSensitivityLevel: product.Classifications?.MoistureSensitivityLevel || undefined,
    digikeyCategoryId: getDeepestCategoryId(product.Category),
    qualifications: extractQualifications(product.Parameters ?? []),
  };
}

/**
 * Placeholder attributes for parameters that Digikey doesn't provide but logic
 * tables expect (typically application_review rules). Keyed by category substring.
 */
const categoryPlaceholders: Record<string, ParametricAttribute[]> = {
  'Ceramic Capacitors': [
    { parameterId: 'dc_bias_derating', parameterName: 'DC Bias Derating', value: 'Consult datasheet', sortOrder: 13 },
  ],
  // Chip resistors: all attributes come from Digikey or are flag-type; no placeholders needed
  'Common Mode Chokes': [
    { parameterId: 'cm_inductance', parameterName: 'Common Mode Inductance', value: 'Consult datasheet', sortOrder: 14 },
  ],
  'Tantalum Capacitors': [
    { parameterId: 'surge_voltage', parameterName: 'Surge / Inrush Voltage', value: 'Consult datasheet', sortOrder: 10 },
    { parameterId: 'dc_bias_derating', parameterName: 'DC Bias Derating', value: 'Consult datasheet', sortOrder: 11 },
  ],
  'Tantalum - Polymer Capacitors': [
    { parameterId: 'surge_voltage', parameterName: 'Surge / Inrush Voltage', value: 'Consult datasheet', sortOrder: 10 },
    { parameterId: 'dc_bias_derating', parameterName: 'DC Bias Derating', value: 'Consult datasheet', sortOrder: 11 },
  ],
  'Aluminum - Polymer Capacitors': [
    { parameterId: 'polarization', parameterName: 'Polarization', value: 'Polar', sortOrder: 3 },
    { parameterId: 'polymer_type', parameterName: 'Conductive Polymer Type', value: 'Consult datasheet', sortOrder: 15 },
  ],
  'Electric Double Layer Capacitors': [
    { parameterId: 'cap_aging', parameterName: 'Capacitance Aging', value: 'Consult datasheet', sortOrder: 12 },
    { parameterId: 'esr_aging', parameterName: 'ESR Aging', value: 'Consult datasheet', sortOrder: 13 },
  ],
  'Varistors': [
    { parameterId: 'clamping_voltage', parameterName: 'Clamping Voltage (Vc)', value: 'Consult datasheet', sortOrder: 9 },
  ],
  'NTC Thermistors': [
    { parameterId: 'rt_curve', parameterName: 'R-T Curve Matching', value: 'Consult datasheet', sortOrder: 9 },
    { parameterId: 'dissipation_constant', parameterName: 'Dissipation Constant', value: 'Consult datasheet', sortOrder: 10 },
  ],
  'PTC Thermistors': [
    { parameterId: 'rt_curve', parameterName: 'R-T Curve Matching', value: 'Consult datasheet', sortOrder: 5 },
  ],
  'Single Diodes': [
    { parameterId: 'recovery_behavior', parameterName: 'Recovery Behavior (Soft vs. Snappy)', value: 'Consult datasheet', sortOrder: 12 },
  ],
  'Bridge Rectifiers': [
    { parameterId: 'recovery_behavior', parameterName: 'Recovery Behavior (Soft vs. Snappy)', value: 'Consult datasheet', sortOrder: 10 },
  ],
  'IGBTs': [
    { parameterId: 'tsc', parameterName: 'Short-Circuit Withstand Time (tsc)', value: 'Consult datasheet', sortOrder: 20 },
  ],
};

/** Get placeholder attributes for a category */
function getPlaceholders(categoryName: string): ParametricAttribute[] {
  const lower = categoryName.toLowerCase();
  for (const [key, placeholders] of Object.entries(categoryPlaceholders)) {
    if (lower.includes(key.toLowerCase())) return placeholders;
  }
  return [];
}

/**
 * Resolve the param map category for a product.
 * Schottky diodes share Digikey categories with standard rectifiers ("Single Diodes")
 * and non-Schottky arrays ("Diode Arrays"), but need different attributeId mappings.
 * This checks the "Technology" parameter and returns a virtual category name for routing.
 */
function resolveParamMapCategory(categoryName: string, parameters: DigikeyParameter[]): string {
  const techParam = parameters?.find(p => p.ParameterText === 'Technology');
  if (techParam && techParam.ValueText.toLowerCase().includes('schottky')) {
    const lowerCat = categoryName.toLowerCase();
    if (lowerCat.includes('single diode')) return 'Schottky Diodes';
    if (lowerCat.includes('diode array')) return 'Schottky Diode Arrays';
  }
  return categoryName;
}

/** Map a DigikeyProduct to our PartAttributes (Part + parametric attributes) */
export function mapDigikeyProductToAttributes(product: DigikeyProduct): PartAttributes {
  const part = mapDigikeyProductToPart(product);
  const categoryName = getDeepestCategoryName(product.Category);
  // Resolve to virtual category for param map routing (Schottky vs standard diodes)
  const paramMapCategory = resolveParamMapCategory(categoryName, product.Parameters ?? []);
  const parameters: ParametricAttribute[] = [];
  const addedIds = new Set<string>();

  if (product.Parameters) {
    // Build a lookup for fallback values (e.g., "Supplier Device Package" when
    // "Package / Case" is "Nonstandard", common for power inductors)
    const paramValueLookup = new Map<string, string>();
    for (const p of product.Parameters) {
      paramValueLookup.set(p.ParameterText, p.ValueText);
    }

    if (hasCategoryMapping(paramMapCategory)) {
      // Category-specific mapping: use curated param map
      for (const param of product.Parameters) {
        const mappings = getParamMappings(paramMapCategory, param.ParameterText);
        if (mappings.length === 0) continue;

        for (const mapping of mappings) {
          // Fall back to "Supplier Device Package" when Package/Case is "Nonstandard"
          let valueText = param.ValueText;
          if (mapping.attributeId === 'package_case' && valueText === 'Nonstandard') {
            const supplierPkg = paramValueLookup.get('Supplier Device Package');
            if (supplierPkg && supplierPkg !== '-') {
              valueText = supplierPkg;
            }
          }

          const transformedValue = transformValue(mapping.attributeId, valueText);
          const { numericValue, unit } = extractNumericValue(valueText);

          parameters.push({
            parameterId: mapping.attributeId,
            parameterName: mapping.attributeName,
            value: transformedValue,
            numericValue,
            unit: mapping.unit ?? unit,
            sortOrder: mapping.sortOrder,
          });
          addedIds.add(mapping.attributeId);
        }
      }

      // Extract MSL from Classifications if not already in Parameters
      if (!addedIds.has('msl') && product.Classifications?.MoistureSensitivityLevel) {
        parameters.push({
          parameterId: 'msl',
          parameterName: 'Moisture Sensitivity Level',
          value: product.Classifications.MoistureSensitivityLevel,
          sortOrder: 10,
        });
        addedIds.add('msl');
      }

      // Add placeholder attributes for params Digikey doesn't provide
      for (const placeholder of getPlaceholders(paramMapCategory)) {
        if (!addedIds.has(placeholder.parameterId)) {
          parameters.push(placeholder);
          addedIds.add(placeholder.parameterId);
        }
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

  // TVS polarity enrichment — derive from which channel field is present.
  // Digikey uses "Unidirectional Channels" vs "Bidirectional Channels" field names
  // to indicate polarity. The field value is the channel count (already mapped to num_channels).
  if (product.Parameters && !addedIds.has('polarity')) {
    const hasUni = product.Parameters.some(p => p.ParameterText === 'Unidirectional Channels');
    const hasBi = product.Parameters.some(p => p.ParameterText === 'Bidirectional Channels');
    if (hasUni || hasBi) {
      parameters.push({
        parameterId: 'polarity',
        parameterName: 'Polarity (Unidirectional vs. Bidirectional)',
        value: hasUni ? 'Unidirectional' : 'Bidirectional',
        sortOrder: 1,
      });
      addedIds.add('polarity');
    }
  }

  // IGBT co-packaged diode enrichment — infer from Reverse Recovery Time (trr) presence.
  // IGBTs do NOT have a usable intrinsic body diode. If Digikey lists trr with a
  // non-dash value, the part has a co-packaged antiparallel diode.
  if (product.Parameters && !addedIds.has('co_packaged_diode') &&
      categoryName.toLowerCase().includes('igbt')) {
    const trrParam = product.Parameters.find(p => p.ParameterText === 'Reverse Recovery Time (trr)');
    const hasDiode = trrParam && trrParam.ValueText && trrParam.ValueText !== '-';
    parameters.push({
      parameterId: 'co_packaged_diode',
      parameterName: 'Co-Packaged Antiparallel Diode',
      value: hasDiode ? 'Yes' : 'No',
      sortOrder: 3,
    });
    addedIds.add('co_packaged_diode');
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
    status: mapStatus(product.ProductStatus?.Status ?? 'Active'),
    qualifications: extractQualifications(product.Parameters ?? []),
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
