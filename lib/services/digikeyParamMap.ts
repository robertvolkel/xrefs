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
 * Category name patterns → which param map to use.
 * Keys are substrings of Digikey category names (matched case-insensitively).
 * Order matters: more specific patterns must come before general ones
 * (e.g., "Aluminum - Polymer" before "Aluminum" to avoid false matches).
 * "Schottky Diode*" entries are virtual categories resolved by
 * digikeyMapper.resolveParamMapCategory() from the "Technology" parameter.
 * "Single Zener Diodes" and "Zener Diode Arrays" are direct Digikey categories.
 * "TVS Diodes" is a single Digikey category covering all TVS types.
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
