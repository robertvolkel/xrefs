import { FamilyContextConfig } from '../types';

/**
 * Thyristors / TRIACs / SCRs (Family B8)
 * Block B: Discrete Semiconductors
 *
 * 4 context questions:
 * 1. Device sub-type (always ask — drives conditional rule suppression)
 *    THIS IS THE CRITICAL QUESTION — determines which rules are evaluated
 * 2. Application type (always ask — determines tq relevance for SCRs)
 * 3. Snubber circuit (always ask — BLOCKING for snubberless designs)
 * 4. Automotive (always ask — AEC-Q101 gate)
 *
 * Context sensitivity: high
 * Thyristors span three fundamentally different device types (SCR, TRIAC,
 * DIAC) with sub-type-specific parameters. Quadrant operation is TRIAC-only,
 * tq is SCR-only and application-dependent, and DIACs lack all gate-related
 * attributes. The context questions suppress irrelevant rules via
 * `not_applicable` effects, ensuring the match score reflects only the
 * attributes that matter for the detected sub-type and application.
 */
export const thyristorsContext: FamilyContextConfig = {
  familyIds: ['B8'],
  contextSensitivity: 'high',
  questions: [
    // Q1: Device sub-type — THE critical question for thyristors
    // Drives conditional rule suppression for sub-type-specific parameters
    {
      questionId: 'device_subtype',
      questionText: 'What type of thyristor device is this?',
      priority: 1,
      options: [
        {
          value: 'scr',
          label: 'SCR (Silicon Controlled Rectifier)',
          description: 'Unidirectional device — conducts anode-to-cathode only, triggered by positive gate pulse. Used in DC motor drives, crowbar protection, AC half-wave and full-wave phase control. Quadrant operation and snubberless rating do not apply.',
          attributeEffects: [
            { attributeId: 'quadrant_operation', effect: 'not_applicable', note: 'SCR — quadrant operation is a TRIAC-only parameter. SCRs conduct in one direction only.' },
            { attributeId: 'snubberless', effect: 'not_applicable', note: 'SCR — snubberless rating is a TRIAC-only parameter. SCR dV/dt is managed by the separate dV/dt threshold rule.' },
          ],
        },
        {
          value: 'triac',
          label: 'TRIAC (Triode AC Switch)',
          description: 'Bidirectional device — conducts in both directions, handles full AC cycle without bridge rectifier. Dominant in AC light dimmers, heating controllers, AC motor soft starters. tq (turn-off time) does not apply — TRIACs use natural AC commutation.',
          attributeEffects: [
            { attributeId: 'tq', effect: 'not_applicable', note: 'TRIAC — tq (circuit-commutated turn-off time) is SCR-only. TRIACs use natural AC commutation at the zero crossing.' },
          ],
        },
        {
          value: 'diac',
          label: 'DIAC (Diode AC Switch)',
          description: 'Two-terminal, no gate — triggers symmetrically when breakover voltage is reached. Almost exclusively used as a trigger device for TRIACs. No gate parameters, no quadrant operation, no tq, no snubberless rating.',
          attributeEffects: [
            { attributeId: 'gate_sensitivity', effect: 'not_applicable', note: 'DIAC — two-terminal device with no gate. Gate sensitivity class does not apply.' },
            { attributeId: 'igt', effect: 'not_applicable', note: 'DIAC — no gate terminal. Gate trigger current does not apply.' },
            { attributeId: 'vgt', effect: 'not_applicable', note: 'DIAC — no gate terminal. Gate trigger voltage does not apply.' },
            { attributeId: 'ih', effect: 'not_applicable', note: 'DIAC — holding current is defined by breakover characteristics, not a gate-controlled parameter. Evaluated differently for DIACs.' },
            { attributeId: 'il', effect: 'not_applicable', note: 'DIAC — no gate means no latching current specification. Device conducts when breakover voltage is exceeded.' },
            { attributeId: 'tgt', effect: 'not_applicable', note: 'DIAC — no gate-triggered turn-on time. Triggering is by voltage breakover, not gate pulse.' },
            { attributeId: 'quadrant_operation', effect: 'not_applicable', note: 'DIAC — no gate, no quadrant operation. Symmetric bidirectional breakover.' },
            { attributeId: 'tq', effect: 'not_applicable', note: 'DIAC — no circuit-commutated turn-off time. Not applicable to gateless devices.' },
            { attributeId: 'snubberless', effect: 'not_applicable', note: 'DIAC — snubberless rating is a TRIAC-only parameter.' },
          ],
        },
      ],
    },

    // Q2: Application type — determines tq relevance and surge priorities
    {
      questionId: 'application_type',
      questionText: 'What is the primary application for this thyristor?',
      priority: 2,
      options: [
        {
          value: 'ac_phase_control',
          label: 'AC phase control (dimmer, heater, fan speed)',
          description: 'Standard AC phase-control application. Natural commutation at AC zero crossing provides ample reverse-bias time. Default matching rules apply — dV/dt and snubberless rating are the primary concerns.',
          attributeEffects: [],
        },
        {
          value: 'crowbar_dc',
          label: 'Crowbar protection / DC chopper (forced commutation)',
          description: 'CRITICAL: SCR forced-commutation application. The commutation circuit (capacitor + auxiliary SCR) is sized specifically around the main SCR tq. A longer tq replacement causes commutation failure (re-triggering, shoot-through, loss of control).',
          attributeEffects: [
            { attributeId: 'tq', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: Forced-commutation DC application — tq limits switching frequency (f_max = 1/(2*tq)). Commutation capacitors and auxiliary circuits are sized to the original tq. Missing tq data is unacceptable.' },
          ],
        },
        {
          value: 'ac_zero_cross',
          label: 'AC zero-cross switching (solid-state relay)',
          description: 'Optocoupler-TRIAC combination for isolated AC switching at the zero crossing. Holding current matters because the device must sustain conduction through the full AC half-cycle, including the low-current region near the zero crossing.',
          attributeEffects: [
            { attributeId: 'ih', effect: 'escalate_to_primary', note: 'Zero-cross switching — holding current determines whether the device sustains conduction through the full half-cycle. Higher IH causes dropout near the zero crossing under light loads.' },
          ],
        },
        {
          value: 'motor_soft_start',
          label: 'AC motor soft-start / inrush limiting',
          description: 'Motor startup currents are 6-10x rated for several seconds. Both surge current (ITSM) and I²t for fuse coordination become primary concerns.',
          attributeEffects: [
            { attributeId: 'itsm', effect: 'escalate_to_primary', note: 'Motor soft-start — locked-rotor current is 6-10x rated motor current for several seconds. ITSM must exceed worst-case startup surge.' },
            { attributeId: 'i2t', effect: 'escalate_to_primary', note: 'Motor soft-start — fuse coordination is critical during startup surge. Fuse I²t must be lower than thyristor I²t to protect the device.' },
          ],
        },
      ],
    },

    // Q3: Snubber circuit — BLOCKING for snubberless designs
    {
      questionId: 'snubber_circuit',
      questionText: 'Does the PCB design include an RC snubber circuit across the thyristor?',
      priority: 3,
      options: [
        {
          value: 'no_snubber',
          label: 'No snubber — snubberless device required',
          description: 'BLOCKING: PCB has no snubber footprint. Only snubberless-rated TRIACs (high dV/dt immunity, 500-1000V/us) can be used. A standard TRIAC without a snubber will false-trigger from line transients — the circuit has no means to prevent it.',
          attributeEffects: [
            { attributeId: 'snubberless', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: No snubber on PCB — replacement must be snubberless-rated. A standard TRIAC will false-trigger from dV/dt transients with no snubber to limit them.' },
            { attributeId: 'dv_dt', effect: 'escalate_to_mandatory', note: 'No snubber — dV/dt immunity is the device\'s only protection against false triggering from line transients. Must be at least as high as the original.' },
          ],
        },
        {
          value: 'snubber_present',
          label: 'Yes — RC snubber present on PCB',
          description: 'Snubber network limits dV/dt to the device rating. Standard or snubberless TRIACs can be used. Default matching rules apply.',
          attributeEffects: [],
        },
      ],
    },

    // Q4: Automotive qualification
    {
      questionId: 'automotive',
      questionText: 'Is this an automotive application?',
      priority: 4,
      options: [
        {
          value: 'yes',
          label: 'Yes — automotive',
          description: 'AEC-Q101 becomes mandatory. Automotive thyristor applications include body electronics, HVAC control, battery management switching. Temperature range -40°C to +125°C minimum — cold-start IGT reliability is critical.',
          attributeEffects: [
            { attributeId: 'aec_q101', effect: 'escalate_to_mandatory', note: 'Automotive — AEC-Q101 discrete semiconductor qualification is required. Includes gate trigger stability and VDRM retention tests across temperature.' },
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
