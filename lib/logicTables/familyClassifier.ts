import { PartAttributes, ParametricAttribute } from '../types';

interface ClassifierRule {
  variantFamilyId: string;
  baseFamilyId: string;
  /** Returns true if attributes indicate this variant */
  matches: (attrs: PartAttributes) => boolean;
}

/**
 * Classifier rules ordered most-specific-first within each base family.
 * Each rule only fires when baseFamilyId matches, preventing cross-family false positives.
 */
const classifierRules: ClassifierRule[] = [
  // --- Resistor variants (base: 52) ---

  // Current Sense Resistors (54): very low resistance + sensing indicators
  {
    variantFamilyId: '54',
    baseFamilyId: '52',
    matches: (attrs) => {
      const resistance = getNumericParam(attrs, 'resistance');
      const desc = attrs.part.description.toLowerCase();
      const isLowValue = resistance !== null && resistance <= 1;
      const isSensing = desc.includes('current sense') ||
                        desc.includes('4-terminal') ||
                        desc.includes('kelvin');
      return isLowValue && isSensing;
    },
  },

  // Chassis Mount / High Power Resistors (55): power package or chassis-mount description
  // Tightened: high power alone is not enough — must also have a non-SMD package or explicit chassis keyword
  {
    variantFamilyId: '55',
    baseFamilyId: '52',
    matches: (attrs) => {
      const power = getNumericParam(attrs, 'power_rating');
      const pkg = (findParam(attrs, 'package_case')?.value ?? '').toUpperCase();
      const desc = attrs.part.description.toLowerCase();
      const isPowerPackage = /TO-220|TO-247|TO-263|D.?PAK/i.test(pkg);
      const isSMDChip = /^(0[1-9]\d{2}|1[0-9]\d{2}|2[0-5]\d{2})$/.test(pkg.replace(/\s/g, ''));
      const isHighPower = power !== null && power >= 5;
      const isChassisKeyword = desc.includes('chassis mount') || desc.includes('chassis-mount');
      // Power package always qualifies; high power qualifies only if NOT a standard SMD chip
      return isPowerPackage || isChassisKeyword || (isHighPower && !isSMDChip);
    },
  },

  // Through-Hole Resistors (53): axial/through-hole mounting
  {
    variantFamilyId: '53',
    baseFamilyId: '52',
    matches: (attrs) => {
      const desc = attrs.part.description.toLowerCase();
      const mountParam = findParam(attrs, 'mounting_type');
      const mount = (mountParam?.value ?? '').toLowerCase();
      return mount.includes('through hole') || mount.includes('axial') ||
             desc.includes('through hole') || desc.includes('axial');
    },
  },

  // --- Capacitor variants ---

  // Aluminum Polymer (60, base: 58): polymer in description but not tantalum
  {
    variantFamilyId: '60',
    baseFamilyId: '58',
    matches: (attrs) => {
      const desc = attrs.part.description.toLowerCase();
      const sub = attrs.part.subcategory.toLowerCase();
      const isPolymer = desc.includes('polymer') || sub.includes('polymer');
      const isTantalum = desc.includes('tantalum');
      return isPolymer && !isTantalum;
    },
  },

  // Mica Capacitors (13, base: 12): mica dielectric material
  {
    variantFamilyId: '13',
    baseFamilyId: '12',
    matches: (attrs) => {
      const desc = attrs.part.description.toLowerCase();
      const dielectric = (findParam(attrs, 'dielectric')?.value ?? '').toLowerCase();
      return desc.includes('mica') || dielectric.includes('mica');
    },
  },

  // --- Inductor variants ---

  // RF/Signal Inductors (72, base: 71): RF indicators or very low inductance with Q/SRF
  {
    variantFamilyId: '72',
    baseFamilyId: '71',
    matches: (attrs) => {
      const desc = attrs.part.description.toLowerCase();
      const sub = attrs.part.subcategory.toLowerCase();
      const hasQFactor = findParam(attrs, 'q_factor') !== null;
      const hasSRF = findParam(attrs, 'srf') !== null;
      const isRF = desc.includes('rf') || sub.includes('rf') || sub.includes('signal');
      // Very low inductance (nH range) when stored in µH
      const inductance = getNumericParam(attrs, 'inductance');
      const isNanoRange = inductance !== null && inductance < 0.001;
      return isRF || (isNanoRange && (hasQFactor || hasSRF));
    },
  },
];

/** Find a parameter by attributeId */
function findParam(attrs: PartAttributes, attrId: string): ParametricAttribute | null {
  return attrs.parameters.find(p => p.parameterId === attrId) ?? null;
}

/** Get the numeric value of a parameter, parsing from string if needed */
function getNumericParam(attrs: PartAttributes, attrId: string): number | null {
  const param = findParam(attrs, attrId);
  if (!param) return null;
  if (param.numericValue !== undefined) return param.numericValue;
  const match = param.value.match(/([-+]?\d*\.?\d+)/);
  return match ? parseFloat(match[1]) : null;
}

/**
 * Classify a part into the most specific family variant.
 *
 * Given a base family ID (from subcategory lookup) and the part's full attributes,
 * checks if any variant classifier matches. Returns the variant family ID if matched,
 * otherwise the original baseFamilyId.
 *
 * Only rules whose baseFamilyId matches are checked, preventing cross-family false positives.
 */
export function classifyFamily(baseFamilyId: string, attrs: PartAttributes): string {
  for (const rule of classifierRules) {
    if (rule.baseFamilyId === baseFamilyId && rule.matches(attrs)) {
      return rule.variantFamilyId;
    }
  }
  return baseFamilyId;
}
