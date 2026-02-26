import { FamilyContextConfig } from '../types';

/**
 * JFETs — Junction Field-Effect Transistors (Family B9)
 * Block B: Discrete Semiconductors
 *
 * 3 context questions:
 * 1. Application domain (always ask — THE critical question)
 *    Audio: 1/f noise corner and NF are primary; ft/capacitances irrelevant
 *    RF/VHF: ft, capacitances, and NF at frequency are primary; 1/f irrelevant
 *    Ultra-high-impedance: Igss is BLOCKING; Vgs(max) elevated
 *    General: standard weights apply
 * 2. Matched pair requirement (always ask — differential/balanced circuits)
 *    Yes: flag for engineering review; single-device matching is insufficient
 * 3. Automotive (always ask — AEC-Q101 gate + Igss at temperature)
 *
 * Context sensitivity: high
 * JFETs serve three fundamentally different application domains — audio
 * preamplifiers (noise-critical), RF low-noise amplifiers (frequency-critical),
 * and ultra-high-impedance inputs (leakage-critical). The same JFET family
 * prioritizes completely different parameters in each domain.
 */
export const jfetsContext: FamilyContextConfig = {
  familyIds: ['B9'],
  contextSensitivity: 'high',
  questions: [
    // Q1: Application domain — THE critical question for JFETs
    {
      questionId: 'application_domain',
      questionText: 'What is the primary application domain for this JFET?',
      priority: 1,
      options: [
        {
          value: 'audio_low_frequency',
          label: 'Audio / low-frequency (preamplifier, microphone buffer, instrumentation)',
          description: '1/f noise corner frequency and noise figure at low frequencies are the binding specifications. Best audio JFETs (2SK170, IF3602) have fc of 10-100Hz. Unity-gain frequency (ft) and capacitances (Ciss, Crss) are irrelevant below 100kHz — corner frequencies from even 20pF Ciss are well above the audio band.',
          attributeEffects: [
            { attributeId: 'fc_1f_corner', effect: 'escalate_to_primary', note: 'Audio application — 1/f noise corner frequency is THE differentiating spec. Parts with fc >1kHz are unsuitable for high-fidelity audio preamplification.' },
            { attributeId: 'noise_figure', effect: 'escalate_to_primary', note: 'Audio application — noise figure at low frequencies (10Hz-20kHz) determines signal-to-noise ratio of the preamplifier stage.' },
            { attributeId: 'ft', effect: 'not_applicable', note: 'Audio application — unity-gain frequency is irrelevant below 100kHz.' },
            { attributeId: 'ciss', effect: 'not_applicable', note: 'Audio application — input capacitance is irrelevant; 20pF Ciss gives corner frequency well above 20kHz.' },
            { attributeId: 'crss', effect: 'not_applicable', note: 'Audio application — reverse transfer capacitance and Miller effect are negligible below 100kHz.' },
          ],
        },
        {
          value: 'rf_vhf',
          label: 'RF / VHF low-noise amplifier (HF, VHF, UHF front end)',
          description: 'Unity-gain frequency (ft), input/output capacitances, and noise figure at the operating RF frequency are the binding specifications. NF rises sharply as frequency approaches ft. 1/f noise is irrelevant at MHz+ frequencies. Crss determines Miller-effect bandwidth limitation.',
          attributeEffects: [
            { attributeId: 'ft', effect: 'escalate_to_primary', note: 'RF application — ft must be well above operating frequency for useful gain and low NF. NF degrades sharply as frequency approaches ft.' },
            { attributeId: 'ciss', effect: 'escalate_to_primary', note: 'RF application — Ciss determines input matching network design. Rs(opt) = 1/(2pi × f × Ciss × Rn).' },
            { attributeId: 'crss', effect: 'escalate_to_primary', note: 'RF application — Crss limits bandwidth via Miller effect. Cin(Miller) = Crss × (1 + |Av|). Can cause oscillation without neutralization.' },
            { attributeId: 'noise_figure', effect: 'escalate_to_primary', note: 'RF application — NF at the operating frequency determines receiver sensitivity. Must verify at actual operating frequency, not datasheet 1kHz value.' },
            { attributeId: 'fc_1f_corner', effect: 'not_applicable', note: 'RF application — 1/f noise is irrelevant at MHz+ operating frequencies.' },
          ],
        },
        {
          value: 'ultra_high_z',
          label: 'Ultra-high-impedance input (pH electrode, electrometer, ionization detector)',
          description: 'BLOCKING: Gate leakage current (Igss) is THE binding specification. 10pA across 100G-ohm source impedance creates 1V offset error. Igss roughly doubles every 10C — must verify at maximum operating temperature. Applications: pH meters (10M-1G ohm), ion chambers, mass spectrometers, electret microphone capsules (1-10G ohm impedance).',
          attributeEffects: [
            { attributeId: 'igss', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: Ultra-high-impedance application — Igss is THE critical spec. Missing Igss in replacement datasheet is unacceptable; even 100pA leakage can corrupt measurement at G-ohm source impedances.' },
            { attributeId: 'vgs_max', effect: 'escalate_to_primary', note: 'Ultra-high-impedance — higher Vgs(max) provides margin against gate transients that would cause junction current, corrupting the measurement.' },
          ],
        },
        {
          value: 'general_purpose',
          label: 'General-purpose (switching, current source, VVR)',
          description: 'Standard matching weights apply. No specific application domain drives parameter escalation. JFET may be used as constant-current source, voltage-variable resistor, or general-purpose analog switch.',
          attributeEffects: [],
        },
      ],
    },

    // Q2: Matched pair — differential and balanced circuits
    {
      questionId: 'matched_pair',
      questionText: 'Does the application require matched-pair JFETs?',
      priority: 2,
      options: [
        {
          value: 'yes',
          label: 'Yes — differential input or balanced circuit',
          description: 'Matched-pair JFETs are required for differential inputs (instrumentation amplifiers) and balanced preamplifiers. Single-device substitution rules are insufficient — must match Vp and Idss tightly between both devices. Some manufacturers bin into tighter tolerance grades (A, B, C suffixes). Cannot auto-approve without engineering verification of pair matching.',
          attributeEffects: [
            { attributeId: 'matched_pair_review', effect: 'escalate_to_primary', note: 'Matched-pair required — single-device parametric matching is insufficient. Must verify Vp and Idss are tightly matched between the pair. Engineering review mandatory.' },
            { attributeId: 'vp', effect: 'add_review_flag', note: 'Matched-pair — Vp matching between devices must be tighter than the population range. Verify tolerance grade (A/B/C suffix) if original is binned.' },
            { attributeId: 'idss', effect: 'add_review_flag', note: 'Matched-pair — Idss matching between devices is critical for balanced operation. Idss mismatch causes DC offset and gain imbalance.' },
          ],
        },
        {
          value: 'no',
          label: 'No — single device',
          description: 'Standard single-device matching rules apply. Range overlap for Vp and Idss is sufficient.',
          attributeEffects: [],
        },
      ],
    },

    // Q3: Automotive
    {
      questionId: 'automotive',
      questionText: 'Is this an automotive application?',
      priority: 3,
      options: [
        {
          value: 'yes',
          label: 'Yes — automotive (AEC-Q101 required)',
          description: 'AEC-Q101 becomes mandatory. Automotive JFET applications include wheel speed sensor interfaces, pressure sensor front ends, and precision instrumentation. Temperature range: -40C to +125C. Must verify Igss at 125C (doubles every 10C from 25C spec), Vp temperature stability (~+2mV/C), and Idss temperature behavior for bias circuit robustness.',
          attributeEffects: [
            { attributeId: 'aec_q101', effect: 'escalate_to_mandatory', note: 'Automotive — AEC-Q101 discrete semiconductor qualification required.' },
            { attributeId: 'igss', effect: 'escalate_to_primary', note: 'Automotive — Igss temperature characterization critical. Gate leakage doubles every 10C; must verify at 125C operating temperature, not just 25C datasheet spec.' },
            { attributeId: 'tj_max', effect: 'escalate_to_primary', note: 'Automotive — 150C Tj(max) minimum typically required. Must support -40C to +125C ambient with thermal margin.' },
          ],
        },
        {
          value: 'no',
          label: 'No',
          description: 'Standard environmental matching.',
          attributeEffects: [],
        },
      ],
    },
  ],
};
