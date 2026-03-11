import { FamilyContextConfig } from '../types';

/**
 * Fuses — Traditional Overcurrent Protection (Family D2)
 * Block D: Frequency & Protection Components
 *
 * 3 context questions:
 * 1. Supply type and voltage level — AC mains / low-voltage DC / high-voltage DC
 *    AC mains escalates safety_certification + breaking_capacity to mandatory.
 *    High-voltage DC escalates body_material to mandatory (ceramic sand-fill,
 *    glass BLOCKED) and voltage_type to mandatory.
 * 2. What is the fuse protecting — semiconductor / motor-inductive / general wiring
 *    Semiconductor escalates speed_class to mandatory Fast-blow, i2t to mandatory
 *    + blockOnMissing, melting_i2t to primary. Motor escalates speed_class to
 *    mandatory Slow-blow (fast-blow BLOCKED).
 * 3. Automotive application — aec_q200 to mandatory + blockOnMissing,
 *    operating_temp_range to mandatory
 *
 * Context sensitivity: moderate
 * current_rating_a is ALWAYS identity w10 blockOnMissing regardless of context.
 * voltage_rating_v and breaking_capacity_a are ALWAYS threshold GTE w10 blockOnMissing.
 *
 * Note: Fuses use AEC-Q200 (passive component qualification), NOT AEC-Q100.
 */
export const d2FusesContext: FamilyContextConfig = {
  familyIds: ['D2'],
  contextSensitivity: 'moderate',
  questions: [
    // Q1: Supply type and voltage level
    {
      questionId: 'supply_type_voltage',
      questionText: 'What is the supply type and voltage level for this fuse application?',
      priority: 1,
      options: [
        {
          value: 'ac_mains',
          label: 'AC mains-connected (120VAC, 240VAC, 277VAC supply circuit)',
          description: 'Mains-connected application where the fuse protects a branch circuit or equipment input. Requires safety certification (UL248 for North America, IEC 60127 for international), high breaking capacity (minimum 1500A IEC, 10,000A UL for branch circuits), and ceramic/sand-fill body material is preferred for reliable arc interruption at high available fault current.',
          attributeEffects: [
            { attributeId: 'voltage_rating_v', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: AC mains — voltage rating must be ≥ circuit voltage. 120VAC circuits require minimum 125V rating, 240VAC require 250V. Never downgrade voltage rating on mains-connected fuses.' },
            { attributeId: 'breaking_capacity_a', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: AC mains — breaking capacity must be ≥ available fault current at point of installation. Minimum 1500A for IEC 60127 compliance, 10,000A for UL 248 North American branch circuit requirements.' },
            { attributeId: 'safety_certification', effect: 'escalate_to_mandatory', note: 'AC mains — safety certification is mandatory. UL248 for North American products, IEC 60127 for international. A fuse certified only to IEC may not meet UL requirements. BLOCKING when the application specifies a required standard.' },
            { attributeId: 'body_material', effect: 'escalate_to_primary', note: 'AC mains — ceramic/sand-fill body preferred for high breaking capacity. Sand quenches the arc more effectively than glass, which may shatter at high fault current. Glass bodies acceptable only if breaking capacity is independently verified adequate.' },
            { attributeId: 'voltage_type', effect: 'add_review_flag', note: 'AC mains — confirm fuse is rated AC or AC+DC. This is typically not an issue for mains fuses but verify for any fuse that will see both AC and DC.' },
          ],
        },
        {
          value: 'low_voltage_dc',
          label: 'Low-voltage DC board-level (≤60VDC — PCB supply, battery, automotive 12V/24V/48V)',
          description: 'Low-voltage DC applications including PCB power supplies, automotive 12V/24V/48V systems, and battery-powered equipment. DC voltage rating must be verified — AC fuses are not automatically suitable for DC. Breaking capacity should be verified against available fault current from the power supply.',
          attributeEffects: [
            { attributeId: 'voltage_type', effect: 'escalate_to_mandatory', note: 'Low-voltage DC — confirm fuse carries a DC voltage rating ≥ circuit voltage. A fuse rated 250VAC may be rated only 32VDC or 125VDC. DC arcs have no natural zero crossing and are harder to extinguish.' },
            { attributeId: 'breaking_capacity_a', effect: 'escalate_to_primary', note: 'Low-voltage DC — verify breaking capacity ≥ available fault current from the board power supply. Low-voltage DC boards typically 35–200A available fault current.' },
          ],
        },
        {
          value: 'high_voltage_dc',
          label: 'High-voltage DC (>60VDC — solar PV, EV battery, industrial DC bus)',
          description: 'High-voltage DC applications including solar PV strings (600–1500VDC), EV battery packs (400–800VDC), and industrial DC bus systems. Glass body fuses are NOT suitable — ceramic sand-fill is mandatory because DC arcs are significantly harder to extinguish. Always verify the DC voltage rating explicitly, not just the AC rating.',
          attributeEffects: [
            { attributeId: 'voltage_type', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: High-voltage DC — explicit DC voltage rating required ≥ system voltage. A fuse rated 250VAC may be rated only 32VDC. DC arcs sustain indefinitely without zero-crossing assistance — the DC rating, not the AC rating, is the binding constraint.' },
            { attributeId: 'body_material', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: High-voltage DC — ceramic sand-fill body is mandatory. Glass bodies cannot reliably contain and extinguish high-voltage DC arcs. A glass 250VAC fuse in a 600VDC solar string may arc indefinitely, shatter, and cause fire. Non-ceramic and glass-body fuses are BLOCKED.' },
            { attributeId: 'breaking_capacity_a', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: High-voltage DC — breaking capacity must be verified at the DC system voltage. Solar PV and EV battery systems can deliver thousands of amps of fault current. Breaking capacity at DC is typically lower than the AC rating for the same fuse.' },
          ],
        },
      ],
    },

    // Q2: What is the fuse protecting?
    {
      questionId: 'fuse_protecting',
      questionText: 'What is the fuse protecting?',
      priority: 2,
      options: [
        {
          value: 'semiconductor',
          label: 'Semiconductor protection (MOSFET, IGBT, diode, IC — component cannot survive sustained overcurrent)',
          description: 'The fuse protects a semiconductor device that will be destroyed if overcurrent persists for more than a few milliseconds. Fast-blow (F) or Very Fast (FF) speed class is mandatory — slow-blow fuses clear too slowly and the semiconductor is destroyed before the fuse opens. I²t let-through energy is the critical specification: fuse I²t must be ≤ the protected semiconductor\'s I²t rating.',
          attributeEffects: [
            { attributeId: 'speed_class', effect: 'escalate_to_mandatory', note: 'BLOCKING: Semiconductor protection — Fast-blow (F) or Very Fast (FF) mandatory. Slow-blow (T/TT) fuses are BLOCKED — they take seconds to clear at moderate overcurrent, destroying semiconductors that fail in milliseconds. Even within the same speed class, verify I²t is adequate.' },
            { attributeId: 'i2t_rating_a2s', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: Semiconductor protection — I²t let-through energy must be ≤ the protected component\'s I²t rating. If fuse I²t > semiconductor I²t, the semiconductor is destroyed even though the fuse eventually clears. Missing I²t data is unacceptable for semiconductor protection applications.' },
            { attributeId: 'melting_i2t_a2s', effect: 'escalate_to_primary', note: 'Semiconductor protection — melting I²t (pre-arcing) is the relevant limit for the semiconductor, which sees this energy during the fault before the fuse begins interrupting. Escalated to primary for explicit specification.' },
          ],
        },
        {
          value: 'motor_inductive',
          label: 'Motor / transformer / inductive load (legitimate inrush current during normal operation)',
          description: 'The fuse protects a motor, transformer, or other inductive load that draws high inrush current during startup (5–10× rated for 0.5–2 seconds). Slow-blow (T) or Very Slow (TT) speed class is mandatory — fast-blow fuses trip on every normal startup. The fuse must ride through inrush but clear quickly at genuine fault levels (10× or more).',
          attributeEffects: [
            { attributeId: 'speed_class', effect: 'escalate_to_mandatory', note: 'BLOCKING: Motor/inductive load — Slow-blow (T) or Very Slow (TT) mandatory. Fast-blow (F/FF) fuses are BLOCKED — they will trip every time the motor starts due to normal inrush current (5–10× rated for 0.5–2 seconds). The fuse must tolerate inrush but clear at sustained overcurrent.' },
          ],
        },
        {
          value: 'general_wiring',
          label: 'General wiring / overcurrent protection (cable and wiring protection)',
          description: 'General-purpose overcurrent protection for cables, wiring, and equipment. Speed class should match the original. I²t is informational (Application Review). Safety certification and breaking capacity are important for compliance.',
          attributeEffects: [
            { attributeId: 'i2t_rating_a2s', effect: 'add_review_flag', note: 'General wiring protection — I²t is informational. Verify it is adequate for downstream component protection but not semiconductor-critical.' },
            { attributeId: 'breaking_capacity_a', effect: 'escalate_to_primary', note: 'General wiring — breaking capacity is important for safety compliance. Verify ≥ available fault current at the point of installation.' },
          ],
        },
      ],
    },

    // Q3: Automotive application
    {
      questionId: 'automotive_aec_q200',
      questionText: 'Is this an automotive application (AEC-Q200 required)?',
      priority: 3,
      options: [
        {
          value: 'yes',
          label: 'Yes — automotive application (AEC-Q200 required)',
          description: 'Automotive applications require AEC-Q200 passive component qualification. Non-AEC parts are blocked from automotive designs. Operating temperature range must cover −40°C to +125°C for engine-bay applications. For automotive blade fuses (Mini/Regular/Maxi): verify blade type matches the fuse holder exactly. For 48V mild-hybrid systems: verify DC voltage rating.',
          attributeEffects: [
            { attributeId: 'aec_q200', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: Automotive — AEC-Q200 passive component qualification required. Non-AEC parts are blocked from automotive designs. Note: fuses use AEC-Q200 (passive standard), NOT AEC-Q100 (active IC standard).' },
            { attributeId: 'operating_temp_range', effect: 'escalate_to_mandatory', note: 'Automotive — operating temperature range must cover −40°C to +125°C for engine-bay applications. Fuse thermal derating at +125°C can reduce effective current rating to 60–70% of the +25°C specification.' },
          ],
        },
        {
          value: 'no',
          label: 'No — commercial / industrial',
          description: 'Standard commercial or industrial application. AEC-Q200 is informational only. Standard environmental matching applies.',
          attributeEffects: [],
        },
      ],
    },
  ],
};
