import Anthropic from '@anthropic-ai/sdk';
import { SearchResult, PartAttributes, XrefRecommendation, OrchestratorMessage, OrchestratorResponse } from '../types';
import { searchParts, getAttributes, getRecommendations } from './partDataService';

const SYSTEM_PROMPT = `You are XRefs, an expert electronic component cross-reference assistant. You help engineers find replacement parts — specifically Chinese-manufactured alternatives to western components.

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

Important rules:
- Always use tools — never guess part numbers or specs.
- After confirming a part, ALWAYS call both get_part_attributes and find_replacements.
- Keep ALL messages short. No filler, no repetition. Engineers don't need hand-holding.`;

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
  input: Record<string, string>,
  data: ToolResultData
): Promise<string> {
  switch (name) {
    case 'search_parts': {
      const result = await searchParts(input.query);
      data.searchResult = result;
      return JSON.stringify(result);
    }
    case 'get_part_attributes': {
      const attrs = await getAttributes(input.mpn);
      if (!attrs) return JSON.stringify({ error: `Part ${input.mpn} not found` });
      data.attributes[input.mpn] = attrs;
      return JSON.stringify(attrs);
    }
    case 'find_replacements': {
      const recs = await getRecommendations(input.mpn);
      data.recommendations[input.mpn] = recs;
      // Return a summary for Claude (full data goes to the client via toolResultData)
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
  apiKey: string
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

  // Tool-use loop: keep going until Claude gives a final text response
  let response = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    tools,
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
          toolUse.input as Record<string, string>,
          toolData
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
      system: SYSTEM_PROMPT,
      tools,
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
