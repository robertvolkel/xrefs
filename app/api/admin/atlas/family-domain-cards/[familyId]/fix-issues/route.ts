/**
 * POST /api/admin/atlas/family-domain-cards/[familyId]/fix-issues
 *
 * AI-driven minimal-edit fix for hallucinations surfaced by the audit
 * (Decision #195 Phase 2, Piece 5+). Takes the current card text + the
 * current audit results, asks Sonnet 4.6 to produce a corrected card
 * that addresses ONLY the flagged issues while preserving every other
 * paragraph verbatim.
 *
 * Returns the proposed text — does NOT persist. The drawer renders a
 * diff and the engineer chooses Accept (writes into the editable
 * textarea) or Discard. After Accept + Save edits, the drawer auto-
 * triggers a re-audit to confirm the issue count dropped. Sonnet
 * cannot ship a worse card on its own — the audit is a backstop.
 *
 * Design notes:
 *  - temperature 0 — we want a minimal mechanical edit, not a creative
 *    rewrite. The same input should produce the same fix.
 *  - max_tokens 1500 — cards are ~200-300 words (~400-500 tokens).
 *    Headroom for the response without inviting long-form prose.
 *  - prompt is hard-constrained: preserve every unaffected paragraph
 *    character-for-character; do not introduce new MFRs / prefixes /
 *    dict mappings. The audit will catch any introduced regressions.
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { logicTableRegistry, getLogicTable } from '@/lib/logicTables';
import type { CardAuditResult } from '@/lib/services/atlasFamilyCardAuditTypes';
import { withAnthropicRetry } from '@/lib/services/anthropicRetry';
import { splitCardText, composeCardText } from '@/lib/services/atlasFamilyCardComposite';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isValidFamilyId(familyId: string): boolean {
  return familyId in logicTableRegistry;
}

function summarizeAuditForPrompt(audit: CardAuditResult): string {
  const sections: string[] = [];
  if (audit.bogusMfrs.length) {
    sections.push(
      `BOGUS MFRs (${audit.bogusMfrs.length}) — mentioned in card but do NOT ship under this family in atlas_products. Remove the clause(s) referencing each. Do NOT invent a replacement MFR:\n` +
        audit.bogusMfrs.map((m) => `  - ${m}`).join('\n'),
    );
  }
  if (audit.wrongPrefixes.length) {
    sections.push(
      `WRONG PREFIXES (${audit.wrongPrefixes.length}) — claimed MPN prefix doesn't match the MFR's actual samples. Replace the claimed prefix with the actual top prefix from "Actual top". If the claim was wrapped in surrounding prose, keep the prose, swap only the prefix token:\n` +
        audit.wrongPrefixes
          .map(
            (w) =>
              `  - ${w.mfr}: claimed "${w.claimed}" (${w.claimedShare}% of samples). Actual top: ${w.actualTop.join(', ')}. Sample MPNs: ${w.actualSamples.join(', ')}.`,
          )
          .join('\n'),
    );
  }
  if (audit.fabricatedDict.length) {
    sections.push(
      `FABRICATED DICT (${audit.fabricatedDict.length}) — card claims a Chinese→canonical mapping for these phrases, but the phrase is NOT in atlasMapper.ts. Remove the mapping claim (typically a clause with → or "maps to" or quoted lowercase canonical). Do NOT invent a replacement mapping:\n` +
        audit.fabricatedDict.map((f) => `  - "${f.phrase}"`).join('\n'),
    );
  }
  // Critical omissions are mandatory adds — a top-share MFR is missing
  // from a cohort claim. Bare mention in the cohort line is acceptable
  // (no prefix info needed). Older audit results may not have
  // criticalOmittedMfrs populated — fall back to share-threshold split.
  const criticalOmitted = audit.criticalOmittedMfrs?.length
    ? audit.criticalOmittedMfrs
    : audit.omittedMfrs.filter((o) => o.share >= 15);
  const criticalNameSet = new Set(criticalOmitted.map((o) => o.name));
  const editorialOmitted = audit.omittedMfrs.filter((o) => !criticalNameSet.has(o.name));

  if (criticalOmitted.length) {
    sections.push(
      `CRITICAL MFR OMISSIONS (${criticalOmitted.length}) — top-volume MFRs in this family that the card MUST acknowledge. Each ships ≥15% of family products, so omitting them silently makes the cohort claim materially false. Required fix: add each as a BARE MENTION to the MFR COHORT sentence (e.g. ", and SWST" appended to the list). Do NOT invent MPN prefix patterns, product-line claims, or technical specs for them — bare-name addition is sufficient. If the card has no clear cohort sentence, append a short line like "Also in cohort: <name1>, <name2>.":\n` +
        criticalOmitted.map((o) => `  - ${o.name} (${o.productCount} products, ${o.share}% of family)`).join('\n'),
    );
  }
  if (editorialOmitted.length) {
    sections.push(
      `EDITORIAL OMISSIONS (${editorialOmitted.length}) — minor top-volume MFRs not mentioned. Each ships 3–14% of family. ADVISORY ONLY — do NOT add them unless they fit naturally into an existing MFR-cohort sentence. If you can't slot them in without inventing prefix claims, leave them out:\n` +
        editorialOmitted.map((o) => `  - ${o.name} (${o.productCount} products, ${o.share}% of family)`).join('\n'),
    );
  }
  if (audit.wrongRuleClaims?.length) {
    sections.push(
      `WRONG RULE CLAIMS (${audit.wrongRuleClaims.length}) — card claims a rule type or weight that doesn't match the family's logic table. Replace ONLY the wrong token. Keep the surrounding sentence intact. Do NOT delete the rule mention — just correct the type/weight token in place:\n` +
        audit.wrongRuleClaims
          .map((w) => {
            const parts: string[] = [];
            if (w.claimedType && w.actualType) {
              parts.push(`claimed type "${w.claimedType}" → actual type "${w.actualType}"`);
            }
            if (w.claimedWeight !== undefined && w.actualWeight !== undefined) {
              parts.push(`claimed weight ${w.claimedWeight} → actual weight ${w.actualWeight}`);
            }
            return `  - ${w.attributeId}: ${parts.join('; ')}`;
          })
          .join('\n'),
    );
  }
  if (audit.wrongDictArrows?.length) {
    sections.push(
      `WRONG DICT ARROWS (${audit.wrongDictArrows.length}) — card asserts a Chinese phrase maps to canonical X but the dictionary actually maps it to canonical Y. Swap ONLY the canonical token after the arrow. Keep the Chinese phrase and surrounding sentence intact:\n` +
        audit.wrongDictArrows
          .map(
            (w) =>
              `  - "${w.phrase}" → claimed "${w.claimedTarget}", actual dictionary target "${w.actualTarget}"`,
          )
          .join('\n'),
    );
  }
  return sections.join('\n\n');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ familyId: string }> },
): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'No API key configured' }, { status: 500 });
    }

    const { familyId } = await params;
    if (!isValidFamilyId(familyId)) {
      return NextResponse.json({ success: false, error: 'Invalid familyId' }, { status: 400 });
    }

    const body = (await request.json()) as {
      cardText?: string;
      auditResults?: CardAuditResult;
    };
    if (!body.cardText || !body.auditResults) {
      return NextResponse.json(
        { success: false, error: 'cardText and auditResults required' },
        { status: 400 },
      );
    }
    const cardText = body.cardText;
    const audit = body.auditResults;

    if (audit.issueCount === 0 && audit.omittedMfrs.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Audit is clean — nothing to fix' },
        { status: 400 },
      );
    }

    // Composite cards (v2): the audit only flags issues in the narrative
    // region (the facts are deterministic + never audited). So we send ONLY
    // the narrative to Sonnet for the minimal edit, then recompose the facts
    // back before returning — the stored card_text stays composite. Legacy
    // v1 cards (no facts sentinel) → edit the whole card as before.
    const { factsRegion, narrativeRegion } = splitCardText(cardText);
    const isV2 = factsRegion !== null;
    const editSurface = isV2 ? narrativeRegion : cardText;

    const table = getLogicTable(familyId);
    const familyName = table?.familyName ?? familyId;
    const issuesSection = summarizeAuditForPrompt(audit);

    const prompt = `You are correcting a domain knowledge card for electronics-component family ${familyId} (${familyName}). An auto-audit flagged the issues below. Your job: produce a corrected card text that resolves ONLY these specific issues.

HARD RULES (violation makes the fix unusable — the audit will re-run and re-flag):
- Preserve every paragraph not affected by a flagged issue CHARACTER-FOR-CHARACTER. Do not rewrite, condense, or paraphrase unaffected prose.
- Do NOT introduce new MFRs, MPN prefixes, or Chinese→canonical dict mappings. Only remove or correct flagged ones.
- Do NOT invent replacement MFRs for removed BOGUS MFRs. If removing a bogus MFR breaks a sentence's flow, prefer to drop the clause cleanly rather than substitute another MFR.
- For WRONG PREFIX fixes: swap ONLY the claimed prefix token (e.g. "CJ005" → "CJO"). Keep the surrounding sentence intact.
- For FABRICATED DICT fixes: remove the offending mapping clause. If a sentence contains multiple mappings and only one is fabricated, drop that one mapping, keep the others.
- DO NOT INTRODUCE NEW TECHNICAL CLAIMS while fixing. Do not add value ranges, voltage/current/frequency/time numbers, sub-type behavioral assertions, unit conventions, blocking-spec claims, or substitution rules that weren't in the original card. Your job is REMOVAL and TOKEN-LEVEL CORRECTION ONLY — not enrichment. If a sentence needs to be removed because the only basis for it was a flagged fabrication, remove the whole sentence rather than rewriting it with new content.
- Do NOT add disclaimers, framing, headers, or meta-commentary. Output the corrected card text ONLY.

ISSUES TO FIX:

${issuesSection}

CURRENT CARD TEXT:

${editSurface}

Output the corrected card text below. No preamble, no closing remarks — just the corrected card text:`;

    const client = new Anthropic({ apiKey });
    const response = await withAnthropicRetry(
      () => client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }],
      }),
      { label: `card-fix ${familyId}` },
    );

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json(
        { success: false, error: 'No text response from Sonnet' },
        { status: 500 },
      );
    }
    const editedSurface = textBlock.text.trim();
    if (!editedSurface) {
      return NextResponse.json(
        { success: false, error: 'Empty proposed text from Sonnet' },
        { status: 500 },
      );
    }

    // For v2, recompose the deterministic facts back around the edited
    // narrative so the proposal the engineer sees (and saves) is a full
    // composite card. For v1 the edited surface IS the whole card.
    const proposedText = isV2
      ? composeCardText(factsRegion as string, editedSurface)
      : editedSurface;

    return NextResponse.json({ success: true, proposedText });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
