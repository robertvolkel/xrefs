import { LogicTable } from '../types';

/**
 * Voltage References
 * Block C: Standard ICs — Family C6
 *
 * Derived from: docs/c6_voltage_reference_logic.docx
 * 19 attributes with specific matching rules for cross-reference validation.
 *
 * Sixth family in Block C. Covers precision series references (REF50xx, ADR3x,
 * LT6654), buried Zener references (LTZ1000, REF102, AD587), and shunt/adjustable
 * types (TL431, LM4040, LM385). Key substitution pitfalls:
 *
 * - Configuration (series vs shunt) is the HARD GATE. Series references actively
 *   drive output from internal error amplifier. Shunt references (TL431, LM4040,
 *   LM385) clamp in parallel with load via external series resistor — architecturally
 *   incompatible without circuit modification. LM4040 is shunt (2-terminal, like
 *   Zener); LM4041 is adjustable shunt with reference pin. Both are shunt despite
 *   similar naming. This is the #1 voltage reference substitution error.
 * - Output voltage is always Identity — 2.500V ≠ 2.048V ≠ 3.000V. Even small
 *   deviations produce proportional gain error in ADC measurements.
 * - TC and initial accuracy are paired via grade suffix — REF5025A = 0.05%/3ppm,
 *   REF5025B = 0.1%/5ppm. Substituting a lower grade relaxes both simultaneously.
 * - Output noise (0.1–10 Hz band) is the dominant hidden failure for high-resolution
 *   ADC references. 24-bit: 1 LSB ≈ 149 nV at 2.500V reference. A 6 µVrms
 *   reference contributes ~40 LSBs of noise — completely unacceptable.
 * - Enable/shutdown pin polarity is functionally fatal in both directions — active-low
 *   shutdown vs active-high enable mismatch leaves reference permanently off or on.
 * - NR pin with external capacitor provides 10–20× noise reduction. If replacement
 *   lacks NR pin, assembled noise reverts to unfiltered specification.
 *
 * Related families: LDOs (C1) — share dropout and enable pin concepts; Zener
 * Diodes (B3) — shunt references overlap functionally with precision Zeners;
 * ADCs/DACs — voltage references serve as the precision voltage standard.
 *
 * Architecture classes: Band-gap (LM4040, REF3x, LT6654 — low Vin, µA Iq,
 * parabolic TC curve), Buried Zener (LTZ1000, REF102, AD587 — sub-ppm/°C TC,
 * lowest drift, but >6V supply, mA Iq), XFET (select ADI parts — ultralow 1/f
 * noise for precision low-frequency and audio).
 */
export const voltageReferenceLogicTable: LogicTable = {
  familyId: 'C6',
  familyName: 'Voltage References',
  category: 'Integrated Circuits',
  description: 'Hard logic filters for voltage reference replacement validation — configuration (series vs shunt) is a BLOCKING gate before any parametric evaluation',
  rules: [
    // ============================================================
    // IDENTITY — Configuration, Output Voltage, Architecture
    // ============================================================
    {
      attributeId: 'configuration',
      attributeName: 'Configuration (Series / Shunt)',
      logicType: 'identity',
      weight: 10,
      blockOnMissing: true,
      engineeringReason: 'BLOCKING — evaluate before all others. Series references actively drive output pin from internal error amplifier (Vsupply → IN → regulation → OUT → load). Shunt references (TL431, LM4040, LM385, LM336) clamp in parallel with load via external series resistor — they do not drive output. Removing the external resistor from a shunt circuit leaves no regulation path. Installing a series reference into a TL431 feedback divider topology completely changes regulation voltage and destroys the feedback loop. These are architecturally incompatible without circuit modification.',
      sortOrder: 1,
    },
    {
      attributeId: 'output_voltage',
      attributeName: 'Output Voltage (Vout)',
      logicType: 'identity',
      weight: 10,
      blockOnMissing: true,
      engineeringReason: 'Output voltage must match exactly. A 2.500V reference cannot substitute for a 2.048V or 3.000V regardless of accuracy class — even small deviations produce proportional gain error in measurements and conversions. 2.500V at 0.1% accuracy = 2.4975V–2.5025V tolerance band; at 0.2% accuracy = 2.4950V–2.5050V — the wider band may exceed the ADC tolerance allocation. For adjustable-output references (TL431 type), verify the trim resistor network produces the required output with the replacement\'s nominal Vref and trim range. Standard reference voltages: 1.2V (band-gap), 2.048V (12-bit ADC optimal), 2.500V (most common), 3.000V, 4.096V (12-bit ADC optimal), 5.000V, 10.000V (metrology).',
      sortOrder: 2,
    },
    {
      attributeId: 'architecture',
      attributeName: 'Reference Architecture (Band-gap / Buried Zener / XFET)',
      logicType: 'identity',
      weight: 7,
      engineeringReason: 'Architecture determines TC curve shape, noise floor, and long-term stability class. Band-gap TC curve is parabolic with bow near 25°C — a system with external TC compensation tuned to this curve shape will introduce systematic error if architecture changes to buried Zener (more linear TC). For precision applications (>14-bit ADC, metrology), architecture is an Identity constraint — band-gap and buried Zener are not interchangeable despite same headline ppm/°C. Buried Zener has 10–100× lower 0.1–10 Hz noise and <1 ppm/1000h long-term drift vs 25–100 ppm/1000h for band-gap. XFET (select ADI parts) targets ultralow 1/f noise. Context Q3 (high-precision) escalates to BLOCKING.',
      sortOrder: 3,
    },
    {
      attributeId: 'adjustability',
      attributeName: 'Output Voltage Adjustability (Fixed / Adjustable / Trimmable)',
      logicType: 'identity',
      weight: 8,
      engineeringReason: 'Fixed vs adjustable vs trimmable is a functional Identity gate. If the original has a trim pin used for factory or field calibration and the replacement lacks one, the trimmed calibration offset is lost and initial accuracy reverts to untrimmed specification — for a 16-bit ADC (1 LSB = 38µV at 2.500V), a 2.5mV shift from lost trim = 66 LSBs of gain error. If the original is resistor-programmable (TL431 with two external resistors) and the replacement is fixed-output, the circuit cannot be set to the required voltage. Conversely, a fixed replacement in an adjustable circuit eliminates voltage trim capability.',
      sortOrder: 4,
    },

    // ============================================================
    // IDENTITY FLAGS — Grade, AEC-Q100
    // ============================================================
    {
      attributeId: 'tc_accuracy_grade',
      attributeName: 'TC/Accuracy Grade (Suffix)',
      logicType: 'identity_flag',
      weight: 7,
      engineeringReason: 'Most reference families encode both initial accuracy and TC in a single suffix letter or numeric code. REF5025A = ±0.05% / 3 ppm/°C. REF5025B = ±0.1% / 5 ppm/°C. REF5025 (no suffix) = ±0.2% / 10 ppm/°C. Substituting a lower grade relaxes BOTH parameters simultaneously. Replacement grade must encode equal or better performance on both dimensions. For a 16-bit ADC: the difference between A-grade (0.05%) and B-grade (0.1%) is 32 LSBs of gain error. Flag degradation with numerical impact for the application\'s ADC resolution and operating temperature range.',
      sortOrder: 5,
    },
    {
      attributeId: 'aec_q100',
      attributeName: 'AEC-Q100 Automotive Qualification',
      logicType: 'identity_flag',
      weight: 3,
      engineeringReason: 'AEC-Q100 is mandatory for automotive applications — non-qualified parts cannot substitute regardless of electrical match. Temperature range compliance alone is insufficient; AEC-Q100 adds HTOL at Tj_max, ELFR, ESD to automotive levels, and latch-up screening at 100mA. Precision voltage references appear as ADC references in battery management systems, motor control, and sensor interface circuits where ADAS/powertrain safety requirements demand documented long-term drift budgets. Context Q4 (automotive) escalates to BLOCKING (w10 + blockOnMissing).',
      sortOrder: 6,
    },

    // ============================================================
    // IDENTITY — Enable/Shutdown Pin Polarity
    // ============================================================
    {
      attributeId: 'enable_shutdown_polarity',
      attributeName: 'Enable/Shutdown Pin Polarity',
      logicType: 'identity',
      weight: 8,
      engineeringReason: 'Enable pin polarity mismatch is fatal in BOTH directions — not a one-way flag. Active-low shutdown (device operates when pin is high or floating, shuts down when pulled low) vs active-high enable (device operates when driven high) are mutually incompatible. If the existing circuit pulls the pin low to conserve power and the replacement interprets low as enable rather than shutdown, the reference is permanently off. If the original has no enable pin and the replacement does, the enable pin may float to an indeterminate state. Shutdown current also varies: some references achieve <1 µA, others only ~10 µA — verify against system sleep power budget.',
      sortOrder: 7,
    },

    // ============================================================
    // THRESHOLD ≤ — Accuracy, TC, Noise, Stability, Dropout, Iq
    // ============================================================
    {
      attributeId: 'initial_accuracy',
      attributeName: 'Initial Accuracy (%)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 8,
      engineeringReason: 'Replacement initial accuracy must equal or be tighter. Wider initial accuracy directly degrades system gain error floor. Typical grades: 0.02% (flagship precision), 0.05% (high precision), 0.1% (precision), 0.2% (standard), 0.5% (economy). Evaluate at actual Vout — 0.1% on 2.500V = ±2.5mV; on 5.000V = ±5.0mV. ADC impact: gain error in LSBs = initial_accuracy_fraction × 2^N. At 16-bit: 0.05% = 32.8 LSBs; 0.1% = 65.5 LSBs. Initial accuracy is independent from TC drift and long-term stability — both must be evaluated independently. Verify whether spec is before or after factory trim.',
      sortOrder: 8,
    },
    {
      attributeId: 'tc',
      attributeName: 'Temperature Coefficient (ppm/°C)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 8,
      engineeringReason: 'Replacement TC must equal or be lower over the same temperature range. TC is the dominant error source in precision references across temperature. Typical grades: <1 ppm/°C (ultraprecision buried Zener), 3–5 ppm/°C (high precision band-gap), 10–25 ppm/°C (precision), 50–100 ppm/°C (standard). A 5 ppm/°C reference over 50°C range drifts 250 ppm total = 0.025% = 625µV on 2.500V. For 16-bit ADC (1 LSB = 38µV) this is 16 LSBs of drift over temperature. Verify specification method consistency — box method (worst-case) always gives higher number than average slope. Context Q3 (high-precision) escalates to BLOCKING.',
      sortOrder: 9,
    },
    {
      attributeId: 'output_noise',
      attributeName: 'Output Voltage Noise (0.1–10 Hz µVrms)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 6,
      engineeringReason: 'Replacement noise must equal or be lower. For precision ADC references, the critical specification is the 0.1–10 Hz band noise (µVrms), not just wideband noise. Reference noise adds directly to the ADC noise floor and CANNOT be averaged away because it is correlated across conversion cycles. Typical values: 3 µVrms (low-noise band-gap), 6–15 µVrms (standard band-gap), <1 µVrms (buried Zener at controlled current). 16-bit ADC with 2.500V reference: 1 LSB = 38 µV, 6 µVrms = ~0.16 LSB — acceptable. 24-bit ADC: 1 LSB = 149 nV, 6 µVrms = ~40 LSBs of noise — unacceptable without heavy filtering. Context Q3 (high-precision) escalates to primary.',
      sortOrder: 10,
    },
    {
      attributeId: 'long_term_stability',
      attributeName: 'Long-Term Stability (ppm/1000h)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 4,
      engineeringReason: 'Long-term stability must equal or be better for precision and metrology applications. Band-gap references typically drift 25–100 ppm/1000h. Buried Zener: 0.5–5 ppm/1000h. LTZ1000-class: <0.5 ppm/1000h. Dominant mechanism is stress relaxation in die package after assembly — most drift occurs in first 100–1000 hours, then stabilizes. High-stability references are burn-in screened at elevated temperature before shipment. For calibration interval: 50 ppm/1000h ≈ 438 ppm/year; system maintaining <100 ppm total error with 25 ppm TC budget leaves 75 ppm/year drift budget — 50 ppm/1000h far exceeds this. Context Q3 (high-precision/metrology) escalates to primary.',
      sortOrder: 11,
    },
    {
      attributeId: 'dropout_voltage',
      attributeName: 'Dropout Voltage',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 7,
      engineeringReason: 'Replacement dropout must equal or be lower, evaluated at maximum load current and worst-case temperature. Vin_min = Vout + Vdropout. If the supply dips below Vin_min under any operating condition (load transient, battery discharge, supply tolerance), the reference drops out of regulation. Example: 5.000V reference with 600mV dropout requires 5.6V minimum supply — does not work from a 5V ±5% rail (4.75V minimum). Low-dropout references: LT6654 (300mV), MAX6033 (200mV) enable 5V reference from 5V ±5% supply. Standard references may require 1–2V headroom. For 3.3V supply: 3.000V reference with 300mV dropout works; 600mV dropout does not.',
      sortOrder: 12,
    },
    {
      attributeId: 'quiescent_current',
      attributeName: 'Quiescent Current (Iq)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 5,
      engineeringReason: 'Replacement Iq must equal or be lower for battery and power-budget-constrained designs. Series reference Iq ranges: ultralow (MAX6012, LT6654-1) 25–60 µA; standard precision (REF3x, ADR3x) 75–250 µA; high-precision/low-noise (AD780, REF102) 0.5–3 mA; buried Zener (LTZ1000) 2–5 mA. For shunt references: minimum cathode current Ika_min (typically 0.5–1 mA) must be maintained through external series resistor at all conditions — Rseries = (Vsupply_min − Vref) / (Ika_min + Iload_max). Context Q1 (shunt) escalates to primary since Ika_min determines the entire external circuit design.',
      sortOrder: 13,
    },

    // ============================================================
    // THRESHOLD ≥ — Output Current
    // ============================================================
    {
      attributeId: 'output_current',
      attributeName: 'Output Current / Load Current Capability',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 5,
      engineeringReason: 'Replacement output current capability must equal or exceed original at actual load. Precision band-gap references can source 5–15 mA continuously at full accuracy. Accuracy specifications are guaranteed only up to rated maximum load current — exceeding rated load causes Vout droop as internal output impedance (0.1–0.5Ω typical) creates voltage drop. For references driving only an ADC reference input, rarely a constraint (<1 mA). For references driving resistor networks or multiple ADC inputs in parallel, verify full current budget including ADC reference input spikes at sample rate. SAR ADCs create brief 1–10 mA peak spikes at sample rate as the internal capacitive DAC charges.',
      sortOrder: 14,
    },

    // ============================================================
    // THRESHOLD ⊇ — Input Voltage, Operating Temperature
    // ============================================================
    {
      attributeId: 'input_voltage_range',
      attributeName: 'Input Voltage Range',
      logicType: 'threshold',
      thresholdDirection: 'range_superset',
      weight: 7,
      engineeringReason: 'Replacement Vin range must contain actual circuit supply voltage. Vin_min is determined by dropout: Vin_min = Vout + Vdropout. If supply can dip below Vin_min under any operating condition, the reference drops out of regulation. Vin_max must not be exceeded under any transient — particularly in industrial environments with inductive load switching. Example: 5.000V reference with 500mV dropout requires ≥5.5V supply minimum. For tight supply headroom (5V rail drooping to 4.8V under load), verify reference Vin_min ≤ 4.8V. Worst-case supply transients must be checked against Vin_max.',
      sortOrder: 15,
    },
    {
      attributeId: 'operating_temp',
      attributeName: 'Operating Temperature Range',
      logicType: 'threshold',
      thresholdDirection: 'range_superset',
      weight: 6,
      engineeringReason: 'Replacement temperature range must fully cover application operating range. TC and accuracy specifications are guaranteed only over the rated temperature range — a commercial-grade reference (0°C to +70°C) used in an industrial environment will not maintain rated TC at −40°C or +85°C. Band-gap TC curve is parabolic with bow temperature designed near center of rated range — TC at temperatures beyond rated range can be significantly worse than datasheet specification. Temperature classes: Commercial (0°C to +70°C), Industrial (−40°C to +85°C), Automotive (−40°C to +125°C). Context Q4 (automotive) escalates to primary.',
      sortOrder: 16,
    },

    // ============================================================
    // APPLICATION REVIEW — NR Pin, Package
    // ============================================================
    {
      attributeId: 'nr_pin',
      attributeName: 'Output Noise Filtering (NR Pin)',
      logicType: 'application_review',
      weight: 4,
      engineeringReason: 'If original has NR pin used for noise filtering and replacement lacks one, low-pass filtering is lost and output noise reverts to unfiltered specification (10–20× worse). NR connects to internal band-gap amplifier node; 100nF to 10µF capacitor on NR pin reduces 0.1–10 Hz noise by 10–20×. In 24-bit ADC application where NR capacitor was critical to achieving sub-1-LSB noise, this is a blocking concern. For 12–16-bit ADC applications, unfiltered noise of most modern precision references is still adequate. If replacement has NR pin but original did not, verify PCB has placement site for capacitor. Context Q3 (high-precision) escalates to primary.',
      sortOrder: 17,
    },
    {
      attributeId: 'package_case',
      attributeName: 'Package / Footprint',
      logicType: 'application_review',
      weight: 5,
      engineeringReason: 'Package must match PCB footprint for drop-in replacement. SOT-23-3 (3-pin) and SOT-23-5 (5-pin) have DIFFERENT footprints despite similar outlines — not interchangeable. SC70-5 is smaller than SOT-23-5 with 0.65mm pin pitch vs 0.95mm — footprints are not compatible despite smaller outline. SOIC-8 for higher-pin-count references with multiple outputs. DFN-6, MSOP-8 as intermediate sizes. TO-92 for through-hole TL431, LM336, LM385 in legacy designs. TL431 exists in both SOT-23 and TO-92 — different footprints within same part family. Application Review because physical compatibility is a visual board-level check.',
      sortOrder: 18,
    },

    // ============================================================
    // OPERATIONAL — Packaging
    // ============================================================
    {
      attributeId: 'packaging',
      attributeName: 'Packaging Format (Tape & Reel / Cut Tape / Bulk)',
      logicType: 'operational',
      weight: 1,
      engineeringReason: 'Packaging format must match assembly process. SOT-23 and SC70 precision references supplied on tape-and-reel (3000-piece on 7-inch reels standard). Cut tape available for prototyping. TO-92 through-hole parts in bulk or tubes. Verify reel quantity (1000 or 3000 parts) and reel diameter match SMT machine feeders. Most SOT-23 precision references are MSL-1 (unlimited floor life at ≤30°C/85% RH).',
      sortOrder: 19,
    },
  ],
};
