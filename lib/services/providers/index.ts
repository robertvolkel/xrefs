/**
 * Data-source provider abstraction — public surface.
 *
 * Replaces the dead `PartDataProvider` interface (removed from lib/types.ts): that
 * one bundled getRecommendations/scoring, which a swappable data source must never
 * own. These providers are data-access only.
 */

export * from './types';
export { digikeyProvider } from './digikeyProvider';
export { atlasProvider } from './atlasProvider';
export { partsioProvider } from './partsioProvider';
export { findchipsProvider } from './findchipsProvider';
export {
  catalogProviders,
  enrichmentProvider,
  commercialProvider,
  parametricProvider,
  providerById,
} from './providerRegistry';
export {
  providersAttrsEnabled,
  providersEnrichEnabled,
  providersSearchEnabled,
  providersRecsEnabled,
} from './flags';
