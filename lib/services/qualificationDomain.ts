/**
 * Qualification-domain classification + cross-domain exclusion (Decision #155).
 *
 * AEC-Q200 is a binary weight-bumped rule in the logic table; that alone is not
 * enough to prevent cross-domain substitution. A part's qualification "domain"
 * (automotive / medical_implant / mil_spec / space / ...) is a categorical
 * property — parts from incompatible domains must NEVER cross-substitute even
 * when a vendor's FFF table says they're electrically equivalent.
 *
 * Phase 1 scope: Murata MLCCs only. One classifier registered
 * (`murataMlccClassifier`). Other MFRs return `unknown / no_classifier` and are
 * handled by the ranking tier ("Domain unknown — verify" badge + sort below
 * context-matched).
 *
 * See docs/DECISIONS.md (#155) for rationale, design, and Phase 2 commitments.
 */

import type {
  Part,
  ApplicationContext,
  DomainClassification,
  QualificationDomain,
  UnknownReason,
} from '@/lib/types';

/**
 * A classifier identifies a part's qualification domain from metadata
 * (manufacturer + MPN + existing parametric flags).
 *
 * Phase 2 classifiers (TDK, Samsung, Yageo, KEMET, AVX, Kyocera, Taiyo Yuden)
 * implement this interface and register below.
 */
export interface MfrClassifier {
  /** Case-insensitive MFR name patterns that route to this classifier. */
  manufacturerPatterns: RegExp[];
  /** Returns null when the classifier declines (e.g. wrong family). */
  classify(part: Part): DomainClassification | null;
}

// ────────────────────────────────────────────────────────────────
// REGISTRY
// ────────────────────────────────────────────────────────────────

// Lazy-loaded to avoid circular imports between classifiers and this module.
let _classifiers: MfrClassifier[] | null = null;

function getClassifiers(): MfrClassifier[] {
  if (_classifiers) return _classifiers;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const murataMlcc = require('./classifiers/murataMlcc').murataMlccClassifier as MfrClassifier;
  _classifiers = [murataMlcc];
  return _classifiers;
}

/** Test-only hook: replace the registry (restore with `null`). */
export function __setClassifiersForTest(classifiers: MfrClassifier[] | null): void {
  _classifiers = classifiers;
}

// ────────────────────────────────────────────────────────────────
// CLASSIFICATION
// ────────────────────────────────────────────────────────────────

/**
 * Classify a part into a qualification domain.
 *
 * Order of precedence:
 *   1. Registered MFR classifier's positive result (source=mpn_prefix, high conf).
 *   2. Existing `aec_q200 = true` parametric flag → upgrade unknown →
 *      automotive_q200 (source=attribute_flag, medium confidence).
 *   3. Otherwise unknown with a reason (no_classifier / no_signal).
 *
 * IMPORTANT asymmetry — only the POSITIVE aec_q200 signal upgrades. A part with
 * `aec_q200 = false` that otherwise classifies unknown stays unknown, does NOT
 * downgrade to `commercial`. In practice `aec_q200 = false` in Digikey/parts.io/
 * Atlas data almost always means "field not populated" rather than "confirmed
 * not qualified." Suppressing a legitimate AEC part would be costlier than
 * leaving it at unknown.
 */
export function classifyQualificationDomain(part: Part): DomainClassification {
  // Step 1: try registered classifiers
  const mfr = (part.manufacturer ?? '').trim();
  if (mfr) {
    for (const c of getClassifiers()) {
      if (!c.manufacturerPatterns.some(re => re.test(mfr))) continue;
      const result = c.classify(part);
      if (result && result.domain !== 'unknown') return result;
      // If the classifier returned unknown with a reason, fall through to the
      // attribute-flag signal — the positive attribute should win over a
      // "couldn't decide" verdict.
    }
  }

  // Step 2: aec_q200 = true positive signal → automotive_q200 (medium conf)
  //
  // Note: the attribute lives on PartAttributes.parameters, not on Part directly.
  // Callers that want the attribute upgrade must invoke
  // `upgradeFromAttributes()` below after scoring — we keep this function pure
  // on the part metadata alone so it's safe for any caller.

  // Step 3: unknown with reason
  const hasClassifier = mfr
    ? getClassifiers().some(c => c.manufacturerPatterns.some(re => re.test(mfr)))
    : false;
  return {
    domain: 'unknown',
    confidence: 'low',
    source: 'mpn_prefix',
    reason: hasClassifier ? 'ambiguous_series' : 'no_classifier',
  };
}

/**
 * If the base classification is `unknown` and the part's parameters contain a
 * positive `aec_q200` flag, upgrade to automotive_q200.
 *
 * @param base         Result of `classifyQualificationDomain(part)`.
 * @param aecQ200Value The value of the `aec_q200` parametric attribute. Only
 *                    exact-match strings are treated as positive: `'true'`,
 *                    `'yes'`, `'1'` (case-insensitive). Anything else is
 *                    treated as absence of signal (see asymmetry note above).
 */
export function upgradeFromAttributes(
  base: DomainClassification,
  aecQ200Value: string | undefined,
): DomainClassification {
  if (base.domain !== 'unknown') return base;
  if (!aecQ200Value) return base;
  const normalized = aecQ200Value.trim().toLowerCase();
  const isPositive = normalized === 'true' || normalized === 'yes' || normalized === '1';
  if (!isPositive) return base; // asymmetry: negative/empty stays unknown
  return {
    domain: 'automotive_q200',
    confidence: 'medium',
    source: 'attribute_flag',
    evidence: 'aec_q200 attribute = true',
  };
}

// ────────────────────────────────────────────────────────────────
// COMPATIBILITY MATRIX
// ────────────────────────────────────────────────────────────────

/*
 * Full exclusion matrix. Rows = user-selected context, columns = candidate
 * domain. `X` = hard-exclude, `!` = deviation warning (surface with badge),
 * `.` = match, `?` = unknown (ranked below context-matched, allowed).
 *
 * PHASE 1: only the `automotive` row is wired. Other rows are commented here
 * so Phase 2 devs wiring medical/industrial/space context questions have a
 * locked shape to fill in, not ad-hoc decisions under deadline.
 *
 *                         auto200 ind_hrsh commrcl med_imp med_gen mil_spc space unknown
 *   automotive               .       !        !       X       X       X      X       ?
 *   industrial_harsh         .       .        !       X       X       X      X       ?
 *   medical_general          X       !        !       !       .       X      X       ?
 *   medical_implantable      X       X        X       X       !       X      X       ?
 *   mil_spec                 X       X        X       X       X       .      !       ?
 *   space                    X       X        X       X       X       X      .       ?
 *   (none/consumer)          .       .        .       !       !       !      !       ?
 *
 * Note on automotive_q100 / automotive_q101: reserved in the QualificationDomain
 * type for Phase 2 (Block C ICs / Block B discretes). Same exclusion shape as
 * automotive_q200 — they all sit in the "automotive-qualified" super-domain.
 */

/** Which domains does a user-context imply the candidate must come from (the
 *  "context-expected" set)? Used for deviation flagging and sort tiebreak. */
export function contextExpectedDomains(
  context: ApplicationContext | null | undefined,
): Set<QualificationDomain> {
  const envAnswer = context?.answers?.environment;
  if (envAnswer === 'automotive') {
    return new Set<QualificationDomain>([
      'automotive_q200',
      'automotive_q100',
      'automotive_q101',
    ]);
  }
  // Phase 1: only `automotive` drives domain filtering. Other environment
  // answers (industrial, consumer) + other-family context questions fall
  // through to an empty expected set, which disables all domain gating.
  return new Set();
}

/** Result of a domain-compatibility check. */
export interface DomainCompatibility {
  /** If false, candidate is hard-excluded from results. */
  compatible: boolean;
  /** If true, candidate is compatible but doesn't match the context-expected
   *  set — surface with a deviation badge. */
  deviation: boolean;
  /** Human-readable explanation for the UI tooltip / audit log. */
  reason?: string;
}

/**
 * Check whether a candidate domain is compatible with the user's selected
 * context. Returns a flag for the hard-exclude decision AND for the
 * soft-deviation badge — both are needed downstream.
 *
 * Phase 1 only wires the `automotive` row of the matrix; other contexts
 * return `{ compatible: true, deviation: false }` (no gating).
 */
export function isDomainCompatible(
  context: ApplicationContext | null | undefined,
  candidateDomain: QualificationDomain,
): DomainCompatibility {
  const envAnswer = context?.answers?.environment;

  // Unknown always passes the hard-exclude check; deviation is never flagged
  // on unknown (it's a ranking signal, not a confirmed mismatch).
  if (candidateDomain === 'unknown') {
    return { compatible: true, deviation: false };
  }

  if (envAnswer === 'automotive') {
    // Hard-exclude: medical (both), mil-spec, space
    if (
      candidateDomain === 'medical_implant' ||
      candidateDomain === 'medical_general' ||
      candidateDomain === 'mil_spec' ||
      candidateDomain === 'space'
    ) {
      return {
        compatible: false,
        deviation: false,
        reason: `Candidate qualified for ${humanReadable(candidateDomain)} — cannot substitute into automotive application`,
      };
    }
    // Context-matched
    if (
      candidateDomain === 'automotive_q200' ||
      candidateDomain === 'automotive_q100' ||
      candidateDomain === 'automotive_q101'
    ) {
      return { compatible: true, deviation: false };
    }
    // Deviation (industrial_harsh / commercial under automotive)
    return {
      compatible: true,
      deviation: true,
      reason: `Candidate classified as ${humanReadable(candidateDomain)} — not AEC-Q200 qualified`,
    };
  }

  // Phase 1: no gating for other contexts
  return { compatible: true, deviation: false };
}

// ────────────────────────────────────────────────────────────────
// DISPLAY HELPERS
// ────────────────────────────────────────────────────────────────

export function humanReadable(domain: QualificationDomain): string {
  switch (domain) {
    case 'automotive_q200': return 'AEC-Q200 Automotive';
    case 'automotive_q100': return 'AEC-Q100 Automotive';
    case 'automotive_q101': return 'AEC-Q101 Automotive';
    case 'industrial_harsh': return 'Industrial / harsh';
    case 'commercial': return 'Commercial / consumer';
    case 'medical_implant': return 'Medical — implantable (GHTF D)';
    case 'medical_general': return 'Medical — general';
    case 'mil_spec': return 'MIL-spec';
    case 'space': return 'Space / rad-hard';
    case 'unknown': return 'Domain unknown';
  }
}

export function unknownReasonCopy(reason: UnknownReason): string {
  switch (reason) {
    case 'no_classifier':
      return 'No classifier registered for this manufacturer yet — coverage will expand in future updates.';
    case 'ambiguous_series':
      return 'Manufacturer classifier ran but could not determine the series confidently.';
    case 'no_signal':
      return 'No qualification signal available in the product data.';
  }
}

/**
 * UI badge descriptor for a domain classification. Returns `null` when no chip
 * should be rendered (e.g. commercial is the default implicit state). The
 * `emphasis` field drives border treatment in cards where the chip alone
 * isn't visually strong enough for fast skimming.
 *
 * Consumers translate `tone` to their own palette; we keep this framework-free
 * so the module has no React/MUI imports.
 */
export interface DomainBadge {
  label: string;
  tooltip: string;
  tone: 'success' | 'info' | 'warning' | 'danger' | 'neutral';
  emphasis: 'chip' | 'chip+border';
}

export function domainBadge(
  classification: DomainClassification | undefined,
  opts?: { deviation?: boolean; contextActive?: boolean },
): DomainBadge | null {
  if (!classification) return null;
  const contextActive = opts?.contextActive ?? false;

  // Deviation outranks any other state — it's the red flag we want visible.
  if (opts?.deviation) {
    return {
      label: 'Not AEC-Q200 — verify',
      tooltip:
        classification.evidence ??
        `${humanReadable(classification.domain)} — does not match the selected application context.`,
      tone: 'danger',
      emphasis: 'chip+border',
    };
  }

  if (classification.domain === 'unknown') {
    // Phase 1: no chip for unknown. The label would fire on the majority of
    // candidates until classifier coverage improves (see Decision #155 —
    // only Murata MLCC classifier ships in Phase 1), and "Domain unknown —
    // verify" doesn't tell users what domain or what to verify. The
    // classification still drives the sort tiebreak and telemetry; only the
    // UI surface is silent. Re-enable per-family once classifier coverage
    // makes the badge informative (tracked in BACKLOG under Phase 2).
    return null;
  }

  switch (classification.domain) {
    case 'automotive_q200':
      return { label: 'AEC-Q200', tooltip: classification.evidence ?? 'AEC-Q200 automotive qualified', tone: 'success', emphasis: 'chip' };
    case 'automotive_q100':
      return { label: 'AEC-Q100', tooltip: classification.evidence ?? 'AEC-Q100 automotive qualified', tone: 'success', emphasis: 'chip' };
    case 'automotive_q101':
      return { label: 'AEC-Q101', tooltip: classification.evidence ?? 'AEC-Q101 automotive qualified', tone: 'success', emphasis: 'chip' };
    case 'medical_implant':
      return { label: 'Medical — implant', tooltip: classification.evidence ?? 'Qualified for implantable medical devices (GHTF D)', tone: 'info', emphasis: 'chip' };
    case 'medical_general':
      return { label: 'Medical', tooltip: classification.evidence ?? 'Qualified for general medical devices', tone: 'info', emphasis: 'chip' };
    case 'mil_spec':
      return { label: 'MIL-spec', tooltip: classification.evidence ?? 'MIL-PRF/MIL-STD qualified', tone: 'info', emphasis: 'chip' };
    case 'space':
      return { label: 'Space', tooltip: classification.evidence ?? 'Qualified for space / rad-hard applications', tone: 'info', emphasis: 'chip' };
    case 'industrial_harsh':
      return { label: 'Industrial', tooltip: classification.evidence ?? 'Industrial / harsh environment qualified', tone: 'neutral', emphasis: 'chip' };
    case 'commercial':
      // Commercial is the default implicit tier — rendering a chip for every
      // commercial part would be noise. Still show when a context is active
      // so users can see "commercial vs automotive context" side-by-side
      // during comparison (ComparisonView source anchor).
      if (!contextActive) return null;
      return { label: 'Commercial', tooltip: classification.evidence ?? 'General-purpose / commercial tier', tone: 'neutral', emphasis: 'chip' };
  }
}

/** True when the user's context activates domain gating (Phase 1: automotive). */
export function contextActivatesDomainGate(
  context: ApplicationContext | null | undefined,
): boolean {
  return contextExpectedDomains(context).size > 0;
}
