import { LogicTable } from '../types';

/**
 * Fuses — Traditional Overcurrent Protection
 * Block D: Frequency & Protection Components — Family D2
 *
 * Derived from: docs/d2_fuse_logic.docx
 * 14 attributes with specific matching rules for cross-reference validation.
 *
 * Family D2 covers traditional (non-resettable) fuses: glass cartridge, ceramic
 * cartridge, blade (automotive), and SMD fuses. These are one-time overcurrent
 * protection devices — they must be physically replaced after blowing. D2 is
 * distinct from Family 66 (PTC Resettable Fuses), which reset automatically.
 *
 * Key substitution pitfalls:
 *
 * - current_rating_a is the #1 HARD GATE and is IDENTITY — not a threshold.
 *   A 2A fuse cannot substitute for a 3A fuse (blows prematurely on normal load).
 *   A 3A fuse cannot substitute for a 2A fuse (may not interrupt faults the 2A
 *   would have caught, leaving wiring unprotected). Current rating defines the
 *   maximum normal operating current the protected circuit is expected to draw —
 *   it was chosen to match the wire gauge and component ratings.
 *
 * - speed_class is a HARD GATE. Fast-blow (F) / Slow-blow (T) / Very Fast (FF) /
 *   Very Slow (TT) have fundamentally different time-current curves. Fast-blow in
 *   a motor circuit = nuisance trips on every startup. Slow-blow in a semiconductor
 *   circuit = semiconductor destroyed before fuse clears. BLOCK cross-class.
 *
 * - voltage_rating_v is safety-critical threshold GTE. A fuse rated below circuit
 *   voltage cannot safely extinguish the arc when it blows — arc sustains, fuse
 *   body may rupture or ignite, fault current continues.
 *
 * - breaking_capacity_a (interrupting rating) is safety-critical threshold GTE.
 *   If fault current exceeds breaking capacity: fuse body may explode, sustained
 *   arc causes fire, circuit is not protected.
 *
 * - package_format is a HARD GATE. 5×20mm cartridge / 6.3×32mm cartridge /
 *   SMD 0603-2410 / automotive blade (ATM/ATC/APX) are physically incompatible.
 *
 * - i2t_rating_a2s (let-through energy) is the semiconductor protection spec.
 *   If fuse I²t > semiconductor I²t, the semiconductor is destroyed even though
 *   the fuse eventually clears. Escalated to mandatory for Q2 = semiconductor.
 *
 * - voltage_type (AC/DC) — DC arcs have no natural zero crossing and are harder
 *   to extinguish. A 250VAC fuse may be rated only 32VDC. For solar/EV/battery:
 *   always verify DC voltage rating explicitly.
 *
 * Related Families: 66 (PTC Resettable Fuses — automatic reset), 65 (Varistors /
 * MOVs — voltage transient suppression). D2 does NOT cover thermal fuses (temp-
 * activated cutoffs) or circuit breakers (mechanical, resettable).
 */
export const d2FusesLogicTable: LogicTable = {
  familyId: 'D2',
  familyName: 'Fuses — Traditional Overcurrent Protection',
  category: 'Passives',
  description: 'Hard logic filters for traditional fuse replacement validation — current_rating_a (identity), speed_class, and package_format are BLOCKING gates; voltage_rating_v and breaking_capacity_a are safety-critical minimum thresholds',
  rules: [
    // ============================================================
    // SECTION 1: ELECTRICAL RATINGS — HARD GATES
    // ============================================================
    {
      attributeId: 'current_rating_a',
      attributeName: 'Current Rating (A)',
      logicType: 'identity',
      weight: 10,
      blockOnMissing: true,
      engineeringReason: 'BLOCKING — IDENTITY, not a threshold. The most dangerous fuse substitution error is treating current rating as a minimum. A 3A fuse in a 2A circuit means any fault between 2A and 3A is not interrupted — wire overheats, insulation melts, fire begins before fuse clears. A 2A fuse in a 3A circuit blows prematurely under normal load. The current rating defines the maximum normal operating current — chosen by the designer to match wire gauge, component ratings, and fault scenarios. Replacement must have the same current rating. The one narrow exception: one step up (e.g. 2A → 2.5A) is Application Review only when the engineer confirms wire gauge supports the increase.',
      sortOrder: 1,
    },
    {
      attributeId: 'voltage_rating_v',
      attributeName: 'Voltage Rating (V)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 10,
      blockOnMissing: true,
      engineeringReason: 'BLOCKING — safety-critical minimum. Maximum circuit voltage the fuse can safely interrupt. Replacement voltage rating must be ≥ original. A fuse rated below circuit voltage cannot safely extinguish the arc when it blows — the arc continues, the fuse body may rupture or catch fire, and fault current is not interrupted. Never downgrade voltage rating. Upsizing is always safe — a 250V fuse in a 125V circuit is fine.',
      sortOrder: 2,
    },
    {
      attributeId: 'breaking_capacity_a',
      attributeName: 'Breaking Capacity (A)',
      logicType: 'threshold',
      thresholdDirection: 'gte',
      weight: 10,
      blockOnMissing: true,
      engineeringReason: 'BLOCKING — safety-critical minimum. Maximum prospective fault current the fuse can safely interrupt without rupture or fire (also called interrupting rating or short-circuit rating). Replacement breaking capacity must be ≥ original. If available fault current exceeds breaking capacity: fuse body may explode, enclosure may catch fire, fault current continues uninterrupted. Mains-connected: minimum 1500A (IEC) or 10,000A (UL for North American branch circuits). Low-voltage DC boards: 35–200A typical.',
      sortOrder: 3,
    },

    // ============================================================
    // SECTION 2: SPEED CLASS & TIME-CURRENT BEHAVIOR
    // ============================================================
    {
      attributeId: 'speed_class',
      attributeName: 'Speed Class',
      logicType: 'identity',
      weight: 9,
      blockOnMissing: true,
      engineeringReason: 'HARD GATE. Fast-blow (F) / Medium / Slow-blow (T, time-delay) / Very Fast (FF, semiconductor protection) / Very Slow (TT). Speed class determines the time-current characteristic — how quickly the fuse blows at various multiples of rated current. Fast-blow: clears within milliseconds at 2× rated — required for semiconductor protection. Slow-blow: rides through inrush (motor start, capacitor charging, transformer inrush) — clears slowly at moderate overcurrent but quickly at high fault current. Slow-blow in a semiconductor circuit = semiconductor destroyed before fuse clears. Fast-blow in a motor circuit = fuse blows every startup. BLOCK cross-class substitutions unconditionally.',
      sortOrder: 4,
    },
    {
      attributeId: 'i2t_rating_a2s',
      attributeName: 'I²t Let-Through Energy (A²·s)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 8,
      engineeringReason: 'I²t (ampere-squared seconds) measures total thermal energy delivered to the circuit from fault initiation to arc extinction. Replacement I²t must be ≤ original — replacement must clear at least as fast, delivering no more energy. For semiconductor protection: if fuse I²t > semiconductor I²t, the semiconductor is destroyed even though the fuse eventually clears. A MOSFET rated I²t = 50 A²s with 100A fault: slow-blow 5A clears in 10ms → I²t = 100 A²s (MOSFET destroyed); fast-blow clears in 1ms → I²t = 10 A²s (survives). Escalated to mandatory + blockOnMissing for Q2 = semiconductor protection.',
      sortOrder: 5,
    },
    {
      attributeId: 'melting_i2t_a2s',
      attributeName: 'Melting I²t (A²·s)',
      logicType: 'threshold',
      thresholdDirection: 'lte',
      weight: 6,
      engineeringReason: 'Pre-arcing I²t — energy from fault initiation to the moment the fuse element melts (before arc extinction). Total clearing I²t = melting I²t + arcing I²t. For semiconductor protection: melting I²t is the relevant limit — the semiconductor sees this energy during the fault before the fuse begins interrupting. When only one I²t value is available, use it conservatively (assume clearing I²t unless datasheet specifies otherwise). Escalated to primary for Q2 = semiconductor protection.',
      sortOrder: 6,
    },

    // ============================================================
    // SECTION 3: PHYSICAL & PACKAGE
    // ============================================================
    {
      attributeId: 'package_format',
      attributeName: 'Package Format',
      logicType: 'identity',
      weight: 9,
      blockOnMissing: true,
      engineeringReason: 'HARD GATE. Cartridge: 5×20mm (IEC), 6.3×32mm (North American ¼×1¼ inch), 10×38mm (30A class). Blade (automotive): Mini (ATM, 10.9mm), Regular (ATC/ATO, 19.1mm), Maxi (APX, 29.2mm), Low-Profile Mini, Micro2, Micro3. SMD: 0402, 0603, 0805, 1206, 2410. PCB radial. These are physically incompatible — a 5×20mm cartridge cannot substitute for a blade fuse or SMD. Within automotive blade: ATM ≠ ATC/ATO ≠ APX — blade sizes are not interchangeable in fuse holders. BLOCK cross-format substitutions unconditionally.',
      sortOrder: 7,
    },
    {
      attributeId: 'body_material',
      attributeName: 'Body Material',
      logicType: 'identity_flag',
      weight: 6,
      engineeringReason: 'Glass / Ceramic / Sand-filled ceramic. Glass allows visual inspection of the element. Ceramic (sand-filled): higher breaking capacity — sand quenches the arc. For mains with high available fault current: ceramic/sand-fill required. For high-voltage DC (solar, battery storage): ceramic sand-fill mandatory — DC arcs are harder to extinguish than AC arcs and glass bodies cannot reliably contain them. Escalated to mandatory for Q1 = high-voltage DC (glass BLOCKED). Escalated to primary for Q1 = AC mains.',
      sortOrder: 8,
    },
    {
      attributeId: 'mounting_type',
      attributeName: 'Mounting Type',
      logicType: 'identity',
      weight: 8,
      blockOnMissing: true,
      engineeringReason: 'BLOCKING — PCB through-hole / PCB SMD reflow / Chassis panel-mount (fuse holder) / In-line (wiring harness). These require different PCB footprints and assembly processes. BLOCK cross-mounting-type substitutions.',
      sortOrder: 9,
    },

    // ============================================================
    // SECTION 4: OPERATING CONDITIONS
    // ============================================================
    {
      attributeId: 'operating_temp_range',
      attributeName: 'Operating Temperature Range',
      logicType: 'threshold',
      thresholdDirection: 'range_superset',
      weight: 6,
      engineeringReason: 'Fuse rated current is specified at a reference temperature (typically +25°C). At elevated ambient, the fuse carries less current before blowing — thermal derating. A 5A fuse at +85°C ambient may effectively protect as ~4A. Replacement must cover the full ambient temperature range. Automotive engine-bay: −40°C to +125°C minimum. Escalated to mandatory for Q3 = automotive.',
      sortOrder: 10,
    },
    {
      attributeId: 'derating_factor',
      attributeName: 'Derating Factor',
      logicType: 'application_review',
      weight: 5,
      engineeringReason: 'Percentage of rated current the fuse can carry continuously without degradation (typically 75–80%). The circuit\'s normal operating current must not exceed rated_current × derating_factor. If the original had 75% derating and the replacement has 70%: the operating current that was safe before may now exceed the replacement\'s continuous limit. Flag as Application Review when operating current is close to the derating threshold.',
      sortOrder: 11,
    },
    {
      attributeId: 'voltage_type',
      attributeName: 'Voltage Type (AC/DC)',
      logicType: 'identity_flag',
      weight: 7,
      engineeringReason: 'AC / DC / AC+DC rated. DC fuses must be specifically rated for DC — AC fuses are not suitable for DC circuits because DC arcs have no natural zero crossing. A fuse rated 250VAC may only be rated 32VDC or 125VDC, or may carry no DC rating at all. For solar, battery, and EV applications: always verify DC voltage rating explicitly. Escalated to mandatory for Q1 = DC applications.',
      sortOrder: 12,
    },

    // ============================================================
    // SECTION 5: STANDARDS & QUALIFICATION
    // ============================================================
    {
      attributeId: 'safety_certification',
      attributeName: 'Safety Certification',
      logicType: 'identity_flag',
      weight: 7,
      engineeringReason: 'UL248 (North American) / IEC 60127 (international) / AEC-Q200 (automotive). Safety certifications determine which markets the product can ship to. UL and IEC have different current-time characteristic definitions. A fuse certified only to IEC may not meet UL requirements for North American products. BLOCKING when the application specifies a required certification and the replacement does not carry it. Escalated to mandatory for Q1 = mains-connected.',
      sortOrder: 13,
    },
    {
      attributeId: 'aec_q200',
      attributeName: 'AEC-Q200 Qualification',
      logicType: 'identity_flag',
      weight: 4,
      engineeringReason: 'AEC-Q200 passive component qualification for automotive. Fuses use AEC-Q200 (passive standard), NOT AEC-Q100 (active ICs). Non-AEC parts are BLOCKED from automotive designs when context Q3 escalates to mandatory + blockOnMissing.',
      sortOrder: 14,
    },
  ],
};
