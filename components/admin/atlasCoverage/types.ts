// Shared client-side types for the Atlas Coverage admin page.
// AtlasResponse mirrors GET /api/admin/atlas; AtlasGrowthResponse mirrors
// GET /api/admin/atlas/growth (re-imported from the route's exported types).

export interface AtlasSummary {
  totalProducts: number;
  totalManufacturers: number;
  targetManufacturers: number;
  queuedManufacturers: number;
  enabledManufacturers: number;
  enabledProducts: number;
  scorableProducts: number;
  searchOnlyProducts: number;
  familiesCovered: number;
  lastUpdated: string | null;
  // Product-level coverage headline (per-product, unified across admin pages).
  dataCoveragePct: number; // covered attribute slots / required slots
  reachPct: number; // classifiable products / all products
  coveredSlots: number; // raw numerator, for the live tooltip
  requiredSlots: number; // raw denominator, for the live tooltip
}

export interface AtlasMfr {
  manufacturer: string;
  nameEn: string | null;
  nameZh: string | null;
  slug: string | null;
  mfrId: number | null;
  productCount: number;
  scorableCount: number;
  families: string[];
  categories: string[];
  lastUpdated: string;
  coveragePct: number;
  enabled: boolean;
}

export interface AtlasFamilyBreakdown {
  manufacturer: string;
  familyId: string | null;
  category: string;
  subcategory: string;
  count: number;
  scorableCount: number;
  coveragePct: number;
}

export interface AtlasResponse {
  summary: AtlasSummary;
  manufacturers: AtlasMfr[];
  familyBreakdown: AtlasFamilyBreakdown[];
  familyNames: Record<string, string>;
  cachedAt?: string;
}
