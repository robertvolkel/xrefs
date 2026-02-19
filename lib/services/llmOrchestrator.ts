import Anthropic from '@anthropic-ai/sdk';
import { SearchResult, PartAttributes, XrefRecommendation, OrchestratorMessage, OrchestratorResponse, ApplicationContext } from '../types';
import { searchParts, getAttributes, getRecommendations } from './partDataService';

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
  description: 'Filter and sort the current replacement recommendations. Use this when the user asks to narrow down by manufacturer, match quality, or other criteria. Returns the filtered list and updates the UI.',
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
      sort_by: {
        type: 'string',
        enum: ['match_percentage', 'manufacturer', 'price'],
        description: 'Sort order for the results',
      },
    },
    required: [],
  },
};

/** Apply filter_recommendations tool input to a recommendations array */
function applyRecommendationFilter(
  recs: XrefRecommendation[],
  input: { manufacturer_filter?: string; min_match_percentage?: number; exclude_obsolete?: boolean; sort_by?: string },
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
MLCC capacitors, chip resistors, aluminum electrolytic capacitors, tantalum capacitors, supercapacitors, film capacitors, NTC thermistors, PTC thermistors, common mode chokes, ferrite beads, power inductors.

If a part falls outside these families, clearly tell the user that the application does not yet support cross-referencing for that component category. Do NOT suggest "manual sourcing" or imply the search failed — state that the logic rules for that category haven't been built yet.

Formatting rules:
- Use bullet points (- item) for lists — never write long paragraphs.
- Use **bold** for part numbers, manufacturers, and key specs.
- Keep messages scannable: short sentences, line breaks between sections.
- No filler, no repetition. Engineers don't need hand-holding.

Important rules:
- Always use tools — never guess part numbers or specs.
- After confirming a part, ALWAYS call both get_part_attributes and find_replacements.
- If the user mentions a NEW part number during an ongoing conversation, start from step 1 — search it first, then ask the user to confirm. NEVER skip confirmation. Do NOT re-analyze or summarize previous results — the user has moved on to a new part.`;

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
    description: 'Find cross-reference replacement candidates for a specific part. Uses the deterministic matching engine with logic table rules to evaluate candidates. Returns ranked recommendations with match percentages and detailed per-parameter comparison.',
    input_schema: {
      type: 'object' as const,
      properties: {
        mpn: {
          type: 'string',
          description: 'The MPN of the source part to find replacements for',
        },
      },
      required: ['mpn'],
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
      const mpn = (input as { mpn: string }).mpn;
      const recs = await getRecommendations(mpn);
      data.recommendations[mpn] = recs;
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
      const filterInput = input as { manufacturer_filter?: string; min_match_percentage?: number; exclude_obsolete?: boolean; sort_by?: string };
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

  // Build system prompt — append recommendation context if available
  let systemPrompt = SYSTEM_PROMPT;
  const activeTools = [...tools];
  if (currentRecommendations && currentRecommendations.length > 0) {
    systemPrompt += summarizeRecommendations(currentRecommendations);
    systemPrompt += '\n\nYou also have a filter_recommendations tool to narrow down the list by manufacturer, match quality, etc. Use it when the user asks to filter or sort the existing results.';
    activeTools.push(filterRecommendationsTool);
  }

  // Tool-use loop: keep going until Claude gives a final text response
  let response = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
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
        const result = await executeTool(
          toolUse.name,
          toolUse.input as Record<string, unknown>,
          toolData,
          currentRecommendations,
        );
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

    response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2048,
      system: systemPrompt,
      tools: activeTools,
      messages: anthropicMessages,
    });
  }

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
): Promise<OrchestratorResponse> {
  const client = new Anthropic({ apiKey });
  const systemPrompt = buildRefinementSystemPrompt(mpn, overrides, applicationContext, currentRecommendations);

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
    model: 'claude-sonnet-4-5-20250929',
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
          const filterInput = toolUse.input as { manufacturer_filter?: string; min_match_percentage?: number; exclude_obsolete?: boolean; sort_by?: string };
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

        const recs = await getRecommendations(mpn, mergedOverrides, mergedContext);
        toolData.recommendations[mpn] = recs;

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
      model: 'claude-sonnet-4-5-20250929',
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
