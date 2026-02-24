import { SearchResult, PartAttributes, XrefRecommendation, ApiResponse, OrchestratorMessage, OrchestratorResponse, ApplicationContext, QcFeedbackSubmission, PlatformSettings, RecommendationLogEntry, QcFeedbackRecord, QcFeedbackUpdate, QcFeedbackListItem, FeedbackStatusCounts, FeedbackStatus, FeedbackStage } from './types';

// Admin types
export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  role: 'user' | 'admin';
  disabled: boolean;
  created_at: string;
  search_count: number;
  last_active: string | null;
}

const BASE = '/api';

async function fetchApi<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  const json: ApiResponse<T> = await res.json();
  if (!json.success || !json.data) {
    throw new Error(json.error ?? 'Unknown API error');
  }
  return json.data;
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
): Promise<XrefRecommendation[]> {
  return fetchApi<XrefRecommendation[]>(`${BASE}/xref/${encodeURIComponent(mpn)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ overrides, applicationContext }),
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

/** Validate a batch of parts. Returns a ReadableStream for streaming NDJSON. */
export async function validatePartsList(
  items: Array<{ rowIndex: number; mpn: string; manufacturer?: string; description?: string }>,
  currency?: string,
): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(`${BASE}/parts-list/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items, currency }),
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
