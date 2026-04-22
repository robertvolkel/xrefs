import { NextRequest } from 'next/server';
import { BatchValidateRequest, BatchValidateItem, UserPreferences, PartSummary, PartAttributes, ComponentCategory, ReplacementPriorities } from '@/lib/types';
import { searchParts, getAttributes, getRecommendations } from '@/lib/services/partDataService';
import { requireAuth } from '@/lib/supabase/auth-guard';
import { buildEnrichedData } from '@/lib/services/enrichedDataBuilder';
import { logRecommendation } from '@/lib/services/recommendationLogger';
import { fetchUserPreferences } from '@/lib/services/userPreferencesService';

const CONCURRENCY = 5;

/** Process a single item: search → attributes → recommendations */
async function processItem(
  item: { rowIndex: number; mpn: string; manufacturer?: string; description?: string; skipSearch?: boolean },
  currency?: string,
  userId?: string,
  userPreferences?: UserPreferences,
  forceRefresh?: boolean,
  replacementPriorities?: ReplacementPriorities,
): Promise<BatchValidateItem> {
  try {
    const query = item.mpn.trim() || item.description?.trim() || '';
    if (!query) {
      return { rowIndex: item.rowIndex, status: 'not-found' };
    }

    let resolvedPart: PartSummary;
    let prefetchedAttributes: PartAttributes | undefined;

    if (item.skipSearch) {
      // MPN already confirmed via search picker — skip straight to attributes.
      // Category is a placeholder — getAttributes() will resolve the real one.
      resolvedPart = { mpn: query, manufacturer: item.manufacturer ?? '', description: '', category: 'ICs' as ComponentCategory };
    } else {
      // Step 1: Search for the part (use MPN if available, otherwise description)
      const searchQuery = !item.mpn.trim() && item.manufacturer
        ? `${item.manufacturer} ${query}`
        : query;

      const searchResult = await searchParts(searchQuery, currency, userId, { skipFindchips: true });

      if (searchResult.type === 'none') {
        // Fallback: try direct attribute lookup (exact MPN match against Digikey, Atlas, parts.io)
        // searchParts uses prefix/keyword matching which may miss parts that exact lookup finds
        const directAttrs = await getAttributes(query, currency, userId, { skipFindchips: true });
        if (!directAttrs) {
          return { rowIndex: item.rowIndex, status: 'not-found' };
        }
        // Build a synthetic resolvedPart from the attributes
        resolvedPart = {
          mpn: directAttrs.part.mpn,
          manufacturer: directAttrs.part.manufacturer,
          description: directAttrs.part.description,
          category: directAttrs.part.category,
          status: directAttrs.part.status,
          dataSource: directAttrs.dataSource === 'mock' ? undefined : directAttrs.dataSource,
        };
        prefetchedAttributes = directAttrs;
      } else {
        resolvedPart = searchResult.matches[0];
      }
    }

    // Step 2: Get attributes
    const sourceAttributes = prefetchedAttributes ?? await getAttributes(resolvedPart.mpn, currency, userId, { skipFindchips: true });
    if (!sourceAttributes) {
      return { rowIndex: item.rowIndex, status: 'resolved', resolvedPart };
    }

    // When search was skipped, backfill resolvedPart from attributes
    if (item.skipSearch && sourceAttributes) {
      resolvedPart = {
        mpn: sourceAttributes.part.mpn,
        manufacturer: sourceAttributes.part.manufacturer,
        description: sourceAttributes.part.description,
        category: sourceAttributes.part.category,
        status: sourceAttributes.part.status,
        dataSource: sourceAttributes.dataSource === 'mock' ? undefined : sourceAttributes.dataSource,
      };
    }

    // Step 3: Get recommendations (pass prefetched attrs to avoid redundant lookup)
    // Skip parts.io candidate enrichment in batch — saves ~20 API calls per part
    const recResult = await getRecommendations(
      resolvedPart.mpn, undefined, undefined, currency, undefined,
      userPreferences, userId, prefetchedAttributes,
      { skipPartsioEnrichment: true, filterForBatch: true, skipFindchips: true, forceRefresh },
      replacementPriorities,
    );
    const recs = recResult.recommendations;
    const replacement = recs.length > 0 ? recs[0] : undefined;

    // Step 3b: Log recommendation (awaited to ensure it completes within request lifecycle)
    if (userId) {
      await logRecommendation({
        userId,
        sourceMpn: resolvedPart.mpn,
        sourceManufacturer: resolvedPart.manufacturer,
        familyId: recResult.familyId,
        familyName: recResult.familyName,
        recommendationCount: recs.length,
        requestSource: 'batch',
        dataSource: recResult.dataSource,
        snapshot: {
          sourceAttributes: recResult.sourceAttributes,
          recommendations: recs,
        },
      });
    }

    // Step 4: Build enriched data for column views
    const enrichedData = sourceAttributes ? buildEnrichedData(sourceAttributes) : undefined;

    return {
      rowIndex: item.rowIndex,
      status: 'resolved',
      resolvedPart,
      sourceAttributes,
      replacement,
      allRecommendations: recs,
      enrichedData,
    };
  } catch (error) {
    return {
      rowIndex: item.rowIndex,
      status: 'error',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, error: authError } = await requireAuth();
    if (authError) return authError;

    const body: BatchValidateRequest = await request.json();

    if (!body.items || body.items.length === 0) {
      return new Response(JSON.stringify({ error: 'No items provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Fetch user preferences once for the whole batch
    const prefs = await fetchUserPreferences(user!.id);

    // Stream results as NDJSON
    const encoder = new TextEncoder();
    const stream = new TransformStream<Uint8Array, Uint8Array>();
    const writer = stream.writable.getWriter();

    // Process in background, writing results as they complete
    (async () => {
      try {
        // Process in chunks for concurrency control
        for (let i = 0; i < body.items.length; i += CONCURRENCY) {
          const chunk = body.items.slice(i, i + CONCURRENCY);
          const results = await Promise.all(chunk.map(item => processItem(item, body.currency, user?.id, prefs, body.forceRefresh, body.replacementPriorities)));

          for (const result of results) {
            await writer.write(encoder.encode(JSON.stringify(result) + '\n'));
          }
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Processing error';
        await writer.write(encoder.encode(JSON.stringify({ error: errMsg }) + '\n'));
      } finally {
        await writer.close();
      }
    })();

    return new Response(stream.readable, {
      headers: { 'Content-Type': 'application/x-ndjson' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
