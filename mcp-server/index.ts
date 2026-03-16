#!/usr/bin/env node

// Load environment variables before any service imports
import { loadEnvLocal } from './lib/envLoader.js';
loadEnvLocal();

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { searchPartsSchema, searchPartsTool } from './tools/searchParts.js';
import { getPartAttributesSchema, getPartAttributesTool } from './tools/getPartAttributes.js';
import { findReplacementsSchema, findReplacementsTool } from './tools/findReplacements.js';
import { listSupportedFamiliesSchema, listSupportedFamiliesTool } from './tools/listSupportedFamilies.js';
import { getContextQuestionsSchema, getContextQuestionsTool } from './tools/getContextQuestions.js';

const server = new McpServer({
  name: 'xrefs',
  version: '1.0.0',
});

// --- Static tools (in-memory, no external API calls) ---

server.registerTool('list_supported_families', {
  title: 'List Supported Component Families',
  description:
    'List all 43 supported component families with their IDs, categories, rule counts, and last-updated dates. ' +
    'Use family IDs with get_context_questions and find_replacements. ' +
    'Optionally filter by category (e.g., "Passives", "Discrete Semiconductors", "Voltage Regulators").',
  inputSchema: listSupportedFamiliesSchema,
  annotations: { readOnlyHint: true },
}, listSupportedFamiliesTool);

server.registerTool('get_context_questions', {
  title: 'Get Application Context Questions',
  description:
    'Get per-family application context questions that refine cross-reference scoring. ' +
    'Each question has predefined options with effects on matching rule weights. ' +
    'Pass answers to find_replacements as applicationContextJson to improve recommendation accuracy.',
  inputSchema: getContextQuestionsSchema,
  annotations: { readOnlyHint: true },
}, getContextQuestionsTool);

// --- Live data tools (external API calls to Digikey, Atlas, parts.io) ---

server.registerTool('search_parts', {
  title: 'Search Electronic Parts',
  description:
    'Search for electronic components by part number or keyword. ' +
    'Returns matching parts from Digikey and Atlas databases with manufacturer, description, category, and lifecycle status.',
  inputSchema: searchPartsSchema,
  annotations: { readOnlyHint: true },
}, searchPartsTool);

server.registerTool('get_part_attributes', {
  title: 'Get Part Attributes',
  description:
    'Retrieve full parametric attributes for a specific manufacturer part number. ' +
    'Uses Digikey as the primary source with parts.io gap-fill enrichment and Atlas fallback. ' +
    'Returns electrical, physical, and compliance parameters.',
  inputSchema: getPartAttributesSchema,
  annotations: { readOnlyHint: true },
}, getPartAttributesTool);

server.registerTool('find_replacements', {
  title: 'Find Cross-Reference Replacements',
  description:
    'Find scored replacement parts for a given MPN using a deterministic rule engine. ' +
    'Returns ranked candidates with per-parameter match details (pass/fail/upgrade/review for each rule). ' +
    'Covers 43 component families across passives, discrete semiconductors, ICs, crystals, fuses, optocouplers, and relays. ' +
    'Use get_context_questions first to get application-specific questions that improve scoring accuracy.',
  inputSchema: findReplacementsSchema,
  annotations: { readOnlyHint: true },
}, findReplacementsTool);

// --- Start server ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server is now running — stdout is reserved for MCP protocol
  // Use stderr for any debug output
  process.stderr.write('XRefs MCP server started\n');
}

main().catch((err) => {
  process.stderr.write(`XRefs MCP server fatal error: ${err}\n`);
  process.exit(1);
});
