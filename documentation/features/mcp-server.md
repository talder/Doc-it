# MCP Server (AI Assistant Integration)

Doc-it includes a standalone MCP (Model Context Protocol) server that lets AI assistants — such as Warp, Claude Desktop, Cursor, and others — read, search, create, and edit documents and enhanced table data.

---

## Overview

The MCP server (`mcp-server.mjs` in the project root) is a Node.js script that communicates over stdio using the standard MCP protocol. It connects to a running Doc-it instance via its REST API, authenticating with a Doc-it API key.

---

## Prerequisites

- Node.js 20+ (ships with the Doc-it installation)
- A running Doc-it instance
- A Doc-it API key (user key `dk_u_...` or service key `dk_s_...`)

To create an API key, go to **Profile → API Keys** (user key) or **Admin → Service Keys** (service key).

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DOCIT_URL` | No | `http://localhost:3000` | Base URL of the Doc-it instance |
| `DOCIT_API_KEY` | Yes | — | API key for authentication |
| `DOCIT_SPACE` | No | — | Default space slug (omit to require `space` parameter on each call) |

---

## Setup by AI Client

### Warp

Add as an MCP server in Warp settings:

- **Command**: `node /path/to/Doc-it/mcp-server.mjs`
- **Environment variables**:
  - `DOCIT_URL=http://your-docit-host:3000`
  - `DOCIT_API_KEY=dk_u_your_key_here`
  - `DOCIT_SPACE=your-default-space` (optional)

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "docit": {
      "command": "node",
      "args": ["/path/to/Doc-it/mcp-server.mjs"],
      "env": {
        "DOCIT_URL": "http://your-docit-host:3000",
        "DOCIT_API_KEY": "dk_u_your_key_here",
        "DOCIT_SPACE": "your-default-space"
      }
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "docit": {
      "command": "node",
      "args": ["/path/to/Doc-it/mcp-server.mjs"],
      "env": {
        "DOCIT_URL": "http://your-docit-host:3000",
        "DOCIT_API_KEY": "dk_u_your_key_here"
      }
    }
  }
}
```

### Command Line (testing)

```bash
DOCIT_URL=http://localhost:3000 DOCIT_API_KEY=dk_u_abc123 node mcp-server.mjs
```

---

## Available Tools

### Spaces

| Tool | Description |
|---|---|
| `list_spaces` | List all accessible documentation spaces |

### Documents

| Tool | Description |
|---|---|
| `list_docs` | List all documents in a space (names, categories, filenames) |
| `read_doc` | Read a document's full markdown content and metadata |
| `create_doc` | Create a new document in a space |
| `update_doc` | Update an existing document's content |
| `search_docs` | Search across documents (content, names, tags) with snippets |

### Enhanced Tables

| Tool | Description |
|---|---|
| `list_tables` | List all enhanced tables with IDs, titles, columns, and row counts |
| `read_table` | Read full table data (all columns and rows) |
| `query_table` | Query with column selection, filtering, sorting, and row limit |
| `create_row` | Add a new row (uses column names, not internal IDs) |
| `update_row` | Update a row by ID |
| `delete_row` | Delete a row by ID |

### On-Call Reports

| Tool | Description |
|---|---|
| `list_oncall` | List on-call entries with optional date range and search filters |
| `create_oncall` | Create a new on-call report entry (date, time, description, working time, solution) |
| `update_oncall_solution` | Update the solution field of an existing on-call entry |

### Change Log

| Tool | Description |
|---|---|
| `list_changelog` | List change log entries with filters (date, category, system, search) |
| `create_changelog` | Create a new change log entry (system, category, risk, impact, status) |
| `list_changelog_systems` | List known system names for autocomplete |

### Tags & System

| Tool | Description |
|---|---|
| `list_tags` | List all tags in a space with document counts |
| `get_version` | Get the Doc-it server version |

---

## Column Name Resolution

The enhanced table tools accept **column names** (e.g. `"Bedrijf"`, `"Email"`) rather than internal column IDs. The MCP server automatically resolves names to IDs, case-insensitively.

---

## Query Examples

An AI assistant can:

- *"Show me all contacts from Jarviss"* → calls `query_table` with `filterColumn: "Bedrijf"`, `filterOp: "eq"`, `filterValue: "Jarviss"`
- *"Add a new row to the Leveranciers table"* → calls `create_row` with column name/value pairs
- *"Search for documents about Active Directory"* → calls `search_docs` with `query: "Active Directory"`
- *"Update the phone number for Bobby"* → calls `query_table` to find the row, then `update_row`
- *"Show last week's on-call reports"* → calls `list_oncall` with `from` and `to` dates
- *"Log an on-call incident: DNS failure at 03:15"* → calls `create_oncall`
- *"List all network changes this month"* → calls `list_changelog` with `category: "Network"` and date range
- *"Register a change: upgraded firewall firmware"* → calls `create_changelog` with full details

---

## Security

- The MCP server runs locally on the user's machine (stdio transport — no network exposure)
- All API calls use the configured `DOCIT_API_KEY` for authentication
- User keys (`dk_u_...`) inherit the user's permissions (space roles)
- Service keys (`dk_s_...`) have configurable per-space permissions
- The MCP server never stores credentials — they come from environment variables

---

## Troubleshooting

| Issue | Solution |
|---|---|
| `fetch failed` | Doc-it server is not running or URL is wrong |
| `403 Forbidden` | API key is invalid or lacks access to the requested space |
| `_zod` error on tools/list | Ensure `zod` v4+ is installed (`npm install zod@latest`) |
| Tools not appearing in client | Restart the AI client after adding the MCP configuration |
