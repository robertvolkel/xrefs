# XRefs API Integration Guide

XRefs is a component intelligence engine that finds equivalent replacement parts for electronic components. It covers 43 component families across passives, discrete semiconductors, ICs, crystals, fuses, optocouplers, and relays.

This guide explains how to integrate the XRefs API into your product.

## Authentication

All endpoints require a Bearer token in the `Authorization` header:

```
Authorization: Bearer YOUR_API_KEY
```

API keys are issued per integration. Each key is a plain string (e.g., `xrefs_abc123...`). To add a key, the XRefs admin appends it to the `XREFS_API_KEYS` environment variable (comma-separated).

## Base URL

```
https://YOUR_DEPLOYMENT_URL
```

## Endpoints

### Search Parts

Find components by part number or keyword.

```
POST /api/search
```

**Request:**

```json
{
  "query": "GRM155R71C104KA88D"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | Yes | Part number, description, or keyword |

**Response:**

```json
{
  "success": true,
  "data": {
    "type": "single",
    "matches": [
      {
        "mpn": "GRM155R71C104KA88D",
        "manufacturer": "Murata",
        "description": "Cap Ceramic 0.1uF 50V X7R 0402",
        "category": "Capacitors",
        "status": "Active",
        "qualifications": ["AEC-Q200"]
      }
    ]
  }
}
```

The `type` field indicates the search outcome:
- `"single"` — Exact match found
- `"multiple"` — Multiple matches (refine your query)
- `"none"` — No matches

---

### Get Part Attributes

Retrieve full parametric data for a specific part number.

```
GET /api/attributes/{mpn}
```

The MPN must be URL-encoded (e.g., `BC847CW%2C115` for `BC847CW,115`).

**Response:**

```json
{
  "success": true,
  "data": {
    "part": {
      "mpn": "GRM155R71C104KA88D",
      "manufacturer": "Murata Electronics",
      "description": "Cap Ceramic 0.1uF 50V X7R 0402",
      "detailedDescription": "0.1 µF ±10% 50V Ceramic Capacitor X7R 0402",
      "category": "Capacitors",
      "subcategory": "Ceramic Capacitors",
      "status": "Active",
      "datasheetUrl": "https://...",
      "unitPrice": 0.01,
      "quantityAvailable": 500000,
      "rohsStatus": "RoHS Compliant"
    },
    "parameters": [
      {
        "parameterId": "capacitance_f",
        "parameterName": "Capacitance",
        "value": "100nF",
        "numericValue": 1e-7,
        "unit": "F",
        "sortOrder": 1,
        "source": "digikey"
      },
      {
        "parameterId": "voltage_rating_v",
        "parameterName": "Voltage Rating",
        "value": "50V",
        "numericValue": 50,
        "unit": "V",
        "sortOrder": 2,
        "source": "digikey"
      }
    ],
    "dataSource": "digikey",
    "partCapabilities": {
      "replacements": {
        "logic": true,
        "mfrCertified": false,
        "partsioCertified": true,
        "mouserSuggested": false
      },
      "mfrProfile": true,
      "bestPrice": true
    }
  }
}
```

Returns HTTP 404 with `{ "success": false, "error": "Part not found" }` if the MPN is unknown.

The `partCapabilities` object signals which downstream actions will productively return data for this part. Use it to gate UI affordances and avoid dead-end calls. Each flag is independent:

| Field | Meaning |
|-------|---------|
| `replacements.logic` | A logic table exists for the part's family (one of the 43 encoded families) |
| `replacements.mfrCertified` | Admin-uploaded manufacturer cross-references exist for this MPN |
| `replacements.partsioCertified` | Parts.io has FFF or Functional Equivalent MPNs for this part |
| `replacements.mouserSuggested` | Mouser SuggestedReplacement is populated (typically EOL parts) |
| `mfrProfile` | A manufacturer profile is on file (Atlas-resolved or mock fallback) — `get_manufacturer_profile` / `/api/manufacturer-profile` will return content |
| `bestPrice` | At least one supplier has price-break data — clients can offer a best-price-at-quantity affordance |

If all four `replacements.*` are `false`, calling `GET/POST /api/xref/{mpn}` will return zero or near-zero results. Clients should suppress any "find replacements" affordance in that case. Likewise, suppress any "show profile" affordance when `mfrProfile` is `false`, and any "best price" affordance when `bestPrice` is `false`.

---

### Find Replacements

Get scored cross-reference replacement parts.

**Simple request (no context):**

```
GET /api/xref/{mpn}
```

**With application context and overrides:**

```
POST /api/xref/{mpn}
```

```json
{
  "overrides": {
    "capacitance_f": "100nF",
    "voltage_rating_v": "50"
  },
  "applicationContext": {
    "familyId": "12",
    "answers": {
      "q1": "ceramic",
      "q2": "automotive"
    }
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `overrides` | object | No | Attribute corrections — keys are internal `parameterId` strings, values are always strings |
| `applicationContext` | object | No | Family-specific context answers that refine scoring (see Application Context below) |

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "part": {
        "mpn": "GCM155R71H104KE02D",
        "manufacturer": "Murata Electronics",
        "description": "Cap Ceramic 0.1uF 50V X7R 0402",
        "category": "Capacitors",
        "subcategory": "Ceramic Capacitors",
        "status": "Active"
      },
      "matchPercentage": 97.5,
      "matchDetails": [
        {
          "parameterId": "capacitance_f",
          "parameterName": "Capacitance",
          "sourceValue": "100nF",
          "replacementValue": "100nF",
          "matchStatus": "exact",
          "ruleResult": "pass"
        },
        {
          "parameterId": "voltage_rating_v",
          "parameterName": "Voltage Rating",
          "sourceValue": "50V",
          "replacementValue": "50V",
          "matchStatus": "exact",
          "ruleResult": "pass"
        },
        {
          "parameterId": "dielectric",
          "parameterName": "Dielectric",
          "sourceValue": "X7R",
          "replacementValue": "X7R",
          "matchStatus": "exact",
          "ruleResult": "pass"
        }
      ],
      "dataSource": "digikey"
    }
  ]
}
```

Each recommendation includes:
- `matchPercentage` — Overall score from 0 to 100
- `matchDetails` — Per-parameter breakdown showing exactly why the score is what it is

#### Understanding Match Details

Each entry in `matchDetails` has two fields that describe the result:

**`matchStatus`** — How the values compare:

| Value | Meaning |
|-------|---------|
| `exact` | Values are identical |
| `compatible` | Values differ but are acceptable |
| `better` | Replacement exceeds the original spec |
| `worse` | Replacement is below the original spec |
| `different` | Values are different (context-dependent) |

**`ruleResult`** — What the matching engine decided:

| Value | Meaning |
|-------|---------|
| `pass` | Rule passed — parameter is acceptable |
| `fail` | Rule failed — parameter is a hard rejection |
| `upgrade` | Replacement is superior to the original |
| `review` | Cannot be automated — requires human review |
| `info` | Informational only, does not affect score |

A part with any `ruleResult: "fail"` should be treated as disqualified, regardless of its `matchPercentage`.

---

### List Supported Families

List all 43 supported component families with their IDs, rule counts, and categories.

```
GET /api/families
```

**Query parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `category` | string | Filter by category name (case-insensitive substring match) |

**Example:**

```bash
curl "https://your-app.com/api/families?category=Passives" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "familyId": "12",
      "familyName": "MLCC Capacitors",
      "category": "Passives",
      "description": "Multi-Layer Ceramic Capacitors",
      "ruleCount": 14,
      "lastUpdated": "2026-01-15"
    }
  ]
}
```

---

### Get Context Questions

Get per-family application context questions that refine cross-reference scoring.

```
GET /api/families/{familyId}/context
```

**Response:**

```json
{
  "success": true,
  "data": {
    "familyId": "12",
    "questions": [
      {
        "id": "q1",
        "question": "What is the primary application?",
        "options": [
          {
            "value": "decoupling",
            "label": "Decoupling / Bypass",
            "effects": [...]
          }
        ]
      }
    ]
  }
}
```

Returns HTTP 404 if the family ID is invalid. Use the family IDs from `GET /api/families`.

---

## Application Context

The matching engine supports per-family application context questions that refine scoring based on how the part is actually used. For example, an automotive application will prioritize AEC-qualified replacements.

### Workflow

1. **Get the family ID** — From a search result or attributes response, identify the component family. Or list all supported families:

   The engine covers these categories:

   | Category | Family IDs |
   |----------|------------|
   | Passives | 12, 13, 52–55, 58–61, 64–72, D1, D2 |
   | Discrete Semiconductors | B1–B9 |
   | Voltage Regulators | C1, C2 |
   | Gate Drivers | C3 |
   | Amplifiers | C4 |
   | Logic ICs | C5 |
   | Voltage References | C6 |
   | Interface ICs | C7 |
   | Timers and Oscillators | C8 |
   | ADCs / DACs | C9, C10 |
   | Crystals | D1 |
   | Fuses | D2 |
   | Optocouplers | E1 |
   | Relays | F1, F2 |

2. **Fetch context questions for the family:**

   ```bash
   curl https://your-app.com/api/families/B5/context \
     -H "Authorization: Bearer YOUR_API_KEY"
   ```

3. **Include answers in the replacement request:**

   ```json
   POST /api/xref/IRFZ44N
   {
     "applicationContext": {
       "familyId": "B5",
       "answers": {
         "switching_topology": "half_bridge",
         "drive_voltage": "10v_standard",
         "automotive": "yes"
       }
     }
   }
   ```

   Question IDs and valid option values are defined per family. Omitting `applicationContext` uses default rule weights.

---

## Error Handling

All error responses use the same envelope:

```json
{
  "success": false,
  "error": "Description of what went wrong"
}
```

| HTTP Status | Meaning |
|-------------|---------|
| 400 | Bad request (missing or invalid parameters) |
| 401 | Invalid or missing API key |
| 404 | Part not found |
| 500 | Internal server error |

### Service Warnings

When upstream data sources are degraded, the response may include a `serviceWarnings` array alongside the data:

```json
{
  "success": true,
  "data": { ... },
  "serviceWarnings": [
    {
      "service": "partsio",
      "severity": "unavailable",
      "message": "Parts.io enrichment unavailable — results may have fewer parameters"
    }
  ]
}
```

The response still contains data from available sources. Warnings indicate that results may be less complete than usual.

---

## Rate Limits

The XRefs API calls upstream data sources (Digikey, parts.io) on each request. To avoid hitting upstream rate limits:

- Cache `GET /api/attributes/{mpn}` responses — parametric data changes infrequently
- Cache `GET /api/xref/{mpn}` responses for at least a few minutes
- Avoid calling the same MPN repeatedly in tight loops

---

## Complete Example

Find a replacement for a 100nF MLCC capacitor:

```bash
# 1. Search for the part
curl -X POST https://your-app.com/api/search \
  -H "Authorization: Bearer sk_live_abc123" \
  -H "Content-Type: application/json" \
  -d '{"query": "GRM155R71C104KA88D"}'

# 2. Get its attributes
curl https://your-app.com/api/attributes/GRM155R71C104KA88D \
  -H "Authorization: Bearer sk_live_abc123"

# 3. Find replacements (simple)
curl https://your-app.com/api/xref/GRM155R71C104KA88D \
  -H "Authorization: Bearer sk_live_abc123"

# 4. Find replacements (with automotive context)
curl -X POST https://your-app.com/api/xref/GRM155R71C104KA88D \
  -H "Authorization: Bearer sk_live_abc123" \
  -H "Content-Type: application/json" \
  -d '{
    "applicationContext": {
      "familyId": "12",
      "answers": {
        "q1": "decoupling",
        "q2": "automotive"
      }
    }
  }'
```

---

## MCP Server (for AI Agent Integration)

If your product uses AI agents that support the [Model Context Protocol](https://modelcontextprotocol.io), you can wrap the XRefs REST API in a lightweight MCP server. This gives your AI agent native tool access to all five operations:

| MCP Tool | REST Endpoint |
|----------|---------------|
| `search_parts` | `POST /api/search` |
| `get_part_attributes` | `GET /api/attributes/{mpn}` |
| `find_replacements` | `GET/POST /api/xref/{mpn}` |
| `list_supported_families` | `GET /api/families` |
| `get_context_questions` | `GET /api/families/{familyId}/context` |

### Quick Start

A ready-to-use MCP server wrapper is provided in [`examples/xrefs-mcp-client/`](../examples/xrefs-mcp-client/). It connects to the XRefs REST API using your Bearer token — no upstream API credentials needed.

1. Copy the example directory into your project
2. Install dependencies: `npm install`
3. Set environment variables:
   ```
   XREFS_API_URL=https://your-xrefs-deployment.com
   XREFS_API_KEY=xrefs_your_key_here
   ```
4. Add to your MCP client config (e.g., Claude Desktop `claude_desktop_config.json`):
   ```json
   {
     "mcpServers": {
       "xrefs": {
         "command": "node",
         "args": ["path/to/xrefs-mcp-client/index.js"],
         "env": {
           "XREFS_API_URL": "https://your-xrefs-deployment.com",
           "XREFS_API_KEY": "xrefs_your_key_here"
         }
       }
     }
   }
   ```
5. Your AI agent can now call `search_parts`, `get_part_attributes`, `find_replacements`, `list_supported_families`, and `get_context_questions` as native tools.
