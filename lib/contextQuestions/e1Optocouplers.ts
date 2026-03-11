import { FamilyContextConfig } from '../types';

/**
 * Optocouplers / Photocouplers (Family E1)
 * Block E: Optoelectronics
 *
 * 4 context questions:
 * 1. Isolation class / application type — functional / basic / reinforced / safety-rated
 *    Reinforced escalates isolation_voltage, working_voltage, creepage, clearance,
 *    peak_isolation_voltage, and safety_certification to mandatory + blockOnMissing.
 * 2. Bandwidth / speed requirement — slow-DC / PWM-control / high-speed digital / analog
 *    High-speed digital escalates bandwidth + propagation_delay to mandatory +
 *    blockOnMissing, and supply_voltage_vcc for logic-output types.
 * 3. CTR precision / range requirement — standard / precision / long-life
 *    Precision escalates ctr_min, ctr_max, ctr_class to mandatory + blockOnMissing.
 *    Long-life escalates ctr_degradation to mandatory + blockOnMissing.
 * 4. Automotive application — aec_q101 to mandatory + blockOnMissing,
 *    operating_temp_range to mandatory
 *
 * Context sensitivity: moderate-high
 * output_transistor_type is ALWAYS identity w10 blockOnMissing regardless of context.
 * isolation_voltage_vrms is ALWAYS threshold GTE w10 blockOnMissing.
 *
 * Note: Optocouplers use AEC-Q101 (discrete semiconductors), NOT AEC-Q100 or AEC-Q200.
 */
export const e1OptocouplerContext: FamilyContextConfig = {
  familyIds: ['E1'],
  contextSensitivity: 'moderate-high',
  questions: [
    // Q1: Isolation class / application type
    {
      questionId: 'isolation_class',
      questionText: 'What is the isolation class / application type?',
      priority: 1,
      options: [
        {
          value: 'functional',
          label: 'Functional isolation only (low-voltage signal crossing, no safety requirement)',
          description: 'Low-voltage signal isolation with no safety certification requirement. The optocoupler provides galvanic separation but is not relied upon for human safety. Isolation voltage ≥500 Vrms is acceptable. Creepage, clearance, and safety certification are informational only.',
          attributeEffects: [
            { attributeId: 'creepage_distance_mm', effect: 'add_review_flag', note: 'Functional isolation — creepage is informational. Verify adequacy for the application voltage but no mandatory minimum.' },
            { attributeId: 'clearance_distance_mm', effect: 'add_review_flag', note: 'Functional isolation — clearance is informational. Verify adequacy for the application voltage.' },
            { attributeId: 'peak_isolation_voltage_v', effect: 'add_review_flag', note: 'Functional isolation — peak isolation is informational. Verify transient withstand capability if the circuit experiences surges.' },
            { attributeId: 'safety_certification', effect: 'add_review_flag', note: 'Functional isolation — safety certification not required. Informational only.' },
          ],
        },
        {
          value: 'basic',
          label: 'Basic isolation (low-voltage boundary, IEC 62368 or similar, single fault protection)',
          description: 'Basic insulation providing single-fault protection per IEC 62368 or equivalent. Isolation voltage must be ≥1500 Vrms. Working voltage, creepage, clearance, and safety certification become primary concerns for compliance.',
          attributeEffects: [
            { attributeId: 'isolation_voltage_vrms', effect: 'escalate_to_mandatory', note: 'Basic isolation — isolation voltage must be ≥1500 Vrms for IEC 62368 basic insulation compliance. Replacement must meet or exceed this minimum.' },
            { attributeId: 'working_voltage_vrms', effect: 'escalate_to_primary', note: 'Basic isolation — working voltage becomes a primary concern. Must cover the actual continuous voltage across the isolation barrier.' },
            { attributeId: 'creepage_distance_mm', effect: 'escalate_to_primary', note: 'Basic isolation — creepage distance must meet IEC 60664 requirements for the working voltage and pollution degree.' },
            { attributeId: 'clearance_distance_mm', effect: 'escalate_to_primary', note: 'Basic isolation — clearance distance must meet IEC 60664 requirements.' },
            { attributeId: 'safety_certification', effect: 'escalate_to_primary', note: 'Basic isolation — safety certification (UL1577 or IEC 62368) is important for market access.' },
          ],
        },
        {
          value: 'reinforced',
          label: 'Reinforced isolation (mains-connected, 2x basic isolation, no accessible single fault)',
          description: 'Reinforced insulation for mains-connected circuits providing double protection per IEC 62368 — no accessible single fault. Isolation voltage must be ≥3750 Vrms. Working voltage, creepage (≥8mm at PD2), peak isolation voltage, and safety certification (UL1577 or VDE required) all become mandatory with blockOnMissing.',
          attributeEffects: [
            { attributeId: 'isolation_voltage_vrms', effect: 'escalate_to_mandatory', note: 'BLOCKING: Reinforced isolation — isolation voltage must be ≥3750 Vrms for IEC 62368 reinforced insulation. This is the minimum test voltage for mains-connected applications.' },
            { attributeId: 'working_voltage_vrms', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: Reinforced isolation — working voltage must cover mains voltage (250 Vrms nominal, 300 Vrms with tolerance). Missing working voltage spec is unacceptable for mains isolation.' },
            { attributeId: 'creepage_distance_mm', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: Reinforced isolation — creepage must be ≥8mm for 250 Vrms working voltage at pollution degree 2 (IEC 60664 Table F.4). Missing creepage data is unacceptable for mains-connected safety.' },
            { attributeId: 'clearance_distance_mm', effect: 'escalate_to_mandatory', note: 'Reinforced isolation — clearance must meet IEC 60664 requirements for reinforced insulation (typically ≥5.5mm for ≤300V).' },
            { attributeId: 'peak_isolation_voltage_v', effect: 'escalate_to_mandatory', note: 'Reinforced isolation — peak isolation voltage must cover transient overvoltages per IEC 60664 overvoltage categories. Mains-connected category II: 2500V peak minimum.' },
            { attributeId: 'safety_certification', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: Reinforced isolation — UL1577 or VDE 0884-10 certification required for mains-connected safety isolation. Missing certification blocks the part from reinforced isolation applications.' },
          ],
        },
        {
          value: 'safety_rated',
          label: 'Safety-rated / medical / industrial certified (specific certification mark required)',
          description: 'All reinforced rules apply, plus pollution degree becomes mandatory and safety certification requires a specific certification mark. Medical applications may require IEC 60601 compliance. Industrial safety relay applications may require SIL certification.',
          attributeEffects: [
            { attributeId: 'isolation_voltage_vrms', effect: 'escalate_to_mandatory', note: 'BLOCKING: Safety-rated — all reinforced isolation rules apply. Isolation voltage ≥3750 Vrms minimum.' },
            { attributeId: 'working_voltage_vrms', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: Safety-rated — working voltage is mandatory. Missing spec blocks the part.' },
            { attributeId: 'creepage_distance_mm', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: Safety-rated — creepage distance mandatory. Verify against pollution degree × overvoltage category per IEC 60664.' },
            { attributeId: 'clearance_distance_mm', effect: 'escalate_to_mandatory', note: 'Safety-rated — clearance must meet IEC 60664 requirements.' },
            { attributeId: 'peak_isolation_voltage_v', effect: 'escalate_to_mandatory', note: 'Safety-rated — peak isolation voltage mandatory.' },
            { attributeId: 'safety_certification', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: Safety-rated — specific certification mark required (UL1577, VDE 0884-10, CSA, or IEC 60601 for medical). Missing certification blocks the part.' },
            { attributeId: 'pollution_degree', effect: 'escalate_to_mandatory', note: 'Safety-rated — pollution degree determines creepage distance multiplier per IEC 60664. Must be verified for the installation environment.' },
          ],
        },
      ],
    },

    // Q2: Bandwidth / speed requirement
    {
      questionId: 'bandwidth_speed',
      questionText: 'What is the bandwidth / speed requirement?',
      priority: 2,
      options: [
        {
          value: 'slow_dc',
          label: 'Slow / DC monitoring (≤10 kHz switching, relay driving, slow analog feedback)',
          description: 'Low-speed applications where the optocoupler switches infrequently or monitors a slowly-changing signal. Bandwidth and propagation delay are informational only. Both phototransistor and photodarlington types are acceptable.',
          attributeEffects: [
            { attributeId: 'bandwidth_khz', effect: 'add_review_flag', note: 'Slow/DC — bandwidth is informational. Verify it is adequate for the switching rate but no mandatory minimum.' },
            { attributeId: 'propagation_delay_us', effect: 'add_review_flag', note: 'Slow/DC — propagation delay is informational. Not timing-critical for relay driving or slow feedback.' },
          ],
        },
        {
          value: 'pwm_control',
          label: 'PWM / control loop (10 kHz-100 kHz switching, motor control, SMPS feedback)',
          description: 'Medium-speed applications where the optocoupler carries PWM signals in a control loop. Bandwidth must be ≥5× the switching frequency. Propagation delay asymmetry (tpHL ≠ tpLH) distorts PWM duty cycle. Photodarlington types are typically too slow above 50 kHz.',
          attributeEffects: [
            { attributeId: 'bandwidth_khz', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: PWM/control loop — bandwidth must be ≥5× the switching frequency to avoid gain rolloff that distorts the feedback signal. At Fsw = 100 kHz, bandwidth must be ≥500 kHz. Missing bandwidth data is unacceptable for PWM applications.' },
            { attributeId: 'propagation_delay_us', effect: 'escalate_to_mandatory', note: 'PWM/control loop — propagation delay asymmetry (tpHL ≠ tpLH) distorts PWM duty cycle. If tpLH exceeds tpHL by >100 ns at 100 kHz, effective duty cycle shifts by >1%, causing regulation errors.' },
            { attributeId: 'output_transistor_type', effect: 'add_review_flag', note: 'PWM/control loop — photodarlington types (MCT2, H11D1) are typically too slow above 50 kHz. Verify bandwidth is adequate if using photodarlington.' },
          ],
        },
        {
          value: 'high_speed_digital',
          label: 'High-speed digital isolation (>500 kHz, UART/SPI/CAN boundary isolation)',
          description: 'High-speed digital signal isolation where the optocoupler must faithfully reproduce a data stream at >500 kHz. Logic-output types strongly preferred — phototransistor bandwidth is inadequate above ~1 MHz. VCC supply range must include the board supply. Propagation delay must be ≤ the bit period.',
          attributeEffects: [
            { attributeId: 'bandwidth_khz', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: High-speed digital — bandwidth must be ≥2× the data rate to avoid signal distortion. At 10 Mbps UART, bandwidth must be ≥20 MHz (use 6N137 or HCPL-2601 class). Missing bandwidth data is unacceptable.' },
            { attributeId: 'propagation_delay_us', effect: 'escalate_to_mandatory', note: 'High-speed digital — propagation delay must be ≤ the bit period. At 10 Mbps, bit period is 100 ns — delays must be well below this. Asymmetric delays cause pulse width distortion.' },
            { attributeId: 'supply_voltage_vcc', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: High-speed digital — logic-output types require VCC. VCC range must include the board supply voltage (3.3V or 5V). Missing VCC spec for logic-output is unacceptable.' },
          ],
        },
        {
          value: 'wideband_analog',
          label: 'Wideband analog isolation (signal fidelity, audio, analog bandwidth)',
          description: 'Analog signal isolation where the optocoupler operates in its linear region. Bandwidth determines the usable analog frequency range. CTR linearity and output load impedance affect analog fidelity. Phototransistor types preferred for analog operation (photodarlington has poor linearity).',
          attributeEffects: [
            { attributeId: 'bandwidth_khz', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: Wideband analog — bandwidth must cover the analog signal frequency range with adequate margin. Missing bandwidth data is unacceptable for analog fidelity verification.' },
            { attributeId: 'propagation_delay_us', effect: 'escalate_to_primary', note: 'Wideband analog — propagation delay contributes to phase shift in the feedback path. Important for stability analysis in servo loops.' },
          ],
        },
      ],
    },

    // Q3: CTR precision / range requirement
    {
      questionId: 'ctr_precision',
      questionText: 'Is there a CTR precision / range requirement?',
      priority: 3,
      options: [
        {
          value: 'standard',
          label: 'Standard — CTR minimum only matters (relay driving, digital switching)',
          description: 'Standard applications where only the CTR minimum matters — the output just needs to saturate. CTR maximum, rank class, and degradation are informational. This covers relay driving, status indication, and simple on/off digital switching.',
          attributeEffects: [
            { attributeId: 'ctr_max_pct', effect: 'add_review_flag', note: 'Standard CTR — CTR maximum is informational. Verify it does not cause excessive output current but no mandatory limit.' },
            { attributeId: 'ctr_class', effect: 'add_review_flag', note: 'Standard CTR — CTR class (A/B/C/D) is informational. Any class with adequate CTR_min is acceptable.' },
            { attributeId: 'ctr_degradation_pct', effect: 'add_review_flag', note: 'Standard CTR — CTR degradation is informational. For short-life consumer products, degradation is not a concern.' },
          ],
        },
        {
          value: 'precision',
          label: 'Precision CTR — bounded range required (analog feedback, linear region, proportional control)',
          description: 'The CTR range must be bounded (both min and max) because the feedback loop or analog circuit is tuned to a specific gain range. CTR class matching ensures the replacement falls within the required gain bin. CTR at actual operating If must be verified — CTR varies with If.',
          attributeEffects: [
            { attributeId: 'ctr_min_pct', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: Precision CTR — CTR minimum must be verified at the actual operating If. Missing CTR_min data is unacceptable for precision applications.' },
            { attributeId: 'ctr_max_pct', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: Precision CTR — CTR maximum must be bounded. Unbounded CTR may cause the output to saturate with excessive base overdrive, destabilizing feedback loops.' },
            { attributeId: 'ctr_class', effect: 'escalate_to_mandatory', note: 'Precision CTR — CTR class (A/B/C/D) must match. Each class defines a specific CTR range that the feedback loop is designed around.' },
            { attributeId: 'ctr_degradation_pct', effect: 'escalate_to_primary', note: 'Precision CTR — CTR degradation is important. Verify that CTR at end-of-life still falls within the required bounded range.' },
          ],
        },
        {
          value: 'long_life',
          label: 'Long-life / high-reliability (industrial safety relay, 10,000h+ service life)',
          description: 'Long-life applications where LED aging causes CTR to degrade significantly over the product lifetime. Initial CTR_min should be ≥2× the required minimum to accommodate degradation. CTR lifetime curve must be published. Lower If extends LED life (slower aging).',
          attributeEffects: [
            { attributeId: 'ctr_min_pct', effect: 'escalate_to_mandatory', note: 'Long-life — initial CTR_min should be ≥2× the required minimum to accommodate LED degradation over the product lifetime. A part with 100% initial CTR and 50% degradation has 50% at end-of-life.' },
            { attributeId: 'ctr_degradation_pct', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: Long-life — CTR degradation rate must be published. Missing CTR lifetime data is unacceptable for 10,000h+ service life applications. Flag any part without a published CTR lifetime curve.' },
            { attributeId: 'if_rated_ma', effect: 'escalate_to_primary', note: 'Long-life — lower If = slower LED aging. A circuit that can operate at 5 mA instead of 20 mA will have 4× longer LED life. Replacement If_rated must support low-current operation.' },
          ],
        },
      ],
    },

    // Q4: Automotive application
    {
      questionId: 'automotive_aec_q101',
      questionText: 'Is this an automotive application (AEC-Q101 required)?',
      priority: 4,
      options: [
        {
          value: 'yes',
          label: 'Yes — automotive application (AEC-Q101 required)',
          description: 'Automotive applications require AEC-Q101 discrete semiconductor qualification. Non-AEC parts are blocked from automotive designs. Operating temperature range must cover −40°C to +125°C. CTR degradation is important for automotive reliability requirements.',
          attributeEffects: [
            { attributeId: 'aec_q101', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: Automotive — AEC-Q101 discrete semiconductor qualification required. Non-AEC parts are blocked. Note: optocouplers use AEC-Q101 (discrete semiconductors — LED + phototransistor), NOT AEC-Q100 (active ICs) or AEC-Q200 (passives).' },
            { attributeId: 'operating_temp_range', effect: 'escalate_to_mandatory', note: 'Automotive — operating temperature range must cover −40°C to +125°C for engine-bay applications. CTR at temperature extremes must be verified.' },
            { attributeId: 'ctr_degradation_pct', effect: 'escalate_to_primary', note: 'Automotive — CTR degradation is important for automotive reliability. Verify that CTR at end-of-life (accounting for thermal cycling, humidity, and LED aging) still meets minimum requirements.' },
          ],
        },
        {
          value: 'no',
          label: 'No — commercial / industrial',
          description: 'Standard commercial or industrial application. AEC-Q101 is informational only. Standard environmental matching applies.',
          attributeEffects: [],
        },
      ],
    },
  ],
};
