import { LogicTable } from '../types';

/**
 * IGBTs — Insulated Gate Bipolar Transistors
 * Block B: Discrete Semiconductors — Family B7
 *
 * Derived from: docs/igbt_logic_b7.docx
 * 25 attributes with specific matching rules for cross-reference validation.
 *
 * Key differences from MOSFETs (B5):
 * - Conduction loss uses Vce(sat) × Ic (LINEAR), NOT Rds(on) × Id² (quadratic).
 *   Vce(sat) is THE primary on-state spec. A lower Vce(sat) directly reduces
 *   conduction loss watts-for-watts — there is no quadratic benefit from
 *   oversizing like with MOSFETs.
 * - Tail current and Eoff (turn-off energy loss) are the primary switching speed
 *   specs — NOT gate charge alone. When an IGBT turns off, minority carriers
 *   in the drift region must recombine, creating a "tail current" that persists
 *   for microseconds after the gate is removed. Eoff × fsw must be verified
 *   against thermal budget. This is fundamentally different from MOSFETs where
 *   turn-off is limited only by gate charge and Miller capacitance.
 * - Co-Packaged Diode presence is a hard Identity Flag. A bare IGBT cannot
 *   replace an IGBT+diode in a bridge topology without adding an external
 *   antiparallel diode — the IGBT body structure does NOT have a usable
 *   intrinsic body diode (unlike MOSFETs). Conversely, an IGBT+diode can
 *   replace a bare IGBT if the diode speed is acceptable.
 * - Short-circuit withstand time (tsc) is BLOCKING for motor drive and traction
 *   applications. The gate driver's desaturation detection circuit needs tsc
 *   microseconds to detect the fault and turn off the IGBT. If tsc of the
 *   replacement is shorter than the driver's response time, the IGBT dies.
 * - IGBT Technology (PT/NPT/FS) is an Identity constraint in parallel
 *   configurations. Different technologies have different Vce(sat) temperature
 *   coefficients — mixing PT (negative tempco) with FS (positive tempco)
 *   causes thermal runaway in the PT device. In single-device applications,
 *   FS is strictly superior to NPT, which is superior to PT.
 * - Uses AEC-Q101 (not AEC-Q200) for automotive qualification.
 *
 * Related families: MOSFETs (B5) — share gate-drive concepts but fundamentally
 * different conduction and switching mechanisms; BJTs (B6) — share bipolar
 * conduction physics (minority carrier storage → tail current).
 *
 * Fundamental trade-off: Vce(sat) vs. Eoff ≈ constant within a technology.
 * Lower Vce(sat) (thicker, more conductive drift region) → more stored charge
 * → longer tail current → higher Eoff. Field-Stop (FS) technology partially
 * breaks this trade-off by using a thin buffer layer to control carrier
 * injection, achieving both low Vce(sat) AND fast switching.
 */
export const igbtsLogicTable: LogicTable = {
  familyId: 'B7',
  familyName: 'IGBTs — Insulated Gate Bipolar Transistors',
  category: 'Discrete Semiconductors',
  description: 'Hard logic filters for IGBT replacement part validation',
  rules: [
    // ============================================================
    // IDENTITY — Channel, Technology & Physical
    // ============================================================
    {
      attributeId: 'channel_type',
      attributeName: 'Channel Type (N-Channel / P-Channel)',
      logicType: 'identity',
      weight: 10,
      engineeringReason: 'Almost all IGBTs are N-channel. P-channel IGBTs exist but are rare and used in complementary topologies. N-channel and P-channel require opposite gate drive polarity and different circuit topology — never interchangeable.',
      sortOrder: 1,
    },
    {
      attributeId: 'igbt_technology',
      attributeName: 'IGBT Technology (PT / NPT / FS)',
      logicType: 'identity_upgrade',
      upgradeHierarchy: ['FS', 'NPT', 'PT'],
      weight: 9,
      engineeringReason: 'Punch-Through (PT) IGBTs have the lowest Vce(sat) but slowest switching and NEGATIVE Vce(sat) temperature coefficient — dangerous in parallel operation (thermal runaway). Non-Punch-Through (NPT) have positive tempco (self-balancing) but higher Vce(sat). Field-Stop (FS) combines low Vce(sat) with positive tempco and fast switching — strictly superior for most applications. CRITICAL in parallel: mixing technologies with different tempco signs causes the negative-tempco device to hog current and thermally run away.',
      sortOrder: 2,
    },
    {
      attributeId: 'co_packaged_diode',
      attributeName: 'Co-Packaged Antiparallel Diode',
      logicType: 'identity_flag',
      weight: 10,
      engineeringReason: 'Unlike MOSFETs, IGBTs do NOT have a usable intrinsic body diode. In bridge topologies (H-bridge, 3-phase inverter), current must flow through the antiparallel diode during dead time and freewheeling. A bare IGBT in a bridge position without an external diode creates an open circuit during freewheeling — causing voltage spikes and potential destruction. An IGBT+diode package can replace a bare IGBT (external diode becomes redundant), but a bare IGBT cannot replace an IGBT+diode without adding a discrete diode and verifying its speed matches the application.',
      sortOrder: 3,
    },
    {
      attributeId: 'package_case',
      attributeName: 'Package / Footprint',
      logicType: 'identity',
      weight: 10,
      engineeringReason: 'IGBT packages are not standardized for pin ordering. TO-247-3: usually G-C-E but some manufacturers use different pin assignments. TO-220: similar variation. D2PAK: tab is collector but signal pins vary. Modules have entirely different pinouts. Installing with swapped gate and collector creates a short circuit. Thermal pad assignment (collector in discrete, varies in modules) must match PCB layout.',
      sortOrder: 4,
    },
    {
      attributeId: 'mounting_style',
      attributeName: 'Mounting Style',
      logicType: 'identity',
      weight: 9,
      engineeringReason: 'Surface mount (D2PAK, TO-263) vs. through-hole (TO-247, TO-220, TO-3P). Cannot interchange without PCB redesign. Thermal dissipation path differs fundamentally — through-hole devices typically mount to external heatsinks while SMD devices dissipate through the PCB.',
      sortOrder: 5,
    },
    {
      attributeId: 'aec_q101',
      attributeName: 'AEC-Q101 Qualification',
      logicType: 'identity_flag',
      weight: 8,
      engineeringReason: 'AEC-Q101 covers HTOL, thermal cycling, humidity testing, plus IGBT-specific tests: short-circuit withstand, gate oxide stress, thermal impedance verification. Automotive and traction BOM approval requires supplier-level qualification — customer test data is not a substitute. EV traction inverters additionally require IATF 16949 process certification.',
      sortOrder: 6,
    },

    // ============================================================
    // VOLTAGE, CURRENT & POWER RATINGS
    // ============================================================
    {
      attributeId: 'vces_max',
      attributeName: 'Collector-Emitter Voltage (Vces Max)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 10,
      engineeringReason: 'THE fundamental IGBT voltage rating — maximum collector-emitter voltage with gate shorted to emitter. IGBTs are binned into standard voltage classes: 600V, 650V, 1200V, 1700V, 3300V, 6500V. Unlike MOSFETs where voltage is continuous, IGBT applications are tightly coupled to voltage class (600V for single-phase mains, 1200V for three-phase industrial, 1700V for medium voltage, 3300V+ for traction). Replacement must be same class or higher.',
      sortOrder: 7,
    },
    {
      attributeId: 'ic_max',
      attributeName: 'Continuous Collector Current (Ic Max)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 10,
      engineeringReason: 'Maximum continuous collector current at specified case temperature. Unlike MOSFETs (positive Rds(on) tempco provides self-limiting), IGBT Vce(sat) tempco varies by technology — PT has negative tempco (current increases with temperature, thermal runaway risk). Always compare at the relevant operating temperature. Derating from 25°C to 100°C is typically 30-50%.',
      sortOrder: 8,
    },
    {
      attributeId: 'ic_pulse',
      attributeName: 'Peak Pulsed Collector Current (Ic Pulse)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 7,
      engineeringReason: 'Maximum repetitive peak current for short pulses. Covers motor startup inrush, capacitor charging, and fault events before protection acts. Bond wire current density and collector metallization set this limit. In motor drives, startup current can be 6-10× rated — Ic(pulse) must exceed this.',
      sortOrder: 9,
    },
    {
      attributeId: 'pd',
      attributeName: 'Power Dissipation (Pd Max)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 6,
      engineeringReason: 'Package thermal capability at Tc=25°C with infinite heatsink. For IGBTs, real power dissipation is Pcond + Psw = Ic × Vce(sat) + (Eon + Eoff) × fsw. Pd is a necessary minimum gate but the actual thermal design must account for switching frequency, heatsink thermal resistance, and ambient temperature.',
      sortOrder: 10,
    },
    {
      attributeId: 'vge_max',
      attributeName: 'Gate-Emitter Voltage (Vge Max)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 8,
      engineeringReason: 'Maximum gate-emitter voltage before gate oxide breakdown — catastrophic, permanent failure. Standard IGBTs: ±20V. Gate drive circuits typically use +15V turn-on and −8V to −15V turn-off. The negative turn-off voltage prevents parasitic turn-on from Miller coupling (dVce/dt → gate current through Cgc). Replacement must tolerate both positive and negative gate drive excursions.',
      sortOrder: 11,
    },

    // ============================================================
    // ON-STATE PERFORMANCE
    // ============================================================
    {
      attributeId: 'vce_sat',
      attributeName: 'Collector-Emitter Saturation Voltage (Vce(sat))',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 9,
      engineeringReason: 'THE primary on-state performance parameter for IGBTs. Conduction loss: Pcond = Ic × Vce(sat). Unlike MOSFETs where Pcond = Id² × Rds(on) (quadratic — oversizing helps dramatically), IGBT conduction loss is LINEAR in current. This means reducing Vce(sat) by 0.5V at 40A saves 20W directly. CRITICAL: Vce(sat) is specified at a particular Vge (typically 15V) and Ic — comparison is only valid at the same conditions. Vce(sat) increases with temperature for FS/NPT (self-balancing) but decreases for PT (thermal runaway risk).',
      sortOrder: 12,
    },
    {
      attributeId: 'vge_th',
      attributeName: 'Gate Threshold Voltage (Vge(th))',
      logicType: 'application_review',
      weight: 6,
      engineeringReason: 'Two failure modes: (1) Drive voltage insufficient to fully saturate — IGBT operates in active region with massive Vce × Ic dissipation. (2) Vge(th) too low — susceptible to parasitic turn-on from dVce/dt through Miller capacitance, especially at high temperatures where Vge(th) drops. Must verify gate drive circuit provides adequate overdrive for the replacement AND that noise margin is sufficient at maximum operating temperature.',
      sortOrder: 13,
    },

    // ============================================================
    // SWITCHING / LOSS PARAMETERS
    // ============================================================
    {
      attributeId: 'eoff',
      attributeName: 'Turn-Off Energy Loss (Eoff)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 9,
      engineeringReason: 'THE dominant switching loss parameter for IGBTs — fundamentally different from MOSFETs. When an IGBT turns off, minority carriers stored in the drift region must recombine, creating a "tail current" that persists for 0.5-5µs after the voltage has risen to bus level. During this tail: Psw(off) = Vce × Itail — dissipating significant energy. Eoff includes this tail energy. Total switching loss: Psw = (Eon + Eoff) × fsw. At typical IGBT frequencies (5-40kHz), Eoff dominates total switching loss. CRITICAL: Eoff is specified at particular Vce, Ic, Rg, Vge, and Tj conditions — ensure test conditions match.',
      sortOrder: 14,
    },
    {
      attributeId: 'eon',
      attributeName: 'Turn-On Energy Loss (Eon)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 8,
      engineeringReason: 'Turn-on energy includes the co-packaged or external antiparallel diode reverse recovery contribution. When the IGBT turns on, the opposing diode in the bridge recovers — its reverse recovery current flows through the turning-on IGBT, increasing Eon significantly. A replacement IGBT paired with a slower diode will have higher effective Eon. In soft-switching (ZVS) topologies, Eon approaches zero because voltage swings to zero before turn-on.',
      sortOrder: 15,
    },
    {
      attributeId: 'td_on',
      attributeName: 'Turn-On Delay Time (td(on))',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 6,
      engineeringReason: 'Time from gate voltage application to collector current reaching 10% of final value. Determines minimum dead time in bridge topologies — both IGBTs conducting simultaneously (shoot-through) destroys the devices. Longer td(on) in the replacement requires verifying dead time is still adequate.',
      sortOrder: 16,
    },
    {
      attributeId: 'td_off',
      attributeName: 'Turn-Off Delay Time (td(off))',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 6,
      engineeringReason: 'Time from gate voltage removal to collector current starting to fall. In bridge topologies, td(off) plus fall time plus tail time determines the total turn-off period. Longer td(off) reduces effective duty cycle range and may cause shoot-through if dead time is insufficient.',
      sortOrder: 17,
    },
    {
      attributeId: 'tf',
      attributeName: 'Fall Time (tf)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 6,
      engineeringReason: 'Time for collector current to fall from 90% to 10% — does NOT include the tail current phase. Faster fall time reduces Eoff but increases dI/dt, generating higher voltage spikes across stray inductance: Vspike = Lstray × dIc/dt. In designs with minimal snubbing, a replacement with significantly faster tf may exceed Vces on turn-off.',
      sortOrder: 18,
    },
    {
      attributeId: 'qg',
      attributeName: 'Total Gate Charge (Qg)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 7,
      engineeringReason: 'Total charge to switch the IGBT from off to on. Determines gate driver power dissipation (Pg = Qg × Vge × fsw) and peak gate drive current. Unlike MOSFETs where Qg dominates switching behavior, IGBT switching losses are dominated by Eoff (tail current). However, higher Qg still burdens the gate driver — shared drivers may sag, and isolated gate supplies have limited energy per pulse.',
      sortOrder: 19,
    },
    {
      attributeId: 'tsc',
      attributeName: 'Short-Circuit Withstand Time (tsc)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 9,
      engineeringReason: 'BLOCKING for motor drive and traction applications. During a short-circuit event, the IGBT enters active region with full bus voltage across it and collector current limited only by the transfer characteristic — dissipating Vce × Isc (typically 6-10× rated current). The IGBT must survive for tsc microseconds while the desaturation detection circuit in the gate driver detects the fault and initiates controlled turn-off. If tsc of the replacement is shorter than the driver response time (typically 5-10µs), the IGBT will fail catastrophically before protection can act. tsc decreases with temperature — verify at Tj(max).',
      sortOrder: 20,
    },

    // ============================================================
    // THERMAL
    // ============================================================
    {
      attributeId: 'rth_jc',
      attributeName: 'Junction-to-Case Thermal Resistance (Rth_jc)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 7,
      engineeringReason: 'Primary thermal spec for heatsink-mounted IGBTs. Total thermal path: Tj = Ta + Ptotal × (Rth_jc + Rth_cs + Rth_sa). Higher Rth_jc with same power dissipation means higher junction temperature — reduced lifetime and possibly exceeding Tj(max). IGBT thermal cycling reliability is extremely sensitive to Tj swing: lifetime ∝ (ΔTj)^(-n) where n = 4-6.',
      sortOrder: 21,
    },
    {
      attributeId: 'tj_max',
      attributeName: 'Maximum Junction Temperature (Tj Max)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 6,
      engineeringReason: 'Most standard IGBTs are rated 150°C. High-reliability and automotive traction IGBTs are rated 175°C — this 25°C difference is significant for thermal headroom in sealed enclosures and high-ambient environments. Tj(max) also affects tsc (which degrades at high temperature) and Eoff (which increases with temperature).',
      sortOrder: 22,
    },

    // ============================================================
    // RELIABILITY & SOA
    // ============================================================
    {
      attributeId: 'soa',
      attributeName: 'Safe Operating Area (SOA Curves)',
      logicType: 'application_review',
      weight: 7,
      engineeringReason: 'IGBTs share the BJT susceptibility to second breakdown — a localized thermal runaway that occurs when high Vce and high Ic coincide. SOA defines safe Vce × Ic combinations at various pulse widths. In normal switching (hard or soft), the IGBT traverses the SOA boundary briefly. In fault conditions (short-circuit turn-off, inductive clamping), the IGBT may operate near the SOA limit for extended periods. Motor soft-start and dynamic braking can push into linear SOA region.',
      sortOrder: 23,
    },

    // ============================================================
    // MECHANICAL & PRODUCTION
    // ============================================================
    {
      attributeId: 'height',
      attributeName: 'Height / Profile',
      logicType: 'fit',
      weight: 5,
      engineeringReason: 'Hard mechanical constraint when IGBTs are mounted under heatsinks with fixed standoff, in card-edge assemblies, or in sealed enclosures with limited clearance. TO-247 body height varies between manufacturers. D2PAK profile is tightly controlled. Module heights vary significantly between manufacturers.',
      sortOrder: 24,
    },
    {
      attributeId: 'packaging',
      attributeName: 'Packaging Format (Tube, Tray)',
      logicType: 'operational',
      weight: 2,
      engineeringReason: 'Must match production line requirements. Through-hole IGBTs (TO-247, TO-220) ship in tubes or trays. SMD (D2PAK) may be tape/reel or tray. Mismatch halts production but does not affect electrical performance.',
      sortOrder: 25,
    },
  ],
};
