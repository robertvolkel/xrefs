/**
 * Per-family domain knowledge cards injected into the Triage AI prompts
 * (both /suggest and /investigate). Each card surfaces the gotchas the
 * Sonnet 4.6-class model historically misses on a per-family basis:
 *
 *   - Sub-type distinctions that look identical by paramName but differ in
 *     canonical (e.g., C3 input-side vs output-side VCC on isolated drivers)
 *   - Sub-family designators that don't exist as separate logic-table
 *     families even though the AI tends to invent them (BJT_DIGITAL)
 *   - Conventional units that should NOT be unit-suffixed into canonicals
 *     (isolation voltage is always kVrms; no need for `_kvrms` variant)
 *   - Labels that look generic but mean something specific in this family
 *     (vdd_range = output-side gate-drive supply, NOT a generic VCC)
 *   - Cross-family confusions where the AI tends to invent canonicals
 *     instead of reusing the existing one (isolation_voltage exists in L2
 *     Power Supplies and Transformers — C3 should reuse, not mint `_kvrms`)
 *
 * Each card is concrete: specific MPN prefixes, specific paramName patterns,
 * specific units. Generic "this is a family of X" framing is omitted —
 * Sonnet already knows that part from training. The cards exist to add the
 * idiosyncratic knowledge the model cannot derive from the schema labels
 * alone, captured from real Triage sessions.
 *
 * Cards are loaded per-call (one card per row's family), so the prompt cost
 * is bounded at ~200-300 tokens regardless of how many cards exist.
 */

const C3_GATE_DRIVERS = `
SUB-TYPES — critical: gate drivers come in two architectures with very
different canonical needs:
  1. Non-isolated bootstrap drivers — single supply (VDD), output drives
     gate directly. The isolation_type rule will reject these as
     candidates for isolated-driver replacement, so missing isolated-side
     specs are expected.
  2. ISOLATED drivers (transformer / optocoupler / digital isolator) —
     have galvanically separated INPUT side (VCCI / VDDI / VDD1, the
     controller-facing logic supply, typically 3.0-5.5V) and OUTPUT side
     (VCCO / VDDO / VDD2, the gate-drive supply, typically 10-25V for Si
     MOSFETs / IGBTs, +18/-5V bipolar for SiC).
NAMING — never collapse these into a single VCC canonical. Map them to:
  - 输入侧VCC (input side) → input_vdd_range
  - 输出侧VCC (output side) → vdd_range  (the existing "Gate Drive Supply
    VDD Range" — its engineering reason explicitly says it's the OUTPUT
    side that determines Vgs on the power device)
SAFETY-CRITICAL: isolation_voltage (kVrms) is THE spec that determines
whether the part can be substituted in a safety-rated design. Conventional
unit is kVrms across every datasheet — DO NOT mint a "_kvrms" variant; use
the existing isolation_voltage canonical (it lives in L2 Power Supplies
and Transformers already; reuse the name for C3 too).
COMMON ISOLATED-DRIVER MPN FAMILIES: NOVOSENSE NSi6601, NSi1300; TI UCC52xx,
UCC5310; Silicon Labs Si82xx, Si827x; ADI ADuM4xxx; Infineon 1ED.
GATE-DRIVE VOLTAGE BY OUTPUT TECHNOLOGY (useful for sanity-checking values):
Si MOSFET 10-15V, IGBT 15V, SiC MOSFET +18 to +20V on / -5V off, GaN HEMT
+5 to +6V / 0V off. Out-of-range values often indicate wrong-family or
wrong-side mapping.
`.trim();

const C5_LOGIC_ICS = `
SUB-TYPES — 74-series spans seven Digikey leaf categories (Gates,
Buffers/Transceivers, Flip-Flops, Latches, Counters, Shift Registers,
MUX/Decoders). Function code is the HARD GATE: '04 inverter ≠ '14 Schmitt;
'373 latch ≠ '374 flip-flop; '241 ≠ '244; '595 shift register ≠ '138
decoder. Never cross function codes.
LOGIC FAMILY designators (HC, HCT, AC, ACT, LVC, AHC, ALVC, AUP, VHC,
VHCT) each have different Vcc range, speed, and output drive. HC ↔ HCT
TRAP: HC requires VIH ≥ 3.5V min; if driven by TTL (VOH = 2.4V min), HC
will not reliably read high. HCT is the TTL-compatible variant. Replacements
across HC/HCT boundary need context Q1 awareness.
I2C BUS SPEED ≠ FMAX — this is a common AI confusion. Logic-IC parts in
the C5 family include I2C bus peripherals (level shifters, buffers, switches,
I/O expanders) whose "max frequency" is the I2C bus clock rate in kHz
(100/400/1000/3400 — Standard/Fast/Fast-Plus/High-speed modes). The
existing fmax canonical is the CLOCKED-LOGIC TOGGLE RATE for flip-flops,
counters, shift registers — measured in MHz. Map I2C bus speed to the
separate i2c_bus_speed_max_khz canonical. The values themselves
disambiguate: kHz values (400, 1000) are bus speed; MHz values (40, 200)
are flip-flop fmax.
COMMON I2C BUS PERIPHERAL MPN FAMILIES: NXP PCA9xxx; NOVOSENSE NCA9xxx
(mirrors NXP lineup); TI PCA9xxx, TCA9xxx; ON Semi/Diodes PCA9xxx.
`.trim();

const B5_MOSFETS = `
POLARITY — N-channel vs P-channel: HARD GATE, never cross-substitute.
Drain-source voltage polarity is opposite; gate threshold sign flips;
schematic and PCB layout assume one polarity.
SUB-TYPES — three physical technologies sometimes lumped together:
Si MOSFET (most common), SiC MOSFET (higher Vds, different Vgs window),
GaN HEMT (depletion or enhancement mode; sometimes filed under B5,
sometimes B9). Cross-technology substitution rarely works without driver
redesign.
LOGIC-LEVEL vs STANDARD GATE THRESHOLD — critical distinction:
  - Logic-level (Vgs(th) ≈ 1-2V): can be driven by 3.3V / 5V GPIO directly.
    Often suffixed "L" (IRLZ44N), "logic level", or specs Rds(on) at Vgs=4.5V.
  - Standard (Vgs(th) ≈ 2-4V): needs >8V gate drive for full enhancement.
    Specs Rds(on) at Vgs=10V only.
Rds(on) ONLY VALID at the spec'd Vgs — comparing 10V-spec'd Rds(on) to
4.5V-spec'd Rds(on) is misleading. Always preserve the spec voltage.
GATE CHARGE (Qg, Qgs, Qgd) drives switching loss — context-dependent
relevance: high-frequency switching needs low Qg; linear regions don't.
BODY DIODE is intrinsic (Vf, trr, Irrm) — replacement must have equivalent
or better. Synchronous-rectifier applications care intensely.
COMMON MPN PREFIXES: IRF (IR/Infineon TO-220), BSS/BSP/BSO (small-signal
SOT-23), SI/SiR (Vishay), NTMFS (ON Semi power), AO (Alpha & Omega),
2N7000 (logic-level small-signal classic).
`.trim();

const B6_BJTS = `
POLARITY — NPN vs PNP: HARD GATE. Collector-emitter polarity opposite;
biasing topology flips.
"BJT_DIGITAL" IS NOT A FAMILY — KEXIN DTCxxx and Diodes Inc DDTC pre-biased
transistors (datasheet calls them "Digital Transistors") are still B6 BJTs
with internal bias resistors (R1 on the base, optional R2 base-emitter).
Map their bias resistor values as satellite canonicals (\`_bias_r1_kohm\`,
\`_bias_r2_kohm\`) — NOT as a separate "BJT_DIGITAL" family. The valid
family IDs are listed in the FAMILY_ID_CONSTRAINT section of this prompt —
DO NOT invent new ones.
FOREIGN-FAMILY PARAM NAMES — these belong unambiguously to B6 and indicate
wrong-family classification if seen on a non-B6 product:
  BVCEO / BVCBO / BVEBO / VCEO / VCBO / VEBO — collector / base / emitter
  breakdown voltages. NOT seen on MOSFETs, JFETs, IGBTs, thyristors. If
  you see these on a non-B6 product → bucket 'wrong_family'.
  hFE (DC current gain) — BJT-only. (FETs have transconductance gm, not gain.)
  fT (transition frequency) — BJT-specific (different concept than fmax in
  digital logic; this is the unity-current-gain frequency).
hFE IS GRADE-DEPENDENT within a part number (2N2222A vs 2N2222 vs PN2222A
have different hFE bins). Sub-grade letters matter for precision designs.
COMMON MPN PREFIXES: 2N (industry classic), BC (European), MMBT (SMD),
DTC/DTA (KEXIN/Diodes digital), MPS (Motorola), KSP (Fairchild/ON).
`.trim();

const C1_LDOS = `
OUTPUT VOLTAGE — primary spec: fixed-output (3.3V, 5V, etc. — single SKU
per voltage) vs ADJUSTABLE (one SKU, voltage set externally via Vfb
feedback divider). These are different sub-types and rarely substitute
directly even with the same dropout rating.
DROPOUT VOLTAGE at rated current — NEVER UPSIZE. A 1V-dropout LDO cannot
replace a 0.1V-dropout LDO in a low-headroom rail (battery near end-of-life,
3.3V-from-3.4V supply). Replacement dropout must be ≤ original.
QUIESCENT CURRENT (Iq) — critical for battery designs. µA-class Iq (TPS735x,
MIC5219, RT9013) cannot be replaced with mA-class (AMS1117, LM1117) without
killing battery life. Context-dependent: industrial designs don't care.
PSRR @ frequency — critical for analog rails (ADC reference supplies,
RF VCO supplies, audio rails). Datasheet often specs PSRR at 1 kHz and
100 kHz separately; need both for noise-sensitive designs.
OUTPUT CAPACITOR STABILITY — older bipolar pass-device LDOs (LM317, classic
1117) require minimum ESR (often 0.1-1Ω) and may oscillate with low-ESR
ceramic caps; modern CMOS pass-device LDOs (AP2112, TPS73x) require LOW
ESR and may oscillate with high-ESR tantalums. Replacement must be in the
same stability class.
COMMON MPN FAMILIES: AMS1117/LM1117 (classic 1A bipolar), AP2112/AP7115
(low-power CMOS), MIC5219/MIC5205 (Microchip µCap), TPS735x/TPS736x (TI),
RT9013/RT9080 (Richtek), HT7333 (battery µA-class).
`.trim();

const C2_SWITCHING_REGS = `
TOPOLOGY — HARD GATE: buck (step-down), boost (step-up), buck-boost (either
direction), SEPIC, flyback (isolated), forward (isolated), full-bridge,
half-bridge, push-pull. NEVER cross topologies. A buck and a boost are
different power-stage architectures with different inductor placement,
diode/sync-rect placement, and feedback topology. Cross-topology
replacement is a board redesign, not a part swap.
ARCHITECTURE SUB-GATE — integrated (built-in power MOSFET) vs controller
(external MOSFETs required). Digikey splits these: "DC DC Switching
Regulators" = integrated; "DC DC Switching Controllers" = controller-only.
Integrated and controller variants of the same topology are NOT drop-in:
controllers need external FETs + gate-drive design.
SWITCHING FREQUENCY (fsw) — context-dependent and tightly tied to inductor
and output cap selection. Replacement must be within ±10% of original or
the L/C values are wrong. Some parts have programmable fsw (RT pin) — must
preserve that flexibility.
Vref FOR FEEDBACK — critical for adjustable outputs. Vref typically 0.6V,
0.8V, or 1.0V; the feedback divider was sized for the original Vref. A
replacement with a different Vref changes the output voltage by the same
ratio — silent failure unless the divider is recalculated.
SYNCHRONOUS RECTIFICATION vs ASYNCHRONOUS — sync uses an integrated low-side
FET (better efficiency, no Schottky needed); async uses an external Schottky
diode. Substitution across this boundary requires board change.
COMMON MPN FAMILIES: TPS54xxx (TI integrated buck), LM5xxx (TI controller),
LT3xxx (LT/ADI), MP1xxx (Monolithic Power), AOZ1xxx (AOS), SY8120/SY8088
(Silergy buck), RT8xxx (Richtek), MIC2xxx (Microchip).
`.trim();

const F1_RELAYS = `
COIL VOLTAGE — IDENTITY, NOT THRESHOLD. A 12V-coil relay cannot replace a
24V-coil relay (won't pull in) and a 5V-coil relay cannot replace a 12V-coil
relay (coil overheats). Must match exactly. The MPN often encodes coil
voltage as a suffix (-12VDC, -DC12, -012, -DC024).
CONTACT FORM — HARD GATE: SPST-NO (Form A), SPST-NC (Form B), SPDT (Form C),
DPST, DPDT. These define wiring topology. NEVER cross-substitute.
CONTACT RATING — safety-critical, threshold gte: replacement contact_current
and contact_voltage must equal or exceed original. DERATE for inductive
loads (×1.5 for solenoids/contactors) and motor loads (×2 typical, ×6 for
LRA inrush). AC vs DC contact rating NOT INTERCHANGEABLE — DC arcs have no
zero-crossing; a 250VAC-rated relay may be only 30VDC.
CONTACT MATERIAL — dry-circuit failure mode: relays switching <100mA
(signal-level loads — RTDs, opto inputs, low-power MCU interfaces) need
gold-clad contacts. Silver contacts oxidize and form insulating film at
low currents, causing intermittent open-circuit. AgNi, AgCdO are for power
switching, not signal.
COIL DRIVE — coil_resistance + coil_current — critical when GPIO directly
drives the coil (MCU pin can source 8-25mA only). High-resistance coil
(20mA pull-in) safe to drive; low-resistance (60mA+) needs transistor.
COMMON MPN FAMILIES: Omron G2R/G5LE/G5Q/G5V/G6K, TE V23084/RT2/T9A,
Panasonic JS/JW/TQ, Fujitsu FTR, Hongfa HF115F/HF14FW, Songle SRD/SRA
(very common in Chinese designs).
`.trim();

/** Hand-written initial cards — fallback used when no DB row exists for a
 *  family. Once an admin clicks "Regenerate" on one of these via the Domain
 *  Cards admin panel, the resulting DB row shadows the TS constant. New
 *  families never seen here are written to DB only. */
export const ATLAS_FAMILY_DOMAIN_CARDS: Record<string, string> = {
  C3: C3_GATE_DRIVERS,
  C5: C5_LOGIC_ICS,
  B5: B5_MOSFETS,
  B6: B6_BJTS,
  C1: C1_LDOS,
  C2: C2_SWITCHING_REGS,
  F1: F1_RELAYS,
};

// ─── DB-backed loader with TS fallback ──────────────────────────────
//
// Cards live in `atlas_family_domain_cards` (status='active'). The TS
// constants above serve as a fallback for the 7 hand-written initial
// cards so the system works out-of-the-box without any DB rows. A DB
// row with status='active' SHADOWS the TS fallback for that family.
//
// Cache lifecycle: 60s in-memory, cleared via invalidateDomainCardCache()
// after an admin write. Mirrors the alias/override cache pattern.

import { createServiceClient } from '@/lib/supabase/service';
import type { CardAuditResult } from './atlasFamilyCardAuditTypes';

interface DomainCardCacheEntry {
  cards: Map<string, string>;
  expiresAt: number;
}
let cardCache: DomainCardCacheEntry | null = null;
const CARD_CACHE_TTL_MS = 60_000;

async function loadActiveCardsFromDb(): Promise<Map<string, string>> {
  const cards = new Map<string, string>();
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('atlas_family_domain_cards')
      .select('family_id, card_text')
      .eq('status', 'active');
    if (error || !data) return cards;
    for (const row of data) {
      const fam = row.family_id as string;
      const text = row.card_text as string;
      if (fam && text) cards.set(fam, text);
    }
  } catch {
    // Fail-open — TS fallback still applies.
  }
  return cards;
}

/** Returns the per-family domain card for a given familyId, or undefined.
 *  Async because it consults the DB first, falling back to the TS constant.
 *  Cached 60s in memory; calls during a single Triage page hit are batched
 *  effectively. L2 categories never have cards. */
export async function getFamilyDomainCard(familyId: string | null | undefined): Promise<string | undefined> {
  if (!familyId) return undefined;
  const now = Date.now();
  if (!cardCache || now >= cardCache.expiresAt) {
    const cards = await loadActiveCardsFromDb();
    cardCache = { cards, expiresAt: now + CARD_CACHE_TTL_MS };
  }
  // DB row shadows TS fallback; both fall through to undefined for
  // families that have no card anywhere.
  return cardCache.cards.get(familyId) ?? ATLAS_FAMILY_DOMAIN_CARDS[familyId];
}

/** Invalidate the in-memory cache. Call after any admin write
 *  (generate / approve / archive) so the next Triage call sees the
 *  updated content. */
export function invalidateDomainCardCache(): void {
  cardCache = null;
}

// ─── Admin listing helpers ──────────────────────────────────────────

/** Compact summary of the inputs Opus saw at draft-generation time.
 *  Surfaced in the admin drawer so engineers can audit "what did the
 *  generator know about this family?" before approving. The full
 *  rules/overrides/etc. text is NOT included — just counts. */
export interface DomainCardDataSnapshot {
  ruleCount?: number;
  acceptedCount?: number;
  signatureCount?: number;
  crossFamilyCount?: number;
  generatedAt?: string;
  /** Phase 1 of Decision #192 — atlas_products counts captured at draft
   *  time. Phase 2 (Decision #192 follow-up shipped May 19, 2026) compares
   *  these against current atlas state to surface grounding-drift in the
   *  Health chip without waiting for flagCount to accumulate. */
  groundedAtProductCount?: number;
  groundedAtMfrCount?: number;
  verifiedMfrCount?: number;
  chineseDictEntryCount?: number;
  /** Composite-card format version. 2 = deterministic facts region +
   *  AI narrative region (sentinel-delimited, see atlasFamilyCardFacts.ts).
   *  Absent/undefined on legacy all-prose cards (treated as v1). */
  cardFormatVersion?: number;
  /** ISO timestamp of when the deterministic facts region was rendered. */
  factsRenderedAt?: string;
}

/** Health rollup for a family card. Surfaces in the admin panel so the
 *  engineer can see at a glance which cards likely need refreshing.
 *
 *  Tiers (in priority order — sort the panel by this rank):
 *  - 'no-card': no card exists for this family (DB or TS) — should be GENERATED
 *  - 'refresh-recommended': strong signals — 10+ self-flags OR 5+ rule drift
 *  - 'consider-refresh': moderate signals — 3-9 self-flags OR 1-4 rule drift
 *  - 'ok': no signals
 *  - 'no-data': not enough Triage traffic to assess (only applies to fresh cards) */
export type DomainCardHealth =
  | 'no-card'
  | 'refresh-recommended'
  | 'consider-refresh'
  | 'ok'
  | 'no-data';

export interface DomainCardHealthDetail {
  level: DomainCardHealth;
  /** Number of /suggest self-flags for this family in the last 30 days. */
  flagCount: number;
  /** Number of logic-table rules added since the card was generated. 0
   *  for Built-in cards (we don't track their original rule count). */
  ruleDrift: number;
  /** Atlas product-count drift since this card was generated. Positive =
   *  new products landed. 0 for cards without a grounding snapshot
   *  (Built-in TS cards + DB cards generated before Phase 1 of #192). */
  groundingProductDrift: number;
  /** Atlas distinct-MFR-count drift since this card was generated. */
  groundingMfrDrift: number;
  /** One-line plain-English reason for the level — used as the tooltip. */
  reason: string;
}

export interface DomainCardListEntry {
  familyId: string;
  /** 'db' = DB row (any status); 'ts' = falling back to hand-written
   *  TS constant; 'none' = no card exists anywhere. */
  source: 'db' | 'ts' | 'none';
  status: 'draft' | 'active' | 'archived' | null;
  cardText: string | null;
  modelUsed: string | null;
  updatedAt: string | null;
  dataSnapshot: DomainCardDataSnapshot | null;
  health: DomainCardHealthDetail;
  /** Persisted output of atlasFamilyCardAudit.ts (Decision #195 Phase 2).
   *  Null for never-audited rows (no DB row, or row pre-dates audit_results
   *  column, or row from a Generate that ran before the column was added). */
  auditResults: CardAuditResult | null;
  /** Snapshot of card_text BEFORE the current version was written.
   *  Populated on each Regenerate / cardText-PATCH. Null on first generation.
   *  Powers the "Diff vs prior" view in the admin UI. */
  previousCardText: string | null;
  previousUpdatedAt: string | null;
  previousAuditResults: CardAuditResult | null;
}

/** Read every DB row (any status) keyed by family_id. Bypasses the
 *  60s-active-only cache; used by admin listing endpoints that need
 *  full metadata. */
export async function listAllDomainCardRows(): Promise<Map<string, {
  status: 'draft' | 'active' | 'archived';
  cardText: string;
  modelUsed: string | null;
  updatedAt: string;
  dataSnapshot: DomainCardDataSnapshot | null;
  auditResults: CardAuditResult | null;
  previousCardText: string | null;
  previousUpdatedAt: string | null;
  previousAuditResults: CardAuditResult | null;
}>> {
  const out = new Map<string, {
    status: 'draft' | 'active' | 'archived';
    cardText: string;
    modelUsed: string | null;
    updatedAt: string;
    dataSnapshot: DomainCardDataSnapshot | null;
    auditResults: CardAuditResult | null;
    previousCardText: string | null;
    previousUpdatedAt: string | null;
    previousAuditResults: CardAuditResult | null;
  }>();
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('atlas_family_domain_cards')
      .select('family_id, card_text, status, model_used, updated_at, data_snapshot, audit_results, previous_card_text, previous_updated_at, previous_audit_results');
    if (error || !data) return out;
    for (const row of data) {
      const fam = row.family_id as string;
      if (!fam) continue;
      out.set(fam, {
        status: row.status as 'draft' | 'active' | 'archived',
        cardText: row.card_text as string,
        modelUsed: (row.model_used as string | null) ?? null,
        updatedAt: row.updated_at as string,
        dataSnapshot: (row.data_snapshot as DomainCardDataSnapshot | null) ?? null,
        auditResults: (row.audit_results as CardAuditResult | null) ?? null,
        previousCardText: (row.previous_card_text as string | null) ?? null,
        previousUpdatedAt: (row.previous_updated_at as string | null) ?? null,
        previousAuditResults: (row.previous_audit_results as CardAuditResult | null) ?? null,
      });
    }
  } catch {
    // Fail-open
  }
  return out;
}

/** Aggregate /suggest self-flags per family over the last `windowDays` days.
 *  Returns a map of familyId → flag count. Empty map on DB error
 *  (fail-open — health rollup degrades to "no flags counted"). */
export async function fetchFlagCountsByFamily(windowDays = 30): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    const supabase = createServiceClient();
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
    // We don't need every row — just counts. PostgREST doesn't directly
    // support GROUP BY, so we fetch the family_id column and tally
    // client-side. 30-day window keeps the row count bounded.
    const { data, error } = await supabase
      .from('atlas_ai_context_flags')
      .select('family_id')
      .gte('flagged_at', since);
    if (error || !data) return out;
    for (const row of data) {
      const fam = row.family_id as string;
      if (!fam) continue;
      out.set(fam, (out.get(fam) ?? 0) + 1);
    }
  } catch {
    // Fail-open
  }
  return out;
}

/** Phase 2 of Decision #192 — fetch CURRENT atlas product + MFR counts
 *  per family in one round-trip via the all-families grounding RPC.
 *  Used by the Domain Cards panel to compute grounding-drift signal
 *  (compare snapshot saved at card-gen time vs current atlas state).
 *  Fail-open: returns empty map on DB error so health degrades gracefully. */
export async function fetchCurrentGroundingCountsByFamily(): Promise<Map<string, { productCount: number; mfrCount: number }>> {
  const out = new Map<string, { productCount: number; mfrCount: number }>();
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc('get_atlas_all_family_grounding_counts');
    if (error || !data) return out;
    for (const row of data as Array<{ family_id: string; product_count: number | string; mfr_count: number | string }>) {
      out.set(row.family_id, {
        productCount: Number(row.product_count),
        mfrCount: Number(row.mfr_count),
      });
    }
  } catch {
    // Fail-open
  }
  return out;
}

/** Compute the health rollup for a single family card.
 *  Inputs are pre-fetched so the caller can batch the underlying queries. */
export function computeDomainCardHealth(args: {
  source: 'db' | 'ts' | 'none';
  status: 'draft' | 'active' | 'archived' | null;
  dataSnapshot: DomainCardDataSnapshot | null;
  currentRuleCount: number;
  flagCount: number;
  currentGroundingCounts?: { productCount: number; mfrCount: number };
}): DomainCardHealthDetail {
  const { source, status, dataSnapshot, currentRuleCount, flagCount, currentGroundingCounts } = args;

  // No card at all — top of the priority list. The engineer should
  // Generate one before worrying about anything else.
  //
  // Phase 2 follow-up (May 19, 2026): surface atlas-volume drift even for
  // no-card families. Without this, a family with 1,200 products from 20
  // MFRs but no card looked identical to a dormant zero-products family —
  // operators had no signal which uncarded families were urgent.
  // Now: reason text names the current volume; route sorts no-card
  // families by product count desc so high-volume ones bubble up.
  if (source === 'none') {
    const productCount = currentGroundingCounts?.productCount ?? 0;
    const mfrCount = currentGroundingCounts?.mfrCount ?? 0;
    const baseReason = 'No card exists for this family yet.';
    let reason: string;
    if (productCount === 0) {
      reason = `${baseReason} Family is dormant (zero atlas products) — no card needed unless atlas ingest pulls it in later.`;
    } else if (productCount >= 500) {
      reason = `${baseReason} HIGH PRIORITY: atlas has ${productCount.toLocaleString()} products from ${mfrCount} MFR${mfrCount === 1 ? '' : 's'} under this family with no domain coverage. Click Generate ASAP — Triage AI lacks context for these products.`;
    } else if (productCount >= 100) {
      reason = `${baseReason} MEDIUM PRIORITY: atlas has ${productCount.toLocaleString()} products from ${mfrCount} MFR${mfrCount === 1 ? '' : 's'} under this family. Click Generate when convenient.`;
    } else {
      reason = `${baseReason} LOW PRIORITY: atlas has ${productCount} products from ${mfrCount} MFR${mfrCount === 1 ? '' : 's'} under this family. Card optional for now.`;
    }
    return {
      level: 'no-card',
      flagCount,
      ruleDrift: 0,
      // For no-card families, current volume IS the drift (vs zero baseline).
      // Surfacing as drift fields lets sort/filter logic treat it uniformly
      // with carded families' drift.
      groundingProductDrift: productCount,
      groundingMfrDrift: mfrCount,
      reason,
    };
  }

  // Compute rule drift only when we have a snapshot (DB cards generated
  // via /generate). Built-in cards and /customize-seeded drafts have no
  // snapshot, so drift is 0 (we can't tell when they were written).
  const snapshotRuleCount = dataSnapshot?.ruleCount;
  const ruleDrift = typeof snapshotRuleCount === 'number'
    ? Math.max(0, currentRuleCount - snapshotRuleCount)
    : 0;

  // Phase 2 of #192 — compute grounding drift (product + MFR counts vs
  // snapshot). Only meaningful for DB cards generated via /generate
  // post-Phase-1; older cards + Built-in TS cards have no snapshot fields.
  // Negative drift (atlas shrunk) is clamped to 0 — only growth signals
  // a regenerate need; shrinkage is informational and rarely happens
  // outside of revert flows.
  const snapshotProductCount = dataSnapshot?.groundedAtProductCount;
  const snapshotMfrCount = dataSnapshot?.groundedAtMfrCount;
  const groundingProductDrift = (typeof snapshotProductCount === 'number' && currentGroundingCounts)
    ? Math.max(0, currentGroundingCounts.productCount - snapshotProductCount)
    : 0;
  const groundingMfrDrift = (typeof snapshotMfrCount === 'number' && currentGroundingCounts)
    ? Math.max(0, currentGroundingCounts.mfrCount - snapshotMfrCount)
    : 0;

  // Archived cards: don't show health alerts. The engineer explicitly
  // retired the card.
  if (status === 'archived') {
    return {
      level: 'ok',
      flagCount,
      ruleDrift,
      groundingProductDrift,
      groundingMfrDrift,
      reason: 'Card is archived.',
    };
  }

  // Reason text must be honest about which action helps. Regenerate
  // rewrites card content (addresses ruleDrift, refreshes grounding
  // cohort) but does NOT clear flagCount — flags are AI-emitted by
  // Sonnet on /suggest calls when it self-flags "needsDomainCard:true"
  // for a paramName. They drop ONLY via (a) the 30-day rolling window
  // ageing them out, OR (b) future /suggest calls stopping the bleed
  // because the regenerated card now has enough context that Sonnet
  // no longer flags. Engineers can't directly resolve these flags;
  // they're automatic self-correcting signals.
  //
  // groundingDrift IS cleared by regeneration — the new card writes a
  // fresh snapshot. So the reason text explicitly says "Regenerate clears
  // this" for drift contributors.
  function buildReason(parts: {
    flagPart: string | null;
    drifPart: string | null;
    groundPart: string | null;
  }, level: string): string {
    const segs: string[] = [];
    if (parts.flagPart) segs.push(parts.flagPart);
    if (parts.drifPart) segs.push(parts.drifPart);
    if (parts.groundPart) segs.push(parts.groundPart);
    const summary = segs.join(' · ');
    const actions: string[] = [];
    if (parts.drifPart) actions.push('Regenerate rewrites the card with the latest rules');
    if (parts.groundPart) actions.push('Regenerate refreshes the MFR cohort and sample MPNs against current atlas data');
    if (parts.flagPart) actions.push('flag count drops as the 30-day window ages out OR as future /suggest calls stop self-flagging (regenerated cards typically generate fewer flags going forward) — regeneration does NOT immediately clear flags');
    return `${level}: ${summary}. ${actions.join('. ')}.`;
  }

  // Thresholds for grounding drift. Tuned conservatively — a single MFR
  // landing under a family is enough to surface yellow; meaningful
  // product-cohort growth (≥500) escalates to red.
  const groundingStrong = groundingMfrDrift >= 3 || groundingProductDrift >= 500;
  const groundingModerate = groundingMfrDrift >= 1 || groundingProductDrift >= 100;

  // Strong signal tier.
  if (flagCount >= 10 || ruleDrift >= 5 || groundingStrong) {
    return {
      level: 'refresh-recommended',
      flagCount,
      ruleDrift,
      groundingProductDrift,
      groundingMfrDrift,
      reason: buildReason({
        flagPart: flagCount >= 10 ? `${flagCount} self-flags in the last 30 days` : null,
        drifPart: ruleDrift >= 5 ? `${ruleDrift} new logic-table rules added since this card was written` : null,
        groundPart: groundingStrong ? `${groundingMfrDrift} new MFR${groundingMfrDrift === 1 ? '' : 's'} + ${groundingProductDrift.toLocaleString()} new product${groundingProductDrift === 1 ? '' : 's'} since this card was grounded` : null,
      }, 'Refresh recommended'),
    };
  }

  // Moderate signal tier.
  if (flagCount >= 3 || ruleDrift >= 1 || groundingModerate) {
    return {
      level: 'consider-refresh',
      flagCount,
      ruleDrift,
      groundingProductDrift,
      groundingMfrDrift,
      reason: buildReason({
        flagPart: flagCount >= 3 ? `${flagCount} self-flags in the last 30 days` : null,
        drifPart: ruleDrift >= 1 ? `${ruleDrift} new rule${ruleDrift === 1 ? '' : 's'} added` : null,
        groundPart: groundingModerate ? `${groundingMfrDrift} new MFR${groundingMfrDrift === 1 ? '' : 's'} + ${groundingProductDrift.toLocaleString()} new product${groundingProductDrift === 1 ? '' : 's'} since this card was grounded` : null,
      }, 'Consider refresh'),
    };
  }

  return {
    level: 'ok',
    flagCount,
    ruleDrift,
    groundingProductDrift,
    groundingMfrDrift,
    reason: flagCount === 0 && ruleDrift === 0 && groundingProductDrift === 0 && groundingMfrDrift === 0
      ? 'No issues detected.'
      : `OK — ${flagCount} self-flag${flagCount === 1 ? '' : 's'}, ${ruleDrift} rule drift, ${groundingProductDrift.toLocaleString()} grounding-product drift.`,
  };
}
