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
 *   - Anchor patterns to start (^...) and use \b / parentheses to avoid loose
 *     substring matches that fire on unrelated params.
 *   - Reasoning is shown to engineers in the diagnosis card — be specific
 *     enough that someone reading it understands why this parameter has no
 *     business in another family.
 *   - When you add an entry, also confirm the destination family's translation
 *     dictionary covers the trigger parameter — otherwise reclassified products
 *     surface the same param as unmapped under the new family.
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
}

export const FAMILY_PARAM_SIGNATURES: ParamSignature[] = [
  // ─── B6 BJTs ───
  {
    pattern: /^b?(vcbo|vceo|vebo)\b/i,
    target: { category: 'Transistors', subcategory: 'BJT', familyId: 'B6' },
    reasoning: 'Collector/base/emitter breakdown voltage (VCBO/VCEO/VEBO, optionally B-prefixed as BVCBO/BVCEO/BVEBO). The "O" suffix means "open" terminal (open-base or open-emitter) — a BJT-specific measurement condition. IGBTs use Vces/Vcesat (no O suffix); diodes have no collector/base/emitter. Confirmed via KEXIN BC857S/KC847BS/BC847PN/BC856S/KTC601U (classic BC8xx-series BJTs) misrouted to B7 because the prior pattern required the B prefix that most datasheets omit.',
  },
  {
    pattern: /^@?ic\b/i,
    target: { category: 'Transistors', subcategory: 'BJT', familyId: 'B6' },
    reasoning: 'Collector current (Ic) is BJT-specific — diodes carry forward current (If), not collector current.',
  },
  {
    pattern: /^hfe\b/i,
    target: { category: 'Transistors', subcategory: 'BJT', familyId: 'B6' },
    reasoning: 'Forward current gain (hFE / β) is BJT-specific — gain has no meaning for a passive diode.',
  },
  {
    pattern: /^ft\b/i,
    target: { category: 'Transistors', subcategory: 'BJT', familyId: 'B6' },
    reasoning: 'fT (transition frequency / unity-gain bandwidth) is a defining small-signal BJT spec, typically 80–500 MHz. IGBTs do not spec fT — switching speed is characterized by Eon/Eoff instead. Confirmed via KEXIN BC857S/KC847BS/BC847PN/KC856S/KTC601U (classic BC8xx-series small-signal BJTs) misrouted to B7. Note: high-frequency RF MOSFETs may also spec fT — if a future MOSFET ingest gets misrouted to B6 by this pattern, refine to require a BJT-co-occurring param.',
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
    reasoning: 'Gate-source threshold voltage Vgs(th) is MOSFET-specific — diodes and BJTs have no gate.',
  },
  {
    pattern: /^q(g|gs|gd)\b/i,
    target: { category: 'Transistors', subcategory: 'MOSFET', familyId: 'B5' },
    reasoning: 'Gate charge (Qg / Qgs / Qgd) is MOSFET-specific — characterizes gate-drive energy.',
  },
  // ─── B7 IGBTs ───
  {
    pattern: /^vce[\s_(]*sat/i,
    target: { category: 'Transistors', subcategory: 'IGBT', familyId: 'B7' },
    reasoning: 'Collector-emitter saturation voltage Vce(sat) is IGBT-specific (used for conduction-loss spec).',
  },
  {
    pattern: /^(eon|eoff|ets)\b/i,
    target: { category: 'Transistors', subcategory: 'IGBT', familyId: 'B7' },
    reasoning: 'Switching energy (Eon / Eoff / Ets) is IGBT-specific — characterizes turn-on/turn-off losses per pulse.',
  },
  // ─── B9 JFETs ───
  {
    pattern: /^idss\b/i,
    target: { category: 'Transistors', subcategory: 'JFET', familyId: 'B9' },
    reasoning: 'Saturation drain current Idss is JFET-specific — current at Vgs=0 in a depletion-mode FET.',
  },
  // ─── E1 Optocouplers ───
  {
    pattern: /^ctr\b/i,
    target: { category: 'Optocouplers', subcategory: 'Optocoupler', familyId: 'E1' },
    reasoning: 'Current Transfer Ratio (CTR) is optocoupler-specific — ratio of output collector current to input LED current.',
  },
  {
    pattern: /^viso\b/i,
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
 */
export function detectForeignFamilyWithList(
  paramName: string,
  currentFamily: string | null,
  signatures: ParamSignature[],
): ParamSignature | null {
  if (!currentFamily) return null;
  const trimmed = paramName.trim();
  for (const sig of signatures) {
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
