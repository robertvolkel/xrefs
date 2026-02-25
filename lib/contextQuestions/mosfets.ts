import { FamilyContextConfig } from '../types';

/**
 * MOSFETs — N-Channel & P-Channel (Family B5)
 * Block B: Discrete Semiconductors
 *
 * 5 context questions:
 * 1. Switching topology (always ask — hard-switching vs soft-switching vs linear mode vs DC)
 *    THIS IS THE CRITICAL QUESTION — completely changes which parameters dominate
 * 2. Synchronous rectification (always ask — body diode trr is BLOCKING at ≥50kHz)
 * 3. Parallel operation (always ask — Vgs(th) tempco concern)
 * 4. Drive voltage (always ask — determines Rds(on) comparison validity)
 * 5. Automotive (always ask — AEC-Q101 gate)
 *
 * Context sensitivity: high
 * MOSFETs operate across an enormous range of topologies and conditions.
 * The same MOSFET family serves load switches (DC), PWM converters (hard-switching),
 * LLC converters (soft-switching), and hot-swap controllers (linear mode).
 * Each topology has fundamentally different critical parameters.
 */
export const mosfetsContext: FamilyContextConfig = {
  familyIds: ['B5'],
  contextSensitivity: 'high',
  questions: [
    // Q1: Switching topology — THE critical question
    {
      questionId: 'switching_topology',
      questionText: 'What switching topology does this MOSFET operate in?',
      priority: 1,
      options: [
        {
          value: 'hard_switching',
          label: 'Hard-switching PWM (buck, boost, half-bridge)',
          description: 'Gate charge and Miller charge (Qgd) dominate switching losses. Minimize Qgd × Rds(on) product. Crss determines dV/dt noise injection.',
          attributeEffects: [
            { attributeId: 'qgd', effect: 'escalate_to_primary', note: 'Hard-switching — Qgd (Miller charge) is THE dominant switching loss driver. Psw ∝ Qgd × Vds × fsw.' },
            { attributeId: 'crss', effect: 'escalate_to_primary', note: 'Hard-switching — Crss couples drain dV/dt to gate, causing noise injection and potential spurious turn-on in bridge topologies.' },
          ],
        },
        {
          value: 'soft_switching',
          label: 'Soft-switching / resonant (ZVS, LLC, CRM)',
          description: 'Coss is part of the resonant tank — different Coss shifts resonant frequency and ZVS window. Qgd is less critical since drain swings to zero before turn-on.',
          attributeEffects: [
            { attributeId: 'coss', effect: 'escalate_to_mandatory', note: 'Soft-switching/resonant — Coss is a deliberate resonant tank component. Different Coss shifts resonant frequency and may destroy ZVS window, dramatically increasing losses.' },
          ],
        },
        {
          value: 'linear_mode',
          label: 'Linear mode (hot-swap, eFuse, motor soft-start)',
          description: 'MOSFET operates between fully-on and fully-off for extended periods. SOA curves are THE critical spec — must compare graphically. Vgs(th) determines operating point control.',
          attributeEffects: [
            { attributeId: 'soa', effect: 'escalate_to_mandatory', note: 'Linear mode — SOA curves are THE critical specification. The MOSFET operates on the SOA boundary for tens of milliseconds. Graphical comparison mandatory.' },
            { attributeId: 'vgs_th', effect: 'escalate_to_primary', note: 'Linear mode — Vgs(th) determines the partial-conduction operating point. Must verify drive circuit can control the replacement accurately.' },
          ],
        },
        {
          value: 'dc_low_frequency',
          label: 'DC / low-frequency (load switch, ORing, battery protection)',
          description: 'Rds(on) dominates total losses — switching losses are negligible. Gate charge parameters are irrelevant.',
          attributeEffects: [
            { attributeId: 'rds_on', effect: 'escalate_to_mandatory', note: 'DC/low-frequency — Rds(on) dominates total device losses entirely. Gate charge and switching parameters are negligible.' },
            { attributeId: 'qg', effect: 'not_applicable', note: 'DC/low-frequency application — switching losses are negligible. Gate charge is irrelevant.' },
            { attributeId: 'qgd', effect: 'not_applicable', note: 'DC/low-frequency application — Miller charge switching losses are negligible.' },
            { attributeId: 'qgs', effect: 'not_applicable', note: 'DC/low-frequency application — Qgs switching losses are negligible.' },
          ],
        },
      ],
    },

    // Q2: Synchronous rectification — body diode trr is BLOCKING at ≥50kHz
    {
      questionId: 'synchronous_rectification',
      questionText: 'Is this MOSFET used in synchronous rectification?',
      priority: 2,
      options: [
        {
          value: 'yes_above_50khz',
          label: 'Yes — at ≥50kHz switching frequency',
          description: 'BLOCKING: Body diode trr is critical. During dead time, the body diode conducts. At ≥50kHz, high trr causes shoot-through — the complementary switch turns on before the body diode stops conducting, creating a momentary bus short circuit. Requires explicit engineering sign-off.',
          attributeEffects: [
            { attributeId: 'body_diode_trr', effect: 'escalate_to_mandatory', note: 'BLOCKING: Synchronous rectification at ≥50kHz — body diode trr must be verified. High trr causes shoot-through and catastrophic cross-conduction losses. Requires explicit engineering sign-off for any substitution.' },
            { attributeId: 'body_diode_vf', effect: 'escalate_to_primary', note: 'Synchronous rectification — body diode Vf determines dead-time conduction loss: Pdead = Id × Vf × tdead × fsw.' },
          ],
        },
        {
          value: 'yes_below_50khz',
          label: 'Yes — below 50kHz switching frequency',
          description: 'Body diode trr matters but is less critical at lower frequencies. Dead-time losses are proportional to frequency.',
          attributeEffects: [
            { attributeId: 'body_diode_trr', effect: 'escalate_to_primary', note: 'Synchronous rectification below 50kHz — body diode trr is important but not blocking. Lower frequency reduces per-cycle recovery loss.' },
            { attributeId: 'body_diode_vf', effect: 'escalate_to_primary', note: 'Synchronous rectification — body diode Vf determines dead-time conduction loss.' },
          ],
        },
        {
          value: 'no',
          label: 'No',
          description: 'Body diode performance is secondary. Default matching rules apply.',
          attributeEffects: [],
        },
      ],
    },

    // Q3: Parallel operation — Vgs(th) tempco concern
    {
      questionId: 'parallel_operation',
      questionText: 'Are MOSFETs operated in parallel for current sharing?',
      priority: 3,
      options: [
        {
          value: 'yes',
          label: 'Yes — parallel MOSFETs',
          description: 'Vgs(th) has a negative temperature coefficient — the hotter device turns on first, carries more current, and heats further. Rds(on) positive tempco provides self-balancing in fully-on state, but Vgs(th) effect dominates during transitions. Use matched devices with individual gate resistors.',
          attributeEffects: [
            { attributeId: 'vgs_th', effect: 'escalate_to_primary', note: 'Parallel operation — Vgs(th) negative tempco causes uneven current sharing during switching transitions. Verify matching between parallel devices. Use individual gate resistors and source resistors.' },
          ],
        },
        {
          value: 'no',
          label: 'No',
          description: 'Standard matching rules apply.',
          attributeEffects: [],
        },
      ],
    },

    // Q4: Drive voltage — determines Rds(on) comparison validity
    {
      questionId: 'drive_voltage',
      questionText: 'What gate drive voltage does the circuit provide?',
      priority: 4,
      options: [
        {
          value: 'logic_level',
          label: 'Logic-level (3.3V or 5V)',
          description: 'Rds(on) must be specified at 4.5V Vgs (logic-level spec). A MOSFET specified only at 10V Vgs may have dramatically higher Rds(on) at 4.5V. Vgs(th) max must be well below drive voltage for full saturation.',
          attributeEffects: [
            { attributeId: 'vgs_th', effect: 'escalate_to_primary', note: 'Logic-level drive — Vgs(th) max must be well below 3.3V or 5V drive voltage. Noise margin is critical at low drive voltages.' },
          ],
        },
        {
          value: 'standard',
          label: 'Standard (10V or 12V)',
          description: 'Default gate drive assumption. Most MOSFET datasheets specify Rds(on) at 10V Vgs.',
          attributeEffects: [],
        },
        {
          value: 'high_voltage_sic',
          label: 'High-voltage SiC/GaN (15V-18V, with negative turn-off)',
          description: 'SiC/GaN gate drive uses +18V/−5V or +15V/−4V. The negative turn-off voltage prevents spurious turn-on from Crss coupling. Verify Vgs(max) covers both positive and negative excursions.',
          attributeEffects: [
            { attributeId: 'vgs_max', effect: 'escalate_to_primary', note: 'SiC/GaN gate drive uses negative turn-off voltage (−4V to −5V). Verify Vgs(max) covers both positive and negative excursions. Gate oxide stress margin is tighter for SiC.' },
          ],
        },
      ],
    },

    // Q5: Automotive
    {
      questionId: 'automotive',
      questionText: 'Is this an automotive application?',
      priority: 5,
      options: [
        {
          value: 'yes',
          label: 'Yes — automotive',
          description: 'AEC-Q101 becomes mandatory. Avalanche energy is critical for UIS survival in automotive fault conditions. Operating temperature range must cover -40°C to +150°C.',
          attributeEffects: [
            { attributeId: 'aec_q101', effect: 'escalate_to_mandatory', note: 'Automotive application — AEC-Q101 (discrete semiconductor qualification) is required. Includes MOSFET-specific UIS, gate oxide, and body diode stress tests.' },
            { attributeId: 'avalanche_energy', effect: 'escalate_to_primary', note: 'Automotive — avalanche energy (UIS survival) is critical for automotive fault conditions: inductive load dump, snubber failure, parasitic inductance.' },
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
