/**
 * Master View Storage — Supabase CRUD for view_templates table.
 * Master views are shared across all lists for a user.
 * Decision #130.
 */

import { createClient } from './supabase/client';
import type { MasterView } from './viewConfigStorage';
import type { CalculatedFieldDef } from './calculatedFields';

// ============================================================
// DB ROW → MasterView MAPPING
// ============================================================

interface ViewTemplateRow {
  id: string;
  name: string;
  columns: string[];
  description: string;
  column_meta: Record<string, string> | null;
  calculated_fields: CalculatedFieldDef[] | null;
  is_default: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

function fromRow(row: ViewTemplateRow): MasterView {
  return {
    id: row.id,
    name: row.name,
    columns: row.columns,
    description: row.description || undefined,
    columnMeta: row.column_meta ?? undefined,
    calculatedFields: row.calculated_fields ?? undefined,
    isDefault: row.is_default,
    sortOrder: row.sort_order,
  };
}

// ============================================================
// CRUD
// ============================================================

/** Fetch all master views for the current user */
export async function fetchMasterViews(): Promise<MasterView[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('view_templates')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[masterViews] fetch error:', error);
    return [];
  }
  return (data as ViewTemplateRow[]).map(fromRow);
}

/** Create a new master view */
export async function createMasterViewSupabase(view: {
  name: string;
  columns: string[];
  description?: string;
  columnMeta?: Record<string, string>;
  calculatedFields?: CalculatedFieldDef[];
  isDefault?: boolean;
}): Promise<MasterView | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // If setting as default, unset existing default first
  if (view.isDefault) {
    await supabase
      .from('view_templates')
      .update({ is_default: false })
      .eq('user_id', user.id)
      .eq('is_default', true);
  }

  const { data, error } = await supabase
    .from('view_templates')
    .insert({
      user_id: user.id,
      name: view.name,
      columns: view.columns,
      description: view.description ?? '',
      column_meta: view.columnMeta ?? null,
      calculated_fields: view.calculatedFields ?? null,
      is_default: view.isDefault ?? false,
    })
    .select()
    .single();

  if (error) {
    console.error('[masterViews] create error:', error);
    return null;
  }
  return fromRow(data as ViewTemplateRow);
}

/** Update an existing master view */
export async function updateMasterViewSupabase(
  id: string,
  updates: {
    name?: string;
    columns?: string[];
    description?: string;
    columnMeta?: Record<string, string>;
    calculatedFields?: CalculatedFieldDef[];
  },
): Promise<void> {
  const supabase = createClient();
  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (updates.name !== undefined) updatePayload.name = updates.name;
  if (updates.columns !== undefined) updatePayload.columns = updates.columns;
  if (updates.description !== undefined) updatePayload.description = updates.description;
  if (updates.columnMeta !== undefined) updatePayload.column_meta = updates.columnMeta;
  if (updates.calculatedFields !== undefined) updatePayload.calculated_fields = updates.calculatedFields;

  const { error } = await supabase
    .from('view_templates')
    .update(updatePayload)
    .eq('id', id);

  if (error) console.error('[masterViews] update error:', error);
}

/** Delete a master view */
export async function deleteMasterViewSupabase(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('view_templates')
    .delete()
    .eq('id', id);

  if (error) console.error('[masterViews] delete error:', error);
}

/** Set a master view as the default (unsets any previous default) */
export async function setDefaultMasterViewSupabase(id: string): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  // Unset existing default
  await supabase
    .from('view_templates')
    .update({ is_default: false })
    .eq('user_id', user.id)
    .eq('is_default', true);

  // Set new default
  const { error } = await supabase
    .from('view_templates')
    .update({ is_default: true, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) console.error('[masterViews] setDefault error:', error);
}
