/**
 * Data-source provider abstraction — the seam that insulates the matching engine
 * from any single data source (so Digikey can be swapped out).
 *
 * A provider is **DATA-ACCESS ONLY**. It fetches and maps a source's data into
 * our internal types. It NEVER:
 *   - scores, filters, sorts, or ranks (that is the orchestrator / matching engine);
 *   - arbitrates across providers (the fallback ladder lives in partDataService);
 *   - resolves `mfrOrigin` (manufacturer Chinese/Western identity — orchestrator-only,
 *     via resolveManufacturerAlias). Providers set `dataSource` (provenance) ONLY.
 *
 * Clients are NON-UNIFORM: Digikey has parametric facets + filter search that no
 * other source has. So abilities are ADVERTISED via `capabilities` booleans the
 * orchestrator branches on — never assumed. A source implements only the
 * capability interfaces it actually supports.
 *
 * See docs/plan (rosy-petting-tower) for the phased adoption. This file replaces
 * the dead `PartDataProvider` interface that used to live in lib/types.ts (it was
 * at the wrong altitude — it bundled getRecommendations/scoring).
 */

import type {
  PartAttributes,
  SearchResult,
  ServiceStatusInfo,
} from '../../types';

// ============================================================
// IDENTITY / KIND / CAPABILITIES
// ============================================================

/** Provider id. Doubles as the PROVENANCE tag written to `dataSource`.
 *  NOT the same as `mfrOrigin` (a Chinese maker's part can arrive via Digikey).
 *
 *  Mouser is DELIBERATELY absent: it is not a data-source provider. Its only live
 *  use is the pure string helper `resolveMouserSuggestedMpn`, which stays in the
 *  orchestrator (see findchipsProvider header + the plan). Advertising `'mouser'`
 *  here would let `providerById('mouser')` type-check yet silently return null,
 *  and imply a status row on future health/admin surfaces that has no backing
 *  object — so the union lists only the four real providers. */
export type ProviderId = 'digikey' | 'atlas' | 'partsio' | 'findchips';

export type ProviderKind = 'catalog' | 'enrichment' | 'commercial';

/** Every ability is a hard boolean. A Digikey replacement that lacks facets sets
 *  `facets:false` and the parametric-widening seam degrades cleanly. A flag being
 *  `true` means the matching capability method IS implemented on that provider. */
export interface ProviderCapabilities {
  /** getByMpn returns parametric attributes for a specific part number. */
  mpnLookup: boolean;
  /** searchByKeyword returns a pool from free text. */
  keywordSearch: boolean;
  /** fetchCandidates returns a cross-reference candidate pool for a family. */
  candidateFetch: boolean;
  /** discoverFacets — value distributions per category (Digikey-only today). */
  facets: boolean;
  /** filterByValues — parametric filter search by value (Digikey-only today). */
  parametricFilter: boolean;
  /** getEquivalents — curated FFF/functional cross-refs (parts.io-only today). */
  equivalents: boolean;
  /** getCommercial — supplier price/stock quotes (FindChips today). */
  quotes: boolean;
  /** carries compliance data (parts.io + FindChips). */
  compliance: boolean;
  /** getDistributorCount — cached distributor count (FindChips today). */
  distributorCounts: boolean;
}

/** Base contract every provider satisfies. */
export interface DataSourceProvider {
  readonly id: ProviderId;
  readonly kind: ProviderKind;
  readonly capabilities: ProviderCapabilities;
  /** Whether this source is usable right now (env keys present AND not disabled).
   *  This is the single gate the orchestrator's existing Digikey guards already
   *  call for Digikey; the disable flag lives behind it (see providerRegistry). */
  isConfigured(): boolean;
  /** Optional health probe (only Digikey + parts.io expose one today). */
  checkHealth?(): Promise<ServiceStatusInfo>;
}

// ============================================================
// SHARED OPTION / REQUEST SHAPES
// ============================================================

export interface LookupOpts {
  currency?: string;
  userId?: string;
  /** Manufacturer hint — used by Atlas to disambiguate a prefix-collision. */
  manufacturer?: string;
}

export interface KeywordSearchOpts extends LookupOpts {
  limit?: number;
  /** Neutral category-scoping handle. Digikey uses it to scope the keyword
   *  search; Atlas ignores it. */
  category?: CategoryRef;
  /** Build scorable candidate attrs alongside the summary (only the logic-vetted
   *  search path needs them). Mirrors atlasClient.searchAtlasProducts(buildAttrs). */
  buildAttrs?: boolean;
}

export interface CatalogSearchResult {
  result: SearchResult;
  /** lower-cased MPN → scorable PartAttributes, built from data already in the
   *  payload (no extra API call). Undefined when buildAttrs is false. */
  attrsByMpn?: Map<string, PartAttributes>;
}

/** Single-attribute numeric band for widening the candidate pool, in base SI.
 *  This is the ONLY widening shape candidate-fetch supports in production today
 *  (Atlas's `fetch_atlas_candidates_widened` RPC). Neutral field names — no
 *  source concept leaks. The deferred parametric follow-up may grow this. */
export interface CandidateWidening {
  attributeId: string;
  lo: number;
  hi: number;
  /** Source value (base SI) — used to order in-band rows nearest-first. */
  sourceValue: number;
}

export interface CandidateRequest {
  sourceAttrs: PartAttributes;
  familyId: string;
  currency?: string;
  userId?: string;
  widen?: CandidateWidening;
}

// ============================================================
// CATALOG PROVIDER (Digikey full-live, Atlas DB-only)
// ============================================================

export interface CatalogProvider extends DataSourceProvider {
  readonly kind: 'catalog';
  /** Part-number lookup → mapped attributes with `dataSource` set, UN-enriched
   *  (the orchestrator applies enrichSourceInParallel afterward). Digikey
   *  encapsulates its internal two-try (getProductDetails → keyword-prefix
   *  fallback); Atlas wraps getAtlasAttributes. Null on miss. */
  getByMpn(mpn: string, opts?: LookupOpts): Promise<PartAttributes | null>;
  /** Free-text search → SearchResult (+ optional scorable attrs). */
  searchByKeyword(query: string, opts?: KeywordSearchOpts): Promise<CatalogSearchResult>;
  /** Cross-reference candidate pool for a family. Optional: a source may support
   *  MPN lookup + keyword search but not candidate generation via THIS seam.
   *  (Digikey's candidate generation is the deferred parametric-widening island,
   *  still owned by the orchestrator — so digikeyProvider omits this for now and
   *  sets capabilities.candidateFetch=false. Atlas implements it.) */
  fetchCandidates?(req: CandidateRequest): Promise<PartAttributes[]>;
}

// ============================================================
// ENRICHMENT PROVIDER (parts.io — gap-fill + FFF/functional equivalents)
// ============================================================

export interface EnrichmentProvider extends DataSourceProvider {
  readonly kind: 'enrichment';
  /** Gap-fill parametric + lifecycle metadata onto existing attrs. Base data
   *  always wins (only fills missing parameterIds / null Part fields). Returns
   *  attrs unchanged on miss. === orchestrator's enrichWithPartsio. */
  enrich(attrs: PartAttributes, userId?: string): Promise<PartAttributes>;
  /** FFF / functional cross-refs, resolved to scorable attrs with
   *  `equivalenceType` set. === orchestrator's fetchPartsioEquivalents. */
  getEquivalents(mpn: string, userId?: string): Promise<PartAttributes[]>;
}

// ============================================================
// COMMERCIAL PROVIDER (FindChips — price/stock/lifecycle/compliance)
// ============================================================

/** Just the commercial slice (Part-level fields), for the orchestrator to merge
 *  over the parametric base in enrichSourceInParallel (disjoint field sets). */
export interface CommercialData {
  supplierQuotes?: NonNullable<PartAttributes['part']['supplierQuotes']>;
  lifecycleInfo?: NonNullable<PartAttributes['part']['lifecycleInfo']>;
  complianceData?: NonNullable<PartAttributes['part']['complianceData']>;
}

/** fc/oems source-selection strategy. The orchestrator decides which (it needs
 *  the alias resolver to detect Atlas/Chinese makers — a provider must not). */
export type CommercialSource = 'parallel-both' | 'fc-with-oems-fallback';

export interface CommercialProvider extends DataSourceProvider {
  readonly kind: 'commercial';
  getCommercial(mpn: string, opts: { source: CommercialSource; userId?: string }): Promise<CommercialData | null>;
  getDistributorCount(mpn: string): Promise<number | undefined>;
}

// ============================================================
// PARAMETRIC CAPABILITY (Digikey-only — optional mix-in)
// ============================================================

/** Opaque, source-OWNED category handle. Digikey wraps `{ categoryId:number }`;
 *  a replacement wraps whatever its API needs. The orchestrator NEVER inspects
 *  `.raw` — it round-trips it back to the same provider. */
export interface CategoryRef {
  provider: ProviderId;
  label?: string;
  raw: unknown;
}

/** Facet tokens are OPAQUE strings the SAME provider round-trips (discover →
 *  filter). They look Digikey-shaped today; callers treat them as opaque. Only
 *  `valueName` is ever parsed (via the shared parser, in the deferred follow-up). */
export interface FacetValue {
  valueId: string;
  valueName: string;
  productCount?: number;
}
export interface Facet {
  parameterId: string;
  parameterName: string;
  values: FacetValue[];
}
export interface FacetSet {
  facets: Facet[];
}

/** One parameter constraint as an in-base-SI band. Source-neutral. */
export interface ParametricBand {
  attributeId: string;
  lo: number;
  hi: number;
}

/**
 * OPTIONAL mix-in for catalog providers that can filter by attribute value.
 * Presence is gated by `capabilities.facets && capabilities.parametricFilter`.
 *
 * Phase 1 exposes the PRIMITIVES (resolveCategoryRefs / discoverFacets /
 * filterByValues) as thin pass-throughs so the future Family Value Catalog and
 * spec-widening can build against THIS seam instead of getCategoryParametricFacets
 * directly. The full `applyParametricWidening` convergence (discover → select via
 * the single shared parser → apply → re-verify) — which unifies the two divergent
 * widening copies and fixes the GHz/THz/negative-band parser bug — is the DEFERRED
 * follow-up; it will be added here.
 */
export interface ParametricCapability {
  /** Family → source-neutral category handles (Digikey: categoryIds). */
  resolveCategoryRefs(familyId: string): Promise<CategoryRef[]>;
  /** Discover a category's filterable values (facets / value distributions). */
  discoverFacets(cat: CategoryRef, keyword?: string, opts?: LookupOpts): Promise<FacetSet>;
  /** Apply a value filter (opaque valueIds from discoverFacets) → scorable attrs. */
  filterByValues(
    cat: CategoryRef,
    parameterId: string,
    valueIds: string[],
    opts?: LookupOpts & { limit?: number },
  ): Promise<PartAttributes[]>;
}

export type ParametricCatalogProvider = CatalogProvider & ParametricCapability;

/** True when a provider can do attribute filtering. Atlas → false, so callers
 *  fall back exactly as they do today when no facet source is present. */
export function isParametricProvider(
  p: DataSourceProvider,
): p is ParametricCatalogProvider {
  return p.kind === 'catalog' && p.capabilities.facets && p.capabilities.parametricFilter;
}
