import { LogicTable } from '../types';

/**
 * Electromechanical Relays — EMR (Family F1)
 * Block F: Relays — Family F1
 *
 * Derived from: docs/f1_emr_logic.docx
 * 23 attributes with specific matching rules for cross-reference validation.
 *
 * Family F1 covers single-coil electromechanical relays (EMRs): PCB power relays,
 * signal relays, and automotive relays. It does NOT cover solid-state relays (SSR —
 * future F2), latching relays (dual-coil or mechanically latching — flag Application
 * Review), contactors (>25A continuous — flag out of scope), or reed relays
 * (magnetically actuated — flag Application Review).
 *
 * Key substitution pitfalls:
 * - coil_voltage_vdc is IDENTITY — exact match required. NOT a threshold. 24V coil
 *   on 12V won't pull in; 5V coil on 12V overheats (P = V²/R).
 * - contact_form is a HARD GATE — SPST-NO / SPST-NC / SPDT / DPST / DPDT define
 *   wiring topology. Cross-form substitution reverses circuit logic or leaves half
 *   the circuit uncontrolled.
 * - contact_current_rating_a and contact_voltage_rating_v are safety-critical minimum
 *   thresholds. Derate for inductive (1.5×) and motor (2×/LRA) loads.
 * - AC/DC contact voltage NOT interchangeable — DC arcs have no zero crossing. A relay
 *   rated 250VAC may carry only 30VDC.
 * - contact_material is a reliability gate for dry-circuit (<100mA) — silver contacts
 *   form insulating oxide film. Gold-clad or bifurcated gold contacts required.
 * - coil_resistance_ohm threshold GTE — critical for GPIO direct drive (8–25mA limit).
 * - AEC-Q200 (electromechanical/passive) — NOT AEC-Q100 or AEC-Q101.
 *
 * Related families: F2 (Solid-State Relays — not yet implemented), Family 66 (PTC
 * Resettable Fuses — redirect guard for PPTC misclassification).
 */
export const f1RelayLogicTable: LogicTable = {
  familyId: 'F1',
  familyName: 'Electromechanical Relays (EMR)',
  category: 'Relays',
  description:
    'Hard logic filters for EMR replacement validation. coil_voltage_vdc (w10 identity blockOnMissing) is exact match — not a threshold. contact_form (w10 identity blockOnMissing) is a hard categorical gate. contact_current_rating_a and contact_voltage_rating_v (w9 threshold gte blockOnMissing) are safety-critical minimums. contact_material is a reliability gate for dry-circuit applications (<100mA). AEC-Q200 for automotive — NOT AEC-Q100 or AEC-Q101.',
  rules: [
    // ── SECTION 1: CONTACT CONFIGURATION — HARD GATES ──────────────────

    {
      attributeId: 'coil_voltage_vdc',
      attributeName: 'Coil Voltage (VDC)',
      logicType: 'identity',
      weight: 10,
      blockOnMissing: true,
      engineeringReason:
        'BLOCKING — IDENTITY, not a threshold in either direction. The relay coil is designed to operate at a specific nominal voltage that must match the driver circuit supply. A 24V coil on a 12V supply will not reach must_operate_voltage and will fail to pull in under load. A 5V coil on a 12V supply will dissipate 2.4× its rated power (P = V²/R), overheat, and fail. Both directions are hard failures — coil voltage must match exactly.',
      sortOrder: 1,
    },
    {
      attributeId: 'contact_form',
      attributeName: 'Contact Form',
      logicType: 'identity',
      weight: 10,
      blockOnMissing: true,
      engineeringReason:
        'BLOCKING — HARD GATE. SPST-NO (Form A), SPST-NC (Form B), SPDT (Form C), DPST, and DPDT define how many circuits are switched and their default states. The wiring topology of the controlled circuit is built around this. SPST-NO ≠ SPST-NC: swapping reverses the logic of the controlled circuit. SPDT can substitute for SPST by using the appropriate contact, but SPST cannot substitute for SPDT. DPDT cannot be replaced by SPDT without leaving half the circuit uncontrolled.',
      sortOrder: 2,
    },
    {
      attributeId: 'mounting_type',
      attributeName: 'Mounting Type',
      logicType: 'identity',
      weight: 9,
      blockOnMissing: true,
      engineeringReason:
        'BLOCKING — PCB through-hole, SMD, DIN-rail, panel-mount, and socket mounting types are physically incompatible. A through-hole relay cannot be placed in an SMD footprint. DIN-rail relays require rail mounting infrastructure not present on a PCB.',
      sortOrder: 3,
    },
    {
      attributeId: 'contact_count',
      attributeName: 'Contact Count (Poles)',
      logicType: 'identity',
      weight: 8,
      blockOnMissing: true,
      engineeringReason:
        'BLOCKING — Number of switched poles (1P/2P/3P/4P). Cannot replace a 2-pole relay with a 1-pole — the second circuit has no switching element. Adding poles beyond what is wired is electrically harmless but wastes board space and cost.',
      sortOrder: 4,
    },

    // ── SECTION 2: CONTACT RATINGS — SAFETY-CRITICAL ───────────────────

    {
      attributeId: 'contact_voltage_rating_v',
      attributeName: 'Contact Voltage Rating (V)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 9,
      blockOnMissing: true,
      engineeringReason:
        'SAFETY-CRITICAL — Maximum rated switching voltage. Replacement must be rated ≥ circuit voltage. Exceeding the contact voltage rating causes arc-over between contacts, which can weld contacts shut or ignite surrounding materials. Separate AC and DC ratings apply — verify the correct type for the load via contact_voltage_type.',
      sortOrder: 5,
    },
    {
      attributeId: 'contact_current_rating_a',
      attributeName: 'Contact Current Rating (A)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 9,
      blockOnMissing: true,
      engineeringReason:
        'SAFETY-CRITICAL — Maximum rated switching current. Replacement must be ≥ original. The manufacturer rating assumes a resistive test load. For inductive loads (motors, solenoids, transformers), apply a derating factor — typically 1.5× for general inductive, 2× or LRA (locked-rotor amperage) for motor loads. A relay rated 10A resistive may carry only 5–7A on an inductive load before contact welding or accelerated erosion. Context Q1 (inductive/motor) escalates this rule.',
      sortOrder: 6,
    },
    {
      attributeId: 'contact_voltage_type',
      attributeName: 'Contact Voltage Type (AC/DC)',
      logicType: 'identity_flag',
      weight: 7,
      blockOnMissing: false,
      engineeringReason:
        'AC and DC contact voltage ratings are not interchangeable. DC arcs have no natural zero crossing and are significantly harder to extinguish than AC arcs. A relay rated 250VAC may carry only 30VDC or 125VDC — or may have no DC rating at all. For any DC switching application above 30V, verify the DC contact voltage rating explicitly. Context Q1 (inductive/motor) escalates to primary.',
      sortOrder: 7,
    },
    {
      attributeId: 'contact_material',
      attributeName: 'Contact Material',
      logicType: 'identity_flag',
      weight: 7,
      blockOnMissing: false,
      engineeringReason:
        'Reliability gate for low-current applications. Silver alloy contacts (AgNi, AgCdO, AgSnO2) form a thin silver sulfide or oxide film during idle periods. At load currents above ~100–200mA, the first contact closure generates enough arc energy to wipe through this film. At dry-circuit levels (<100mA — signal sensing, logic interfacing), the film is not wiped and contact resistance can reach hundreds of ohms, causing erratic signal levels. Gold-clad (Au over Ag base) or bifurcated gold contacts are required. Context Q1 (dry-circuit) escalates to mandatory + blockOnMissing.',
      sortOrder: 8,
    },
    {
      attributeId: 'max_switching_power_va',
      attributeName: 'Maximum Switching Power (VA)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 6,
      blockOnMissing: false,
      engineeringReason:
        'Maximum switching power envelope. The contact rating is bounded by voltage × current — a relay rated 10A / 250VAC may not be rated for 2500VA simultaneously. The switching power limit accounts for contact arc energy at the combined V×I operating point.',
      sortOrder: 9,
    },

    // ── SECTION 3: COIL CHARACTERISTICS ────────────────────────────────

    {
      attributeId: 'coil_resistance_ohm',
      attributeName: 'Coil Resistance (Ω)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 7,
      blockOnMissing: false,
      engineeringReason:
        'Coil resistance determines the coil drive current (I = V/R) and is the primary limiting factor when the coil is driven from a current-limited source. Replacement coil resistance must be ≥ original to ensure the replacement does not draw more current than the driver can supply. Critical for GPIO direct-drive designs: many microcontroller GPIO pins source 8–25mA max. A relay with a 5V/125Ω coil draws 40mA — exceeding the GPIO limit and damaging the pin. Context Q2 (GPIO direct) escalates to mandatory + blockOnMissing.',
      sortOrder: 10,
    },
    {
      attributeId: 'coil_power_mw',
      attributeName: 'Coil Power (mW)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 6,
      blockOnMissing: false,
      engineeringReason:
        'Steady-state coil power consumption. Lower power is preferred for battery-powered and thermally constrained designs. Context Q2 (battery/low-power) escalates to mandatory + blockOnMissing.',
      sortOrder: 11,
    },
    {
      attributeId: 'must_operate_voltage_v',
      attributeName: 'Must-Operate Voltage (V)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 7,
      blockOnMissing: false,
      engineeringReason:
        'Minimum coil voltage at which the relay reliably pulls in. The replacement must_operate_voltage must be ≤ the minimum supply voltage — not the nominal supply voltage. For regulated supplies with ±10% tolerance, nominal 12V may droop to 10.8V. For battery-powered applications, the supply may droop significantly under load and at end-of-discharge. Context Q2 (battery/low-power) escalates to mandatory.',
      sortOrder: 12,
    },
    {
      attributeId: 'must_release_voltage_v',
      attributeName: 'Must-Release Voltage (V)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 5,
      blockOnMissing: false,
      engineeringReason:
        'Maximum voltage at which the relay reliably releases (drops out). If the replacement has a higher must_release_voltage than the original, the relay may fail to release when the driver de-energises the coil, especially with variable or battery supplies. Context Q2 (battery/low-power) escalates to primary.',
      sortOrder: 13,
    },

    // ── SECTION 4: TIMING & LIFECYCLE ──────────────────────────────────

    {
      attributeId: 'operate_time_ms',
      attributeName: 'Operate Time (ms)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 6,
      blockOnMissing: false,
      engineeringReason:
        'Time from coil energisation to contact closure. Replacement must be ≤ original for timing-critical applications. In sequential control circuits, a slower relay can cause downstream timing failures. Context Q3 (timing-critical) escalates to mandatory + blockOnMissing.',
      sortOrder: 14,
    },
    {
      attributeId: 'release_time_ms',
      attributeName: 'Release Time (ms)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 6,
      blockOnMissing: false,
      engineeringReason:
        'Time from coil de-energisation to contact opening. Release time increases substantially when a flyback diode is present across the coil. With no suppression: 2–5ms. With a diode: 10–30ms (stored energy dissipates through coil resistance only). With a diode + Zener: faster decay. If the original uses one suppression type and the replacement another, the release timing profile changes — causing functional failures in timing-sensitive circuits. Context Q3 (timing-critical) escalates to mandatory + blockOnMissing.',
      sortOrder: 15,
    },
    {
      attributeId: 'mechanical_life_ops',
      attributeName: 'Mechanical Life (operations)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 5,
      blockOnMissing: false,
      engineeringReason:
        'No-load cycling endurance, typically 10–100M operations. Always higher than electrical life because there is no contact erosion. Context Q3 (high-cycle) escalates to primary.',
      sortOrder: 16,
    },
    {
      attributeId: 'electrical_life_ops',
      attributeName: 'Electrical Life (operations)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 6,
      blockOnMissing: false,
      engineeringReason:
        'Endurance at rated electrical load. Depends critically on load type: the manufacturer rating is based on their test load (usually resistive). At inductive loads, actual electrical life may be 10–50% of the rated value due to contact arcing. For high-cycle industrial applications, this must be verified against the expected cycle count at the actual load type. Context Q3 (high-cycle) escalates to mandatory + blockOnMissing. Often absent from Digikey parametric data — must be read from relay datasheet.',
      sortOrder: 17,
    },
    {
      attributeId: 'contact_bounce_ms',
      attributeName: 'Contact Bounce (ms)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 5,
      blockOnMissing: false,
      engineeringReason:
        'Contact bounce duration after closure. Excessive bounce can cause false triggering in counter, edge-detection, and interrupt-driven circuits. Context Q3 (timing-critical) escalates to primary.',
      sortOrder: 18,
    },

    // ── SECTION 5: PHYSICAL & ENVIRONMENT ──────────────────────────────

    {
      attributeId: 'package_footprint',
      attributeName: 'Package Footprint',
      logicType: 'identity_flag',
      weight: 8,
      blockOnMissing: false,
      engineeringReason:
        'PCB footprint and pin pitch. Many relay series share standard footprints within a manufacturer or across manufacturers (e.g., Sugar Cube, RT1, ISO 7588 automotive mini). JEDEC/manufacturer-standard footprints are interchangeable within the standard. A footprint mismatch prevents PCB drop-in replacement.',
      sortOrder: 19,
    },
    {
      attributeId: 'coil_suppress_diode',
      attributeName: 'Coil Suppression Diode',
      logicType: 'identity_flag',
      weight: 6,
      blockOnMissing: false,
      engineeringReason:
        'Internal flyback suppression type: None / Diode / Diode+Zener / Varistor. A relay with an internal flyback diode does not require external suppression on the driver circuit. If the replacement lacks this diode, the application must add external suppression to protect the driver transistor from the coil back-EMF spike (can be 10–100× supply voltage). Conversely, a relay with an internal diode has a significantly longer release time. Application Review whenever coil_suppress_diode changes between original and replacement.',
      sortOrder: 20,
    },
    {
      attributeId: 'operating_temp_range',
      attributeName: 'Operating Temperature Range',
      logicType: 'threshold',
      thresholdDirection: 'range_superset',
      weight: 7,
      blockOnMissing: true,
      engineeringReason:
        'Replacement temperature range must fully cover the application operating range. Automotive applications require −40°C to +125°C minimum. Context Q4 (automotive) escalates to mandatory.',
      sortOrder: 21,
    },
    {
      attributeId: 'sealing_type',
      attributeName: 'Sealing Type',
      logicType: 'identity_flag',
      weight: 5,
      blockOnMissing: false,
      engineeringReason:
        'Open / Sealed / Flux-tight / Fully sealed / Hermetic. Determines PCB process compatibility and environmental resistance. Open relays cannot withstand PCB wash processes — flux residues contaminate contacts causing high contact resistance. Flux-tight relays withstand wash but are not sealed against humidity. Fully sealed and hermetic relays suit harsh environments. Context Q4 (automotive) escalates to primary — sealed or fully sealed required.',
      sortOrder: 22,
    },
    {
      attributeId: 'aec_q200',
      attributeName: 'AEC-Q200 Qualification',
      logicType: 'identity_flag',
      weight: 4,
      blockOnMissing: false,
      engineeringReason:
        'AEC-Q200 qualification for automotive electromechanical and passive components. Note: AEC-Q200 — NOT AEC-Q100 (ICs) or AEC-Q101 (discrete semiconductors). EMRs are electromechanical devices qualifying under Q200. Context Q4 (automotive) escalates to mandatory + blockOnMissing — non-AEC-Q200 parts removed before scoring.',
      sortOrder: 23,
    },
  ],
};
