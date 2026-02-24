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

  // --- Discrete semiconductor variants ---

  // Schottky Barrier Diodes (B2, base: B1): Schottky/SBD/SiC keywords in description
  {
    variantFamilyId: 'B2',
    baseFamilyId: 'B1',
    matches: (attrs) => {
      const desc = attrs.part.description.toLowerCase();
      const mpn = attrs.part.mpn.toUpperCase();
      const sub = attrs.part.subcategory.toLowerCase();
      // Direct keyword matches
      if (desc.includes('schottky') || desc.includes('sbd') || sub.includes('schottky')) {
        return true;
      }
      // SiC diode indicators
      if (desc.includes('sic diode') || desc.includes('silicon carbide') ||
          /\bSIC\b/.test(mpn)) {
        return true;
      }
      // Voltage heuristic: silicon Schottky is ≤200V; SiC Schottky at 600V+ is still Schottky
      // but don't auto-classify by voltage alone — only as a supporting signal with other hints
      return false;
    },
  },

  // TVS Diodes / Transient Voltage Suppressors (B4, base: B1): TVS keywords, MPN prefixes
  // Must be checked BEFORE Zener (B3) since B3 excludes TVS — B4 catches them first.
  {
    variantFamilyId: 'B4',
    baseFamilyId: 'B1',
    matches: (attrs) => {
      const desc = attrs.part.description.toLowerCase();
      const mpn = attrs.part.mpn.toUpperCase();
      const sub = attrs.part.subcategory.toLowerCase();

      // Direct keyword matches
      if (desc.includes('tvs') || desc.includes('transient voltage') ||
          desc.includes('transient suppressor') || desc.includes('esd protection') ||
          desc.includes('esd suppressor') || sub.includes('tvs')) {
        return true;
      }

      // Common TVS / ESD MPN prefixes
      if (/\bSMAJ\d/.test(mpn) || /\bSMBJ\d/.test(mpn) || /\bSMCJ\d/.test(mpn) ||
          /\bP6KE/.test(mpn) || /\bPESD/.test(mpn) ||
          /\b1\.5KE/.test(mpn) || /\b5KP/.test(mpn) || /\bSMLVT/.test(mpn) ||
          /\bTPD[0-9]/.test(mpn) ||  // TI TVS array family
          /\bESDA/.test(mpn) ||       // ST TVS/ESD family
          /\bPRTR/.test(mpn) ||       // Nexperia TVS array family
          /\bUSBLC/.test(mpn)) {      // ST USB TVS
        return true;
      }

      return false;
    },
  },

  // Zener Diodes / Voltage Reference Diodes (B3, base: B1): Zener keywords, MPN prefixes
  // Must be checked AFTER TVS (B4) and Schottky (B2) to prevent false matches.
  // TVS diodes are excluded here as a safety net (B4 classifier catches them first).
  {
    variantFamilyId: 'B3',
    baseFamilyId: 'B1',
    matches: (attrs) => {
      const desc = attrs.part.description.toLowerCase();
      const mpn = attrs.part.mpn.toUpperCase();
      const sub = attrs.part.subcategory.toLowerCase();

      // Exclude TVS diodes — safety net (B4 classifier should catch these first)
      if (desc.includes('tvs') || desc.includes('transient suppressor') ||
          desc.includes('transient voltage') ||
          /\bSMAJ\d/.test(mpn) || /\bSMBJ\d/.test(mpn) ||
          /\bP6KE/.test(mpn) || /\bSMLVT/.test(mpn) ||
          /\b1\.5KE/.test(mpn) || /\b5KP/.test(mpn) ||
          sub.includes('tvs')) {
        return false;
      }

      // Direct keyword matches
      if (desc.includes('zener') || desc.includes('voltage reference diode') ||
          sub.includes('zener')) {
        return true;
      }

      // MPN prefix heuristics — common Zener families
      if (/\bBZX[0-9]/.test(mpn) || /\bBZT[0-9]/.test(mpn) ||
          /\bMMSZ/.test(mpn) || /\bDZ[0-9]/.test(mpn) ||
          /\bTZX/.test(mpn) || /\bSMZJ/.test(mpn)) {
        return true;
      }

      return false;
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

// ============================================================
// ATTRIBUTE ENRICHMENT — Rectifier Diodes (Family B1)
// ============================================================

/**
 * Infer and populate the `recovery_category` parameter for rectifier diodes
 * when the data source doesn't provide it explicitly.
 *
 * Classification logic:
 * 1. If `recovery_category` is already present, keep it.
 * 2. If `trr` (reverse recovery time) is available, classify by threshold:
 *    - trr < 100ns → Ultrafast  (spec says <50ns but allowing margin for datasheet variation)
 *    - trr < 500ns → Fast
 *    - trr ≥ 500ns → Standard
 * 3. Otherwise, infer from manufacturer family naming in the description/MPN:
 *    - "ultrafast", "UFRD", "US" prefix → Ultrafast
 *    - "fast", "FRD", "FR" prefix → Fast
 *    - "standard", "GP" (general purpose) → Standard
 *
 * Mutates `attrs.parameters` in place if recovery_category is added.
 */
export function enrichRectifierAttributes(attrs: PartAttributes): void {
  // Already has recovery_category — nothing to do
  if (findParam(attrs, 'recovery_category')) return;

  const category = inferRecoveryCategory(attrs);
  if (category) {
    attrs.parameters.push({
      parameterId: 'recovery_category',
      parameterName: 'Recovery Category',
      value: category,
      sortOrder: 0,
    });
  }
}

function inferRecoveryCategory(attrs: PartAttributes): string | null {
  // Method 1: Infer from trr value
  const trr = getNumericParam(attrs, 'trr');
  if (trr !== null) {
    // trr is typically in nanoseconds; handle µs values too
    const trrNs = parseTrrToNs(attrs);
    if (trrNs !== null) {
      if (trrNs < 100) return 'Ultrafast';
      if (trrNs < 500) return 'Fast';
      return 'Standard';
    }
  }

  // Method 2: Infer from description / MPN keywords
  const desc = attrs.part.description.toLowerCase();
  const mpn = attrs.part.mpn.toUpperCase();

  if (desc.includes('ultrafast') || desc.includes('ultra fast') ||
      /\bUFRD\b/.test(mpn) || /\bUS\d/.test(mpn)) {
    return 'Ultrafast';
  }
  if (desc.includes('fast recovery') || desc.includes('fast rectifier') ||
      /\bFRD\b/.test(mpn) || /\bFR\d/.test(mpn)) {
    return 'Fast';
  }
  if (desc.includes('standard recovery') || desc.includes('general purpose') ||
      /\bGP\b/.test(desc)) {
    return 'Standard';
  }

  return null;
}

/** Parse trr value to nanoseconds, handling ns/µs/us unit suffixes */
function parseTrrToNs(attrs: PartAttributes): number | null {
  const param = findParam(attrs, 'trr');
  if (!param) return null;

  const val = param.value.toLowerCase().replace(/\s+/g, '');
  // Match patterns like "35ns", "0.5µs", "500ns", "2us"
  const match = val.match(/([\d.]+)\s*(ns|µs|us|μs)?/);
  if (!match) return null;

  const num = parseFloat(match[1]);
  const unit = match[2] ?? 'ns';

  if (unit === 'ns') return num;
  if (unit === 'µs' || unit === 'us' || unit === 'μs') return num * 1000;
  return num; // default ns
}
