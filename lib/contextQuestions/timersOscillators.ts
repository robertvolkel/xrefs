import { FamilyContextConfig } from '../types';

/**
 * Timers and Oscillators (Family C8)
 * Block C: Standard ICs
 *
 * 4 context questions:
 * 1. Device category — BLOCKING gate (555 timer vs XO vs MEMS vs TCXO vs VCXO vs OCXO)
 * 2. Frequency accuracy / stability requirement (comms / precision / SerDes / general)
 * 3. Battery-powered / power-constrained?
 * 4. Automotive — AEC-Q100 gate
 *
 * Context sensitivity: moderate
 * Device category is the first and hardest gate — 555 timers and packaged
 * oscillators are architecturally unrelated. A 555 timer produces timing from
 * external R and C; a packaged oscillator contains an internal resonator and
 * produces a fixed output frequency. Within oscillators, the stability class
 * (XO / MEMS / TCXO / VCXO / OCXO) determines the accuracy/power trade-off
 * the original engineer chose deliberately.
 *
 * Q2 is the most impactful escalation question — it determines whether
 * frequency tolerance, TC, and jitter are primary matching axes or secondary.
 *
 * Source: docs/application-context-attribute-map.md, Section 35
 */
export const timersOscillatorsContext: FamilyContextConfig = {
  familyIds: ['C8'],
  contextSensitivity: 'moderate',
  questions: [
    // Q1: Device category — THE critical question, BLOCKING gate
    {
      questionId: 'device_category_type',
      questionText: 'What is the device category?',
      priority: 1,
      options: [
        {
          value: '555_timer',
          label: '555 / 556 Timer IC (NE555, TLC555, LM555, ICM7555)',
          description: 'All oscillator candidates blocked. 555 timers produce timing from external R and C — the IC does not contain a frequency reference. output_frequency_hz and output_signal_type are not applicable. Matching focuses on supply voltage range, timer variant (CMOS vs bipolar), output current, and quiescent current.',
          attributeEffects: [
            { attributeId: 'device_category', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: 555 timer category confirmed — all packaged oscillator candidates (XO, MEMS, TCXO, VCXO, OCXO) are architecturally incompatible. A timer IC requires external R/C to set timing; an oscillator has an internal resonator. No cross-category substitution possible.' },
            { attributeId: 'output_frequency_hz', effect: 'not_applicable', note: '555 timer — frequency is set by external R and C values (f = 1.44 / ((R1 + 2R2) × C) for astable mode), not by the IC itself.' },
            { attributeId: 'output_signal_type', effect: 'not_applicable', note: '555 timer — output is push-pull (CMOS) or totem-pole (bipolar), not a clock signal type (CMOS/TTL/LVDS/LVPECL).' },
            { attributeId: 'vcxo_pull_range_ppm', effect: 'not_applicable', note: '555 timer — no voltage-controlled frequency; not applicable.' },
            { attributeId: 'initial_tolerance_ppm', effect: 'not_applicable', note: '555 timer — no internal frequency reference; tolerance is determined by external R/C component values.' },
            { attributeId: 'temp_stability_ppm', effect: 'not_applicable', note: '555 timer — temperature stability is determined by external R/C components, not the IC.' },
            { attributeId: 'aging_ppm_per_year', effect: 'not_applicable', note: '555 timer — no internal resonator to age.' },
            { attributeId: 'phase_jitter_ps_rms', effect: 'not_applicable', note: '555 timer — jitter spec is not applicable for timer ICs.' },
            { attributeId: 'oe_polarity', effect: 'not_applicable', note: '555 timer — no output enable pin; output is controlled by trigger/reset pins.' },
            { attributeId: 'crystal_load_cap_pf', effect: 'not_applicable', note: '555 timer — no crystal.' },
          ],
        },
        {
          value: 'xo',
          label: 'Packaged Crystal Oscillator (XO)',
          description: 'All 555, TCXO, VCXO, OCXO candidates blocked unless stability class matches. Standard stability ±25–100 ppm over temperature. output_frequency_hz becomes mandatory + blockOnMissing. MEMS oscillators are accepted as valid cross-substitutions with Application Review flag.',
          attributeEffects: [
            { attributeId: 'device_category', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: Crystal oscillator (XO) — all 555 timers, TCXOs, VCXOs, and OCXOs blocked. MEMS oscillators accepted with Application Review (valid drop-in if frequency, supply, and output type match).' },
            { attributeId: 'output_frequency_hz', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'XO — exact frequency match required. 10.000 MHz ≠ 10.240 MHz. 32.768 kHz ≠ 32.000 kHz. Missing frequency data is unacceptable.' },
            { attributeId: 'timer_variant', effect: 'not_applicable', note: 'Crystal oscillator — CMOS/bipolar timer variant is not applicable.' },
            { attributeId: 'vcxo_pull_range_ppm', effect: 'not_applicable', note: 'Crystal oscillator — not voltage-controlled; pull range is not applicable.' },
            { attributeId: 'crystal_load_cap_pf', effect: 'not_applicable', note: 'Packaged oscillator — crystal load capacitance is internal to the module.' },
          ],
        },
        {
          value: 'mems',
          label: 'MEMS Oscillator (SiT8008, DSC1001, SiT8918)',
          description: 'Same matching rules as XO. MEMS replacements for crystal XO are valid drop-in substitutions if frequency, supply, and output type match — the one permitted cross-category substitution. Note MEMS-specific behavioral differences: faster startup (<1 ms vs 2–10 ms for crystal XO), lower current (1–5 mA vs 10–30 mA), better vibration/shock immunity, different phase noise signature.',
          attributeEffects: [
            { attributeId: 'device_category', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: MEMS oscillator — all 555 timers, TCXOs, VCXOs, and OCXOs blocked. Crystal XO accepted with Application Review (valid cross-substitution). Note MEMS-specific differences: faster startup, lower current, better vibration immunity, different phase noise signature (flatter close-in noise, different 1/f corner).' },
            { attributeId: 'output_frequency_hz', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'MEMS oscillator — exact frequency match required. Missing frequency data is unacceptable.' },
            { attributeId: 'timer_variant', effect: 'not_applicable', note: 'MEMS oscillator — timer variant is not applicable.' },
            { attributeId: 'vcxo_pull_range_ppm', effect: 'not_applicable', note: 'MEMS oscillator — not voltage-controlled (unless MEMS-VCXO variant).' },
            { attributeId: 'crystal_load_cap_pf', effect: 'not_applicable', note: 'Packaged oscillator — crystal load capacitance is not applicable.' },
          ],
        },
        {
          value: 'tcxo',
          label: 'TCXO (Temperature Compensated Crystal Oscillator)',
          description: 'XO and OCXO candidates blocked (wrong stability class). TCXO stability (±0.5–5 ppm) is THE specification — it is why this class was selected. temp_stability_ppm escalated to mandatory. MEMS-TCXO variants are acceptable substitutions with Application Review.',
          attributeEffects: [
            { attributeId: 'device_category', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: TCXO — all 555 timers, uncompensated XOs, VCXOs, and OCXOs blocked. XO cannot achieve TCXO-class stability (±0.5–5 ppm vs ±25–100 ppm). MEMS-TCXO variants acceptable with Application Review.' },
            { attributeId: 'output_frequency_hz', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'TCXO — exact frequency match required.' },
            { attributeId: 'temp_stability_ppm', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: TCXO — temperature stability is the defining specification. A TCXO achieving ±2.5 ppm cannot be replaced by one achieving only ±5 ppm if the protocol error budget requires ±2.5 ppm.' },
            { attributeId: 'aging_ppm_per_year', effect: 'escalate_to_primary', note: 'TCXO — aging rate is important for long-deployment systems without recalibration.' },
            { attributeId: 'timer_variant', effect: 'not_applicable', note: 'TCXO — timer variant is not applicable.' },
            { attributeId: 'vcxo_pull_range_ppm', effect: 'not_applicable', note: 'TCXO — not voltage-controlled.' },
            { attributeId: 'crystal_load_cap_pf', effect: 'not_applicable', note: 'Packaged oscillator — crystal load capacitance is internal.' },
          ],
        },
        {
          value: 'vcxo',
          label: 'VCXO (Voltage Controlled Crystal Oscillator)',
          description: 'Fixed-frequency XO/TCXO candidates blocked — cannot replace a voltage-controlled device. vcxo_pull_range_ppm escalated to mandatory + blockOnMissing. Pull range must support the full frequency offset required by the PLL. Pull sensitivity (ppm/V) mismatch > 2× affects PLL loop dynamics — flag as Application Review.',
          attributeEffects: [
            { attributeId: 'device_category', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: VCXO — all 555 timers, fixed-frequency XOs, TCXOs, and OCXOs blocked. A fixed-frequency oscillator cannot replace a voltage-controlled device — the PLL control voltage has nothing to pull.' },
            { attributeId: 'output_frequency_hz', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'VCXO — center (nominal) frequency must match exactly. Pull range is captured separately.' },
            { attributeId: 'vcxo_pull_range_ppm', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: VCXO pull range must support the full PLL frequency offset. A PLL needing ±30 ppm for temperature tracking + ±10 ppm for reference offset cannot lock if replacement pulls only ±20 ppm. Failure is temperature-dependent — manifests at extremes, not on the bench.' },
            { attributeId: 'timer_variant', effect: 'not_applicable', note: 'VCXO — timer variant is not applicable.' },
            { attributeId: 'crystal_load_cap_pf', effect: 'not_applicable', note: 'Packaged oscillator — crystal load capacitance is internal.' },
          ],
        },
        {
          value: 'ocxo',
          label: 'OCXO (Oven Controlled Crystal Oscillator)',
          description: 'All non-OCXO candidates blocked — TCXO cannot provide OCXO-class stability (±0.01–0.1 ppm). temp_stability_ppm and aging_ppm_per_year both escalated to mandatory. icc_active_ma escalated to primary (OCXO oven heater is the dominant power concern: 100–400 mW warm-up, 30–100 mW steady state). startup_time_ms escalated to primary (30 seconds to 5 minutes warm-up).',
          attributeEffects: [
            { attributeId: 'device_category', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: OCXO — all 555 timers, XOs, MEMS, TCXOs, and VCXOs blocked. TCXO achieves ±0.5–5 ppm; OCXO achieves ±0.01–0.1 ppm. No non-OCXO device can meet OCXO stability requirements.' },
            { attributeId: 'output_frequency_hz', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'OCXO — exact frequency match required.' },
            { attributeId: 'temp_stability_ppm', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: OCXO — temperature stability is the defining specification. OCXO thermal oven maintains the crystal at a constant temperature, achieving stabilities impossible without active temperature control.' },
            { attributeId: 'aging_ppm_per_year', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: OCXO — aging rate determines calibration interval for metrology and communication timing applications.' },
            { attributeId: 'icc_active_ma', effect: 'escalate_to_primary', note: 'OCXO — oven heater draws 100–400 mW during warm-up and 30–100 mW steady state. Verify the power budget can accommodate OCXO-class current draw. A design that power-cycles the oscillator supply will never allow the OCXO to stabilize.' },
            { attributeId: 'startup_time_ms', effect: 'escalate_to_primary', note: 'OCXO — warm-up time ranges from 30 seconds to 5 minutes. System must remain operational during this period or accept degraded stability until the oven reaches operating temperature.' },
            { attributeId: 'timer_variant', effect: 'not_applicable', note: 'OCXO — timer variant is not applicable.' },
            { attributeId: 'vcxo_pull_range_ppm', effect: 'not_applicable', note: 'OCXO — not voltage-controlled (OCXO-VCXO hybrids exist but are rare; treat as OCXO primary).' },
            { attributeId: 'crystal_load_cap_pf', effect: 'not_applicable', note: 'Packaged oscillator — crystal load capacitance is internal.' },
          ],
        },
      ],
    },

    // Q2: Frequency accuracy / stability requirement
    {
      questionId: 'frequency_requirement',
      questionText: 'What is the frequency accuracy / stability requirement of the application?',
      priority: 2,
      options: [
        {
          value: 'comms',
          label: 'Communications / protocol timing (Bluetooth, Wi-Fi, cellular, GPS, USB HS, Ethernet)',
          description: 'Protocol-specific frequency accuracy requirements. USB HS: ±100 ppm total; Bluetooth: ±20 ppm; Ethernet: ±100 ppm; cellular: ±0.1 ppm. initial_tolerance_ppm and temp_stability_ppm escalated to mandatory + blockOnMissing. Phase jitter escalated to primary.',
          attributeEffects: [
            { attributeId: 'initial_tolerance_ppm', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: Communications — initial tolerance must meet protocol-specific limit. USB HS: ±100 ppm total budget; Bluetooth: ±20 ppm; Ethernet: ±100 ppm. Missing tolerance data is unacceptable for comms applications.' },
            { attributeId: 'temp_stability_ppm', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: Communications — temperature stability is part of the total error budget. At Bluetooth ±20 ppm: if initial tolerance is ±10 ppm, only ±10 ppm remains for temperature drift across the full range. Missing stability data is unacceptable.' },
            { attributeId: 'aging_ppm_per_year', effect: 'escalate_to_primary', note: 'Communications — aging contributes to total error budget over product lifetime. GPS receivers with 10-year deployment need aging < 1 ppm/year.' },
            { attributeId: 'phase_jitter_ps_rms', effect: 'escalate_to_primary', note: 'Communications — jitter affects bit error rate for high-speed protocols. Verify jitter at the protocol-specific integration bandwidth.' },
          ],
        },
        {
          value: 'precision',
          label: 'Precision / instrumentation (ADC sampling clock, metrology, calibration)',
          description: 'All frequency-related specifications become primary. Tolerance, stability, aging, and phase jitter are all important for precision measurement systems. ADC clock jitter directly limits achievable ENOB.',
          attributeEffects: [
            { attributeId: 'initial_tolerance_ppm', effect: 'escalate_to_primary', note: 'Precision — initial tolerance affects measurement accuracy at room temperature.' },
            { attributeId: 'temp_stability_ppm', effect: 'escalate_to_primary', note: 'Precision — temperature drift affects measurement repeatability across operating conditions.' },
            { attributeId: 'aging_ppm_per_year', effect: 'escalate_to_primary', note: 'Precision — aging determines calibration interval. A 5 ppm/year reference exceeds a 1 ppm annual drift budget within the first year.' },
            { attributeId: 'phase_jitter_ps_rms', effect: 'escalate_to_primary', note: 'Precision — ADC clock jitter limits ENOB: SNR = -20·log10(2π·f_input·jitter_rms). At 100 MHz input, 1 ps RMS → ~64 dB SNR (~10.4 ENOB).' },
          ],
        },
        {
          value: 'serdes',
          label: 'High-speed digital / SerDes (DDR memory, PCIe, SATA, USB HS)',
          description: 'Phase jitter is the dominant specification. DDR3: ≤10 ps RMS; PCIe Gen1: ≤25 ps RMS; USB HS: ≤200 ps peak-to-peak. Duty cycle asymmetry closes the timing eye. Tolerance and stability are secondary — SerDes protocols tolerate ±100 ppm or more.',
          attributeEffects: [
            { attributeId: 'phase_jitter_ps_rms', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: SerDes — phase jitter determines timing margin. DDR3: ≤10 ps RMS; PCIe Gen1: ≤25 ps RMS; USB HS: ≤200 ps peak-to-peak. Missing jitter data is unacceptable for SerDes clocking.' },
            { attributeId: 'duty_cycle_pct', effect: 'escalate_to_primary', note: 'SerDes — asymmetric duty cycle closes the timing eye. DDR and PCIe require 45–55% duty cycle. A 60/40 duty cycle loses ~10% of the available timing margin.' },
          ],
        },
        {
          value: 'general',
          label: 'General digital / microcontroller clock (UART, SPI, I2C, general timing)',
          description: 'Default weights apply. Tolerance and stability are secondary — UART/SPI/I2C protocols tolerate ±500 ppm or more. XO substitution for TCXO is acceptable with Application Review note.',
          attributeEffects: [],
        },
      ],
    },

    // Q3: Battery-powered / power-constrained?
    {
      questionId: 'battery_application',
      questionText: 'Is this a battery-powered or power-constrained application?',
      priority: 3,
      options: [
        {
          value: 'yes',
          label: 'Yes — battery powered, energy harvested, or tight power budget',
          description: 'Active current, standby current, and startup time all become primary specifications. For OCXO candidates: add review flag noting oven heater current (100–400 mW warm-up) may exceed the entire system power budget. Standby behavior matters: full shutdown (slow restart) vs output tri-state (fast restart).',
          attributeEffects: [
            { attributeId: 'icc_active_ma', effect: 'escalate_to_primary', note: 'Battery application — active current directly affects battery life. Crystal XO: 10–30 mA; MEMS: 1–5 mA; TCXO: 1–10 mA; OCXO: 100–400 mA during warm-up. MEMS oscillators offer significant current advantage over crystal XOs.' },
            { attributeId: 'icc_standby_ua', effect: 'escalate_to_primary', note: 'Battery application — standby current dominates in sleep-heavy duty cycles. Distinguish tri-state (output high-Z, fast restart) vs full-shutdown (oscillator stopped, slow restart requiring full startup time).' },
            { attributeId: 'startup_time_ms', effect: 'escalate_to_primary', note: 'Battery application — startup time affects average power in frequent sleep/wake cycles. MEMS: <1 ms; Crystal XO: 2–10 ms; OCXO: 30 sec–5 min. Frequent sleep/wake with OCXO means perpetual warm-up mode with unspecified stability.' },
          ],
        },
        {
          value: 'no',
          label: 'No — mains-powered or power not constrained',
          description: 'Default weights apply. Active and standby current are secondary specifications.',
          attributeEffects: [],
        },
      ],
    },

    // Q4: Automotive — AEC-Q100 gate
    {
      questionId: 'automotive',
      questionText: 'Is this an automotive design requiring AEC-Q100?',
      priority: 4,
      options: [
        {
          value: 'yes',
          label: 'Yes — automotive (AEC-Q100 required)',
          description: 'AEC-Q100 becomes mandatory. Non-automotive-qualified parts removed from candidate pool. Operating temperature range must cover −40°C to +125°C minimum (Grade 1). For MEMS oscillators: verify AEC-Q100 grade includes vibration characterization — not all AEC-Q100 MEMS oscillators are characterized for automotive vibration profiles.',
          attributeEffects: [
            { attributeId: 'aec_q100', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: Automotive — AEC-Q100 required. Non-automotive parts removed from results. For MEMS: verify AEC-Q100 grade includes vibration characterization per automotive profiles.' },
            { attributeId: 'operating_temp_range', effect: 'escalate_to_mandatory', note: 'Automotive — must cover −40°C to +125°C minimum (Grade 1). Commercial-grade oscillators (−20°C to +70°C) will not maintain rated stability at automotive temperature extremes. TCXO stability specifications defined over this range become unspecified outside it.' },
          ],
        },
        {
          value: 'no',
          label: 'No',
          description: 'Standard qualification matching. AEC-Q100 is operational — presence is informational but not required.',
          attributeEffects: [],
        },
      ],
    },
  ],
};
