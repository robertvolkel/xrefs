import { FamilyContextConfig } from '../types';

/**
 * Electromechanical Relays — EMR (Family F1)
 * Block F: Relays
 *
 * 4 context questions:
 * 1. Load type — resistive / inductive / motor / dry-circuit. Dry-circuit (<100mA)
 *    escalates contact_material to mandatory+block (gold-clad required, silver BLOCKED).
 *    Inductive/motor escalates contact_current_rating_a with derating (1.5× / 2×).
 * 2. Coil driver circuit — dedicated driver / GPIO direct / battery low-power.
 *    GPIO escalates coil_resistance_ohm to mandatory+block (verify ≤ GPIO Ioh_max).
 *    Battery escalates must_operate_voltage_v and coil_power_mw.
 * 3. High-cycle or timing-critical — standard / high-cycle / timing-critical.
 *    High-cycle escalates electrical_life_ops to mandatory+block.
 *    Timing-critical escalates operate_time_ms and release_time_ms to mandatory+block.
 * 4. Automotive AEC-Q200 — yes / no. AEC-Q200 (electromechanical/passive), NOT Q100/Q101.
 *
 * Context sensitivity: moderate-high
 * coil_voltage_vdc ALWAYS identity w10 blockOnMissing regardless of context.
 * contact_form ALWAYS identity w10 blockOnMissing regardless of context.
 *
 * Note: AEC-Q200 applies to EMRs (electromechanical/passive qualification).
 * NOT AEC-Q100 (ICs) or AEC-Q101 (discrete semiconductors).
 */
export const f1RelayContext: FamilyContextConfig = {
  familyIds: ['F1'],
  contextSensitivity: 'high',
  questions: [
    // ── Q1: LOAD TYPE ──────────────────────────────────────────────────
    {
      questionId: 'load_type',
      questionText:
        'What type of load is being switched? (Determines contact material and current derating requirements)',
      priority: 1,
      options: [
        {
          value: 'resistive',
          label: 'Resistive load (heaters, steady-state lamps)',
          description:
            'Pure resistive load — no inrush, no inductive kickback. Standard contact ratings apply without derating.',
          attributeEffects: [
            {
              attributeId: 'contact_material',
              effect: 'add_review_flag',
              note: 'Application Review: if load current is below 100mA, verify contact material is suitable for dry-circuit operation. Silver contacts may form insulating oxide film at low currents.',
            },
          ],
        },
        {
          value: 'inductive',
          label: 'Inductive load (solenoids, transformers, relay coils)',
          description:
            'Inductive loads generate back-EMF at switch-off, causing contact arcing. Apply 1.5× derating to contact current rating.',
          attributeEffects: [
            {
              attributeId: 'contact_current_rating_a',
              effect: 'escalate_to_mandatory',
              note: 'MANDATORY: Inductive load — apply 1.5× derating to contact current rating. A relay rated 10A resistive may carry only 5–7A on an inductive load before contact welding or accelerated erosion.',
            },
            {
              attributeId: 'contact_voltage_type',
              effect: 'escalate_to_primary',
              note: 'Verify DC contact voltage rating for DC inductive loads — DC arcs are harder to extinguish than AC arcs.',
            },
            {
              attributeId: 'electrical_life_ops',
              effect: 'escalate_to_primary',
              note: 'Inductive loads reduce electrical life to 10–50% of resistive rating due to contact arcing. Verify against expected cycle count.',
            },
            {
              attributeId: 'coil_suppress_diode',
              effect: 'escalate_to_primary',
              note: 'Inductive loads generate back-EMF — verify coil suppression type matches. Adding or removing internal suppression changes release timing.',
            },
          ],
        },
        {
          value: 'motor',
          label: 'Motor load (high inrush — 3–10× running current)',
          description:
            'Motor loads have high inrush current (locked-rotor amperage 3–10× running current). Apply 2× derating or verify against LRA.',
          attributeEffects: [
            {
              attributeId: 'contact_current_rating_a',
              effect: 'escalate_to_mandatory',
              note: 'MANDATORY: Motor load — apply 2× derating to contact current rating, or verify against locked-rotor amperage (LRA) if known. Motor inrush is 3–10× running current.',
            },
            {
              attributeId: 'contact_voltage_type',
              effect: 'escalate_to_primary',
              note: 'Verify DC contact voltage rating for DC motor loads — DC arcs are harder to extinguish.',
            },
            {
              attributeId: 'electrical_life_ops',
              effect: 'escalate_to_mandatory',
              note: 'MANDATORY: Motor loads dramatically reduce electrical life due to high inrush arcing. Verify against expected cycle count at actual motor load.',
            },
            {
              attributeId: 'coil_suppress_diode',
              effect: 'escalate_to_primary',
              note: 'Motor loads generate significant back-EMF — verify coil suppression type matches original.',
            },
          ],
        },
        {
          value: 'dry_circuit',
          label: 'Dry-circuit / signal switching (load < 100mA)',
          description:
            'Load current below 100mA — silver contacts form insulating oxide film that is not wiped by low-energy closures. Gold-clad or bifurcated gold contacts required.',
          attributeEffects: [
            {
              attributeId: 'contact_material',
              effect: 'escalate_to_mandatory',
              blockOnMissing: true,
              note: 'BLOCKING: Dry-circuit (<100mA) — gold-clad (Au over Ag base) or bifurcated gold contacts REQUIRED. Silver alloy contacts (AgNi, AgCdO, AgSnO2) form insulating oxide/sulfide film at low currents. Contact resistance can reach hundreds of ohms, causing erratic signal levels and intermittent open-circuit behaviour.',
            },
            {
              attributeId: 'max_switching_power_va',
              effect: 'escalate_to_primary',
              note: 'Low-current signal switching — verify maximum switching power is appropriate for the signal level.',
            },
            {
              attributeId: 'contact_voltage_type',
              effect: 'add_review_flag',
              note: 'Application Review: verify contact voltage type is appropriate for signal switching circuit.',
            },
          ],
        },
      ],
    },

    // ── Q2: COIL DRIVER CIRCUIT ────────────────────────────────────────
    {
      questionId: 'coil_driver',
      questionText:
        'What is the coil driver circuit? (Determines coil current and power constraints)',
      priority: 2,
      options: [
        {
          value: 'dedicated_driver',
          label: 'Dedicated relay driver IC or transistor',
          description:
            'Coil driven by a relay driver IC, MOSFET, or BJT with adequate current capacity. Standard coil specifications apply.',
          attributeEffects: [],
        },
        {
          value: 'gpio_direct',
          label: 'Microcontroller GPIO direct drive (8–25mA typical)',
          description:
            'Coil driven directly from a microcontroller GPIO pin. Limited source current — typically 8–25mA maximum. Coil resistance must be verified.',
          attributeEffects: [
            {
              attributeId: 'coil_resistance_ohm',
              effect: 'escalate_to_mandatory',
              blockOnMissing: true,
              note: 'BLOCKING: GPIO direct drive — verify coil current (V/R) does not exceed GPIO source current limit (typically 8–25mA). A 5V/125Ω coil draws 40mA — exceeding most GPIO limits and risking pin damage or voltage droop.',
            },
            {
              attributeId: 'coil_power_mw',
              effect: 'escalate_to_primary',
              note: 'GPIO direct drive — lower coil power preferred to stay within GPIO pin power budget.',
            },
          ],
        },
        {
          value: 'battery_low_power',
          label: 'Battery / low-power supply (voltage varies under load)',
          description:
            'Coil driven from battery or unregulated supply. Voltage droops under load and at end-of-discharge. Must-operate voltage critical.',
          attributeEffects: [
            {
              attributeId: 'must_operate_voltage_v',
              effect: 'escalate_to_mandatory',
              note: 'MANDATORY: Battery/low-power supply — must_operate_voltage must be ≤ battery minimum discharge voltage, not nominal. A 12V battery may droop to 8.5V under load at end-of-discharge.',
            },
            {
              attributeId: 'coil_power_mw',
              effect: 'escalate_to_mandatory',
              blockOnMissing: true,
              note: 'BLOCKING: Battery/low-power supply — coil power consumption is critical for battery life. Replacement must not exceed original coil power.',
            },
            {
              attributeId: 'coil_resistance_ohm',
              effect: 'escalate_to_primary',
              note: 'Battery supply — coil resistance affects current draw from battery. Higher resistance = lower current draw.',
            },
            {
              attributeId: 'must_release_voltage_v',
              effect: 'escalate_to_primary',
              note: 'Battery supply — must_release_voltage affects dropout behaviour as battery voltage varies. Verify relay releases cleanly when driver turns off.',
            },
          ],
        },
      ],
    },

    // ── Q3: HIGH-CYCLE OR TIMING-CRITICAL ──────────────────────────────
    {
      questionId: 'cycle_timing',
      questionText:
        'Is this a high-cycle or timing-critical application? (Determines lifecycle and timing constraints)',
      priority: 3,
      options: [
        {
          value: 'standard',
          label: 'Standard / low-cycle (HVAC, lighting, general — <100k ops)',
          description:
            'General-purpose switching with low cycle count. Standard lifecycle and timing specifications apply.',
          attributeEffects: [
            {
              attributeId: 'operate_time_ms',
              effect: 'add_review_flag',
              note: 'Application Review: verify operate time is acceptable for the application — not critical for low-cycle general switching.',
            },
            {
              attributeId: 'release_time_ms',
              effect: 'add_review_flag',
              note: 'Application Review: verify release time is acceptable — note that flyback suppression type affects release timing.',
            },
            {
              attributeId: 'contact_bounce_ms',
              effect: 'add_review_flag',
              note: 'Application Review: verify contact bounce is acceptable — not critical for most general switching applications.',
            },
          ],
        },
        {
          value: 'high_cycle',
          label: 'High-cycle industrial (>1M operations — production, test)',
          description:
            'Production equipment, test fixtures, or industrial automation requiring >1M switching operations. Electrical life at actual load type is critical.',
          attributeEffects: [
            {
              attributeId: 'electrical_life_ops',
              effect: 'escalate_to_mandatory',
              blockOnMissing: true,
              note: 'BLOCKING: High-cycle application (>1M operations) — electrical life must be verified against expected cycle count at actual load type. Inductive loads may yield only 10–50% of resistive life rating.',
            },
            {
              attributeId: 'mechanical_life_ops',
              effect: 'escalate_to_primary',
              note: 'High-cycle application — mechanical life endurance must be sufficient for expected no-load cycling.',
            },
            {
              attributeId: 'contact_material',
              effect: 'escalate_to_primary',
              note: 'High-cycle inductive switching — AgSnO2 contact material preferred for superior arc resistance and longer electrical life.',
            },
          ],
        },
        {
          value: 'timing_critical',
          label: 'Timing-critical / sequential control (operate + release time matters)',
          description:
            'Sequential control circuits, safety interlocks, or edge-triggered systems where operate and release timing affect behaviour.',
          attributeEffects: [
            {
              attributeId: 'operate_time_ms',
              effect: 'escalate_to_mandatory',
              blockOnMissing: true,
              note: 'BLOCKING: Timing-critical application — operate time (coil energise → contact close) directly affects control sequence timing. Replacement must be ≤ original.',
            },
            {
              attributeId: 'release_time_ms',
              effect: 'escalate_to_mandatory',
              blockOnMissing: true,
              note: 'BLOCKING: Timing-critical application — release time (coil de-energise → contact open) directly affects control sequence timing. Flyback diode suppression significantly extends release time (2–5ms without → 10–30ms with diode).',
            },
            {
              attributeId: 'contact_bounce_ms',
              effect: 'escalate_to_primary',
              note: 'Timing-critical — contact bounce can cause false triggering in counter, edge-detection, and interrupt-driven circuits.',
            },
          ],
        },
      ],
    },

    // ── Q4: AUTOMOTIVE AEC-Q200 ────────────────────────────────────────
    {
      questionId: 'automotive_aec_q200',
      questionText:
        'Is this an automotive application requiring AEC-Q200 qualification?',
      priority: 4,
      options: [
        {
          value: 'yes',
          label: 'Yes — automotive (AEC-Q200 required)',
          description:
            'Automotive application requiring AEC-Q200 qualified relay. Non-AEC-Q200 parts will be removed before scoring.',
          attributeEffects: [
            {
              attributeId: 'aec_q200',
              effect: 'escalate_to_mandatory',
              blockOnMissing: true,
              note: 'BLOCKING: Automotive application — AEC-Q200 qualification mandatory. Non-AEC-Q200 parts removed before scoring. Note: AEC-Q200 (electromechanical/passive) — NOT AEC-Q100 (ICs) or AEC-Q101 (discrete semiconductors).',
            },
            {
              attributeId: 'operating_temp_range',
              effect: 'escalate_to_mandatory',
              note: 'MANDATORY: Automotive application — operating temperature range must cover −40°C to +125°C minimum.',
            },
            {
              attributeId: 'sealing_type',
              effect: 'escalate_to_primary',
              note: 'Automotive application — sealed or fully sealed relay required for environmental protection against moisture, dust, and vibration.',
            },
          ],
        },
        {
          value: 'no',
          label: 'No — commercial / industrial',
          description:
            'Non-automotive application. Standard qualification requirements apply.',
          attributeEffects: [],
        },
      ],
    },
  ],
};
