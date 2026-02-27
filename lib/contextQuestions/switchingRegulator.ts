import { FamilyContextConfig } from '../types';

/**
 * Switching Regulators (DC-DC Converters & Controllers) — Family C2
 * Block C: Power Management ICs
 *
 * 5 context questions:
 * 1. Architecture type (always ask — determines gate drive rule applicability)
 * 2. Compensation redesign feasibility (always ask — determines control mode strictness)
 * 3. Automotive application (always ask — AEC-Q100 + thermal + Vin escalation)
 * 4. Passive component flexibility (always ask — determines fsw strictness)
 * 5. High conversion ratio (conditional on Q1 ≠ unknown — ton_min criticality)
 *
 * Context sensitivity: critical
 * Switching regulators span 1W USB chargers (integrated, hysteretic, relaxed specs)
 * to 1kW server PSUs (controller-only, synchronous, tight regulation). The same
 * C2 family covers everything from a TPS62740 (3.3V/300mA coin-cell buck) to an
 * LT3845 (60V/20A industrial controller). Context determines whether gate drive,
 * compensation, and timing specs are relevant or irrelevant — and whether a
 * control mode mismatch is a hard rejection or an engineering review item.
 */
export const switchingRegulatorContext: FamilyContextConfig = {
  familyIds: ['C2'],
  contextSensitivity: 'critical',
  questions: [
    // Q1: Architecture type — suppresses gate drive for integrated-switch designs
    {
      questionId: 'architecture_type',
      questionText: 'Is this an integrated-switch converter or a controller-only design?',
      priority: 1,
      options: [
        {
          value: 'integrated_switch',
          label: 'Integrated switch (converter)',
          description: 'The IC includes the power MOSFET(s) on-chip. No external FETs on the PCB. Gate drive specifications are not applicable — the IC manages its own switch internally.',
          attributeEffects: [
            { attributeId: 'gate_drive_current', effect: 'not_applicable', note: 'Integrated-switch converter — gate drive current is internal to the IC and not a substitution parameter.' },
          ],
        },
        {
          value: 'controller_only',
          label: 'Controller-only (external FETs)',
          description: 'The IC drives external MOSFETs via HG/LG gate driver outputs. Gate drive current and voltage become critical — they determine switching speed, efficiency, and EMI.',
          attributeEffects: [
            { attributeId: 'gate_drive_current', effect: 'escalate_to_primary', note: 'Controller-only design — gate drive current determines external MOSFET switching speed. Lower drive current = slower transitions = higher switching losses and EMI.' },
          ],
        },
        {
          value: 'unknown',
          label: 'Unknown / not specified',
          description: 'Architecture not known. Gate drive parameters will remain at default weight for conservative evaluation.',
          attributeEffects: [],
        },
      ],
    },

    // Q2: Compensation redesign feasibility — softens control mode from hard fail to review
    {
      questionId: 'comp_redesign',
      questionText: 'Can the compensation network be redesigned, or must external components stay unchanged?',
      priority: 2,
      options: [
        {
          value: 'can_redesign',
          label: 'Compensation can be redesigned',
          description: 'The COMP pin components (Type II/III network) can be changed. A control mode mismatch is still a significant concern (loop stability must be re-verified), but is not an automatic rejection — the compensation can be recalculated for the new IC\'s transconductance (gm).',
          attributeEffects: [
            { attributeId: 'control_mode', effect: 'add_review_flag', note: 'Engineering review required: Control mode mismatch with redesignable compensation. PCM needs Type-II, VM needs Type-III. Recalculate compensation for replacement IC\'s gm. Verify crossover frequency and phase margin with Bode plot if possible.' },
          ],
        },
        {
          value: 'cannot_change',
          label: 'Components must stay unchanged (drop-in only)',
          description: 'No BOM changes allowed beyond the IC itself. Control mode must match exactly — the existing compensation network is tuned for the original IC\'s gm and control architecture. Any mismatch results in wrong crossover frequency, inadequate phase margin, or outright oscillation.',
          attributeEffects: [],
        },
        {
          value: 'unknown',
          label: 'Unknown',
          description: 'Compensation flexibility not known. Conservative evaluation: control mode mismatch is a hard identity failure.',
          attributeEffects: [],
        },
      ],
    },

    // Q3: Automotive — AEC-Q100 + thermal + Vin escalation
    {
      questionId: 'automotive',
      questionText: 'Is this an automotive application requiring AEC-Q100?',
      priority: 3,
      options: [
        {
          value: 'yes',
          label: 'Yes — automotive (AEC-Q100 required)',
          description: 'AEC-Q100 becomes mandatory. Automotive switching regulators must handle load-dump transients (40V/400ms on 12V systems per ISO 7637) and be EMI characterized per CISPR 25. Tj(max) must support the qualification grade.',
          attributeEffects: [
            { attributeId: 'aec_q100', effect: 'escalate_to_mandatory', note: 'Automotive — AEC-Q100 required. Covers HTOL, TC, humidity, plus power management-specific stability tests for Vout, fsw, and UVLO drift over lifetime.' },
            { attributeId: 'tj_max', effect: 'escalate_to_primary', note: 'Automotive — underhood applications require Tj(max) ≥ 150°C. Commercial 125°C parts have insufficient margin.' },
            { attributeId: 'vin_max', effect: 'escalate_to_primary', note: 'Automotive — Vin(max) must survive load-dump transients. 12V systems need ≥42V tolerance per ISO 7637.' },
          ],
        },
        {
          value: 'no',
          label: 'No',
          description: 'Standard qualification matching.',
          attributeEffects: [],
        },
      ],
    },

    // Q4: Passive component flexibility — determines fsw strictness
    {
      questionId: 'passive_flexibility',
      questionText: 'Can the power inductor and output capacitors be changed, or must they stay as-is?',
      priority: 4,
      options: [
        {
          value: 'passives_can_change',
          label: 'Passives can be changed',
          description: 'Inductor and capacitor values can be adjusted for the replacement IC. Switching frequency deviation beyond ±10% is still flagged but not a hard rejection — passive values will be recalculated.',
          attributeEffects: [],
        },
        {
          value: 'passives_fixed',
          label: 'Passives must stay unchanged',
          description: 'BLOCKING: The existing inductor and output capacitors cannot be changed. Switching frequency must match precisely — any deviation changes inductor ripple current, output voltage ripple, and potentially causes inductor saturation or instability.',
          attributeEffects: [
            { attributeId: 'fsw', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: Passive components are fixed — switching frequency must match exactly. Any deviation changes ΔIL = (Vin-Vout)×D/(L×fsw) with the existing inductor, potentially saturating the inductor or causing excessive ripple.' },
          ],
        },
        {
          value: 'unknown',
          label: 'Unknown',
          description: 'Passive flexibility not known. Standard ±10% fsw tolerance applies.',
          attributeEffects: [],
        },
      ],
    },

    // Q5: High conversion ratio — makes ton_min critical
    // Conditional on Q1 being answered (not unknown) since ratio depends on topology
    {
      questionId: 'high_conversion_ratio',
      questionText: 'Does this design have a high voltage conversion ratio (e.g., 12V→1V buck or 3.3V→24V boost)?',
      priority: 5,
      condition: { questionId: 'architecture_type', values: ['integrated_switch', 'controller_only'] },
      options: [
        {
          value: 'yes',
          label: 'Yes — high step-down or step-up ratio',
          description: 'BLOCKING: High conversion ratios push duty cycle to extremes. In a 12V→1V buck at 1MHz: D = 8.3%, ton = 83ns. If the replacement\'s ton_min > 83ns, the converter cannot regulate — output collapses. Minimum on-time/off-time becomes the binding specification.',
          attributeEffects: [
            { attributeId: 'ton_min', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: High voltage conversion ratio — ton_min is critical. Required ton = D/fsw must be greater than the IC\'s minimum on-time. Missing ton_min data cannot be accepted for high-ratio designs.' },
          ],
        },
        {
          value: 'no',
          label: 'No — moderate ratio (e.g., 5V→3.3V)',
          description: 'Moderate duty cycles leave adequate margin for ton_min/toff_min. Standard matching weight applies.',
          attributeEffects: [],
        },
        {
          value: 'unknown',
          label: 'Unknown',
          description: 'Conversion ratio not known. Ton_min remains at standard weight — review-on-missing behavior.',
          attributeEffects: [],
        },
      ],
    },
  ],
};
