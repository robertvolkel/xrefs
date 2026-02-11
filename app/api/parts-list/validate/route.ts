import { NextRequest } from 'next/server';
import { BatchValidateRequest, BatchValidateItem } from '@/lib/types';
import { searchParts, getAttributes, getRecommendations } from '@/lib/services/partDataService';

const CONCURRENCY = 3;

/** Process a single item: search → attributes → recommendations */
async function processItem(
  item: { rowIndex: number; mpn: string; manufacturer?: string; description?: string }
): Promise<BatchValidateItem> {
  try {
    // Step 1: Search for the part (use MPN if available, otherwise description)
    const query = item.mpn.trim() || item.description?.trim() || '';
    if (!query) {
      return { rowIndex: item.rowIndex, status: 'not-found' };
    }

    // If using description, prepend manufacturer for better results
    const searchQuery = !item.mpn.trim() && item.manufacturer
      ? `${item.manufacturer} ${query}`
      : query;

    const searchResult = await searchParts(searchQuery);

    if (searchResult.type === 'none') {
      return { rowIndex: item.rowIndex, status: 'not-found' };
    }

    // Use the first match (best confidence)
    const resolvedPart = searchResult.matches[0];

    // Step 2: Get attributes
    const sourceAttributes = await getAttributes(resolvedPart.mpn);
    if (!sourceAttributes) {
      return { rowIndex: item.rowIndex, status: 'resolved', resolvedPart };
    }

    // Step 3: Get recommendations
    const recs = await getRecommendations(resolvedPart.mpn);
    const suggestedReplacement = recs.length > 0 ? recs[0] : undefined;

    return {
      rowIndex: item.rowIndex,
      status: 'resolved',
      resolvedPart,
      sourceAttributes,
      suggestedReplacement,
      allRecommendations: recs,
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
    const body: BatchValidateRequest = await request.json();

    if (!body.items || body.items.length === 0) {
      return new Response(JSON.stringify({ error: 'No items provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

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
          const results = await Promise.all(chunk.map(processItem));

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
