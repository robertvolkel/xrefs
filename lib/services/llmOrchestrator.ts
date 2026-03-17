import Anthropic from '@anthropic-ai/sdk';
import { SearchResult, PartAttributes, XrefRecommendation, OrchestratorMessage, OrchestratorResponse, ApplicationContext, UserPreferences } from '../types';
import { searchParts, getAttributes, getRecommendations } from './partDataService';
import { logRecommendation } from './recommendationLogger';
import { createClient } from '../supabase/server';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929';

// ==============================================================
// Shared: recommendation summary + filter tool
// ==============================================================

/** Build a compact text summary of recommendations for the system prompt */
function summarizeRecommendations(recs: XrefRecommendation[]): string {
  if (recs.length === 0) return '';

  const lines = recs.slice(0, 30).map((r, i) => {
    const issues = r.matchDetails
      .filter(d => d.ruleResult === 'review' || d.ruleResult === 'fail')
      .map(d => `${d.parameterName} (${d.ruleResult})`);
    const issueStr = issues.length > 0 ? ` | ${issues.join(', ')}` : '';
    return `${i + 1}. **${r.part.mpn}** | ${r.part.manufacturer} | ${r.matchPercentage}% match | ${r.part.status}${issueStr}`;
  });

  let summary = `\n\nCurrent replacement recommendations (${recs.length} total):\n${lines.join('\n')}`;
  if (recs.length > 30) {
    summary += `\n... and ${recs.length - 30} more`;
  }
  return summary;
}

const filterRecommendationsTool: Anthropic.Tool = {
  name: 'filter_recommendations',
  description: 'Filter and sort the current replacement recommendations. Use this when the user asks to narrow down by manufacturer, match quality, qualification, attribute values, or other criteria. Returns the filtered list and updates the UI.',
  input_schema: {
    type: 'object' as const,
    properties: {
      manufacturer_filter: {
        type: 'string',
        description: 'Case-insensitive partial match on manufacturer name (e.g. "TDK", "Panasonic")',
      },
      min_match_percentage: {
        type: 'number',
        description: 'Minimum match percentage threshold (e.g. 80)',
      },
      exclude_obsolete: {
        type: 'boolean',
        description: 'If true, hide obsolete/discontinued parts',
      },
      exclude_failing_parameters: {
        type: 'array',
        items: { type: 'string' },
        description: 'Exclude recommendations that have a "fail" result for any of these parameter names. Use the exact parameter names from the recommendation summary (e.g. ["AEC-Q200 Qualification"], ["Resistance", "Tolerance"]). Use this when the user asks for parts with specific qualifications or attributes.',
      },
      attribute_filters: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            parameter: { type: 'string', description: 'Parameter name to filter on (e.g. "Resistance", "Package / Case", "Voltage Rated")' },
            operator: { type: 'string', enum: ['equals', 'contains', 'gte', 'lte'], description: 'Comparison: equals (exact string), contains (substring), gte/lte (numeric ≥/≤)' },
            value: { type: 'string', description: 'Value to compare against. For gte/lte use plain numbers with optional SI prefix (e.g. "10k", "100u", "50")' },
          },
          required: ['parameter', 'operator', 'value'],
        },
        description: 'Filter by replacement part attribute values. Use when the user asks to filter by specific parameter values (e.g. "only parts over 10kΩ", "only 0603 packages", "voltage at least 50V").',
      },
      sort_by: {
        type: 'string',
        enum: ['match_percentage', 'manufacturer', 'price'],
        description: 'Sort order for the results',
      },
    },
    required: [],
  },
};

/** Extract a numeric value from a string, handling SI prefixes (e.g. "1 kOhms" → 1000, "10k" → 10000, "100µF" → 0.0001) */
function parseNumericFromString(s: string): number | null {
  const siPrefixes: Record<string, number> = {
    'p': 1e-12, 'n': 1e-9, 'u': 1e-6, 'µ': 1e-6,
    'm': 1e-3, 'k': 1e3, 'K': 1e3, 'M': 1e6, 'G': 1e9,
  };
  // Match number optionally followed by SI prefix (e.g. "10k", "1.5 µF", "100 kOhms")
  const match = s.match(/([-+]?\d*\.?\d+)\s*([pnuµmkKMG])?/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  if (isNaN(num)) return null;
  const prefix = match[2];
  // 'm' is ambiguous (milli vs mm/meters) — treat as milli only when not followed by 'm' (i.e. not "mm")
  if (prefix && siPrefixes[prefix]) {
    if (prefix === 'm') {
      const afterPrefix = s.slice((match.index ?? 0) + match[0].length);
      if (afterPrefix.startsWith('m')) return num; // "mm" — don't scale
    }
    return num * siPrefixes[prefix];
  }
  return num;
}

interface AttributeFilter {
  parameter: string;
  operator: 'equals' | 'contains' | 'gte' | 'lte';
  value: string;
}

interface FilterInput {
  manufacturer_filter?: string;
  min_match_percentage?: number;
  exclude_obsolete?: boolean;
  exclude_failing_parameters?: string[];
  attribute_filters?: AttributeFilter[];
  sort_by?: string;
}

/** Apply filter_recommendations tool input to a recommendations array */
function applyRecommendationFilter(
  recs: XrefRecommendation[],
  input: FilterInput,
): XrefRecommendation[] {
  let filtered = [...recs];

  if (input.manufacturer_filter) {
    const query = input.manufacturer_filter.toLowerCase();
    filtered = filtered.filter(r => r.part.manufacturer.toLowerCase().includes(query));
  }
  if (input.min_match_percentage != null) {
    filtered = filtered.filter(r => r.matchPercentage >= input.min_match_percentage!);
  }
  if (input.exclude_obsolete) {
    filtered = filtered.filter(r => r.part.status !== 'Obsolete');
  }
  if (input.exclude_failing_parameters && input.exclude_failing_parameters.length > 0) {
    const excludeNames = input.exclude_failing_parameters.map(n => n.toLowerCase());
    filtered = filtered.filter(r => {
      const failingNames = r.matchDetails
        .filter(d => d.ruleResult === 'fail')
        .map(d => d.parameterName.toLowerCase());
      return !excludeNames.some(name => failingNames.includes(name));
    });
  }
  if (input.attribute_filters && input.attribute_filters.length > 0) {
    for (const af of input.attribute_filters) {
      const paramLower = af.parameter.toLowerCase();
      filtered = filtered.filter(r => {
        const detail = r.matchDetails.find(d => d.parameterName.toLowerCase() === paramLower);
        if (!detail) return false; // no data for this parameter → exclude
        const repValue = detail.replacementValue;
        switch (af.operator) {
          case 'equals':
            return repValue.toLowerCase() === af.value.toLowerCase();
          case 'contains':
            return repValue.toLowerCase().includes(af.value.toLowerCase());
          case 'gte': {
            const repNum = parseNumericFromString(repValue);
            const targetNum = parseNumericFromString(af.value);
            if (repNum == null || targetNum == null) return false;
            return repNum >= targetNum;
          }
          case 'lte': {
            const repNum = parseNumericFromString(repValue);
            const targetNum = parseNumericFromString(af.value);
            if (repNum == null || targetNum == null) return false;
            return repNum <= targetNum;
          }
          default:
            return true;
        }
      });
    }
  }
  if (input.sort_by === 'manufacturer') {
    filtered.sort((a, b) => a.part.manufacturer.localeCompare(b.part.manufacturer));
  } else if (input.sort_by === 'price') {
    filtered.sort((a, b) => (a.part.unitPrice ?? Infinity) - (b.part.unitPrice ?? Infinity));
  } else {
    filtered.sort((a, b) => b.matchPercentage - a.matchPercentage);
  }

  return filtered;
}

// ==============================================================
// Locale → language name mapping for system prompt
// ==============================================================

const LOCALE_NAMES: Record<string, string> = {
  de: 'German',
  'zh-CN': 'Simplified Chinese',
};

/** Build a locale instruction to append to the system prompt */
function buildLocaleInstruction(locale?: string): string {
  if (!locale || locale === 'en') return '';
  const langName = LOCALE_NAMES[locale];
  if (!langName) return '';
  return `\n\nIMPORTANT — Language preference: The user's preferred language is ${langName} (${locale}). Respond entirely in ${langName}. Use standard ${langName} electronics engineering terminology. Keep universal technical abbreviations (MLCC, ESR, PSRR, MOSFET, LDO, BJT, IGBT, etc.) unchanged — do not translate acronyms or part numbers.`;
}

// ==============================================================
// User context → system prompt section
// ==============================================================

const ROLE_LABELS: Record<string, string> = {
  design_engineer: 'Design Engineer',
  procurement: 'Procurement / Buyer',
  supply_chain: 'Supply Chain',
  commodity_manager: 'Commodity Manager',
  quality: 'Quality Engineer',
  executive: 'Executive',
  other: 'Other',
};

const INDUSTRY_LABELS: Record<string, string> = {
  automotive: 'Automotive',
  aerospace_defense: 'Aerospace & Defense',
  medical: 'Medical',
  industrial: 'Industrial',
  consumer_electronics: 'Consumer Electronics',
  telecom_networking: 'Telecom & Networking',
  energy: 'Energy',
  other: 'Other',
};

const COMPLIANCE_LABELS: Record<string, string> = {
  aecQ200: 'AEC-Q200',
  aecQ101: 'AEC-Q101',
  aecQ100: 'AEC-Q100',
  milStd: 'MIL-STD',
  rohs: 'RoHS',
  reach: 'REACH',
};

const REGION_LABELS: Record<string, string> = {
  north_america: 'North America',
  europe: 'Europe',
  greater_china: 'Greater China',
  japan_korea: 'Japan/Korea',
  southeast_asia: 'Southeast Asia',
  india: 'India',
  other: 'Other',
};

/** Build a compact user context section for the system prompt */
function buildUserContextSection(prefs: UserPreferences, userName?: string): string {
  const lines: string[] = [];

  if (userName) lines.push(`- Name: ${userName}`);
  if (prefs.businessRole) lines.push(`- Role: ${ROLE_LABELS[prefs.businessRole] ?? prefs.businessRole}`);
  if (prefs.industry) lines.push(`- Industry: ${INDUSTRY_LABELS[prefs.industry] ?? prefs.industry}`);
  if (prefs.company) lines.push(`- Company: ${prefs.company}`);

  if (prefs.complianceDefaults) {
    const active = Object.entries(prefs.complianceDefaults)
      .filter(([, v]) => v)
      .map(([k]) => COMPLIANCE_LABELS[k] ?? k);
    if (active.length > 0) lines.push(`- Required compliance: ${active.join(', ')}`);
  }

  if (prefs.preferredManufacturers?.length) {
    lines.push(`- Preferred manufacturers: ${prefs.preferredManufacturers.join(', ')}`);
  }
  if (prefs.excludedManufacturers?.length) {
    lines.push(`- Excluded manufacturers: ${prefs.excludedManufacturers.join(', ')}`);
  }
  if (prefs.defaultCurrency && prefs.defaultCurrency !== 'USD') {
    lines.push(`- Currency: ${prefs.defaultCurrency}`);
  }
  if (prefs.manufacturingRegions?.length) {
    lines.push(`- Manufacturing regions: ${prefs.manufacturingRegions.map(r => REGION_LABELS[r] ?? r).join(', ')}`);
  }

  if (lines.length === 0) return '';

  return `\n\n## User Context\n${lines.join('\n')}`;
}

// ==============================================================
// Main chat
// ==============================================================

const SYSTEM_PROMPT = `You are Agent, an expert electronic component cross-reference assistant. You help engineers find equivalent or superior replacement parts from any manufacturer.

Your role:
- Help users identify specific parts from their queries
- Look up part attributes and find cross-reference replacements
- Provide engineering assessments of replacement candidates
- Be concise and technical — your users are electronics engineers

Workflow:
1. When a user provides a part number or description, use the search_parts tool to find matches.
2. If there's exactly one match, ask the user to confirm. If multiple, present them briefly.
3. When the user confirms a part, use get_part_attributes AND find_replacements. Call BOTH tools.
4. After receiving replacement results, provide an engineering assessment (see below).

Search result presentation:
- The UI renders interactive cards below your message, so DO NOT list or repeat each part's details in your text.
- For a single match: "I found **[MPN]** from [manufacturer]. Is this the part you need a replacement for?"
- For multiple matches: "I found [N] similar parts. Which one do you need a replacement for?" — nothing more. The cards show the rest.

Engineering Assessment (REQUIRED after find_replacements):
- State how many candidates were found and how many passed
- Highlight top 1–2 by MPN, manufacturer, and match percentage
- Note key differences or trade-offs
- Flag anything requiring manual engineering review
- 3–5 sentences max. Be direct and technical.

Supported component families (cross-reference logic available):
Block A — Passives: MLCC capacitors, mica capacitors, chip resistors, through-hole resistors, current sense resistors, chassis mount resistors, aluminum electrolytic capacitors, aluminum polymer capacitors, tantalum capacitors, supercapacitors, film capacitors, varistors/MOVs, PTC resettable fuses, NTC thermistors, PTC thermistors, common mode chokes, ferrite beads, power inductors, RF/signal inductors.
Block B — Discrete Semiconductors: Rectifier diodes (standard, fast, and ultrafast recovery).

If a part falls outside these families, clearly tell the user that the application does not yet support cross-referencing for that component category. Do NOT suggest "manual sourcing" or imply the search failed — state that the logic rules for that category haven't been built yet.

Formatting rules:
- Use bullet points (- item) for lists — never write long paragraphs.
- Use **bold** for part numbers, manufacturers, and key specs.
- Keep messages scannable: short sentences, line breaks between sections.
- No filler, no repetition. Engineers don't need hand-holding.

Important rules:
- Always use tools — never guess part numbers or specs.
- After confirming a part, ALWAYS call both get_part_attributes and find_replacements.
- If the user mentions a NEW part number during an ongoing conversation, start from step 1 — search it first, then ask the user to confirm. NEVER skip confirmation. Do NOT re-analyze or summarize previous results — the user has moved on to a new part.
- If the user mentions preferred manufacturers (e.g. "prefer ON Semiconductor, Vishay, or Nexperia"), extract those names and pass them as the preferred_manufacturers parameter when calling find_replacements. Parts from preferred manufacturers will be boosted in the ranking.

When User Context is provided:
- Adapt your communication style to the user's role: more technical depth for engineers, more commercial focus for procurement, more strategic framing for executives
- If the user has compliance defaults, proactively mention when recommendations do or don't meet those requirements
- If the user has preferred manufacturers, note when top recommendations come from their preferred list
- If the user has excluded manufacturers, never recommend parts from excluded manufacturers
- Manufacturing regions provide context for trade compliance — mention relevant considerations when applicable

You have access to the user's history through tools: get_my_recent_searches, get_my_lists, get_my_past_recommendations, and get_my_conversations. Use these ONLY when the user asks about their past activity, references a previous search, or when historical context would genuinely improve your response. Do NOT proactively fetch history on every conversation.`;

/** Tool definitions for Claude */
const tools: Anthropic.Tool[] = [
  {
    name: 'search_parts',
    description: 'Search for electronic components by part number, keyword, or description. Returns matching parts with MPN, manufacturer, and description.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'The part number, keyword, or description to search for',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_part_attributes',
    description: 'Get detailed parametric attributes for a specific part by its MPN. Returns full specs including capacitance/resistance values, voltage ratings, package info, temperature characteristics, etc.',
    input_schema: {
      type: 'object' as const,
      properties: {
        mpn: {
          type: 'string',
          description: 'The exact manufacturer part number (MPN)',
        },
      },
      required: ['mpn'],
    },
  },
  {
    name: 'find_replacements',
    description: 'Find cross-reference replacement candidates for a specific part. Uses the deterministic matching engine with logic table rules to evaluate candidates. Returns ranked recommendations with match percentages and detailed per-parameter comparison. If the user mentioned preferred manufacturers, pass them to boost those manufacturers in the ranking.',
    input_schema: {
      type: 'object' as const,
      properties: {
        mpn: {
          type: 'string',
          description: 'The MPN of the source part to find replacements for',
        },
        preferred_manufacturers: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of preferred manufacturer names extracted from the user query (e.g. ["ON Semiconductor", "Vishay", "Nexperia"]). Parts from these manufacturers will be boosted in ranking.',
        },
      },
      required: ['mpn'],
    },
  },
];

/** History tools for user awareness — query past searches, lists, recommendations */
const historyTools: Anthropic.Tool[] = [
  {
    name: 'get_my_recent_searches',
    description: 'Get the user\'s recent part searches. Shows what parts they\'ve looked up recently, with component categories and recommendation counts. Use this to understand the user\'s recent activity or remind them of past searches.',
    input_schema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Max results (default 10, max 25)' },
      },
      required: [],
    },
  },
  {
    name: 'get_my_lists',
    description: 'Get summaries of the user\'s parts lists (BOMs). Shows list names, descriptions, customer names, row counts, and resolved percentages. Use this when the user asks about their existing BOMs or wants to work on a specific list.',
    input_schema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Max results (default 10, max 25)' },
      },
      required: [],
    },
  },
  {
    name: 'get_my_past_recommendations',
    description: 'Get the user\'s past cross-reference recommendations. Shows source parts, family names, match counts, and data sources. Use this when the user wants to recall a previous recommendation or compare with current results.',
    input_schema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Max results (default 10, max 25)' },
        source_mpn: { type: 'string', description: 'Filter by source MPN (partial match)' },
        family_name: { type: 'string', description: 'Filter by component family name' },
      },
      required: [],
    },
  },
  {
    name: 'get_my_conversations',
    description: 'Get the user\'s past chat conversations. Shows titles, source parts, phases reached, and timestamps. Use this when the user references a past conversation or wants to continue where they left off.',
    input_schema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Max results (default 10, max 25)' },
      },
      required: [],
    },
  },
];

/** Tool result data extracted from tool calls */
interface ToolResultData {
  searchResult?: SearchResult;
  attributes: Record<string, PartAttributes>;
  recommendations: Record<string, XrefRecommendation[]>;
}

/** Execute a tool call and return the result + parsed data */
async function executeTool(
  name: string,
  input: Record<string, unknown>,
  data: ToolResultData,
  currentRecommendations?: XrefRecommendation[],
  userId?: string,
  userPreferences?: UserPreferences,
): Promise<string> {
  switch (name) {
    case 'search_parts': {
      const result = await searchParts((input as { query: string }).query);
      data.searchResult = result;
      return JSON.stringify(result);
    }
    case 'get_part_attributes': {
      const mpn = (input as { mpn: string }).mpn;
      const attrs = await getAttributes(mpn);
      if (!attrs) return JSON.stringify({ error: `Part ${mpn} not found` });
      data.attributes[mpn] = attrs;
      return JSON.stringify(attrs);
    }
    case 'find_replacements': {
      const findInput = input as { mpn: string; preferred_manufacturers?: string[] };
      const mpn = findInput.mpn;
      const result = await getRecommendations(mpn, undefined, undefined, undefined, findInput.preferred_manufacturers, userPreferences);
      const recs = result.recommendations;
      data.recommendations[mpn] = recs;

      // QC log (awaited to ensure it completes within request lifecycle)
      if (userId) {
        await logRecommendation({
          userId,
          sourceMpn: mpn,
          sourceManufacturer: result.sourceAttributes.part.manufacturer,
          familyId: result.familyId,
          familyName: result.familyName,
          recommendationCount: recs.length,
          requestSource: 'chat',
          dataSource: result.dataSource,
          snapshot: {
            sourceAttributes: result.sourceAttributes,
            recommendations: recs,
          },
        });
      }

      return JSON.stringify(recs.map(r => ({
        mpn: r.part.mpn,
        manufacturer: r.part.manufacturer,
        description: r.part.description,
        matchPercentage: r.matchPercentage,
        passed: r.matchPercentage > 0,
        notes: r.notes,
        keyDifferences: r.matchDetails
          .filter(d => d.matchStatus !== 'exact')
          .map(d => `${d.parameterName}: ${d.sourceValue} → ${d.replacementValue} (${d.matchStatus})`),
      })));
    }
    case 'filter_recommendations': {
      const filterInput = input as FilterInput;
      const sourceRecs = currentRecommendations ?? [];
      const filtered = applyRecommendationFilter(sourceRecs, filterInput);
      // Store the first MPN key we find, or use 'filtered'
      const key = Object.keys(data.recommendations)[0] ?? 'filtered';
      data.recommendations[key] = filtered;
      return JSON.stringify({
        total: sourceRecs.length,
        filtered: filtered.length,
        results: filtered.map(r => ({
          mpn: r.part.mpn,
          manufacturer: r.part.manufacturer,
          matchPercentage: r.matchPercentage,
          status: r.part.status,
        })),
      });
    }
    // ── History tools ──────────────────────────────────────────
    case 'get_my_recent_searches': {
      if (!userId) return JSON.stringify({ error: 'Not authenticated' });
      const limit = Math.min((input as { limit?: number }).limit || 10, 25);
      const supabase = await createClient();
      const { data: rows } = await supabase
        .from('search_history')
        .select('query, source_mpn, source_manufacturer, source_category, recommendation_count, phase_reached, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);
      return JSON.stringify(rows ?? []);
    }
    case 'get_my_lists': {
      if (!userId) return JSON.stringify({ error: 'Not authenticated' });
      const limit = Math.min((input as { limit?: number }).limit || 10, 25);
      const supabase = await createClient();
      const { data: rows } = await supabase
        .from('parts_lists')
        .select('id, name, description, currency, customer, total_rows, resolved_count, created_at, updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(limit);
      return JSON.stringify((rows ?? []).map(l => ({
        name: l.name,
        description: l.description,
        currency: l.currency,
        customer: l.customer,
        totalRows: l.total_rows,
        resolvedCount: l.resolved_count,
        resolvedPercent: l.total_rows > 0 ? Math.round((l.resolved_count / l.total_rows) * 100) : 0,
        updatedAt: l.updated_at,
      })));
    }
    case 'get_my_past_recommendations': {
      if (!userId) return JSON.stringify({ error: 'Not authenticated' });
      const inp = input as { limit?: number; source_mpn?: string; family_name?: string };
      const limit = Math.min(inp.limit || 10, 25);
      const supabase = await createClient();
      let query = supabase
        .from('recommendation_log')
        .select('source_mpn, source_manufacturer, family_id, family_name, recommendation_count, request_source, data_source, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (inp.source_mpn) query = query.ilike('source_mpn', `%${inp.source_mpn}%`);
      if (inp.family_name) query = query.ilike('family_name', `%${inp.family_name}%`);
      const { data: rows } = await query;
      return JSON.stringify(rows ?? []);
    }
    case 'get_my_conversations': {
      if (!userId) return JSON.stringify({ error: 'Not authenticated' });
      const limit = Math.min((input as { limit?: number }).limit || 10, 25);
      const supabase = await createClient();
      const { data: rows } = await supabase
        .from('conversations')
        .select('id, title, source_mpn, phase, created_at, updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(limit);
      return JSON.stringify(rows ?? []);
    }
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

/**
 * Run the LLM orchestrator with a conversation history.
 * Handles the full tool-use loop: send message → tool calls → tool results → final response.
 * Returns both Claude's message AND structured data extracted from tool calls.
 */
export async function chat(
  messages: OrchestratorMessage[],
  apiKey: string,
  currentRecommendations?: XrefRecommendation[],
  userId?: string,
  locale?: string,
  userPreferences?: UserPreferences,
  userName?: string,
): Promise<OrchestratorResponse> {
  const client = new Anthropic({ apiKey });

  const anthropicMessages: Anthropic.MessageParam[] = messages.map(m => ({
    role: m.role,
    content: m.content,
  }));

  // Collect structured data from tool calls
  const toolData: ToolResultData = {
    attributes: {},
    recommendations: {},
  };

  // Build system prompt — append user context, recommendation context + locale
  let systemPrompt = SYSTEM_PROMPT
    + buildUserContextSection(userPreferences ?? {}, userName)
    + buildLocaleInstruction(locale);
  const activeTools = [...tools, ...historyTools];
  if (currentRecommendations && currentRecommendations.length > 0) {
    systemPrompt += summarizeRecommendations(currentRecommendations);
    systemPrompt += '\n\nYou also have a filter_recommendations tool to narrow down the list by manufacturer, match quality, etc. Use it when the user asks to filter or sort the existing results.';
    activeTools.push(filterRecommendationsTool);
  }

  // Tool-use loop: keep going until Claude gives a final text response
  const chatStart = performance.now();
  let llmCallCount = 0;

  llmCallCount++;
  console.time(`[perf] LLM call #${llmCallCount}`);
  let response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: systemPrompt,
    tools: activeTools,
    messages: anthropicMessages,
  });
  console.timeEnd(`[perf] LLM call #${llmCallCount}`);

  while (response.stop_reason === 'tool_use') {
    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    );

    anthropicMessages.push({
      role: 'assistant',
      content: response.content,
    });

    const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
      toolUseBlocks.map(async (toolUse) => {
        console.time(`[perf] tool:${toolUse.name}`);
        const result = await executeTool(
          toolUse.name,
          toolUse.input as Record<string, unknown>,
          toolData,
          currentRecommendations,
          userId,
          userPreferences,
        );
        console.timeEnd(`[perf] tool:${toolUse.name}`);
        return {
          type: 'tool_result' as const,
          tool_use_id: toolUse.id,
          content: result,
        };
      })
    );

    anthropicMessages.push({
      role: 'user',
      content: toolResults,
    });

    llmCallCount++;
    console.time(`[perf] LLM call #${llmCallCount}`);
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      tools: activeTools,
      messages: anthropicMessages,
    });
    console.timeEnd(`[perf] LLM call #${llmCallCount}`);
  }

  console.log(`[perf] chat() total: ${(performance.now() - chatStart).toFixed(0)}ms (${llmCallCount} LLM calls)`);

  // Extract the final text response
  const textBlocks = response.content.filter(
    (block): block is Anthropic.TextBlock => block.type === 'text'
  );
  const message = textBlocks.map(b => b.text).join('\n');

  // Build response with structured data
  const result: OrchestratorResponse = { message };

  if (toolData.searchResult) {
    result.searchResult = toolData.searchResult;
  }
  if (Object.keys(toolData.attributes).length > 0) {
    result.attributes = toolData.attributes;
  }
  if (Object.keys(toolData.recommendations).length > 0) {
    result.recommendations = toolData.recommendations;
  }

  return result;
}

// ==============================================================
// REFINEMENT CHAT — for the modal context
// ==============================================================

function buildRefinementSystemPrompt(
  mpn: string,
  overrides: Record<string, string>,
  applicationContext?: ApplicationContext,
  recommendations?: XrefRecommendation[],
): string {
  let prompt = `You are a cross-reference refinement assistant helping an engineer evaluate replacement candidates for **${mpn}**.

Your role:
- Answer questions about the current replacement recommendations
- Help the user understand trade-offs between candidates
- Filter or narrow down the recommendations when the user asks (use filter_recommendations)
- Re-run the matching engine with adjusted parameters when the user provides new constraints (use refine_replacements)
- Be concise and technical — your users are electronics engineers

Tool usage:
- Use filter_recommendations when the user wants to narrow the existing list (e.g. "show only TDK", "hide obsolete parts", "only parts with >80% match")
- Use refine_replacements when the user provides a NEW requirement that changes how parts are evaluated (e.g. "I need AEC-Q200 compliance", "voltage must be 50V")
- Do NOT use any tool for general questions — answer from context.`;

  if (Object.keys(overrides).length > 0) {
    prompt += `\n\nUser-provided attribute overrides:\n${JSON.stringify(overrides, null, 2)}`;
  }
  if (applicationContext) {
    prompt += `\n\nApplication context answers:\n${JSON.stringify(applicationContext.answers, null, 2)}`;
  }
  if (recommendations && recommendations.length > 0) {
    prompt += summarizeRecommendations(recommendations);
  }

  prompt += `\n\nFormatting rules:
- Use bullet points (- item) for lists — never write long paragraphs
- Use **bold** for part numbers, manufacturers, and key specs
- Keep messages scannable: short sentences, line breaks between sections
- No filler, no repetition. Engineers don't need hand-holding.`;

  return prompt;
}

const refinementTools: Anthropic.Tool[] = [
  {
    name: 'refine_replacements',
    description: 'Re-run the matching engine for the source part with optional attribute overrides and application context. Use this when the user provides new requirements or wants to change evaluation criteria.',
    input_schema: {
      type: 'object' as const,
      properties: {
        attribute_overrides: {
          type: 'object',
          description: 'Key-value map of attribute IDs to override values (e.g. { "voltage_rating": "50V" })',
          additionalProperties: { type: 'string' },
        },
        context_answers: {
          type: 'object',
          description: 'Key-value map of context question IDs to answer values',
          additionalProperties: { type: 'string' },
        },
      },
      required: [],
    },
  },
];

/**
 * Run the refinement chat for the modal context.
 * Focused on a single part — helps users refine replacement recommendations.
 */
export async function refinementChat(
  messages: OrchestratorMessage[],
  mpn: string,
  overrides: Record<string, string>,
  applicationContext: ApplicationContext | undefined,
  apiKey: string,
  currentRecommendations?: XrefRecommendation[],
  userId?: string,
  locale?: string,
  userPreferences?: UserPreferences,
  userName?: string,
): Promise<OrchestratorResponse> {
  const client = new Anthropic({ apiKey });
  const systemPrompt = buildRefinementSystemPrompt(mpn, overrides, applicationContext, currentRecommendations)
    + buildUserContextSection(userPreferences ?? {}, userName)
    + buildLocaleInstruction(locale);

  const activeTools: Anthropic.Tool[] = [...refinementTools];
  if (currentRecommendations && currentRecommendations.length > 0) {
    activeTools.push(filterRecommendationsTool);
  }

  const anthropicMessages: Anthropic.MessageParam[] = messages.map(m => ({
    role: m.role,
    content: m.content,
  }));

  const toolData: ToolResultData = {
    attributes: {},
    recommendations: {},
  };

  let response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: systemPrompt,
    tools: activeTools,
    messages: anthropicMessages,
  });

  while (response.stop_reason === 'tool_use') {
    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    );

    anthropicMessages.push({
      role: 'assistant',
      content: response.content,
    });

    const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
      toolUseBlocks.map(async (toolUse) => {
        if (toolUse.name === 'filter_recommendations') {
          const filterInput = toolUse.input as FilterInput;
          const sourceRecs = currentRecommendations ?? [];
          const filtered = applyRecommendationFilter(sourceRecs, filterInput);
          toolData.recommendations[mpn] = filtered;
          return {
            type: 'tool_result' as const,
            tool_use_id: toolUse.id,
            content: JSON.stringify({
              total: sourceRecs.length,
              filtered: filtered.length,
              results: filtered.map(r => ({
                mpn: r.part.mpn,
                manufacturer: r.part.manufacturer,
                matchPercentage: r.matchPercentage,
                status: r.part.status,
              })),
            }),
          };
        }

        // refine_replacements tool
        const input = toolUse.input as { attribute_overrides?: Record<string, string>; context_answers?: Record<string, string> };

        const mergedOverrides = { ...overrides, ...(input.attribute_overrides ?? {}) };

        let mergedContext = applicationContext;
        if (input.context_answers && Object.keys(input.context_answers).length > 0) {
          const existingAnswers = applicationContext?.answers ?? {};
          mergedContext = {
            familyId: applicationContext?.familyId ?? '',
            answers: { ...existingAnswers, ...input.context_answers },
          };
        }

        const refineResult = await getRecommendations(mpn, mergedOverrides, mergedContext);
        const recs = refineResult.recommendations;
        toolData.recommendations[mpn] = recs;

        // QC log (awaited to ensure it completes within request lifecycle)
        if (userId) {
          await logRecommendation({
            userId,
            sourceMpn: mpn,
            sourceManufacturer: refineResult.sourceAttributes.part.manufacturer,
            familyId: refineResult.familyId,
            familyName: refineResult.familyName,
            recommendationCount: recs.length,
            requestSource: 'chat',
            dataSource: refineResult.dataSource,
            snapshot: {
              sourceAttributes: refineResult.sourceAttributes,
              recommendations: recs,
              contextAnswers: mergedContext,
              attributeOverrides: mergedOverrides,
            },
          });
        }

        return {
          type: 'tool_result' as const,
          tool_use_id: toolUse.id,
          content: JSON.stringify(recs.map(r => ({
            mpn: r.part.mpn,
            manufacturer: r.part.manufacturer,
            matchPercentage: r.matchPercentage,
            passed: r.matchPercentage > 0,
            keyDifferences: r.matchDetails
              .filter(d => d.matchStatus !== 'exact')
              .map(d => `${d.parameterName}: ${d.sourceValue} → ${d.replacementValue} (${d.matchStatus})`),
          }))),
        };
      })
    );

    anthropicMessages.push({
      role: 'user',
      content: toolResults,
    });

    response = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      tools: activeTools,
      messages: anthropicMessages,
    });
  }

  const textBlocks = response.content.filter(
    (block): block is Anthropic.TextBlock => block.type === 'text'
  );
  const message = textBlocks.map(b => b.text).join('\n');

  const result: OrchestratorResponse = { message };
  if (Object.keys(toolData.recommendations).length > 0) {
    result.recommendations = toolData.recommendations;
  }

  return result;
}
