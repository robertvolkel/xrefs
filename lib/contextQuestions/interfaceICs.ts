import { FamilyContextConfig } from '../types';

/**
 * Interface ICs — RS-485, CAN, I2C, USB (Family C7)
 * Block C: Standard ICs
 *
 * 4 context questions:
 * 1. Protocol — RS-485 / CAN / I2C / USB (BLOCKING — the #1 interface IC substitution error)
 * 2. Isolation — galvanic isolation required? (BLOCKING for safety-rated systems)
 * 3. Environment — industrial / automotive / consumer (escalates bus protection, ESD, standby)
 * 4. Automotive — AEC-Q100 gate
 *
 * Context sensitivity: moderate-high
 * Protocol is the first and hardest gate. RS-485 differential voltage signaling, CAN
 * dominant/recessive arbitration, I2C open-drain with pull-ups, and USB differential
 * pairs are fundamentally incompatible — no cross-protocol substitution is possible
 * without circuit redesign.
 *
 * Within each protocol, the bifurcation between isolated and non-isolated is the most
 * dangerous substitution error after protocol mismatch: a non-isolated device cannot
 * replace an isolated one in a safety-rated system — the isolation is a structural
 * safety measure, not a performance preference.
 *
 * Context-driven suppression pattern (like B8 Thyristors): Q1 suppresses
 * protocol-irrelevant attributes via `not_applicable` effects (~9 for I2C/USB,
 * ~5 for CAN, ~2 for RS-485).
 */
export const interfaceICsContext: FamilyContextConfig = {
  familyIds: ['C7'],
  contextSensitivity: 'high',
  questions: [
    // Q1: Protocol — THE critical question, BLOCKING gate
    {
      questionId: 'interface_protocol',
      questionText: 'What is the interface protocol?',
      priority: 1,
      options: [
        {
          value: 'rs485',
          label: 'RS-485 / RS-422 (differential transceiver — MAX485, ADM485, SN75176)',
          description: 'RS-485 uses differential voltage signaling on A/B bus pairs with half-duplex (shared pair, DE/RE direction control) or full-duplex RS-422 (separate TX/RX pairs). Key specs: data rate (250 kbps slew-limited to 50 Mbit/s), bus fault protection (±15 V standard, ±60 V industrial), unit loads (network capacity), failsafe receiver (bus-idle detection), DE polarity, and slew rate class (EMI compliance). All CAN, I2C, and USB candidates are BLOCKED.',
          attributeEffects: [
            { attributeId: 'protocol', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: RS-485 protocol confirmed. CAN, I2C, and USB transceivers use fundamentally different signaling standards, bus arbitration, and termination — no cross-protocol substitution without circuit redesign.' },
            // Suppress CAN-only attributes
            { attributeId: 'can_variant', effect: 'not_applicable', note: 'RS-485 — CAN variant (classical/FD) not applicable.' },
            { attributeId: 'txd_dominant_timeout', effect: 'not_applicable', note: 'RS-485 — TXD dominant timeout is a CAN-only safety feature.' },
          ],
        },
        {
          value: 'can',
          label: 'CAN / CAN FD (bus transceiver — TJA1042, MCP2551, SN65HVD230)',
          description: 'CAN uses dominant/recessive arbitration on a single differential pair (CANH/CANL). Classical CAN: ≤1 Mbit/s, loop delay ≤255 ns. CAN FD: data phase ≤8 Mbit/s, loop delay ≤140 ns. Key specs: CAN variant (classical vs FD), TXD dominant timeout (bus-jamming protection), bus fault protection (±70 V automotive), standby current (ECU quiescent budget). All RS-485, I2C, and USB candidates are BLOCKED.',
          attributeEffects: [
            { attributeId: 'protocol', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: CAN protocol confirmed. RS-485, I2C, and USB transceivers are fundamentally incompatible — different signaling, arbitration, and termination.' },
            // Suppress RS-485-only attributes
            { attributeId: 'de_polarity', effect: 'not_applicable', note: 'CAN — DE polarity (driver enable direction control) is RS-485-specific.' },
            { attributeId: 'failsafe_receiver', effect: 'not_applicable', note: 'CAN — failsafe receiver biasing is RS-485-specific (bus-idle detection).' },
            { attributeId: 'unit_loads', effect: 'not_applicable', note: 'CAN — unit loads (bus loading) is RS-485-specific.' },
            { attributeId: 'common_mode_range', effect: 'not_applicable', note: 'CAN — separate common-mode range rule is RS-485-specific. CAN CM is part of receiver_threshold_cm.' },
            // Escalate propagation delay for CAN FD timing budget
            { attributeId: 'propagation_delay', effect: 'escalate_to_primary', note: 'CAN — propagation delay is critical for CAN FD timing budget. At 2 Mbit/s: ≤140 ns; at 5 Mbit/s: ≤120 ns. Classical CAN at 1 Mbit/s: ≤255 ns.' },
          ],
        },
        {
          value: 'i2c',
          label: 'I2C / SMBus (bus buffer / isolator — PCA9600, P82B96, ISO1540)',
          description: 'I2C uses open-drain SDA/SCL lines with external pull-ups. Speed grades: Standard 100 kbps, Fast 400 kbps, Fast-mode Plus (Fm+) 1 Mbit/s, High-speed (Hs) 3.4 Mbit/s. I2C bus buffers and isolators extend bus capacitance limits or provide galvanic isolation. Most RS-485 and CAN bus-level specs do not apply. All RS-485, CAN, and USB candidates are BLOCKED.',
          attributeEffects: [
            { attributeId: 'protocol', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: I2C protocol confirmed. RS-485, CAN, and USB transceivers are fundamentally incompatible.' },
            // Suppress RS-485-only attributes
            { attributeId: 'de_polarity', effect: 'not_applicable', note: 'I2C — DE polarity is RS-485-specific.' },
            { attributeId: 'failsafe_receiver', effect: 'not_applicable', note: 'I2C — failsafe receiver is RS-485-specific.' },
            { attributeId: 'unit_loads', effect: 'not_applicable', note: 'I2C — unit loads is RS-485-specific.' },
            { attributeId: 'common_mode_range', effect: 'not_applicable', note: 'I2C — separate common-mode range is RS-485-specific.' },
            { attributeId: 'slew_rate_class', effect: 'not_applicable', note: 'I2C — slew rate class (EMI compliance) is RS-485-specific.' },
            // Suppress CAN-only attributes
            { attributeId: 'can_variant', effect: 'not_applicable', note: 'I2C — CAN variant is CAN-specific.' },
            { attributeId: 'txd_dominant_timeout', effect: 'not_applicable', note: 'I2C — TXD dominant timeout is CAN-specific.' },
            // Suppress bus-level specs not applicable to I2C
            { attributeId: 'vod_differential', effect: 'not_applicable', note: 'I2C — differential output voltage is RS-485/CAN-specific. I2C uses open-drain with external pull-ups.' },
            { attributeId: 'receiver_threshold_cm', effect: 'not_applicable', note: 'I2C — receiver threshold/CM range is RS-485/CAN-specific.' },
          ],
        },
        {
          value: 'usb',
          label: 'USB (signal conditioning / ESD protection — TPD4S012, USBLC6)',
          description: 'USB interface ICs cover ESD/signal-conditioning devices on D+/D- lines. Speed grades: Full-Speed (FS) 12 Mbit/s, High-Speed (HS) 480 Mbit/s, SuperSpeed (SS) 5 Gbit/s. Most bus-level transceiver specs from RS-485 and CAN do not apply. All RS-485, CAN, and I2C candidates are BLOCKED.',
          attributeEffects: [
            { attributeId: 'protocol', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: USB protocol confirmed. RS-485, CAN, and I2C transceivers are fundamentally incompatible.' },
            // Suppress RS-485-only attributes
            { attributeId: 'de_polarity', effect: 'not_applicable', note: 'USB — DE polarity is RS-485-specific.' },
            { attributeId: 'failsafe_receiver', effect: 'not_applicable', note: 'USB — failsafe receiver is RS-485-specific.' },
            { attributeId: 'unit_loads', effect: 'not_applicable', note: 'USB — unit loads is RS-485-specific.' },
            { attributeId: 'common_mode_range', effect: 'not_applicable', note: 'USB — separate common-mode range is RS-485-specific.' },
            { attributeId: 'slew_rate_class', effect: 'not_applicable', note: 'USB — slew rate class is RS-485-specific.' },
            // Suppress CAN-only attributes
            { attributeId: 'can_variant', effect: 'not_applicable', note: 'USB — CAN variant is CAN-specific.' },
            { attributeId: 'txd_dominant_timeout', effect: 'not_applicable', note: 'USB — TXD dominant timeout is CAN-specific.' },
            // Suppress bus-level specs not applicable to USB signal conditioning
            { attributeId: 'vod_differential', effect: 'not_applicable', note: 'USB — differential output voltage is RS-485/CAN transceiver-specific.' },
            { attributeId: 'receiver_threshold_cm', effect: 'not_applicable', note: 'USB — receiver threshold/CM range is RS-485/CAN-specific.' },
          ],
        },
      ],
    },

    // Q2: Isolation — second most dangerous substitution error
    {
      questionId: 'isolation_required',
      questionText: 'Is galvanic isolation required?',
      priority: 2,
      options: [
        {
          value: 'isolated',
          label: 'Yes — isolated transceiver required (safety-rated system, ground-fault protection)',
          description: 'Isolated RS-485/CAN/I2C transceivers integrate a galvanic isolation barrier with dedicated bus-side supply (VCC2). A non-isolated transceiver has no isolation barrier and no VCC2 — it cannot substitute for an isolated device in a safety-certified system. Both supply domains (host-side VCC1 and bus-side VCC2) must be verified. Isolation working voltage (VIORM) must cover fault-condition CM voltage.',
          attributeEffects: [
            { attributeId: 'isolation_type', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: Isolated transceiver required. Non-isolated candidates cannot substitute — the galvanic isolation barrier is a structural safety measure. Verify isolation technology (capacitive vs transformer) and certification class (basic, reinforced, functional).' },
            { attributeId: 'isolation_working_voltage', effect: 'escalate_to_mandatory', note: 'Isolated application — VIORM must equal or exceed the actual fault-condition CM voltage. For reinforced insulation per IEC 62368-1 at 300 V working voltage, VIORM ≥ 840 Vpeak required.' },
            { attributeId: 'package_case', effect: 'escalate_to_primary', note: 'Isolated transceiver — isolated packages (SOIC-16W, SMD-16) are physically incompatible with standard SOIC-8 footprint. Verify package compatibility and creepage/clearance distances.' },
          ],
        },
        {
          value: 'non_isolated',
          label: 'No — non-isolated acceptable',
          description: 'Standard non-isolated transceiver. Isolated replacements are technically acceptable as upgrades (superset capability) but may require dual-supply (VCC2) infrastructure that does not exist on a single-supply PCB.',
          attributeEffects: [],
        },
      ],
    },

    // Q3: Operating environment — determines bus protection and ESD severity
    {
      questionId: 'operating_environment',
      questionText: 'What is the operating environment?',
      priority: 3,
      options: [
        {
          value: 'industrial',
          label: 'Industrial field wiring (exposed connectors, long cable runs >100 m)',
          description: 'Industrial environments with RS-485 in conduit, CAN in control panels, exposed connectors, and long cable runs demand higher bus fault protection (±60 V), ESD immunity (±8 kV IEC 61000-4-2 Level 4), extended CM range (−25 V to +25 V), EMI-compliant slew rate limiting, and higher differential output voltage for margin on long cables.',
          attributeEffects: [
            { attributeId: 'bus_fault_protection', effect: 'escalate_to_primary', note: 'Industrial — bus fault protection ≥±60 V required for field wiring environments (IEC 61000-4-5 surge). Standard ±15 V is insufficient for exposed connectors and long cable runs between separately grounded equipment.' },
            { attributeId: 'esd_bus_pins', effect: 'escalate_to_primary', note: 'Industrial — ESD rating ≥±8 kV (IEC 61000-4-2 Level 4 contact discharge) required for bus pins connecting to field wiring and external connectors.' },
            { attributeId: 'common_mode_range', effect: 'escalate_to_primary', note: 'Industrial — extended CM range (−25 V to +25 V) preferred for multi-panel systems with ground shifts between separately grounded equipment.' },
            { attributeId: 'slew_rate_class', effect: 'escalate_to_primary', note: 'Industrial — slew-rate-limited transceivers required for RS-485 at moderate speeds (≤1 Mbit/s) to meet CE/FCC radiated emissions requirements in industrial environments.' },
            { attributeId: 'vod_differential', effect: 'escalate_to_primary', note: 'Industrial — higher differential output voltage needed for noise margin on long cable runs with high attenuation.' },
          ],
        },
        {
          value: 'automotive',
          label: 'Automotive (ECU, BCM, gateway, underhood)',
          description: 'Automotive environments require ISO 7637 compliance (load dump, supply transients), AEC-Q100 qualification (see Q4), and strict quiescent current budgets. CAN bus fault protection must be ≥±70 V for ISO 7637 load dump compliance.',
          attributeEffects: [
            { attributeId: 'bus_fault_protection', effect: 'escalate_to_primary', note: 'Automotive — CAN bus fault protection ≥±70 V (or ±80 V) required for ISO 7637 load dump compliance in vehicle wiring harness.' },
            { attributeId: 'standby_current', effect: 'escalate_to_primary', note: 'Automotive — CAN transceivers spend most of their lifetime in standby/sleep. Transceiver standby current ranges from 5 µA (TJA1042T) to tens of µA. Quiescent budget directly affects vehicle battery drain during key-off.' },
          ],
        },
        {
          value: 'consumer',
          label: 'Consumer / light industrial (protected environment, short cable <10 m)',
          description: 'Protected environment with short cable runs. Standard parametric matching with minimum bus fault protection (±15 V) and reduced ESD requirement (±4 kV acceptable).',
          attributeEffects: [],
        },
      ],
    },

    // Q4: Automotive — AEC-Q100 gate
    {
      questionId: 'automotive',
      questionText: 'Is this an automotive design (AEC-Q100 required)?',
      priority: 4,
      options: [
        {
          value: 'yes',
          label: 'Yes — automotive (AEC-Q100 required)',
          description: 'AEC-Q100 becomes mandatory. Non-automotive-qualified parts cannot substitute regardless of electrical match. Temperature range must cover −40°C to +125°C minimum (AEC-Q100 Grade 1). CAN transceivers in automotive ECU, BCM, and gateway designs are always AEC-Q100 qualified. RS-485 in automotive is less common but follows the same qualification requirements.',
          attributeEffects: [
            { attributeId: 'aec_q100', effect: 'escalate_to_mandatory', blockOnMissing: true, note: 'BLOCKING: Automotive — AEC-Q100 qualification is required. Non-qualified parts are rejected regardless of electrical compatibility. Covers HTOL at Tj_max, ELFR, ESD to AEC levels, and latch-up screening.' },
            { attributeId: 'operating_temp', effect: 'escalate_to_mandatory', note: 'Automotive — must cover −40°C to +125°C minimum (AEC-Q100 Grade 1). Industrial-grade (−40°C to +85°C) parts violate the qualification boundary regardless of temp range adequacy.' },
            { attributeId: 'standby_current', effect: 'escalate_to_primary', note: 'Automotive — ECU quiescent budget. Transceiver standby current directly affects vehicle battery drain during key-off. Every µA counts in a vehicle with dozens of CAN nodes.' },
            { attributeId: 'bus_fault_protection', effect: 'escalate_to_primary', note: 'Automotive — CAN bus fault protection ≥±70 V required for ISO 7637 load dump compliance.' },
          ],
        },
        {
          value: 'no',
          label: 'No',
          description: 'Standard environmental matching. AEC-Q100 is operational — presence is informational but not required.',
          attributeEffects: [],
        },
      ],
    },
  ],
};
