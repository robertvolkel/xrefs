import { SearchResult, PartAttributes, XrefRecommendation, ApiResponse, OrchestratorMessage, OrchestratorResponse, ApplicationContext, QcFeedbackSubmission, PlatformSettings, RecommendationLogEntry, QcFeedbackRecord, QcFeedbackUpdate, QcFeedbackListItem, FeedbackStatusCounts, FeedbackStatus, FeedbackStage, ReleaseNote, AtlasDictOverrideRecord, UserPreferences, SupplierQuote, LifecycleInfo, ComplianceData, ListAgentContext, ListAgentResponse, PartSummary } from './types';
import type { ServiceWarning, ServiceName, ServiceStatusInfo } from './types';

// Admin types
export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  role: 'user' | 'admin';
  disabled: boolean;
  created_at: string;
  search_count: number;
  list_count: number;
  last_active: string | null;
  total_tokens: number;
  estimated_cost: number;
  dk_calls: number;
  mouser_calls: number;
}

const BASE = '/api';

// ── Service Status Event Emitter ──────────────────────────────

type ServiceWarningListener = (warnings: ServiceWarning[]) => void;
type ServiceRecoveryListener = (services: ServiceName[]) => void;

const warningListeners = new Set<ServiceWarningListener>();
const recoveryListeners = new Set<ServiceRecoveryListener>();

/** Subscribe to service warning events. Returns unsubscribe function. */
export function onServiceWarnings(listener: ServiceWarningListener): () => void {
  warningListeners.add(listener);
  return () => warningListeners.delete(listener);
}

/** Subscribe to service recovery events. Returns unsubscribe function. */
export function onServiceRecoveries(listener: ServiceRecoveryListener): () => void {
  recoveryListeners.add(listener);
  return () => recoveryListeners.delete(listener);
}

/** Which services each API route exercises — used for recovery detection. */
const ROUTE_SERVICES: Record<string, ServiceName[]> = {
  '/api/search': ['digikey', 'atlas', 'partsio', 'mouser'],
  '/api/attributes': ['digikey', 'partsio'],
  '/api/xref': ['digikey', 'partsio', 'mouser'],
  '/api/chat': ['anthropic'],
  '/api/modal-chat': ['anthropic'],
  '/api/mouser/enrich': ['mouser'],
  '/api/parts-list/validate': ['digikey', 'partsio', 'mouser'],
  '/api/list-chat': ['anthropic'],
};

function getRouteServices(url: string): ServiceName[] {
  for (const [route, services] of Object.entries(ROUTE_SERVICES)) {
    if (url.startsWith(route)) return services;
  }
  return [];
}

async function fetchApi<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  const json: ApiResponse<T> = await res.json();

  // Emit service warnings or recoveries (before checking success — error responses can carry warnings too)
  if (json.serviceWarnings && json.serviceWarnings.length > 0) {
    for (const listener of warningListeners) listener(json.serviceWarnings);
  } else {
    // No warnings — services exercised by this route have recovered
    const recovered = getRouteServices(url);
    if (recovered.length > 0) {
      for (const listener of recoveryListeners) listener(recovered);
    }
  }

  if (!json.success || !json.data) {
    throw new Error(json.error ?? 'Unknown API error');
  }
  return json.data;
}

// ── Health Check ─────────────────────────────────────────────

export async function fetchHealthStatus(): Promise<ServiceStatusInfo[]> {
  const res = await fetch('/api/health');
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  const json = await res.json();
  return json.services;
}

export async function searchParts(query: string, signal?: AbortSignal): Promise<SearchResult> {
  return fetchApi<SearchResult>(`${BASE}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
    signal,
  });
}

export async function getPartAttributes(mpn: string, signal?: AbortSignal): Promise<PartAttributes> {
  return fetchApi<PartAttributes>(`${BASE}/attributes/${encodeURIComponent(mpn)}`, { signal });
}

export async function getRecommendations(mpn: string, signal?: AbortSignal): Promise<XrefRecommendation[]> {
  return fetchApi<XrefRecommendation[]>(`${BASE}/xref/${encodeURIComponent(mpn)}`, { signal });
}

export async function getRecommendationsWithOverrides(
  mpn: string,
  overrides: Record<string, string>,
  applicationContext?: ApplicationContext,
  signal?: AbortSignal,
  sourceAttributes?: PartAttributes,
): Promise<XrefRecommendation[]> {
  return fetchApi<XrefRecommendation[]>(`${BASE}/xref/${encodeURIComponent(mpn)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ overrides, applicationContext, sourceAttributes }),
    signal,
  });
}

export async function getRecommendationsWithContext(
  mpn: string,
  applicationContext: ApplicationContext,
  signal?: AbortSignal,
): Promise<XrefRecommendation[]> {
  return fetchApi<XrefRecommendation[]>(`${BASE}/xref/${encodeURIComponent(mpn)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ applicationContext }),
    signal,
  });
}

/** Fetch Mouser enrichment data (pricing, lifecycle, compliance) for a batch of MPNs */
export async function enrichWithMouserBatch(
  mpns: string[],
): Promise<Record<string, { quote: SupplierQuote; lifecycle: LifecycleInfo | null; compliance: ComplianceData | null }>> {
  if (mpns.length === 0) return {};
  try {
    const result = await fetchApi<{ results: Record<string, { quote: SupplierQuote; lifecycle: LifecycleInfo | null; compliance: ComplianceData | null }> }>(
      `${BASE}/mouser/enrich`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mpns }),
      },
    );
    return result.results ?? {};
  } catch {
    return {};
  }
}

/** Send messages to the Claude LLM orchestrator */
export async function chatWithOrchestrator(
  messages: OrchestratorMessage[],
  recommendations?: XrefRecommendation[],
  signal?: AbortSignal,
): Promise<OrchestratorResponse> {
  return fetchApi<OrchestratorResponse>(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, recommendations }),
    signal,
  });
}

/** Send messages to the refinement chat orchestrator (modal context) */
export async function modalChat(
  messages: OrchestratorMessage[],
  mpn: string,
  overrides?: Record<string, string>,
  applicationContext?: ApplicationContext,
  recommendations?: XrefRecommendation[],
): Promise<OrchestratorResponse> {
  return fetchApi<OrchestratorResponse>(`${BASE}/modal-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, mpn, overrides, applicationContext, recommendations }),
  });
}

/** Send messages to the list agent orchestrator */
export async function listAgentChat(
  messages: OrchestratorMessage[],
  listContext: ListAgentContext,
  listId: string,
  signal?: AbortSignal,
): Promise<ListAgentResponse> {
  return fetchApi<ListAgentResponse>(`${BASE}/list-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, listContext, listId }),
    signal,
  });
}

// ── Admin API ──────────────────────────────────────────────

export async function getUsers(): Promise<AdminUser[]> {
  return fetchApi<AdminUser[]>(`${BASE}/admin/users`);
}

export async function updateUserRole(userId: string, role: 'user' | 'admin'): Promise<void> {
  const res = await fetch(`${BASE}/admin/users/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? 'Failed to update role');
}

export async function toggleUserDisabled(userId: string, disabled: boolean): Promise<void> {
  const res = await fetch(`${BASE}/admin/users/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ disabled }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? 'Failed to update user status');
}

export async function deleteUser(userId: string): Promise<void> {
  const res = await fetch(`${BASE}/admin/users/${userId}`, { method: 'DELETE' });
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? 'Failed to delete user');
}

// ── QC Feedback API ──────────────────────────────────────

/** Submit user feedback on a recommendation rule or context question */
export async function submitFeedback(submission: QcFeedbackSubmission): Promise<{ id: string }> {
  return fetchApi<{ id: string }>(`${BASE}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(submission),
  });
}

// ── Admin QC API ─────────────────────────────────────────

/** Get QC logging settings */
export async function getQcSettings(): Promise<PlatformSettings> {
  return fetchApi<PlatformSettings>(`${BASE}/admin/qc/settings`);
}

/** Update QC logging settings */
export async function updateQcSettings(settings: Partial<PlatformSettings>): Promise<void> {
  const res = await fetch(`${BASE}/admin/qc/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? 'Failed to update settings');
}

/** Get paginated QC log entries */
export async function getAdminQcLog(params?: {
  requestSource?: string;
  familyId?: string;
  hasFeedback?: boolean;
  search?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}): Promise<{ items: RecommendationLogEntry[]; total: number }> {
  const searchParams = new URLSearchParams();
  if (params?.requestSource) searchParams.set('request_source', params.requestSource);
  if (params?.familyId) searchParams.set('family_id', params.familyId);
  if (params?.hasFeedback !== undefined) searchParams.set('has_feedback', String(params.hasFeedback));
  if (params?.search) searchParams.set('search', params.search);
  if (params?.sortBy) searchParams.set('sort_by', params.sortBy);
  if (params?.sortDir) searchParams.set('sort_dir', params.sortDir);
  if (params?.page !== undefined) searchParams.set('page', String(params.page));
  if (params?.limit !== undefined) searchParams.set('limit', String(params.limit));
  const qs = searchParams.toString();
  return fetchApi<{ items: RecommendationLogEntry[]; total: number }>(`${BASE}/admin/qc${qs ? `?${qs}` : ''}`);
}

/** Get single QC log entry detail with feedback */
export async function getAdminQcLogDetail(logId: string): Promise<{ log: RecommendationLogEntry; feedback: QcFeedbackRecord[] }> {
  return fetchApi<{ log: RecommendationLogEntry; feedback: QcFeedbackRecord[] }>(`${BASE}/admin/qc/${logId}`);
}

/** Get paginated feedback items for admin triage */
export async function getAdminFeedbackList(params?: {
  status?: FeedbackStatus;
  stage?: FeedbackStage;
  search?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}): Promise<{ items: QcFeedbackListItem[]; total: number; statusCounts: FeedbackStatusCounts }> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set('status', params.status);
  if (params?.stage) searchParams.set('stage', params.stage);
  if (params?.search) searchParams.set('search', params.search);
  if (params?.sortBy) searchParams.set('sort_by', params.sortBy);
  if (params?.sortDir) searchParams.set('sort_dir', params.sortDir);
  if (params?.page !== undefined) searchParams.set('page', String(params.page));
  if (params?.limit !== undefined) searchParams.set('limit', String(params.limit));
  const qs = searchParams.toString();
  return fetchApi<{ items: QcFeedbackListItem[]; total: number; statusCounts: FeedbackStatusCounts }>(
    `${BASE}/admin/qc/feedback${qs ? `?${qs}` : ''}`
  );
}

/** Update feedback status / admin notes */
export async function updateFeedback(feedbackId: string, update: QcFeedbackUpdate): Promise<void> {
  const res = await fetch(`${BASE}/admin/qc/feedback/${feedbackId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? 'Failed to update feedback');
}

/** Build export URL for direct download (window.open). */
export function getQcExportUrl(params?: {
  format?: 'csv' | 'json';
  requestSource?: string;
  familyId?: string;
  hasFeedback?: boolean;
  search?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}): string {
  const sp = new URLSearchParams();
  if (params?.format) sp.set('format', params.format);
  if (params?.requestSource) sp.set('request_source', params.requestSource);
  if (params?.familyId) sp.set('family_id', params.familyId);
  if (params?.hasFeedback) sp.set('has_feedback', 'true');
  if (params?.search) sp.set('search', params.search);
  if (params?.sortBy) sp.set('sort_by', params.sortBy);
  if (params?.sortDir) sp.set('sort_dir', params.sortDir);
  const qs = sp.toString();
  return `${BASE}/admin/qc/export${qs ? `?${qs}` : ''}`;
}

/** Start streaming AI analysis. Returns raw ReadableStream for SSE consumption. */
export async function analyzeQcLogs(params: {
  days?: number;
  requestSource?: string;
  familyId?: string;
  hasFeedback?: boolean;
  search?: string;
}): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(`${BASE}/admin/qc/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok || !res.body) {
    throw new Error(`Analysis failed: HTTP ${res.status}`);
  }
  return res.body;
}

/** Quick search for Add Part dialog — resolves MPN identity without full validation. */
export async function searchPartQuick(
  mpn: string,
  manufacturer?: string,
): Promise<{ matches: PartSummary[]; manufacturerMismatch: boolean }> {
  const res = await fetch(`${BASE}/parts-list/search-quick`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mpn, manufacturer }),
  });
  if (!res.ok) {
    return { matches: [], manufacturerMismatch: false };
  }
  return res.json();
}

/** Validate a batch of parts. Returns a ReadableStream for streaming NDJSON. */
export async function validatePartsList(
  items: Array<{ rowIndex: number; mpn: string; manufacturer?: string; description?: string; skipSearch?: boolean }>,
  currency?: string,
  signal?: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(`${BASE}/parts-list/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items, currency }),
    signal,
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

// ── Admin Override API ──────────────────────────────────────

import type { RuleOverrideRecord, RuleOverrideHistoryEntry, RuleAnnotation, ContextOverrideRecord, MatchingRule } from './types';

export async function getRuleOverrides(familyId?: string): Promise<RuleOverrideRecord[]> {
  const qs = familyId ? `?family_id=${familyId}` : '';
  const res = await fetch(`${BASE}/admin/overrides/rules${qs}`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.data ?? [];
}

export async function createRuleOverride(
  data: Omit<RuleOverrideRecord, 'id' | 'isActive' | 'createdBy' | 'createdAt' | 'updatedAt'>,
): Promise<RuleOverrideRecord | null> {
  const res = await fetch(`${BASE}/admin/overrides/rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ?? null;
}

export async function updateRuleOverride(
  id: string,
  data: Partial<RuleOverrideRecord>,
): Promise<boolean> {
  const res = await fetch(`${BASE}/admin/overrides/rules/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.ok;
}

export async function deleteRuleOverride(id: string): Promise<boolean> {
  const res = await fetch(`${BASE}/admin/overrides/rules/${id}`, { method: 'DELETE' });
  return res.ok;
}

// ── Rule Override History & Restore ──────────────────────────

export async function getRuleOverrideHistory(
  familyId: string,
  attributeId: string,
): Promise<{ baseRule: MatchingRule | null; history: RuleOverrideHistoryEntry[] }> {
  const qs = `?family_id=${encodeURIComponent(familyId)}&attribute_id=${encodeURIComponent(attributeId)}`;
  const res = await fetch(`${BASE}/admin/overrides/rules/history${qs}`);
  if (!res.ok) return { baseRule: null, history: [] };
  const json = await res.json();
  return json.data ?? { baseRule: null, history: [] };
}

export async function restoreRuleOverride(
  overrideId: string,
  changeReason: string,
): Promise<boolean> {
  const res = await fetch(`${BASE}/admin/overrides/rules/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ overrideId, changeReason }),
  });
  return res.ok;
}

// ── Rule Annotations ─────────────────────────────────────────

export async function getRuleAnnotations(
  familyId: string,
  attributeId?: string,
): Promise<RuleAnnotation[]> {
  let qs = `?family_id=${encodeURIComponent(familyId)}`;
  if (attributeId) qs += `&attribute_id=${encodeURIComponent(attributeId)}`;
  const res = await fetch(`${BASE}/admin/overrides/rules/annotations${qs}`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.data ?? [];
}

export async function createRuleAnnotation(
  familyId: string,
  attributeId: string,
  body: string,
): Promise<RuleAnnotation | null> {
  const res = await fetch(`${BASE}/admin/overrides/rules/annotations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ familyId, attributeId, body }),
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ?? null;
}

export async function updateRuleAnnotation(
  annotationId: string,
  updates: { body?: string; isResolved?: boolean },
): Promise<boolean> {
  const res = await fetch(`${BASE}/admin/overrides/rules/annotations/${annotationId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  return res.ok;
}

export async function deleteRuleAnnotation(annotationId: string): Promise<boolean> {
  const res = await fetch(`${BASE}/admin/overrides/rules/annotations/${annotationId}`, {
    method: 'DELETE',
  });
  return res.ok;
}

export async function getContextOverrides(familyId?: string): Promise<ContextOverrideRecord[]> {
  const qs = familyId ? `?family_id=${familyId}` : '';
  const res = await fetch(`${BASE}/admin/overrides/context${qs}`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.data ?? [];
}

export async function createContextOverride(
  data: Omit<ContextOverrideRecord, 'id' | 'isActive' | 'createdBy' | 'createdAt' | 'updatedAt'>,
): Promise<ContextOverrideRecord | null> {
  const res = await fetch(`${BASE}/admin/overrides/context`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ?? null;
}

export async function updateContextOverride(
  id: string,
  data: Partial<ContextOverrideRecord>,
): Promise<boolean> {
  const res = await fetch(`${BASE}/admin/overrides/context/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.ok;
}

export async function deleteContextOverride(id: string): Promise<boolean> {
  const res = await fetch(`${BASE}/admin/overrides/context/${id}`, { method: 'DELETE' });
  return res.ok;
}

// ── Atlas Dictionary Overrides API ────────────────────────

export async function getAtlasDictOverrides(familyId?: string): Promise<AtlasDictOverrideRecord[]> {
  const url = familyId
    ? `${BASE}/admin/atlas/dictionaries?familyId=${familyId}`
    : `${BASE}/admin/atlas/dictionaries`;
  const result = await fetchApi<{ overrides: AtlasDictOverrideRecord[] }>(url);
  return result.overrides;
}

export async function createAtlasDictOverride(
  data: Record<string, unknown>,
): Promise<AtlasDictOverrideRecord | null> {
  try {
    return await fetchApi<AtlasDictOverrideRecord>(`${BASE}/admin/atlas/dictionaries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch {
    return null;
  }
}

export async function updateAtlasDictOverride(
  id: string,
  data: Record<string, unknown>,
): Promise<boolean> {
  const res = await fetch(`${BASE}/admin/atlas/dictionaries/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.ok;
}

export async function deleteAtlasDictOverride(id: string): Promise<boolean> {
  const res = await fetch(`${BASE}/admin/atlas/dictionaries/${id}`, { method: 'DELETE' });
  return res.ok;
}

// ── Atlas Explorer API ─────────────────────────────────────

export interface AtlasExplorerResult {
  id: string;
  mpn: string;
  manufacturer: string;
  description: string | null;
  category: string;
  subcategory: string;
  familyId: string | null;
  familyName: string | null;
  status: string;
  parameterCount: number;
  coveragePct: number | null;
  schemaMatchCount: number;
  schemaTotalCount: number;
}

export interface AtlasExplorerDetail {
  product: {
    id: string;
    mpn: string;
    manufacturer: string;
    description: string | null;
    category: string;
    subcategory: string;
    familyId: string | null;
    familyName: string | null;
    status: string;
    datasheetUrl: string | null;
    package: string | null;
  };
  schemaComparison: {
    familyId: string;
    familyName: string;
    totalRules: number;
    matched: number;
    coverage: number;
    rules: {
      attributeId: string;
      attributeName: string;
      weight: number;
      logicType: string;
      blockOnMissing: boolean;
      sortOrder: number;
      atlasValue: string | null;
      atlasNumericValue: number | null;
      atlasUnit: string | null;
    }[];
  } | null;
  l2SchemaComparison: {
    category: string;
    totalFields: number;
    matched: number;
    coverage: number;
    fields: {
      attributeId: string;
      attributeName: string;
      sortOrder: number;
      atlasValue: string | null;
      atlasUnit: string | null;
    }[];
  } | null;
  atlasAttributes: { attributeId: string; value: string; numericValue: number | null; unit: string | null }[];
  extraAttributes: { attributeId: string; value: string; numericValue: number | null; unit: string | null }[];
  rawParameters: { name: string; value: string }[] | null;
}

export async function searchAtlasExplorer(query: string): Promise<{ results: AtlasExplorerResult[]; total: number; capped: boolean }> {
  const res = await fetch(`${BASE}/admin/atlas/explorer?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error('Atlas explorer search failed');
  return res.json();
}

export async function getAtlasExplorerDetail(id: string): Promise<AtlasExplorerDetail> {
  const res = await fetch(`${BASE}/admin/atlas/explorer/${id}`);
  if (!res.ok) throw new Error('Atlas explorer detail failed');
  return res.json();
}

export interface DictMappingSuggestion {
  translation: string | null;
  suggestedAttributeId: string | null;
  suggestedAttributeName: string | null;
  suggestedUnit: string | null;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string | null;
}

export async function suggestDictMapping(
  paramName: string,
  samples: string[],
  familyId: string,
): Promise<DictMappingSuggestion | null> {
  try {
    const res = await fetch(`${BASE}/admin/atlas/dictionaries/suggest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paramName, samples, familyId }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.success ? json.suggestion : null;
  } catch {
    return null;
  }
}

// ── Release Notes API ──────────────────────────────────────

export async function getReleaseNotes(): Promise<ReleaseNote[]> {
  return fetchApi<ReleaseNote[]>(`${BASE}/releases`);
}

export async function createReleaseNote(content: string): Promise<ReleaseNote> {
  return fetchApi<ReleaseNote>(`${BASE}/admin/releases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
}

export async function updateReleaseNote(id: string, content: string): Promise<void> {
  const res = await fetch(`${BASE}/admin/releases/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? 'Failed to update release note');
}

export async function deleteReleaseNote(id: string): Promise<void> {
  const res = await fetch(`${BASE}/admin/releases/${id}`, { method: 'DELETE' });
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? 'Failed to delete release note');
}

// ── User Preferences ────────────────────────────────────────

export async function getUserPreferences(): Promise<UserPreferences> {
  const res = await fetch(`${BASE}/profile/preferences`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? 'Failed to fetch preferences');
  return json.data;
}

export async function updateUserPreferences(prefs: Partial<UserPreferences>): Promise<UserPreferences> {
  const res = await fetch(`${BASE}/profile/preferences`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(prefs),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? 'Failed to update preferences');
  return json.data;
}

// ============================================================
// ADMIN: CACHE MANAGEMENT
// ============================================================

export interface CacheStats {
  totalRows: number;
  totalSizeBytes: number;
  byService: Record<string, {
    rows: number;
    sizeBytes: number;
    avgHitCount: number;
    oldestEntry: string | null;
    newestEntry: string | null;
  }>;
  byTier: Record<string, { rows: number; sizeBytes: number }>;
  expiredRows: number;
}

export async function getAdminCacheStats(): Promise<CacheStats> {
  const res = await fetch(`${BASE}/admin/cache`);
  return res.json();
}

export async function purgeAdminCache(opts?: {
  service?: string;
  mpn?: string;
  tier?: string;
  expiredOnly?: boolean;
}): Promise<{ deleted: number }> {
  const params = new URLSearchParams();
  if (opts?.service) params.set('service', opts.service);
  if (opts?.mpn) params.set('mpn', opts.mpn);
  if (opts?.tier) params.set('tier', opts.tier);
  if (opts?.expiredOnly) params.set('expired', 'true');
  const res = await fetch(`${BASE}/admin/cache?${params}`, { method: 'DELETE' });
  return res.json();
}
