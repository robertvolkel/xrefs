/** Represents a unique electronic component */
export interface Part {
  mpn: string;
  manufacturer: string;
  description: string;
  detailedDescription: string;
  category: ComponentCategory;
  subcategory: string;
  status: PartStatus;
  datasheetUrl?: string;
  imageUrl?: string;
  unitPrice?: number;
  quantityAvailable?: number;
  productUrl?: string;
  digikeyPartNumber?: string;
  rohsStatus?: string;
  moistureSensitivityLevel?: string;
  digikeyCategoryId?: number;
  qualifications?: string[];
}

export type PartStatus = 'Active' | 'Obsolete' | 'Discontinued' | 'NRND' | 'LastTimeBuy';

export type ComponentCategory =
  | 'Capacitors'
  | 'Resistors'
  | 'Inductors'
  | 'ICs'
  | 'Diodes'
  | 'Transistors'
  | 'Thyristors'
  | 'Connectors'
  | 'Protection'
  | 'Voltage Regulators'
  | 'Gate Drivers'
  | 'Amplifiers';

/** A single parametric attribute of a component */
export interface ParametricAttribute {
  parameterId: string;
  parameterName: string;
  value: string;
  numericValue?: number;
  unit?: string;
  sortOrder: number;
}

/** Full parametric profile of a part */
export interface PartAttributes {
  part: Part;
  parameters: ParametricAttribute[];
  /** Where this data came from — 'digikey' for live API, 'mock' for fallback */
  dataSource?: 'digikey' | 'mock';
}

/** A cross-reference recommendation */
export interface XrefRecommendation {
  part: Part;
  matchPercentage: number;
  matchDetails: MatchDetail[];
  notes?: string;
}

/** Per-parameter match detail for comparison */
export interface MatchDetail {
  parameterId: string;
  parameterName: string;
  sourceValue: string;
  replacementValue: string;
  matchStatus: MatchStatus;
  ruleResult?: RuleResult;
  note?: string;
}

export type MatchStatus = 'exact' | 'compatible' | 'better' | 'worse' | 'different';

/** Lightweight part info for search results / selection */
export interface PartSummary {
  mpn: string;
  manufacturer: string;
  description: string;
  category: ComponentCategory;
  status?: PartStatus;
  qualifications?: string[];
}

export interface SearchResult {
  type: 'single' | 'multiple' | 'none';
  matches: PartSummary[];
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export type AppPhase =
  | 'idle'
  | 'searching'
  | 'resolving'
  | 'loading-attributes'
  | 'awaiting-attributes'
  | 'awaiting-context'
  | 'finding-matches'
  | 'viewing'
  | 'comparing'
  | 'unsupported';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  variant?: 'warning';
  interactiveElement?: InteractiveElement;
}

export type InteractiveElement =
  | { type: 'confirmation'; part: PartSummary }
  | { type: 'options'; parts: PartSummary[] }
  | { type: 'attribute-query'; missingAttributes: MissingAttributeInfo[]; partMpn: string }
  | { type: 'context-questions'; questions: ContextQuestion[]; familyId: string };

export interface MissingAttributeInfo {
  attributeId: string;
  attributeName: string;
  logicType: LogicType;
  weight: number;
}

/** Interface that both mock and real data providers must implement */
export interface PartDataProvider {
  search(query: string): Promise<SearchResult>;
  getAttributes(mpn: string): Promise<PartAttributes | null>;
  getRecommendations(mpn: string): Promise<XrefRecommendation[]>;
}

// ============================================================
// APPLICATION CONTEXT TYPES
// ============================================================

/** Effect type that a context answer can have on a matching rule */
export type ContextEffectType =
  | 'escalate_to_mandatory'  // flag → hard gate (weight = 10)
  | 'escalate_to_primary'    // secondary → primary concern (weight → 8-9)
  | 'set_threshold'          // tighten threshold
  | 'not_applicable'         // remove from evaluation (weight = 0)
  | 'add_review_flag';       // change to application_review

/** How a single context answer affects a specific attribute's matching rule */
export interface AttributeEffect {
  attributeId: string;
  effect: ContextEffectType;
  note?: string;
  /** If true, missing candidate data on a threshold rule becomes a hard fail (not review). */
  blockOnMissing?: boolean;
}

/** A predefined option for a context question */
export interface ContextOption {
  value: string;
  label: string;
  description?: string;
  attributeEffects: AttributeEffect[];
}

/** A family-specific context question with predefined options */
export interface ContextQuestion {
  questionId: string;
  questionText: string;
  options: ContextOption[];
  condition?: { questionId: string; values: string[] };
  priority: number;
  allowFreeText?: boolean;
  freeTextPlaceholder?: string;
  /** If true, the matching engine will not proceed until this question is answered. */
  required?: boolean;
}

/** Context question configuration for a component family */
export interface FamilyContextConfig {
  familyIds: string[];
  contextSensitivity: 'critical' | 'high' | 'moderate' | 'low';
  questions: ContextQuestion[];
}

/** User's context answers for a specific part evaluation */
export interface ApplicationContext {
  familyId: string;
  answers: Record<string, string>;
}

// ============================================================
// MATCHING ENGINE TYPES
// ============================================================

/** Logic type for each attribute rule in a logic table */
export type LogicType =
  | 'identity'          // Exact match required
  | 'identity_range'    // Range overlap required (e.g., JFET Vp, Idss — replacement range must overlap source range)
  | 'identity_upgrade'  // Match or strictly superior variant (has hierarchy)
  | 'identity_flag'     // Boolean: if original requires it, replacement must too
  | 'threshold'         // Numeric comparison (≥ or ≤ boundary)
  | 'fit'               // Physical/dimensional constraint (≤)
  | 'application_review' // Cannot be automated, requires manual review
  | 'operational'        // Non-electrical (manufacturing/supply chain)
  | 'vref_check';        // Vref mismatch → automatic Vout recalculation with ±2% tolerance

/** Direction for threshold comparisons */
export type ThresholdDirection =
  | 'gte'  // Replacement ≥ Original (e.g., voltage rating)
  | 'lte'  // Replacement ≤ Original (e.g., ESR, tolerance)
  | 'range_superset'; // Replacement range ⊇ Original range (e.g., temp range)

/** A single matching rule in a logic table */
export interface MatchingRule {
  attributeId: string;
  attributeName: string;
  logicType: LogicType;
  thresholdDirection?: ThresholdDirection;
  upgradeHierarchy?: string[]; // For identity_upgrade: ordered best→worst
  weight: number; // Relative importance (0-10) for scoring
  engineeringReason: string;
  sortOrder: number;
  /** If true, missing candidate value on a threshold rule is a hard fail (not review). Set by context modifier. */
  blockOnMissing?: boolean;
  /** For identity rules: allow ±% tolerance band before failing (e.g., 10 = ±10% for fsw). */
  tolerancePercent?: number;
}

/** A complete logic table for a component family */
export interface LogicTable {
  familyId: string;
  familyName: string;
  category: string;
  description: string;
  rules: MatchingRule[];
}

/** Result of evaluating a single rule */
export type RuleResult = 'pass' | 'fail' | 'upgrade' | 'review' | 'info';

/** Evaluation result for a single attribute */
export interface RuleEvaluationResult {
  attributeId: string;
  attributeName: string;
  sourceValue: string;
  candidateValue: string;
  logicType: LogicType;
  result: RuleResult;
  matchStatus: MatchStatus;
  note?: string;
}

/** Full evaluation result for a candidate part */
export interface CandidateEvaluation {
  candidate: PartAttributes;
  matchPercentage: number;
  passed: boolean; // true if no hard failures
  results: RuleEvaluationResult[];
  reviewFlags: string[]; // Attributes needing human review
  notes: string[];
}

// ============================================================
// LLM ORCHESTRATOR TYPES
// ============================================================

/** Message type for the LLM orchestrator conversation */
export interface OrchestratorMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Structured response from the LLM orchestrator */
export interface OrchestratorResponse {
  message: string;
  searchResult?: SearchResult;
  attributes?: Record<string, PartAttributes>;
  recommendations?: Record<string, XrefRecommendation[]>;
}

// ============================================================
// CONVERSATION PERSISTENCE TYPES
// ============================================================

/** Summary for listing conversations in the history drawer */
export interface ConversationSummary {
  id: string;
  title: string;
  sourceMpn: string | null;
  phase: AppPhase;
  createdAt: string;
  updatedAt: string;
}

/** Full conversation state for persistence and hydration */
export interface ConversationSnapshot {
  id: string;
  title: string;
  sourceMpn: string | null;
  phase: AppPhase;
  messages: ChatMessage[];
  orchestratorMessages: OrchestratorMessage[];
  sourcePart: PartSummary | null;
  sourceAttributes: PartAttributes | null;
  applicationContext: ApplicationContext | null;
  recommendations: XrefRecommendation[];
  selectedRecommendation: XrefRecommendation | null;
  comparisonAttributes: PartAttributes | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// MANUFACTURER PROFILE TYPES
// ============================================================

export interface ManufacturerProfile {
  id: string;
  name: string;
  logoUrl?: string;
  headquarters: string;
  country: string;
  countryFlag: string;
  foundedYear?: number;
  catalogSize?: number;
  familyCount?: number;
  distributorCount?: number;
  isSecondSource: boolean;
  productCategories: string[];
  certifications: ManufacturerCertification[];
  designResources: DesignResource[];
  manufacturingLocations: ManufacturerLocation[];
  authorizedDistributors: AuthorizedDistributor[];
  complianceFlags: string[];
  summary: string;
}

export interface AuthorizedDistributor {
  name: string;
  url: string;
}

export interface ManufacturerCertification {
  name: string;
  category: 'automotive' | 'quality' | 'environmental' | 'safety' | 'military';
}

export interface DesignResource {
  type: 'SPICE Models' | 'Reference Designs' | 'Selection Guides' | 'Online Simulation' | 'CAD Libraries' | 'Application Notes';
  url?: string;
}

export interface ManufacturerLocation {
  location: string;
  type: 'fab' | 'assembly_test' | 'both';
}

// ============================================================
// PARTS LIST TYPES
// ============================================================

/** Status of an individual row during batch validation */
export type PartsListRowStatus = 'pending' | 'validating' | 'resolved' | 'not-found' | 'error';

/** Flattened, storage-friendly Digikey product data built during validation */
export interface EnrichedPartData {
  // Product Identification
  manufacturer?: string;
  digikeyPartNumber?: string;
  productUrl?: string;
  // Product Attributes
  category?: string;
  subcategory?: string;
  /** All parametric parameters: parameterId → { name, value } */
  parameters: Record<string, { name: string; value: string }>;
  // Documentation
  datasheetUrl?: string;
  photoUrl?: string;
  // Pricing & Availability
  unitPrice?: number;
  quantityAvailable?: number;
  productStatus?: string;
  // Environmental & Compliance
  rohsStatus?: string;
  moistureSensitivityLevel?: string;
}

/** A row from the uploaded parts list */
export interface PartsListRow {
  rowIndex: number;
  rawMpn: string;
  rawManufacturer: string;
  rawDescription: string;
  /** All original cell values from the uploaded spreadsheet row */
  rawCells: string[];
  status: PartsListRowStatus;
  resolvedPart?: PartSummary;
  sourceAttributes?: PartAttributes;
  suggestedReplacement?: XrefRecommendation;
  allRecommendations?: XrefRecommendation[];
  /** Top 2 non-failing recs after #1 — persisted for inline sub-row display */
  topNonFailingRecs?: XrefRecommendation[];
  /** Total recommendation count — persisted so hits column is accurate on load */
  recommendationCount?: number;
  /** Flattened Digikey data stored during validation */
  enrichedData?: EnrichedPartData;
  errorMessage?: string;
}

/** Column mapping configuration */
export interface ColumnMapping {
  mpnColumn: number;
  manufacturerColumn: number;
  descriptionColumn: number;
}

/** Parsed spreadsheet data before column mapping */
export interface ParsedSpreadsheet {
  headers: string[];
  rows: string[][];
  fileName: string;
}

/** Request body for the batch validate API */
export interface BatchValidateRequest {
  items: Array<{
    rowIndex: number;
    mpn: string;
    manufacturer?: string;
    description?: string;
  }>;
  /** Currency code for pricing (e.g. 'USD', 'CNY'). Passed to Digikey API. */
  currency?: string;
}

/** Single item response from batch validation */
export interface BatchValidateItem {
  rowIndex: number;
  status: 'resolved' | 'not-found' | 'error';
  resolvedPart?: PartSummary;
  sourceAttributes?: PartAttributes;
  suggestedReplacement?: XrefRecommendation;
  allRecommendations?: XrefRecommendation[];
  enrichedData?: EnrichedPartData;
  errorMessage?: string;
}

/** Response from the batch validate API */
export interface BatchValidateResponse {
  results: BatchValidateItem[];
  totalProcessed: number;
  totalResolved: number;
}

// ============================================================
// TAXONOMY / COVERAGE TYPES
// ============================================================

/** Coverage metadata for a supported family within the taxonomy */
export interface FamilyCoverageInfo {
  familyId: string;
  familyName: string;
  category: string;
  ruleCount: number;
  totalWeight: number;
  matchableWeight: number;
  paramCoverage: number;
  lastUpdated: string;
}

/** A subcategory within the Digikey taxonomy, enriched with coverage data */
export interface TaxonomySubcategory {
  categoryId: number;
  name: string;
  productCount: number;
  covered: boolean;
  families: FamilyCoverageInfo[];
}

/** A top-level category in the Digikey taxonomy */
export interface TaxonomyCategory {
  categoryId: number;
  name: string;
  productCount: number;
  coveredProductCount: number;
  subcategories: TaxonomySubcategory[];
  coveredCount: number;
}

/** Full taxonomy response from the API */
export interface TaxonomyResponse {
  categories: TaxonomyCategory[];
  summary: {
    totalCategories: number;
    totalSubcategories: number;
    coveredSubcategories: number;
    totalFamilies: number;
    coveragePercentage: number;
    totalProducts: number;
    coveredProducts: number;
    productCoveragePercentage: number;
  };
  fetchedAt: string;
}

// ============================================================
// PLATFORM SETTINGS
// ============================================================

export interface PlatformSettings {
  qcLoggingEnabled: boolean;
}

// ============================================================
// QC SYSTEM: RECOMMENDATION LOG + FEEDBACK
// ============================================================

/** Result from getRecommendations() — includes metadata for logging */
export interface RecommendationResult {
  recommendations: XrefRecommendation[];
  sourceAttributes: PartAttributes;
  familyId?: string;
  familyName?: string;
  dataSource?: 'digikey' | 'mock';
}

/** The stage of the recommendation pipeline being questioned */
export type FeedbackStage = 'qualifying_questions' | 'rule_logic';

/** Lifecycle status of a feedback item */
export type FeedbackStatus = 'open' | 'reviewed' | 'resolved' | 'dismissed';

/** Source of the recommendation request */
export type RequestSource = 'chat' | 'direct' | 'batch';

/** Snapshot stored in recommendation_log JSONB */
export interface RecommendationLogSnapshot {
  sourceAttributes: PartAttributes;
  recommendations: XrefRecommendation[];
  contextQuestions?: ContextQuestion[];
  contextAnswers?: ApplicationContext;
  attributeOverrides?: Record<string, string>;
}

/** A recommendation log entry (from the admin API) */
export interface RecommendationLogEntry {
  id: string;
  userId: string;
  sourceMpn: string;
  sourceManufacturer?: string;
  familyId?: string;
  familyName?: string;
  recommendationCount: number;
  requestSource: RequestSource;
  dataSource?: string;
  snapshot: RecommendationLogSnapshot;
  feedbackCount?: number;
  feedbackStatus?: FeedbackStatus;  // "worst" status across all feedback items
  createdAt: string;
  userEmail?: string;
  userName?: string;
}

/** Payload for submitting new feedback (client sends this) */
export interface QcFeedbackSubmission {
  feedbackStage: FeedbackStage;
  sourceMpn: string;
  sourceManufacturer?: string;
  replacementMpn?: string;
  ruleAttributeId?: string;
  ruleAttributeName?: string;
  ruleResult?: string;
  sourceValue?: string;
  replacementValue?: string;
  ruleNote?: string;
  questionId?: string;
  questionText?: string;
  userComment: string;
}

/** Full feedback record from the database (admin reads this) */
export interface QcFeedbackRecord extends QcFeedbackSubmission {
  id: string;
  logId?: string;
  userId: string;
  status: FeedbackStatus;
  adminNotes?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
  userEmail?: string;
  userName?: string;
}

/** Feedback item for admin list view (enriched with log context) */
export interface QcFeedbackListItem extends QcFeedbackRecord {
  familyName?: string;
}

/** Status count summary for feedback filter badges */
export interface FeedbackStatusCounts {
  open: number;
  reviewed: number;
  resolved: number;
  dismissed: number;
}

/** Admin update payload for feedback */
export interface QcFeedbackUpdate {
  status?: FeedbackStatus;
  adminNotes?: string;
}

// ============================================================
// QC EXPORT & ANALYSIS TYPES
// ============================================================

/** Aggregated stats for a single matching rule within a family */
export interface RuleAggregateStats {
  attributeId: string;
  attributeName: string;
  logicType: string;
  weight: number;
  totalEvaluations: number;
  passCount: number;
  failCount: number;
  reviewCount: number;
  upgradeCount: number;
  missingCount: number;
  avgEarnedWeight: number;
  failRate: number;
}

/** Aggregated stats per component family */
export interface FamilyAggregateStats {
  familyId: string;
  familyName: string;
  logCount: number;
  avgMatchPercentage: number;
  medianMatchPercentage: number;
  matchDistribution: { bucket: string; count: number }[];
  avgRecommendationCount: number;
  ruleStats: RuleAggregateStats[];
  feedbackCount: number;
  feedbackByStatus: Record<FeedbackStatus, number>;
  topFailingRules: { attributeName: string; failRate: number; failCount: number }[];
  missingAttributeFrequency: { attributeName: string; missingRate: number; count: number }[];
}

/** Full aggregated dataset sent to Claude for analysis */
export interface QcAnalysisInput {
  dateRange: { from: string; to: string };
  totalLogs: number;
  totalFeedback: number;
  byDataSource: Record<string, number>;
  byRequestSource: Record<string, number>;
  families: FamilyAggregateStats[];
  representativeExamples: QcAnalysisExample[];
}

/** A representative log example (stripped to essentials) */
export interface QcAnalysisExample {
  sourceMpn: string;
  familyName: string;
  matchPercentage: number;
  failingRules: { attributeName: string; sourceValue: string; replacementValue: string; note?: string }[];
  feedbackComment?: string;
}

/** SSE event types for streaming analysis */
export type QcAnalysisEvent =
  | { type: 'progress'; message: string }
  | { type: 'chunk'; content: string }
  | { type: 'complete'; fullContent: string }
  | { type: 'error'; message: string };
