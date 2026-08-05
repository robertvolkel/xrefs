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

    // NOTE: deliberately no cleanup that cancels this work. `initializedRef`
    // makes the effect single-run, and StrictMode's dev double-invoke would
    // otherwise fire a cleanup between the two runs while the ref blocks the
    // second — cancelling the only load attempt and leaving the dropdown empty
    // in dev. A setState after unmount is a no-op in React 18+, so there is
    // nothing to guard against.

    /**
     * One attempt at "load the account's master views, seeding starters only if
     * the account is CONFIRMED empty". Returns the decision so the caller can
     * retry an aborted attempt instead of inventing data.
     */
    async function attempt(): Promise<SeedDecision> {
      // Migration writes rows, so it needs a known user. Bailing WITHOUT
      // setting the one-time flag means it is retried, not lost.
      const migrated = typeof window !== 'undefined' && localStorage.getItem(MIGRATION_FLAG);
      const hasLocalStorage = typeof window !== 'undefined' && localStorage.getItem(VIEW_STORAGE_KEY);
      let userId: string | null = null;
      if (!migrated && hasLocalStorage) {
        userId = await getCurrentUserId();
        if (userId) await migrateLocalStorageToSupabase(userId);
      }

      const read = await fetchMasterViews();

      // Resolve the user ONLY when it can change the outcome — i.e. when the
      // account looks empty and we are about to write. On the overwhelmingly
      // common path (views exist) this saves an auth round-trip per page load.
      // Safe because decideSeedAction lets a successful non-empty read win
      // regardless of userId.
      if (read.ok && read.views.length === 0 && userId === null) {
        userId = await getCurrentUserId();
      }

      const decision = decideSeedAction({ userId, read });

      // `read.ok` is required for type narrowing, not defensiveness:
      // read.views only exists on the ok branch.
      if (decision.action === 'use-existing' && read.ok) {
        setMasterViews(read.views);
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
          }, userId);
          if (v) created.push(v);
        }

        // Nothing was written — the account is still empty, so retrying is safe
        // and cannot duplicate. Without this, a failed seed is reported as
        // success and the account is left with no views until a reload.
        if (created.length === 0) {
          return { action: 'abort', reason: 'read-failed' };
        }
        if (created.length < SEED_MASTER_VIEWS.length) {
          // Partial. Do NOT auto-create the missing one on later loads: an
          // account with some starter views is indistinguishable from one where
          // the user deleted the rest on purpose, and resurrecting a deliberately
          // deleted view is worse than a missing one they can recreate.
          console.warn(
            `[useMasterViews] seeded ${created.length}/${SEED_MASTER_VIEWS.length} starter views`,
          );
        }
        setMasterViews(created);
        return decision;
      }

      return decision;
    }

    (async () => {
      try {
        for (let i = 0; i < SEED_MAX_ATTEMPTS; i++) {
          if (i > 0) {
            await new Promise(r => setTimeout(r, SEED_RETRY_DELAYS_MS[i - 1]));
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
        setIsLoading(false);
      }
    })();
  }, []);

  // ----------------------------------------------------------
  // localStorage → Supabase migration (one-time)
  // ----------------------------------------------------------

  async function migrateLocalStorageToSupabase(userId: string) {
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
        }, userId);
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
