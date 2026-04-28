import { LogicTable } from '../types';

/**
 * Interface ICs — RS-485, CAN, I2C, USB
 * Block C: Standard ICs — Family C7
 *
 * Derived from: docs/c7_interface_ics_logic.docx
 * 22 attributes with specific matching rules for cross-reference validation.
 *
 * Seventh family in Block C. Covers RS-485/RS-422 transceivers (MAX485, ADM485,
 * SN75176, THVD1450), CAN/CAN FD transceivers (TJA1042, MCP2551, SN65HVD230,
 * ISO1042), I2C bus buffers and isolators (PCA9600, P82B96, ISO1540, ADuM1250),
 * and USB signal-conditioning ICs (TPD4S012, USBLC6). Key substitution pitfalls:
 *
 * - Protocol is the HARD GATE. RS-485 differential voltage signaling, CAN
 *   dominant/recessive arbitration, I2C open-drain with pull-ups, and USB
 *   differential pairs are fundamentally incompatible — no cross-protocol
 *   substitution is possible without circuit redesign.
 * - Operating mode (half-duplex vs full-duplex) for RS-485: half-duplex uses
 *   shared A/B pair with DE/RE direction control; full-duplex RS-422 uses
 *   separate TX and RX pairs with no DE pin — pin-incompatible.
 * - Isolation is the second HARD GATE: a non-isolated device cannot replace an
 *   isolated one in a safety-rated system — the isolation is a structural safety
 *   measure, not a performance preference.
 * - CAN FD vs classical CAN: CAN FD transceivers support data-phase rates
 *   >1 Mbit/s with tighter loop delay (<140 ns). Classical CAN transceivers
 *   fail the CAN FD timing budget above ~1.5 Mbit/s data phase.
 * - DE polarity inversion is a functional failure: active-high DE with active-low
 *   /DE circuit = transmit when receiving and vice versa.
 * - SN65HVD collision: SN65HVD0xx/1xx = RS-485, SN65HVD2xx = CAN.
 *
 * Related families: Gate Drivers (C3) — share isolation concept; TVS Diodes (B4)
 * — bus ESD protection devices; Common Mode Chokes (69) — placed on RS-485 and
 * CAN bus pairs for EMI.
 */
export const interfaceICsLogicTable: LogicTable = {
  familyId: 'C7',
  familyName: 'Interface ICs (RS-485, CAN, I2C, USB)',
  category: 'Integrated Circuits',
  description: 'Hard logic filters for interface IC replacement validation — protocol is a BLOCKING gate before any parametric evaluation',
  rules: [
    // ============================================================
    // IDENTITY — Protocol, Operating Mode, DE Polarity
    // ============================================================
    {
      attributeId: 'protocol',
      attributeName: 'Protocol / Interface Standard',
      logicType: 'identity',
      weight: 10,
      blockOnMissing: true,
      engineeringReason: 'Protocol must match exactly. RS-485, CAN, I2C, and USB transceivers use fundamentally different signaling standards, bus arbitration mechanisms, and termination strategies. No cross-protocol substitution is possible without redesigning the interface circuit. Post-scoring filter removes confirmed protocol mismatches.',
      sortOrder: 1,
      valueAliases: [
        [
          'RS-232', 'RS232', 'EIA-232', 'EIA-232-E', 'EIA-232-F', 'TIA-232',
          'TIA-232-E', 'TIA-232-F', 'V.28',
          'EIA-232-F; TIA-232-F; V.28', 'EIA-232-E; TIA-232-E; V.28',
          'EIA-232; TIA-232; V.28', 'EIA-232-F; V.28', 'EIA-232-E; TIA-232-E',
        ],
        ['RS-485', 'RS485', 'EIA-485', 'TIA-485'],
        ['RS-422', 'RS422', 'EIA-422', 'TIA-422'],
        ['I²C', 'I2C', 'IIC', 'Inter-Integrated Circuit'],
        ['CAN', 'CAN Bus', 'Controller Area Network'],
        ['CAN FD', 'CAN-FD', 'CAN Flexible Data-Rate'],
      ],
    },
    {
      attributeId: 'operating_mode',
      attributeName: 'Operating Mode / Driver Topology',
      logicType: 'identity',
      weight: 9,
      blockOnMissing: true,
      engineeringReason: 'Half-duplex RS-485 uses one differential pair with DE/RE direction control. Full-duplex RS-422 uses separate TX and RX pairs with no DE pin. Substituting half-duplex into full-duplex footprint leaves the RX pair undriven. Isolated vs non-isolated is also a hard gate — galvanically isolated devices have two supply domains.',
      sortOrder: 3,
    },
    {
      attributeId: 'de_polarity',
      attributeName: 'Driver Enable / Direction Control Polarity',
      logicType: 'identity',
      weight: 8,
      blockOnMissing: true,
      engineeringReason: 'DE polarity is a hard Identity gate. Standard half-duplex RS-485: DE active-high (pin 3), /RE active-low (pin 2). If original has active-low DE and replacement uses active-high DE, direction control is inverted — the MCU drives high expecting to transmit but the replacement receives. Uses identity (not identity_flag) because polarity mismatch in either direction is fatal.',
      sortOrder: 7,
    },

    // ============================================================
    // IDENTITY FLAGS — Isolation, CAN Variant, Failsafe, TXD Timeout, AEC-Q100
    // ============================================================
    {
      attributeId: 'isolation_type',
      attributeName: 'Galvanic Isolation Type',
      logicType: 'identity_flag',
      weight: 8,
      engineeringReason: 'If the original is an isolated transceiver, the replacement must also be isolated. Isolated RS-485/CAN/I2C integrate a galvanic isolation barrier with dedicated bus-side supply (VCC2). A non-isolated transceiver has no isolation barrier and no VCC2 — it cannot substitute for an isolated device. Escalated to w10+blockOnMissing if Q2=isolated.',
      sortOrder: 4,
    },
    {
      attributeId: 'can_variant',
      attributeName: 'CAN Standard Variant / USB Speed Grade',
      logicType: 'identity_flag',
      weight: 8,
      engineeringReason: 'CAN FD transceivers support data-phase rates >1 Mbit/s with tighter loop delay (<140 ns at 2 Mbit/s, <120 ns at 5 Mbit/s). Classical CAN transceivers are specified at ≤255 ns loop delay — they fail the CAN FD timing budget. A classical CAN transceiver cannot support CAN FD data phase rates. For USB: speed grade (FS/HS/SS) is a hard gate.',
      sortOrder: 6,
    },
    {
      attributeId: 'failsafe_receiver',
      attributeName: 'Failsafe Receiver Behavior',
      logicType: 'identity_flag',
      weight: 6,
      engineeringReason: 'When no driver is active on RS-485 bus, differential voltage is ~0 V — within the ±200 mV indeterminate zone. Without failsafe biasing, receiver oscillates producing garbage characters during idle periods. Required for Modbus RTU, DMX-512, and any UART-framed RS-485 protocol that relies on idle = Mark state for start-of-frame detection.',
      sortOrder: 8,
    },
    {
      attributeId: 'txd_dominant_timeout',
      attributeName: 'TXD Dominant Timeout / Bus Watchdog',
      logicType: 'identity_flag',
      weight: 7,
      engineeringReason: 'CAN only. If TXD is held low (dominant) by a software fault, the transceiver jams the entire CAN bus. TXD dominant timeout (typically 650 µs to 3.5 ms) automatically disables the transmitter. All ISO 11898-2 compliant CAN transceivers include it. Absence = bus-jamming fault risk in deployed vehicle/industrial networks.',
      sortOrder: 9,
    },
    {
      attributeId: 'aec_q100',
      attributeName: 'AEC-Q100 / Automotive Qualification',
      logicType: 'identity_flag',
      weight: 4,
      engineeringReason: 'CAN transceivers in automotive ECU, BCM, and gateway designs are always AEC-Q100 Grade 1 (−40°C to +125°C). Non-automotive-qualified parts are BLOCKED regardless of electrical match. Escalated to w10+blockOnMissing for automotive (Q4). For RS-485 industrial: AEC-Q100 is operational — preferred but not required.',
      sortOrder: 21,
    },

    // ============================================================
    // THRESHOLD gte — Data Rate, Bus Fault, ESD, VOD, Isolation Voltage
    // ============================================================
    {
      attributeId: 'data_rate',
      attributeName: 'Data Rate / Speed Grade',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 9,
      blockOnMissing: true,
      engineeringReason: 'Replacement data rate must equal or exceed the original. RS-485: standard ≤250 kbps (slew-limited), high-speed ≤10 Mbit/s, very-high ≤50–100 Mbit/s. CAN: classical ≤1 Mbit/s, CAN FD data phase ≤8 Mbit/s. I2C: Standard 100 kbps, Fast 400 kbps, Fm+ 1 Mbit/s. A slower device cannot replace a faster one.',
      sortOrder: 2,
    },
    {
      attributeId: 'isolation_working_voltage',
      attributeName: 'Isolation Working Voltage (VIORM)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 7,
      engineeringReason: 'Replacement VIORM must equal or exceed the original. The isolation working voltage is the maximum continuous differential voltage across the barrier. For reinforced insulation per IEC 62368-1 at 300 V working voltage, VIORM ≥ 840 Vpeak is required. Escalated to mandatory for Q2=isolated.',
      sortOrder: 5,
    },
    {
      attributeId: 'bus_fault_protection',
      attributeName: 'Bus Fault Protection Voltage',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 8,
      engineeringReason: 'Replacement bus fault protection must equal or exceed original. RS-485: ±15 V standard, ±60 V industrial (IEC 61000-4-5). Automotive CAN: ±70 V or ±80 V for ISO 7637 transient tolerance. A device with lower fault protection in a higher-fault-voltage environment will be destroyed when bus shorts to power or wiring error occurs.',
      sortOrder: 10,
    },
    {
      attributeId: 'esd_bus_pins',
      attributeName: 'ESD Rating — Bus Pins',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 7,
      engineeringReason: 'Replacement ESD rating on bus pins must equal or exceed original. Minimum ±8 kV IEC 61000-4-2 contact discharge for industrial RS-485 and CAN. Bus pins connect directly to field wiring or external connectors — the most ESD-vulnerable nodes. Reducing ESD protection causes susceptibility to field failures that are difficult to diagnose.',
      sortOrder: 11,
    },
    {
      attributeId: 'vod_differential',
      attributeName: 'Differential Output Voltage (VOD)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 6,
      engineeringReason: 'Replacement VOD must equal or exceed original minimum spec. RS-485/RS-422: minimum 1.5 V into 54 Ω. CAN: dominant state ≥1.5 V into 60 Ω. Lower VOD reduces noise margin, especially in long-cable high-attenuation applications. Available noise margin = VOD/2 − 200 mV (receiver threshold).',
      sortOrder: 12,
    },

    // ============================================================
    // THRESHOLD lte — Propagation Delay, Unit Loads, Standby Current
    // ============================================================
    {
      attributeId: 'propagation_delay',
      attributeName: 'Propagation Delay / Loop Delay',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 6,
      engineeringReason: 'Replacement propagation delay must equal or be less than original. CAN FD at 2 Mbit/s: bit period = 500 ns, one-way loop delay ≤140 ns. CAN FD at 5 Mbit/s: bit period = 200 ns, loop delay ≤120 ns. Classical CAN at 1 Mbit/s: ≤255 ns. Exceeding the delay budget causes the receiver to sample during transition.',
      sortOrder: 15,
    },
    {
      attributeId: 'unit_loads',
      attributeName: 'Unit Loads / Bus Loading',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 5,
      engineeringReason: 'RS-485 only. Maximum 32 unit loads (UL) per segment. 1 UL = 12 kΩ input impedance. Fractional UL devices (¼ UL = 48 kΩ) allow 128 devices per segment. Replacing a ¼ UL device with 1 UL quadruples that node load contribution — may overload a dense network.',
      sortOrder: 16,
    },
    {
      attributeId: 'standby_current',
      attributeName: 'Shutdown / Low-Power Standby Current',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 5,
      engineeringReason: 'Replacement standby current must equal or be less than original. Automotive CAN transceivers spend most of their lifetime in standby/sleep. Transceiver standby current ranges from 5 µA (TJA1042T) to tens of µA for older devices. Escalated to primary for automotive ECU quiescent budget (Q3/Q4).',
      sortOrder: 19,
    },

    // ============================================================
    // THRESHOLD range_superset — Receiver CM, Common Mode, Supply, Temp
    // ============================================================
    {
      attributeId: 'receiver_threshold_cm',
      attributeName: 'Input Receiver Threshold & Common-Mode Range',
      logicType: 'threshold',
      thresholdDirection: 'range_superset',
      weight: 7,
      engineeringReason: 'Replacement receiver threshold and common-mode range must contain original specification as subset. RS-485: ±200 mV differential sensitivity over −7 V to +12 V CM range. CAN: recessive ≥500 mV, dominant ≤900 mV differential. Extended CM devices (−25 V to +25 V) for multi-panel systems with ground shifts.',
      sortOrder: 13,
    },
    {
      attributeId: 'common_mode_range',
      attributeName: 'Common-Mode Operating Range',
      logicType: 'threshold',
      thresholdDirection: 'range_superset',
      weight: 6,
      engineeringReason: 'Replacement common-mode range must contain actual bus CM voltage. RS-485 standard: −7 V to +12 V. Extended range: −25 V to +25 V for long cable runs between separately grounded equipment. CAN: −2 V to +7 V (narrower — vehicle ground potential differences are small).',
      sortOrder: 17,
    },
    {
      attributeId: 'supply_voltage',
      attributeName: 'Supply Voltage Range',
      logicType: 'threshold',
      thresholdDirection: 'range_superset',
      weight: 7,
      blockOnMissing: true,
      engineeringReason: 'Replacement supply voltage range must contain actual supply. 5V-only transceiver (SN75176, MAX488) cannot be powered from 3.3V supply. 3.3V transceiver (ADM3485) on 5V supply = overvoltage damage. Wide-supply transceivers (SN65HVD3082E: 3.0–5.5V) cover both domains safely.',
      sortOrder: 18,
    },
    {
      attributeId: 'operating_temp',
      attributeName: 'Operating Temperature Range',
      logicType: 'threshold',
      thresholdDirection: 'range_superset',
      weight: 7,
      blockOnMissing: true,
      engineeringReason: 'Replacement operating temp range must contain application range. Automotive: −40°C to +125°C (AEC-Q100 Grade 1). Industrial: −40°C to +85°C or +105°C. Substituting industrial-grade into automotive violates AEC-Q100 qualification boundary regardless of temp range adequacy.',
      sortOrder: 20,
    },

    // ============================================================
    // APPLICATION REVIEW — Slew Rate, Package
    // ============================================================
    {
      attributeId: 'slew_rate_class',
      attributeName: 'Slew Rate Limiting',
      logicType: 'application_review',
      weight: 6,
      engineeringReason: 'Slew-rate-limited RS-485 transceivers (MAX485, SN65HVD08, ≤250 kbps class) restrict rise/fall times to reduce EMI. Substituting unlimited-slew high-speed transceiver produces a system that works electrically but fails CE/FCC radiated emissions testing. Flag for Application Review with explicit EMI compliance warning.',
      sortOrder: 14,
    },
    {
      attributeId: 'package_case',
      attributeName: 'Package / Footprint',
      logicType: 'application_review',
      weight: 5,
      engineeringReason: 'SOIC-8 is de facto standard for RS-485/CAN with identical pinout across most vendors (VCC=8, GND=5, DE=3, RE=2, RO=1, DI=4, A=6, B=7). Verify pin function deviations. Isolated transceivers use SOIC-16W or SMD-16 — incompatible with SOIC-8 footprint. CAN: verify pin 8 function (RS/slope vs STB/WAKE).',
      sortOrder: 22,
    },
  ],
};
