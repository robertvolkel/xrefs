// Shared client-side types for the Atlas Ingest admin UI.
// Mirror lib/services/atlasIngestService.ts but importable from client components.

export type IngestRisk = 'clean' | 'review' | 'attention';
export type IngestStatus = 'pending' | 'applied' | 'reverted' | 'expired';

export type IngestDiffReport = {
  manufacturer: string;
  sourceFile: string;
  sourceFileSha256: string;
  productCounts: {
    inNewFile: number;
    inDb: number;
    willInsert: number;
    willUpdate: number;
    willDelete: number;
  };
  attrChanges: {
    totalNewAttrs: number;
    totalChangedValues: number;
    totalRemovedAttrs: number;
    perProduct: Array<{
      mpn: string;
      kind: 'insert' | 'update';
      added: string[];
      changed: Array<{ key: string; oldValue: unknown; newValue: unknown }>;
      removed: string[];
      classification?: Array<{ field: string; oldValue: unknown; newValue: unknown }>;
    }>;
  };
  classificationChanges: Array<{ mpn: string; field: string; oldValue: unknown; newValue: unknown }>;
  deletes: Array<{ mpn: string; kind: 'hard_delete' | 'soft_delete'; reason: string }>;
  attrCountStats: { avgBefore: number; avgAfter: number };
  unmappedParams: Array<{
    paramName: string;
    sampleValues: string[];
    productCount: number;
    attributeId: string;
    kind: 'gaia' | 'standard';
  }>;
  familyCounts: Record<string, number>;
  mappingStats: { total: number; mapped: number; errors: number };
};

export type IngestBatch = {
  batch_id: string;
  manufacturer: string;
  source_file: string;
  source_file_sha256: string;
  report: IngestDiffReport;
  status: IngestStatus;
  risk: IngestRisk;
  created_at: string;
  applied_at: string | null;
  applied_by: string | null;
  reverted_at: string | null;
  reverted_by: string | null;
};

export type ParsedFilename = {
  filename: string;
  atlasId: number | null;
  nameEn: string | null;
  nameZh: string | null;
  nameDisplay: string | null;
  slug: string | null;
};

export type StagedFile = {
  filename: string;
  filePath: string;
  sizeBytes: number;
  parsed: ParsedFilename;
  isNewManufacturer: boolean;
  existingManufacturer: { atlas_id: number; name_display: string; slug: string } | null;
};

export type GlobalUnmappedParam = {
  paramName: string;
  sampleValues: string[];
  mfrCount: number;
  productCount: number;
  affectedBatchIds: string[];
  /** Per-MFR provenance, deduped by slug across batches. Sorted by productCount
   *  desc so the dominant manufacturer appears first in the UI chip list. */
  affectedManufacturers: Array<{ slug: string; name: string; productCount: number }>;
  dominantFamily: string | null;
  familyCounts: Record<string, number>;
};

// Reply shape from POST /api/admin/atlas/dictionaries/suggest
export type DictSuggestion = {
  translation: string | null;
  suggestedAttributeId: string | null;
  suggestedAttributeName: string | null;
  suggestedUnit: string | null;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string | null;
};

// Full /suggest response payload — `schemaIds` is the canonical attributeId list
// for the family the suggestion was generated against. The client stores it
// per-family to validate any (possibly user-edited) attributeId in the row UI.
export type SuggestResponse = {
  success: boolean;
  suggestion: DictSuggestion | null;
  schemaIds?: string[];
  cached?: boolean;
};

export type BatchListResponse = {
  success: true;
  batches: IngestBatch[];
  aggregate: {
    counts: { clean: number; review: number; attention: number; total: number };
    productCounts: { willInsert: number; willUpdate: number; willDelete: number };
    attrChanges: { totalNewAttrs: number; totalChangedValues: number; totalRemovedAttrs: number };
  };
  unmappedParamsGlobal: GlobalUnmappedParam[];
};
