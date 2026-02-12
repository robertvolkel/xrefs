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
}

export type PartStatus = 'Active' | 'Obsolete' | 'Discontinued' | 'NRND' | 'LastTimeBuy';

export type ComponentCategory =
  | 'Capacitors'
  | 'Resistors'
  | 'Inductors'
  | 'ICs'
  | 'Diodes'
  | 'Transistors'
  | 'Connectors';

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
  | 'identity_upgrade'  // Match or strictly superior variant (has hierarchy)
  | 'identity_flag'     // Boolean: if original requires it, replacement must too
  | 'threshold'         // Numeric comparison (≥ or ≤ boundary)
  | 'fit'               // Physical/dimensional constraint (≤)
  | 'application_review' // Cannot be automated, requires manual review
  | 'operational';       // Non-electrical (manufacturing/supply chain)

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

/** A row from the uploaded parts list */
export interface PartsListRow {
  rowIndex: number;
  rawMpn: string;
  rawManufacturer: string;
  rawDescription: string;
  status: PartsListRowStatus;
  resolvedPart?: PartSummary;
  sourceAttributes?: PartAttributes;
  suggestedReplacement?: XrefRecommendation;
  allRecommendations?: XrefRecommendation[];
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
}

/** Single item response from batch validation */
export interface BatchValidateItem {
  rowIndex: number;
  status: 'resolved' | 'not-found' | 'error';
  resolvedPart?: PartSummary;
  sourceAttributes?: PartAttributes;
  suggestedReplacement?: XrefRecommendation;
  allRecommendations?: XrefRecommendation[];
  errorMessage?: string;
}

/** Response from the batch validate API */
export interface BatchValidateResponse {
  results: BatchValidateItem[];
  totalProcessed: number;
  totalResolved: number;
}
