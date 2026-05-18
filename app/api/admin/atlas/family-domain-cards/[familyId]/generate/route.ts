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
import {
  invalidateDomainCardCache,
  ATLAS_FAMILY_DOMAIN_CARDS,
} from '@/lib/services/atlasFamilyDomainCards';

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
    const [crossFamilyInventory, acceptedCanonicals] = await Promise.all([
      getCrossFamilyCanonicalSummary(),
      fetchAcceptedCanonicals(familyId),
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

    const existingCard = ATLAS_FAMILY_DOMAIN_CARDS[familyId] ?? null;
    const existingCardSection = existingCard
      ? `\n\nEXISTING HAND-WRITTEN CARD (for reference — your output should match this style and depth, refined with the data above):\n${existingCard}`
      : '';

    const prompt = `You are writing a domain knowledge card that will be injected into a triage AI prompt for electronics-component parameter mapping. The triage AI runs on Sonnet 4.6 and has the family's schema labels but lacks the deeper domain context that distinguishes look-alike canonicals, identifies foreign-family paramNames, and surfaces sub-type distinctions.

Your card will be injected into every /suggest and /investigate call for parameters in family ${familyId} (${table.familyName}, category: ${table.category}).

Your output goal: a concrete, lesson-dense card of ~200-300 words that captures the gotchas a smart-but-not-domain-expert model would miss when looking at this family's parameters. Generic "this is a family of X" framing is NOT what we want — the model already knows that. Encode the IDIOSYNCRATIC knowledge that's not derivable from the schema labels.

Content the card SHOULD include (when applicable):
- SUB-TYPES within the family that look interchangeable but matter (e.g., isolated vs non-isolated gate drivers, fixed vs adjustable LDOs, NPN vs PNP). Call out the canonical-naming consequences.
- NAMING confusions — labels that sound generic but mean something specific in this family (e.g., "Gate Drive Supply VDD Range" = OUTPUT side of isolated driver, NOT generic VCC).
- CONVENTIONAL UNITS — when a unit is industry-standard and shouldn't be encoded in the canonical name (e.g., isolation_voltage is always kVrms — no need for "_kvrms" suffix).
- FOREIGN-FAMILY PARAM NAMES — labels that belong unambiguously to this family (covered by signatures below), so the model can flag misclassified products.
- HARD GATES — which specs are never substitutable (polarity, topology, etc.).
- COMMON MPN PREFIXES that frequently surface — helps the model recognize part lineages.
- TYPICAL VALUE RANGES that anchor sanity-checking.

FORMATTING:
- Plain text, NO markdown headers (the prompt renders verbatim, headers would clutter).
- Use ALL-CAPS for section labels (SUB-TYPES, NAMING, etc.) — that's the convention.
- Be CONCRETE: name specific MPN families, specific paramName patterns, specific units. Avoid abstract framing.
- ~200-300 words total. Tight is better than complete.
- Do NOT include disclaimers, meta-commentary, or framing like "Here is the card". Output the card text only.

CONTEXT:

Family: ${familyId} — ${table.familyName} (category: ${table.category})
${table.description ? `\nFamily description: ${table.description}` : ''}

Logic-table rules (these are what the matching engine consumes — the model already sees these labels, but only labels):
${rulesList}

Foreign-family signatures targeting THIS family (paramNames that reclassify into ${familyId}):
${signatureSection}

Engineer-accepted overrides for this family (real paramNames the AI has previously mapped — strongest signal of what the family's parameters look like in the wild):
${acceptedList}

Cross-family canonicals (attributeIds that exist in OTHER families — if your card discusses spec X and there's already a canonical for it elsewhere, NOTE that the family should reuse the existing name rather than mint a variant):
${crossFamilyList || '(no cross-family canonicals)'}${existingCardSection}

Write the card now. Output the card text ONLY — no preamble, no closing remarks.`;

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ success: false, error: 'No text response from Opus' }, { status: 500 });
    }
    const cardText = textBlock.text.trim();
    if (!cardText) {
      return NextResponse.json({ success: false, error: 'Empty card text from Opus' }, { status: 500 });
    }

    // Upsert as draft. Existing rows get overwritten with the new draft;
    // the engineer's review/approve flow is the same regardless of whether
    // this is the first generation or a re-generation.
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('atlas_family_domain_cards')
      .upsert({
        family_id: familyId,
        card_text: cardText,
        status: 'draft',
        model_used: 'claude-opus-4-7',
        data_snapshot: {
          ruleCount: table.rules.length,
          acceptedCount: acceptedCanonicals.length,
          signatureCount: familySignatures.length,
          crossFamilyCount: crossFamilyInventory.length,
          generatedAt: new Date().toISOString(),
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
    return NextResponse.json({ success: true, card: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
