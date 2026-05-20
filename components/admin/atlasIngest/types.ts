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
  /** Optional — populated from atlas-ingest.mjs runs after the L2-category
   *  triage feature shipped. Older batches lack this field. */
  categoryCounts?: Record<string, number>;
  mappingStats: { total: number; mapped: number; errors: number };
  /** MPN-quality issues detected at ingest time (phase 1: detection only).
   *  Populated when the source data contains un-matchable MPN patterns —
   *  range entries, "Series" sentinels, trailing-x placeholders, or
   *  slash-delimited two-MPN rows. Engineers see this in the per-batch
   *  diff report and fix manually upstream. Older batches omit the field.
   *  Detection rules in lib/services/atlasMpnQualityValidator.ts. */
  mpnQuality?: {
    totalIssues: number;
    byKind: {
      range_thru: number;
      range_series: number;
      placeholder_x: number;
      placeholder_xx_midword: number;
      slash_variant: number;
    };
    samples: Array<{
      originalMpn: string;
      kind: 'range_thru' | 'range_series' | 'placeholder_x' | 'placeholder_xx_midword' | 'slash_variant';
      reason: string;
    }>;
  };
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

/** Foreign-family auto-flag — registry hit from atlasFamilyParamSignatures.
 *  Present iff the param's name belongs unambiguously to a different family
 *  than the row's dominantFamily, AND the engineer hasn't suppressed it via
 *  status='confirmed_in_family' on atlas_unmapped_param_notes. */
export type AutoFlag = {
  /** familyId of the family this paramName actually belongs to, e.g. 'B6' */
  suggestedFamily: string;
  /** Human-readable rationale shown in the diagnosis card / tooltip. */
  reasoning: string;
  /** The matched paramName itself, snapshotted for the audit record. */
  matchingParam: string;
};

export type NoteStatus = 'wrong_family' | 'confirmed_in_family' | 'unmappable' | null;

/** Structured AI verdict from /api/admin/atlas/dictionaries/investigate.
 *  Fired on demand for rows where the per-row /suggest verdict is NOT
 *  'accept' (defers + unscoped rows) and where the engineer needs a
 *  concrete next action instead of "you investigate." Cached for 24h
 *  server-side + 7d localStorage on the client. */
export type DeepAnalysisBucket =
  | 'new_canonical'
  | 'disambiguation'
  | 'wrong_family'
  | 'unit_mismatch'
  | 'unscoped_products'
  | 'unmappable';

export type DeepAnalysisActionPayload = {
  // shape varies per bucket — see /investigate route for the discriminated union
  [k: string]: unknown;
};

export type DeepAnalysis = {
  bucket: DeepAnalysisBucket;
  confidence: 'high' | 'medium' | 'low';
  evidence: {
    sampleProducts: Array<{
      mpn: string;
      description: string | null;
      manufacturer: string;
      valueForParam: string | null;
      datasheetUrl?: string | null;
      /** 'applied' = product is live in atlas_products (batch already proceeded).
       *  'pending' = product was read from the source JSON because the batch
       *  carrying this paramName is still in status='pending'. Engineers need
       *  this distinction to know whether to verify the value live or via the
       *  raw datasheet. */
      origin?: 'applied' | 'pending';
    }>;
    crossScopeOverrides: Array<{ familyId: string; attributeId: string; attributeName: string; rawParam: string }>;
    nearestAcceptedInScope: Array<{ attributeId: string; attributeName: string; reasoning: string }>;
    sampleValueDistribution: { numeric: number; categorical: number; mixed: number; units: string[] };
    /** Diagnostic — present only when sampleProducts ended up empty (or to
     *  audit why a particular set of MFRs didn't surface). Lets the UI
     *  surface "we tried but couldn't find products" with specifics. */
    sampleProductsDiag?: {
      mfrSlugsRequested: number;
      nameVariantsResolved: number;
      nameVariantsList: string[];
      productsScanned: number;
      productsCarryingParam: number;
      productsReturned: number;
      /** Per-origin breakdown — how many returned products came from each
       *  side of the ingest line. */
      appliedCount?: number;
      pendingCount?: number;
      pendingBatchesScanned?: number;
      sampleKeysObserved?: string[];
      matchMode?: 'exact' | 'case_insensitive';
    };
  };
  recommendation: {
    summary: string;
    primaryActionLabel: string;
    primaryActionPayload: DeepAnalysisActionPayload;
    alternativeActionLabel?: string;
    alternativeActionPayload?: DeepAnalysisActionPayload;
  };
  prose: string;
  /** Server-side post-validation findings. Populated when the AI's
   *  recommendation contained an invalid family ID (e.g., hallucinated
   *  `BJT_DIGITAL`) or a canonical that near-duplicates an existing one.
   *  When present, the UI should surface these as warning chips and
   *  suppress the primary-action button — the engineer must review
   *  manually rather than clicking through. */
  validationErrors?: Array<{
    kind: 'unknown_family' | 'duplicate_canonical';
    detail: string;
  }>;
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
  /** Dominant L2 category for products carrying this paramName (e.g.
   *  'Microcontrollers'). Used as the override scope key when dominantFamily
   *  is null — atlas_dictionary_overrides.family_id is overloaded to carry
   *  either an L3 familyId or an L2 category name. */
  dominantCategory: string | null;
  categoryCounts: Record<string, number>;
  /** Live foreign-family registry hit. Suppressed when noteStatus is
   *  'confirmed_in_family'. Persisted Confirm action sets noteStatus to
   *  'wrong_family' but autoFlag stays alongside as the registry diagnosis. */
  autoFlag?: AutoFlag;
  /** Persisted triage status from atlas_unmapped_param_notes. */
  noteStatus?: NoteStatus;
  /** Provenance of the persisted status — auto = registry hit + Confirm,
   *  engineer = manual flag from a free-form note interaction. */
  flaggedBy?: 'auto' | 'engineer' | null;
  /** Inline accept audit. Present iff a row in atlas_dictionary_overrides
   *  matches this paramName at either the dominantFamily or dominantCategory
   *  scope. isActive=false signals the override was reverted; the row remains
   *  visible under the 'Undone' / 'All' status filters so the audit trail
   *  survives the revert. */
  acceptedOverride?: {
    id: string;
    attributeId: string;
    attributeName: string;
    unit: string | null;
    createdBy: string;
    createdByName: string;
    createdAt: string;
    updatedAt: string;
    isActive: boolean;
    /** updated_at != created_at — signals the override was edited via PATCH
     *  after initial Accept. UI surfaces this as "Edited by X" instead of
     *  "Accepted by X". */
    wasEdited: boolean;
  };
  /** True iff this row was synthesized from an override row alone (no matching
   *  paramName in any current JSONB report). Means productCount=0 etc. — UI
   *  renders a "no longer in any pending batch" indicator. */
  orphaned?: boolean;
};

export type StatusFilter = 'open' | 'accepted' | 'undone' | 'all';

// Reply shape from POST /api/admin/atlas/dictionaries/suggest
export type DictSuggestion = {
  translation: string | null;
  suggestedAttributeId: string | null;
  suggestedAttributeName: string | null;
  suggestedUnit: string | null;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string | null;
  /** Sonnet 4.6's binary advisory verdict on whether the suggestedAttributeId
   *  is safe to commit. Engineer always decides; the chip is informational.
   *  'defer' means there's a concern (generic catchall, near-duplicate of an
   *  existing canonical, unit mismatch, ambiguous concept) — explanation
   *  carries the rationale for the team note. */
  suggestion: 'accept' | 'defer';
  /** Full-prose rationale shown in the chip tooltip + below the AI translation
   *  cell, and (when suggestion='defer') used as the pre-fill draft for the
   *  team note popover. ALWAYS populated for both verdicts so Accept doesn't
   *  get a "trust me" chip while Defer gets a full essay. */
  explanation: string | null;
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
  /** Bucket counts for the triage view-mode chip group. Computed against
   *  the full overrideResolved set BEFORE the include filter, so engineers
   *  always see how many rows live in each mode regardless of which view
   *  they're currently in. */
  triageCounts?: { synonyms: number; autoFlagged: number; total: number };
  /** Counts for the status filter chip group (Open / Accepted / Undone).
   *  Open = no override; Accepted = active override; Undone = inactive
   *  (reverted) override. Computed across all classified rows regardless of
   *  the include filter (mode). */
  statusCounts?: { open: number; accepted: number; undone: number };
};
