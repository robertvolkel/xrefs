import { FamilyContextConfig } from '../types';

/**
 * Solid State Relays — SSR (Family F2)
 * Block F: Relays
 *
 * 4 context questions:
 * 1. Load supply type — AC mains / AC safety-certified / DC load. DC load
 *    escalates output_switch_type to MOSFET only (TRIAC BLOCKED). AC safety-
 *    certified escalates isolation_voltage_vrms and safety_certification to
 *    mandatory+block.
 * 2. Load type — resistive / inductive / capacitive-lamp / low-current. Low-
 *    current escalates off_state_leakage_ma and load_current_min_a to
 *    mandatory+block. Capacitive/lamp escalates di_dt_rating_a_us to
 *    mandatory+block. Inductive applies 1.5× current derating.
 * 3. Speed/thermal — standard / timing-critical / high-temp. Timing-critical
 *    escalates turn_on_time_ms and turn_off_time_ms to mandatory+block, and
 *    requires random-fire (RF) firing mode. High-temp escalates
 *    thermal_resistance_jc to mandatory+block.
 * 4. Transient protection — standard / industrial-harsh. Industrial/harsh
 *    escalates dv_dt_rating_v_us to mandatory, built_in_varistor and
 *    built_in_snubber to primary.
 *
 * Context sensitivity: high
 * output_switch_type ALWAYS identity w10 blockOnMissing regardless of context.
 * firing_mode ALWAYS identity w9 blockOnMissing regardless of context.
 *
 * Note: No AEC-Q standard applies to SSRs (not Q100/Q101/Q200).
 */
export const f2SolidStateRelayContext: FamilyContextConfig = {
  familyIds: ['F2'],
  contextSensitivity: 'high',
  questions: [
    // ── Q1: LOAD SUPPLY TYPE & ISOLATION ──────────────────────────────────
    {
      questionId: 'load_supply_type',
      questionText:
        'What is the load supply type and isolation requirement? (Determines output switch type and safety certification constraints)',
      priority: 1,
      options: [
        {
          value: 'ac_mains',
          label: 'AC mains load (120VAC or 230VAC, no specific certification required)',
          description:
            'AC mains load — TRIAC/SCR output expected. Standard 4000Vrms minimum isolation. No specific safety listing required.',
          attributeEffects: [
            {
              attributeId: 'output_switch_type',
              effect: 'add_review_flag',
              note: 'Application Review: AC mains load — verify output_switch_type is TRIAC or SCR. MOSFET-output SSRs are not rated for AC loads.',
            },
            {
              attributeId: 'safety_certification',
              effect: 'add_review_flag',
              note: 'Application Review: verify safety certification is adequate for the installation. No specific listing required for general AC switching.',
            },
          ],
        },
        {
          value: 'ac_safety_certified',
          label: 'AC mains with safety certification (UL508 industrial panel, IEC 62314)',
          description:
            'AC mains load in a safety-certified installation — UL508 industrial control panel or IEC 62314 application. Specific certification marks required on the replacement SSR.',
          attributeEffects: [
            {
              attributeId: 'output_switch_type',
              effect: 'add_review_flag',
              note: 'Application Review: AC safety-certified — verify output_switch_type is TRIAC or SCR.',
            },
            {
              attributeId: 'isolation_voltage_vrms',
              effect: 'escalate_to_mandatory',
              blockOnMissing: true,
              note: 'BLOCKING: AC safety-certified application — isolation voltage must be ≥ 4000Vrms. A higher isolation voltage alone does not substitute for a specific certification mark — the listing applies to the specific tested component.',
            },
            {
              attributeId: 'safety_certification',
              effect: 'escalate_to_mandatory',
              blockOnMissing: true,
              note: 'BLOCKING: Safety-certified application — UL508, IEC 62314, VDE, or CSA listing is mandatory. These are per-part listings — a part with higher isolation but no UL508 listing cannot substitute for a UL508-listed part in a UL-listed panel.',
            },
          ],
        },
        {
          value: 'dc_load',
          label: 'DC load (24VDC, 48VDC, or higher DC bus)',
          description:
            'DC load — MOSFET-output SSR required. TRIAC/SCR-output SSRs will latch permanently on DC loads because there is no load current zero-crossing for turn-off commutation.',
          attributeEffects: [
            {
              attributeId: 'output_switch_type',
              effect: 'escalate_to_mandatory',
              note: 'MANDATORY: DC load — output_switch_type must be MOSFET. TRIAC/SCR-output SSRs require AC current zero-crossing for turn-off. On DC loads, a triggered TRIAC latches into permanent conduction — this is a permanent fault, not a degraded condition.',
            },
            {
              attributeId: 'load_voltage_type',
              effect: 'escalate_to_mandatory',
              note: 'MANDATORY: DC load — verify load_voltage_type matches DC. AC-rated voltage specifications do not apply to DC circuits.',
            },
            {
              attributeId: 'safety_certification',
              effect: 'add_review_flag',
              note: 'Application Review: verify safety certification is adequate for the DC installation.',
            },
          ],
        },
      ],
    },

    // ── Q2: LOAD TYPE ─────────────────────────────────────────────────────
    {
      questionId: 'load_type',
      questionText:
        'What type of load is being switched? (Determines inrush, minimum current, and leakage constraints)',
      priority: 2,
      options: [
        {
          value: 'resistive',
          label: 'Resistive load (heaters, ovens — no inrush, no back-EMF)',
          description:
            'Pure resistive load — no inrush current surge, no back-EMF at switch-off. Standard SSR ratings apply without derating.',
          attributeEffects: [
            {
              attributeId: 'load_current_min_a',
              effect: 'add_review_flag',
              note: 'Application Review: if resistive load current is very low, verify it exceeds TRIAC minimum latching current.',
            },
            {
              attributeId: 'off_state_leakage_ma',
              effect: 'add_review_flag',
              note: 'Application Review: verify off-state leakage current is acceptable for the load — typically negligible for power resistive loads.',
            },
          ],
        },
        {
          value: 'inductive',
          label: 'Inductive load (motors, solenoids, transformers — back-EMF at switch-off)',
          description:
            'Inductive load generates back-EMF at switch-off, causing voltage transients across the SSR output. Apply 1.5× current derating.',
          attributeEffects: [
            {
              attributeId: 'dv_dt_rating_v_us',
              effect: 'escalate_to_primary',
              note: 'Inductive load — back-EMF at switch-off generates high dV/dt across the SSR output. Verify dV/dt rating is sufficient to prevent false re-triggering.',
            },
            {
              attributeId: 'load_current_max_a',
              effect: 'escalate_to_mandatory',
              note: 'MANDATORY: Inductive load — apply 1.5× derating to load current rating. Inductive loads generate higher peak currents and back-EMF stress on the output semiconductor.',
            },
            {
              attributeId: 'built_in_snubber',
              effect: 'escalate_to_primary',
              note: 'Inductive load — built-in snubber provides dV/dt protection against back-EMF transients. If replacement lacks snubber, external RC network required.',
            },
            {
              attributeId: 'thermal_resistance_jc',
              effect: 'escalate_to_primary',
              note: 'Inductive load — increased thermal stress from back-EMF energy. Verify thermal margin with existing heatsink.',
            },
          ],
        },
        {
          value: 'capacitive_lamp',
          label: 'Capacitive / lamp load (LED drivers, CFL, fluorescent, capacitor banks — high inrush)',
          description:
            'Capacitive and lamp loads draw very high inrush current at turn-on (10–100× steady-state for capacitors, 5–15× for lamps). The rate of current rise (dI/dt) is critical.',
          attributeEffects: [
            {
              attributeId: 'di_dt_rating_a_us',
              effect: 'escalate_to_mandatory',
              blockOnMissing: true,
              note: 'BLOCKING: Capacitive/lamp load — dI/dt rating is critical. Inrush current rises very rapidly through the discharged capacitor or cold lamp filament. If dI/dt exceeds the SSR rating, localised junction overheating causes semiconductor damage.',
            },
            {
              attributeId: 'firing_mode',
              effect: 'escalate_to_primary',
              note: 'Capacitive/lamp load — zero-crossing firing mode strongly preferred. Turn-on at voltage zero minimises inrush current surge. Random-fire at voltage peak causes maximum inrush.',
            },
            {
              attributeId: 'load_current_min_a',
              effect: 'escalate_to_primary',
              note: 'Capacitive/lamp load — LED drivers and CFL may draw very low steady-state current. Verify TRIAC minimum latching current is below the actual load current.',
            },
            {
              attributeId: 'off_state_leakage_ma',
              effect: 'escalate_to_primary',
              note: 'Capacitive/lamp load — off-state snubber leakage may partially charge capacitors or cause LED lamps to flicker/glow faintly in the off state.',
            },
          ],
        },
        {
          value: 'low_current',
          label: 'Low-current / sensitive load (< 1A — signals, indicators, low-power electronics)',
          description:
            'Load current below 1A — TRIAC holding current and off-state snubber leakage become critical. The SSR may fail to maintain conduction or may partially energise the load when off.',
          attributeEffects: [
            {
              attributeId: 'off_state_leakage_ma',
              effect: 'escalate_to_mandatory',
              blockOnMissing: true,
              note: 'BLOCKING: Low-current/sensitive load — off-state leakage from the internal snubber (1–10mA at mains voltage) can partially energise the load, causing indicator lamps to glow or sensitive electronics to malfunction. Verify replacement leakage ≤ original.',
            },
            {
              attributeId: 'load_current_min_a',
              effect: 'escalate_to_mandatory',
              blockOnMissing: true,
              note: 'BLOCKING: Low-current load — TRIAC requires minimum holding current to remain latched. If load current falls below this threshold, the TRIAC de-latches prematurely, causing flickering or failure to switch. Verify replacement minimum load current ≤ actual load current. Consider whether an EMR (Family F1) is more appropriate for very low load currents.',
            },
          ],
        },
      ],
    },

    // ── Q3: SWITCHING SPEED / THERMAL MANAGEMENT ──────────────────────────
    {
      questionId: 'speed_thermal',
      questionText:
        'Is switching speed or thermal management a concern? (Determines timing and thermal derating constraints)',
      priority: 3,
      options: [
        {
          value: 'standard',
          label: 'Standard / non-timing-critical (on/off control only)',
          description:
            'General-purpose on/off switching. No timing precision required. Standard thermal specifications apply.',
          attributeEffects: [
            {
              attributeId: 'turn_on_time_ms',
              effect: 'add_review_flag',
              note: 'Application Review: verify turn-on time is acceptable — not critical for standard on/off switching.',
            },
            {
              attributeId: 'turn_off_time_ms',
              effect: 'add_review_flag',
              note: 'Application Review: verify turn-off time is acceptable — for AC TRIAC-output, turn-off waits for current zero-crossing (up to one full cycle).',
            },
          ],
        },
        {
          value: 'timing_critical',
          label: 'Timing-critical / proportional control (phase-angle firing, duty-cycle accuracy)',
          description:
            'Phase-angle power control, PWM duty-cycle control, or sequential timing applications. Random-fire (RF) firing mode required — zero-crossing cannot provide proportional control.',
          attributeEffects: [
            {
              attributeId: 'turn_on_time_ms',
              effect: 'escalate_to_mandatory',
              blockOnMissing: true,
              note: 'BLOCKING: Timing-critical application — turn-on time directly affects control timing precision. Replacement must be ≤ original.',
            },
            {
              attributeId: 'turn_off_time_ms',
              effect: 'escalate_to_mandatory',
              blockOnMissing: true,
              note: 'BLOCKING: Timing-critical application — turn-off time directly affects control timing precision. For AC TRIAC-output, turn-off is inherently delayed to current zero-crossing.',
            },
            {
              attributeId: 'firing_mode',
              effect: 'escalate_to_mandatory',
              note: 'MANDATORY: Proportional control requires random-fire (RF) firing mode. Zero-crossing (ZC) SSRs cannot provide phase-angle control — they wait for AC voltage zero before turning on, preventing proportional power delivery. ZC is BLOCKED for proportional control applications.',
            },
          ],
        },
        {
          value: 'high_temp',
          label: 'High ambient temperature (>40°C ambient or enclosed panel without forced cooling)',
          description:
            'Elevated ambient temperature — SSR current rating must be derated. Thermal resistance and on-state voltage drop become critical for verifying the existing heatsink is adequate.',
          attributeEffects: [
            {
              attributeId: 'thermal_resistance_jc',
              effect: 'escalate_to_mandatory',
              blockOnMissing: true,
              note: 'BLOCKING: High ambient temperature — thermal resistance must be ≤ original to ensure the existing heatsink is adequate. Verify derated current at operating ambient: Tj = Ta + (Rth_jc + Rth_cs) × (Vdrop × Iload) ≤ Tjmax. If this calculation cannot be completed, add Application Review.',
            },
            {
              attributeId: 'on_state_voltage_drop_v',
              effect: 'escalate_to_primary',
              note: 'High ambient temperature — on-state voltage drop determines power dissipation (Pdiss = Vdrop × Iload). Higher Vdrop increases junction temperature and may cause the existing heatsink to be undersized.',
            },
          ],
        },
      ],
    },

    // ── Q4: TRANSIENT PROTECTION ──────────────────────────────────────────
    {
      questionId: 'transient_protection',
      questionText:
        'Is there an overvoltage or transient protection requirement? (Determines built-in protection and dV/dt constraints)',
      priority: 4,
      options: [
        {
          value: 'standard',
          label: 'Standard environment (normal mains transients)',
          description:
            'Normal operating environment with standard mains transient levels. Built-in protection features are noted but not critical.',
          attributeEffects: [
            {
              attributeId: 'built_in_varistor',
              effect: 'add_review_flag',
              note: 'Application Review: verify built-in varistor presence is consistent — if original had varistor and replacement does not, note that external overvoltage protection may be needed.',
            },
          ],
        },
        {
          value: 'industrial_harsh',
          label: 'Industrial / harsh environment (significant transients, motor back-EMF, lightning coupling)',
          description:
            'Harsh electrical environment with significant voltage transients from inductive loads, motor switching, or lightning-induced surges. Built-in protection features become critical.',
          attributeEffects: [
            {
              attributeId: 'built_in_varistor',
              effect: 'escalate_to_primary',
              note: 'Industrial/harsh environment — built-in varistor (MOV/TVS) provides overvoltage protection on load terminals. If replacement lacks this and original had it, external TVS/MOV required.',
            },
            {
              attributeId: 'built_in_snubber',
              effect: 'escalate_to_primary',
              note: 'Industrial/harsh environment — built-in snubber provides dV/dt protection against transient false triggering. If replacement lacks this, external RC network required.',
            },
            {
              attributeId: 'dv_dt_rating_v_us',
              effect: 'escalate_to_mandatory',
              note: 'MANDATORY: Industrial/harsh environment — dV/dt rating must be sufficient for the transient environment. Mains transients, motor back-EMF, and lightning coupling can produce very high dV/dt across the SSR output.',
            },
            {
              attributeId: 'isolation_voltage_vrms',
              effect: 'escalate_to_primary',
              note: 'Industrial/harsh environment — higher isolation voltage provides additional margin against transient voltages coupling across the input-output barrier.',
            },
          ],
        },
      ],
    },
  ],
};
