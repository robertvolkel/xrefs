/**
 * Automotive AEC enforcement table + pure helpers (Decision #221).
 *
 * Client-safe: pure data + pure functions, no server imports, so both the
 * server matching pipeline (partDataService) and client UI (useAppState, for
 * auto-applying the "AEC-qualified only" Replacements filter) can consume it.
 *
 * Each row maps a family's automotive context question to the AEC attribute it
 * requires. The questionId varies by family because the context files don't
 * agree on one key — B-block + C-block use `automotive`, D1 uses
 * `extended_temp_automotive`, D2/F1 use `automotive_aec_q200`, E1 uses
 * `automotive_aec_q101`.
 */
export type AutomotiveAecEntry = {
  familyId: string;
  questionId: string;
  answerValue: string;
  attributeId: string;
  attributeName: string;
};

export const AUTOMOTIVE_AEC_ENFORCEMENT: readonly AutomotiveAecEntry[] = [
  { familyId: 'B5', questionId: 'automotive',                answerValue: 'yes', attributeId: 'aec_q101', attributeName: 'AEC-Q101 (Automotive Qualification)' },
  { familyId: 'B6', questionId: 'automotive',                answerValue: 'yes', attributeId: 'aec_q101', attributeName: 'AEC-Q101 (Automotive Qualification)' },
  { familyId: 'B7', questionId: 'automotive',                answerValue: 'yes', attributeId: 'aec_q101', attributeName: 'AEC-Q101 (Automotive Qualification)' },
  // B8 Thyristors: sub-type context Q1 (SCR/TRIAC/DIAC) suppresses sub-type-
  // specific rules via `not_applicable` effects but does NOT touch aec_q101 —
  // automotive qualification applies uniformly across all three sub-types.
  { familyId: 'B8', questionId: 'automotive',                answerValue: 'yes', attributeId: 'aec_q101', attributeName: 'AEC-Q101 (Automotive Qualification)' },
  { familyId: 'B9', questionId: 'automotive',                answerValue: 'yes', attributeId: 'aec_q101', attributeName: 'AEC-Q101 (Automotive Qualification)' },
  { familyId: 'C9', questionId: 'automotive',                answerValue: 'yes', attributeId: 'aec_q100', attributeName: 'AEC-Q100 (Automotive Qualification)' },
  { familyId: 'C10', questionId: 'automotive',               answerValue: 'yes', attributeId: 'aec_q100', attributeName: 'AEC-Q100 (Automotive Qualification)' },
  // D1 Crystals use a combined "extended temp / automotive" question — both
  // conditions land on the same answer ('yes') and both require AEC-Q200.
  { familyId: 'D1', questionId: 'extended_temp_automotive',  answerValue: 'yes', attributeId: 'aec_q200', attributeName: 'AEC-Q200 (Automotive Qualification)' },
  { familyId: 'D2', questionId: 'automotive_aec_q200',       answerValue: 'yes', attributeId: 'aec_q200', attributeName: 'AEC-Q200 (Automotive Qualification)' },
  // E1 Optocouplers — AEC-Q101 (LED + phototransistor pair = discrete semis).
  // The AEC wrap runs ALONGSIDE the existing filterOptocouplerMismatches
  // (output_transistor_type + channel_count gates) — independent, both
  // bypass for certified crosses.
  { familyId: 'E1', questionId: 'automotive_aec_q101',       answerValue: 'yes', attributeId: 'aec_q101', attributeName: 'AEC-Q101 (Automotive Qualification)' },
  // F1 EMRs — AEC-Q200 (electromechanical/passive). Same alongside relationship
  // with the existing filterRelayMismatches (contact_form + coil_voltage gates).
  { familyId: 'F1', questionId: 'automotive_aec_q200',       answerValue: 'yes', attributeId: 'aec_q200', attributeName: 'AEC-Q200 (Automotive Qualification)' },
] as const;

/** Exported for tests + Decision #220 introspection. */
export function getAutomotiveAecEnforcementTable(): readonly AutomotiveAecEntry[] {
  return AUTOMOTIVE_AEC_ENFORCEMENT;
}

/** Returns true iff at least one table entry is registered for this familyId. */
export function hasAutomotiveAecEnforcement(familyId: string): boolean {
  return AUTOMOTIVE_AEC_ENFORCEMENT.some(e => e.familyId === familyId);
}

/**
 * Returns true iff the given family + context answers signal automotive AEC
 * intent — i.e. an enrolled family whose automotive question was answered with
 * the enforcing value. Used client-side to auto-apply the "AEC-qualified only"
 * Replacements filter so the panel reflects the user's automotive selection.
 */
export function isAutomotiveAecContext(
  familyId: string | undefined,
  answers: Record<string, string> | undefined,
): boolean {
  if (!familyId || !answers) return false;
  return AUTOMOTIVE_AEC_ENFORCEMENT.some(
    e => e.familyId === familyId && answers[e.questionId] === e.answerValue,
  );
}
