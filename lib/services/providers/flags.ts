/**
 * Per-phase connector-adoption flags — the SINGLE place each rollout phase is
 * gated. Each seam routes through the provider adapters only when its flag is '1';
 * flag-off stays byte-identical to the legacy inline path.
 *
 * Distinct from providerRegistry: the registry controls WHICH provider is used;
 * these control WHETHER a given seam has been switched over yet.
 *
 * Read at CALL TIME (never a module-level const) so the characterization harness
 * can toggle them in-process — and because the harness sets them in a top-level
 * statement that runs after this module is imported (ES imports are hoisted), an
 * import-time read would see them unset. See scripts/providers-characterize.ts.
 */

/** Phase 2 — Digikey/Atlas MPN lookup in getAttributes. */
export const providersAttrsEnabled = (): boolean => process.env.PROVIDERS_ATTRS === '1';

/** Phase 3 — parts.io enrichment + FindChips commercial. */
export const providersEnrichEnabled = (): boolean => process.env.PROVIDERS_ENRICH === '1';

/** Phase 4 — multi-source search fan-out. */
export const providersSearchEnabled = (): boolean => process.env.PROVIDERS_SEARCH === '1';

/** Phase 5 — recommendation candidate fetch. */
export const providersRecsEnabled = (): boolean => process.env.PROVIDERS_RECS === '1';
