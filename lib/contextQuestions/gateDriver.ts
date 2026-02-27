import { FamilyContextConfig } from '../types';

/**
 * Gate Drivers — Family C3
 * Block C: Power Management ICs
 *
 * 5 context questions:
 * 1. Driver topology (always ask — determines shoot-through safety escalation)
 * 2. Power device type (always ask — SiC/GaN need negative gate voltage review)
 * 3. Automotive application (always ask — AEC-Q100 + thermal escalation)
 * 4. Safety isolation required (always ask — confirms isolation BLOCKING)
 * 5. High switching frequency (always ask — thermal and timing escalation)
 *
 * Context sensitivity: critical
 * Gate drivers range from simple single-channel MOSFET drivers (UCC27517, TC427)
 * to complex isolated half-bridge SiC gate drivers (ADUM4135, Si8271). The same
 * C3 family covers everything from a 1A SOT-23 low-side driver to a 20kV
 * isolation, 4A half-bridge driver for traction inverters. Context determines:
 * - Whether shoot-through checks (polarity, dead-time, tpd) are BLOCKING
 * - Whether bipolar gate voltage (SiC -5V) requires engineering review
 * - Whether isolation type is a safety-critical regulatory constraint
 */
export const gateDriverContext: FamilyContextConfig = {
  familyIds: ['C3'],
  contextSensitivity: 'critical',
  questions: [
    // Q1: Driver topology — shoot-through safety escalation for half/full-bridge
    {
      questionId: 'driver_topology',
      questionText: 'What driver topology does this application use?',
      priority: 1,
      options: [
        {
          value: 'half_bridge',
          label: 'Half-bridge (high-side + low-side)',
          description: 'SHOOT-THROUGH SAFETY: Output polarity, dead-time, and propagation delay become BLOCKING. All three must pass — any single failure causes shoot-through risk. Bootstrap diode also becomes critical for high-side supply.',
          attributeEffects: [
            { attributeId: 'output_polarity', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING — SHOOT-THROUGH SAFETY: Polarity inversion in half-bridge causes simultaneous conduction of both switches. A replacement with inverted output polarity will drive the power switch ON when the controller commands OFF — instant device destruction.' },
            { attributeId: 'dead_time_control', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING — SHOOT-THROUGH SAFETY: Dead-time prevents simultaneous conduction. Absent dead-time with simultaneous HIN/LIN inputs destroys both power switches. Replacement must have dead-time control if original did.' },
            { attributeId: 'dead_time', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING — SHOOT-THROUGH SAFETY: Replacement dead-time must be ≥ original. Shorter dead-time + slow power devices = shoot-through at temperature extremes where turn-off is longest.' },
            { attributeId: 'propagation_delay', effect: 'escalate_to_primary', note: 'SHOOT-THROUGH SAFETY: Additional tpd reduces effective dead-time. If replacement has longer tpd, the actual dead-time between complementary switch transitions shrinks — potentially to zero or negative under worst-case conditions.' },
            { attributeId: 'bootstrap_diode', effect: 'escalate_to_primary', note: 'Half-bridge: Bootstrap diode charges the floating high-side supply capacitor (CBST). Internal vs external mismatch = CBST cannot charge = high-side gate never fires. In >200V bus: VB = VS + VDD can reach 600V+.' },
          ],
        },
        {
          value: 'full_bridge',
          label: 'Full-bridge (four switches)',
          description: 'Same shoot-through safety requirements as half-bridge (two half-bridge legs). All three safety checks become BLOCKING.',
          attributeEffects: [
            { attributeId: 'output_polarity', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING — SHOOT-THROUGH SAFETY: Full-bridge contains two half-bridge legs. Polarity inversion on any output causes simultaneous conduction and device destruction.' },
            { attributeId: 'dead_time_control', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING — SHOOT-THROUGH SAFETY: Full-bridge requires dead-time control on both legs. Missing dead-time = shoot-through on every switching cycle.' },
            { attributeId: 'dead_time', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING — SHOOT-THROUGH SAFETY: Full-bridge dead-time must be ≥ original across both legs.' },
            { attributeId: 'propagation_delay', effect: 'escalate_to_primary', note: 'SHOOT-THROUGH SAFETY: Full-bridge tpd affects dead-time margin on both legs simultaneously.' },
            { attributeId: 'bootstrap_diode', effect: 'escalate_to_primary', note: 'Full-bridge: Both high-side drivers require bootstrap supply. Bootstrap diode mismatch affects both legs.' },
          ],
        },
        {
          value: 'single',
          label: 'Single low-side driver',
          description: 'No dead-time or bootstrap concerns — single-channel buffers one gate signal. Dead-time and bootstrap rules suppressed.',
          attributeEffects: [
            { attributeId: 'dead_time_control', effect: 'not_applicable', note: 'Single low-side driver — no complementary switching, dead-time control is not applicable.' },
            { attributeId: 'dead_time', effect: 'not_applicable', note: 'Single low-side driver — dead-time duration is not applicable.' },
            { attributeId: 'bootstrap_diode', effect: 'not_applicable', note: 'Single low-side driver — no high-side floating supply, bootstrap is not applicable.' },
          ],
        },
        {
          value: 'dual_independent',
          label: 'Dual independent drivers',
          description: 'Two independent gate drive channels — no inherent dead-time or shoot-through concern unless driving a half-bridge externally. Dead-time rules suppressed.',
          attributeEffects: [
            { attributeId: 'dead_time_control', effect: 'not_applicable', note: 'Dual independent drivers — no built-in complementary switching. If driving a half-bridge externally, dead-time is managed by the controller, not the driver IC.' },
            { attributeId: 'dead_time', effect: 'not_applicable', note: 'Dual independent drivers — dead-time duration managed externally, not by the driver IC.' },
          ],
        },
      ],
    },

    // Q2: Power device type — SiC/GaN bipolar supply review, IGBT current escalation
    {
      questionId: 'power_device_type',
      questionText: 'What type of power device does this gate driver control?',
      priority: 2,
      options: [
        {
          value: 'silicon_mosfet',
          label: 'Silicon MOSFET',
          description: 'Standard unipolar gate drive: Vgs = 10-15V on, 0V off. Most gate drivers are designed for this. No special voltage requirements.',
          attributeEffects: [],
        },
        {
          value: 'igbt',
          label: 'IGBT',
          description: 'Large gate charge (Qg up to 500nC+). Peak drive current becomes critical for acceptable switching speed and loss.',
          attributeEffects: [
            { attributeId: 'peak_source_current', effect: 'escalate_to_primary', note: 'IGBT gate charge is typically 2-5× larger than equivalent MOSFET. Insufficient source current = slow turn-on = high switching loss and SOA risk during transition.' },
            { attributeId: 'peak_sink_current', effect: 'escalate_to_primary', note: 'IGBT turn-off with insufficient sink current extends tail current duration. Fast turn-off is critical for IGBT safe operation under inductive load.' },
          ],
        },
        {
          value: 'sic_mosfet',
          label: 'SiC MOSFET',
          description: 'ENGINEERING REVIEW: SiC requires bipolar gate supply (-5V / +18-20V). Standard unipolar drivers cannot substitute. VDD range must support negative off-state voltage to prevent parasitic turn-on from Miller coupling.',
          attributeEffects: [
            { attributeId: 'vdd_range', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING — SiC MOSFET requires bipolar gate supply: +18-20V on-state, -5V off-state. The -5V off-state voltage prevents parasitic turn-on from dV/dt-induced Miller coupling. A standard unipolar driver (0V to +15V) cannot provide this — flagged for engineering review. Verify driver supports split/bipolar supply operation.' },
          ],
        },
        {
          value: 'gan_hemt',
          label: 'GaN HEMT',
          description: 'ENGINEERING REVIEW: GaN has a tight Vgs window (+5-6V on, 0V off). Overshoot above Vgs(max) ≈ 7V destroys the device. VDD accuracy and drive circuit become critical.',
          attributeEffects: [
            { attributeId: 'vdd_range', effect: 'escalate_to_primary', note: 'GaN HEMT requires precise Vgs: +5-6V on-state, 0V off-state. Vgs(max) ≈ 7V — any overshoot above this destroys the device. The driver\'s VDD range and output voltage accuracy are critical. Verify driver is GaN-compatible.' },
          ],
        },
        {
          value: 'unknown',
          label: 'Unknown / not specified',
          description: 'Power device type not known. Standard matching weights apply.',
          attributeEffects: [],
        },
      ],
    },

    // Q3: Automotive — AEC-Q100 + thermal escalation
    {
      questionId: 'automotive',
      questionText: 'Is this an automotive application requiring AEC-Q100?',
      priority: 3,
      options: [
        {
          value: 'yes',
          label: 'Yes — automotive (AEC-Q100 required)',
          description: 'AEC-Q100 becomes mandatory. Automotive gate drivers must handle load-dump, reverse polarity, and EMI (CISPR 25). ISO 26262 functional safety for ASIL-rated motor control may require preserved FAULT pin and diagnostic features.',
          attributeEffects: [
            { attributeId: 'aec_q100', effect: 'escalate_to_mandatory', note: 'Automotive — AEC-Q100 required. Covers propagation delay stability, UVLO threshold stability, and gate drive output voltage across the automotive temperature range (-40°C to +150°C).' },
            { attributeId: 'tj_max', effect: 'escalate_to_primary', note: 'Automotive — underhood gate drivers require Tj(max) ≥ 150°C. Commercial 125°C parts have insufficient margin for automotive ambient temperatures.' },
            { attributeId: 'fault_reporting', effect: 'escalate_to_primary', note: 'Automotive — FAULT reporting may be part of ISO 26262 safety architecture. Removing fault detection is a safety regression in ASIL-rated motor control.' },
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

    // Q4: Safety isolation — confirms isolation BLOCKING behavior
    {
      questionId: 'safety_isolation',
      questionText: 'Does this application require safety-rated galvanic isolation?',
      priority: 4,
      options: [
        {
          value: 'yes',
          label: 'Yes — safety isolation required (IEC 62368 / UL 508A)',
          description: 'Isolation type is already BLOCKING by default (identity w10 + blockOnMissing). This confirms the safety requirement and adds a review flag for isolation voltage verification.',
          attributeEffects: [
            { attributeId: 'isolation_type', effect: 'add_review_flag', note: 'Safety-rated isolation confirmed. Verify isolation voltage, creepage, and clearance meet the applicable safety standard (IEC 62368, UL 508A, IEC 60950). Non-isolated replacement is a certification failure regardless of electrical performance.' },
          ],
        },
        {
          value: 'no',
          label: 'No — non-isolated is acceptable',
          description: 'No safety isolation requirement. Isolation type matching still applies (identity) but is about topology compatibility, not safety certification.',
          attributeEffects: [],
        },
        {
          value: 'unknown',
          label: 'Unknown',
          description: 'Safety isolation status not known. Conservative: isolation type remains BLOCKING by default.',
          attributeEffects: [],
        },
      ],
    },

    // Q5: High switching frequency — thermal and timing escalation
    {
      questionId: 'high_frequency',
      questionText: 'Is the switching frequency greater than 200kHz?',
      priority: 5,
      options: [
        {
          value: 'yes',
          label: 'Yes — switching frequency > 200kHz',
          description: 'At high switching frequencies, gate driver power dissipation becomes critical: Pd = QG × VDD × fsw. Faster rise/fall times and lower propagation delay are needed to maintain efficiency and dead-time margin.',
          attributeEffects: [
            { attributeId: 'rth_ja', effect: 'escalate_to_primary', note: 'High frequency (>200kHz) — gate driver dissipation scales linearly with fsw. Verify Tj = Ta + Pd × Rθja stays below Tj(max) at the actual fsw. Higher Rθja at high frequency = thermal shutdown risk.' },
            { attributeId: 'rise_fall_time', effect: 'escalate_to_primary', note: 'High frequency — rise/fall time consumes a larger fraction of the switching period. At 500kHz (2µs period), 100ns rise+fall = 5% of the period in transition. Faster transitions reduce switching loss.' },
            { attributeId: 'propagation_delay', effect: 'escalate_to_primary', note: 'High frequency — propagation delay consumes more of the available dead-time window. At 500kHz, 50ns tpd is 2.5% of the period. Tighter dead-time budget requires lower tpd.' },
          ],
        },
        {
          value: 'no',
          label: 'No — switching frequency ≤ 200kHz',
          description: 'Standard frequency operation. Gate driver thermal dissipation is typically manageable. Standard matching weights apply.',
          attributeEffects: [],
        },
        {
          value: 'unknown',
          label: 'Unknown',
          description: 'Switching frequency not known. Standard matching weights apply.',
          attributeEffects: [],
        },
      ],
    },
  ],
};
