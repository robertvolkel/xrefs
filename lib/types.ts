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
  digikeyLeafCategory?: string;
  qualifications?: string[];
  manufacturerCountry?: string;
  // Lifecycle & compliance metadata (from parts.io)
  yteol?: number;
  riskRank?: number;
  countryOfOrigin?: string;
  reachCompliance?: string;
  eccnCode?: string;
  htsCode?: string;
  factoryLeadTimeWeeks?: number;
  // Digikey quantity-based price breaks (from StandardPricing API field)
  digikeyPriceBreaks?: PriceBreak[];
  // Multi-supplier commercial data
  supplierQuotes?: SupplierQuote[];
  lifecycleInfo?: LifecycleInfo[];
  complianceData?: ComplianceData[];
}

export type PartStatus = 'Active' | 'Obsolete' | 'Discontinued' | 'NRND' | 'LastTimeBuy';

export type ComponentCategory =
  // --- Families with cross-reference logic tables (43 families) ---
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
  | 'Amplifiers'
  | 'Logic ICs'
  | 'Voltage References'
  | 'Interface ICs'
  | 'Timers and Oscillators'
  | 'ADCs'
  | 'DACs'
  | 'Crystals'
  | 'Optocouplers'
  | 'Relays'
  // --- L0 taxonomy: categories without logic tables ---
  | 'Microcontrollers'
  | 'Processors'
  | 'Memory'
  | 'Sensors'
  | 'RF and Wireless'
  | 'LEDs and Optoelectronics'
  | 'Power Supplies'
  | 'Transformers'
  | 'Switches'
  | 'Cables and Wires'
  | 'Filters'
  | 'Audio'
  | 'Motors and Fans'
  | 'Test and Measurement'
  | 'Development Tools'
  | 'Battery Products';

/** A single parametric attribute of a component */
export interface ParametricAttribute {
  parameterId: string;
  parameterName: string;
  value: string;
  numericValue?: number;
  unit?: string;
  sortOrder: number;
  /** Which data source supplied this attribute value */
  source?: 'digikey' | 'partsio' | 'atlas' | 'mpn_enrichment';
  /** Whether this attribute is recognized by the schema (logic table or param map) */
  recognized?: boolean;
}

/** Full parametric profile of a part */
export interface PartAttributes {
  part: Part;
  parameters: ParametricAttribute[];
  /** Where this data came from */
  dataSource?: 'digikey' | 'partsio' | 'atlas' | 'mock';
  /** Secondary data source used for gap-fill enrichment */
  enrichedFrom?: 'partsio';
  /** Set when candidate comes from parts.io FFF/Functional Equivalent fields */
  equivalenceType?: 'fff' | 'functional';
}

/** Source that certified/suggested a cross-reference */
export type CertificationSource = 'partsio_fff' | 'partsio_functional' | 'mouser' | 'manufacturer';

/** High-level recommendation category for UI grouping/filtering */
export type RecommendationCategory = 'logic_driven' | 'manufacturer_certified' | 'third_party_certified';

/** Derive which categories a recommendation belongs to (can be multiple) */
export function deriveRecommendationCategories(rec: XrefRecommendation): RecommendationCategory[] {
  const cats: RecommendationCategory[] = [];
  if (rec.matchPercentage > 0) cats.push('logic_driven');
  if (rec.certifiedBy?.includes('manufacturer')) cats.push('manufacturer_certified');
  if (rec.certifiedBy?.some(s => s === 'partsio_fff' || s === 'partsio_functional' || s === 'mouser'))
    cats.push('third_party_certified');
  return cats.length > 0 ? cats : ['logic_driven'];
}

/** Mutually-exclusive trust tier used by parts-list column counts.
 *  Priority: Accuris (parts.io) > Manufacturer > Logic. Mouser-only certified falls into Logic. */
export type RecommendationBucket = 'accuris' | 'manufacturer' | 'logic';

export function deriveRecommendationBucket(rec: XrefRecommendation): RecommendationBucket {
  const certs = rec.certifiedBy ?? [];
  if (certs.includes('partsio_fff') || certs.includes('partsio_functional')) return 'accuris';
  if (certs.includes('manufacturer')) return 'manufacturer';
  return 'logic';
}

export interface RecommendationCounts {
  logicDrivenCount: number;
  mfrCertifiedCount: number;
  accurisCertifiedCount: number;
}

export function computeRecommendationCounts(recs: XrefRecommendation[] | undefined): RecommendationCounts {
  const out: RecommendationCounts = { logicDrivenCount: 0, mfrCertifiedCount: 0, accurisCertifiedCount: 0 };
  if (!recs) return out;
  for (const r of recs) {
    const b = deriveRecommendationBucket(r);
    if (b === 'accuris') out.accurisCertifiedCount++;
    else if (b === 'manufacturer') out.mfrCertifiedCount++;
    else out.logicDrivenCount++;
  }
  return out;
}

/** A cross-reference recommendation */
export interface XrefRecommendation {
  part: Part;
  matchPercentage: number;
  matchDetails: MatchDetail[];
  notes?: string;
  dataSource?: 'digikey' | 'partsio' | 'atlas' | 'mock';
  /** Set when candidate came from parts.io FFF/Functional Equivalent fields */
  equivalenceType?: 'fff' | 'functional';
  /** Set when candidate came from a manufacturer cross-reference upload.
   *  Pin-to-pin is a stronger guarantee and sorts ahead of functional. */
  mfrEquivalenceType?: 'pin_to_pin' | 'functional';
  /** All external sources that independently verified this as a valid cross-reference */
  certifiedBy?: CertificationSource[];
  /** Secondary data source used for gap-fill enrichment */
  enrichedFrom?: 'partsio';
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
  dataSource?: 'digikey' | 'atlas' | 'partsio' | 'mouser';
}

export type SearchDataSource = 'digikey' | 'atlas' | 'partsio' | 'mouser';

export interface SearchResult {
  type: 'single' | 'multiple' | 'none';
  matches: PartSummary[];
  sourcesContributed?: SearchDataSource[];
}

// ── Service Status ──────────────────────────────────────────

export type ServiceName = 'digikey' | 'partsio' | 'mouser' | 'findchips' | 'anthropic' | 'atlas';
export type ServiceSeverity = 'degraded' | 'unavailable';

export interface ServiceWarning {
  service: ServiceName;
  severity: ServiceSeverity;
  message: string;
}

export type ServiceStatusLevel = 'operational' | 'degraded' | 'unavailable' | 'unknown';

export interface ServiceStatusInfo {
  service: ServiceName;
  status: ServiceStatusLevel;
  message?: string;
  lastChecked?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  serviceWarnings?: ServiceWarning[];
}

export type AppPhase =
  | 'idle'
  | 'searching'
  | 'resolving'
  | 'loading-attributes'
  | 'awaiting-attributes'
  | 'awaiting-context'
  | 'awaiting-action'
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

export interface ChoiceOption {
  id: string;
  label: string;
  action?: 'confirm_part' | 'find_replacements' | 'search' | 'other';
  mpn?: string;
  manufacturer?: string;
}

export type InteractiveElement =
  | { type: 'confirmation'; part: PartSummary }
  | { type: 'options'; parts: PartSummary[] }
  | { type: 'choices'; choices: ChoiceOption[] }
  | { type: 'attribute-query'; missingAttributes: MissingAttributeInfo[]; partMpn: string }
  | { type: 'context-questions'; questions: ContextQuestion[]; familyId: string; initialAnswers?: Record<string, string> }
  | { type: 'list-action'; action: PendingListAction; status: 'pending' | 'confirmed' | 'cancelled' };

// ── List Agent Types ─────────────────────────────────────────

export type PendingListAction =
  | { type: 'delete_rows'; rowIndices: number[]; reason: string }
  | { type: 'refresh_rows'; rowIndices: number[]; reason: string }
  | { type: 'set_preferred'; rowIndex: number; mpn: string; reason: string };

export type ListClientAction =
  | { type: 'sort'; columnId: string; direction: 'asc' | 'desc' }
  | { type: 'filter'; searchTerm: string }
  | { type: 'switch_view'; viewName: string };

export interface ListAgentContext {
  listId: string;
  listName: string;
  listDescription: string;
  listCustomer: string;
  currency: string;
  totalRows: number;
  statusCounts: Record<string, number>;
  topManufacturers: Array<{ name: string; count: number }>;
  topFamilies: Array<{ name: string; count: number }>;
  activeViewName: string;
  activeViewColumns: string[];
  viewNames: string[];
}

export interface ListAgentResponse {
  message: string;
  pendingAction?: PendingListAction;
  clientActions?: ListClientAction[];
}

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
// USER PREFERENCES
// ============================================================

/** Job function within the organization (not admin/user system role) */
export type BusinessRole =
  | 'design_engineer'
  | 'procurement_buyer'
  | 'supply_chain_manager'
  | 'engineering_manager'
  | 'quality_engineer'
  | 'contract_manufacturer'
  | 'consultant'
  | 'executive'
  | 'other';

/** @deprecated Old values kept for backward-compatible reads during migration */
export type LegacyBusinessRole = 'procurement' | 'supply_chain' | 'commodity_manager' | 'quality';

/** Industry vertical */
export type IndustryVertical =
  | 'automotive'
  | 'aerospace_defense'
  | 'medical'
  | 'industrial'
  | 'consumer_electronics'
  | 'telecom_networking'
  | 'energy'
  | 'other';

/** What the user's company produces */
export type ProductionType =
  | 'pcb_assemblies'
  | 'finished_consumer_products'
  | 'sub_assemblies_modules'
  | 'prototypes_rnd'
  | 'custom_contract_manufacturing'
  | 'other';

/** Production volume scale */
export type ProductionVolume =
  | 'prototype'
  | 'low_volume'
  | 'mid_volume'
  | 'high_volume'
  | 'varies';

/** Typical project phase when using the tool */
export type ProjectPhase =
  | 'early_design'
  | 'pre_production_npi'
  | 'volume_production'
  | 'sustaining_eol'
  | 'all_phases';

/** Primary goals when evaluating components */
export type UserGoal =
  | 'drop_in_replacements'
  | 'reduce_bom_cost'
  | 'manage_shortages'
  | 'reduce_sole_source'
  | 'qualify_compliance'
  | 'supply_chain_resilience'
  | 'streamline_procurement';

/** Curated country codes for manufacturing locations and shipping destinations */
export type CountryCode =
  | 'US' | 'CA' | 'MX' | 'BR'
  | 'DE' | 'FR' | 'GB' | 'NL' | 'IT' | 'PL' | 'SE'
  | 'CN' | 'TW' | 'JP' | 'KR' | 'IN' | 'VN' | 'TH' | 'MY' | 'SG' | 'PH' | 'ID'
  | 'IL' | 'AU' | 'TR';

/** @deprecated Manufacturing region — replaced by CountryCode-based locations */
export type ManufacturingRegion =
  | 'north_america'
  | 'europe'
  | 'greater_china'
  | 'japan_korea'
  | 'southeast_asia'
  | 'india'
  | 'other';

/** Compliance standards the user always requires */
export interface ComplianceDefaults {
  aecQ200?: boolean;    // Passive automotive
  aecQ101?: boolean;    // Discrete semiconductor automotive
  aecQ100?: boolean;    // IC automotive
  milStd?: boolean;     // Military/defense
  rohs?: boolean;
  reach?: boolean;
}

/** User preferences stored as JSONB in profiles table */
export interface UserPreferences {
  // Profile prompt (user-facing free-form text)
  profilePrompt?: string;
  onboardingComplete?: boolean;

  // Structured extraction (LLM-extracted from profilePrompt, not user-editable)
  businessRole?: BusinessRole;
  industries?: IndustryVertical[];
  /** @deprecated Use industries[] instead — kept for backward-compatible reads */
  industry?: IndustryVertical;
  productionTypes?: ProductionType[];
  productionVolume?: ProductionVolume;
  projectPhase?: ProjectPhase;
  goals?: UserGoal[];

  // Company Settings (user-editable form fields)
  preferredManufacturers?: string[];
  /** @deprecated UI removed — kept in type for backward compat */
  excludedManufacturers?: string[];
  complianceDefaults?: ComplianceDefaults;
  manufacturingLocations?: CountryCode[];
  shippingDestinations?: CountryCode[];
  /** @deprecated Use manufacturingLocations[] instead */
  manufacturingRegions?: ManufacturingRegion[];
  /** @deprecated UI removed — kept in type for backward compat */
  company?: string;

  // General Settings
  defaultCurrency?: string;
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
  choices?: ChoiceOption[];
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

// ── Atlas Manufacturer (DB/Admin-facing canonical record) ────

/** Full atlas_manufacturers row — the canonical manufacturer identity record */
export interface AtlasManufacturer {
  id: number;
  atlasId: number;
  slug: string;
  nameEn: string;
  nameZh: string | null;
  nameDisplay: string;
  aliases: string[];
  partsioId: number | null;
  partsioName: string | null;
  websiteUrl: string | null;
  logoUrl: string | null;
  headquarters: string | null;
  country: string;
  foundedYear: number | null;
  summary: string | null;
  isSecondSource: boolean;
  certifications: ManufacturerCertification[];
  manufacturingLocations: ManufacturerLocation[];
  productCategories: string[];
  authorizedDistributors: AuthorizedDistributor[];
  complianceFlags: string[];
  designResources: DesignResource[];
  enabled: boolean;
  // Profile enrichment fields (from Atlas external API)
  contactInfo: string | null;
  coreProducts: string | null;
  stockCode: string | null;
  gaiaId: string | null;
  apiSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Lightweight summary for manufacturer list views (admin panel) */
export interface AtlasManufacturerSummary {
  id: number;
  slug: string;
  nameEn: string;
  nameZh: string | null;
  nameDisplay: string;
  enabled: boolean;
  productCount: number;
  scorableCount: number;
  coveragePct: number;
}

// ============================================================
// PARTS LIST TYPES
// ============================================================

/** Status of an individual row during batch validation */
export type PartsListRowStatus = 'pending' | 'validating' | 'resolved' | 'not-found' | 'error';

/** Classification of a BOM line item — determines whether catalog validation is attempted */
export type PartType = 'electronic' | 'mechanical' | 'pcb' | 'custom' | 'other';

// ── Multi-Supplier Commercial Data ─────────────────────────

/** Dynamic distributor names from FindChips API + well-known constants.
 *  Well-known values: 'digikey', 'mouser', 'arrow', 'lcsc', 'farnell', 'newark', 'tme', 'rs' */
export type SupplierName = string;

/** A single price break from a supplier */
export interface PriceBreak {
  quantity: number;
  unitPrice: number;
  currency: string;
}

/** Pricing and availability from a single supplier */
export interface SupplierQuote {
  supplier: SupplierName;
  supplierPartNumber?: string;
  unitPrice?: number;
  priceBreaks: PriceBreak[];
  quantityAvailable?: number;
  availableOnOrder?: Array<{ quantity: number; date: string }>;
  leadTime?: string;
  productUrl?: string;
  fetchedAt: string;
  packageType?: string;      // e.g., "Cut Tape", "Reel", "Each" (from FindChips)
  minimumQuantity?: number;  // MOQ (from FindChips)
  authorized?: boolean;      // whether distributor is authorized (from FindChips)
}

/** Lifecycle intelligence from any source */
export interface LifecycleInfo {
  status?: string;
  isDiscontinued?: boolean;
  suggestedReplacement?: string;
  source: string;
  // FindChips risk scores (part-level, not distributor-specific)
  riskRank?: number;
  designRisk?: number;
  productionRisk?: number;
  longTermRisk?: number;
}

/** Regional compliance/trade data */
export interface ComplianceData {
  rohsStatus?: string;
  eccnCode?: string;
  htsCodesByRegion?: Record<string, string>;
  source: string;
}

/** Flattened, storage-friendly product data built during validation (from all sources) */
export interface EnrichedPartData {
  // Product Identification
  manufacturer?: string;
  digikeyPartNumber?: string;
  productUrl?: string;
  // Product Attributes
  category?: string;
  subcategory?: string;
  /** All parametric parameters: parameterId → { name, value, source } */
  parameters: Record<string, { name: string; value: string; source?: string }>;
  // Documentation
  datasheetUrl?: string;
  photoUrl?: string;
  // Commercial (Digikey)
  unitPrice?: number;
  quantityAvailable?: number;
  productStatus?: string;
  // Commercial (Parts.io)
  factoryLeadTimeWeeks?: number;
  // Compliance
  rohsStatus?: string;
  moistureSensitivityLevel?: string;
  reachCompliance?: string;
  qualifications?: string[];
  // Risk & Lifecycle (Parts.io)
  yteol?: number;
  riskRank?: number;
  partLifecycleCode?: string;
  // Trade & Export (Parts.io)
  countryOfOrigin?: string;
  eccnCode?: string;
  htsCode?: string;
  // Multi-supplier commercial data
  supplierQuotes?: SupplierQuote[];
  lifecycleInfo?: LifecycleInfo[];
  complianceData?: ComplianceData[];
}

/** A row from the uploaded parts list */
export interface PartsListRow {
  rowIndex: number;
  rawMpn: string;
  rawManufacturer: string;
  rawDescription: string;
  /** Customer Part Number (optional mapped column) */
  rawCpn?: string;
  /** Internal Part Number (optional mapped column) */
  rawIpn?: string;
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
  /** Mutually-exclusive bucket counts (Accuris > MFR > Logic). Persisted for list column display. */
  logicDrivenCount?: number;
  mfrCertifiedCount?: number;
  accurisCertifiedCount?: number;
  /** MPN explicitly chosen by user as preferred alternate — survives re-validation */
  preferredMpn?: string;
  /** Flattened Digikey data stored during validation */
  enrichedData?: EnrichedPartData;
  errorMessage?: string;
  /** BOM line item classification — undefined treated as 'electronic' */
  partType?: PartType;
}

/** Column mapping configuration */
export interface ColumnMapping {
  mpnColumn: number;
  manufacturerColumn: number;
  descriptionColumn: number;
  /** Optional Customer Part Number column */
  cpnColumn?: number;
  /** Optional Internal Part Number column */
  ipnColumn?: number;
}

/** Parsed spreadsheet data before column mapping */
export interface ParsedSpreadsheet {
  headers: string[];
  rows: string[][];
  fileName: string;
}

/** Manufacturer-certified cross-reference record (from Supabase) */
export interface ManufacturerCrossReference {
  id: string;
  manufacturer_slug: string;
  xref_mpn: string;
  xref_manufacturer?: string;
  xref_description?: string;
  original_mpn: string;
  original_manufacturer?: string;
  equivalence_type: 'pin_to_pin' | 'functional';
  upload_batch_id?: string;
  uploaded_by?: string;
  uploaded_at?: string;
  is_active: boolean;
}

/** Column mapping for cross-reference upload spreadsheets */
export interface CrossRefColumnMapping {
  xrefMpnColumn: number;
  xrefMfrColumn?: number;
  xrefDescColumn?: number;
  originalMpnColumn: number;
  originalMfrColumn?: number;
  equivalenceTypeColumn?: number;
}

/** Request body for the batch validate API */
export interface BatchValidateRequest {
  items: Array<{
    rowIndex: number;
    mpn: string;
    manufacturer?: string;
    description?: string;
    /** When true, skip searchParts() and go straight to getAttributes(). Use when MPN was already confirmed via search picker. */
    skipSearch?: boolean;
  }>;
  /** Currency code for pricing (e.g. 'USD', 'CNY'). Passed to Digikey API. */
  currency?: string;
  /** When true, bypass the recommendations L2 cache read so freshly recovered
   *  upstream services (e.g. parts.io after VPN reconnect) get incorporated.
   *  The computed result is still written back to cache. Use only for explicit
   *  user-initiated Refresh — NOT for initial validation (we want cache hits there). */
  forceRefresh?: boolean;
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
  /** L2 category names covering this subcategory (display-only param maps, no logic table) */
  l2Coverage?: string[];
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
    /** Number of subcategories with L2-only param map coverage */
    l2OnlySubcategories?: number;
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
  dataSource?: 'digikey' | 'partsio' | 'atlas' | 'mock';
  unsupportedFamily?: boolean;
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

/** A distributor click log entry (from the admin API) */
export interface DistributorClickEntry {
  id: string;
  userId: string;
  mpn: string;
  manufacturer: string;
  distributor: string;
  productUrl?: string;
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
// APP FEEDBACK (general user feedback about the app)
// ============================================================

export type AppFeedbackCategory = 'idea' | 'issue' | 'other';
export type AppFeedbackStatus = 'open' | 'reviewed' | 'resolved' | 'dismissed';

/** Payload for submitting new app feedback (client sends this) */
export interface AppFeedbackSubmission {
  category: AppFeedbackCategory;
  userComment: string;
  userAgent?: string;
  viewport?: string;
}

/** Full app feedback record from the database (admin reads this) */
export interface AppFeedbackRecord extends AppFeedbackSubmission {
  id: string;
  userId: string;
  status: AppFeedbackStatus;
  adminNotes?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** App feedback item for admin list view (enriched with user profile info) */
export interface AppFeedbackListItem extends AppFeedbackRecord {
  userEmail?: string;
  userName?: string;
  resolvedByName?: string;
}

/** Status count summary for app feedback filter badges */
export interface AppFeedbackStatusCounts {
  open: number;
  reviewed: number;
  resolved: number;
  dismissed: number;
}

/** Admin update payload for app feedback */
export interface AppFeedbackUpdate {
  status?: AppFeedbackStatus;
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

// ============================================================
// ADMIN OVERRIDE TYPES
// ============================================================

export type RuleOverrideAction = 'modify' | 'add' | 'remove';

export interface RuleOverrideRecord {
  id: string;
  familyId: string;
  attributeId: string;
  action: RuleOverrideAction;
  weight?: number;
  logicType?: LogicType;
  thresholdDirection?: ThresholdDirection;
  upgradeHierarchy?: string[];
  blockOnMissing?: boolean;
  tolerancePercent?: number;
  engineeringReason?: string;
  attributeName?: string;
  sortOrder?: number;
  previousValues?: Record<string, unknown> | null;
  isActive: boolean;
  changeReason: string;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RuleOverrideHistoryEntry extends RuleOverrideRecord {
  createdByName: string;
}

export interface RuleAnnotation {
  id: string;
  familyId: string;
  attributeId: string;
  body: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  isResolved: boolean;
  resolvedBy?: string;
  resolvedByName?: string;
  resolvedAt?: string;
}

export type ContextOverrideAction =
  | 'modify_question'
  | 'add_question'
  | 'disable_question'
  | 'add_option'
  | 'modify_option';

export interface ContextOverrideRecord {
  id: string;
  familyId: string;
  questionId: string;
  action: ContextOverrideAction;
  questionText?: string;
  priority?: number;
  required?: boolean;
  optionValue?: string;
  optionLabel?: string;
  optionDescription?: string;
  attributeEffects?: AttributeEffect[];
  isActive: boolean;
  changeReason: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type AtlasDictOverrideAction = 'modify' | 'add' | 'remove';

export interface AtlasDictOverrideRecord {
  id: string;
  familyId: string;
  paramName: string;
  action: AtlasDictOverrideAction;
  attributeId?: string;
  attributeName?: string;
  unit?: string;
  sortOrder?: number;
  isActive: boolean;
  changeReason: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** A release note post */
export interface ReleaseNote {
  id: string;
  content: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
