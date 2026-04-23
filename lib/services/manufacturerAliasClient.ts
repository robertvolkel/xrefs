/**
 * Client-safe wrapper over POST /api/manufacturer-aliases/canonicalize.
 *
 * The server-side resolver (manufacturerAliasResolver.ts) can't be called from
 * client components because it needs cookies() access. This thin client batches
 * raw manufacturer names into a single POST round trip.
 */
import type { PartsListRow } from '@/lib/types';

export interface CanonicalizeResult {
  input: string;
  canonical: string | null;
  slug: string | null;
}

/** POSTs unique non-empty names and returns a Map keyed by the original (case-preserved) input. */
export async function canonicalizeManufacturerNames(names: string[]): Promise<Map<string, CanonicalizeResult>> {
  const unique = Array.from(new Set(names.filter(n => typeof n === 'string' && n.trim() !== '')));
  if (unique.length === 0) return new Map();

  try {
    const res = await fetch('/api/manufacturer-aliases/canonicalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ names: unique }),
    });
    if (!res.ok) {
      console.warn('canonicalize endpoint returned', res.status);
      return new Map();
    }
    const payload = (await res.json()) as { results?: CanonicalizeResult[] };
    const map = new Map<string, CanonicalizeResult>();
    for (const r of payload.results ?? []) {
      map.set(r.input, r);
    }
    return map;
  } catch (err) {
    console.warn('canonicalize fetch failed:', err);
    return new Map();
  }
}

/** Rewrites `rawManufacturer` on each row to the canonical Atlas name when resolvable. */
export async function canonicalizeRowManufacturers(rows: PartsListRow[]): Promise<PartsListRow[]> {
  const names = rows.map(r => r.rawManufacturer ?? '');
  const lookup = await canonicalizeManufacturerNames(names);
  if (lookup.size === 0) return rows;

  let mutated = false;
  const next = rows.map(r => {
    const raw = r.rawManufacturer ?? '';
    const hit = lookup.get(raw);
    if (hit?.canonical && hit.canonical !== raw) {
      mutated = true;
      return { ...r, rawManufacturer: hit.canonical };
    }
    return r;
  });
  return mutated ? next : rows;
}
