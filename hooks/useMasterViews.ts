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
  getCurrentUserId,
  createMasterViewSupabase,
  updateMasterViewSupabase,
  deleteMasterViewSupabase,
  setDefaultMasterViewSupabase,
} from '@/lib/supabaseMasterViewStorage';
import type { SeedDecision } from '@/lib/services/masterViewSeeding';
import {
  decideSeedAction,
  shouldRetry,
  SEED_RETRY_DELAYS_MS,
  SEED_MAX_ATTEMPTS,
} from '@/lib/services/masterViewSeeding';

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

    let cancelled = false;

    /**
     * One attempt at "load the account's master views, seeding starters only if
     * the account is CONFIRMED empty". Returns the decision so the caller can
     * retry an aborted attempt instead of inventing data.
     */
    async function attempt(): Promise<SeedDecision> {
      // Resolve the signed-in user first — every branch below needs to know
      // whether there is one, and a write attributed to nobody is worse than
      // no write at all.
      const userId = await getCurrentUserId();

      // Migration writes rows too, so it is gated on a known user as well.
      // Bailing WITHOUT setting the flag means it is retried, not lost.
      if (userId) {
        const migrated = typeof window !== 'undefined' && localStorage.getItem(MIGRATION_FLAG);
        const hasLocalStorage = typeof window !== 'undefined' && localStorage.getItem(VIEW_STORAGE_KEY);
        if (!migrated && hasLocalStorage) {
          await migrateLocalStorageToSupabase();
        }
      }

      const read = await fetchMasterViews();
      const decision = decideSeedAction({ userId, read });

      if (decision.action === 'use-existing' && read.ok) {
        if (!cancelled) setMasterViews(read.views);
        return decision;
      }

      if (decision.action === 'seed') {
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
        if (!cancelled) setMasterViews(created);
        return decision;
      }

      return decision;
    }

    (async () => {
      try {
        for (let i = 0; i < SEED_MAX_ATTEMPTS; i++) {
          if (cancelled) return;
          if (i > 0) {
            await new Promise(r => setTimeout(r, SEED_RETRY_DELAYS_MS[i - 1]));
            if (cancelled) return;
          }

          const decision = await attempt();
          if (!shouldRetry(decision)) return;

          console.warn(
            `[useMasterViews] load aborted (${decision.reason}), attempt ${i + 1}/${SEED_MAX_ATTEMPTS}`,
          );
        }
        // Every attempt failed. Leave the list empty rather than create a second
        // set of starter views: the dropdown degrades to "Original" and a reload
        // recovers, which is repairable. Duplicate views are not.
        console.error('[useMasterViews] could not load master views; not seeding');
      } catch (err) {
        console.error('[useMasterViews] init error:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
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
