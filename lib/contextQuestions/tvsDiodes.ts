import { FamilyContextConfig } from '../types';

/**
 * TVS Diodes — Transient Voltage Suppressors (Family B4)
 * Block B: Discrete Semiconductors
 *
 * 4 context questions:
 * 1. Application type (always ask — power rail vs signal line vs automotive bus)
 *    THIS IS THE CRITICAL QUESTION — flips Cj vs Ppk priority entirely
 * 2. Transient source / surge standard (always ask — determines waveform matching)
 * 3. Interface speed (conditional — if signal-line application)
 * 4. Automotive (always ask — AEC-Q101 gate)
 */
export const tvsDiodesContext: FamilyContextConfig = {
  familyIds: ['B4'],
  contextSensitivity: 'high',
  questions: [
    // Q1: Application type — THE critical question
    {
      questionId: 'tvs_application',
      questionText: 'What is this TVS diode protecting?',
      priority: 1,
      options: [
        {
          value: 'power_rail',
          label: 'Power rail protection',
          description: 'Ppk and Ipp are PRIMARY. Clamping voltage must be below protected circuit\'s absolute max. Junction capacitance is IRRELEVANT — power rails tolerate hundreds of pF. Package is typically discrete SMA/SMB/SMC or DO-201.',
          attributeEffects: [
            { attributeId: 'cj', effect: 'not_applicable', note: 'Power rail protection — junction capacitance is irrelevant. Power rails tolerate hundreds of pF.' },
            { attributeId: 'ppk', effect: 'escalate_to_mandatory', note: 'Power rail — peak pulse power is the primary protection metric.' },
            { attributeId: 'ipp', effect: 'escalate_to_mandatory', note: 'Power rail — peak pulse current determines surge handling capability.' },
            { attributeId: 'esd_rating', effect: 'not_applicable', note: 'Power rails see power surges, not ESD — ESD rating is secondary.' },
          ],
        },
        {
          value: 'signal_line',
          label: 'Signal-line protection (USB, HDMI, Ethernet, SPI, I2C)',
          description: 'Junction capacitance (Cj) becomes PRIMARY — the TVS loads the signal during normal operation. ESD rating becomes the primary power spec. Configuration/topology matters — steering diode arrays achieve lowest Cj.',
          attributeEffects: [
            { attributeId: 'cj', effect: 'escalate_to_mandatory', note: 'Signal-line TVS — Cj directly degrades signal integrity during normal operation. Even a few pF matters at high data rates.' },
            { attributeId: 'esd_rating', effect: 'escalate_to_mandatory', note: 'Signal lines see ESD events, not power surges — ESD rating is the primary power spec.' },
            { attributeId: 'configuration', effect: 'escalate_to_mandatory', note: 'Steering diode arrays achieve lowest Cj. Topology determines clamping behavior on signal lines.' },
            { attributeId: 'ppk', effect: 'not_applicable', note: 'Signal-line TVS sees ESD pulses (mJ), not power surges (J). Ppk is secondary.' },
          ],
        },
        {
          value: 'automotive_bus',
          label: 'Automotive bus protection (CAN, LIN, FlexRay)',
          description: 'Must handle automotive transients (ISO 7637 load dump) while maintaining acceptable capacitance for bus speed. AEC-Q101 mandatory. Clamping voltage must meet bus transceiver maximum.',
          attributeEffects: [
            { attributeId: 'aec_q101', effect: 'escalate_to_mandatory', note: 'Automotive bus protection — AEC-Q101 is mandatory.' },
            { attributeId: 'surge_standard', effect: 'escalate_to_mandatory', note: 'Automotive transients — must meet ISO 7637 load dump profile.' },
            { attributeId: 'cj', effect: 'escalate_to_primary', note: 'Automotive buses (CAN, LIN) need acceptable capacitance for bus speed, but not ultra-low-cap like USB 3.x.' },
            { attributeId: 'operating_temp', effect: 'escalate_to_mandatory', note: 'Automotive requires -40°C to +125°C (or +150°C under-hood).' },
          ],
        },
      ],
    },

    // Q2: Transient source / surge standard
    {
      questionId: 'transient_source',
      questionText: 'What type of transient is this TVS protecting against?',
      priority: 2,
      options: [
        {
          value: 'esd',
          label: 'ESD (IEC 61000-4-2)',
          description: 'ESD rating is the primary power spec. Very short pulses (ns-scale), low energy (µJ–mJ). Response time must be <1ns.',
          attributeEffects: [
            { attributeId: 'esd_rating', effect: 'escalate_to_mandatory', note: 'ESD application — IEC 61000-4-2 rating is the primary power spec.' },
            { attributeId: 'response_time', effect: 'escalate_to_primary', note: 'ESD has ~0.7–1ns rise time — package parasitics matter for response time.' },
          ],
        },
        {
          value: 'power_surge',
          label: 'Lightning / power surge (IEC 61000-4-5, 8/20µs)',
          description: 'Ppk at 8/20µs waveform is the primary spec. Much higher energy than ESD. Cj is irrelevant.',
          attributeEffects: [
            { attributeId: 'ppk', effect: 'escalate_to_mandatory', note: 'Power surge — Ppk at correct waveform (8/20µs) is the primary spec.' },
            { attributeId: 'surge_standard', effect: 'escalate_to_primary', note: 'IEC 61000-4-5 compliance should be verified.' },
            { attributeId: 'cj', effect: 'not_applicable', note: 'Power surge application — capacitance is irrelevant.' },
          ],
        },
        {
          value: 'telecom',
          label: 'Telecom lightning (GR-1089)',
          description: 'Specific telecom surge standard. Very high energy. TVS must be explicitly rated for GR-1089.',
          attributeEffects: [
            { attributeId: 'surge_standard', effect: 'escalate_to_mandatory', note: 'Telecom — GR-1089 compliance is mandatory. Specific test waveforms and energy levels.' },
            { attributeId: 'ppk', effect: 'escalate_to_mandatory', note: 'Telecom surge — very high energy events require adequate peak pulse power.' },
          ],
        },
        {
          value: 'automotive_transient',
          label: 'Automotive transients (ISO 7637 load dump)',
          description: 'Very high energy, long duration transients. TVS must be rated for automotive surge profiles.',
          attributeEffects: [
            { attributeId: 'surge_standard', effect: 'escalate_to_mandatory', note: 'Automotive — ISO 7637 compliance is mandatory for load dump transients.' },
            { attributeId: 'aec_q101', effect: 'escalate_to_mandatory', note: 'Automotive application — AEC-Q101 is required.' },
            { attributeId: 'ppk', effect: 'escalate_to_mandatory', note: 'Automotive load dump — very high energy, long duration transients.' },
          ],
        },
      ],
    },

    // Q3: Interface speed (conditional — signal-line applications)
    {
      questionId: 'interface_speed',
      questionText: 'What is the signal speed on the protected line?',
      condition: { questionId: 'tvs_application', values: ['signal_line'] },
      priority: 3,
      options: [
        {
          value: 'high_speed',
          label: 'High-speed (USB 3.x, HDMI 2.x, PCIe, >1Gbps)',
          description: 'Cj must be ultra-low (<1pF per line). Steering diode topology preferred. Even 2–3pF causes signal integrity failures (eye diagram closure).',
          attributeEffects: [
            { attributeId: 'cj', effect: 'escalate_to_mandatory', note: 'High-speed >1Gbps — Cj must be ultra-low (<1pF per line). Even 2–3pF is too much. Steering diode topology preferred.' },
            { attributeId: 'configuration', effect: 'escalate_to_mandatory', note: 'Steering diode topology preferred for highest-speed interfaces — achieves lowest Cj.' },
          ],
        },
        {
          value: 'medium_speed',
          label: 'Medium-speed (USB 2.0, 100BASE-T Ethernet, SPI >10MHz)',
          description: 'Cj should be <5pF per line. Standard low-cap TVS arrays work.',
          attributeEffects: [
            { attributeId: 'cj', effect: 'escalate_to_mandatory', note: 'Medium-speed — Cj should be <5pF per line. Standard low-cap TVS arrays are adequate.' },
          ],
        },
        {
          value: 'low_speed',
          label: 'Low-speed (I2C, UART, CAN, GPIO, <10MHz)',
          description: 'Cj up to 15–50pF is acceptable. More TVS options available. Power handling can be higher.',
          attributeEffects: [],
        },
      ],
    },

    // Q4: Automotive
    {
      questionId: 'automotive',
      questionText: 'Is this an automotive application?',
      priority: 4,
      options: [
        {
          value: 'yes',
          label: 'Yes — automotive',
          description: 'AEC-Q101 becomes mandatory. Must meet automotive transient profiles. Operating temp range must cover -40°C to +125°C or +150°C.',
          attributeEffects: [
            { attributeId: 'aec_q101', effect: 'escalate_to_mandatory', note: 'Automotive application — AEC-Q101 (discrete semiconductor qualification) is required.' },
            { attributeId: 'surge_standard', effect: 'escalate_to_primary', note: 'Automotive — ISO 7637 compliance for automotive transient profiles.' },
            { attributeId: 'operating_temp', effect: 'escalate_to_primary', note: 'Automotive requires -40°C to +125°C (or +150°C under-hood).' },
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
