/**
 * Atlas Family Param Signatures — registry of parameter names that belong
 * unambiguously to a specific component family.
 *
 * When an unmapped parameter shows up under a different family, the product
 * was almost certainly misclassified upstream (Yangjie miscategorized it, or
 * our c3-based classifier picked the wrong family). The registry powers two
 * consumers off a single source of truth:
 *
 *   1. Triage queue auto-flag — surfaces the misclassification to engineers
 *      without manual hunting (app/api/admin/atlas/ingest/batches/route.ts).
 *   2. Ingest classifier auto-fix — re-routes affected products to the correct
 *      family on next ingest (atlasMapper.ts → reclassifyByParameterSignals
 *      + scripts/atlas-ingest.mjs mirror).
 *
 * Adding a new entry:
 *   - Pattern must match the raw paramName (case-insensitive flag added).
 *   - Anchor patterns to start (^...) and use (?![A-Za-z0-9]) for the trailing
 *     boundary — NOT \b. JavaScript regex treats `_` as a `\w` character, so
 *     `\b` does NOT match between letters and underscores (e.g. /^hfe\b/i
 *     fails on `hfe_min`). The (?![A-Za-z0-9]) negative lookahead correctly
 *     handles `_`, paren, space, and end-of-string. (Existing patterns with
 *     `[\s_(]*` are also correct — they accept the separators explicitly.)
 *   - Reasoning is shown to engineers in the diagnosis card — be specific
 *     enough that someone reading it understands why this parameter has no
 *     business in another family.
 *   - When you add an entry, also confirm the destination family's translation
 *     dictionary covers the trigger parameter — otherwise reclassified products
 *     surface the same param as unmapped under the new family.
 *   - If the param is not strictly target-family-unique (e.g. Ic is shared
 *     between BJTs and IGBTs; fT is shared between BJTs and RF MOSFETs), add
 *     requiresAlsoMatching: [<patterns for strictly-unique target signals>]
 *     so the signature only fires when a co-occurring guarantor is present
 *     on the same product. Triage callers (per-paramName) skip cooccurrence-
 *     required signatures since they can't evaluate cross-param context.
 *
 * Conservatism: keep entries narrow (param names with no overlap across
 * families). When the list grows past ~20 entries OR non-engineers need to
 * edit it, lift to a Supabase table.
 */

import type { ComponentCategory } from '../types';

/** Shape mirrored from the local FamilyClassification type in atlasMapper.ts.
 *  Kept narrow (familyId required, not nullable) since signature targets are
 *  always concrete families, never the L2-display fallback. */
export interface SignatureTarget {
  category: ComponentCategory;
  subcategory: string;
  familyId: string;
}

export interface ParamSignature {
  /** Matched against the raw unmapped paramName (case-insensitive). */
  pattern: RegExp;
  /** Family the parameter actually belongs to. */
  target: SignatureTarget;
  /** One-sentence rationale shown in the diagnosis card. */
  reasoning: string;
  /**
   * Product-level cooccurrence guard. If set, the signature only fires when
   * at least one OTHER paramName on the same product matches at least one
   * of these patterns. Use for params shared across families (Ic on BJTs +
   * IGBTs, fT on BJTs + RF MOSFETs) where the standalone signal isn't
   * decisive.
   *
   * Per-paramName callers (Triage UI's detectForeignFamilyWithList) cannot
   * evaluate cooccurrence and will skip these signatures entirely. The
   * ingest-time reclassifier in atlasMapper.ts has the full product param
   * list and applies the guard.
   */
  requiresAlsoMatching?: RegExp[];
}

/**
 * Strictly-unique BJT signals — the cooccurrence guarantor list for the Ic
 * and fT signatures below. A param matching one of these on the same product
 * is the only way Ic / fT alone can trigger B6 reclassification.
 */
const BJT_UNIQUE_COOCCURRENCE_PATTERNS: RegExp[] = [
  /^hfe(?![A-Za-z0-9])/i,
  /^b?(?:vcbo|vceo|vebo)(?![A-Za-z0-9])/i,
];

/**
 * Strictly-unique MOSFET signals — the cooccurrence guarantor list for the
 * Vgs(th) and Qg signatures below. MOSFETs and IGBTs both have voltage-
 * controlled gates, so both spec Vgs(th) AND gate charge (Qg/Qgs/Qgd).
 * Rds(on) is the ONLY truly MOSFET-unique signal — IGBTs are bipolar
 * conduction, no channel resistance. May 27, 2026: surfaced by Check B
 * of scripts/atlas-family-signatures-validate.mjs which found 128 CREATEK
 * IGBTs misrouted via Vgs(th) AND 27 CRMICRO IGBTs misrouted via Qg.
 * Tightening to Rds(on)-only means a MOSFET that ships data with only
 * Vgs(th) / Qg (no Rds(on)) won't auto-reclassify — rare in practice
 * since Rds(on) is virtually always specified.
 */
const MOSFET_UNIQUE_COOCCURRENCE_PATTERNS: RegExp[] = [
  /^rds[\s_(]*on/i,
];

/**
 * Strictly-unique IGBT signals — the cooccurrence guarantor list for the
 * Vce(sat) signature. BJTs also spec Vce(sat) (saturation voltage in
 * switching applications), so standalone Vce(sat) does not prove IGBT.
 * Vces (collector-emitter sustaining voltage) and Eon/Eoff/Ets (switching
 * energy per pulse) are IGBT-specific — BJTs don't characterize either.
 * May 27, 2026: surfaced by WPMSEMI dry-run which found the 5 known BJTs
 * sitting in B7 (HFT3837/HFT3838/HFT4083*) would re-route back to B7 via
 * VCE(sat)_Max (V) instead of correctly settling at B6 from their c3.
 */
const IGBT_UNIQUE_COOCCURRENCE_PATTERNS: RegExp[] = [
  /^vces(?![A-Za-z0-9])/i,
  /^(?:eon|eoff|ets)(?![A-Za-z0-9])/i,
];

export const FAMILY_PARAM_SIGNATURES: ParamSignature[] = [
  // ─── B6 BJTs ───
  {
    pattern: /^b?(?:vcbo|vceo|vebo)(?![A-Za-z0-9])/i,
    target: { category: 'Transistors', subcategory: 'BJT', familyId: 'B6' },
    reasoning: 'Collector/base/emitter breakdown voltage (VCBO/VCEO/VEBO, optionally B-prefixed as BVCBO/BVCEO/BVEBO). The "O" suffix means "open" terminal (open-base or open-emitter) — a BJT-specific measurement condition. IGBTs use Vces/Vcesat (no O suffix); diodes have no collector/base/emitter. Confirmed via KEXIN BC857S/KC847BS/BC847PN/BC856S/KTC601U (classic BC8xx-series BJTs) misrouted to B7 because the prior pattern required the B prefix that most datasheets omit.',
  },
  {
    pattern: /^@?ic(?![A-Za-z0-9])/i,
    target: { category: 'Transistors', subcategory: 'BJT', familyId: 'B6' },
    reasoning: 'Collector current (Ic) is shared between BJTs and IGBTs — both spec it. Standalone Ic is not decisive; the cooccurrence guard requires a strictly-unique BJT signal (hfe / vcbo / vceo / vebo) on the same product before flipping the family. Without the guard, legitimate B7 IGBTs (which routinely spec ic_max) would be mis-routed to B6.',
    requiresAlsoMatching: BJT_UNIQUE_COOCCURRENCE_PATTERNS,
  },
  {
    pattern: /^hfe(?![A-Za-z0-9])/i,
    target: { category: 'Transistors', subcategory: 'BJT', familyId: 'B6' },
    reasoning: 'Forward current gain (hFE / β) is BJT-specific — gain has no meaning for a passive diode or an IGBT (which is voltage-controlled).',
  },
  {
    pattern: /^ft(?![A-Za-z0-9])/i,
    target: { category: 'Transistors', subcategory: 'BJT', familyId: 'B6' },
    reasoning: 'fT (transition frequency / unity-gain bandwidth) is a defining small-signal BJT spec, typically 80–500 MHz. IGBTs do not spec fT — switching speed is characterized by Eon/Eoff instead. Cooccurrence guard added because high-frequency RF MOSFETs may also spec fT — flipping to B6 requires a strictly-unique BJT signal (hfe / vcbo / vceo / vebo) on the same product.',
    requiresAlsoMatching: BJT_UNIQUE_COOCCURRENCE_PATTERNS,
  },
  // ─── B5 MOSFETs ───
  {
    pattern: /^rds[\s_(]*on/i,
    target: { category: 'Transistors', subcategory: 'MOSFET', familyId: 'B5' },
    reasoning: 'On-resistance Rds(on) is MOSFET-specific — characterizes the channel resistance of a FET in saturation.',
  },
  {
    pattern: /^vgs[\s_(]*(th|threshold)/i,
    target: { category: 'Transistors', subcategory: 'MOSFET', familyId: 'B5' },
    reasoning: 'Vgs(th) is shared between MOSFETs and IGBTs (both have voltage-controlled gates). Cooccurrence guard requires a strictly-unique MOSFET signal (Rds(on) or gate charge) before flipping family. Without the guard, legitimate IGBTs that spec Vgs(th) alongside Vce(sat) get misrouted to B5 — surfaced May 27, 2026 by Check B of atlas-family-signatures-validate.mjs (128 CREATEK IGBTs).',
    requiresAlsoMatching: MOSFET_UNIQUE_COOCCURRENCE_PATTERNS,
  },
  {
    pattern: /^q(?:g|gs|gd)(?![A-Za-z0-9])/i,
    target: { category: 'Transistors', subcategory: 'MOSFET', familyId: 'B5' },
    reasoning: 'Gate charge (Qg / Qgs / Qgd) is shared between MOSFETs and IGBTs (both have voltage-controlled gates with charge-storage characterization). Requires Rds(on) cooccurrence to confirm MOSFET — without the guard, legitimate IGBTs that spec qg_ic_vge alongside vce_sat get misrouted to B5. Surfaced May 27, 2026 by Check B of atlas-family-signatures-validate.mjs (27 CRMICRO IGBTs).',
    requiresAlsoMatching: MOSFET_UNIQUE_COOCCURRENCE_PATTERNS,
  },
  // ─── B7 IGBTs ───
  {
    pattern: /^vce[\s_(]*sat/i,
    target: { category: 'Transistors', subcategory: 'IGBT', familyId: 'B7' },
    reasoning: 'Vce(sat) is shared between BJTs and IGBTs (both spec saturation voltage in switching applications). Requires cooccurrence with truly IGBT-unique signal (Vces or Eon/Eoff/Ets) to confirm IGBT. Without the guard, BJTs that spec Vce(sat) (e.g. switching BJTs like HFT3837 from WPMSEMI) get misrouted to B7. Surfaced May 27, 2026 by WPMSEMI dry-run.',
    requiresAlsoMatching: IGBT_UNIQUE_COOCCURRENCE_PATTERNS,
  },
  {
    pattern: /^(?:eon|eoff|ets)(?![A-Za-z0-9])/i,
    target: { category: 'Transistors', subcategory: 'IGBT', familyId: 'B7' },
    reasoning: 'Switching energy (Eon / Eoff / Ets) is IGBT-specific — characterizes turn-on/turn-off losses per pulse.',
  },
  // ─── B9 JFETs ───
  {
    pattern: /^idss(?![A-Za-z0-9])/i,
    target: { category: 'Transistors', subcategory: 'JFET', familyId: 'B9' },
    reasoning: 'Saturation drain current Idss is JFET-specific — current at Vgs=0 in a depletion-mode FET.',
  },
  // ─── E1 Optocouplers ───
  {
    pattern: /^ctr(?![A-Za-z0-9])/i,
    target: { category: 'Optocouplers', subcategory: 'Optocoupler', familyId: 'E1' },
    reasoning: 'Current Transfer Ratio (CTR) is optocoupler-specific — ratio of output collector current to input LED current.',
  },
  {
    pattern: /^viso(?![A-Za-z0-9])/i,
    target: { category: 'Optocouplers', subcategory: 'Optocoupler', familyId: 'E1' },
    reasoning: 'Isolation voltage Viso is optocoupler / digital-isolator specific — characterizes input-output dielectric strength.',
  },
];

/**
 * Returns the first matching signature whose target family differs from the
 * current family, or null. A signature whose target equals the current family
 * is not a foreign-family signal — keep it null so unmapped params under the
 * correct family follow the synonym workflow as usual.
 *
 * Variant that takes an explicit signatures list — use this when the caller
 * has loaded merged code+DB signatures via loadAllFamilyParamSignatures().
 *
 * Per-paramName limitation: cooccurrence-required signatures (those with
 * requiresAlsoMatching) are skipped here because evaluating cooccurrence
 * needs the full product param list, which a per-paramName caller (Triage
 * UI) does not have. The ingest-time reclassifier in atlasMapper.ts has
 * product context and applies cooccurrence correctly.
 */
export function detectForeignFamilyWithList(
  paramName: string,
  currentFamily: string | null,
  signatures: ParamSignature[],
): ParamSignature | null {
  if (!currentFamily) return null;
  const trimmed = paramName.trim();
  for (const sig of signatures) {
    if (sig.requiresAlsoMatching?.length) continue; // cannot evaluate per-paramName
    if (sig.pattern.test(trimmed) && sig.target.familyId !== currentFamily) {
      return sig;
    }
  }
  return null;
}

/** Code-only variant — used by call sites that intentionally want the
 *  audited baseline without the DB merge (e.g. reclassifyByParameterSignals
 *  in atlasMapper.ts, which runs at search-time). */
export function detectForeignFamily(
  paramName: string,
  currentFamily: string | null,
): ParamSignature | null {
  return detectForeignFamilyWithList(paramName, currentFamily, FAMILY_PARAM_SIGNATURES);
}

// ─── DB-merge layer ────────────────────────────────────────────────
// Loads engineer-curated rows from atlas_family_param_signatures and
// merges them with the code baseline. Code wins on duplicate
// (pattern source, targetFamilyId) so accidental DB rows can't
// override audited behavior. Cached 5 min.

interface CachedSignatures {
  signatures: ParamSignature[];
  expiresAt: number;
}

let signaturesCache: CachedSignatures | null = null;
const SIGNATURES_TTL_MS = 5 * 60 * 1000;

/** Force a refetch on the next loadAllFamilyParamSignatures() call.
 *  Called by the POST endpoint after a successful insert so the
 *  Triage queue picks up the new signature on its next render. */
export function invalidateFamilyParamSignaturesCache(): void {
  signaturesCache = null;
}

/** Server-only: returns code-defined entries merged with active DB rows. */
export async function loadAllFamilyParamSignatures(): Promise<ParamSignature[]> {
  if (signaturesCache && signaturesCache.expiresAt > Date.now()) {
    return signaturesCache.signatures;
  }

  // Lazy import to keep this module client-importable. The Triage UI
  // pulls types/regexps from here too; only the server-side queue
  // route hits the DB path.
  const { createServiceClient } = await import('@/lib/supabase/service');
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('atlas_family_param_signatures')
    .select('pattern, target_family_id, target_category, target_subcategory, reasoning')
    .eq('is_active', true);

  let dbSigs: ParamSignature[] = [];
  if (!error && Array.isArray(data)) {
    const codePatterns = new Set(
      FAMILY_PARAM_SIGNATURES.map((s) => `${s.pattern.source}::${s.target.familyId}`),
    );
    for (const row of data) {
      const key = `${row.pattern}::${row.target_family_id}`;
      if (codePatterns.has(key)) continue; // Code wins.
      try {
        dbSigs.push({
          pattern: new RegExp(row.pattern as string, 'i'),
          target: {
            category: row.target_category as ComponentCategory,
            subcategory: row.target_subcategory as string,
            familyId: row.target_family_id as string,
          },
          reasoning: row.reasoning as string,
        });
      } catch {
        // Bad regex — skip silently rather than crash the queue.
        // Insert path validates patterns, so this should never fire.
      }
    }
  }

  const merged = [...FAMILY_PARAM_SIGNATURES, ...dbSigs];
  signaturesCache = { signatures: merged, expiresAt: Date.now() + SIGNATURES_TTL_MS };
  return merged;
}
