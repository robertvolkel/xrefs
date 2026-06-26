/**
 * Observation layer — assembles a turn's verified set from the data a chat orchestrator
 * has, runs the unverified-MPN detector over the assistant's drafted message, and
 * produces a structured observation record (docs/mpn-grounding-gate-plan.md, step 3).
 *
 * This is the OBSERVE-ONLY instrument: it measures what a gate WOULD catch. It never
 * changes the message — the orchestrators log the returned record fire-and-forget and
 * return their prose unchanged. Pure and side-effect-free so it's unit-testable; the
 * Supabase sink + the orchestrator call sites are the only non-pure wiring (next step).
 */

import {
  VerifiedSet,
  emptyVerifiedSet,
  extendVerifiedSet,
} from './verifiedSet';
import {
  detectUnverifiedMpns,
  DetectOptions,
  UnverifiedMpnFinding,
} from './mpnDetector';
import { buildNonMpnVocabulary, DEFAULT_MPN_FAMILY_PATTERNS } from './nonMpnVocabulary';

/** The catalog-grounded data an orchestrator can see for a turn. All optional — each
 *  orchestrator supplies what it has (chat has search + recs + attrs; refine has recs;
 *  list has BOM rows). */
export interface ChatGroundingContext {
  /** Parts from the current search result. */
  searchMatches?: ReadonlyArray<{ mpn?: string | null; manufacturer?: string | null }>;
  /** Cross-reference recommendation candidates. */
  recommendations?: ReadonlyArray<{ mpn?: string | null; manufacturer?: string | null }>;
  /** The confirmed source part. */
  sourcePart?: { mpn?: string | null; manufacturer?: string | null } | null;
  /** MPNs looked up this turn via get_batch_attributes / get_part_attributes. */
  attributeMpns?: ReadonlyArray<string | null | undefined>;
  /** Manufacturer names surfaced via get_manufacturer_profile etc. */
  mfrNames?: ReadonlyArray<string | null | undefined>;
  /** MPNs the user typed (mentionable, not catalog-verified). */
  userMpns?: ReadonlyArray<string | null | undefined>;
}

/**
 * Fold a turn's context into a verified set. Pass `base` (a set carried from earlier
 * turns) to ACCUMULATE — the audit's core requirement so earlier-turn parts aren't
 * forgotten. Omit it for a single-turn set.
 */
export function buildVerifiedSetFromContext(
  ctx: ChatGroundingContext,
  base: VerifiedSet = emptyVerifiedSet(),
): VerifiedSet {
  const catalogParts = [
    ...(ctx.searchMatches ?? []),
    ...(ctx.recommendations ?? []),
    ...(ctx.sourcePart ? [ctx.sourcePart] : []),
    ...((ctx.attributeMpns ?? []).map((mpn) => ({ mpn }))),
  ];
  return extendVerifiedSet(base, {
    catalogParts,
    mfrNames: ctx.mfrNames,
    userMpns: ctx.userMpns,
  });
}

export type GroundingSurface = 'chat' | 'refine' | 'list';

export interface GroundingObservationMeta {
  surface: GroundingSurface;
  conversationId?: string | null;
  userId?: string | null;
  model?: string | null;
}

/** A single measurement: what a gate WOULD have caught in this message. */
export interface GroundingObservation extends GroundingObservationMeta {
  messageLength: number;
  /** Size of the verified set the message was checked against. */
  verifiedMpnCount: number;
  findingCount: number;
  highCount: number;
  mediumCount: number;
  findings: UnverifiedMpnFinding[];
}

/**
 * Run the detector over `message` against `verifiedSet` and return an observation
 * record. Uses the real logic-table-derived vocabulary + family patterns by default;
 * tests may inject `detectOpts`.
 */
export function observeMessage(
  message: string,
  verifiedSet: VerifiedSet,
  meta: GroundingObservationMeta,
  detectOpts?: DetectOptions,
): GroundingObservation {
  const opts: DetectOptions = detectOpts ?? {
    vocabulary: buildNonMpnVocabulary(),
    familyPatterns: DEFAULT_MPN_FAMILY_PATTERNS,
  };
  const findings = detectUnverifiedMpns(message, verifiedSet, opts);
  return {
    ...meta,
    messageLength: message.length,
    verifiedMpnCount: verifiedSet.mpns.size,
    findingCount: findings.length,
    highCount: findings.filter((f) => f.confidence === 'high').length,
    mediumCount: findings.filter((f) => f.confidence === 'medium').length,
    findings,
  };
}
