/**
 * Provider registry — the SINGLE control point for which data sources are on and
 * in what priority. The orchestrator asks the registry; it never reads env or the
 * disable flag directly. Accessors evaluate `isConfigured()` at CALL TIME so the
 * Phase-6 kill-switch (and, later, a DB/admin-driven registry) is honored
 * dynamically without changing any caller.
 *
 * The registry supplies providers + a stable priority order. It does NOT own the
 * cross-source merge order — the two `seenMpns` merges (different source sets and
 * orders) stay hand-written in partDataService.
 */

import type {
  DataSourceProvider,
  CatalogProvider,
  EnrichmentProvider,
  CommercialProvider,
  ParametricCatalogProvider,
  ProviderId,
} from './types';
import { isParametricProvider } from './types';
import { digikeyProvider } from './digikeyProvider';
import { atlasProvider } from './atlasProvider';
import { partsioProvider } from './partsioProvider';
import { findchipsProvider } from './findchipsProvider';

/** Catalog priority order (Digikey first, then Atlas) — matches the search /
 *  recs fan-out order in partDataService. */
const CATALOG_ORDER: CatalogProvider[] = [digikeyProvider, atlasProvider];

const ALL: DataSourceProvider[] = [digikeyProvider, atlasProvider, partsioProvider, findchipsProvider];

/** Configured catalog providers in priority order. */
export function catalogProviders(): CatalogProvider[] {
  return CATALOG_ORDER.filter((p) => p.isConfigured());
}

/** The enrichment provider (parts.io), or null if not configured. */
export function enrichmentProvider(): EnrichmentProvider | null {
  return partsioProvider.isConfigured() ? partsioProvider : null;
}

/** The commercial provider (FindChips), or null if not configured. */
export function commercialProvider(): CommercialProvider | null {
  return findchipsProvider.isConfigured() ? findchipsProvider : null;
}

/** First configured catalog provider that supports attribute filtering (Digikey
 *  today), or null — callers must degrade cleanly when null (no facet source). */
export function parametricProvider(): ParametricCatalogProvider | null {
  for (const p of catalogProviders()) {
    if (isParametricProvider(p)) return p;
  }
  return null;
}

/** Lookup by id regardless of configured state (for health/admin surfaces). */
export function providerById(id: ProviderId): DataSourceProvider | null {
  return ALL.find((p) => p.id === id) ?? null;
}
