import { FamilyContextConfig } from '../types';

/**
 * Voltage References (Family C6)
 * Block C: Standard ICs
 *
 * 4 context questions:
 * 1. Configuration — series vs shunt (BLOCKING — the #1 voltage reference substitution error)
 * 2. Output voltage type — fixed vs adjustable (determines adjustability matching mode)
 * 3. Precision level — high-precision / moderate / general purpose (escalates TC, noise, accuracy, stability)
 * 4. Automotive — AEC-Q100 gate
 *
 * Context sensitivity: moderate
 * Configuration (series vs shunt) is the categorical divide that catches most errors.
 * Series references (REF50xx, ADR3x, LT6654) actively drive the output pin from an
 * internal error amplifier. Shunt references (TL431, LM4040, LM385) clamp in parallel
 * with the load via an external series resistor — they cannot drive the output. These
 * are architecturally incompatible without circuit modification.
 *
 * Precision level determines whether TC, noise, and long-term stability are binding
 * specifications. For a general-purpose comparator threshold reference, TC and noise
 * are secondary. For a 24-bit ADC reference in metrology, they are the dominant specs.
 */
export const voltageReferenceContext: FamilyContextConfig = {
  familyIds: ['C6'],
  contextSensitivity: 'moderate',
  questions: [
    // Q1: Configuration — THE critical question for voltage reference substitution
    {
      questionId: 'configuration_type',
      questionText: 'Is this device configured as a series reference or a shunt reference?',
      priority: 1,
      options: [
        {
          value: 'series',
          label: 'Series reference (dedicated Vout pin drives the load directly)',
          description: 'Series references (REF50xx, ADR3x, LT6654, MAX60xx) have an internal error amplifier that actively regulates and drives the output pin. The device has separate IN, OUT, and GND pins. No external series resistor is needed. Shunt references are BLOCKED — they cannot drive the output and require an external resistor circuit that does not exist in a series topology.',
          attributeEffects: [
            { attributeId: 'configuration', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: Series reference topology confirmed — shunt references (TL431, LM4040, LM385) are architecturally incompatible. Shunt references clamp in parallel via external resistor; series references actively drive output. No circuit modification can reconcile these topologies without redesign.' },
          ],
        },
        {
          value: 'shunt',
          label: 'Shunt reference (TL431 / LM4040 / LM385 — parallel with load, external series resistor)',
          description: 'Shunt references sit in parallel with the load and regulate by sinking current through an external series resistor. The device has Anode, Cathode, and (for adjustable types) Reference pins. TL431 uses two programming resistors to set voltage. LM4040 is a 2-terminal device (like a precision Zener). Series references are BLOCKED — they would bypass the external resistor network.',
          attributeEffects: [
            { attributeId: 'configuration', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: Shunt reference topology confirmed — series references are architecturally incompatible. Installing a series reference into a TL431 feedback divider topology completely changes the regulation voltage and destroys the feedback loop.' },
            { attributeId: 'quiescent_current', effect: 'escalate_to_primary', note: 'Shunt reference — minimum cathode current Ika_min (typically 0.5–1 mA) must be maintained through external series resistor at all conditions. Rseries = (Vsupply_min − Vref) / (Ika_min + Iload_max). Higher Ika_min replacement may require Rseries recalculation.' },
            { attributeId: 'adjustability', effect: 'escalate_to_primary', note: 'Shunt reference — adjustability (resistor-programmable vs fixed) determines whether the external programming resistor network is compatible. Fixed shunt replacement in an adjustable circuit eliminates voltage trim capability.' },
          ],
        },
      ],
    },

    // Q2: Output voltage type — fixed vs adjustable
    {
      questionId: 'output_voltage_type',
      questionText: 'What type of output voltage is required?',
      priority: 2,
      options: [
        {
          value: 'fixed',
          label: 'Fixed voltage (1.2V, 2.048V, 2.500V, 3.000V, 4.096V, 5.000V, 10.000V)',
          description: 'Fixed-output references produce a specific voltage determined internally. Standard reference voltages: 1.2V (band-gap), 2.048V and 4.096V (ADC-optimal — powers of 2), 2.500V (most common general purpose), 3.000V, 5.000V, 10.000V (metrology). Output voltage must match exactly — no tolerance allowed beyond the specified accuracy band.',
          attributeEffects: [
            { attributeId: 'output_voltage', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: Fixed output voltage — exact match required. A 2.500V reference cannot substitute for 2.048V or 3.000V regardless of accuracy class. Missing voltage data is unacceptable.' },
          ],
        },
        {
          value: 'adjustable',
          label: 'Adjustable — resistor-programmable (TL431 type) or trim-pin adjustable',
          description: 'Adjustable references use external resistors or a trim pin to set the output voltage. For TL431-type resistor-programmable references, the replacement\'s internal reference voltage (Vref) and adjustment range must cover the required output voltage. For trim-pin references, verify trim range covers the required calibration offset.',
          attributeEffects: [
            { attributeId: 'adjustability', effect: 'escalate_to_primary', note: 'Adjustable reference — verify the replacement\'s adjustment range covers the required output voltage. For shunt types with external programming resistors, replacement Vref and trim range must be compatible with existing resistor network.' },
          ],
        },
      ],
    },

    // Q3: Precision level — determines which specs dominate
    {
      questionId: 'precision_level',
      questionText: 'What is the precision requirement for this reference?',
      priority: 3,
      options: [
        {
          value: 'high_precision',
          label: 'High precision (16+ bit ADC reference, metrology, calibration)',
          description: 'Initial accuracy (<0.05%), TC (<5 ppm/°C), 0.1–10 Hz noise, long-term stability, and architecture all become primary specifications. At 16-bit resolution, the difference between 0.05% and 0.1% initial accuracy = 32 LSBs of gain error. 0.1–10 Hz noise adds directly to ADC noise floor and cannot be averaged away. Buried Zener vs band-gap architecture determines noise floor and long-term drift class. NR pin usage must be preserved for noise filtering.',
          attributeEffects: [
            { attributeId: 'initial_accuracy', effect: 'escalate_to_primary', blockOnMissing: true, note: 'High-precision application — initial accuracy <0.05% required for 16+ bit ADC references. Gain error = accuracy_fraction × 2^N. At 16-bit: 0.05% = 32.8 LSBs; 0.1% = 65.5 LSBs. Missing accuracy data is unacceptable.' },
            { attributeId: 'tc', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: High-precision — TC <5 ppm/°C required. TC is the dominant error source across temperature. A 5 ppm/°C reference over 50°C range drifts 250 ppm = 16 LSBs at 16-bit. Verify box method vs average slope consistency.' },
            { attributeId: 'output_noise', effect: 'escalate_to_primary', blockOnMissing: true, note: 'High-precision — 0.1–10 Hz noise is the critical spec for ADC references. Reference noise adds directly to ADC noise floor and CANNOT be averaged away. At 24-bit: 1 LSB = 149 nV; 6 µVrms = ~40 LSBs of noise. Missing noise data is unacceptable.' },
            { attributeId: 'long_term_stability', effect: 'escalate_to_primary', note: 'High-precision / metrology — long-term stability determines calibration interval. Band-gap: 25–100 ppm/1000h; buried Zener: 0.5–5 ppm/1000h. A 50 ppm/1000h reference ≈ 438 ppm/year — far exceeds a 75 ppm/year drift budget.' },
            { attributeId: 'architecture', effect: 'escalate_to_mandatory', note: 'BLOCKING: High-precision — band-gap and buried Zener architectures have fundamentally different TC curve shapes, noise floors, and long-term stability. System TC compensation tuned to one architecture will produce systematic error with the other. Buried Zener has 10–100× lower 0.1–10 Hz noise.' },
            { attributeId: 'nr_pin', effect: 'escalate_to_primary', note: 'High-precision — if original uses NR pin with external capacitor for 10–20× noise reduction, replacement must also have NR pin. Losing the NR capacitor reverts noise to unfiltered specification — potentially blocking for 24-bit ADC applications.' },
            { attributeId: 'tc_accuracy_grade', effect: 'escalate_to_primary', note: 'High-precision — grade suffix encodes both TC and accuracy simultaneously. Verify numerical values of both parameters, not just grade letter. REF5025A = 0.05%/3ppm vs REF5025B = 0.1%/5ppm.' },
          ],
        },
        {
          value: 'moderate',
          label: 'Moderate precision (12–16 bit ADC, sensor conditioning)',
          description: 'Standard parametric matching with TC as a primary concern. Initial accuracy 0.1–0.2% is acceptable. TC 10–25 ppm/°C is acceptable for moderate temperature ranges. Output noise is important but typically adequate with modern band-gap references.',
          attributeEffects: [
            { attributeId: 'tc', effect: 'escalate_to_primary', note: 'Moderate precision — TC is important but not blocking. 10–25 ppm/°C acceptable for 12–16 bit applications over moderate temperature ranges.' },
          ],
        },
        {
          value: 'general_purpose',
          label: 'General purpose (comparator threshold, simple bias, non-precision)',
          description: 'Relaxed matching — primary concerns are output voltage, dropout, and Iq. TC and noise are secondary. Architecture (band-gap vs buried Zener) is informational only — either works for non-precision applications.',
          attributeEffects: [
            { attributeId: 'architecture', effect: 'add_review_flag', note: 'General purpose — architecture is informational only for non-precision applications. Band-gap and buried Zener both work; choice is driven by supply voltage and power consumption rather than precision.' },
          ],
        },
      ],
    },

    // Q4: Automotive — AEC-Q100 gate
    {
      questionId: 'automotive',
      questionText: 'Is this an automotive application?',
      priority: 4,
      options: [
        {
          value: 'yes',
          label: 'Yes — automotive (AEC-Q100 required)',
          description: 'AEC-Q100 becomes mandatory. Non-automotive-qualified parts cannot substitute regardless of electrical match. Temperature range must cover −40°C to +125°C minimum (Grade 1). Automotive voltage references appear in BMS ADC references, motor control, and sensor interface circuits. Some automotive designs require documented long-term drift budgets for 10–15 year vehicle lifetimes.',
          attributeEffects: [
            { attributeId: 'aec_q100', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: Automotive — AEC-Q100 qualification is required. Covers HTOL at Tj_max, ELFR, ESD to AEC levels, and latch-up screening at 100mA. Non-qualified parts are rejected regardless of electrical compatibility.' },
            { attributeId: 'operating_temp', effect: 'escalate_to_primary', note: 'Automotive — must cover −40°C to +125°C minimum (Grade 1). Commercial-grade (0°C to +70°C) references will not maintain rated TC at automotive temperature extremes.' },
          ],
        },
        {
          value: 'no',
          label: 'No',
          description: 'Standard environmental matching. AEC-Q100 is operational — presence is informational but not required.',
          attributeEffects: [],
        },
      ],
    },
  ],
};
