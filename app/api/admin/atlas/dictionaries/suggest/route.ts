import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import {
  getSchemaAttributes,
  fetchAcceptedCanonicals,
  getCrossFamilyCanonicalSummary,
  detectCanonicalCollision,
  KNOWN_FAMILY_IDS_LIST,
} from '@/lib/services/atlasTriageContext';
import { FAMILY_PARAM_SIGNATURES } from '@/lib/services/atlasFamilyParamSignatures';
import { getFamilyDomainCard } from '@/lib/services/atlasFamilyDomainCards';
import { withAnthropicRetry } from '@/lib/services/anthropicRetry';

// In-memory module-scope cache keyed by (paramName + familyId). Survives multiple
// requests within a server process lifetime — typically dev server until restart,
// or until the Next.js production process recycles. Sample values vary per call but
// don't materially affect Haiku's translation, so we key only on paramName+familyId.
// 24h TTL is generous; admin overrides change rarely.
//
// CACHE INVALIDATION CAVEAT: when the engineer accepts a new override, that fact
// becomes part of "previously-accepted attributeIds in this scope" but the cache
// for OTHER paramNames in the same family doesn't auto-bust. In practice this is
// fine: triage is sequential (engineer doesn't re-query the same paramName twice
// within a session), so cache hits are rare during the active triage round, and
// fresh suggestions always see the latest overrides. Worst case: a stale cached
// suggestion shows up — engineer can override it inline, same as before.
// In-memory cache extracted to a service module so the Domain Cards
// approve flow can invalidate it cleanly (atlasSuggestCache.ts). Bump
// SUGGEST_CACHE_VERSION there when prompt logic changes.
import {
  buildSuggestCacheKey,
  getSuggestCacheEntry,
  setSuggestCacheEntry,
} from '@/lib/services/atlasSuggestCache';
import { computeSchemaVersion } from '@/lib/services/atlasSchemaVersion';
import { createServiceClient } from '@/lib/supabase/service';
import { getParamSuggestion, upsertParamSuggestion } from '@/lib/services/atlasParamSuggestionStore';


/** POST /api/admin/atlas/dictionaries/suggest */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { user, error: authError } = await requireAdmin();
    if (authError) return authError;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'No API key configured' }, { status: 500 });
    }

    const body = await request.json();
    const paramName = body.paramName as string;
    const samples = (body.samples as string[]) ?? [];
    const familyId = body.familyId as string;
    // Bulk-refresh path: caller signals "ignore the cache, re-run Sonnet
    // with the latest prompt context". Used by the Triage page's bulk
    // "Refresh AI suggestions" action after schema/card/dict changes.
    const force = body.force === true;

    if (!paramName) {
      return NextResponse.json({ success: false, error: 'paramName required' }, { status: 400 });
    }

    const schemaAttrs = getSchemaAttributes(familyId);
    const schemaIds = schemaAttrs.map((a) => a.attributeId);
    const schemaIdSet = new Set(schemaIds);

    // Resolve current schema + card versions for staleness signaling.
    // Returned in the response so the client stores them alongside the
    // cached suggestion. On future reads the client compares stored vs
    // current → renders proactive staleness UI when they differ.
    const currentSchemaVersion = computeSchemaVersion(familyId);
    let currentCardVersion: string | null = null;
    if (familyId) {
      try {
        const supabase = createServiceClient();
        const { data: cardRow } = await supabase
          .from('atlas_family_domain_cards')
          .select('updated_at')
          .eq('family_id', familyId)
          .eq('status', 'active')
          .maybeSingle();
        if (cardRow?.updated_at) currentCardVersion = cardRow.updated_at as string;
      } catch {
        // Fail-open — staleness comparison degrades to schema-only.
      }
    }

    // Cache check — returns stored suggestion if still fresh and not forced.
    const cacheKey = buildSuggestCacheKey(familyId, paramName);
    if (!force) {
      const cached = getSuggestCacheEntry(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return NextResponse.json({
          success: true,
          suggestion: cached.value,
          schemaIds,
          cached: true,
          currentCardVersion,
          currentSchemaVersion,
        });
      }
    }

    // Durable DB layer — if the in-memory cache missed (e.g. a redeploy cleared
    // it) but this param was generated before, serve the persisted verdict
    // instead of re-charging Sonnet. Warm the in-memory cache on the way out.
    if (!force) {
      const persisted = await getParamSuggestion(familyId, paramName);
      if (persisted) {
        setSuggestCacheEntry(cacheKey, persisted);
        return NextResponse.json({
          success: true,
          suggestion: persisted,
          schemaIds,
          cached: true,
          currentCardVersion,
          currentSchemaVersion,
        });
      }
    }

    // Include engineering reason per attribute so the model can disambiguate
    // same-named canonicals (e.g., recognize that "Gate Drive Supply VDD Range"
    // specifically means OUTPUT-side rail, not a generic VCC). Without this,
    // matching was label-only and confused semantically distinct rules.
    // L2 entries have no engineering reason and render with id+name only.
    const schemaList = schemaAttrs.length > 0
      ? schemaAttrs.map((a) => {
          const head = `- ${a.attributeId}: ${a.attributeName}${a.unit ? ` (${a.unit})` : ''}`;
          return a.engineeringReason ? `${head}\n    Reason: ${a.engineeringReason}` : head;
        }).join('\n')
      : '(no schema attributes available)';

    // Fetch previously-accepted canonicals for this scope. Goal: stop the
    // suggester from inventing near-duplicates (positions_rows vs
    // positions_and_rows; pins_per_row vs positions_per_row; wire_gauge for
    // BOTH AWG and mm² values; etc). Each entry includes the example raw
    // paramName the ID was first accepted under, so Haiku can see what
    // concept that canonical actually represents — preventing it from
    // shoehorning unrelated params into a generic-sounding ID like "style".
    const acceptedCanonicals = await fetchAcceptedCanonicals(familyId);
    const acceptedList = acceptedCanonicals.length > 0
      ? acceptedCanonicals
          .map((c) => `- ${c.attributeId}: ${c.attributeName}${c.unit ? ` (${c.unit})` : ''} — originally accepted for "${c.exampleRawParam}"`)
          .join('\n')
      : '(none yet)';

    // Cross-family canonical inventory — surfaces existing canonicals in
    // OTHER families so Sonnet doesn't invent near-duplicates (the
    // ICC/`supply_current_ma` vs `supply_current` case). Exclude
    // canonicals already in the current family's schema/accepted list
    // (Sonnet already sees those) to keep the prompt short.
    const crossFamilyInventory = await getCrossFamilyCanonicalSummary();
    const inCurrentScope = new Set([
      ...schemaIds,
      ...acceptedCanonicals.map((c) => c.attributeId),
    ]);
    const crossFamilyList = crossFamilyInventory
      .filter((c) => !inCurrentScope.has(c.attributeId))
      .map((c) => `- ${c.attributeId}: ${c.attributeName} (in ${c.families.slice(0, 3).join(', ')}${c.families.length > 3 ? `, +${c.families.length - 3}` : ''})`)
      .join('\n');
    const crossFamilySection = crossFamilyList || '(no cross-family canonicals to consider)';

    // Foreign-family parameter-name signatures (Decision #177 registry).
    // If the input paramName matches one of these patterns, the row's
    // products may be misclassified — Sonnet should defer with a note
    // rather than mint a canonical in the current (wrong) family.
    const signatureList = FAMILY_PARAM_SIGNATURES.map((sig) => {
      const patternText = String(sig.pattern).replace(/^\/\^?/, '').replace(/\\?b?\$?\/i?$/, '').replace(/\\b/g, '');
      return `- /${patternText}/ → family ${sig.target.familyId} (${sig.target.subcategory})`;
    }).join('\n');

    // Resolve the per-family domain card (DB-active row OR TS fallback).
    // Async because we read from atlas_family_domain_cards with 60s cache.
    const domainCard = await getFamilyDomainCard(familyId);
    const domainSection = domainCard
      ? `\n${familyId} DOMAIN CONTEXT — sub-types, common confusions, conventional units, foreign-family indicators (use this to disambiguate same-named canonicals and avoid inventing duplicates):\n${domainCard}\n`
      : '';

    const prompt = `You are an electronics component parameter triage assistant. The engineer reviewing this row will manually decide whether to accept the suggested mapping or defer it (leave a team note explaining the concern). Your job is to give them ONE binary suggestion plus a substantive written explanation that they can act on or ignore. You are not deciding for them.

Given a Chinese parameter name from a component datasheet, provide:
1. An English translation of the parameter name
2. The best matching attribute from the schema below (if any)
3. A suggested attributeId and attributeName if no schema match exists
4. The likely unit of measurement (if determinable from the name or sample values)
5. Confidence: "high" ONLY if translation is certain AND schema match is clear AND there is NOTHING — about the mapping OR the sample values — that you would ask a human to inspect (no data-quality flag, no outliers/wide-spread values to sanity-check, no unit ambiguity, no possible transcription error, no "verify/spot-check/confirm before committing"). "medium" if the mapping is sound but you have ANY reservation a human should check — INCLUDING a data-value concern even when the mapping itself is obvious — or the schema match is approximate. "low" if the translation itself is uncertain. Decisive test: if your explanation would recommend the engineer verify, spot-check, confirm, or double-check ANYTHING, the confidence is NOT "high" — downgrade to "medium".
6. A suggestion: "accept" (the suggested attributeId is safe to commit as a dictionary override) OR "defer" (something is off — the engineer should leave a team note and investigate before accepting)
7. An explanation written in the same voice and detail an engineer would write a team note. Full sentences, specific, concrete. ALWAYS populate this field — Accept and Defer get the same depth of evidence.

Current scope: ${familyId || '(unscoped)'}
${domainSection}
Schema attributes for this component family:
${schemaList}

Previously-accepted attributeIds in this same family/category (the "originally accepted for" hint shows what concept each ID was minted for):
${acceptedList}

Canonicals already in use in OTHER families/categories (do NOT invent near-duplicates of these — either reuse the existing canonical if your row genuinely fits its concept, or pick a clearly differentiated name):
${crossFamilySection}

Foreign-family indicators — if the input paramName matches one of these patterns, the row's products may belong to a DIFFERENT family than the current scope. When that happens, prefer suggestion='defer' with explanation noting the probable misclassification:
${signatureList}

Known family IDs (do NOT invent new ones — if your explanation mentions a family, it MUST be from this list):
${KNOWN_FAMILY_IDS_LIST.join(', ')}

When suggesting an attributeId, follow this priority order:
1. Schema attributes (above) — if a schema attribute is a clear conceptual match for the input paramName, ALWAYS prefer it.
2. Previously-accepted attributeIds — if no schema match, check whether an existing canonical here represents the SAME CONCEPT as the input (e.g. "每排PIN数" and "每行端子数" both mean "pins per row" → reuse the existing canonical). Reuse only when the concept matches; do NOT shoehorn semantically different params into a generic-sounding ID like "style", "type", "size", or "kind" just because they exist.
3. Invent a new attributeId only when neither list has anything semantically appropriate. Avoid generic catchall names; prefer specific ones (e.g. "pins_per_row" over "rows", "compatible_series" over "style", "wire_csa_mm2" over "wire_gauge" when units differ). CHECK the cross-family canonicals list above — if your proposed ID is a near-duplicate of one (e.g. proposing 'supply_current_ma' when 'supply_current' already exists), either map to the existing one (if the concept genuinely matches) or pick a clearly differentiated name (e.g. 'icc_total_ma').

SCOPE OF YOUR ROLE — do not speculate about system behavior:

You recommend the attributeId + unit + accept/defer verdict and justify the match against the schema and sample values. That is your entire job. You do NOT know what the ingest pipeline, runtime, or matching engine do with the data — DO NOT describe, predict, or assert any system behavior. No "will be converted on ingest," no "will be normalized for consistency," no "the system stores X canonically as Y," no "filtering will apply Z." Those claims have been wrong every time the AI has made them.

If you notice a data-quality concern (non-standard unit string in sample values, inconsistent vendor conventions, ambiguous magnitude), phrase it as a RECOMMENDATION TO THE ENGINEER, not a prediction about the system. Right: "Set the unit field to 'A' so this entry's unit is consistent with other current-rating entries." Wrong: "The 'AMP' suffix will be normalized to 'A' during ingest."

UNIT FIELD GUIDANCE:

How to choose suggestedUnit (in priority order):
1. **If the paramName explicitly declares a unit in parentheses or suffix** — USE THAT. Examples: "FSW(kHz)" → 'kHz', "Vout(mV)" → 'mV', "频率(MHz)" → 'MHz', "tr (ns)" → 'ns'. Vendor told you the unit; trust the vendor over any other source.
2. **If the paramName has no unit but sample values DO have unit suffixes** — use the unit that the sample values most consistently carry.
3. **If both paramName and sample values are unit-less** — pick the unit that makes the bare numbers physically plausible for the spec. Sample "120, 180, 500" for switching frequency → 'kHz' (120 kHz, not 120 MHz which is unrealistic for a DC-DC regulator). Use the domain card's typical-range hints when available.
4. **Each dictionary entry is per-paramName and can have its own unit** — different vendors ship the same conceptual spec in different units. The schema attribute's unit annotation (e.g. "fsw: Switching Frequency (MHz)") and previously-accepted entries' units are INFORMATIONAL — useful as hints but they don't dictate this row's unit. Use what the paramName and sample values indicate.

When sample values suggest a unit that DIFFERS from a previously-accepted same-attribute entry, your explanation MUST call this out: "Note: previously-accepted 'switching frequency (max.) (mhz)' was set to MHz, but this row's paramName 'FSW(kHz)' and sample values (120, 180, 500) indicate kHz. Different vendors use different conventions — recommend setting unit to kHz."

When choosing the suggestion field:
- "accept" iff: the suggested attributeId is in the schema list above (canonical match) AND the concept clearly matches the input paramName AND the sample values are consistent with the unit/format implied by that attributeId. OR: the suggested attributeId reuses a previously-accepted canonical AND that canonical genuinely represents the same concept (not just a generic-sounding shoehorn).
- "defer" iff ANY of the following: (a) the suggested attributeId is a generic-catchall name (style, type, size, kind, category, material, characteristic, feature, spec, specification) AND would shoehorn an unrelated concept under that ID — accepting would conflate distinct concepts under one canonical and break filtering. (b) the suggested attributeId would create a near-duplicate of an existing previously-accepted canonical (e.g. previously-accepted has "pins_per_row" and you'd be inventing "positions_per_row"). (c) the sample values' units or format don't match the suggested attributeId (e.g. attributeId implies AWG but values are in mm²). (d) the concept is ambiguous or unclear (e.g. "塑高" could mean housing height, body height, or seated height) and a more specific canonical should be defined manually first. (e) the input paramName matches a foreign-family indicator (see list above) AND that target family ≠ current scope — explain that the row's products may be misclassified and recommend the engineer review the family assignment before accepting the param mapping. (f) the suggested attributeId would near-duplicate a canonical that already exists in another family (see cross-family canonicals list above).

Explanation field — examples of the depth/voice expected:

For an Accept: "Schema-canonical match — dropout_voltage_v is in the LDO logic table and the sample values (0.3V, 0.45V) are consistent with the unit. Concept aligns directly with the standard LDO dropout spec. Safe to accept."

For a Defer: "Suggested attributeId 'style' is a generic catchall — accepting this would put '参考系列' (which is a series-reference like 'compatible with XYZ123 series') into the same canonical as orientation, flange-presence, and material values. Recommend defining a specific 'compatible_series' attributeId via the Atlas Dictionaries panel first, then accepting here."

For a Defer (ambiguity): "Concept is ambiguous — '塑高' could mean housing height, body height, or seated mating height. None of these exist as canonicals in the Connectors L2 schema. Recommend investigating the upstream MFR datasheet to nail down which dimension this represents before minting a canonical."

For a Defer (unit mismatch): "Suggested attributeId 'wire_gauge' implies AWG, but sample values are mm² (1.5, 2.5, 4.0). These are CSA cross-section values, not gauge numbers. Recommend a separate 'wire_csa_mm2' canonical."

Two additional fields for context-gap reporting (used to surface when a family's domain card is missing real-world gotchas):
- "needsDomainCard": true ONLY when your uncertainty on this row would have been meaningfully reduced by family-specific domain knowledge that ISN'T in the schema labels / engineering reasons / signatures / cross-family inventory you were shown. Examples that warrant true: input-side vs output-side rail distinctions on isolated drivers that aren't separated as canonicals; sub-type-specific conventions; foreign-family indicators that should exist but aren't in the signature registry. Examples that do NOT warrant true: rows where the existing context was sufficient and you simply lack confidence; rows where the schema is clearly incomplete (use "defer" instead); generic translation difficulty. Default: false.
- "domainCardGap": one-line plain English description of what specific knowledge was missing — only populated when needsDomainCard is true. Engineer reads this to decide whether to refresh the family's domain card.

Respond in JSON only, no markdown:
{"translation":"...","suggestedAttributeId":"...","suggestedAttributeName":"...","suggestedUnit":"...or null","confidence":"high|medium|low","reasoning":"one short sentence explaining the attributeId match (separate from the suggestion explanation)","suggestion":"accept|defer","explanation":"full prose written in engineer-note voice, 1-3 sentences, ALWAYS populated","needsDomainCard":false,"domainCardGap":null}`;

    const userMsg = `Chinese parameter: "${paramName}"${samples.length > 0 ? `\nSample values: ${samples.join(', ')}` : ''}`;

    const client = new Anthropic({ apiKey });
    const response = await withAnthropicRetry(
      () =>
        client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 600,
          system: prompt,
          messages: [{ role: 'user', content: userMsg }],
        }),
      { label: `suggest ${paramName}` }
    );

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    // Haiku occasionally wraps the JSON response in markdown fences (```json ... ```)
    // even when instructed not to. Strip them before parsing to avoid SyntaxError.
    const cleaned = text
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    const parsed = JSON.parse(cleaned);

    // Normalize the suggestion field — Sonnet may return slight variants
    // ('Accept', 'Defer', etc.). Default to 'defer' on anything unrecognized:
    // erring toward "engineer should look at this" is safer than defaulting
    // to a silent auto-accept. The explanation is always passed through.
    const rawSuggestion = typeof parsed.suggestion === 'string' ? parsed.suggestion.toLowerCase().trim() : '';
    let normalizedSuggestion: 'accept' | 'defer' = rawSuggestion === 'accept' ? 'accept' : 'defer';
    let postValidationNote: string | null = null;

    // Server-side collision check: if the AI returns suggestion='accept' AND
    // proposes a NEW canonical (not in the current scope's schema or accepted
    // list), check it against the full cross-family inventory. If it
    // near-duplicates an existing canonical, downgrade to defer with a
    // diagnostic explanation. Catches the case where the prompt's hint is
    // ignored — belt-and-suspenders.
    const proposedId = parsed.suggestedAttributeId as string | null;
    if (normalizedSuggestion === 'accept' && proposedId && !inCurrentScope.has(proposedId)) {
      const collision = detectCanonicalCollision(proposedId, crossFamilyInventory, familyId);
      if (collision) {
        normalizedSuggestion = 'defer';
        postValidationNote = `Proposed canonical '${proposedId}' near-duplicates existing '${collision.existingId}' (${collision.existingName}) in ${collision.families.join(', ')}. Either reuse the existing canonical if your row matches its concept, or pick a clearly differentiated name.`;
      }
    }

    const baseExplanation = typeof parsed.explanation === 'string' && parsed.explanation.trim() ? parsed.explanation.trim() : null;
    const finalExplanation = postValidationNote
      ? (baseExplanation ? `${baseExplanation}\n\nServer post-check: ${postValidationNote}` : `Server post-check: ${postValidationNote}`)
      : baseExplanation;

    const suggestion = {
      translation: parsed.translation ?? null,
      suggestedAttributeId: proposedId ?? null,
      suggestedAttributeName: parsed.suggestedAttributeName ?? null,
      suggestedUnit: parsed.suggestedUnit ?? null,
      confidence: parsed.confidence ?? 'low',
      reasoning: parsed.reasoning ?? null,
      suggestion: normalizedSuggestion,
      explanation: finalExplanation,
    };

    setSuggestCacheEntry(cacheKey, suggestion);

    // Persist durably so the verdict survives redeploys / browser changes and
    // the queue can count + filter "Accept" server-side. Awaited but non-fatal
    // (the store swallows its own errors); generated_by is best-effort.
    await upsertParamSuggestion({
      familyId,
      rawParamName: paramName,
      suggestion,
      cardVersion: currentCardVersion,
      schemaVersion: currentSchemaVersion,
      generatedBy: user?.id ?? null,
    });

    // Fire-and-forget context-flag write — drives the Domain Cards
    // panel's per-family health indicator. Only writes when the model
    // self-flagged AND we have a resolvable family scope. Errors are
    // swallowed so a flag-DB hiccup never breaks the suggestion response.
    const needsDomainCard = parsed.needsDomainCard === true;
    const gapDescription = typeof parsed.domainCardGap === 'string' && parsed.domainCardGap.trim()
      ? parsed.domainCardGap.trim()
      : null;
    if (needsDomainCard && familyId) {
      void (async () => {
        try {
          const supabase = createServiceClient();
          await supabase
            .from('atlas_ai_context_flags')
            .insert({
              family_id: familyId,
              param_name: paramName,
              gap_description: gapDescription,
              model_used: 'claude-sonnet-4-6',
            });
        } catch {
          // Fail-open — flag is advisory, not load-bearing.
        }
      })();
    }

    return NextResponse.json({
      success: true,
      suggestion,
      schemaIds,
      currentCardVersion,
      currentSchemaVersion,
    });
  } catch (error) {
    console.error('Dictionary suggest error:', error);
    return NextResponse.json({ success: false, error: 'Suggestion failed' }, { status: 500 });
  }
}
