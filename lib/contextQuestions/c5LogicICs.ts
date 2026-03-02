import { FamilyContextConfig } from '../types';

/**
 * Context questions for Family C5: Logic ICs — 74-Series Standard Logic
 *
 * contextSensitivity: 'critical' — driving source type (TTL vs CMOS)
 * drives the HC/HCT blocking check, mixed-voltage determines 5V-tolerance
 * requirements, and bus application context makes output type and OE
 * polarity BLOCKING.
 *
 * Q1 (driving_source) is the most critical: determines whether HC inputs
 * are blocked due to TTL VOH_min (2.4V) < HC VIH_min (3.5V).
 * Q3 (bus_application) escalates output_type and oe_polarity to BLOCKING.
 * Q4 (input_signal_quality) escalates schmitt_trigger to BLOCKING.
 */
export const c5LogicICsContext: FamilyContextConfig = {
  familyIds: ['C5'],
  contextSensitivity: 'critical',
  questions: [
    // ================================================================
    // Q1: Driving Source — THE critical HC/HCT compatibility check
    // ================================================================
    {
      questionId: 'driving_source',
      questionText: 'What is the logic family of the device driving the inputs?',
      priority: 1,
      options: [
        {
          value: 'ttl',
          label: 'TTL-output source (LS, ALS, AS, F, HCT, ACT, LVT)',
          description: 'TTL-output families guarantee VOH_min = 2.4V — HC inputs (VIH = 3.5V at 5V) are in the undefined region. Only HCT/ACT inputs are safe.',
          attributeEffects: [
            {
              attributeId: 'vih',
              effect: 'escalate_to_mandatory',
              blockOnMissing: true,
              note: 'BLOCKING — TTL VOH_min = 2.4V. HC VIH_min = 3.5V at 5V supply → 2.4V < 3.5V = undefined input region. Only HCT (VIH = 2.0V) or ACT inputs are acceptable when the driving source is TTL-output.',
            },
            {
              attributeId: 'logic_family',
              effect: 'escalate_to_primary',
              note: 'Logic family becomes primary when driving source is TTL — HC/HCT distinction is critical for interface compatibility.',
            },
          ],
        },
        {
          value: 'cmos',
          label: 'CMOS-output source (HC, AC, LVC, AHC, ALVC, AUP)',
          description: 'CMOS outputs swing rail-to-rail — compatible with both CMOS and TTL input thresholds at the same supply voltage.',
          attributeEffects: [],
        },
        {
          value: 'mixed',
          label: 'Mixed or unknown driving sources',
          description: 'Multiple driving sources or unknown — evaluate all interface constraints conservatively.',
          attributeEffects: [
            {
              attributeId: 'vih',
              effect: 'escalate_to_primary',
              note: 'VIH becomes primary when driving sources are mixed — must verify worst-case VOH_min of all drivers meets VIH_min.',
            },
            {
              attributeId: 'vil',
              effect: 'escalate_to_primary',
              note: 'VIL becomes primary when driving sources are mixed — must verify worst-case VOL_max of all drivers meets VIL_max.',
            },
          ],
        },
      ],
    },

    // ================================================================
    // Q2: Mixed Voltage Interface — 3.3V/5V compatibility
    // ================================================================
    {
      questionId: 'voltage_interface',
      questionText: 'Does this device interface between different voltage domains?',
      priority: 2,
      options: [
        {
          value: 'mixed_3v3_5v',
          label: 'Yes — 3.3V / 5V mixed interface',
          description: '3.3V and 5V devices on the same bus or signal path — requires 5V-tolerant inputs on 3.3V devices and level-compatible thresholds.',
          attributeEffects: [
            {
              attributeId: 'input_clamp_diodes',
              effect: 'escalate_to_mandatory',
              blockOnMissing: true,
              note: 'BLOCKING — 5V signals applied to non-5V-tolerant 3.3V inputs will forward-bias the Vcc clamp diode, injecting current into the supply rail. Only LVC and other explicitly 5V-tolerant families are safe.',
            },
            {
              attributeId: 'voh',
              effect: 'escalate_to_mandatory',
              blockOnMissing: true,
              note: 'BLOCKING — 3.3V CMOS VOH (~3.3V) driving 5V HC input (VIH = 3.5V) fails. Only TTL-threshold receivers (HCT, ACT at 5V supply, VIH = 2.0V) can accept 3.3V CMOS output.',
            },
            {
              attributeId: 'supply_voltage',
              effect: 'escalate_to_primary',
              note: 'Supply voltage range becomes critical — device must support the actual operating voltage in the mixed-voltage system.',
            },
          ],
        },
        {
          value: 'single_domain',
          label: 'No — single voltage domain',
          description: 'All devices operate from the same supply voltage — standard compatibility rules apply.',
          attributeEffects: [],
        },
      ],
    },

    // ================================================================
    // Q3: Bus Application — output type and OE polarity BLOCKING
    // ================================================================
    {
      questionId: 'bus_application',
      questionText: 'Is this device used in a shared bus or multi-driver application?',
      priority: 3,
      options: [
        {
          value: 'shared_bus',
          label: 'Yes — shared bus (I2C, SPI, parallel bus, backplane)',
          description: 'Multiple devices share a common bus — output type and OE polarity mismatches cause bus contention.',
          attributeEffects: [
            {
              attributeId: 'output_type',
              effect: 'escalate_to_mandatory',
              blockOnMissing: true,
              note: 'BLOCKING — open-drain replacing totem-pole on a shared bus: wired-AND topology required. Totem-pole replacing open-drain: bus-contention risk with simultaneous drivers. Mismatched output types on a shared bus will damage output stages.',
            },
            {
              attributeId: 'oe_polarity',
              effect: 'escalate_to_mandatory',
              blockOnMissing: true,
              note: 'BLOCKING — OE polarity inversion on a bus transceiver means the device drives the bus continuously when it should be tri-stated (or is always disabled when it should be driving). Classic bus contention failure.',
            },
            {
              attributeId: 'bus_hold',
              effect: 'escalate_to_primary',
              note: 'Bus hold becomes primary in shared bus applications — missing bus hold leaves lines undefined during bus arbitration or startup.',
            },
          ],
        },
        {
          value: 'point_to_point',
          label: 'No — point-to-point or single-driver',
          description: 'Single driver, single receiver — standard output compatibility is sufficient.',
          attributeEffects: [],
        },
      ],
    },

    // ================================================================
    // Q4: Input Signal Quality — Schmitt trigger BLOCKING
    // ================================================================
    {
      questionId: 'input_signal_quality',
      questionText: 'Are the input signals slow-edged, noisy, or from analog/mechanical sources?',
      priority: 4,
      options: [
        {
          value: 'slow_noisy',
          label: 'Yes — slow edges, noise, or mechanical inputs',
          description: 'RC timing circuits, long PCB traces, crystal oscillators, switch debouncing, sensor inputs with slowly changing voltage.',
          attributeEffects: [
            {
              attributeId: 'schmitt_trigger',
              effect: 'escalate_to_mandatory',
              blockOnMissing: true,
              note: 'BLOCKING — without Schmitt trigger hysteresis (0.5–0.7V typical), a standard CMOS input will produce multiple output transitions on slow edges. Non-Schmitt replacement in a slow-edge or noisy input circuit produces output chatter, glitches, and erratic downstream behavior.',
            },
          ],
        },
        {
          value: 'clean_digital',
          label: 'No — clean digital signals with fast edges',
          description: 'Standard digital signals from other logic ICs, MCU outputs, or properly terminated lines.',
          attributeEffects: [],
        },
      ],
    },

    // ================================================================
    // Q5: Automotive Application — AEC-Q100 and temperature
    // ================================================================
    {
      questionId: 'automotive',
      questionText: 'Is this an automotive application?',
      priority: 5,
      options: [
        {
          value: 'yes',
          label: 'Yes — automotive (AEC-Q100 required)',
          description: 'Automotive electronics requiring AEC-Q100 qualification, extended temperature range, and reliability testing.',
          attributeEffects: [
            {
              attributeId: 'aec_q100',
              effect: 'escalate_to_mandatory',
              blockOnMissing: true,
              note: 'BLOCKING — AEC-Q100 is mandatory for automotive. Non-qualified parts are rejected regardless of electrical match. Grade hierarchy: Grade 0 > Grade 1 > Grade 2 > Grade 3.',
            },
            {
              attributeId: 'operating_temp',
              effect: 'escalate_to_primary',
              note: 'Automotive operating temperature must meet AEC-Q100 grade requirements — typically -40°C to +125°C (Grade 1).',
            },
          ],
        },
        {
          value: 'no',
          label: 'No — non-automotive',
          description: 'Consumer, industrial, or commercial application.',
          attributeEffects: [],
        },
      ],
    },
  ],
};
