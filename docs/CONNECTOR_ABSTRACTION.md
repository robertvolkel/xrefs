# Data-Source Connector Abstraction

Status: **feature branch `feat/data-source-connector-abstraction`, not merged.** Every
adoption phase is behind an off-by-default flag; production is unchanged with all flags unset.

## Why this exists

The matching engine was wired directly to Digikey — `partDataService.ts` called
`digikeyClient` from three functions, so losing Digikey API access would mean surgery across
a 5,000-line module with no seam to cut along. This layer introduces a small, typed
**data-access interface** each source implements, so the engine talks to "a catalog provider"
instead of "Digikey," and a replacement source can be dropped in by implementing the interface
and registering it.

**The honest limit:** an abstraction insulates the *code*, not the *capability*. Nothing else on
the market today supplies live Western parametric facet search, so losing Digikey degrades the
product even with a perfect abstraction (see the capability matrix below). The value here is
(a) one small typed surface to re-implement against a new source, and (b) a clean seam that
future work can target.

## Where the code lives

```
lib/services/providers/
  types.ts             # the capability-based interface family (data-access ONLY)
  digikeyProvider.ts   # CatalogProvider + ParametricCapability
  atlasProvider.ts     # CatalogProvider (DB-only, no facets)
  partsioProvider.ts   # EnrichmentProvider (gap-fill + equivalents)
  findchipsProvider.ts # CommercialProvider (price/stock/lifecycle/compliance)
  providerRegistry.ts  # priority-ordered, config/flag-filtered accessors
  flags.ts             # per-phase adoption flags (PROVIDERS_ATTRS/ENRICH/SEARCH/RECS)
```

A provider is **data-access only**: it fetches and maps one source's data into our internal
types. It never scores/filters/sorts, never arbitrates across sources (the fallback ladder stays
in `partDataService`), and never resolves `mfrOrigin` (Chinese/Western manufacturer identity —
that stays in the orchestrator via `resolveManufacturerAlias`). Providers set `dataSource`
(provenance) only.

## Turning Digikey off — the single gate

Set **`DIGIKEY_PROVIDER_DISABLED=1`**. This is the ONE gate every Digikey path already funnels
through — `isDigikeyConfigured()` in `lib/services/digikeyClient.ts`. It is read at call time, so
toggling it takes effect without a restart, and it makes every consumer degrade automatically:

- all three engine entry points (`searchParts`, `getAttributes`, `getRecommendations`) skip their
  Digikey branch;
- both deferred parametric-widening islands (`fetchDigikeyCandidates`,
  `fetchGreenfieldParametricProducts`) no-op (their call sites are behind the gate);
- the provider registry drops Digikey from `catalogProviders()` and returns `null` from
  `parametricProvider()` (the adapter's `isConfigured()` is the same predicate);
- the `health` and `admin/data-sources` routes report Digikey unavailable without pinging it.

There is deliberately **no second registry-only disable check** that could drift from this one.

## Capability matrix — what degrades without Digikey

| Capability | With Digikey | Digikey disabled |
|---|---|---|
| MPN attribute lookup | Digikey → parts.io → Atlas | parts.io → Atlas |
| Broad Western keyword search | Yes | **Lost** (Atlas = Chinese-MFR + substring only) |
| Facet discovery / value distributions | Yes | **Lost** (no facet source) |
| Parametric widening (greenfield + recs) | Yes | **Lost** (falls to keyword-only / no-ops) |
| Cross-ref candidate pool | Digikey + Atlas + parts.io + MFR | Atlas + parts.io + MFR |
| Commercial quotes / stock | FindChips (unaffected) | FindChips (unaffected) |
| Compliance | parts.io + FindChips | Unaffected |

Graceful degradation, **not** equivalence: with Digikey off, `searchParts` returns Atlas
(+ parts.io for part-number queries) with no throw and `sourcesContributed` excluding `digikey`;
`getAttributes` resolves via the parts.io→Atlas tail; `getRecommendations` returns Atlas +
parts.io-equivalents + MFR-crossref candidates; the parametric-widening islands silently no-op.

## How each phase was verified

Not "trust" — each phase was proven byte-identical (flag off vs on) before its flag could flip,
using the characterization harness `scripts/providers-characterize.ts` (record → diff over a live
corpus, with volatile fields stripped). The harness's own verdict logic is unit-tested
(`__tests__/scripts/characterizationCore.test.ts`) so a doubly-empty/errored run can't read as a
false pass. The Digikey-off degradation and the single-gate behavior are guarded by
`__tests__/services/providers.test.ts`.

## Deferred (own plan + review)

The parametric-widening convergence (unifying the two divergent copies in
`greenfieldParametricFetch.ts` and `fetchDigikeyCandidates`, which fixes a latent GHz/THz/negative
-band parser bug) is intentionally out of scope — it is a behavior change, not a byte-identical
move. The `ParametricCapability` interface seam lands now so that work has a clean home.

A future **admin-connect ("no-code") path** would reuse this registry as its single control point
(swap env → DB without changing callers) plus the existing AI-assisted param-mapping pattern
(Atlas dictionary triage) for the genuinely hard half: mapping an arbitrary vendor schema into our
internal types.
