import { SearchResult, PartAttributes, XrefRecommendation, ApiResponse, OrchestratorMessage, OrchestratorResponse, ApplicationContext } from './types';

const BASE = '/api';

async function fetchApi<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  const json: ApiResponse<T> = await res.json();
  if (!json.success || !json.data) {
    throw new Error(json.error ?? 'Unknown API error');
  }
  return json.data;
}

export async function searchParts(query: string): Promise<SearchResult> {
  return fetchApi<SearchResult>(`${BASE}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
}

export async function getPartAttributes(mpn: string): Promise<PartAttributes> {
  return fetchApi<PartAttributes>(`${BASE}/attributes/${encodeURIComponent(mpn)}`);
}

export async function getRecommendations(mpn: string): Promise<XrefRecommendation[]> {
  return fetchApi<XrefRecommendation[]>(`${BASE}/xref/${encodeURIComponent(mpn)}`);
}

export async function getRecommendationsWithOverrides(
  mpn: string,
  overrides: Record<string, string>,
  applicationContext?: ApplicationContext
): Promise<XrefRecommendation[]> {
  return fetchApi<XrefRecommendation[]>(`${BASE}/xref/${encodeURIComponent(mpn)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ overrides, applicationContext }),
  });
}

export async function getRecommendationsWithContext(
  mpn: string,
  applicationContext: ApplicationContext
): Promise<XrefRecommendation[]> {
  return fetchApi<XrefRecommendation[]>(`${BASE}/xref/${encodeURIComponent(mpn)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ applicationContext }),
  });
}

/** Send messages to the Claude LLM orchestrator */
export async function chatWithOrchestrator(
  messages: OrchestratorMessage[]
): Promise<OrchestratorResponse> {
  return fetchApi<OrchestratorResponse>(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
}

/** Validate a batch of parts. Returns a ReadableStream for streaming NDJSON. */
export async function validatePartsList(
  items: Array<{ rowIndex: number; mpn: string; manufacturer?: string; description?: string }>
): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(`${BASE}/parts-list/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  if (!res.ok || !res.body) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body.error) detail = body.error;
    } catch { /* ignore parse errors */ }
    throw new Error(`Validation failed: ${detail}`);
  }
  return res.body;
}
