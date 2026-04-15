#!/usr/bin/env node
/**
 * Doc-it MCP Server
 *
 * A Model Context Protocol server that connects AI assistants (Warp, Claude, Cursor, etc.)
 * to a Doc-it instance via its REST API.
 *
 * Usage:
 *   DOCIT_URL=http://localhost:3000 DOCIT_API_KEY=dk_u_... node mcp-server.mjs
 *
 * Environment variables:
 *   DOCIT_URL      - Base URL of the Doc-it instance (default: http://localhost:3000)
 *   DOCIT_API_KEY  - API key (dk_u_... for user key, dk_s_... for service key)
 *   DOCIT_SPACE    - Default space slug (optional, tools will prompt if not set)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE_URL = process.env.DOCIT_URL || "http://localhost:3000";
const API_KEY = process.env.DOCIT_API_KEY || "";
const DEFAULT_SPACE = process.env.DOCIT_SPACE || "";

// ── HTTP helper ──────────────────────────────────────────────────────────────

async function api(method, path, body) {
  const url = `${BASE_URL}${path}`;
  const headers = { "Content-Type": "application/json" };
  if (API_KEY) headers["Authorization"] = `Bearer ${API_KEY}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  try { return JSON.parse(text); } catch { return text; }
}

function text(content) {
  return { content: [{ type: "text", text: typeof content === "string" ? content : JSON.stringify(content, null, 2) }] };
}

function spaceSlug(input) {
  return input || DEFAULT_SPACE;
}

// ── MCP Server ───────────────────────────────────────────────────────────────

const server = new McpServer(
  { name: "docit", version: "1.0.0" },
  {
    instructions: `Doc-it MCP server. Connected to: ${BASE_URL}
${DEFAULT_SPACE ? `Default space: ${DEFAULT_SPACE}` : "No default space set — always provide the 'space' parameter."}

Available tool categories:
- Spaces: list_spaces
- Documents: list_docs, read_doc, create_doc, update_doc, search_docs
- Enhanced Tables: list_tables, read_table, query_table, create_row, update_row, delete_row
- Tags: list_tags
- System: get_version

Always use list_spaces first if you don't know the available spaces.
Use list_docs or search_docs to find documents before reading them.
Use list_tables to find enhanced tables before querying them.`
  }
);

// ── Space tools ──────────────────────────────────────────────────────────────

server.tool(
  "list_spaces",
  "List all accessible documentation spaces",
  {},
  async () => {
    const spaces = await api("GET", "/api/spaces");
    return text(spaces);
  }
);

// ── Document tools ───────────────────────────────────────────────────────────

server.tool(
  "list_docs",
  "List all documents in a space. Returns names, categories, and filenames.",
  { space: z.string().optional().describe("Space slug (uses default if not set)") },
  async ({ space }) => {
    const s = spaceSlug(space);
    if (!s) return text("Error: No space specified. Use list_spaces to find available spaces.");
    const docs = await api("GET", `/api/spaces/${encodeURIComponent(s)}/docs`);
    return text(docs);
  }
);

server.tool(
  "read_doc",
  "Read the full content of a document (markdown) including metadata.",
  {
    space: z.string().optional().describe("Space slug"),
    name: z.string().describe("Document name (without .md extension)"),
    category: z.string().describe("Category path (e.g. 'General' or 'Software/Guides')"),
  },
  async ({ space, name, category }) => {
    const s = spaceSlug(space);
    if (!s) return text("Error: No space specified.");
    const doc = await api("GET", `/api/spaces/${encodeURIComponent(s)}/docs/${encodeURIComponent(name)}?category=${encodeURIComponent(category)}`);
    return text(doc);
  }
);

server.tool(
  "create_doc",
  "Create a new document in a space.",
  {
    space: z.string().optional().describe("Space slug"),
    name: z.string().describe("Document name"),
    category: z.string().describe("Category path"),
    content: z.string().optional().describe("Markdown content (optional, default template used if empty)"),
  },
  async ({ space, name, category, content }) => {
    const s = spaceSlug(space);
    if (!s) return text("Error: No space specified.");
    const result = await api("POST", `/api/spaces/${encodeURIComponent(s)}/docs`, { name, category, content });
    return text(result);
  }
);

server.tool(
  "update_doc",
  "Update the content of an existing document.",
  {
    space: z.string().optional().describe("Space slug"),
    name: z.string().describe("Document name"),
    category: z.string().describe("Category path"),
    content: z.string().describe("New markdown content"),
  },
  async ({ space, name, category, content }) => {
    const s = spaceSlug(space);
    if (!s) return text("Error: No space specified.");
    const result = await api("PUT", `/api/spaces/${encodeURIComponent(s)}/docs/${encodeURIComponent(name)}`, { content, category });
    return text(result);
  }
);

server.tool(
  "search_docs",
  "Search across all documents in a space. Returns matching documents with snippets.",
  {
    space: z.string().optional().describe("Space slug"),
    query: z.string().describe("Search query (min 2 characters)"),
    category: z.string().optional().describe("Filter by category"),
    tag: z.string().optional().describe("Filter by tag"),
  },
  async ({ space, query, category, tag }) => {
    const s = spaceSlug(space);
    if (!s) return text("Error: No space specified.");
    const params = new URLSearchParams({ q: query });
    if (category) params.set("category", category);
    if (tag) params.set("tag", tag);
    const result = await api("GET", `/api/spaces/${encodeURIComponent(s)}/search?${params}`);
    return text(result);
  }
);

// ── Enhanced Table tools ─────────────────────────────────────────────────────

server.tool(
  "list_tables",
  "List all enhanced tables in a space with their IDs, titles, and row counts.",
  { space: z.string().optional().describe("Space slug") },
  async ({ space }) => {
    const s = spaceSlug(space);
    if (!s) return text("Error: No space specified.");
    const tables = await api("GET", `/api/spaces/${encodeURIComponent(s)}/enhanced-tables`);
    const summary = tables.map((t) => ({
      id: t.id,
      title: t.title,
      columns: t.columns.map((c) => `${c.name} (${c.type})`),
      rowCount: t.rows.length,
      tags: t.tags,
    }));
    return text(summary);
  }
);

server.tool(
  "read_table",
  "Read the full data of an enhanced table including all columns and rows.",
  {
    space: z.string().optional().describe("Space slug"),
    tableId: z.string().describe("Enhanced table ID"),
  },
  async ({ space, tableId }) => {
    const s = spaceSlug(space);
    if (!s) return text("Error: No space specified.");
    const table = await api("GET", `/api/spaces/${encodeURIComponent(s)}/enhanced-tables/${encodeURIComponent(tableId)}`);
    return text(table);
  }
);

server.tool(
  "query_table",
  "Query an enhanced table with column selection, filtering, and sorting. Returns matching rows.",
  {
    space: z.string().optional().describe("Space slug"),
    tableId: z.string().describe("Enhanced table ID"),
    columns: z.array(z.string()).optional().describe("Column names to include (all if empty)"),
    filter: z.object({
      column: z.string().describe("Column name"),
      op: z.enum(["eq", "neq", "contains", "gt", "lt", "isEmpty", "isNotEmpty"]).describe("Operator"),
      value: z.string().optional().describe("Value to compare"),
    }).optional().describe("Filter condition"),
    sortBy: z.string().optional().describe("Column name to sort by"),
    sortDir: z.enum(["asc", "desc"]).optional().describe("Sort direction"),
    limit: z.number().optional().describe("Max rows to return"),
  },
  async ({ space, tableId, columns, filter, sortBy, sortDir, limit }) => {
    const s = spaceSlug(space);
    if (!s) return text("Error: No space specified.");
    const table = await api("GET", `/api/spaces/${encodeURIComponent(s)}/enhanced-tables/${encodeURIComponent(tableId)}`);

    // Resolve column names to IDs
    const colMap = new Map(table.columns.map((c) => [c.name.toLowerCase(), c]));
    const selectedCols = columns?.length
      ? columns.map((n) => colMap.get(n.toLowerCase())).filter(Boolean)
      : table.columns;

    // Filter rows
    let rows = [...table.rows];
    if (filter) {
      const filterCol = colMap.get(filter.column.toLowerCase());
      if (filterCol) {
        rows = rows.filter((r) => {
          const v = r.cells[filterCol.id];
          const vs = v != null ? String(v) : "";
          const fv = filter.value || "";
          switch (filter.op) {
            case "eq": return vs === fv;
            case "neq": return vs !== fv;
            case "contains": return vs.toLowerCase().includes(fv.toLowerCase());
            case "gt": return Number(v) > Number(fv);
            case "lt": return Number(v) < Number(fv);
            case "isEmpty": return vs === "";
            case "isNotEmpty": return vs !== "";
            default: return true;
          }
        });
      }
    }

    // Sort
    if (sortBy) {
      const sortCol = colMap.get(sortBy.toLowerCase());
      if (sortCol) {
        rows.sort((a, b) => {
          const av = String(a.cells[sortCol.id] ?? "");
          const bv = String(b.cells[sortCol.id] ?? "");
          const cmp = av.localeCompare(bv, undefined, { numeric: true });
          return sortDir === "desc" ? -cmp : cmp;
        });
      }
    }

    // Limit
    if (limit && limit > 0) rows = rows.slice(0, limit);

    // Format output
    const result = rows.map((r) => {
      const obj = {};
      for (const col of selectedCols) {
        const v = r.cells[col.id];
        obj[col.name] = v != null ? (Array.isArray(v) ? v.join(", ") : v) : null;
      }
      return obj;
    });

    return text({ table: table.title, rowCount: result.length, totalRows: table.rows.length, rows: result });
  }
);

server.tool(
  "create_row",
  "Add a new row to an enhanced table.",
  {
    space: z.string().optional().describe("Space slug"),
    tableId: z.string().describe("Enhanced table ID"),
    data: z.record(z.unknown()).describe("Object mapping column names to values"),
  },
  async ({ space, tableId, data }) => {
    const s = spaceSlug(space);
    if (!s) return text("Error: No space specified.");
    // Resolve column names to IDs
    const table = await api("GET", `/api/spaces/${encodeURIComponent(s)}/enhanced-tables/${encodeURIComponent(tableId)}`);
    const cells = {};
    for (const [name, value] of Object.entries(data)) {
      const col = table.columns.find((c) => c.name.toLowerCase() === name.toLowerCase());
      if (col) cells[col.id] = value;
    }
    const row = await api("POST", `/api/spaces/${encodeURIComponent(s)}/enhanced-tables/${encodeURIComponent(tableId)}/rows`, { cells });
    return text(row);
  }
);

server.tool(
  "update_row",
  "Update a row in an enhanced table.",
  {
    space: z.string().optional().describe("Space slug"),
    tableId: z.string().describe("Enhanced table ID"),
    rowId: z.string().describe("Row ID"),
    data: z.record(z.unknown()).describe("Object mapping column names to new values"),
  },
  async ({ space, tableId, rowId, data }) => {
    const s = spaceSlug(space);
    if (!s) return text("Error: No space specified.");
    const table = await api("GET", `/api/spaces/${encodeURIComponent(s)}/enhanced-tables/${encodeURIComponent(tableId)}`);
    const cells = {};
    for (const [name, value] of Object.entries(data)) {
      const col = table.columns.find((c) => c.name.toLowerCase() === name.toLowerCase());
      if (col) cells[col.id] = value;
    }
    const result = await api("PUT", `/api/spaces/${encodeURIComponent(s)}/enhanced-tables/${encodeURIComponent(tableId)}/rows/${encodeURIComponent(rowId)}`, { cells });
    return text(result);
  }
);

server.tool(
  "delete_row",
  "Delete a row from an enhanced table.",
  {
    space: z.string().optional().describe("Space slug"),
    tableId: z.string().describe("Enhanced table ID"),
    rowId: z.string().describe("Row ID"),
  },
  async ({ space, tableId, rowId }) => {
    const s = spaceSlug(space);
    if (!s) return text("Error: No space specified.");
    const result = await api("DELETE", `/api/spaces/${encodeURIComponent(s)}/enhanced-tables/${encodeURIComponent(tableId)}/rows/${encodeURIComponent(rowId)}`);
    return text(result);
  }
);

// ── Tag tools ────────────────────────────────────────────────────────────────

server.tool(
  "list_tags",
  "List all tags in a space with document counts.",
  { space: z.string().optional().describe("Space slug") },
  async ({ space }) => {
    const s = spaceSlug(space);
    if (!s) return text("Error: No space specified.");
    const tags = await api("GET", `/api/spaces/${encodeURIComponent(s)}/tags`);
    return text(tags);
  }
);

// ── System tools ─────────────────────────────────────────────────────────────

server.tool(
  "get_version",
  "Get the Doc-it server version.",
  {},
  async () => {
    const version = await api("GET", "/api/version");
    return text(version);
  }
);

// ── Start ────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[docit-mcp] Connected to ${BASE_URL}`);
}

main().catch((err) => {
  console.error("[docit-mcp] Fatal:", err);
  process.exit(1);
});
