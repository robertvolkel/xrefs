#!/usr/bin/env node

/**
 * XRefs MCP Client — thin MCP server that proxies to the XRefs REST API.
 *
 * Gives any MCP-compatible AI agent (Claude Desktop, Cursor, etc.) native
 * tool access to the XRefs component intelligence engine.
 *
 * Environment variables:
 *   XREFS_API_URL  — Base URL of your XRefs deployment (e.g., https://xrefs.example.com)
 *   XREFS_API_KEY  — Bearer token for API authentication
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API_URL = process.env.XREFS_API_URL?.replace(/\/$/, '');
const API_KEY = process.env.XREFS_API_KEY;

if (!API_URL || !API_KEY) {
  process.stderr.write(
    'Error: XREFS_API_URL and XREFS_API_KEY environment variables are required.\n'
  );
  process.exit(1);
}

// --- HTTP helper ---

async function api(method, path, body) {
  const url = `${API_URL}${path}`;
  const options = {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(url, options);
  const json = await res.json();

  if (!json.success) {
    throw new Error(json.error || `API error (HTTP ${res.status})`);
  }
  return json.data;
}

// --- MCP Server ---

const server = new McpServer({
  name: 'xrefs',
  version: '1.0.0',
});

// 1. Search Parts
server.registerTool(
  'search_parts',
  {
    title: 'Search Electronic Parts',
    description:
      'Search for electronic components by part number or keyword. ' +
      'Returns matching parts with manufacturer, description, category, and lifecycle status.',
    inputSchema: z.object({
      query: z
        .string()
        .describe('Part number, description, or keyword (e.g., "GRM155R71C104KA88D", "100nF 0402 MLCC")'),
    }),
    annotations: { readOnlyHint: true },
  },
  async ({ query }) => {
    const data = await api('POST', '/api/search', { query });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// 2. Get Part Attributes
server.registerTool(
  'get_part_attributes',
  {
    title: 'Get Part Attributes',
    description:
      'Retrieve full parametric attributes for a specific manufacturer part number. ' +
      'Returns electrical, physical, and compliance parameters.',
    inputSchema: z.object({
      mpn: z
        .string()
        .describe('Manufacturer Part Number (e.g., "GRM155R71C104KA88D", "IRFZ44N")'),
    }),
    annotations: { readOnlyHint: true },
  },
  async ({ mpn }) => {
    const data = await api('GET', `/api/attributes/${encodeURIComponent(mpn)}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// 3. Find Replacements
server.registerTool(
  'find_replacements',
  {
    title: 'Find Cross-Reference Replacements',
    description:
      'Find scored replacement parts for a given MPN using a deterministic rule engine. ' +
      'Returns ranked candidates with per-parameter match details. ' +
      'Covers 43 component families. Use get_context_questions first to improve scoring accuracy.',
    inputSchema: z.object({
      mpn: z.string().describe('Source part number to find replacements for'),
      applicationContextJson: z
        .string()
        .optional()
        .describe(
          'JSON string with context from get_context_questions. ' +
          'Format: {"familyId":"12","answers":{"q1":"value","q2":"value"}}'
        ),
      overridesJson: z
        .string()
        .optional()
        .describe(
          'JSON string with attribute corrections. ' +
          'Format: {"capacitance_f":"100nF","voltage_rating_v":"50"}'
        ),
    }),
    annotations: { readOnlyHint: true },
  },
  async ({ mpn, applicationContextJson, overridesJson }) => {
    const hasBody = applicationContextJson || overridesJson;

    if (hasBody) {
      const body = {};
      if (applicationContextJson) body.applicationContext = JSON.parse(applicationContextJson);
      if (overridesJson) body.overrides = JSON.parse(overridesJson);
      const data = await api('POST', `/api/xref/${encodeURIComponent(mpn)}`, body);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }

    const data = await api('GET', `/api/xref/${encodeURIComponent(mpn)}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// 4. List Supported Families
server.registerTool(
  'list_supported_families',
  {
    title: 'List Supported Component Families',
    description:
      'List all 43 supported component families with IDs, categories, rule counts, and last-updated dates. ' +
      'Use family IDs with get_context_questions and find_replacements.',
    inputSchema: z.object({
      category: z
        .string()
        .optional()
        .describe('Filter by category (e.g., "Passives", "Discrete Semiconductors")'),
    }),
    annotations: { readOnlyHint: true },
  },
  async ({ category }) => {
    const query = category ? `?category=${encodeURIComponent(category)}` : '';
    const data = await api('GET', `/api/families${query}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// 5. Get Context Questions
server.registerTool(
  'get_context_questions',
  {
    title: 'Get Application Context Questions',
    description:
      'Get per-family application context questions that refine cross-reference scoring. ' +
      'Pass answers to find_replacements as applicationContextJson to improve recommendation accuracy.',
    inputSchema: z.object({
      familyId: z
        .string()
        .describe('Family ID from list_supported_families (e.g., "12" for MLCC, "B5" for MOSFETs)'),
    }),
    annotations: { readOnlyHint: true },
  },
  async ({ familyId }) => {
    const data = await api('GET', `/api/families/${encodeURIComponent(familyId)}/context`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// --- Start ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('XRefs MCP client started (proxying to REST API)\n');
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err}\n`);
  process.exit(1);
});
