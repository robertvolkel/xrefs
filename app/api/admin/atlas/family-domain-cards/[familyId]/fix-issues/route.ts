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
  if (audit.omittedMfrs.length) {
    sections.push(
      `OMITTED MFRs (${audit.omittedMfrs.length}) — top-volume MFRs in this family not mentioned in card. Editorial only — do NOT add them unless they fit naturally into an existing MFR-cohort sentence. If you can't slot them in without inventing claims about their MPN prefixes, leave them out:\n` +
        audit.omittedMfrs.map((o) => `  - ${o.name} (${o.productCount} products, ${o.share}% of family)`).join('\n'),
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

${cardText}

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
    const proposedText = textBlock.text.trim();
    if (!proposedText) {
      return NextResponse.json(
        { success: false, error: 'Empty proposed text from Sonnet' },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, proposedText });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
