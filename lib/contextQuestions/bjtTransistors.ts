import { FamilyContextConfig } from '../types';

/**
 * BJTs — NPN & PNP (Family B6)
 * Block B: Discrete Semiconductors
 *
 * 4 context questions:
 * 1. Operating mode (always ask — saturated switching vs linear/analog vs class AB pair)
 *    THIS IS THE CRITICAL QUESTION — completely changes which parameters dominate.
 *    Storage time is irrelevant in analog; hFE curve shape is irrelevant in switching.
 * 2. Switching frequency (conditional on Q1=saturated_switching)
 *    >100kHz: tst is BLOCKING — missing tst in replacement = hard fail.
 * 3. Complementary pair (conditional on Q1=class_ab_pair OR Q1=linear_analog)
 *    Flags hFE/Vbe(on)/ft for pair matching review. Dual-device engine deferred.
 * 4. Automotive (always ask — AEC-Q101 gate)
 *
 * Context sensitivity: moderate-high
 * The most important bifurcation is operating mode — saturated switching vs.
 * linear/analog mode. Storage time is dominant in fast switching; it is
 * completely irrelevant in analog applications. hFE must always be evaluated
 * as a curve at the actual operating Ic, not as a single datasheet number.
 */
export const bjtTransistorsContext: FamilyContextConfig = {
  familyIds: ['B6'],
  contextSensitivity: 'high',
  questions: [
    // Q1: Operating mode — THE critical bifurcation
    {
      questionId: 'operating_mode',
      questionText: 'What is the operating mode of this BJT?',
      priority: 1,
      options: [
        {
          value: 'saturated_switching',
          label: 'Saturated switching (digital logic driver, relay driver, solenoid driver, LED driver)',
          description: 'Storage time (tst) becomes the PRIMARY switching speed concern. Vce(sat) is the primary conduction loss spec. hFE need only be sufficient to saturate at required Ic — circuit designers typically overdrive the base by 5-10x minimum hFE.',
          attributeEffects: [
            { attributeId: 'tst', effect: 'escalate_to_primary', note: 'Saturated switching — storage time is the PRIMARY switching speed constraint. It limits max frequency and causes duty cycle distortion.' },
            { attributeId: 'vce_sat', effect: 'escalate_to_primary', note: 'Saturated switching — Vce(sat) determines conduction loss: Ploss = Ic x Vce(sat) x duty_cycle.' },
            { attributeId: 'toff', effect: 'escalate_to_primary', note: 'Saturated switching — turn-off time (dominated by storage time) determines off-delay and power loss during transitions.' },
            { attributeId: 'ft', effect: 'not_applicable', note: 'Saturated switching — ft is measured in forward-active region and is not directly applicable to saturation operation where storage time is the limiting factor.' },
          ],
        },
        {
          value: 'linear_analog',
          label: 'Linear / analog (amplifier, buffer, linear regulator, current mirror, sensor interface)',
          description: 'The transistor never saturates. hFE at the actual operating Ic and temperature becomes PRIMARY. ft determines bandwidth. SOA becomes critical at high Vce with significant Ic.',
          attributeEffects: [
            { attributeId: 'tst', effect: 'not_applicable', note: 'Linear/analog mode — the transistor never saturates, so storage time is completely irrelevant.' },
            { attributeId: 'ton', effect: 'not_applicable', note: 'Linear/analog mode — switching times are irrelevant in continuous linear operation.' },
            { attributeId: 'toff', effect: 'not_applicable', note: 'Linear/analog mode — switching times are irrelevant in continuous linear operation.' },
            { attributeId: 'hfe', effect: 'escalate_to_mandatory', note: 'Linear/analog — hFE at the actual operating Ic and temperature is THE critical spec. Verify hFE vs. Ic curve shape matches the original. Biasing network stability depends on hFE range.' },
            { attributeId: 'ft', effect: 'escalate_to_mandatory', note: 'Linear/analog — ft determines amplifier bandwidth and gain-bandwidth product. Must meet or exceed the original for equivalent signal fidelity.' },
            { attributeId: 'soa', effect: 'escalate_to_mandatory', note: 'Linear mode — SOA with Second Breakdown limit is THE critical safety spec. The BJT operates on the SOA boundary continuously. Graphical comparison mandatory at the operating (Vce, Ic) point.' },
            { attributeId: 'vce_sat', effect: 'not_applicable', note: 'Linear/analog mode — the transistor does not reach saturation. Vce(sat) is irrelevant.' },
          ],
        },
        {
          value: 'class_ab_pair',
          label: 'Class AB / push-pull output stage (audio amplifier, motor driver complementary pair)',
          description: 'Both switching speed and analog performance matter. hFE matching between NPN and PNP halves is critical for symmetrical behavior. Vbe(on) matching determines crossover distortion. SOA required for quiescent operating point.',
          attributeEffects: [
            { attributeId: 'hfe', effect: 'escalate_to_mandatory', note: 'Class AB — hFE matching between NPN and PNP halves is critical for symmetrical output waveform. Gain mismatch causes crossover distortion and asymmetric clipping.' },
            { attributeId: 'soa', effect: 'escalate_to_mandatory', note: 'Class AB — SOA verification required for the quiescent operating point. Both halves must be verified for the same (Vce, Ic) condition.' },
            { attributeId: 'ft', effect: 'escalate_to_primary', note: 'Class AB — ft matching between NPN and PNP halves determines slew rate symmetry. Mismatch causes asymmetric transient response.' },
            { attributeId: 'vbe_sat', effect: 'add_review_flag', note: 'Class AB — Vbe(on) matching between NPN and PNP halves determines crossover distortion and thermal tracking. Critical for bias stability.' },
          ],
        },
      ],
    },

    // Q2: Switching frequency — conditional on saturated_switching
    {
      questionId: 'switching_frequency',
      questionText: 'What is the switching frequency?',
      priority: 2,
      condition: { questionId: 'operating_mode', values: ['saturated_switching'] },
      options: [
        {
          value: 'low_lt_10khz',
          label: 'Low frequency (<10kHz) — relay drivers, solenoid drivers, LED drivers',
          description: 'Storage time is a concern but not critical at low frequency — even a tst of 2µs is negligible at 1kHz. Focus on Vce(sat) and base drive adequacy.',
          attributeEffects: [],
        },
        {
          value: 'medium_10k_100k',
          label: 'Medium frequency (10kHz–100kHz) — PWM motor control, power supply housekeeping',
          description: 'Storage time becomes a meaningful constraint. tst must fit within the off period. Anti-saturation techniques (Schottky clamp) become important. Verify tst at operating Ic and base drive conditions.',
          attributeEffects: [
            { attributeId: 'tst', effect: 'escalate_to_primary', note: 'Medium frequency (10-100kHz) — storage time is a meaningful constraint. Must fit within off period.' },
            { attributeId: 'ft', effect: 'escalate_to_primary', note: 'Medium frequency — ft becomes more important for acceptable switching transition times.' },
          ],
        },
        {
          value: 'high_gt_100khz',
          label: 'High frequency (>100kHz) — high-speed logic drivers, switching regulators',
          description: 'Storage time is CRITICAL and likely the binding constraint. BLOCKING if tst is not specified in replacement datasheet. High-ft transistors designed for fast switching required.',
          attributeEffects: [
            { attributeId: 'tst', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING — at >100kHz, storage time is the binding switching speed constraint. Missing tst specification in replacement datasheet is unacceptable — the part cannot be validated for this application without tst data.' },
            { attributeId: 'ton', effect: 'escalate_to_primary', note: 'High frequency — turn-on time affects duty cycle accuracy and overlap power loss at >100kHz.' },
            { attributeId: 'toff', effect: 'escalate_to_mandatory', note: 'High frequency (>100kHz) — turn-off time (dominated by tst) must be verified. Excessive toff prevents the transistor from fully turning off before the next on-cycle.' },
            { attributeId: 'ft', effect: 'escalate_to_mandatory', note: 'High frequency — ft determines switching transition speed. Must be well above the switching frequency for clean transitions.' },
          ],
        },
      ],
    },

    // Q3: Complementary pair — conditional on class_ab_pair or linear_analog
    {
      questionId: 'complementary_pair',
      questionText: 'Is this a complementary pair application (NPN + PNP paired)?',
      priority: 3,
      condition: { questionId: 'operating_mode', values: ['class_ab_pair', 'linear_analog'] },
      options: [
        {
          value: 'yes_complementary',
          label: 'Yes — NPN and PNP are paired (push-pull, H-bridge, complementary symmetry)',
          description: 'Both NPN and PNP halves must be evaluated together as a matched pair. When possible, replace both with a known complementary pair (e.g., BC546/BC556, 2N3904/2N3906, 2SA1943/2SC5200).',
          attributeEffects: [
            { attributeId: 'hfe', effect: 'add_review_flag', note: 'Complementary pair — must match pair half. hFE mismatch between NPN and PNP causes asymmetric gain and crossover artifacts. Evaluate both NPN and PNP replacements together.' },
            { attributeId: 'vbe_sat', effect: 'add_review_flag', note: 'Complementary pair — Vbe(on) must match between NPN and PNP halves. Mismatch causes crossover distortion in class AB stages and bias point drift.' },
            { attributeId: 'ft', effect: 'add_review_flag', note: 'Complementary pair — ft mismatch between NPN and PNP halves causes asymmetric slew rates and transient response. Both halves should have similar bandwidth.' },
          ],
        },
        {
          value: 'no_single_device',
          label: 'No — single transistor, current mirror, or differential pair of same polarity',
          description: 'Standard single-device substitution rules apply. For differential pairs (matched NPN-NPN or PNP-PNP), hFE matching between the two devices matters for offset voltage.',
          attributeEffects: [],
        },
      ],
    },

    // Q4: Automotive — always ask
    {
      questionId: 'automotive',
      questionText: 'Is this an automotive application?',
      priority: 4,
      options: [
        {
          value: 'yes',
          label: 'Yes — automotive (AEC-Q101 required)',
          description: 'AEC-Q101 qualification is mandatory. Operating temperature range must cover -40°C to +125°C minimum.',
          attributeEffects: [
            { attributeId: 'aec_q101', effect: 'escalate_to_mandatory', note: 'Automotive — AEC-Q101 qualification is mandatory. End-customer qualification of a non-AEC-Q101 part requires significant engineering deviation and is not acceptable as a drop-in replacement.' },
          ],
        },
        {
          value: 'no',
          label: 'No — non-automotive',
          description: 'Standard environmental matching applies.',
          attributeEffects: [],
        },
      ],
    },
  ],
};
