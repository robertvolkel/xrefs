/**
 * Background Validation Manager
 *
 * Module-level singleton that runs parts list validation outside of React
 * lifecycle. Validation continues even if the user navigates away from the
 * parts list page. The component subscribes for live UI updates when mounted
 * and unsubscribes on unmount without cancelling the stream.
 */

import { PartsListRow, BatchValidateItem } from './types';
import { validatePartsList } from './api';
import { updatePartsListSupabase, getSavedListsSupabase } from './supabasePartsListStorage';

export type ValidationSubscriber = (
  rows: PartsListRow[],
  progress: number,
  done: boolean,
  error: string | null,
) => void;

interface ActiveValidation {
  listId: string;
  rows: PartsListRow[];
  progress: number;
  done: boolean;
  error: string | null;
}

let active: ActiveValidation | null = null;

// Persistent subscriber set — survives across validation runs.
// Previously subscribers were stored on the `active` object, so if
// subscribe() was called before validation started (active === null),
// the callback was silently dropped and the UI never received updates.
const subscribers = new Set<ValidationSubscriber>();

/** Check if there's an active (in-progress) validation for the given list */
export function getActiveValidation(listId: string) {
  if (active && active.listId === listId && !active.done) {
    return { rows: active.rows, progress: active.progress };
  }
  return null;
}

/** Subscribe to validation progress. Returns unsubscribe function. */
export function subscribe(cb: ValidationSubscriber): () => void {
  subscribers.add(cb);
  // Immediately send current state so the UI catches up
  if (active) {
    cb([...active.rows], active.progress, active.done, active.error);
  }
  return () => {
    subscribers.delete(cb);
  };
}

function notify() {
  if (!active) return;
  for (const cb of subscribers) {
    cb([...active.rows], active.progress, active.done, active.error);
  }
}

/**
 * Start background validation. The list must already be saved to Supabase.
 * This function runs the streaming validation and periodically saves results.
 */
export async function startBackgroundValidation(
  listId: string,
  initialRows: PartsListRow[],
  currency?: string,
): Promise<void> {
  active = {
    listId,
    rows: [...initialRows],
    progress: 0,
    done: false,
    error: null,
  };

  const items = initialRows.map((r) => ({
    rowIndex: r.rowIndex,
    mpn: r.rawMpn,
    manufacturer: r.rawManufacturer || undefined,
    description: r.rawDescription || undefined,
  }));

  try {
    const stream = await validatePartsList(items, currency);
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let processed = 0;
    const total = items.length;
    let lastSaveAt = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const item: BatchValidateItem = JSON.parse(line);
          processed++;

          const idx = active.rows.findIndex((r) => r.rowIndex === item.rowIndex);
          if (idx >= 0) {
            active.rows[idx] = {
              ...active.rows[idx],
              status: item.status,
              resolvedPart: item.resolvedPart,
              sourceAttributes: item.sourceAttributes,
              suggestedReplacement: item.suggestedReplacement,
              allRecommendations: item.allRecommendations,
              enrichedData: item.enrichedData,
              errorMessage: item.errorMessage,
            };
          }

          active.progress = processed / total;
          notify();

          // Save to Supabase every 5 items
          if (processed - lastSaveAt >= 5) {
            lastSaveAt = processed;
            updatePartsListSupabase(listId, active.rows).catch(() => {});
          }
        } catch {
          // Skip malformed NDJSON lines
        }
      }
    }

    // Final save
    active.done = true;
    active.progress = 1;
    notify();
    await updatePartsListSupabase(listId, active.rows).catch(() => {});
  } catch (error) {
    if (active && active.listId === listId) {
      active.done = true;
      active.error = error instanceof Error ? error.message : 'Validation failed';
      notify();
      // Save partial results
      updatePartsListSupabase(listId, active.rows).catch(() => {});
    }
  }
}

/** Clear the active validation state (e.g., on reset) */
export function clearValidation() {
  active = null;
}
