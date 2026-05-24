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

export interface CardAuditResult {
  auditedAt: string;
  bogusMfrs: string[];
  omittedMfrs: OmittedMfr[];
  wrongPrefixes: WrongPrefix[];
  fabricatedDict: FabricatedDictEntry[];
  issueCount: number;
  severity: CardAuditSeverity;
  /** Set when the audit threw — treat as un-audited for gating. */
  error?: string;
}
