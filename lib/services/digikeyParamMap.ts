/**
 * Digikey Parameter Mapping
 *
 * Maps Digikey ParameterText strings to our internal attributeId values.
 * Organized per Digikey category. Mappings are verified against live API data
 * using `scripts/discover-digikey-params.mjs`.
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
 * A param map entry can be a single mapping or an array of mappings.
 * Arrays are used when one Digikey ParameterText produces multiple internal
 * attributes (e.g., "Features" → aec_q200 + anti_sulfur for chip resistors).
 */
export type ParamMapEntry = ParamMapping | ParamMapping[];

/**
 * MLCC parameter mapping (Family 12).
 * Verified against: GRM188R71E105KA12 (Murata)
 * Digikey category: "Ceramic Capacitors"
 */
const mlccParamMap: Record<string, ParamMapEntry> = {
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
 * Chip Resistor parameter mapping (Families 52, 53, 54, 55).
 * Verified against: CRCW060310K0FKEA (Vishay), ERA-3AEB103V (Panasonic),
 *   RC0603FR-0710KL (YAGEO), AC0603FR-0710KL (YAGEO anti-sulfur)
 * Digikey category: "Chip Resistor - Surface Mount"
 *
 * Notes from discovery:
 * - "Voltage - Rated" is NOT provided by Digikey for chip resistors
 * - "Ratings" is always "-"; AEC-Q200 is in "Features" instead
 * - "Features" is multi-valued (comma-separated): may contain AEC-Q200, Anti-Sulfur, etc.
 * - MSL comes from Classifications, not Parameters (handled in mapper)
 */
const chipResistorParamMap: Record<string, ParamMapEntry> = {
  'Resistance': {
    attributeId: 'resistance',
    attributeName: 'Resistance',
    unit: 'Ω',
    sortOrder: 1,
  },
  'Package / Case': {
    attributeId: 'package_case',
    attributeName: 'Package / Case',
    sortOrder: 2,
  },
  'Tolerance': {
    attributeId: 'tolerance',
    attributeName: 'Tolerance',
    sortOrder: 3,
  },
  'Power (Watts)': {
    attributeId: 'power_rating',
    attributeName: 'Power Rating',
    unit: 'W',
    sortOrder: 4,
  },
  'Temperature Coefficient': {
    attributeId: 'tcr',
    attributeName: 'Temperature Coefficient (TCR)',
    sortOrder: 6,
  },
  'Composition': {
    attributeId: 'composition',
    attributeName: 'Composition / Technology',
    sortOrder: 7,
  },
  'Operating Temperature': {
    attributeId: 'operating_temp',
    attributeName: 'Operating Temp Range',
    sortOrder: 8,
  },
  'Height - Seated (Max)': {
    attributeId: 'height',
    attributeName: 'Height (Seated Max)',
    unit: 'mm',
    sortOrder: 9,
  },
  'Features': [
    {
      attributeId: 'aec_q200',
      attributeName: 'AEC-Q200 Qualification',
      sortOrder: 11,
    },
    {
      attributeId: 'anti_sulfur',
      attributeName: 'Anti-Sulfur',
      sortOrder: 12,
    },
  ],
  'Packaging': {
    attributeId: 'packaging',
    attributeName: 'Packaging',
    sortOrder: 13,
  },
};

/**
 * Fixed Inductor parameter mapping (Families 71, 72).
 * Verified against: SRR1260-100M (Bourns), NR6028T100M (Taiyo Yuden),
 *   SRP1265A-100M (Bourns AEC-Q200), LQH32CN100K53L (Murata),
 *   LQW15AN3N3C80D (Murata RF)
 * Digikey category: "Fixed Inductors"
 *
 * Notes from discovery:
 * - Power inductors and RF inductors share the same Digikey category
 * - "Package / Case" is often "Nonstandard" — mapper falls back to "Supplier Device Package"
 * - AEC-Q200 appears in "Ratings" (e.g., SRP1265A-100M)
 * - "Current - Saturation (Isat)" may be "-" for some parts (e.g., LQH32CN100K53L)
 * - "Q @ Freq" is a combined value+frequency string (e.g., "32 @ 2.52MHz")
 * - MSL comes from Classifications (handled in mapper)
 */
const fixedInductorParamMap: Record<string, ParamMapEntry> = {
  'Inductance': {
    attributeId: 'inductance',
    attributeName: 'Inductance',
    unit: 'µH',
    sortOrder: 1,
  },
  'Package / Case': {
    attributeId: 'package_case',
    attributeName: 'Package / Case',
    sortOrder: 2,
  },
  'Tolerance': {
    attributeId: 'tolerance',
    attributeName: 'Tolerance',
    sortOrder: 3,
  },
  'Current - Saturation (Isat)': {
    attributeId: 'saturation_current',
    attributeName: 'Saturation Current (Isat)',
    unit: 'A',
    sortOrder: 4,
  },
  'Current Rating (Amps)': {
    attributeId: 'rated_current',
    attributeName: 'Rated Current (Irms)',
    unit: 'A',
    sortOrder: 5,
  },
  'DC Resistance (DCR)': {
    attributeId: 'dcr',
    attributeName: 'DC Resistance (DCR)',
    unit: 'Ω',
    sortOrder: 6,
  },
  'Material - Core': {
    attributeId: 'core_material',
    attributeName: 'Core Material',
    sortOrder: 7,
  },
  'Shielding': {
    attributeId: 'shielding',
    attributeName: 'Shielding',
    sortOrder: 8,
  },
  'Frequency - Self Resonant': {
    attributeId: 'srf',
    attributeName: 'Self-Resonant Frequency (SRF)',
    unit: 'MHz',
    sortOrder: 9,
  },
  'Operating Temperature': {
    attributeId: 'operating_temp',
    attributeName: 'Operating Temp Range',
    sortOrder: 10,
  },
  'Height - Seated (Max)': {
    attributeId: 'height',
    attributeName: 'Height (Seated Max)',
    unit: 'mm',
    sortOrder: 11,
  },
  'Q @ Freq': {
    attributeId: 'q_factor',
    attributeName: 'Q Factor',
    sortOrder: 12,
  },
  'Type': {
    attributeId: 'construction_type',
    attributeName: 'Construction Type',
    sortOrder: 13,
  },
  'Ratings': {
    attributeId: 'aec_q200',
    attributeName: 'AEC-Q200',
    sortOrder: 14,
  },
  'Packaging': {
    attributeId: 'packaging',
    attributeName: 'Packaging',
    sortOrder: 15,
  },
};

/**
 * Ferrite Bead parameter mapping (Family 70).
 * Verified against: BLM18PG221SN1D (Murata 220Ω), BLM15AG601SN1D (Murata 600Ω),
 *   BLM18KG601SN1D (Murata 600Ω), BLA31AG601SN4D (Murata 4-line array)
 * Digikey category: "Ferrite Beads and Chips"
 *
 * Notes from discovery:
 * - "Impedance @ Frequency" is a combined string (e.g., "220 Ohms @ 100 MHz")
 * - Height field is "Height (Max)", NOT "Height - Seated (Max)" like other categories
 * - DCR field is "DC Resistance (DCR) (Max)", NOT "DC Resistance (DCR)"
 * - Current field is "Current Rating (Max)", NOT "Current Rating (Amps)"
 * - No Tolerance, Voltage Rating, or Resistance Type parameters provided
 * - "Ratings" is always "-" in probed parts; AEC-Q200 would appear here if present
 * - "Filter Type" values: "Power Line", "-"
 * - MSL comes from Classifications (handled in mapper)
 */
const ferriteBeadParamMap: Record<string, ParamMapEntry> = {
  'Impedance @ Frequency': {
    attributeId: 'impedance_100mhz',
    attributeName: 'Impedance @ 100MHz',
    sortOrder: 1,
  },
  'Package / Case': {
    attributeId: 'package_case',
    attributeName: 'Package / Case',
    sortOrder: 2,
  },
  'Current Rating (Max)': {
    attributeId: 'rated_current',
    attributeName: 'Rated Current',
    unit: 'A',
    sortOrder: 3,
  },
  'DC Resistance (DCR) (Max)': {
    attributeId: 'dcr',
    attributeName: 'DC Resistance (DCR)',
    unit: 'Ω',
    sortOrder: 4,
  },
  'Number of Lines': {
    attributeId: 'number_of_lines',
    attributeName: 'Number of Lines',
    sortOrder: 5,
  },
  'Operating Temperature': {
    attributeId: 'operating_temp',
    attributeName: 'Operating Temp Range',
    sortOrder: 6,
  },
  'Height (Max)': {
    attributeId: 'height',
    attributeName: 'Height (Max)',
    unit: 'mm',
    sortOrder: 7,
  },
  'Ratings': {
    attributeId: 'aec_q200',
    attributeName: 'AEC-Q200',
    sortOrder: 8,
  },
  'Filter Type': {
    attributeId: 'filter_type',
    attributeName: 'Filter Type',
    sortOrder: 9,
  },
  'Packaging': {
    attributeId: 'packaging',
    attributeName: 'Packaging',
    sortOrder: 10,
  },
};

/**
 * Common Mode Choke parameter mapping (Family 69).
 * Verified against: DLW5BTM102SQ2L (Murata 1kΩ), ACM2012-900-2P-T002 (TDK 90Ω),
 *   DLW21SN900SQ2L (Murata 90Ω), ACM7060-701-2PL-TL01 (TDK 700Ω),
 *   DLW5BSM351SQ2L (Murata 350Ω)
 * Digikey category: "Common Mode Chokes"
 *
 * Notes from discovery:
 * - "Impedance @ Frequency" is a combined string (e.g., "1 kOhms @ 100 MHz")
 * - "Number of Lines" uses ParameterId 198, distinct from ferrite beads' 2169
 * - Separate "Voltage Rating - DC" and "Voltage Rating - AC" fields (AC always "-")
 * - "Filter Type" values: "Signal Line", "Power Line", "Power, Signal Line"
 * - "Approval Agency" exists but always "-" in probed parts
 * - "Features" exists but always "-" in probed parts
 * - Height field is "Height (Max)", same as ferrite beads
 * - Common mode inductance is NOT in Digikey parametric data (placeholder added in mapper)
 * - MSL comes from Classifications (handled in mapper)
 */
const commonModeChokeParamMap: Record<string, ParamMapEntry> = {
  'Impedance @ Frequency': {
    attributeId: 'cm_impedance',
    attributeName: 'Common Mode Impedance',
    sortOrder: 1,
  },
  'Number of Lines': {
    attributeId: 'number_of_lines',
    attributeName: 'Number of Lines',
    sortOrder: 2,
  },
  'Package / Case': {
    attributeId: 'package_case',
    attributeName: 'Package / Case',
    sortOrder: 3,
  },
  'Current Rating (Max)': {
    attributeId: 'rated_current',
    attributeName: 'Rated Current',
    unit: 'A',
    sortOrder: 4,
  },
  'DC Resistance (DCR) (Max)': {
    attributeId: 'dcr',
    attributeName: 'DC Resistance (DCR)',
    unit: 'Ω',
    sortOrder: 5,
  },
  'Voltage Rating - DC': {
    attributeId: 'voltage_rated',
    attributeName: 'Voltage Rating (DC)',
    unit: 'V',
    sortOrder: 6,
  },
  'Filter Type': {
    attributeId: 'application_type',
    attributeName: 'Application Type',
    sortOrder: 7,
  },
  'Operating Temperature': {
    attributeId: 'operating_temp',
    attributeName: 'Operating Temp Range',
    sortOrder: 8,
  },
  'Height (Max)': {
    attributeId: 'height',
    attributeName: 'Height (Max)',
    unit: 'mm',
    sortOrder: 9,
  },
  'Ratings': {
    attributeId: 'aec_q200',
    attributeName: 'AEC-Q200',
    sortOrder: 10,
  },
  'Approval Agency': {
    attributeId: 'safety_rating',
    attributeName: 'Safety Rating (UL/TUV)',
    sortOrder: 11,
  },
  'Features': {
    attributeId: 'interface_compliance',
    attributeName: 'Interface Compliance',
    sortOrder: 12,
  },
  'Packaging': {
    attributeId: 'packaging',
    attributeName: 'Packaging',
    sortOrder: 13,
  },
};

/**
 * Tantalum Capacitor parameter mapping (Family 59).
 * Verified against: TAJB106K016RNJ (AVX), T491B106K016AT (KEMET),
 *   293D106X9016B2TE3 (Vishay), TAJR475M010RNJ (AVX),
 *   T495D107K016ATE100 (KEMET), 593D107X9016D2TE3 (Vishay)
 * Digikey category: "Tantalum Capacitors"
 *
 * Also used for "Tantalum - Polymer Capacitors" (e.g., T520B107M006ATE070).
 * Polymer tantalum has "Ratings" (ID 707) instead of "Failure Rate" (ID 1531).
 *
 * Notes from discovery:
 * - "Type" is always "Molded" — does NOT distinguish MnO₂ vs Polymer
 *   (separate Digikey categories handle that distinction)
 * - Ripple current, leakage current, dissipation factor, and failure mode
 *   are NOT provided as Digikey parameters — matching engine handles this
 *   gracefully (both sides missing → rule passes)
 * - Standard tantalum has NO "Ratings" field; polymer tantalum does
 * - AEC-Q200 not reliably detectable — even KEMET T495 (automotive series)
 *   shows Features: "General Purpose". Check both Features and Ratings.
 * - ESR format varies: standard "2Ohm", polymer "70mOhm @ 100kHz"
 * - "Manufacturer Size Code" (R/A/B/C/D/E/V) is display-only
 * - MSL comes from Classifications (handled in mapper)
 */
const tantalumParamMap: Record<string, ParamMapEntry> = {
  'Capacitance': {
    attributeId: 'capacitance',
    attributeName: 'Capacitance',
    unit: 'µF',
    sortOrder: 1,
  },
  'Voltage - Rated': {
    attributeId: 'voltage_rated',
    attributeName: 'Voltage Rating',
    unit: 'V',
    sortOrder: 2,
  },
  'Package / Case': {
    attributeId: 'package_case',
    attributeName: 'Package / Case',
    sortOrder: 3,
  },
  'Tolerance': {
    attributeId: 'tolerance',
    attributeName: 'Tolerance',
    sortOrder: 4,
  },
  'ESR (Equivalent Series Resistance)': {
    attributeId: 'esr',
    attributeName: 'ESR',
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
  'Features': {
    attributeId: 'aec_q200',
    attributeName: 'AEC-Q200',
    sortOrder: 8,
  },
  'Ratings': {
    attributeId: 'aec_q200',
    attributeName: 'AEC-Q200',
    sortOrder: 8,
  },
  'Packaging': {
    attributeId: 'packaging',
    attributeName: 'Packaging',
    sortOrder: 9,
  },
};

/**
 * Aluminum Electrolytic Capacitor parameter mapping (Family 58).
 * Verified against: UWX1V100MCL1GB (Nichicon, SMD), EEE-FT1V101AP (Panasonic, SMD AEC-Q200),
 *   860020672012 (Würth, through-hole)
 * Digikey category: "Aluminum Electrolytic Capacitors"
 *
 * Notes from discovery:
 * - TWO ripple current fields: "Ripple Current @ Low Frequency" (120 Hz)
 *   and "Ripple Current @ High Frequency" (100 kHz). We map the high-frequency
 *   value to `ripple_current` since 100 kHz is the standard comparison point.
 * - ESR value includes frequency: "260mOhm @ 100kHz" — numeric extractor
 *   handles the first number correctly
 * - "Size / Dimension" encodes diameter: "0.197" Dia (5.00mm)" — needs
 *   custom transformer in mapper to extract metric diameter
 * - No impedance or leakage current parameters — logic table rules pass
 *   when both sides missing
 * - "Polarization" = "Polar" or "Bi-Polar"
 * - "Mounting Type" = "Surface Mount" or "Through Hole"
 * - "Ratings" shows "AEC-Q200" for automotive parts (confirmed: EEE-FT1V101AP)
 * - "Lead Spacing" shows actual value for through-hole, "-" for SMD
 * - MSL comes from Classifications (handled in mapper)
 */
const alElectrolyticParamMap: Record<string, ParamMapEntry> = {
  'Capacitance': {
    attributeId: 'capacitance',
    attributeName: 'Capacitance',
    unit: 'µF',
    sortOrder: 1,
  },
  'Voltage - Rated': {
    attributeId: 'voltage_rated',
    attributeName: 'Voltage Rating',
    unit: 'V',
    sortOrder: 2,
  },
  'Polarization': {
    attributeId: 'polarization',
    attributeName: 'Polarization',
    sortOrder: 3,
  },
  'Mounting Type': {
    attributeId: 'mounting_type',
    attributeName: 'Mounting Type',
    sortOrder: 4,
  },
  'Tolerance': {
    attributeId: 'tolerance',
    attributeName: 'Tolerance',
    sortOrder: 5,
  },
  'ESR (Equivalent Series Resistance)': {
    attributeId: 'esr',
    attributeName: 'ESR',
    sortOrder: 6,
  },
  'Ripple Current @ High Frequency': {
    attributeId: 'ripple_current',
    attributeName: 'Ripple Current',
    unit: 'A',
    sortOrder: 7,
  },
  'Lifetime @ Temp.': {
    attributeId: 'lifetime',
    attributeName: 'Lifetime / Endurance',
    sortOrder: 8,
  },
  'Operating Temperature': {
    attributeId: 'operating_temp',
    attributeName: 'Operating Temp Range',
    sortOrder: 9,
  },
  'Size / Dimension': {
    attributeId: 'diameter',
    attributeName: 'Diameter',
    unit: 'mm',
    sortOrder: 10,
  },
  'Height - Seated (Max)': {
    attributeId: 'height',
    attributeName: 'Height (Seated Max)',
    unit: 'mm',
    sortOrder: 11,
  },
  'Lead Spacing': {
    attributeId: 'lead_spacing',
    attributeName: 'Lead Spacing',
    sortOrder: 12,
  },
  'Package / Case': {
    attributeId: 'package_case',
    attributeName: 'Package / Case',
    sortOrder: 13,
  },
  'Ratings': {
    attributeId: 'aec_q200',
    attributeName: 'AEC-Q200',
    sortOrder: 14,
  },
  'Packaging': {
    attributeId: 'packaging',
    attributeName: 'Packaging',
    sortOrder: 15,
  },
};

/**
 * Aluminum Polymer Capacitor parameter mapping (Family 60).
 * Verified against: PCJ1C330MCL1GS (Nichicon, SMD AEC-Q200)
 * Digikey category: "Aluminum - Polymer Capacitors"
 *
 * Notes from discovery:
 * - Separate Digikey category from Aluminum Electrolytic
 * - Only "Ripple Current @ High Frequency" (no low-frequency field)
 * - No "Polarization" field (all aluminum polymer are polar)
 * - "Type" = "Polymer" — doesn't distinguish PEDOT vs polypyrrole
 * - "Ratings" shows AEC-Q200 when applicable (confirmed: PCJ1C330MCL1GS)
 * - "Size / Dimension" encodes diameter same as Al Electrolytic
 * - MSL from Classifications: may be "Non-JEDEC" for some polymer parts
 */
const alPolymerParamMap: Record<string, ParamMapEntry> = {
  'Capacitance': {
    attributeId: 'capacitance',
    attributeName: 'Capacitance',
    unit: 'µF',
    sortOrder: 1,
  },
  'Voltage - Rated': {
    attributeId: 'voltage_rated',
    attributeName: 'Voltage Rating',
    unit: 'V',
    sortOrder: 2,
  },
  'Mounting Type': {
    attributeId: 'mounting_type',
    attributeName: 'Mounting Type',
    sortOrder: 3,
  },
  'Tolerance': {
    attributeId: 'tolerance',
    attributeName: 'Tolerance',
    sortOrder: 4,
  },
  'ESR (Equivalent Series Resistance)': {
    attributeId: 'esr',
    attributeName: 'ESR',
    sortOrder: 5,
  },
  'Ripple Current @ High Frequency': {
    attributeId: 'ripple_current',
    attributeName: 'Ripple Current',
    unit: 'A',
    sortOrder: 6,
  },
  'Lifetime @ Temp.': {
    attributeId: 'lifetime',
    attributeName: 'Lifetime / Endurance',
    sortOrder: 7,
  },
  'Operating Temperature': {
    attributeId: 'operating_temp',
    attributeName: 'Operating Temp Range',
    sortOrder: 8,
  },
  'Size / Dimension': {
    attributeId: 'diameter',
    attributeName: 'Diameter',
    unit: 'mm',
    sortOrder: 9,
  },
  'Height - Seated (Max)': {
    attributeId: 'height',
    attributeName: 'Height (Seated Max)',
    unit: 'mm',
    sortOrder: 10,
  },
  'Lead Spacing': {
    attributeId: 'lead_spacing',
    attributeName: 'Lead Spacing',
    sortOrder: 11,
  },
  'Package / Case': {
    attributeId: 'package_case',
    attributeName: 'Package / Case',
    sortOrder: 12,
  },
  'Ratings': {
    attributeId: 'aec_q200',
    attributeName: 'AEC-Q200',
    sortOrder: 13,
  },
  'Packaging': {
    attributeId: 'packaging',
    attributeName: 'Packaging',
    sortOrder: 14,
  },
};

/**
 * Film Capacitor parameter mapping (Family 64).
 * Verified against: ECW-F2105JB (Panasonic PP), MKP1848C61060JP4 (Vishay PP),
 *   B32922C3104M000 (EPCOS/TDK X2), ECQ-U2A105ML (Panasonic X2 PET),
 *   BFC233920104 (Vishay AEC-Q200 X2)
 * Digikey category: "Film Capacitors"
 *
 * Notes from discovery:
 * - Separate AC and DC voltage fields: "Voltage Rating - AC" and "Voltage Rating - DC"
 * - "Dielectric Material" combines material + construction: "Polypropylene (PP), Metallized"
 *   → extract material type for dielectric_type, infer self_healing from "Metallized"
 * - "Ratings" conflates safety class with AEC-Q200: "AEC-Q200, X2" or "X2"
 *   → multi-map to both aec_q200 and safety_rating
 * - ESR field uses ParameterId 2082 (not 724 like other categories) but
 *   same ParameterText — our text-based mapping handles this fine
 * - ESR only present on some parts (large film caps)
 * - "Size / Dimension" has body dimensions: "0.906" L x 0.453" W (23.00mm x 11.50mm)"
 *   → extract metric length for body_length
 * - Ripple current, dV/dt, dissipation factor, and flammability NOT provided
 * - "Features" may show "Low ESR; Low ESL; Long Life" (semicolon-separated)
 * - MSL: "Not Applicable" for most film caps
 */
const filmParamMap: Record<string, ParamMapEntry> = {
  'Capacitance': {
    attributeId: 'capacitance',
    attributeName: 'Capacitance',
    unit: 'µF',
    sortOrder: 1,
  },
  'Voltage Rating - DC': {
    attributeId: 'voltage_rated_dc',
    attributeName: 'Voltage Rating (DC)',
    unit: 'V',
    sortOrder: 2,
  },
  'Voltage Rating - AC': {
    attributeId: 'voltage_rated_ac',
    attributeName: 'Voltage Rating (AC)',
    unit: 'V',
    sortOrder: 3,
  },
  'Dielectric Material': [
    {
      attributeId: 'dielectric_type',
      attributeName: 'Dielectric Type',
      sortOrder: 4,
    },
    {
      attributeId: 'self_healing',
      attributeName: 'Self-Healing',
      sortOrder: 8,
    },
  ],
  'Tolerance': {
    attributeId: 'tolerance',
    attributeName: 'Tolerance',
    sortOrder: 5,
  },
  'Package / Case': {
    attributeId: 'package_case',
    attributeName: 'Package / Case',
    sortOrder: 6,
  },
  'Lead Spacing': {
    attributeId: 'lead_spacing',
    attributeName: 'Lead Spacing / Pin Pitch',
    sortOrder: 7,
  },
  'ESR (Equivalent Series Resistance)': {
    attributeId: 'esr',
    attributeName: 'ESR',
    sortOrder: 9,
  },
  'Operating Temperature': {
    attributeId: 'operating_temp',
    attributeName: 'Operating Temp Range',
    sortOrder: 10,
  },
  'Height - Seated (Max)': {
    attributeId: 'height',
    attributeName: 'Height',
    unit: 'mm',
    sortOrder: 11,
  },
  'Size / Dimension': {
    attributeId: 'body_length',
    attributeName: 'Body Length',
    unit: 'mm',
    sortOrder: 12,
  },
  'Ratings': [
    {
      attributeId: 'aec_q200',
      attributeName: 'AEC-Q200',
      sortOrder: 13,
    },
    {
      attributeId: 'safety_rating',
      attributeName: 'Safety Rating (X/Y Class)',
      sortOrder: 14,
    },
  ],
  'Packaging': {
    attributeId: 'packaging',
    attributeName: 'Packaging',
    sortOrder: 15,
  },
};

/**
 * Supercapacitor parameter mapping (Family 61).
 * Verified against: CPH3225A (Seiko SMD), XH414HG-IV01E (Seiko coin cell),
 *   SCMR18C105PRBA0 (AVX through-hole), MAL219691102E3 (Vishay coin cell)
 * Digikey category: "Electric Double Layer Capacitors (EDLC), Supercapacitors"
 *
 * Notes from discovery:
 * - Very sparse parametric data — many fields are "-"
 * - Uses "Qualification" (ID 2700) instead of "Ratings" for AEC-Q200
 *   (always "-" in tested parts)
 * - "Grade" field (ID 1977) — always "-", intended for industrial/automotive grade
 * - Tolerance is asymmetric: "0%, +100%" or "-20%, +80%" — tolerance parser
 *   in matchingEngine may need adjustment
 * - ESR includes frequency: "200mOhm @ 1kHz" or "5Ohm @ 1kHz"
 * - Capacitance in F or mF (not µF like other caps)
 * - "Size / Dimension" encodes diameter for cylindrical types
 * - Missing from Digikey: technology, peak_current, leakage_current,
 *   self_discharge, cycle_life — matching engine handles gracefully
 */
const supercapParamMap: Record<string, ParamMapEntry> = {
  'Capacitance': {
    attributeId: 'capacitance',
    attributeName: 'Capacitance',
    unit: 'F',
    sortOrder: 1,
  },
  'Voltage - Rated': {
    attributeId: 'voltage_rated',
    attributeName: 'Voltage Rating',
    unit: 'V',
    sortOrder: 2,
  },
  'Tolerance': {
    attributeId: 'tolerance',
    attributeName: 'Tolerance',
    sortOrder: 3,
  },
  'ESR (Equivalent Series Resistance)': {
    attributeId: 'esr',
    attributeName: 'ESR',
    sortOrder: 4,
  },
  'Package / Case': {
    attributeId: 'package_case',
    attributeName: 'Package / Case',
    sortOrder: 5,
  },
  'Size / Dimension': {
    attributeId: 'diameter',
    attributeName: 'Diameter',
    unit: 'mm',
    sortOrder: 6,
  },
  'Height - Seated (Max)': {
    attributeId: 'height',
    attributeName: 'Height',
    unit: 'mm',
    sortOrder: 7,
  },
  'Lifetime @ Temp.': {
    attributeId: 'lifetime',
    attributeName: 'Lifetime / Endurance',
    sortOrder: 8,
  },
  'Operating Temperature': {
    attributeId: 'operating_temp',
    attributeName: 'Operating Temp Range',
    sortOrder: 9,
  },
  'Qualification': {
    attributeId: 'aec_q200',
    attributeName: 'AEC-Q200',
    sortOrder: 10,
  },
  'Packaging': {
    attributeId: 'packaging',
    attributeName: 'Packaging',
    sortOrder: 11,
  },
};

/**
 * Varistor / MOV parameter mapping (Family 65).
 * Verified against: ERZ-V14D201 (Panasonic, disc 14mm), B72214S0271K101 (EPCOS/TDK, disc 14mm),
 *   V14E130P (Littelfuse, disc 14mm), V5.5MLA0603NH (Littelfuse, SMD 0603),
 *   V18MLA1206H (Littelfuse, SMD 1206)
 * Digikey category: "Varistors, MOVs"
 *
 * Notes from discovery:
 * - Uses "Qualification" (not "Ratings") for AEC-Q200 — same as supercapacitors
 * - No Ratings or Features field exists for this category
 * - Varistor Voltage has Min/Typ/Max — we use Typ (standard 1mA specification)
 * - "Maximum AC Volts" is the continuous AC voltage; DC is separate (mapped AC only)
 * - Clamping voltage is NOT in Digikey parametric data (weight 9 in logic table — major gap)
 * - Response time, leakage current, surge pulse lifetime, safety rating,
 *   thermal disconnect are NOT in Digikey parametric data
 * - Disc diameter is embedded in Package/Case: "Disc 15.5mm"; SMD uses standard codes
 * - "Capacitance @ Frequency" is varistor-specific (not in logic table — skipped)
 */
const varistorParamMap: Record<string, ParamMapEntry> = {
  'Varistor Voltage (Typ)': {
    attributeId: 'varistor_voltage',
    attributeName: 'Varistor Voltage (V₁ₘₐ)',
    unit: 'V',
    sortOrder: 1,
  },
  'Maximum AC Volts': {
    attributeId: 'max_continuous_voltage',
    attributeName: 'Maximum Continuous Voltage (AC)',
    unit: 'V',
    sortOrder: 2,
  },
  'Current - Surge': {
    attributeId: 'peak_surge_current',
    attributeName: 'Peak Surge Current (8/20µs)',
    unit: 'A',
    sortOrder: 3,
  },
  'Energy': {
    attributeId: 'energy_rating',
    attributeName: 'Energy Rating',
    unit: 'J',
    sortOrder: 4,
  },
  'Package / Case': {
    attributeId: 'package_case',
    attributeName: 'Package / Form Factor',
    sortOrder: 5,
  },
  'Operating Temperature': {
    attributeId: 'operating_temp',
    attributeName: 'Operating Temp Range',
    sortOrder: 6,
  },
  'Qualification': {
    attributeId: 'aec_q200',
    attributeName: 'AEC-Q200',
    sortOrder: 7,
  },
  'Packaging': {
    attributeId: 'packaging',
    attributeName: 'Packaging',
    sortOrder: 8,
  },
};

/**
 * PTC Resettable Fuse parameter mapping (Family 66).
 * Verified against: MF-MSMF050-2 (Bourns, SMD 1812 AEC-Q200),
 *   RXEF050 (Littelfuse, through-hole radial), 1210L050YR (Littelfuse, SMD 1210)
 * Digikey category: "PTC Resettable Fuses"
 *
 * Notes from discovery:
 * - AEC-Q200 appears in "Ratings" (not "Qualification") — confirmed on MF-MSMF050-2
 * - Height has TWO fields: "Height - Seated (Max)" for TH, "Thickness (Max)" for SMD.
 *   Only one is populated per part. Both map to `height`; the last non-"-" value wins
 *   in the matching engine's buildParamMap (Map overwrites on same key).
 * - "Grade" field: "Automotive" when AEC-Q200 qualified — display only
 * - Power dissipation, endurance cycles, safety rating are NOT in Digikey parametric data
 * - Values have inline units: "500 mA", "15V", "100 A", "150 ms", "150 mOhms"
 */
const ptcResettableFuseParamMap: Record<string, ParamMapEntry> = {
  'Current - Hold (Ih) (Max)': {
    attributeId: 'hold_current',
    attributeName: 'Hold Current (Ihold)',
    unit: 'A',
    sortOrder: 1,
  },
  'Current - Trip (It)': {
    attributeId: 'trip_current',
    attributeName: 'Trip Current (Itrip)',
    unit: 'A',
    sortOrder: 2,
  },
  'Voltage - Max': {
    attributeId: 'max_voltage',
    attributeName: 'Maximum Voltage (Vmax)',
    unit: 'V',
    sortOrder: 3,
  },
  'Current - Max': {
    attributeId: 'max_fault_current',
    attributeName: 'Maximum Fault Current (Imax)',
    unit: 'A',
    sortOrder: 4,
  },
  'Time to Trip': {
    attributeId: 'time_to_trip',
    attributeName: 'Time-to-Trip',
    sortOrder: 5,
  },
  'Resistance - Initial (Ri) (Min)': {
    attributeId: 'initial_resistance',
    attributeName: 'Initial Resistance (R₁)',
    unit: 'Ω',
    sortOrder: 6,
  },
  'Resistance - Post Trip (R1) (Max)': {
    attributeId: 'post_trip_resistance',
    attributeName: 'Post-Trip Resistance (R1max)',
    unit: 'Ω',
    sortOrder: 7,
  },
  'Package / Case': {
    attributeId: 'package_case',
    attributeName: 'Package / Form Factor',
    sortOrder: 8,
  },
  'Operating Temperature': {
    attributeId: 'operating_temp',
    attributeName: 'Operating Temp Range',
    sortOrder: 9,
  },
  'Height - Seated (Max)': {
    attributeId: 'height',
    attributeName: 'Height (Seated Max)',
    unit: 'mm',
    sortOrder: 10,
  },
  'Thickness (Max)': {
    attributeId: 'height',
    attributeName: 'Height (Seated Max)',
    unit: 'mm',
    sortOrder: 10,
  },
  'Ratings': {
    attributeId: 'aec_q200',
    attributeName: 'AEC-Q200',
    sortOrder: 11,
  },
  'Packaging': {
    attributeId: 'packaging',
    attributeName: 'Packaging',
    sortOrder: 12,
  },
};

/**
 * NTC Thermistor parameter mapping (Family 67).
 * Verified against: NCP15XH103F03RC (Murata, 10kΩ 0402),
 *   NTCG103JF103FT1 (TDK, 10kΩ 0402), B57861S0103F040 (EPCOS/TDK, bead AEC-Q200)
 * Digikey category: "NTC Thermistors"
 *
 * Notes from discovery:
 * - Multiple B-value fields: B0/50, B25/50, B25/75, B25/85, B25/100. We map B25/50
 *   as primary (most commonly populated for SMD chip NTCs). Bead types may only have
 *   B25/100 — those won't have a b_value match (accepted known limitation).
 * - B-value format "3380K" — K is Kelvin, NOT kilo. The `transformBValue` transformer
 *   preserves raw text to avoid SI prefix misinterpretation.
 * - AEC-Q200 in "Qualification" field (confirmed: B57861S0103F040)
 * - "Resistance in Ohms @ 25°C" uses "k" suffix ("10k") — extractNumericValue handles this
 * - R-T curve, thermal time constant, dissipation constant, application category,
 *   height, interchangeability are NOT in Digikey parametric data
 */
const ntcThermistorParamMap: Record<string, ParamMapEntry> = {
  'Resistance in Ohms @ 25°C': {
    attributeId: 'resistance_r25',
    attributeName: 'Resistance @ 25°C (R25)',
    unit: 'Ω',
    sortOrder: 1,
  },
  'B25/50': {
    attributeId: 'b_value',
    attributeName: 'B-Value (B25/50)',
    sortOrder: 2,
  },
  'Resistance Tolerance': {
    attributeId: 'r25_tolerance',
    attributeName: 'R25 Tolerance',
    sortOrder: 3,
  },
  'B Value Tolerance': {
    attributeId: 'b_value_tolerance',
    attributeName: 'B-Value Tolerance',
    sortOrder: 4,
  },
  'Operating Temperature': {
    attributeId: 'operating_temp',
    attributeName: 'Operating Temp Range',
    sortOrder: 5,
  },
  'Power - Max': {
    attributeId: 'max_power',
    attributeName: 'Maximum Power',
    unit: 'W',
    sortOrder: 6,
  },
  'Package / Case': {
    attributeId: 'package_case',
    attributeName: 'Package / Case',
    sortOrder: 7,
  },
  'Qualification': {
    attributeId: 'aec_q200',
    attributeName: 'AEC-Q200',
    sortOrder: 8,
  },
};

/**
 * PTC Thermistor parameter mapping (Family 68).
 * Verified against: B59100M1120A070 (EPCOS/TDK, bead), B59901D0070A040 (EPCOS/TDK, radial)
 * Digikey category: "PTC Thermistors"
 *
 * Notes from discovery:
 * - EXTREMELY sparse — only 6 parameters from Digikey, 4 mappable to logic table rules
 * - Operating Temperature is the PTC switch/sense range (e.g., "90°C ~ 160°C"),
 *   NOT ambient. This is correct for cross-referencing (comparing switch ranges).
 * - "Resistance @ 25°C" (with @) — different ParameterText from NTC's
 *   "Resistance in Ohms @ 25°C"
 * - Resistance Tolerance exists but always "-" for probed parts
 * - No AEC-Q200 data at all — no Ratings, Features, or Qualification field
 * - Curie/switch temp, B-value tolerance, max voltage/current/power, trip current,
 *   hold current, height, interchangeability all NOT in Digikey parametric data
 */
const ptcThermistorParamMap: Record<string, ParamMapEntry> = {
  'Resistance @ 25°C': {
    attributeId: 'resistance_r25',
    attributeName: 'Resistance @ 25°C (R25)',
    unit: 'Ω',
    sortOrder: 1,
  },
  'Resistance Tolerance': {
    attributeId: 'r25_tolerance',
    attributeName: 'R25 Tolerance',
    sortOrder: 2,
  },
  'Operating Temperature': {
    attributeId: 'operating_temp',
    attributeName: 'Operating Temp Range',
    sortOrder: 3,
  },
  'Package / Case': {
    attributeId: 'package_case',
    attributeName: 'Package / Case',
    sortOrder: 4,
  },
};

/**
 * Single Diode (Rectifier) parameter mapping (Family B1).
 * Verified against: S1M-13-F (Diodes Inc, SMA standard), 1N4007-E3/54 (Vishay, DO-41 standard),
 *   STTH1R06RL (ST, DO-41 fast), BYV29X-600,127 (WeEn, TO-220FP fast),
 *   MURS120-13-F (Diodes Inc, SMB ultrafast), STPS2L60A (ST, SMA Schottky)
 * Digikey category: "Single Diodes"
 *
 * Notes from discovery:
 * - "Speed" is a compound field encoding recovery category + threshold:
 *   "Standard Recovery >500ns, > 200mA (Io)", "Fast Recovery =< 500ns, > 200mA (Io)"
 *   → transformToRecoveryCategory() extracts "Standard"/"Fast"/"Ultrafast"
 * - Gives Vdc (Voltage - DC Reverse), NOT Vrrm. Vrrm is in logic table but not Digikey.
 * - "Voltage - Forward (Vf) (Max) @ If" is compound: "1.1 V @ 1 A"
 *   → extractNumericValue gets 1.1 correctly
 * - "Operating Temperature - Junction" format varies: "-65°C ~ 150°C" or "175°C (Max)"
 * - trr not always present (missing for some standard recovery diodes)
 * - No AEC-Q101 anywhere in parametric data
 * - No Ifsm, Qrr, configuration, pin configuration, Rth_jc, Rth_ja, Pd, height
 * - Schottky diodes appear here too (Technology: "Schottky") — recovery_category
 *   hierarchy handles this (Schottky won't match "Standard"/"Fast"/"Ultrafast")
 */
const singleDiodeParamMap: Record<string, ParamMapEntry> = {
  'Voltage - DC Reverse (Vr) (Max)': {
    attributeId: 'vdc',
    attributeName: 'Max DC Blocking Voltage (Vdc)',
    unit: 'V',
    sortOrder: 1,
  },
  'Current - Average Rectified (Io)': {
    attributeId: 'io_avg',
    attributeName: 'Average Rectified Forward Current (Io)',
    unit: 'A',
    sortOrder: 2,
  },
  'Voltage - Forward (Vf) (Max) @ If': {
    attributeId: 'vf',
    attributeName: 'Forward Voltage Drop (Vf)',
    unit: 'V',
    sortOrder: 3,
  },
  'Speed': {
    attributeId: 'recovery_category',
    attributeName: 'Recovery Category',
    sortOrder: 4,
  },
  'Reverse Recovery Time (trr)': {
    attributeId: 'trr',
    attributeName: 'Reverse Recovery Time (trr)',
    sortOrder: 5,
  },
  'Current - Reverse Leakage @ Vr': {
    attributeId: 'ir_leakage',
    attributeName: 'Reverse Leakage Current (Ir)',
    sortOrder: 6,
  },
  'Capacitance @ Vr, F': {
    attributeId: 'cj',
    attributeName: 'Junction Capacitance (Cj)',
    sortOrder: 7,
  },
  'Mounting Type': {
    attributeId: 'mounting_style',
    attributeName: 'Mounting Style',
    sortOrder: 8,
  },
  'Package / Case': {
    attributeId: 'package_case',
    attributeName: 'Package / Form Factor',
    sortOrder: 9,
  },
  'Operating Temperature - Junction': {
    attributeId: 'operating_temp',
    attributeName: 'Operating Temperature Range',
    sortOrder: 10,
  },
  'Packaging': {
    attributeId: 'packaging',
    attributeName: 'Packaging',
    sortOrder: 11,
  },
};

/**
 * Bridge Rectifier parameter mapping (Family B1).
 * Verified against: GBJ2510-F (Diodes Inc, GBJ 25A), DF10S-E3/45 (Vishay, SMD 1A)
 * Digikey category: "Bridge Rectifiers"
 *
 * Notes from discovery:
 * - Different field names from "Single Diodes" — separate param map needed
 * - Uses "Voltage - Peak Reverse (Max)" → Vrrm (single diodes use "Voltage - DC Reverse")
 * - Uses different ParameterID for Current (2158 vs 914) but same ParameterText — fine
 * - "Diode Type" = "Single Phase" / "Three Phase" — maps to configuration as-is
 * - No Speed, trr, or Capacitance fields
 * - No AEC-Q101 anywhere
 * - No Ifsm, Qrr, recovery_behavior, pin_configuration, Rth_jc, Rth_ja, Pd, height
 * - Operating Temperature uses standard format: "-65°C ~ 150°C (TJ)"
 */
const bridgeRectifierParamMap: Record<string, ParamMapEntry> = {
  'Voltage - Peak Reverse (Max)': {
    attributeId: 'vrrm',
    attributeName: 'Max Repetitive Peak Reverse Voltage (Vrrm)',
    unit: 'V',
    sortOrder: 1,
  },
  'Current - Average Rectified (Io)': {
    attributeId: 'io_avg',
    attributeName: 'Average Rectified Forward Current (Io)',
    unit: 'A',
    sortOrder: 2,
  },
  'Voltage - Forward (Vf) (Max) @ If': {
    attributeId: 'vf',
    attributeName: 'Forward Voltage Drop (Vf)',
    unit: 'V',
    sortOrder: 3,
  },
  'Current - Reverse Leakage @ Vr': {
    attributeId: 'ir_leakage',
    attributeName: 'Reverse Leakage Current (Ir)',
    sortOrder: 4,
  },
  'Diode Type': {
    attributeId: 'configuration',
    attributeName: 'Configuration',
    sortOrder: 5,
  },
  'Mounting Type': {
    attributeId: 'mounting_style',
    attributeName: 'Mounting Style',
    sortOrder: 6,
  },
  'Package / Case': {
    attributeId: 'package_case',
    attributeName: 'Package / Form Factor',
    sortOrder: 7,
  },
  'Operating Temperature': {
    attributeId: 'operating_temp',
    attributeName: 'Operating Temperature Range',
    sortOrder: 8,
  },
  'Packaging': {
    attributeId: 'packaging',
    attributeName: 'Packaging',
    sortOrder: 9,
  },
};

/**
 * Single Schottky Diode parameter mapping (Family B2).
 * Verified against: STPS2L60A (ST, SMA 60V 2A), SS34-E3/57T (Vishay, SMB 40V 3A),
 *   1N5819-E3/54 (Vishay, DO-41 40V 1A)
 * Digikey category: "Single Diodes" (same as B1 rectifier diodes — virtual category
 *   "Schottky Diodes" resolved by digikeyMapper.resolveParamMapCategory())
 *
 * Notes from discovery:
 * - Schottky diodes appear in "Single Diodes" alongside standard rectifiers
 *   → routing uses the "Technology" parameter ("Schottky" or "SiC ... Schottky")
 * - "Technology" multi-maps to: schottky_technology (identity, w10) + semiconductor_material (identity_flag, w9)
 * - "Voltage - DC Reverse (Vr) (Max)" maps to vrrm (B2 has no Vdc, unlike B1)
 * - "Speed" is SKIPPED — misleadingly shows "Fast Recovery" for Schottky
 * - "Reverse Recovery Time (trr)" is SKIPPED — not applicable for majority carrier device
 * - "Capacitance @ Vr, F" is sparse (often "-") but sometimes populated
 * - No Ifsm, Rth_jc, Rth_ja, Tj_max, Pd, pin_configuration, height, or AEC-Q101
 * - technology_trench_planar and vf_tempco not in Digikey parametric data
 */
const schottkyDiodeParamMap: Record<string, ParamMapEntry> = {
  'Technology': [
    {
      attributeId: 'schottky_technology',
      attributeName: 'Schottky Technology',
      sortOrder: 1,
    },
    {
      attributeId: 'semiconductor_material',
      attributeName: 'Semiconductor Material (Si vs SiC)',
      sortOrder: 2,
    },
  ],
  'Voltage - DC Reverse (Vr) (Max)': {
    attributeId: 'vrrm',
    attributeName: 'Max Repetitive Peak Reverse Voltage (Vrrm)',
    unit: 'V',
    sortOrder: 3,
  },
  'Current - Average Rectified (Io)': {
    attributeId: 'io_avg',
    attributeName: 'Average Rectified Forward Current (Io)',
    unit: 'A',
    sortOrder: 4,
  },
  'Voltage - Forward (Vf) (Max) @ If': {
    attributeId: 'vf',
    attributeName: 'Forward Voltage Drop (Vf)',
    unit: 'V',
    sortOrder: 5,
  },
  'Current - Reverse Leakage @ Vr': {
    attributeId: 'ir_leakage',
    attributeName: 'Reverse Leakage Current (Ir)',
    sortOrder: 6,
  },
  'Capacitance @ Vr, F': {
    attributeId: 'cj',
    attributeName: 'Junction Capacitance (Cj)',
    sortOrder: 7,
  },
  'Mounting Type': {
    attributeId: 'mounting_style',
    attributeName: 'Mounting Style',
    sortOrder: 8,
  },
  'Package / Case': {
    attributeId: 'package_case',
    attributeName: 'Package / Form Factor',
    sortOrder: 9,
  },
  'Operating Temperature - Junction': {
    attributeId: 'operating_temp',
    attributeName: 'Operating Temperature Range',
    sortOrder: 10,
  },
  'Packaging': {
    attributeId: 'packaging',
    attributeName: 'Packaging',
    sortOrder: 11,
  },
};

/**
 * Schottky Diode Array parameter mapping (Family B2).
 * Verified against: SCS220AE2HRC11 (ROHM, SiC 650V TO-247N dual),
 *   BAT54S-7-F (Diodes Inc, 30V SOT-23 dual)
 * Digikey category: "Diode Arrays" (virtual category "Schottky Diode Arrays"
 *   resolved by digikeyMapper.resolveParamMapCategory())
 *
 * Notes from discovery:
 * - Different field names from "Single Diodes":
 *   "Current - Average Rectified (Io) (per Diode)" instead of "... (Io)"
 *   "Diode Configuration" provides configuration (Common Cathode, Series, etc.)
 * - SiC part: Technology = "SiC (Silicon Carbide) Schottky" → semiconductor_material = SiC
 * - "Reverse Recovery Time (trr)" present but SKIPPED (shows "0 ns" for SiC)
 * - No Capacitance field in diode arrays
 * - Speed is SKIPPED (shows "No Recovery Time" or "Small Signal" — not useful)
 */
const schottkyDiodeArrayParamMap: Record<string, ParamMapEntry> = {
  'Diode Configuration': {
    attributeId: 'configuration',
    attributeName: 'Configuration',
    sortOrder: 1,
  },
  'Technology': [
    {
      attributeId: 'schottky_technology',
      attributeName: 'Schottky Technology',
      sortOrder: 2,
    },
    {
      attributeId: 'semiconductor_material',
      attributeName: 'Semiconductor Material (Si vs SiC)',
      sortOrder: 3,
    },
  ],
  'Voltage - DC Reverse (Vr) (Max)': {
    attributeId: 'vrrm',
    attributeName: 'Max Repetitive Peak Reverse Voltage (Vrrm)',
    unit: 'V',
    sortOrder: 4,
  },
  'Current - Average Rectified (Io) (per Diode)': {
    attributeId: 'io_avg',
    attributeName: 'Average Rectified Forward Current (Io)',
    unit: 'A',
    sortOrder: 5,
  },
  'Voltage - Forward (Vf) (Max) @ If': {
    attributeId: 'vf',
    attributeName: 'Forward Voltage Drop (Vf)',
    unit: 'V',
    sortOrder: 6,
  },
  'Current - Reverse Leakage @ Vr': {
    attributeId: 'ir_leakage',
    attributeName: 'Reverse Leakage Current (Ir)',
    sortOrder: 7,
  },
  'Mounting Type': {
    attributeId: 'mounting_style',
    attributeName: 'Mounting Style',
    sortOrder: 8,
  },
  'Package / Case': {
    attributeId: 'package_case',
    attributeName: 'Package / Form Factor',
    sortOrder: 9,
  },
  'Operating Temperature - Junction': {
    attributeId: 'operating_temp',
    attributeName: 'Operating Temperature Range',
    sortOrder: 10,
  },
  'Packaging': {
    attributeId: 'packaging',
    attributeName: 'Packaging',
    sortOrder: 11,
  },
};

/**
 * Single Zener Diode parameter mapping (Family B3).
 * Verified against: BZX84C5V1-7-F (Diodes Inc, SOT-23 300mW), MMSZ5231B-7-F (Diodes Inc, SOD-123 500mW),
 *   BZT52C5V1-7-F (Diodes Inc, SOD-123 500mW), 1N4733A-TP (MCC, DO-41 1W),
 *   1SMB5918BT3G (onsemi, SMB 3W), BZX84-A5V1,215 (Nexperia, SOT-23 ±1%),
 *   MMSZ4684T1G (onsemi, SOD-123 3.3V), MMBZ5241BLT1G (onsemi, SOT-23 11V)
 * Digikey category: "Single Zener Diodes"
 *
 * Notes from discovery:
 * - Zener diodes have their OWN Digikey categories (not mixed with "Single Diodes" like Schottky)
 *   → no resolveParamMapCategory() routing needed
 * - "Voltage - Zener (Nom) (Vz)" is the primary spec — format "5.1 V"
 * - "Power - Max" replaces Io as the current-equivalent spec — format "300 mW", "1 W", "3 W"
 * - "Impedance (Max) (Zzt)" is dynamic impedance — format "60 Ohms", "7 Ohms"
 *   Sometimes "-" on low-voltage Zeners (3.3V) where impedance is very high
 * - "Qualification" shows "AEC-Q100" (NOT AEC-Q101) — Digikey categorization anomaly
 *   for discrete semiconductors. transformToAecQ101() handles both Q100 and Q101.
 * - "Grade" field: "Automotive" or "-" — display only, not mapped
 * - Missing from Digikey parametric data:
 *   Izt (w8), TC (w7), Izm (w6), Rth_ja (w6), Tj_max (w6), Cj (w4),
 *   Zzk (w4), regulation_type (w3), pin_configuration (w10), height (w5)
 * - No "Packaging" as a parametric field (handled at product level)
 * - Weight coverage: ~51% (76/150)
 */
const singleZenerDiodeParamMap: Record<string, ParamMapEntry> = {
  'Voltage - Zener (Nom) (Vz)': {
    attributeId: 'vz',
    attributeName: 'Zener Voltage (Vz)',
    unit: 'V',
    sortOrder: 1,
  },
  'Tolerance': {
    attributeId: 'vz_tolerance',
    attributeName: 'Zener Voltage Tolerance',
    sortOrder: 2,
  },
  'Power - Max': {
    attributeId: 'pd',
    attributeName: 'Power Dissipation (Pd)',
    unit: 'W',
    sortOrder: 3,
  },
  'Impedance (Max) (Zzt)': {
    attributeId: 'zzt',
    attributeName: 'Dynamic Impedance (Zzt)',
    unit: 'Ω',
    sortOrder: 4,
  },
  'Current - Reverse Leakage @ Vr': {
    attributeId: 'ir_leakage',
    attributeName: 'Reverse Leakage Current (Ir)',
    sortOrder: 5,
  },
  'Voltage - Forward (Vf) (Max) @ If': {
    attributeId: 'vf',
    attributeName: 'Forward Voltage (Vf)',
    unit: 'V',
    sortOrder: 6,
  },
  'Operating Temperature': {
    attributeId: 'operating_temp',
    attributeName: 'Operating Temperature Range',
    sortOrder: 7,
  },
  'Qualification': {
    attributeId: 'aec_q101',
    attributeName: 'AEC-Q101 Qualification',
    sortOrder: 8,
  },
  'Mounting Type': {
    attributeId: 'mounting_style',
    attributeName: 'Mounting Style',
    sortOrder: 9,
  },
  'Package / Case': {
    attributeId: 'package_case',
    attributeName: 'Package / Form Factor',
    sortOrder: 10,
  },
};

/**
 * Zener Diode Array parameter mapping (Family B3).
 * Verified against: BZB84-C5V1,215 (Nexperia, SOT-23 dual common anode, AEC-Q100),
 *   AZ23C5V1-7-F (Diodes Inc, SOT-23 dual common anode)
 * Digikey category: "Zener Diode Arrays"
 *
 * Notes from discovery:
 * - Adds "Configuration" field (e.g., "1 Pair Common Anode") — identity match
 * - "Qualification" shows "AEC-Q100" with "Grade: Automotive" on automotive parts
 * - Some fields from Single Zeners may be absent: Ir and Vf were missing on AZ23C
 * - Same coverage gaps as Single Zener Diodes for Izt, TC, Izm, etc.
 */
const zenerDiodeArrayParamMap: Record<string, ParamMapEntry> = {
  'Configuration': {
    attributeId: 'configuration',
    attributeName: 'Configuration',
    sortOrder: 1,
  },
  'Voltage - Zener (Nom) (Vz)': {
    attributeId: 'vz',
    attributeName: 'Zener Voltage (Vz)',
    unit: 'V',
    sortOrder: 2,
  },
  'Tolerance': {
    attributeId: 'vz_tolerance',
    attributeName: 'Zener Voltage Tolerance',
    sortOrder: 3,
  },
  'Power - Max': {
    attributeId: 'pd',
    attributeName: 'Power Dissipation (Pd)',
    unit: 'W',
    sortOrder: 4,
  },
  'Impedance (Max) (Zzt)': {
    attributeId: 'zzt',
    attributeName: 'Dynamic Impedance (Zzt)',
    unit: 'Ω',
    sortOrder: 5,
  },
  'Current - Reverse Leakage @ Vr': {
    attributeId: 'ir_leakage',
    attributeName: 'Reverse Leakage Current (Ir)',
    sortOrder: 6,
  },
  'Voltage - Forward (Vf) (Max) @ If': {
    attributeId: 'vf',
    attributeName: 'Forward Voltage (Vf)',
    unit: 'V',
    sortOrder: 7,
  },
  'Operating Temperature': {
    attributeId: 'operating_temp',
    attributeName: 'Operating Temperature Range',
    sortOrder: 8,
  },
  'Qualification': {
    attributeId: 'aec_q101',
    attributeName: 'AEC-Q101 Qualification',
    sortOrder: 9,
  },
  'Mounting Type': {
    attributeId: 'mounting_style',
    attributeName: 'Mounting Style',
    sortOrder: 10,
  },
  'Package / Case': {
    attributeId: 'package_case',
    attributeName: 'Package / Form Factor',
    sortOrder: 11,
  },
};

/**
 * TVS Diode parameter mapping (Family B4).
 * Verified against: SMBJ5.0A-13-F (Diodes Inc, SMB 600W unidirectional),
 *   SMAJ12A-E3/61 (Vishay, SMA 400W), SMCJ24A-E3/57T (Vishay, SMC 1500W),
 *   SMBJ5.0CA-13-F (Diodes Inc, SMB 600W bidirectional),
 *   TPD4E05U06DQAR (TI, 10-USON 4-channel steering array for HDMI),
 *   USBLC6-2SC6Y (ST, SOT-23-6 2-channel steering, AEC-Q101),
 *   P6KE15A-E3/54 (Vishay, DO-15 600W through-hole),
 *   SM712-02HTG (Littelfuse, SOT-23 dual bidirectional CAN bus, AEC-Q101),
 *   PRTR5V0U2X,215 (Nexperia, SOT-143B 2-channel steering, ultra-low-cap)
 * Digikey category: "TVS Diodes" (single category — no separate array category)
 *
 * Notes from discovery:
 * - ALL TVS diodes are in ONE category "TVS Diodes" (no arrays sub-category)
 * - Polarity is encoded in the FIELD NAME, not a separate polarity field:
 *   "Unidirectional Channels" (ID 1729) vs "Bidirectional Channels" (ID 1730)
 *   → polarity is derived in digikeyMapper.ts via enrichment (not param map)
 *   → channel count (1, 2, 4) maps to num_channels
 * - "Type" (ID 183) distinguishes topology: "Zener" = traditional clamp,
 *   "Steering (Rail to Rail)" = steering diode array → maps to configuration
 * - "Capacitance @ Frequency" is often "-" but sometimes has values (1pF, 75pF)
 * - "Power Line Protection" (Yes/No) and "Applications" are display-only
 * - "Voltage - Clamping (Max) @ Ipp" and "Current - Peak Pulse" may be "-"
 *   for ESD-only steering arrays (low power, no 10/1000µs rating)
 * - Missing from Digikey parametric data:
 *   ir_leakage (w5), response_time (w6), esd_rating (w7), pin_configuration (w10),
 *   height (w5), rth_ja (w5), tj_max (w6), pd (w5), surge_standard (w8)
 * - Weight coverage: ~70% (128/182)
 */
const tvsDiodeParamMap: Record<string, ParamMapEntry> = {
  'Unidirectional Channels': {
    attributeId: 'num_channels',
    attributeName: 'Number of Channels / Lines',
    sortOrder: 2,
  },
  'Bidirectional Channels': {
    attributeId: 'num_channels',
    attributeName: 'Number of Channels / Lines',
    sortOrder: 2,
  },
  'Voltage - Reverse Standoff (Typ)': {
    attributeId: 'vrwm',
    attributeName: 'Standoff Voltage (Vrwm)',
    unit: 'V',
    sortOrder: 3,
  },
  'Voltage - Breakdown (Min)': {
    attributeId: 'vbr',
    attributeName: 'Breakdown Voltage (Vbr)',
    unit: 'V',
    sortOrder: 4,
  },
  'Voltage - Clamping (Max) @ Ipp': {
    attributeId: 'vc',
    attributeName: 'Clamping Voltage (Vc)',
    unit: 'V',
    sortOrder: 5,
  },
  'Current - Peak Pulse (10/1000µs)': {
    attributeId: 'ipp',
    attributeName: 'Peak Pulse Current (Ipp)',
    unit: 'A',
    sortOrder: 6,
  },
  'Power - Peak Pulse': {
    attributeId: 'ppk',
    attributeName: 'Peak Pulse Power (Ppk)',
    unit: 'W',
    sortOrder: 7,
  },
  'Type': {
    attributeId: 'configuration',
    attributeName: 'Configuration / Topology',
    sortOrder: 8,
  },
  'Capacitance @ Frequency': {
    attributeId: 'cj',
    attributeName: 'Junction Capacitance (Cj)',
    sortOrder: 9,
  },
  'Operating Temperature': {
    attributeId: 'operating_temp',
    attributeName: 'Operating Temperature Range',
    sortOrder: 10,
  },
  'Qualification': {
    attributeId: 'aec_q101',
    attributeName: 'AEC-Q101 Qualification',
    sortOrder: 11,
  },
  'Mounting Type': {
    attributeId: 'mounting_style',
    attributeName: 'Mounting Style',
    sortOrder: 12,
  },
  'Package / Case': {
    attributeId: 'package_case',
    attributeName: 'Package / Form Factor',
    sortOrder: 13,
  },
};

/**
 * MOSFET parameter mapping (Family B5).
 * Digikey category: "FETs - MOSFETs - Single" (covers N-ch, P-ch, Si, SiC, GaN)
 *
 * PLACEHOLDER: Field names are based on known Digikey patterns for discrete
 * semiconductors. Run `scripts/discover-digikey-params.mjs` against representative
 * MOSFETs (e.g., IRFZ44N, BSC0902NS, SCTW35N65G2V, EPC2045) to verify and
 * refine field names before production use.
 *
 * Expected gaps: body_diode_vf, body_diode_trr, rth_jc, rth_ja, pin_configuration,
 * height, soa, avalanche_energy — these are datasheet-level specs not typically
 * in Digikey parametric data.
 */
/**
 * MOSFET parameter mapping (Family B5).
 * Verified against: IRFZ44NPBF (N-ch TH Si), BSC0902NSIATMA1 (N-ch SMD Si),
 *   SCTW35N65G2VAG (N-ch SiC), CSD19536KTT (N-ch high-power Si),
 *   IRF9540NPBF (P-ch Si), EPC2045 (GaN FET)
 * Digikey category: "Single FETs, MOSFETs"
 *
 * All 6 test parts return exactly 18 parameters with identical field names.
 * Confirmed GAPS (not in Digikey parametric data):
 *   Qgd (w7), Qgs (w6), Coss (w7), Crss (w7), body_diode_vf (w6),
 *   body_diode_trr (w8), rth_jc (w7), rth_ja (w5), avalanche_energy (w7),
 *   id_pulse (w7), pin_configuration (w10), height (w5), soa (w7), packaging (w2)
 * Weight coverage: 119 / 199 = ~60%
 */
const mosfetParamMap: Record<string, ParamMapEntry> = {
  'FET Type': {
    attributeId: 'channel_type',
    attributeName: 'Channel Type (N-Channel / P-Channel)',
    sortOrder: 1,
  },
  'Technology': {
    attributeId: 'technology',
    attributeName: 'Technology (Si / SiC / GaN)',
    sortOrder: 2,
  },
  'Drain to Source Voltage (Vdss)': {
    attributeId: 'vds_max',
    attributeName: 'Drain-Source Voltage (Vds Max)',
    unit: 'V',
    sortOrder: 3,
  },
  'Current - Continuous Drain (Id) @ 25°C': {
    attributeId: 'id_max',
    attributeName: 'Continuous Drain Current (Id Max)',
    unit: 'A',
    sortOrder: 4,
  },
  'Vgs(th) (Max) @ Id': {
    attributeId: 'vgs_th',
    attributeName: 'Gate Threshold Voltage (Vgs(th))',
    unit: 'V',
    sortOrder: 5,
  },
  'Rds On (Max) @ Id, Vgs': {
    attributeId: 'rds_on',
    attributeName: 'On-State Resistance (Rds(on))',
    sortOrder: 6,
  },
  'Vgs (Max)': {
    attributeId: 'vgs_max',
    attributeName: 'Gate-Source Voltage (Vgs Max)',
    unit: 'V',
    sortOrder: 7,
  },
  'Input Capacitance (Ciss) (Max) @ Vds': {
    attributeId: 'ciss',
    attributeName: 'Input Capacitance (Ciss)',
    sortOrder: 8,
  },
  // NOTE: Coss, Crss, Qgd, Qgs are NOT in Digikey parametric data (confirmed Feb 2026).
  // These critical switching parameters must come from datasheets.
  'Gate Charge (Qg) (Max) @ Vgs': {
    attributeId: 'qg',
    attributeName: 'Total Gate Charge (Qg)',
    sortOrder: 9,
  },
  'Power Dissipation (Max)': {
    attributeId: 'pd',
    attributeName: 'Power Dissipation (Pd Max)',
    unit: 'W',
    sortOrder: 10,
  },
  'Operating Temperature': {
    attributeId: 'operating_temp',
    attributeName: 'Operating Temperature Range',
    sortOrder: 11,
  },
  'Qualification': {
    attributeId: 'aec_q101',
    attributeName: 'AEC-Q101 Qualification',
    sortOrder: 12,
  },
  'Mounting Type': {
    attributeId: 'mounting_style',
    attributeName: 'Mounting Style',
    sortOrder: 13,
  },
  'Package / Case': {
    attributeId: 'package_case',
    attributeName: 'Package / Footprint',
    sortOrder: 14,
  },
};

/**
 * BJTs — Bipolar Junction Transistors (Family B6)
 * Verified against Digikey API (Feb 2026): BC847BLT1G, MMBT2222ALT1G, MMBT3906LT1G, TIP31CG, BC857BLT1G.
 * Digikey category: "Single Bipolar Transistors" (12-14 params per product).
 *
 * Additional available fields NOT mapped (no logic table rule):
 *   - "Current - Collector Cutoff (Max)" (ICBO leakage) — informational only
 *   - "Grade" — redundant with Qualification for AEC-Q101
 *
 * Confirmed gaps (datasheet-only): vces_max, vbe_sat, tst, ton, toff, rth_jc, tj_max, soa.
 * Weight coverage: ~55%.
 */
const bjtParamMap: Record<string, ParamMapEntry> = {
  'Transistor Type': {
    attributeId: 'polarity',
    attributeName: 'Polarity (NPN / PNP)',
    sortOrder: 1,
  },
  'Voltage - Collector Emitter Breakdown (Max)': {
    attributeId: 'vceo_max',
    attributeName: 'Vceo Max (Collector-Emitter Voltage)',
    unit: 'V',
    sortOrder: 2,
  },
  'Current - Collector (Ic) (Max)': {
    attributeId: 'ic_max',
    attributeName: 'Continuous Collector Current (Ic Max)',
    unit: 'A',
    sortOrder: 3,
  },
  'DC Current Gain (hFE) (Min) @ Ic, Vce': {
    attributeId: 'hfe',
    attributeName: 'DC Current Gain (hFE)',
    sortOrder: 4,
  },
  'Vce Saturation (Max) @ Ib, Ic': {
    attributeId: 'vce_sat',
    attributeName: 'Vce(sat) Max',
    unit: 'V',
    sortOrder: 5,
  },
  'Frequency - Transition': {
    attributeId: 'ft',
    attributeName: 'Transition Frequency (ft)',
    unit: 'Hz',
    sortOrder: 6,
  },
  'Power - Max': {
    attributeId: 'pd',
    attributeName: 'Power Dissipation (Pd Max)',
    unit: 'W',
    sortOrder: 7,
  },
  // Confirmed NOT in Digikey: vces_max, vbe_sat, tst, ton, toff, rth_jc, tj_max, soa
  // (datasheet-level specs). When both source and candidate are missing, rules pass.
  'Operating Temperature': {
    attributeId: 'operating_temp',
    attributeName: 'Operating Temperature Range',
    sortOrder: 8,
  },
  'Qualification': {
    attributeId: 'aec_q101',
    attributeName: 'AEC-Q101 Qualification',
    sortOrder: 9,
  },
  'Mounting Type': {
    attributeId: 'mounting_style',
    attributeName: 'Mounting Style',
    sortOrder: 10,
  },
  'Package / Case': {
    attributeId: 'package_case',
    attributeName: 'Package / Footprint',
    sortOrder: 11,
  },
};

/**
 * IGBTs — Insulated Gate Bipolar Transistors (Family B7)
 * Verified against Digikey API (Feb 2026): IRG4BC30KDPBF, FGA25N120ANTDTU,
 *   STGF10H60DF, NGTB40N120FL2WG, RGT60TS65DGC11, STGB10H60DF.
 * Digikey category: "Single IGBTs" (15-16 params per product).
 *
 * All 6 test parts return consistent field names across Infineon, onsemi, ST, Rohm.
 *
 * COMPOUND FIELDS requiring transformers:
 *   - "Switching Energy" → eon + eoff (e.g., "600µJ (on), 580µJ (off)")
 *   - "Td (on/off) @ 25°C" → td_on + td_off (e.g., "60ns/160ns")
 *
 * ENRICHED from context:
 *   - co_packaged_diode: inferred from "Reverse Recovery Time (trr)" presence
 *     (IGBTs with co-packaged diode have trr; bare IGBTs don't)
 *
 * Additional available fields NOT mapped (no logic table rule):
 *   - "Input Type" (always "Standard") — not useful
 *   - "Test Condition" (e.g., "480V, 16A, 23Ohm, 15V") — informational
 *   - "Supplier Device Package" — fallback for package_case
 *
 * Confirmed GAPS (datasheet-only, not in Digikey parametric data):
 *   - Qualification / AEC-Q101 — completely absent (unlike MOSFETs/BJTs!)
 *   - tsc (short-circuit withstand time) — via placeholder
 *   - rth_jc, tj_max, vge_max, vge_th, tf, soa, height, packaging, channel_type (N/P)
 *   Note: "IGBT Type" provides technology (PT/NPT/FS), not channel type.
 *
 * Weight coverage: estimated ~55% (similar to B6 pattern).
 */
const igbtParamMap: Record<string, ParamMapEntry> = {
  'IGBT Type': {
    attributeId: 'igbt_technology',
    attributeName: 'IGBT Technology (PT / NPT / FS)',
    sortOrder: 1,
  },
  'Voltage - Collector Emitter Breakdown (Max)': {
    attributeId: 'vces_max',
    attributeName: 'Collector-Emitter Voltage (Vces Max)',
    unit: 'V',
    sortOrder: 2,
  },
  'Current - Collector (Ic) (Max)': {
    attributeId: 'ic_max',
    attributeName: 'Continuous Collector Current (Ic Max)',
    unit: 'A',
    sortOrder: 3,
  },
  'Current - Collector Pulsed (Icm)': {
    attributeId: 'ic_pulse',
    attributeName: 'Peak Pulsed Collector Current (Ic Pulse)',
    unit: 'A',
    sortOrder: 4,
  },
  'Vce(on) (Max) @ Vge, Ic': {
    attributeId: 'vce_sat',
    attributeName: 'Vce(sat) (Collector-Emitter Saturation Voltage)',
    unit: 'V',
    sortOrder: 5,
  },
  'Power - Max': {
    attributeId: 'pd',
    attributeName: 'Power Dissipation (Pd Max)',
    unit: 'W',
    sortOrder: 6,
  },
  // COMPOUND: "600µJ (on), 580µJ (off)" → split into eon + eoff via transformers
  'Switching Energy': [
    {
      attributeId: 'eon',
      attributeName: 'Turn-On Energy Loss (Eon)',
      sortOrder: 7,
    },
    {
      attributeId: 'eoff',
      attributeName: 'Turn-Off Energy Loss (Eoff)',
      sortOrder: 8,
    },
  ],
  'Gate Charge': {
    attributeId: 'qg',
    attributeName: 'Total Gate Charge (Qg)',
    sortOrder: 9,
  },
  // COMPOUND: "60ns/160ns" → split into td_on + td_off via transformers
  'Td (on/off) @ 25°C': [
    {
      attributeId: 'td_on',
      attributeName: 'Turn-On Delay Time (td(on))',
      sortOrder: 10,
    },
    {
      attributeId: 'td_off',
      attributeName: 'Turn-Off Delay Time (td(off))',
      sortOrder: 11,
    },
  ],
  'Reverse Recovery Time (trr)': {
    attributeId: 'diode_trr',
    attributeName: 'Co-Packaged Diode Reverse Recovery Time (trr)',
    sortOrder: 12,
  },
  'Operating Temperature': {
    attributeId: 'operating_temp',
    attributeName: 'Operating Temperature Range',
    sortOrder: 13,
  },
  'Mounting Type': {
    attributeId: 'mounting_style',
    attributeName: 'Mounting Style',
    sortOrder: 14,
  },
  'Package / Case': {
    attributeId: 'package_case',
    attributeName: 'Package / Footprint',
    sortOrder: 15,
  },
};

/**
 * SCRs (Silicon Controlled Rectifiers) — Family B8
 * Digikey category: "SCRs" (leaf: "Thyristors - SCRs")
 *
 * Verified against Digikey API (Feb 2026) using C106DG:
 *   - "SCR Type" → gate_sensitivity (transformer normalizes "Sensitive Gate"→"Sensitive")
 *   - "Voltage - Off State" → vdrm
 *   - "Current - On State (It (AV)) (Max)" → on_state_current (SCR uses average current)
 *   - "Current - On State (It (RMS)) (Max)" → SKIPPED (use AV for SCRs)
 *   - "Current - Non Rep. Surge 50, 60Hz (Itsm)" → itsm
 *   - "Current - Gate Trigger (Igt) (Max)" → igt
 *   - "Voltage - Gate Trigger (Vgt) (Max)" → vgt
 *   - "Current - Hold (Ih) (Max)" → ih
 *
 * Confirmed GAPS (datasheet-only, not in Digikey parametric data):
 *   - vdsm, i2t, il (latching current), dv_dt, di_dt, tgt, tq
 *   - quadrant_operation (SCR N/A anyway), snubberless (SCR N/A anyway)
 *   - rth_jc, tj_max, device_type (inferred from category)
 *
 * Weight coverage: ~48% (67/136 total weight mapped)
 */
const scrParamMap: Record<string, ParamMapEntry> = {
  'SCR Type': {
    attributeId: 'gate_sensitivity',
    attributeName: 'Gate Sensitivity Class (Standard / Sensitive / Logic-Level)',
    sortOrder: 2,
  },
  'Voltage - Off State': {
    attributeId: 'vdrm',
    attributeName: 'Peak Repetitive Off-State Voltage (VDRM / VRRM)',
    unit: 'V',
    sortOrder: 4,
  },
  'Current - On State (It (AV)) (Max)': {
    attributeId: 'on_state_current',
    attributeName: 'On-State Average Current (IT(AV))',
    unit: 'A',
    sortOrder: 6,
  },
  'Current - Non Rep. Surge 50, 60Hz (Itsm)': {
    attributeId: 'itsm',
    attributeName: 'Non-Repetitive Surge Current (ITSM)',
    unit: 'A',
    sortOrder: 7,
  },
  'Current - Gate Trigger (Igt) (Max)': {
    attributeId: 'igt',
    attributeName: 'Gate Trigger Current (IGT)',
    sortOrder: 9,
  },
  'Voltage - Gate Trigger (Vgt) (Max)': {
    attributeId: 'vgt',
    attributeName: 'Gate Trigger Voltage (VGT)',
    sortOrder: 10,
  },
  'Current - Hold (Ih) (Max)': {
    attributeId: 'ih',
    attributeName: 'Holding Current (IH)',
    sortOrder: 11,
  },
  'Package / Case': {
    attributeId: 'package_case',
    attributeName: 'Package / Footprint',
    sortOrder: 3,
  },
  'Mounting Type': {
    attributeId: 'mounting_style',
    attributeName: 'Mounting Style',
    sortOrder: 23,
  },
};

/**
 * TRIACs (Triode AC Switches) — Family B8
 * Digikey category: "TRIACs" (leaf: "Thyristors - TRIACs")
 *
 * Verified against Digikey API (Feb 2026) using T2535-600G, MAC97A6G, T405-600B:
 *   - "Triac Type" → COMPOUND: encodes gate_sensitivity + snubberless
 *     Values observed: "Alternistor - Snubberless", "Logic - Sensitive Gate", "Standard"
 *   - "Voltage - Off State" → vdrm
 *   - "Current - On State (It (RMS)) (Max)" → on_state_current (TRIAC uses RMS)
 *   - "Current - Non Rep. Surge 50, 60Hz (Itsm)" → itsm
 *   - "Current - Gate Trigger (Igt) (Max)" → igt
 *   - "Voltage - Gate Trigger (Vgt) (Max)" → vgt
 *   - "Current - Hold (Ih) (Max)" → ih
 *   - "Qualification" → aec_q101 (when present; often "-")
 *
 * Confirmed GAPS (datasheet-only, not in Digikey parametric data):
 *   - vdsm, i2t, il (latching current), dv_dt, di_dt, tgt
 *   - quadrant_operation (critical TRIAC spec — datasheet only!)
 *   - rth_jc, tj_max, device_type (inferred from category)
 *
 * Weight coverage: ~51% (69/136 total weight mapped)
 */
const triacParamMap: Record<string, ParamMapEntry> = {
  // COMPOUND: "Triac Type" encodes both gate sensitivity and snubberless status
  // Values: "Alternistor - Snubberless", "Logic - Sensitive Gate", "Standard"
  'Triac Type': [
    {
      attributeId: 'gate_sensitivity',
      attributeName: 'Gate Sensitivity Class (Standard / Sensitive / Logic-Level)',
      sortOrder: 2,
    },
    {
      attributeId: 'snubberless',
      attributeName: 'Snubberless Rating',
      sortOrder: 18,
    },
  ],
  'Voltage - Off State': {
    attributeId: 'vdrm',
    attributeName: 'Peak Repetitive Off-State Voltage (VDRM / VRRM)',
    unit: 'V',
    sortOrder: 4,
  },
  'Current - On State (It (RMS)) (Max)': {
    attributeId: 'on_state_current',
    attributeName: 'On-State RMS Current (IT(RMS))',
    unit: 'A',
    sortOrder: 6,
  },
  'Current - Non Rep. Surge 50, 60Hz (Itsm)': {
    attributeId: 'itsm',
    attributeName: 'Non-Repetitive Surge Current (ITSM)',
    unit: 'A',
    sortOrder: 7,
  },
  'Current - Gate Trigger (Igt) (Max)': {
    attributeId: 'igt',
    attributeName: 'Gate Trigger Current (IGT)',
    sortOrder: 9,
  },
  'Voltage - Gate Trigger (Vgt) (Max)': {
    attributeId: 'vgt',
    attributeName: 'Gate Trigger Voltage (VGT)',
    sortOrder: 10,
  },
  'Current - Hold (Ih) (Max)': {
    attributeId: 'ih',
    attributeName: 'Holding Current (IH)',
    sortOrder: 11,
  },
  'Qualification': {
    attributeId: 'aec_q101',
    attributeName: 'AEC-Q101 Qualification',
    sortOrder: 21,
  },
  'Package / Case': {
    attributeId: 'package_case',
    attributeName: 'Package / Footprint',
    sortOrder: 3,
  },
  'Mounting Type': {
    attributeId: 'mounting_style',
    attributeName: 'Mounting Style',
    sortOrder: 23,
  },
};

/**
 * JFET parameter mapping (Family B9).
 * Verified against: J113 (onsemi), 2N5457 (Central Semiconductor), MMBFJ177 (onsemi)
 * Digikey category: "JFETs"
 *
 * Coverage: ~7 of 17 rules mapped (~45% weight coverage)
 * Digikey JFET parametric data is sparse — noise specs (NF, fc, Igss),
 * transconductance (gfs), ft, and Crss are all datasheet-only.
 *
 * COMPOUND FIELDS:
 *   - "Current - Drain (Idss) @ Vds (Vgs=0)": "2 mA @ 15 V" → extract current before "@"
 *   - "Voltage - Cutoff (VGS off) @ Id": "500 mV @ 1 µA" → extract voltage before "@"
 *   - "Input Capacitance (Ciss) (Max) @ Vds": "7pF @ 15V" → extract capacitance before "@"
 *
 * KNOWN GAPS (not in Digikey parametric data):
 *   - noise_figure (NF) — datasheet-only
 *   - fc_1f_corner (1/f corner) — datasheet-only, rarely specified explicitly
 *   - igss (gate leakage) — datasheet-only
 *   - gfs / gm (transconductance) — datasheet-only
 *   - ft (unity-gain frequency) — datasheet-only
 *   - crss (Cgd) — datasheet-only
 *   - aec_q101 — no Qualification field for JFETs in Digikey
 *   - matched_pair_review — not a parametric attribute
 */
const jfetParamMap: Record<string, ParamMapEntry> = {
  'FET Type': {
    attributeId: 'channel_type',
    attributeName: 'Channel Type (N/P)',
    sortOrder: 1,
  },
  'Voltage - Breakdown (V(BR)GSS)': {
    attributeId: 'vgs_max',
    attributeName: 'Gate-Source Breakdown Voltage Vgs',
    unit: 'V',
    sortOrder: 9,
  },
  'Drain to Source Voltage (Vdss)': {
    attributeId: 'vds_max',
    attributeName: 'Drain-Source Breakdown Voltage Vds',
    unit: 'V',
    sortOrder: 8,
  },
  'Current - Drain (Idss) @ Vds (Vgs=0)': {
    attributeId: 'idss',
    attributeName: 'Drain Saturation Current Idss',
    sortOrder: 4,
  },
  'Voltage - Cutoff (VGS off) @ Id': {
    attributeId: 'vp',
    attributeName: 'Pinch-Off Voltage Vp / Vgs(off)',
    sortOrder: 3,
  },
  'Input Capacitance (Ciss) (Max) @ Vds': {
    attributeId: 'ciss',
    attributeName: 'Input Capacitance Ciss',
    sortOrder: 12,
  },
  'Power - Max': {
    attributeId: 'pd_max',
    attributeName: 'Maximum Power Dissipation',
    unit: 'mW',
    sortOrder: 14,
  },
  'Operating Temperature': {
    attributeId: 'operating_temp',
    attributeName: 'Operating Temperature Range',
    sortOrder: 15,
  },
  'Package / Case': {
    attributeId: 'package_case',
    attributeName: 'Package / Footprint',
    sortOrder: 2,
  },
  'Mounting Type': {
    attributeId: 'mounting_style',
    attributeName: 'Mounting Style',
    sortOrder: 17,
  },
};

// ============================================================
// Block C: Power Management ICs
// ============================================================

/**
 * Linear Voltage Regulators / LDOs (Family C1)
 * Digikey category: "Voltage Regulators - Linear, Low Drop Out (LDO) Regulators"
 *
 * Verified Feb 2026 against: AP2112K-3.3TRG1, TLV75533PDBVR, LM1117MP-3.3/NOPB
 * All 3 parts show consistent 16-17 parameter fields.
 *
 * Coverage: 10 of 22 rules have direct Digikey mappings (~52% weight coverage).
 * Datasheet-only (no Digikey parametric data):
 *   vout_accuracy, output_cap_compatibility (ceramic stable), vin_min,
 *   load_regulation, line_regulation, power_good, soft_start, rth_ja,
 *   tj_max, aec_q100, packaging.
 *
 * Digikey field gotchas:
 * - "Output Configuration" = polarity (Positive/Negative), NOT "Polarity"
 * - "Voltage Dropout (Max)" is compound: "0.4V @ 600mA" — transformer extracts
 *   voltage value only (extractNumericValue handles "0.4V" portion)
 * - "PSRR" is compound: "65dB (100Hz ~ 1kHz)" — includes frequency context
 * - "Control Features" = enable info ("Enable", "-") — NOT "Features"
 * - "Protection Features" = OCP/OTP info ("Over Current, Over Temperature") —
 *   transformer extracts thermal_shutdown flag
 * - No "Qualification" or AEC-Q100 field in parametric data (same gap as IGBTs)
 * - No "Output Voltage Tolerance" field — vout_accuracy is datasheet-only
 * - "Current - Supply (Max)" appears on some parts (LM1117) — not mapped (Iq covers it)
 */
const ldoParamMap: Record<string, ParamMapEntry> = {
  'Output Type': {
    attributeId: 'output_type',
    attributeName: 'Output Type (Fixed / Adjustable)',
    sortOrder: 1,
  },
  // "Output Configuration" = Positive/Negative polarity (not "Polarity")
  'Output Configuration': {
    attributeId: 'polarity',
    attributeName: 'Polarity (Positive / Negative)',
    sortOrder: 2,
  },
  'Voltage - Output (Min/Fixed)': {
    attributeId: 'output_voltage',
    attributeName: 'Output Voltage Vout',
    unit: 'V',
    sortOrder: 3,
  },
  'Voltage - Output (Max)': {
    attributeId: 'output_voltage_max',
    attributeName: 'Output Voltage Max (Adjustable Range)',
    unit: 'V',
    sortOrder: 4,
  },
  'Voltage - Input (Max)': {
    attributeId: 'vin_max',
    attributeName: 'Maximum Input Voltage',
    unit: 'V',
    sortOrder: 5,
  },
  // Compound field: "0.4V @ 600mA" — extractNumericValue gets "0.4" from "0.4V" prefix
  'Voltage Dropout (Max)': {
    attributeId: 'vdropout',
    attributeName: 'Dropout Voltage',
    unit: 'V',
    sortOrder: 6,
  },
  'Current - Output': {
    attributeId: 'iout_max',
    attributeName: 'Maximum Output Current',
    unit: 'A',
    sortOrder: 7,
  },
  'Current - Quiescent (Iq)': {
    attributeId: 'iq',
    attributeName: 'Quiescent Current',
    unit: 'A',
    sortOrder: 8,
  },
  // Compound field: "65dB (100Hz ~ 1kHz)" — extractNumericValue gets dB portion
  'PSRR': {
    attributeId: 'psrr',
    attributeName: 'Power Supply Rejection Ratio',
    unit: 'dB',
    sortOrder: 9,
  },
  // "Control Features" contains enable info: "Enable" or "-" (absent)
  'Control Features': {
    attributeId: 'enable_pin',
    attributeName: 'Enable Pin',
    sortOrder: 10,
  },
  // "Protection Features" contains thermal shutdown info:
  // "Over Current, Over Temperature" → transformer extracts thermal_shutdown flag
  'Protection Features': {
    attributeId: 'thermal_shutdown',
    attributeName: 'Thermal Shutdown',
    sortOrder: 11,
  },
  'Number of Regulators': {
    attributeId: 'num_regulators',
    attributeName: 'Number of Regulators',
    sortOrder: 12,
  },
  'Package / Case': {
    attributeId: 'package_case',
    attributeName: 'Package / Footprint',
    sortOrder: 13,
  },
  'Supplier Device Package': {
    attributeId: 'supplier_package',
    attributeName: 'Supplier Device Package',
    sortOrder: 14,
  },
  'Operating Temperature': {
    attributeId: 'operating_temp',
    attributeName: 'Operating Temperature Range',
    sortOrder: 15,
  },
  'Mounting Type': {
    attributeId: 'mounting_style',
    attributeName: 'Mounting Style',
    sortOrder: 16,
  },
};

/**
 * Switching Regulators — Integrated Switch parameter mapping (Family C2).
 * Verified against: TPS54360DDAR, LM2596S-5.0/NOPB, LT8645SEV#PBF, TPS54360BQDDARQ1
 * Digikey category: "Voltage Regulators - DC DC Switching Regulators"
 *
 * 10 mapped fields, ~53% weight coverage (integrated switch).
 *
 * Key gotchas:
 * - "Topology" field includes variants like "Buck, Split Rail" — transformer normalizes
 * - "Function" is redundant with Topology ("Step-Down" = Buck) but more reliable
 * - "Voltage - Output (Min/Fixed)" for adjustable parts = Vref (the reference voltage)
 * - NO control_mode field — control mode is datasheet-only
 * - NO compensation_type, ton_min, gate_drive_current, ocp_mode in parametric data
 * - "Qualification" field appears on automotive parts as "AEC-Q100"
 * - Architecture inferred from category name (Regulators = Integrated Switch)
 */
const switchingRegIntegratedParamMap: Record<string, ParamMapEntry> = {
  'Topology': {
    attributeId: 'topology',
    attributeName: 'Topology (Buck / Boost / Buck-Boost / etc.)',
    sortOrder: 1,
  },
  'Output Configuration': {
    attributeId: 'output_polarity',
    attributeName: 'Output Polarity (Positive / Negative / Isolated)',
    sortOrder: 2,
  },
  'Output Type': {
    attributeId: 'output_type',
    attributeName: 'Output Type (Fixed / Adjustable)',
    sortOrder: 3,
  },
  'Voltage - Input (Min)': {
    attributeId: 'vin_min',
    attributeName: 'Minimum Input Voltage',
    unit: 'V',
    sortOrder: 4,
  },
  'Voltage - Input (Max)': {
    attributeId: 'vin_max',
    attributeName: 'Maximum Input Voltage',
    unit: 'V',
    sortOrder: 5,
  },
  // For adjustable parts: Vout Min/Fixed = Vref (the internal reference voltage)
  // For fixed parts: this is the output voltage itself
  'Voltage - Output (Min/Fixed)': {
    attributeId: 'vref',
    attributeName: 'Feedback Reference Voltage / Output Voltage',
    unit: 'V',
    sortOrder: 6,
  },
  'Voltage - Output (Max)': {
    attributeId: 'vout_max',
    attributeName: 'Maximum Output Voltage',
    unit: 'V',
    sortOrder: 7,
  },
  'Current - Output': {
    attributeId: 'iout_max',
    attributeName: 'Maximum Output Current',
    unit: 'A',
    sortOrder: 8,
  },
  'Frequency - Switching': {
    attributeId: 'fsw',
    attributeName: 'Switching Frequency',
    unit: 'Hz',
    sortOrder: 9,
  },
  'Synchronous Rectifier': {
    attributeId: 'sync_rectifier',
    attributeName: 'Synchronous Rectifier',
    sortOrder: 10,
  },
  'Qualification': {
    attributeId: 'aec_q100',
    attributeName: 'AEC-Q100 Qualification',
    sortOrder: 11,
  },
  'Package / Case': {
    attributeId: 'package_case',
    attributeName: 'Package / Footprint',
    sortOrder: 12,
  },
  'Supplier Device Package': {
    attributeId: 'supplier_package',
    attributeName: 'Supplier Device Package',
    sortOrder: 13,
  },
  'Operating Temperature': {
    attributeId: 'operating_temp',
    attributeName: 'Operating Temperature Range',
    sortOrder: 14,
  },
};

/**
 * Switching Controllers parameter mapping (Family C2, controller-only).
 * Verified against: LM5116MHX/NOPB
 * Digikey category: "DC DC Switching Controllers"
 *
 * 7 mapped fields, ~38% weight coverage (controller-only).
 * Controller-only parts have fewer parametric fields — no Vout/Iout ratings
 * (these depend on external components).
 *
 * Key gotchas:
 * - Category name is "DC DC Switching Controllers" (NO "Voltage Regulators -" prefix)
 * - Uses "Voltage - Supply (Vcc/Vdd)" instead of "Voltage - Input (Min/Max)"
 * - NO Current - Output field (current set by external FETs)
 * - NO Voltage - Output fields (output set by external components)
 * - "Control Features" lists Enable, Soft Start, etc. — multi-value compound field
 * - "Duty Cycle (Max)" available but rarely the binding specification
 */
const switchingControllerParamMap: Record<string, ParamMapEntry> = {
  'Topology': {
    attributeId: 'topology',
    attributeName: 'Topology (Buck / Boost / Buck-Boost / etc.)',
    sortOrder: 1,
  },
  'Output Configuration': {
    attributeId: 'output_polarity',
    attributeName: 'Output Polarity (Positive / Negative / Isolated)',
    sortOrder: 2,
  },
  // Controller-only: "Voltage - Supply (Vcc/Vdd)" is the IC supply range
  // which effectively sets the input voltage range
  'Voltage - Supply (Vcc/Vdd)': {
    attributeId: 'vin_range',
    attributeName: 'IC Supply Voltage Range (Vin)',
    unit: 'V',
    sortOrder: 3,
  },
  'Frequency - Switching': {
    attributeId: 'fsw',
    attributeName: 'Switching Frequency',
    unit: 'Hz',
    sortOrder: 4,
  },
  'Duty Cycle (Max)': {
    attributeId: 'duty_cycle_max',
    attributeName: 'Maximum Duty Cycle',
    sortOrder: 5,
  },
  'Synchronous Rectifier': {
    attributeId: 'sync_rectifier',
    attributeName: 'Synchronous Rectifier',
    sortOrder: 6,
  },
  'Qualification': {
    attributeId: 'aec_q100',
    attributeName: 'AEC-Q100 Qualification',
    sortOrder: 7,
  },
  'Package / Case': {
    attributeId: 'package_case',
    attributeName: 'Package / Footprint',
    sortOrder: 8,
  },
  'Supplier Device Package': {
    attributeId: 'supplier_package',
    attributeName: 'Supplier Device Package',
    sortOrder: 9,
  },
  'Operating Temperature': {
    attributeId: 'operating_temp',
    attributeName: 'Operating Temperature Range',
    sortOrder: 10,
  },
};

/**
 * Non-isolated gate driver parameter mapping (Family C3).
 * Verified against: IR2104 (Infineon), UCC27211DR (TI)
 * Digikey category: "Gate Drivers"
 *
 * 10 mapped fields, ~54% weight coverage.
 *
 * Key gotchas:
 * - "Driven Configuration" (not "Configuration" or "Channel Type") → driver_configuration
 * - "Current - Peak Output (Source, Sink)" is a COMPOUND field: "210mA, 360mA"
 *   → needs transformToPeakSource() / transformToPeakSink() to split
 * - "Input Type" maps to output_polarity (Non-Inverting / Inverting) — field name is misleading
 * - "Logic Voltage - VIL, VIH" compound field: "0.8V, 3V" → extract VIH for threshold matching
 * - "Rise / Fall Time (Typ)" compound: "100ns, 50ns" → take max for matching
 * - "High Side Voltage - Max (Bootstrap)" indicates non-isolated bootstrap type
 * - NO propagation delay field for non-isolated drivers
 * - NO dead_time, dead_time_control, shutdown_enable, bootstrap_diode, fault_reporting,
 *   rth_ja, tj_max, aec_q100 fields
 * - isolation_type inferred from category name ("Gate Drivers" → Non-Isolated)
 */
const gateDriverParamMap: Record<string, ParamMapEntry> = {
  'Driven Configuration': {
    attributeId: 'driver_configuration',
    attributeName: 'Driver Configuration (Single / Dual / Half-Bridge / Full-Bridge)',
    sortOrder: 1,
  },
  'Voltage - Supply': {
    attributeId: 'vdd_range',
    attributeName: 'Gate Drive Supply VDD Range',
    unit: 'V',
    sortOrder: 2,
  },
  // Compound field: "0.8V, 3V" → VIL, VIH — extract VIH for threshold matching
  'Logic Voltage - VIL, VIH': {
    attributeId: 'input_logic_threshold',
    attributeName: 'Input Logic Threshold (VIH)',
    unit: 'V',
    sortOrder: 3,
  },
  // Compound field: "210mA, 360mA" → split into source and sink via transformers
  'Current - Peak Output (Source, Sink)': [
    {
      attributeId: 'peak_source_current',
      attributeName: 'Peak Source Current (Turn-On)',
      unit: 'A',
      sortOrder: 4,
    },
    {
      attributeId: 'peak_sink_current',
      attributeName: 'Peak Sink Current (Turn-Off)',
      unit: 'A',
      sortOrder: 5,
    },
  ],
  // "Non-Inverting" / "Inverting" — maps to output polarity
  'Input Type': {
    attributeId: 'output_polarity',
    attributeName: 'Output Polarity (Non-Inverting / Inverting)',
    sortOrder: 6,
  },
  // Compound field: "100ns, 50ns" → rise, fall — take max for threshold comparison
  'Rise / Fall Time (Typ)': {
    attributeId: 'rise_fall_time',
    attributeName: 'Rise / Fall Time',
    unit: 's',
    sortOrder: 7,
  },
  // Bootstrap voltage indicates this is a non-isolated half-bridge driver
  'High Side Voltage - Max (Bootstrap)': {
    attributeId: 'bootstrap_voltage',
    attributeName: 'High Side Voltage Max (Bootstrap)',
    unit: 'V',
    sortOrder: 8,
  },
  'Package / Case': {
    attributeId: 'package_case',
    attributeName: 'Package / Footprint',
    sortOrder: 9,
  },
  'Supplier Device Package': {
    attributeId: 'supplier_package',
    attributeName: 'Supplier Device Package',
    sortOrder: 10,
  },
  'Operating Temperature': {
    attributeId: 'operating_temp',
    attributeName: 'Operating Temperature Range',
    sortOrder: 11,
  },
};

/**
 * Isolated gate driver parameter mapping (Family C3, isolated).
 * Verified against: ADUM4120BRIZ (Analog Devices)
 * Digikey category: "Isolators - Gate Drivers"
 *
 * 10 mapped fields, ~51% weight coverage.
 *
 * Key gotchas:
 * - DIFFERENT category name: "Isolators - Gate Drivers" (not "Gate Drivers")
 * - "Technology" → isolation_type: "Magnetic Coupling", "Optocoupler", etc.
 * - "Number of Channels" (not "Number of Drivers") — used for enrichment
 * - "Voltage - Output Supply" (not "Voltage - Supply") → vdd_range
 * - "Current - Peak Output" is a SINGLE value (not Source/Sink split): "2.3A"
 * - "Propagation Delay tpLH / tpHL (Max)" compound: "69ns, 79ns" → take max
 * - "Voltage - Isolation" available (not in non-isolated)
 * - "Common Mode Transient Immunity (Min)" = dV/dt immunity
 * - "Qualification" field available (unlike non-isolated)
 * - NO Driven Configuration field — single-channel isolated drivers are most common
 * - NO Input Type field — isolated drivers typically only non-inverting
 * - "Approval Agency" has safety certifications (CSA, UR, VDE)
 */
const isolatedGateDriverParamMap: Record<string, ParamMapEntry> = {
  // "Magnetic Coupling" / "Optocoupler" / "Capacitive Coupling" → isolation type
  'Technology': {
    attributeId: 'isolation_type',
    attributeName: 'Isolation Type (Transformer / Optocoupler / Digital Isolator)',
    sortOrder: 1,
  },
  'Voltage - Output Supply': {
    attributeId: 'vdd_range',
    attributeName: 'Gate Drive Supply VDD Range',
    unit: 'V',
    sortOrder: 2,
  },
  // Single value (not source/sink split) — map to peak_source_current
  'Current - Peak Output': {
    attributeId: 'peak_source_current',
    attributeName: 'Peak Output Current',
    unit: 'A',
    sortOrder: 3,
  },
  // Compound field: "69ns, 79ns" → tpLH, tpHL — take max for threshold comparison
  'Propagation Delay tpLH / tpHL (Max)': {
    attributeId: 'propagation_delay',
    attributeName: 'Propagation Delay (Max of tpLH, tpHL)',
    unit: 's',
    sortOrder: 4,
  },
  'Rise / Fall Time (Typ)': {
    attributeId: 'rise_fall_time',
    attributeName: 'Rise / Fall Time',
    unit: 's',
    sortOrder: 5,
  },
  'Voltage - Isolation': {
    attributeId: 'isolation_voltage',
    attributeName: 'Isolation Voltage',
    unit: 'V',
    sortOrder: 6,
  },
  // dV/dt immunity — maps to CMTI
  'Common Mode Transient Immunity (Min)': {
    attributeId: 'cmti',
    attributeName: 'Common Mode Transient Immunity (CMTI)',
    sortOrder: 7,
  },
  'Qualification': {
    attributeId: 'aec_q100',
    attributeName: 'AEC-Q100 Qualification',
    sortOrder: 8,
  },
  'Package / Case': {
    attributeId: 'package_case',
    attributeName: 'Package / Footprint',
    sortOrder: 9,
  },
  'Supplier Device Package': {
    attributeId: 'supplier_package',
    attributeName: 'Supplier Device Package',
    sortOrder: 10,
  },
  'Operating Temperature': {
    attributeId: 'operating_temp',
    attributeName: 'Operating Temperature Range',
    sortOrder: 11,
  },
};

// ============================================================
// C4: OP-AMPS / COMPARATORS / INSTRUMENTATION AMPLIFIERS
// ============================================================

/**
 * Op-Amp param map — Digikey category "Instrumentation, Op Amps, Buffer Amps"
 *
 * 12 mapped fields. Key differences from comparator param map:
 * - Uses "Gain Bandwidth Product" (not Propagation Delay)
 * - Uses "Number of Circuits" (not "Number of Elements")
 * - Uses "Amplifier Type" (not "Type") — also maps to input_type via transformer
 * - Supply voltage is split into two fields: "Voltage - Supply Span (Min/Max)"
 *
 * Missing from Digikey parametric data (datasheet-only):
 * - VICM range (vicm_range), Avol, min_stable_gain, input_noise_voltage,
 *   rail_to_rail_input (cannot distinguish reliably), AEC-Q100 (no Qualification field)
 */
const opampParamMap: Record<string, ParamMapEntry> = {
  'Amplifier Type': [
    {
      attributeId: 'input_type',
      attributeName: 'Input Stage Technology (CMOS / JFET / Bipolar)',
      sortOrder: 4,
    },
    {
      attributeId: 'amplifier_type',
      attributeName: 'Amplifier Type',
      sortOrder: 5,
    },
  ],
  'Number of Circuits': {
    attributeId: 'channels',
    attributeName: 'Number of Channels (Single / Dual / Quad)',
    sortOrder: 2,
  },
  'Output Type': {
    attributeId: 'rail_to_rail_output',
    attributeName: 'Rail-to-Rail Output (RRO)',
    sortOrder: 7,
  },
  'Slew Rate': {
    attributeId: 'slew_rate',
    attributeName: 'Slew Rate',
    unit: 'V/µs',
    sortOrder: 11,
  },
  'Gain Bandwidth Product': {
    attributeId: 'gain_bandwidth',
    attributeName: 'Gain Bandwidth Product (GBW)',
    unit: 'Hz',
    sortOrder: 10,
  },
  '-3db Bandwidth': {
    attributeId: 'gain_bandwidth',
    attributeName: 'Gain Bandwidth Product (GBW)',
    unit: 'Hz',
    sortOrder: 10,
  },
  'Current - Input Bias': {
    attributeId: 'input_bias_current',
    attributeName: 'Input Bias Current Ib',
    unit: 'A',
    sortOrder: 13,
  },
  'Voltage - Input Offset': {
    attributeId: 'input_offset_voltage',
    attributeName: 'Input Offset Voltage Vos',
    unit: 'V',
    sortOrder: 12,
  },
  'Current - Supply': {
    attributeId: 'iq',
    attributeName: 'Quiescent Current per Channel',
    unit: 'A',
    sortOrder: 19,
  },
  'Current - Output / Channel': {
    attributeId: 'output_current',
    attributeName: 'Output Current Drive',
    unit: 'A',
    sortOrder: 21,
  },
  'Voltage - Supply Span (Min)': {
    attributeId: 'supply_voltage_min',
    attributeName: 'Supply Voltage (Min)',
    unit: 'V',
    sortOrder: 8,
  },
  'Voltage - Supply Span (Max)': {
    attributeId: 'supply_voltage_max',
    attributeName: 'Supply Voltage (Max)',
    unit: 'V',
    sortOrder: 9,
  },
  'Operating Temperature': {
    attributeId: 'operating_temp',
    attributeName: 'Operating Temperature Range',
    sortOrder: 22,
  },
  'Package / Case': {
    attributeId: 'package_case',
    attributeName: 'Package / Footprint',
    sortOrder: 3,
  },
  'Supplier Device Package': {
    attributeId: 'supplier_package',
    attributeName: 'Supplier Device Package',
    sortOrder: 23,
  },
};

/**
 * Comparator param map — Digikey category "Comparators"
 *
 * 13 mapped fields. Key differences from op-amp param map:
 * - Uses "Type" (not "Amplifier Type")
 * - Uses "Number of Elements" (not "Number of Circuits")
 * - Has "Propagation Delay (Max)" for response_time
 * - Has "Hysteresis"
 * - Uses single compound "Voltage - Supply, Single/Dual (±)" field
 * - Uses "CMRR, PSRR (Typ)" compound field
 * - Uses "(Max)" suffixed field names for Vos and Ib
 *
 * Missing: VICM range, Avol, min_stable_gain, input_noise_voltage,
 *          input_type, rail_to_rail_input/output, AEC-Q100
 */
const comparatorParamMap: Record<string, ParamMapEntry> = {
  'Number of Elements': {
    attributeId: 'channels',
    attributeName: 'Number of Channels (Single / Dual / Quad)',
    sortOrder: 2,
  },
  'Output Type': {
    attributeId: 'output_type',
    attributeName: 'Output Type (Push-Pull / Open-Drain / Open-Collector)',
    sortOrder: 5,
  },
  'Voltage - Supply, Single/Dual (±)': {
    attributeId: 'supply_voltage',
    attributeName: 'Supply Voltage Range (Single/Dual)',
    sortOrder: 8,
  },
  'Voltage - Input Offset (Max)': {
    attributeId: 'input_offset_voltage',
    attributeName: 'Input Offset Voltage Vos (Max)',
    unit: 'V',
    sortOrder: 12,
  },
  'Current - Input Bias (Max)': {
    attributeId: 'input_bias_current',
    attributeName: 'Input Bias Current Ib (Max)',
    unit: 'A',
    sortOrder: 13,
  },
  'Current - Output (Typ)': {
    attributeId: 'output_current',
    attributeName: 'Output Current Drive',
    unit: 'A',
    sortOrder: 21,
  },
  'Current - Quiescent (Max)': {
    attributeId: 'iq',
    attributeName: 'Quiescent Current',
    unit: 'A',
    sortOrder: 19,
  },
  'CMRR, PSRR (Typ)': [
    {
      attributeId: 'cmrr',
      attributeName: 'Common-Mode Rejection Ratio CMRR',
      unit: 'dB',
      sortOrder: 16,
    },
    {
      attributeId: 'psrr',
      attributeName: 'Power Supply Rejection Ratio PSRR',
      unit: 'dB',
      sortOrder: 17,
    },
  ],
  'Propagation Delay (Max)': {
    attributeId: 'response_time',
    attributeName: 'Response Time / Propagation Delay',
    unit: 's',
    sortOrder: 20,
  },
  'Hysteresis': {
    attributeId: 'hysteresis',
    attributeName: 'Hysteresis',
    unit: 'V',
    sortOrder: 14,
  },
  'Operating Temperature': {
    attributeId: 'operating_temp',
    attributeName: 'Operating Temperature Range',
    sortOrder: 22,
  },
  'Package / Case': {
    attributeId: 'package_case',
    attributeName: 'Package / Footprint',
    sortOrder: 3,
  },
  'Supplier Device Package': {
    attributeId: 'supplier_package',
    attributeName: 'Supplier Device Package',
    sortOrder: 23,
  },
};

// ============================================================
// C5: Logic ICs — 74-Series Standard Logic
// ============================================================

/**
 * C5 Logic ICs — "Gates and Inverters" category param map.
 * Verified against: SN74HC04DR, SN74AHC1G04DBVR
 * Digikey category: "Gates and Inverters"
 *
 * Notes:
 * - "Logic Type" gives us device type (Inverter, NAND, NOR, etc.)
 * - "Number of Circuits" = gate count (6 for hex, 4 for quad, etc.)
 * - "Number of Inputs" = inputs per gate (1 for inverter, 2 for NAND, etc.)
 * - "Current - Output High, Low" compound: "5.2mA, 5.2mA" → source/sink
 * - "Max Propagation Delay @ V, Max CL" compound: "16ns @ 6V, 50pF"
 * - "Input Logic Level - Low/High" give VIL/VIH ranges
 * - NO output type, Schmitt trigger, OE polarity, setup/hold time, AEC-Q100
 */
const logicGatesParamMap: Record<string, ParamMapEntry> = {
  'Logic Type': {
    attributeId: 'logic_type',
    attributeName: 'Logic Type',
    sortOrder: 1,
  },
  'Number of Circuits': {
    attributeId: 'gate_count',
    attributeName: 'Number of Gates / Sections',
    sortOrder: 2,
  },
  'Number of Inputs': {
    attributeId: 'inputs_per_gate',
    attributeName: 'Number of Inputs per Gate',
    sortOrder: 3,
  },
  'Features': {
    attributeId: 'features',
    attributeName: 'Features',
    sortOrder: 4,
  },
  'Voltage - Supply': {
    attributeId: 'supply_voltage',
    attributeName: 'Supply Voltage Range (Vcc)',
    sortOrder: 16,
  },
  'Current - Quiescent (Max)': {
    attributeId: 'iq',
    attributeName: 'Quiescent Current',
    unit: 'A',
    sortOrder: 24,
  },
  'Current - Output High, Low': {
    attributeId: 'drive_current',
    attributeName: 'Output Drive Current (IOH / IOL)',
    sortOrder: 8,
  },
  'Input Logic Level - Low': {
    attributeId: 'vil',
    attributeName: 'Input Low Threshold (VIL)',
    sortOrder: 11,
  },
  'Input Logic Level - High': {
    attributeId: 'vih',
    attributeName: 'Input High Threshold (VIH)',
    sortOrder: 10,
  },
  'Max Propagation Delay @ V, Max CL': {
    attributeId: 'tpd',
    attributeName: 'Propagation Delay (tpd)',
    sortOrder: 17,
  },
  'Operating Temperature': {
    attributeId: 'operating_temp',
    attributeName: 'Operating Temperature Range',
    sortOrder: 21,
  },
  'Package / Case': {
    attributeId: 'package_case',
    attributeName: 'Package / Footprint',
    sortOrder: 3,
  },
  'Supplier Device Package': {
    attributeId: 'supplier_package',
    attributeName: 'Supplier Device Package',
    sortOrder: 23,
  },
};

/**
 * C5 Logic ICs — "Buffers, Drivers, Receivers, Transceivers" category param map.
 * Verified against: SN74HCT245PW
 * Digikey category: "Buffers, Drivers, Receivers, Transceivers"
 *
 * Notes:
 * - "Logic Type" gives device function (Transceiver, Non-Inverting, etc.)
 * - "Number of Elements" + "Number of Bits per Element" encode gate/bit count
 * - "Output Type" available: "3-State", "Open Drain", etc.
 * - "Input Type" available but often "-"
 * - NO VIH/VIL, propagation delay, AEC-Q100
 */
const logicBuffersParamMap: Record<string, ParamMapEntry> = {
  'Logic Type': {
    attributeId: 'logic_type',
    attributeName: 'Logic Type',
    sortOrder: 1,
  },
  'Number of Elements': {
    attributeId: 'element_count',
    attributeName: 'Number of Elements',
    sortOrder: 2,
  },
  'Number of Bits per Element': {
    attributeId: 'gate_count',
    attributeName: 'Number of Bits per Element',
    sortOrder: 3,
  },
  'Input Type': {
    attributeId: 'input_type',
    attributeName: 'Input Type',
    sortOrder: 4,
  },
  'Output Type': {
    attributeId: 'output_type',
    attributeName: 'Output Type',
    sortOrder: 5,
  },
  'Current - Output High, Low': {
    attributeId: 'drive_current',
    attributeName: 'Output Drive Current (IOH / IOL)',
    sortOrder: 8,
  },
  'Voltage - Supply': {
    attributeId: 'supply_voltage',
    attributeName: 'Supply Voltage Range (Vcc)',
    sortOrder: 16,
  },
  'Operating Temperature': {
    attributeId: 'operating_temp',
    attributeName: 'Operating Temperature Range',
    sortOrder: 21,
  },
  'Package / Case': {
    attributeId: 'package_case',
    attributeName: 'Package / Footprint',
    sortOrder: 3,
  },
  'Supplier Device Package': {
    attributeId: 'supplier_package',
    attributeName: 'Supplier Device Package',
    sortOrder: 23,
  },
};

/**
 * C5 Logic ICs — "Flip Flops" category param map.
 * Verified against: SN74HC574DWR
 * Digikey category: "Flip Flops"
 *
 * Notes:
 * - "Type" gives flip-flop type (D-Type, JK-Type, etc.)
 * - "Function" = Standard, Preset, Clear, etc.
 * - "Output Type" = Tri-State, Non-Inverted, etc.
 * - "Clock Frequency" → fmax
 * - "Max Propagation Delay @ V, Max CL" → tpd (CLK-to-Q)
 * - "Trigger Type" = Positive Edge, Negative Edge, etc.
 * - "Current - Quiescent (Iq)" different field name from Gates category
 * - NO VIH/VIL, setup/hold time, AEC-Q100
 */
const logicFlipFlopsParamMap: Record<string, ParamMapEntry> = {
  'Function': {
    attributeId: 'function',
    attributeName: 'Function',
    sortOrder: 1,
  },
  'Type': {
    attributeId: 'ff_type',
    attributeName: 'Flip-Flop Type',
    sortOrder: 2,
  },
  'Output Type': {
    attributeId: 'output_type',
    attributeName: 'Output Type',
    sortOrder: 5,
  },
  'Number of Elements': {
    attributeId: 'element_count',
    attributeName: 'Number of Elements',
    sortOrder: 3,
  },
  'Number of Bits per Element': {
    attributeId: 'gate_count',
    attributeName: 'Number of Bits per Element',
    sortOrder: 4,
  },
  'Clock Frequency': {
    attributeId: 'fmax',
    attributeName: 'Maximum Operating Frequency',
    unit: 'Hz',
    sortOrder: 18,
  },
  'Max Propagation Delay @ V, Max CL': {
    attributeId: 'tpd',
    attributeName: 'Propagation Delay (tpd)',
    sortOrder: 17,
  },
  'Trigger Type': {
    attributeId: 'trigger_type',
    attributeName: 'Trigger Type',
    sortOrder: 6,
  },
  'Current - Output High, Low': {
    attributeId: 'drive_current',
    attributeName: 'Output Drive Current (IOH / IOL)',
    sortOrder: 8,
  },
  'Voltage - Supply': {
    attributeId: 'supply_voltage',
    attributeName: 'Supply Voltage Range (Vcc)',
    sortOrder: 16,
  },
  'Current - Quiescent (Iq)': {
    attributeId: 'iq',
    attributeName: 'Quiescent Current',
    unit: 'A',
    sortOrder: 24,
  },
  'Input Capacitance': {
    attributeId: 'input_capacitance',
    attributeName: 'Input Capacitance',
    unit: 'F',
    sortOrder: 25,
  },
  'Operating Temperature': {
    attributeId: 'operating_temp',
    attributeName: 'Operating Temperature Range',
    sortOrder: 21,
  },
  'Package / Case': {
    attributeId: 'package_case',
    attributeName: 'Package / Footprint',
    sortOrder: 3,
  },
  'Supplier Device Package': {
    attributeId: 'supplier_package',
    attributeName: 'Supplier Device Package',
    sortOrder: 23,
  },
};

/**
 * C5 Logic ICs — "Latches" category param map.
 * Verified against: SN74HC373DWR
 * Digikey category: "Latches"
 *
 * Notes:
 * - "Logic Type" = D-Type Transparent Latch, etc.
 * - "Circuit" = 8:8, 4:4 (I/O configuration)
 * - "Delay Time - Propagation" = simple tpd (not compound like Gates)
 * - "Independent Circuits" = number of independent latch blocks
 * - NO VIH/VIL, Clock Frequency, setup/hold time, AEC-Q100
 */
const logicLatchesParamMap: Record<string, ParamMapEntry> = {
  'Logic Type': {
    attributeId: 'logic_type',
    attributeName: 'Logic Type',
    sortOrder: 1,
  },
  'Circuit': {
    attributeId: 'circuit',
    attributeName: 'Circuit Configuration',
    sortOrder: 2,
  },
  'Output Type': {
    attributeId: 'output_type',
    attributeName: 'Output Type',
    sortOrder: 5,
  },
  'Independent Circuits': {
    attributeId: 'element_count',
    attributeName: 'Independent Circuits',
    sortOrder: 3,
  },
  'Delay Time - Propagation': {
    attributeId: 'tpd',
    attributeName: 'Propagation Delay (tpd)',
    sortOrder: 17,
  },
  'Current - Output High, Low': {
    attributeId: 'drive_current',
    attributeName: 'Output Drive Current (IOH / IOL)',
    sortOrder: 8,
  },
  'Voltage - Supply': {
    attributeId: 'supply_voltage',
    attributeName: 'Supply Voltage Range (Vcc)',
    sortOrder: 16,
  },
  'Operating Temperature': {
    attributeId: 'operating_temp',
    attributeName: 'Operating Temperature Range',
    sortOrder: 21,
  },
  'Package / Case': {
    attributeId: 'package_case',
    attributeName: 'Package / Footprint',
    sortOrder: 3,
  },
  'Supplier Device Package': {
    attributeId: 'supplier_package',
    attributeName: 'Supplier Device Package',
    sortOrder: 23,
  },
};

/**
 * C5 Logic ICs — "Counters, Dividers" category param map.
 * Verified against: SN74HC590ADR
 * Digikey category: "Counters, Dividers"
 *
 * Notes:
 * - "Logic Type" = Binary Counter, Decade Counter, etc.
 * - "Direction" = Up, Down, Up/Down
 * - "Count Rate" → fmax equivalent for counters
 * - "Trigger Type" = Positive Edge, etc.
 * - "Reset" = Asynchronous, Synchronous, etc.
 * - "Voltage - Supply" uses different field name than Gates category
 * - NO VIH/VIL, propagation delay, output type, AEC-Q100
 */
const logicCountersParamMap: Record<string, ParamMapEntry> = {
  'Logic Type': {
    attributeId: 'logic_type',
    attributeName: 'Logic Type',
    sortOrder: 1,
  },
  'Direction': {
    attributeId: 'direction',
    attributeName: 'Count Direction',
    sortOrder: 2,
  },
  'Number of Elements': {
    attributeId: 'element_count',
    attributeName: 'Number of Elements',
    sortOrder: 3,
  },
  'Number of Bits per Element': {
    attributeId: 'gate_count',
    attributeName: 'Number of Bits per Element',
    sortOrder: 4,
  },
  'Reset': {
    attributeId: 'reset_type',
    attributeName: 'Reset Type',
    sortOrder: 5,
  },
  'Count Rate': {
    attributeId: 'fmax',
    attributeName: 'Maximum Count Rate',
    unit: 'Hz',
    sortOrder: 18,
  },
  'Trigger Type': {
    attributeId: 'trigger_type',
    attributeName: 'Trigger Type',
    sortOrder: 6,
  },
  'Voltage - Supply': {
    attributeId: 'supply_voltage',
    attributeName: 'Supply Voltage Range (Vcc)',
    sortOrder: 16,
  },
  'Operating Temperature': {
    attributeId: 'operating_temp',
    attributeName: 'Operating Temperature Range',
    sortOrder: 21,
  },
  'Package / Case': {
    attributeId: 'package_case',
    attributeName: 'Package / Footprint',
    sortOrder: 3,
  },
  'Supplier Device Package': {
    attributeId: 'supplier_package',
    attributeName: 'Supplier Device Package',
    sortOrder: 23,
  },
};

/**
 * C5 Logic ICs — "Shift Registers" category param map.
 * Verified against: SN74HC595DR
 * Digikey category: "Shift Registers"
 *
 * Notes:
 * - "Logic Type" = Shift Register
 * - "Function" = Serial to Parallel, Parallel to Serial, etc.
 * - "Output Type" = Tri-State, Open Drain, etc.
 * - NO VIH/VIL, propagation delay, Clock Frequency, AEC-Q100
 */
const logicShiftRegistersParamMap: Record<string, ParamMapEntry> = {
  'Logic Type': {
    attributeId: 'logic_type',
    attributeName: 'Logic Type',
    sortOrder: 1,
  },
  'Output Type': {
    attributeId: 'output_type',
    attributeName: 'Output Type',
    sortOrder: 5,
  },
  'Number of Elements': {
    attributeId: 'element_count',
    attributeName: 'Number of Elements',
    sortOrder: 3,
  },
  'Number of Bits per Element': {
    attributeId: 'gate_count',
    attributeName: 'Number of Bits per Element',
    sortOrder: 4,
  },
  'Function': {
    attributeId: 'function',
    attributeName: 'Function',
    sortOrder: 2,
  },
  'Voltage - Supply': {
    attributeId: 'supply_voltage',
    attributeName: 'Supply Voltage Range (Vcc)',
    sortOrder: 16,
  },
  'Operating Temperature': {
    attributeId: 'operating_temp',
    attributeName: 'Operating Temperature Range',
    sortOrder: 21,
  },
  'Package / Case': {
    attributeId: 'package_case',
    attributeName: 'Package / Footprint',
    sortOrder: 3,
  },
  'Supplier Device Package': {
    attributeId: 'supplier_package',
    attributeName: 'Supplier Device Package',
    sortOrder: 23,
  },
};

/**
 * C5 Logic ICs — "Signal Switches, Multiplexers, Decoders" category param map.
 * Verified against: SN74HC138DR
 * Digikey category: "Signal Switches, Multiplexers, Decoders"
 *
 * Notes:
 * - "Type" = Decoder/Demultiplexer, Multiplexer, Analog Switch, etc.
 * - "Circuit" = 1 x 3:8, 2 x 4:1 (functional configuration)
 * - "Independent Circuits" = number of independent MUX/decoder blocks
 * - "Voltage Supply Source" = Single Supply, Dual Supply
 * - NO VIH/VIL, propagation delay, output type, AEC-Q100
 */
const logicMuxDecoderParamMap: Record<string, ParamMapEntry> = {
  'Type': {
    attributeId: 'logic_type',
    attributeName: 'Logic Type',
    sortOrder: 1,
  },
  'Circuit': {
    attributeId: 'circuit',
    attributeName: 'Circuit Configuration',
    sortOrder: 2,
  },
  'Independent Circuits': {
    attributeId: 'element_count',
    attributeName: 'Independent Circuits',
    sortOrder: 3,
  },
  'Current - Output High, Low': {
    attributeId: 'drive_current',
    attributeName: 'Output Drive Current (IOH / IOL)',
    sortOrder: 8,
  },
  'Voltage Supply Source': {
    attributeId: 'supply_source',
    attributeName: 'Voltage Supply Source',
    sortOrder: 15,
  },
  'Voltage - Supply': {
    attributeId: 'supply_voltage',
    attributeName: 'Supply Voltage Range (Vcc)',
    sortOrder: 16,
  },
  'Operating Temperature': {
    attributeId: 'operating_temp',
    attributeName: 'Operating Temperature Range',
    sortOrder: 21,
  },
  'Package / Case': {
    attributeId: 'package_case',
    attributeName: 'Package / Footprint',
    sortOrder: 3,
  },
  'Supplier Device Package': {
    attributeId: 'supplier_package',
    attributeName: 'Supplier Device Package',
    sortOrder: 23,
  },
};

/**
 * Category name patterns → which param map to use.
 * Keys are substrings of Digikey category names (matched case-insensitively).
 * Order matters: more specific patterns must come before general ones
 * (e.g., "Aluminum - Polymer" before "Aluminum" to avoid false matches).
 * "Schottky Diode*" entries are virtual categories resolved by
 * digikeyMapper.resolveParamMapCategory() from the "Technology" parameter.
 * "Single Zener Diodes" and "Zener Diode Arrays" are direct Digikey categories.
 * "TVS Diodes" is a single Digikey category covering all TVS types.
 * "FETs, MOSFETs" covers all MOSFET types (N-ch, P-ch, Si, SiC, GaN).
 * "Bipolar Transistors" covers all BJT types (NPN, PNP) — matches "Single Bipolar Transistors".
 * "JFETs" covers all JFET types (N-ch, P-ch) — Digikey leaf category name is "JFETs".
 */
const categoryParamMaps: [string, Record<string, ParamMapEntry>][] = [
  // Specific categories first (order matters for substring matching)
  ['Ceramic Capacitors', mlccParamMap],
  ['Tantalum - Polymer Capacitors', tantalumParamMap],
  ['Tantalum Capacitors', tantalumParamMap],
  ['Aluminum - Polymer Capacitors', alPolymerParamMap],
  ['Aluminum Electrolytic Capacitors', alElectrolyticParamMap],
  ['Film Capacitors', filmParamMap],
  ['Electric Double Layer Capacitors', supercapParamMap],
  ['Chip Resistor', chipResistorParamMap],
  ['Fixed Inductors', fixedInductorParamMap],
  ['Ferrite Beads and Chips', ferriteBeadParamMap],
  ['Common Mode Chokes', commonModeChokeParamMap],
  ['Varistors', varistorParamMap],
  ['PTC Resettable Fuses', ptcResettableFuseParamMap],
  ['NTC Thermistors', ntcThermistorParamMap],
  ['PTC Thermistors', ptcThermistorParamMap],
  ['Schottky Diode Arrays', schottkyDiodeArrayParamMap],
  ['Schottky Diodes', schottkyDiodeParamMap],
  ['Zener Diode Arrays', zenerDiodeArrayParamMap],
  ['Single Zener Diodes', singleZenerDiodeParamMap],
  ['Bridge Rectifiers', bridgeRectifierParamMap],
  ['Single Diodes', singleDiodeParamMap],
  ['TVS Diodes', tvsDiodeParamMap],
  // Block B: MOSFETs
  ['FETs, MOSFETs', mosfetParamMap],
  // Block B: BJTs — Digikey category is "Single Bipolar Transistors"
  ['Bipolar Transistors', bjtParamMap],
  // Block B: IGBTs — Digikey category is "Single IGBTs"
  ['IGBTs', igbtParamMap],
  // Block B: Thyristors — separate Digikey categories for SCRs and TRIACs
  ['SCRs', scrParamMap],
  ['TRIACs', triacParamMap],
  // Block B: JFETs — Digikey category is "JFETs"
  ['JFETs', jfetParamMap],
  // Block C: Power Management ICs
  // LDOs — Digikey category is "Voltage Regulators - Linear" (expected)
  ['Voltage Regulators - Linear', ldoParamMap],
  // C2: Switching Regulators — TWO Digikey categories with different param maps
  // Integrated: "Voltage Regulators - DC DC Switching Regulators"
  // Controller: "DC DC Switching Controllers" (no "Voltage Regulators" prefix!)
  ['DC DC Switching Regulators', switchingRegIntegratedParamMap],
  ['DC DC Switching Controllers', switchingControllerParamMap],
  // C3: Gate Drivers — TWO Digikey categories (non-isolated and isolated)
  // "Isolators - Gate Drivers" MUST come before "Gate Drivers" for correct substring matching
  ['Isolators - Gate Drivers', isolatedGateDriverParamMap],
  ['Gate Drivers', gateDriverParamMap],
  // C4: Op-Amps / Comparators — separate Digikey categories with different field names
  // "Comparators" must come before "Op Amps" for correct substring matching
  ['Comparators', comparatorParamMap],
  ['Instrumentation, Op Amps, Buffer Amps', opampParamMap],
  // C5: Logic ICs — 7 Digikey leaf categories with distinct field names
  // More specific substrings first to avoid false matches
  ['Buffers, Drivers, Receivers, Transceivers', logicBuffersParamMap],
  ['Signal Switches, Multiplexers, Decoders', logicMuxDecoderParamMap],
  ['Counters, Dividers', logicCountersParamMap],
  ['Shift Registers', logicShiftRegistersParamMap],
  ['Gates and Inverters', logicGatesParamMap],
  ['Flip Flops', logicFlipFlopsParamMap],
  ['Latches', logicLatchesParamMap],
];

/** Find the category map for a given Digikey category name */
function findCategoryMap(categoryName: string): Record<string, ParamMapEntry> | null {
  const lower = categoryName.toLowerCase();
  const match = categoryParamMaps.find(([key]) => lower.includes(key.toLowerCase()));
  return match?.[1] ?? null;
}

/** Look up a raw entry (single or array) from a category map */
function lookupEntry(
  map: Record<string, ParamMapEntry>,
  parameterText: string
): ParamMapEntry | null {
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
 * Look up parameter mappings for a given Digikey ParameterText within a category.
 * Returns an array of mappings (usually 1, but can be multiple when a single
 * Digikey parameter maps to several internal attributes, e.g., "Features" →
 * aec_q200 + anti_sulfur for chip resistors).
 * Returns empty array if no mapping exists.
 */
export function getParamMappings(
  categoryName: string,
  parameterText: string
): ParamMapping[] {
  const map = findCategoryMap(categoryName);
  if (!map) return [];

  const entry = lookupEntry(map, parameterText);
  if (!entry) return [];

  return Array.isArray(entry) ? entry : [entry];
}

/**
 * Get all mapped parameter texts for a category (useful for filtering).
 */
export function getMappedParameterTexts(categoryName: string): string[] {
  const map = findCategoryMap(categoryName);
  return map ? Object.keys(map) : [];
}

/**
 * Check if a Digikey category name has a parameter mapping defined.
 */
export function hasCategoryMapping(categoryName: string): boolean {
  return findCategoryMap(categoryName) !== null;
}

/**
 * Map family IDs to the Digikey category names that provide their param maps.
 * Some families share a Digikey category (e.g., 52/53/54/55 all use "Chip Resistor").
 * B1 has two categories: "Single Diodes" and "Bridge Rectifiers".
 */
const familyToDigikeyCategories: Record<string, string[]> = {
  '12': ['Ceramic Capacitors'],
  '13': ['Ceramic Capacitors'],
  '52': ['Chip Resistor'],
  '53': ['Chip Resistor'],
  '54': ['Chip Resistor'],
  '55': ['Chip Resistor'],
  '58': ['Aluminum Electrolytic Capacitors'],
  '59': ['Tantalum Capacitors', 'Tantalum - Polymer Capacitors'],
  '60': ['Aluminum - Polymer Capacitors'],
  '61': ['Electric Double Layer Capacitors'],
  '64': ['Film Capacitors'],
  '65': ['Varistors'],
  '66': ['PTC Resettable Fuses'],
  '67': ['NTC Thermistors'],
  '68': ['PTC Thermistors'],
  '69': ['Common Mode Chokes'],
  '70': ['Ferrite Beads and Chips'],
  '71': ['Fixed Inductors'],
  '72': ['Fixed Inductors'],
  'B1': ['Single Diodes', 'Bridge Rectifiers'],
  'B2': ['Schottky Diodes', 'Schottky Diode Arrays'],
  'B3': ['Single Zener Diodes', 'Zener Diode Arrays'],
  'B4': ['TVS Diodes'],
  'B5': ['FETs, MOSFETs'],
  'B6': ['Bipolar Transistors'],
  'B7': ['IGBTs'],
  'B8': ['SCRs', 'TRIACs'],
  'B9': ['JFETs'],
  // Block C: Power Management ICs
  'C1': ['Voltage Regulators - Linear'],
  'C2': ['DC DC Switching Regulators', 'DC DC Switching Controllers'],
  'C3': ['Gate Drivers', 'Isolators - Gate Drivers'],
  'C4': ['Instrumentation, Op Amps, Buffer Amps', 'Comparators'],
  'C5': [
    'Gates and Inverters',
    'Buffers, Drivers, Receivers, Transceivers',
    'Flip Flops',
    'Latches',
    'Counters, Dividers',
    'Shift Registers',
    'Signal Switches, Multiplexers, Decoders',
  ],
};

/** Get the Digikey category names associated with a family ID (for param coverage) */
export function getDigikeyCategoriesForFamily(familyId: string): string[] {
  return familyToDigikeyCategories[familyId] ?? [];
}

/**
 * Taxonomy-specific overrides for families whose param map categories
 * don't match actual Digikey taxonomy names.
 *
 * Why this is needed: `familyToDigikeyCategories` uses param map category names
 * (for `computeFamilyParamCoverage()`), but Digikey's taxonomy may use different
 * names or have categories that share a param map but are separate in the taxonomy.
 *
 * - B2: virtual categories "Schottky Diodes"/"Schottky Diode Arrays" don't exist
 *   in taxonomy; Schottky parts live inside "Single Diodes" and "Diode Arrays".
 * - 13 (Mica): shares Ceramic Capacitors param map, but Digikey taxonomy has
 *   "Mica and PTFE Capacitors" as a separate subcategory.
 * - 53 (Through-Hole Resistors): shares Chip Resistor param map, but Digikey
 *   taxonomy has "Through Hole Resistors" as a separate subcategory.
 * - 55 (Chassis Mount Resistors): shares Chip Resistor param map, but Digikey
 *   taxonomy has "Chassis Mount Resistors" as a separate subcategory.
 */
const familyTaxonomyOverrides: Record<string, string[]> = {
  '13': ['Mica and PTFE Capacitors'],
  '53': ['Through Hole Resistors'],
  '55': ['Chassis Mount Resistors'],
  'B2': ['Single Diodes', 'Diode Arrays'],
  // B5: param map uses 'FETs, MOSFETs' (plural), but arrays leaf uses singular 'FET, MOSFET Arrays'
  'B5': ['Single FETs, MOSFETs', 'FET, MOSFET Arrays'],
  // B6: param map uses 'Bipolar Transistors', but Digikey leaf is 'Single Bipolar Transistors'
  'B6': ['Single Bipolar Transistors', 'Bipolar Transistor Arrays'],
  // B7: param map uses 'IGBTs', Digikey leaf is 'Single IGBTs'
  'B7': ['Single IGBTs'],
  // B8: Digikey leaves are just 'SCRs', 'TRIACs', 'DIACs, SIDACs' (under parent 'Thyristors')
  'B8': ['SCRs', 'TRIACs', 'DIACs, SIDACs'],
  // C1: param map uses 'Voltage Regulators - Linear' but that substring also matches
  // 'Linear + Switching' and 'Linear Regulator Controllers'. Use exact leaf name.
  'C1': ['Voltage Regulators - Linear, Low Drop Out (LDO) Regulators'],
  // C2: TWO separate Digikey categories — integrated switch and controller-only
  'C2': ['Voltage Regulators - DC DC Switching Regulators', 'DC DC Switching Controllers'],
  // C3: Gate Drivers — non-isolated = "Gate Drivers", isolated = "Isolators - Gate Drivers"
  'C3': ['Gate Drivers', 'Isolators - Gate Drivers'],
  // C4: Op-Amps under "Instrumentation, Op Amps, Buffer Amps", Comparators separate
  'C4': ['Instrumentation, Op Amps, Buffer Amps', 'Comparators'],
  // C5: Logic ICs — 7 leaf categories under "Logic" parent
  'C5': [
    'Gates and Inverters',
    'Buffers, Drivers, Receivers, Transceivers',
    'Flip Flops',
    'Latches',
    'Counters, Dividers',
    'Shift Registers',
    'Signal Switches, Multiplexers, Decoders',
  ],
};

/** Get the Digikey taxonomy patterns for a family (for taxonomy panel matching) */
export function getTaxonomyPatternsForFamily(familyId: string): string[] {
  return familyTaxonomyOverrides[familyId] ?? familyToDigikeyCategories[familyId] ?? [];
}

/** Get the full param map for a Digikey category name */
export function getFullParamMap(categoryName: string): Record<string, ParamMapEntry> | null {
  return findCategoryMap(categoryName);
}

/** Get all category-to-param-map entries (for enumeration) */
export function getAllCategoryParamMaps(): [string, Record<string, ParamMapEntry>][] {
  return categoryParamMaps;
}

/**
 * Compute the matchable weight for a family — the sum of rule weights
 * that have corresponding Digikey parameter mappings.
 */
export function computeFamilyParamCoverage(
  familyId: string,
  rules: { attributeId: string; weight: number }[],
): { totalWeight: number; matchableWeight: number } {
  const categories = getDigikeyCategoriesForFamily(familyId);
  const totalWeight = rules.reduce((sum, r) => sum + r.weight, 0);

  if (categories.length === 0) {
    return { totalWeight, matchableWeight: 0 };
  }

  // Collect all attributeIds that have Digikey param mappings
  const mappedAttributeIds = new Set<string>();
  for (const cat of categories) {
    const map = findCategoryMap(cat);
    if (!map) continue;
    for (const entry of Object.values(map)) {
      const mappings = Array.isArray(entry) ? entry : [entry];
      for (const m of mappings) {
        mappedAttributeIds.add(m.attributeId);
      }
    }
  }

  const matchableWeight = rules
    .filter(r => mappedAttributeIds.has(r.attributeId))
    .reduce((sum, r) => sum + r.weight, 0);

  return { totalWeight, matchableWeight };
}
