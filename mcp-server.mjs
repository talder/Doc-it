#!/usr/bin/env node
/**
 * Doc-it MCP Server
 *
 * Connects AI assistants (Warp, Claude, Cursor, etc.) to Doc-it via its REST API.
 *
 * Usage:
 *   DOCIT_URL=http://localhost:3000 DOCIT_API_KEY=dk_u_... node mcp-server.mjs
 *
 * Environment variables:
 *   DOCIT_URL      - Base URL of the Doc-it instance (default: http://localhost:3000)
 *   DOCIT_API_KEY  - API key (dk_u_... for user key, dk_s_... for service key)
 *   DOCIT_SPACE    - Default space slug (optional)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v4";

const BASE_URL = process.env.DOCIT_URL || "http://localhost:3000";
const API_KEY = process.env.DOCIT_API_KEY || "";
const DEFAULT_SPACE = process.env.DOCIT_SPACE || "";

async function api(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  if (API_KEY) headers["Authorization"] = `Bearer ${API_KEY}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE_URL}${path}`, opts);
  const txt = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${txt.slice(0, 200)}`);
  try { return JSON.parse(txt); } catch { return txt; }
}

function ok(content) {
  return { content: [{ type: "text", text: typeof content === "string" ? content : JSON.stringify(content, null, 2) }] };
}

function sp(input) { return input || DEFAULT_SPACE; }

const server = new McpServer(
  { name: "docit", version: "1.0.0" },
  { instructions: `Doc-it MCP server → ${BASE_URL}. ${DEFAULT_SPACE ? `Default space: ${DEFAULT_SPACE}.` : "Provide 'space' param."} Use list_spaces first.` }
);

// ── Spaces ───────────────────────────────────────────────────────────────────

server.registerTool("list_spaces", { description: "List all accessible documentation spaces" }, async () => {
  return ok(await api("GET", "/api/spaces"));
});

// ── Documents ────────────────────────────────────────────────────────────────

server.registerTool("list_docs", {
  description: "List all documents in a space",
  inputSchema: z.object({ space: z.string().optional().describe("Space slug") }),
}, async ({ space }) => {
  const s = sp(space); if (!s) return ok("Error: No space specified.");
  return ok(await api("GET", `/api/spaces/${encodeURIComponent(s)}/docs`));
});

server.registerTool("read_doc", {
  description: "Read a document's full markdown content and metadata",
  inputSchema: z.object({
    space: z.string().optional().describe("Space slug"),
    name: z.string().describe("Document name (without .md)"),
    category: z.string().describe("Category path"),
  }),
}, async ({ space, name, category }) => {
  const s = sp(space); if (!s) return ok("Error: No space specified.");
  return ok(await api("GET", `/api/spaces/${encodeURIComponent(s)}/docs/${encodeURIComponent(name)}?category=${encodeURIComponent(category)}`));
});

server.registerTool("create_doc", {
  description: "Create a new document",
  inputSchema: z.object({
    space: z.string().optional().describe("Space slug"),
    name: z.string().describe("Document name"),
    category: z.string().describe("Category path"),
    content: z.string().optional().describe("Markdown content"),
  }),
}, async ({ space, name, category, content }) => {
  const s = sp(space); if (!s) return ok("Error: No space specified.");
  return ok(await api("POST", `/api/spaces/${encodeURIComponent(s)}/docs`, { name, category, content }));
});

server.registerTool("update_doc", {
  description: "Update an existing document's content",
  inputSchema: z.object({
    space: z.string().optional().describe("Space slug"),
    name: z.string().describe("Document name"),
    category: z.string().describe("Category path"),
    content: z.string().describe("New markdown content"),
  }),
}, async ({ space, name, category, content }) => {
  const s = sp(space); if (!s) return ok("Error: No space specified.");
  return ok(await api("PUT", `/api/spaces/${encodeURIComponent(s)}/docs/${encodeURIComponent(name)}`, { content, category }));
});

server.registerTool("search_docs", {
  description: "Search documents in a space",
  inputSchema: z.object({
    space: z.string().optional().describe("Space slug"),
    query: z.string().describe("Search query"),
    category: z.string().optional().describe("Filter by category"),
    tag: z.string().optional().describe("Filter by tag"),
  }),
}, async ({ space, query, category, tag }) => {
  const s = sp(space); if (!s) return ok("Error: No space specified.");
  const p = new URLSearchParams({ q: query });
  if (category) p.set("category", category);
  if (tag) p.set("tag", tag);
  return ok(await api("GET", `/api/spaces/${encodeURIComponent(s)}/search?${p}`));
});

// ── Enhanced Tables ──────────────────────────────────────────────────────────

server.registerTool("list_tables", {
  description: "List enhanced tables in a space",
  inputSchema: z.object({ space: z.string().optional().describe("Space slug") }),
}, async ({ space }) => {
  const s = sp(space); if (!s) return ok("Error: No space specified.");
  const tables = await api("GET", `/api/spaces/${encodeURIComponent(s)}/enhanced-tables`);
  return ok(tables.map((t) => ({ id: t.id, title: t.title, columns: t.columns.map((c) => `${c.name} (${c.type})`), rowCount: t.rows.length })));
});

server.registerTool("read_table", {
  description: "Read full enhanced table data",
  inputSchema: z.object({
    space: z.string().optional().describe("Space slug"),
    tableId: z.string().describe("Table ID"),
  }),
}, async ({ space, tableId }) => {
  const s = sp(space); if (!s) return ok("Error: No space specified.");
  return ok(await api("GET", `/api/spaces/${encodeURIComponent(s)}/enhanced-tables/${encodeURIComponent(tableId)}`));
});

server.registerTool("query_table", {
  description: "Query an enhanced table with filtering, sorting, and column selection",
  inputSchema: z.object({
    space: z.string().optional().describe("Space slug"),
    tableId: z.string().describe("Table ID"),
    columns: z.array(z.string()).optional().describe("Column names to include"),
    filterColumn: z.string().optional().describe("Column to filter"),
    filterOp: z.enum(["eq", "neq", "contains", "gt", "lt", "isEmpty", "isNotEmpty"]).optional().describe("Filter operator"),
    filterValue: z.string().optional().describe("Filter value"),
    sortBy: z.string().optional().describe("Sort column"),
    sortDir: z.enum(["asc", "desc"]).optional().describe("Sort direction"),
    limit: z.number().optional().describe("Max rows"),
  }),
}, async ({ space, tableId, columns, filterColumn, filterOp, filterValue, sortBy, sortDir, limit }) => {
  const s = sp(space); if (!s) return ok("Error: No space specified.");
  const table = await api("GET", `/api/spaces/${encodeURIComponent(s)}/enhanced-tables/${encodeURIComponent(tableId)}`);
  const cm = new Map(table.columns.map((c) => [c.name.toLowerCase(), c]));
  const cols = columns?.length ? columns.map((n) => cm.get(n.toLowerCase())).filter(Boolean) : table.columns;
  let rows = [...table.rows];
  if (filterColumn && filterOp) {
    const fc = cm.get(filterColumn.toLowerCase());
    if (fc) rows = rows.filter((r) => {
      const v = r.cells[fc.id], vs = v != null ? String(v) : "", fv = filterValue || "";
      switch (filterOp) {
        case "eq": return vs === fv; case "neq": return vs !== fv;
        case "contains": return vs.toLowerCase().includes(fv.toLowerCase());
        case "gt": return Number(v) > Number(fv); case "lt": return Number(v) < Number(fv);
        case "isEmpty": return vs === ""; case "isNotEmpty": return vs !== "";
        default: return true;
      }
    });
  }
  if (sortBy) { const sc = cm.get(sortBy.toLowerCase()); if (sc) rows.sort((a, b) => { const c = String(a.cells[sc.id] ?? "").localeCompare(String(b.cells[sc.id] ?? ""), undefined, { numeric: true }); return sortDir === "desc" ? -c : c; }); }
  if (limit > 0) rows = rows.slice(0, limit);
  return ok({ table: table.title, rowCount: rows.length, totalRows: table.rows.length, rows: rows.map((r) => { const o = {}; for (const c of cols) o[c.name] = r.cells[c.id] ?? null; return o; }) });
});

server.registerTool("create_row", {
  description: "Add a row to an enhanced table",
  inputSchema: z.object({
    space: z.string().optional().describe("Space slug"),
    tableId: z.string().describe("Table ID"),
    data: z.record(z.string(), z.unknown()).describe("Column name → value"),
  }),
}, async ({ space, tableId, data }) => {
  const s = sp(space); if (!s) return ok("Error: No space specified.");
  const table = await api("GET", `/api/spaces/${encodeURIComponent(s)}/enhanced-tables/${encodeURIComponent(tableId)}`);
  const cells = {};
  for (const [n, v] of Object.entries(data)) { const c = table.columns.find((x) => x.name.toLowerCase() === n.toLowerCase()); if (c) cells[c.id] = v; }
  return ok(await api("POST", `/api/spaces/${encodeURIComponent(s)}/enhanced-tables/${encodeURIComponent(tableId)}/rows`, { cells }));
});

server.registerTool("update_row", {
  description: "Update a row in an enhanced table",
  inputSchema: z.object({
    space: z.string().optional().describe("Space slug"),
    tableId: z.string().describe("Table ID"),
    rowId: z.string().describe("Row ID"),
    data: z.record(z.string(), z.unknown()).describe("Column name → new value"),
  }),
}, async ({ space, tableId, rowId, data }) => {
  const s = sp(space); if (!s) return ok("Error: No space specified.");
  const table = await api("GET", `/api/spaces/${encodeURIComponent(s)}/enhanced-tables/${encodeURIComponent(tableId)}`);
  const cells = {};
  for (const [n, v] of Object.entries(data)) { const c = table.columns.find((x) => x.name.toLowerCase() === n.toLowerCase()); if (c) cells[c.id] = v; }
  return ok(await api("PUT", `/api/spaces/${encodeURIComponent(s)}/enhanced-tables/${encodeURIComponent(tableId)}/rows/${encodeURIComponent(rowId)}`, { cells }));
});

server.registerTool("delete_row", {
  description: "Delete a row from an enhanced table",
  inputSchema: z.object({
    space: z.string().optional().describe("Space slug"),
    tableId: z.string().describe("Table ID"),
    rowId: z.string().describe("Row ID"),
  }),
}, async ({ space, tableId, rowId }) => {
  const s = sp(space); if (!s) return ok("Error: No space specified.");
  return ok(await api("DELETE", `/api/spaces/${encodeURIComponent(s)}/enhanced-tables/${encodeURIComponent(tableId)}/rows/${encodeURIComponent(rowId)}`));
});

// ── Tags ─────────────────────────────────────────────────────────────────────

server.registerTool("list_tags", {
  description: "List all tags in a space with document counts",
  inputSchema: z.object({ space: z.string().optional().describe("Space slug") }),
}, async ({ space }) => {
  const s = sp(space); if (!s) return ok("Error: No space specified.");
  return ok(await api("GET", `/api/spaces/${encodeURIComponent(s)}/tags`));
});

// ── System ───────────────────────────────────────────────────────────────────

server.registerTool("get_version", { description: "Get Doc-it server version" }, async () => {
  return ok(await api("GET", "/api/version"));
});

// ── Start ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[docit-mcp] Connected to ${BASE_URL}`);
