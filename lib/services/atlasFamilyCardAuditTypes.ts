/**
 * Client-safe types for atlasFamilyCardAudit. Lives in its own file so the
 * admin panel can import the shape without pulling in fs / supabase from
 * the runtime audit service.
 */

export type CardAuditSeverity = 'clean' | 'warn' | 'block';

export interface OmittedMfr {
  name: string;
  productCount: number;
  share: number;
}

export interface WrongPrefix {
  mfr: string;
  claimed: string;
  claimedShare: number;
  actualTop: string[];
  actualSamples: string[];
}

export interface FabricatedDictEntry {
  phrase: string;
  claimedTarget: string;
}

/** Card mis-claims a rule's type and/or weight vs. the logic table.
 *  Both fields are optional because the card may only assert one
 *  ("Vf is application_review weight=3" claims both; "package_case
 *  (identity)" claims type only). Each populated field signals a
 *  specific mismatch. */
export interface WrongRuleClaim {
  attributeId: string;
  claimedType?: string;
  actualType?: string;
  claimedWeight?: number;
  actualWeight?: number;
}

/** Card asserts a Chinese-phrase → canonical mapping that points to
 *  the WRONG canonical. Distinct from FABRICATED_DICT (where the
 *  phrase isn't catalogued at all) — here the phrase IS in
 *  atlasMapper but the card claims the wrong target. */
export interface WrongDictArrow {
  phrase: string;
  claimedTarget: string;
  actualTarget: string;
}

export interface CardAuditResult {
  auditedAt: string;
  bogusMfrs: string[];
  /** ALL omissions (critical + editorial). `criticalOmittedMfrs` is the
   *  block-level subset; the remainder is editorial. Kept as one combined
   *  array for backward compatibility with older readers. */
  omittedMfrs: OmittedMfr[];
  /** Block-level subset of `omittedMfrs` — share ≥ OMIT_BLOCK_SHARE (15%).
   *  These are NOT editorial: the card asserts a cohort and a top-1/top-2
   *  MFR is missing. Counted into `issueCount` so the audit banner says
   *  "blocks Approve" and the Fix-with-AI button becomes actionable. */
  criticalOmittedMfrs: OmittedMfr[];
  wrongPrefixes: WrongPrefix[];
  fabricatedDict: FabricatedDictEntry[];
  /** Card claims a rule type and/or weight that doesn't match the logic
   *  table for this family. Block-level — engineering-claim errors
   *  silently misinform downstream consumers (engineers, Triage AI). */
  wrongRuleClaims: WrongRuleClaim[];
  /** Card asserts a Chinese-phrase → canonical mapping with the wrong
   *  canonical (vs atlasMapper.ts dictionary for this family/category).
   *  Block-level — wrong direction breaks downstream mapping consumers. */
  wrongDictArrows: WrongDictArrow[];
  /** Block-level count: BOGUS_MFR + WRONG_PREFIX + critical OMITTED_MFR +
   *  WRONG_RULE_CLAIM + WRONG_DICT_ARROW. Drives the Fix-with-AI button
   *  and the "blocks Approve" headline. */
  issueCount: number;
  severity: CardAuditSeverity;
  /** Set when the audit threw — treat as un-audited for gating. */
  error?: string;
}
