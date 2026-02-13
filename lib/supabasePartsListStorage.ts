/**
 * Parts List Supabase Persistence
 *
 * Async replacement for partsListStorage.ts (localStorage).
 * Uses the browser Supabase client — call only from client components.
 */

import { PartsListRow } from './types';
import { createClient } from './supabase/client';
import { StoredRow, PartsListSummary } from './partsListStorage';

/** Strip heavy fields from rows for storage */
function toStoredRows(rows: PartsListRow[]): StoredRow[] {
  return rows.map(r => ({
    rowIndex: r.rowIndex,
    rawMpn: r.rawMpn,
    rawManufacturer: r.rawManufacturer,
    rawDescription: r.rawDescription,
    status: r.status,
    resolvedPart: r.resolvedPart,
    suggestedReplacement: r.suggestedReplacement,
    errorMessage: r.errorMessage,
  }));
}

/** Convert stored rows back to PartsListRow (without heavy fields) */
function fromStoredRows(stored: StoredRow[]): PartsListRow[] {
  return stored.map(r => ({
    ...r,
    sourceAttributes: undefined,
    allRecommendations: undefined,
  }));
}

/** Get summaries of all saved lists for the current user (newest first) */
export async function getSavedListsSupabase(): Promise<PartsListSummary[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('parts_lists')
    .select('id, name, created_at, updated_at, total_rows, resolved_count')
    .order('updated_at', { ascending: false });

  if (error || !data) return [];

  return data.map(row => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    totalRows: row.total_rows,
    resolvedCount: row.resolved_count,
  }));
}

/** Save a new parts list. Returns the generated ID. */
export async function savePartsListSupabase(name: string, rows: PartsListRow[]): Promise<string | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('parts_lists')
    .insert({
      user_id: user.id,
      name,
      total_rows: rows.length,
      resolved_count: rows.filter(r => r.status === 'resolved').length,
      rows: toStoredRows(rows),
    })
    .select('id')
    .single();

  if (error || !data) return null;
  return data.id;
}

/** Update an existing parts list */
export async function updatePartsListSupabase(id: string, rows: PartsListRow[]): Promise<void> {
  const supabase = createClient();
  await supabase
    .from('parts_lists')
    .update({
      total_rows: rows.length,
      resolved_count: rows.filter(r => r.status === 'resolved').length,
      rows: toStoredRows(rows),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
}

/** Load a saved parts list by ID */
export async function loadPartsListSupabase(id: string): Promise<{ name: string; rows: PartsListRow[] } | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('parts_lists')
    .select('name, rows')
    .eq('id', id)
    .single();

  if (error || !data) return null;

  return {
    name: data.name,
    rows: fromStoredRows(data.rows as StoredRow[]),
  };
}

/** Delete a saved parts list */
export async function deletePartsListSupabase(id: string): Promise<void> {
  const supabase = createClient();
  await supabase
    .from('parts_lists')
    .delete()
    .eq('id', id);
}
