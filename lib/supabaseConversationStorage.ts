/**
 * Conversation Supabase Persistence
 *
 * Async CRUD for chat conversation history.
 * Uses the browser Supabase client — call only from client components.
 */

import { createClient } from './supabase/client';
import {
  AppPhase,
  ChatMessage,
  OrchestratorMessage,
  PartSummary,
  PartAttributes,
  ApplicationContext,
  XrefRecommendation,
  ConversationSummary,
  ConversationSnapshot,
} from './types';

// ---- List (summaries only, newest first) ----

export async function getConversations(): Promise<ConversationSummary[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('conversations')
    .select('id, title, source_mpn, phase, created_at, updated_at')
    .order('updated_at', { ascending: false });

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    title: row.title,
    sourceMpn: row.source_mpn,
    phase: row.phase as AppPhase,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

// ---- Create (returns new conversation ID) ----

export async function createConversation(
  title: string,
  sourceMpn: string | null,
  messages: ChatMessage[],
  orchestratorMessages: OrchestratorMessage[],
  phase: AppPhase,
): Promise<string | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('conversations')
    .insert({
      user_id: user.id,
      title,
      source_mpn: sourceMpn,
      phase,
      messages,
      orchestrator_messages: orchestratorMessages,
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('Failed to create conversation:', error?.message);
    return null;
  }
  return data.id;
}

// ---- Update (partial — only the fields that changed) ----

export async function updateConversation(
  id: string,
  updates: {
    phase?: AppPhase;
    messages?: ChatMessage[];
    orchestratorMessages?: OrchestratorMessage[];
    sourcePart?: PartSummary | null;
    sourceAttributes?: PartAttributes | null;
    applicationContext?: ApplicationContext | null;
    recommendations?: XrefRecommendation[];
    selectedRecommendation?: XrefRecommendation | null;
    comparisonAttributes?: PartAttributes | null;
    sourceMpn?: string | null;
  },
): Promise<void> {
  const supabase = createClient();

  // Map camelCase to snake_case, only including provided fields
  const dbUpdates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.phase !== undefined) dbUpdates.phase = updates.phase;
  if (updates.messages !== undefined) dbUpdates.messages = updates.messages;
  if (updates.orchestratorMessages !== undefined) dbUpdates.orchestrator_messages = updates.orchestratorMessages;
  if (updates.sourcePart !== undefined) dbUpdates.source_part = updates.sourcePart;
  if (updates.sourceAttributes !== undefined) dbUpdates.source_attributes = updates.sourceAttributes;
  if (updates.applicationContext !== undefined) dbUpdates.application_context = updates.applicationContext;
  if (updates.recommendations !== undefined) dbUpdates.recommendations = updates.recommendations;
  if (updates.selectedRecommendation !== undefined) dbUpdates.selected_recommendation = updates.selectedRecommendation;
  if (updates.comparisonAttributes !== undefined) dbUpdates.comparison_attributes = updates.comparisonAttributes;
  if (updates.sourceMpn !== undefined) dbUpdates.source_mpn = updates.sourceMpn;

  await supabase
    .from('conversations')
    .update(dbUpdates)
    .eq('id', id);
}

// ---- Load (full snapshot for hydration) ----

export async function loadConversation(id: string): Promise<ConversationSnapshot | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) return null;

  // Revive ChatMessage timestamp strings → Date objects
  const messages = ((data.messages as ChatMessage[]) ?? []).map((m) => ({
    ...m,
    timestamp: new Date(m.timestamp),
  }));

  return {
    id: data.id,
    title: data.title,
    sourceMpn: data.source_mpn,
    phase: data.phase as AppPhase,
    messages,
    orchestratorMessages: (data.orchestrator_messages as OrchestratorMessage[]) ?? [],
    sourcePart: data.source_part as PartSummary | null,
    sourceAttributes: data.source_attributes as PartAttributes | null,
    applicationContext: data.application_context as ApplicationContext | null,
    recommendations: (data.recommendations as XrefRecommendation[]) ?? [],
    selectedRecommendation: data.selected_recommendation as XrefRecommendation | null,
    comparisonAttributes: data.comparison_attributes as PartAttributes | null,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

// ---- Delete ----

export async function deleteConversation(id: string): Promise<void> {
  const supabase = createClient();
  await supabase
    .from('conversations')
    .delete()
    .eq('id', id);
}
