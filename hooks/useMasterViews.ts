'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { MasterView } from '@/lib/viewConfigStorage';
import {
  VIEW_STORAGE_KEY,
  SEED_MASTER_VIEWS,
  isLegacyBuiltinView,
  sanitizeTemplateColumns,
  sanitizeTemplateCalcFields,
} from '@/lib/viewConfigStorage';
import type { CalculatedFieldDef } from '@/lib/calculatedFields';
import {
  fetchMasterViews,
  createMasterViewSupabase,
  updateMasterViewSupabase,
  deleteMasterViewSupabase,
  setDefaultMasterViewSupabase,
} from '@/lib/supabaseMasterViewStorage';

const MIGRATION_FLAG = 'xrefs_views_migrated';

/**
 * Master views hook — manages shared views stored in Supabase view_templates table.
 * Replaces the old useViewTemplates/useViewConfig hook.
 *
 * On first load, migrates localStorage templates to Supabase (one-time).
 */
export function useMasterViews() {
  const [masterViews, setMasterViews] = useState<MasterView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const initializedRef = useRef(false);

  // ----------------------------------------------------------
  // Fetch + one-time localStorage migration
  // ----------------------------------------------------------

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    (async () => {
      try {
        // Check if migration needed
        const migrated = typeof window !== 'undefined' && localStorage.getItem(MIGRATION_FLAG);
        const hasLocalStorage = typeof window !== 'undefined' && localStorage.getItem(VIEW_STORAGE_KEY);

        if (!migrated && hasLocalStorage) {
          await migrateLocalStorageToSupabase();
        }

        // Fetch from Supabase
        let views = await fetchMasterViews();

        // If no master views exist (fresh user, or migration produced none), seed defaults
        if (views.length === 0) {
          const created: MasterView[] = [];
          for (const seed of SEED_MASTER_VIEWS) {
            const v = await createMasterViewSupabase({
              name: seed.name,
              columns: sanitizeTemplateColumns(seed.columns),
              description: seed.description,
              isDefault: seed.isDefault,
            });
            if (v) created.push(v);
          }
          views = created;
        }

        setMasterViews(views);
      } catch (err) {
        console.error('[useMasterViews] init error:', err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // ----------------------------------------------------------
  // localStorage → Supabase migration (one-time)
  // ----------------------------------------------------------

  async function migrateLocalStorageToSupabase() {
    try {
      const raw = localStorage.getItem(VIEW_STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw);
      const views = parsed.views ?? [];
      const oldDefaultId = parsed.defaultViewId;

      // Extract non-builtin views as master views
      for (const view of views) {
        if (isLegacyBuiltinView(view.id)) continue;

        const safeColumns = sanitizeTemplateColumns(view.columns ?? []);
        const safeCalcFields = sanitizeTemplateCalcFields(view.calculatedFields);

        await createMasterViewSupabase({
          name: view.name,
          columns: safeColumns,
          description: view.description,
          calculatedFields: safeCalcFields,
          isDefault: view.id === oldDefaultId,
        });
      }

      // If the old default was 'default' (Basic) or no custom default was set,
      // the seeded "Basic" master view will get isDefault in the main flow

      // Clean up localStorage
      localStorage.removeItem(VIEW_STORAGE_KEY);
      localStorage.setItem(MIGRATION_FLAG, '1');
    } catch (err) {
      console.error('[useMasterViews] migration error:', err);
      // Don't block — set flag to avoid retrying
      localStorage.setItem(MIGRATION_FLAG, '1');
    }
  }

  // ----------------------------------------------------------
  // CRUD operations
  // ----------------------------------------------------------

  const createMasterView = useCallback(async (view: {
    name: string;
    columns: string[];
    description?: string;
    columnMeta?: Record<string, string>;
    calculatedFields?: CalculatedFieldDef[];
    isDefault?: boolean;
  }): Promise<MasterView | null> => {
    const created = await createMasterViewSupabase(view);
    if (created) {
      setMasterViews(prev => {
        // If new view is default, unset previous default
        if (created.isDefault) {
          return [...prev.map(v => ({ ...v, isDefault: false })), created];
        }
        return [...prev, created];
      });
    }
    return created;
  }, []);

  const updateMasterView = useCallback(async (
    id: string,
    updates: {
      name?: string;
      columns?: string[];
      description?: string;
      columnMeta?: Record<string, string>;
      calculatedFields?: CalculatedFieldDef[];
    },
  ): Promise<void> => {
    await updateMasterViewSupabase(id, updates);
    setMasterViews(prev => prev.map(v =>
      v.id === id ? { ...v, ...updates } : v,
    ));
  }, []);

  const deleteMasterView = useCallback(async (id: string): Promise<void> => {
    await deleteMasterViewSupabase(id);
    setMasterViews(prev => prev.filter(v => v.id !== id));
  }, []);

  const setDefaultMasterView = useCallback(async (id: string): Promise<void> => {
    await setDefaultMasterViewSupabase(id);
    setMasterViews(prev => prev.map(v => ({
      ...v,
      isDefault: v.id === id,
    })));
  }, []);

  // ----------------------------------------------------------
  // Derived values
  // ----------------------------------------------------------

  const defaultMasterViewId = masterViews.find(v => v.isDefault)?.id ?? masterViews[0]?.id ?? null;

  return {
    masterViews,
    defaultMasterViewId,
    isLoading,
    createMasterView,
    updateMasterView,
    deleteMasterView,
    setDefaultMasterView,
  };
}
