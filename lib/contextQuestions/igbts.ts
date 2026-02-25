import { FamilyContextConfig } from '../types';

/**
 * IGBTs — Insulated Gate Bipolar Transistors (Family B7)
 * Block B: Discrete Semiconductors
 *
 * 5 context questions:
 * 1. Switching frequency (always ask — determines conduction vs switching loss dominance)
 *    THIS IS THE CRITICAL QUESTION — IGBTs span 1kHz motor drives to 100kHz resonant converters
 * 2. Switching topology (always ask — hard vs soft switching changes Eon significance)
 * 3. Parallel operation (always ask — technology mixing causes thermal runaway)
 * 4. Short-circuit protection (always ask — tsc is BLOCKING for motor drive/traction)
 * 5. Automotive (always ask — AEC-Q101 gate + tsc mandatory)
 *
 * Context sensitivity: high
 * IGBTs operate across an enormous range of power levels (100W to MW) and
 * switching frequencies (1kHz to 100kHz). The same IGBT family serves motor
 * drives (low frequency, tsc critical), UPS inverters (medium frequency,
 * efficiency critical), induction heaters (high frequency, Eoff critical),
 * and welders (irregular duty, SOA critical).
 */
export const igbtsContext: FamilyContextConfig = {
  familyIds: ['B7'],
  contextSensitivity: 'high',
  questions: [
    // Q1: Switching frequency — THE critical question for IGBTs
    {
      questionId: 'switching_frequency',
      questionText: 'What is the IGBT switching frequency?',
      priority: 1,
      options: [
        {
          value: 'low_lt_20khz',
          label: 'Low (≤20kHz) — motor drives, UPS, welders',
          description: 'Conduction losses dominate at low switching frequencies. Vce(sat) is the binding specification — every 0.1V reduction at rated current saves watts directly. Switching losses (Eon + Eoff) are secondary. Most industrial IGBT applications fall here.',
          attributeEffects: [
            { attributeId: 'vce_sat', effect: 'escalate_to_mandatory', note: 'Low-frequency operation — conduction loss Pcond = Ic × Vce(sat) dominates total losses. Vce(sat) is THE binding specification.' },
          ],
        },
        {
          value: 'medium_20k_50k',
          label: 'Medium (20kHz–50kHz) — high-performance servo, solar inverters',
          description: 'Conduction and switching losses are comparable. Both Vce(sat) and Eoff matter. Field-Stop technology provides the best trade-off in this range.',
          attributeEffects: [
            { attributeId: 'igbt_technology', effect: 'escalate_to_primary', note: 'Medium frequency — Field-Stop technology provides optimal Vce(sat) vs Eoff trade-off. NPT is acceptable; PT may overheat from switching losses.' },
            { attributeId: 'eoff', effect: 'escalate_to_mandatory', note: 'Medium frequency — switching losses become significant. Eoff × fsw must fit within thermal budget.' },
          ],
        },
        {
          value: 'high_50k_100k',
          label: 'High (50kHz–100kHz) — high-density PSU, induction heating',
          description: 'Switching losses dominate. Eoff is THE critical parameter. Only Field-Stop IGBTs are viable — PT and NPT cannot switch fast enough. Consider whether SiC MOSFET is a better technology choice at these frequencies.',
          attributeEffects: [
            { attributeId: 'eoff', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: High-frequency operation — Eoff × fsw dominates total losses. Missing Eoff data in replacement datasheet is unacceptable at these frequencies.' },
            { attributeId: 'eon', effect: 'escalate_to_mandatory', note: 'High frequency — Eon contributes significantly to total switching loss at ≥50kHz.' },
            { attributeId: 'qg', effect: 'escalate_to_primary', note: 'High frequency — gate driver power Pg = Qg × Vge × fsw becomes a meaningful fraction of total system losses.' },
            { attributeId: 'igbt_technology', effect: 'escalate_to_mandatory', note: 'High frequency — only Field-Stop technology is viable. PT/NPT tail current is too long for ≥50kHz operation.' },
          ],
        },
        {
          value: 'above_100khz',
          label: 'Above 100kHz — review recommended',
          description: 'IGBTs are rarely used above 100kHz. SiC MOSFETs are almost certainly the correct technology choice at these frequencies due to zero tail current and dramatically lower switching losses. If an IGBT must be used, only the fastest Field-Stop types are viable.',
          attributeEffects: [
            { attributeId: 'eoff', effect: 'add_review_flag', note: 'Above 100kHz — SiC MOSFET is almost certainly the correct technology. If IGBT must be used, verify thermal budget can absorb Eoff × fsw.' },
            { attributeId: 'eon', effect: 'add_review_flag', note: 'Above 100kHz — review total switching loss budget. SiC MOSFET likely preferred.' },
          ],
        },
      ],
    },

    // Q2: Hard vs soft switching — changes Eon significance
    {
      questionId: 'switching_topology',
      questionText: 'Is this a hard-switching or soft-switching (resonant) application?',
      priority: 2,
      options: [
        {
          value: 'hard_switching',
          label: 'Hard switching (PWM inverter, motor drive, buck/boost)',
          description: 'Both turn-on and turn-off occur with full bus voltage across the IGBT. Eon includes the opposing diode reverse recovery energy. Eoff includes tail current energy. Both contribute to total switching loss.',
          attributeEffects: [
            { attributeId: 'eon', effect: 'escalate_to_primary', note: 'Hard-switching — Eon is significant and includes diode reverse recovery contribution. Faster diode recovery in the bridge partner reduces effective Eon.' },
            { attributeId: 'eoff', effect: 'escalate_to_primary', note: 'Hard-switching — Eoff (including tail current energy) is the dominant switching loss component.' },
          ],
        },
        {
          value: 'soft_switching',
          label: 'Soft switching / resonant (series-resonant, LLC, ZVS)',
          description: 'Voltage swings to zero before the IGBT turns on (ZVS), eliminating turn-on loss. Turn-off still dissipates Eoff because collector current is non-zero at turn-off in most resonant topologies.',
          attributeEffects: [
            { attributeId: 'eon', effect: 'not_applicable', note: 'Soft-switching (ZVS) — drain voltage swings to zero before turn-on, eliminating Eon entirely.' },
            { attributeId: 'eoff', effect: 'escalate_to_primary', note: 'Soft-switching — turn-off still occurs with current flowing. Eoff remains the primary switching loss.' },
          ],
        },
      ],
    },

    // Q3: Parallel operation — technology mixing is dangerous
    {
      questionId: 'parallel_operation',
      questionText: 'Are multiple IGBTs operated in parallel for current sharing?',
      priority: 3,
      options: [
        {
          value: 'yes',
          label: 'Yes — parallel IGBTs',
          description: 'CRITICAL: Do NOT mix IGBT technologies in parallel. PT IGBTs have negative Vce(sat) temperature coefficient — the hotter device drops more current, heats further, and thermally runs away. FS/NPT have positive tempco (self-balancing). Mixing PT with FS/NPT causes the PT device to hog current. Vge(th) must be matched between parallel devices for equal dynamic current sharing.',
          attributeEffects: [
            { attributeId: 'igbt_technology', effect: 'escalate_to_mandatory', note: 'CRITICAL: Parallel operation — technology must match exactly. Mixing PT (negative Vce(sat) tempco) with FS/NPT (positive tempco) causes thermal runaway in the PT device.' },
            { attributeId: 'vge_th', effect: 'escalate_to_primary', note: 'Parallel operation — Vge(th) mismatch causes unequal dynamic current sharing during switching transitions. Use matched devices or individual gate resistors.' },
            { attributeId: 'vce_sat', effect: 'add_review_flag', note: 'Parallel operation — Vce(sat) device-to-device spread determines static current sharing. Verify spread is within acceptable limits at operating temperature.' },
          ],
        },
        {
          value: 'no',
          label: 'No — single device',
          description: 'Standard matching rules apply. Technology upgrade hierarchy (FS > NPT > PT) is valid.',
          attributeEffects: [],
        },
      ],
    },

    // Q4: Short-circuit protection — tsc is BLOCKING for motor drive/traction
    {
      questionId: 'short_circuit_protection',
      questionText: 'Does the application require short-circuit withstand capability?',
      priority: 4,
      options: [
        {
          value: 'yes_desat',
          label: 'Yes — desaturation detection (motor drive, traction, servo)',
          description: 'BLOCKING: The gate driver uses desaturation detection to sense short-circuit events (Vce rises above threshold while gate is on). The IGBT must survive for tsc microseconds while the driver detects the fault and initiates controlled turn-off. If tsc of the replacement is shorter than driver response time (typically 5-10µs), the IGBT fails before protection acts.',
          attributeEffects: [
            { attributeId: 'tsc', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: Short-circuit withstand time must ≥ gate driver response time. Missing tsc in replacement datasheet is unacceptable — cannot verify fault survival.' },
          ],
        },
        {
          value: 'no',
          label: 'No — no SC survivability required',
          description: 'Application does not require short-circuit withstand (e.g., resonant converter with inherent current limiting, or external fast-acting fuse protection). Standard matching rules apply.',
          attributeEffects: [],
        },
      ],
    },

    // Q5: Automotive / traction
    {
      questionId: 'automotive',
      questionText: 'Is this an automotive or traction application?',
      priority: 5,
      options: [
        {
          value: 'yes',
          label: 'Yes — automotive / traction',
          description: 'AEC-Q101 becomes mandatory. Short-circuit withstand time is critical for traction inverter fault protection. Tj(max) of 175°C is typically required for traction applications in sealed enclosures with high ambient temperatures.',
          attributeEffects: [
            { attributeId: 'aec_q101', effect: 'escalate_to_mandatory', note: 'Automotive/traction — AEC-Q101 discrete semiconductor qualification is required. Includes IGBT-specific short-circuit withstand and thermal cycling tests.' },
            { attributeId: 'tsc', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'Automotive/traction — short-circuit withstand is mandatory for inverter fault protection. IGBT must survive until gate driver or system protection responds.' },
            { attributeId: 'tj_max', effect: 'escalate_to_primary', note: 'Automotive/traction — 175°C Tj(max) typically required for sealed enclosures with high ambient. 150°C-rated parts may have insufficient thermal headroom.' },
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
