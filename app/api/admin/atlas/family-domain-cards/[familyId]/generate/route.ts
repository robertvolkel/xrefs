/**
 * POST /api/admin/atlas/family-domain-cards/[familyId]/generate
 *
 * Fires a one-shot Opus 4.7 call to write a domain knowledge card for the
 * given family. Inserts (or upserts) a row with status='draft' so the
 * engineer can review before publishing. Does NOT auto-activate.
 *
 * Context the model receives:
 *   1. Family's logic-table rules (attributeId, attributeName, weight,
 *      logicType, engineeringReason). This is the "what the matching
 *      engine considers" baseline.
 *   2. FAMILY_PARAM_SIGNATURES entries that target THIS family (foreign
 *      paramNames that should reclassify into this family).
 *   3. Active engineer-accepted dictionary overrides for this family
 *      (recent ~50). Shows what real Chinese/English paramNames have
 *      been mapped to which canonicals.
 *   4. Cross-family canonical inventory (what attributeIds exist in
 *      OTHER families) — helps the card writer flag potential reuse
 *      opportunities.
 *
 * Design choice — model asymmetry:
 *   The /suggest and /investigate routes both use Sonnet 4.6. The card
 *   generator uses Opus 4.7. The whole point of the card is to encode
 *   knowledge the cheaper model is missing — having Sonnet write the
 *   card would be mostly redundant (same blindspots write the card that
 *   misuse it). Opus → Sonnet asymmetry is what makes this loop work.
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import { logicTableRegistry, getLogicTable } from '@/lib/logicTables';
import { FAMILY_PARAM_SIGNATURES } from '@/lib/services/atlasFamilyParamSignatures';
import {
  getCrossFamilyCanonicalSummary,
  fetchAcceptedCanonicals,
} from '@/lib/services/atlasTriageContext';
import { invalidateDomainCardCache } from '@/lib/services/atlasFamilyDomainCards';
import {
  buildGroundingBlock,
} from '@/lib/services/atlasFamilyCardGrounding';
import {
  renderCardFacts,
  composeCardText,
  CARD_FORMAT_VERSION,
} from '@/lib/services/atlasFamilyCardFacts';
import {
  auditFamilyDomainCard,
  type CardAuditResult,
} from '@/lib/services/atlasFamilyCardAudit';
import { withAnthropicRetry } from '@/lib/services/anthropicRetry';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Opus card-write can take 20-40s.

function isValidFamilyId(familyId: string): boolean {
  return familyId in logicTableRegistry;
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ familyId: string }> },
): Promise<NextResponse> {
  try {
    const { error: authError, user } = await requireAdmin();
    if (authError) return authError;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'No API key configured' }, { status: 500 });
    }

    const { familyId } = await params;
    if (!isValidFamilyId(familyId)) {
      return NextResponse.json({ success: false, error: 'Invalid familyId' }, { status: 400 });
    }

    const table = getLogicTable(familyId);
    if (!table) {
      return NextResponse.json({ success: false, error: 'No logic table for familyId' }, { status: 400 });
    }

    // ── Gather context for the generator ──────────────────────────────
    // The grounding block (verified MFRs from atlas_products + Chinese
    // dict from atlasMapper) is Phase-1 of the post-audit fix. Without
    // it the model invents Western MFR cohorts from priors — the cause
    // of the May 2026 hallucination audit. See docs/audits/.
    const [crossFamilyInventory, acceptedCanonicals, groundingBlock] = await Promise.all([
      getCrossFamilyCanonicalSummary(),
      fetchAcceptedCanonicals(familyId),
      buildGroundingBlock(familyId),
    ]);

    // Logic table rules — the model's primary source of truth for what
    // each canonical actually represents. Truncate engineering reasons
    // to 400 chars so the prompt stays bounded for families with verbose
    // rule prose.
    const rulesList = table.rules
      .map((r) => {
        const reason = r.engineeringReason
          ? (r.engineeringReason.length > 400 ? r.engineeringReason.slice(0, 397) + '…' : r.engineeringReason)
          : '';
        return `- ${r.attributeId} (${r.attributeName}) — logicType=${r.logicType}, weight=${r.weight}${reason ? `\n    Reason: ${reason}` : ''}`;
      })
      .join('\n');

    const familySignatures = FAMILY_PARAM_SIGNATURES.filter((sig) => sig.target.familyId === familyId);
    const signatureSection = familySignatures.length > 0
      ? familySignatures
          .map((sig) => {
            const patternText = String(sig.pattern).replace(/^\/\^?/, '').replace(/\\?b?\$?\/i?$/, '').replace(/\\b/g, '');
            return `- /${patternText}/ → ${sig.target.subcategory} (these paramNames belong to this family unambiguously; if seen on a non-${familyId} product, that product is misclassified)`;
          })
          .join('\n')
      : '(no foreign-family signatures target this family)';

    const acceptedList = acceptedCanonicals.length > 0
      ? acceptedCanonicals
          .slice(0, 50)
          .map((c) => `- ${c.attributeId} (${c.attributeName}) — originally accepted for "${c.exampleRawParam}"`)
          .join('\n')
      : '(no engineer-accepted overrides yet)';

    const crossFamilyList = crossFamilyInventory
      .filter((c) => !c.families.includes(familyId))
      .slice(0, 80)
      .map((c) => `- ${c.attributeId} (in: ${c.families.join(', ')})`)
      .join('\n');

    // Deliberately omit the prior hand-written / DB-stored card as
    // "style reference" — that anchoring mechanism is what propagated
    // hallucinated Western MFR cohorts forward across regenerations
    // (May 2026 audit). The grounding block + hard constraints below
    // give the model the right inputs without seeded prose.
    //
    // Composite domain cards: the factual sections (rules, dictionary,
    // units, MFR cohort) are rendered DETERMINISTICALLY here and shown to
    // the model as already-established read-only context. Opus writes ONLY
    // the engineering narrative — it must not restate any of those facts.
    // composeCardText() concatenates the two before persist. Reuses the
    // already-fetched table + groundingBlock (no extra DB round-trips).
    const facts = await renderCardFacts(familyId, { table, groundingBlock });

    const prompt = `You are writing the ENGINEERING NOTES section of a domain knowledge card that will be injected into a triage AI prompt for electronics-component parameter mapping. The triage AI runs on Sonnet 4.6 and has the family's schema labels but lacks the deeper domain context that distinguishes look-alike canonicals, identifies foreign-family paramNames, and surfaces sub-type distinctions.

Your notes will be injected (alongside an auto-generated FACTS block) into every /suggest and /investigate call for parameters in family ${familyId} (${table.familyName}, category: ${table.category}).

The FACTS ALREADY ESTABLISHED block below is rendered deterministically from our logic tables, dictionary, and atlas_products data — it is ALREADY in the card. Your job is to write the engineering JUDGMENT and GOTCHAS the facts alone don't convey. Do NOT restate the facts.

Your output goal: a concrete, lesson-dense narrative of ~150-250 words that captures the gotchas a smart-but-not-domain-expert model would miss. Generic "this is a family of X" framing is NOT what we want — the model already knows that, and the FACTS block already lists the rules/cohort/dictionary. Encode the IDIOSYNCRATIC knowledge that's not derivable from the schema labels or the facts.

HARD RULES FOR THE NARRATIVE (these supersede everything else — violation makes the card unusable):
- DO NOT restate the FACTS. Specifically, the narrative MUST NOT:
  (a) assert a rule's weight or type in "attributeId (type, weight=N)" form — the FACTS block already lists every rule's type and weight;
  (b) write a "中文 → canonical" mapping arrow — the FACTS block already lists the dictionary;
  (c) introduce a manufacturer name into the cohort — the FACTS block already lists the verified MFR cohort. (You MAY name a Western manufacturer when explaining that Chinese parts CLONE or SECOND-SOURCE it — that's interpretation, not a cohort claim — but never assert a new MFR ships under this family.);
  (d) claim an MPN prefix — the FACTS block already lists sample MPNs. (You MAY interpret a prefix the FACTS samples show, e.g. "the -L suffix flags logic-level", but do not invent prefixes from prior knowledge.)
- You MAY name a canonical attributeId when explaining a concept (e.g. "isolation_voltage is the safety-critical blocking spec, never downgrade it") — naming is fine; restating its type/weight is not.
- TECHNICAL CLAIMS — every substitution rule, blocking-spec call-out, sub-type behavior, or value range MUST be derivable from a logic-table rule (cite the attributeId inline) or an engineer-accepted-override entry. If you cannot ground a claim, OMIT it. Do NOT paraphrase domain knowledge from training data as fact.
- VALUE RANGES — never invent a typical voltage / current / frequency / time / temperature range. Only state a range if it appears in a logic-table rule's engineering reason or an accepted-override example value. Otherwise say "typical range not captured in our logic table" rather than fabricate one.
- SUB-TYPE BEHAVIOR — never assert "X sub-type requires/forbids/needs Y" unless Y is a logic-table attributeId supported by that rule's engineering reason. Name the attributeId(s) that capture the distinction.

Content the narrative SHOULD include (when applicable, AFTER respecting the rules above):
- SUB-TYPES within the family that look interchangeable but matter (e.g., isolated vs non-isolated gate drivers, fixed vs adjustable LDOs, NPN vs PNP) — and the canonical-naming consequence.
- NAMING confusions — labels that sound generic but mean something specific here (e.g., "Gate Drive Supply VDD Range" = OUTPUT side of an isolated driver, NOT generic VCC).
- CONVENTIONAL-UNIT JUDGMENT — when an industry-standard unit should NOT be encoded into the canonical name (e.g., isolation_voltage is always kVrms — do not mint "_kvrms"). The FACTS block lists the units; you add the "don't suffix it" judgment.
- FOREIGN-FAMILY interpretation — what a foreign-family paramName seen on a product means for classification.
- HARD GATES — which specs are never substitutable (polarity, topology, etc.) and WHY.
- The WHY behind substitution failures the facts can't convey.

FORMATTING:
- Plain text, NO markdown headers (the prompt renders verbatim, headers would clutter).
- Use ALL-CAPS for section labels (SUB-TYPES, NAMING, etc.) — that's the convention.
- Be CONCRETE: name specific paramName patterns, specific units, specific gotchas. Avoid abstract framing.
- ~150-250 words total. Tight is better than complete.
- Do NOT include disclaimers, meta-commentary, framing like "Here is the card", or the FACTS/ENGINEERING NOTES section markers (those are added automatically). Output the narrative text only.

CONTEXT:

Family: ${familyId} — ${table.familyName} (category: ${table.category})
${table.description ? `\nFamily description: ${table.description}` : ''}

Logic-table rules (with engineering reasons — these are the source of truth for technical claims; the FACTS block lists their types/weights so DO NOT restate those):
${rulesList}

Foreign-family signatures targeting THIS family (paramNames that reclassify into ${familyId}):
${signatureSection}

Engineer-accepted overrides for this family (real paramNames the AI has previously mapped — strongest signal of what the family's parameters look like in the wild):
${acceptedList}

Cross-family canonicals (attributeIds that exist in OTHER families — if your notes discuss spec X and there's already a canonical for it elsewhere, NOTE that the family should reuse the existing name rather than mint a variant):
${crossFamilyList || '(no cross-family canonicals)'}

FACTS ALREADY ESTABLISHED (rendered deterministically and ALREADY in the card — do NOT restate any of this; write the judgment the facts don't convey):
${facts.renderedText}

Write the ENGINEERING NOTES now. Output the narrative text ONLY — no preamble, no closing remarks, no section markers.`;

    const client = new Anthropic({ apiKey });
    const response = await withAnthropicRetry(
      () => client.messages.create({
        model: 'claude-opus-4-7',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
      { label: `card-generate ${familyId}` },
    );

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ success: false, error: 'No text response from Opus' }, { status: 500 });
    }
    const narrative = textBlock.text.trim();
    if (!narrative) {
      return NextResponse.json({ success: false, error: 'Empty card text from Opus' }, { status: 500 });
    }
    // Composite card: deterministic facts region + AI narrative region,
    // delimited by sentinels. card_text stays one coherent LLM-readable
    // blob for the Triage hot path; the audit/UI use the sentinels to
    // treat the two regions differently.
    const cardText = composeCardText(facts.renderedText, narrative);

    // Snapshot the prior row (if any) BEFORE overwriting so the engineer
    // can see what changed in this regeneration via "Diff vs prior" in the
    // admin UI. Reads current card_text / updated_at / audit_results and
    // moves them into the previous_* columns on the upsert.
    const supabase = createServiceClient();
    const { data: priorRow } = await supabase
      .from('atlas_family_domain_cards')
      .select('card_text, updated_at, audit_results')
      .eq('family_id', familyId)
      .maybeSingle();

    const { data, error } = await supabase
      .from('atlas_family_domain_cards')
      .upsert({
        family_id: familyId,
        card_text: cardText,
        status: 'draft',
        model_used: 'claude-opus-4-7',
        previous_card_text: priorRow?.card_text ?? null,
        previous_updated_at: priorRow?.updated_at ?? null,
        previous_audit_results: priorRow?.audit_results ?? null,
        data_snapshot: {
          ruleCount: table.rules.length,
          acceptedCount: acceptedCanonicals.length,
          signatureCount: familySignatures.length,
          crossFamilyCount: crossFamilyInventory.length,
          // Phase-1 grounding snapshot. Phase 2 will compare current
          // atlas counts to these to surface a staleness signal on the
          // AI Domain Cards panel when the cohort has drifted.
          groundedAtProductCount: groundingBlock.counts.totalProductCount,
          groundedAtMfrCount: groundingBlock.counts.totalMfrCount,
          verifiedMfrCount: groundingBlock.verifiedMfrs.length,
          chineseDictEntryCount: groundingBlock.chineseDictEntries.length,
          generatedAt: new Date().toISOString(),
          // Composite-card format marker — v2 = deterministic facts +
          // AI narrative (sentinel-delimited). Absent on legacy all-prose
          // cards. factsRenderedAt records when the facts region was built.
          cardFormatVersion: CARD_FORMAT_VERSION,
          factsRenderedAt: new Date().toISOString(),
        },
        created_by: user?.id ?? null,
        // Do NOT set approved_by / approved_at here — those land when the
        // engineer transitions status to 'active' via PATCH.
        approved_by: null,
        approved_at: null,
      })
      .select()
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json(
        { success: false, error: error?.message ?? 'Upsert failed' },
        { status: 500 },
      );
    }

    invalidateDomainCardCache();

    // Decision #195 Phase 2 — auto-audit the freshly-generated card and
    // persist results. Awaited so the response carries audit_results on the
    // same payload (UI doesn't need a second fetch). Audit is fast (~1-2s)
    // relative to the Opus call. Failure is non-fatal: we persist an error
    // marker and return the card so the engineer isn't blocked. The audit
    // is a safety net, not a critical path.
    let auditResults: CardAuditResult | { auditedAt: string; error: string; severity: 'clean'; issueCount: 0 };
    try {
      auditResults = await auditFamilyDomainCard(familyId, cardText);
    } catch (auditErr) {
      const errMsg = auditErr instanceof Error ? auditErr.message : String(auditErr);
      auditResults = {
        auditedAt: new Date().toISOString(),
        error: errMsg,
        severity: 'clean',
        issueCount: 0,
      };
    }
    // Fire-and-forget the persist — if the UPDATE fails for any reason
    // (transient DB blip) the card is still in DB and Re-audit can recover.
    void supabase
      .from('atlas_family_domain_cards')
      .update({ audit_results: auditResults })
      .eq('family_id', familyId)
      .then(() => undefined);

    return NextResponse.json({
      success: true,
      card: { ...data, audit_results: auditResults },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
