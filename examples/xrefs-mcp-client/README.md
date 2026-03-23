# XRefs MCP Client

A lightweight MCP server that proxies to the XRefs REST API. Gives any MCP-compatible AI agent (Claude Desktop, Cursor, Windsurf, etc.) native tool access to the XRefs component intelligence engine.

## Setup

```bash
npm install
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `XREFS_API_URL` | Yes | Base URL of the XRefs deployment |
| `XREFS_API_KEY` | Yes | Bearer token for API authentication |

## Usage

### With Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "xrefs": {
      "command": "node",
      "args": ["/absolute/path/to/xrefs-mcp-client/index.js"],
      "env": {
        "XREFS_API_URL": "https://your-xrefs-deployment.com",
        "XREFS_API_KEY": "xrefs_your_key_here"
      }
    }
  }
}
```

### With Claude Code

Add to your `.mcp.json`:

```json
{
  "mcpServers": {
    "xrefs": {
      "command": "node",
      "args": ["/absolute/path/to/xrefs-mcp-client/index.js"],
      "env": {
        "XREFS_API_URL": "https://your-xrefs-deployment.com",
        "XREFS_API_KEY": "xrefs_your_key_here"
      }
    }
  }
}
```

### Testing with MCP Inspector

```bash
XREFS_API_URL=https://your-xrefs-deployment.com XREFS_API_KEY=xrefs_... npm run inspect
```

## Available Tools

| Tool | Description |
|------|-------------|
| `search_parts` | Search for electronic components by part number or keyword |
| `get_part_attributes` | Get full parametric data for a specific MPN |
| `find_replacements` | Get scored cross-reference replacement parts |
| `list_supported_families` | List all 43 supported component families |
| `get_context_questions` | Get per-family context questions for scoring refinement |

## Example Workflow

A typical agent workflow:

1. **Search** — `search_parts({ query: "LM7805" })` to find the part
2. **Attributes** — `get_part_attributes({ mpn: "LM7805CT/NOPB" })` to see specs
3. **Context** — `list_supported_families()` to find the family ID, then `get_context_questions({ familyId: "C1" })` to get application questions
4. **Replace** — `find_replacements({ mpn: "LM7805CT/NOPB", applicationContextJson: '{"familyId":"C1","answers":{"q1":"automotive"}}' })` to get scored alternatives
