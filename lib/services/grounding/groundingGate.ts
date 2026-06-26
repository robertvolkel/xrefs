/**
 * Backstop gate (docs/mpn-grounding-gate-plan.md, step 5).
 *
 * Structural rendering (cards / deterministic tables / summary lines) is the PRIMARY
 * fabrication guarantee. This gate is the NARROW, high-precision backstop for the one
 * residual case: the model naming a part number in FREE PROSE that we never pulled from
 * the catalog this conversation. It runs server-side on the fully-assembled reply
 * (nothing streams), so it's an un-bypassable choke point.
 *
 * PRECISION. Enforcement acts ONLY on HIGH-confidence findings (known-MPN-family shape
 * + unverified) — the strong fabrication signal. MEDIUM findings (merely structurally
 * MPN-shaped) stay observe-only: too noisy to enforce without a false-positive rate the
 * plan's dual-threshold forbids. User-typed parts are "mentionable" (the detector skips
 * them upstream), never flagged — echoing the user's own input is not a fabrication.
 *
 * ACTION = RECOVERY, NEVER DELETION (plan §"Action on a catch"):
 *   1. (upstream) user-typed MPN → mentionable, never reaches enforcement.
 *   2. model-introduced unverified part → REGENERATE ONCE with a corrective
 *      instruction; if the rewrite is clean, use it.
 *   3. rewrite still names an unverified part → DETERMINISTIC SAFE MESSAGE. Never an
 *      empty or dangling reply.
 *
 * The model call needed for step 2 is INJECTED (the `regenerate` callback), so this
 * module stays free of the Anthropic client and is fully unit-testable.
 *
 * Default OFF (isGroundingGateEnabled). Enforcement flips on only once the observe-only
 * measurement proves the false-positive rate is acceptable (plan §"Open product
 * decisions" — dual threshold).
 */

import { VerifiedSet } from './verifiedSet';
import { detectUnverifiedMpns, DetectOptions, UnverifiedMpnFinding } from './mpnDetector';
import { buildNonMpnVocabulary, DEFAULT_MPN_FAMILY_PATTERNS } from './nonMpnVocabulary';

export interface GateEvaluation {
  /** True if the reply names a HIGH-confidence unverified part → recovery needed. */
  flagged: boolean;
  /** The HIGH-confidence findings that trigger enforcement. */
  enforceable: UnverifiedMpnFinding[];
  /** Every finding (incl. medium) — for logging / telemetry. */
  all: UnverifiedMpnFinding[];
}

export type GateAction = 'allow' | 'regenerated' | 'safe_message';

export interface GateResult {
  /** The final, safe message to send. Never empty. */
  message: string;
  action: GateAction;
  /** The ORIGINAL draft's evaluation (what triggered the action) — for telemetry. */
  evaluation: GateEvaluation;
}

/** Deterministic safe reply used when a regenerate still names an unverified part.
 *  Never empty; offers the honest recovery path (look it up / search) per plan §"Action". */
export const GATE_SAFE_MESSAGE =
  "I want to be careful not to name a part I haven't verified in our catalog. " +
  "Tell me the exact part number you have in mind and I'll look it up, or I can search for options that fit what you need.";

function defaultDetectOptions(): DetectOptions {
  return { vocabulary: buildNonMpnVocabulary(), familyPatterns: DEFAULT_MPN_FAMILY_PATTERNS };
}

/** Only HIGH-confidence findings are enforced (see module header). */
function enforceableFindings(findings: UnverifiedMpnFinding[]): UnverifiedMpnFinding[] {
  return findings.filter((f) => f.confidence === 'high');
}

/** Is the backstop gate switched on? Default OFF — observe-only until the measurement
 *  data justifies enforcement (plan dual-threshold). One env flag flips it. */
export function isGroundingGateEnabled(): boolean {
  return process.env.GROUNDING_GATE_ENABLED === 'true';
}

/** Evaluate a drafted reply against the verified set. Pure, side-effect-free. */
export function evaluateGroundingGate(
  message: string,
  verifiedSet: VerifiedSet,
  opts: DetectOptions = defaultDetectOptions(),
): GateEvaluation {
  const all = detectUnverifiedMpns(message, verifiedSet, opts);
  const enforceable = enforceableFindings(all);
  return { flagged: enforceable.length > 0, enforceable, all };
}

/**
 * Corrective instruction for the one-shot regenerate. Names the offending tokens and
 * forbids naming any part we didn't retrieve — telling the model to look it up or omit
 * it rather than describe from memory.
 */
export function buildGateCorrection(findings: UnverifiedMpnFinding[]): string {
  const tokens = [...new Set(findings.map((f) => f.token))];
  const plural = tokens.length > 1;
  return [
    `Your previous reply named ${plural ? 'part numbers' : 'a part number'} we did NOT retrieve from the catalog this conversation: ${tokens.join(', ')}.`,
    `Rewrite your reply so it does NOT name any part number we haven't looked up, and do NOT describe a part from memory.`,
    `If such a part is essential to the answer, say plainly that you'd need to look it up first (offer to search) instead of naming it. Keep the rest of your reply unchanged.`,
    `Output ONLY the rewritten reply text — no preamble.`,
  ].join(' ');
}

/**
 * Apply the backstop to a drafted reply. If clean, returns it unchanged (no model
 * call). If it names a HIGH-confidence unverified part, calls `regenerate(correction)`
 * ONCE; uses the rewrite if it comes back clean, else falls back to GATE_SAFE_MESSAGE.
 * Never returns an empty message; never throws (a regenerate error → safe message).
 *
 * `regenerate` is injected by the caller (chat() passes a closure that calls the model),
 * keeping this module client-free and testable.
 */
export async function applyGroundingGate(
  message: string,
  verifiedSet: VerifiedSet,
  regenerate: (correction: string) => Promise<string>,
  opts: DetectOptions = defaultDetectOptions(),
): Promise<GateResult> {
  const evaluation = evaluateGroundingGate(message, verifiedSet, opts);
  if (!evaluation.flagged) {
    return { message, action: 'allow', evaluation };
  }

  let rewritten = '';
  try {
    rewritten = (await regenerate(buildGateCorrection(evaluation.enforceable)))?.trim() ?? '';
  } catch {
    rewritten = '';
  }

  if (rewritten) {
    const reEval = evaluateGroundingGate(rewritten, verifiedSet, opts);
    if (!reEval.flagged) {
      return { message: rewritten, action: 'regenerated', evaluation };
    }
  }

  return { message: GATE_SAFE_MESSAGE, action: 'safe_message', evaluation };
}
