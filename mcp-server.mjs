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
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, opts);
  } catch (err) {
    throw new Error(`Connection failed: ${err.message}. Is Doc-it running at ${BASE_URL}?`);
  }
  const txt = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${txt.slice(0, 300)}`);
  try { return JSON.parse(txt); } catch { return txt; }
}

function ok(content) {
  return { content: [{ type: "text", text: typeof content === "string" ? content : JSON.stringify(content, null, 2) }] };
}

function sp(input) { return input || DEFAULT_SPACE; }

const server = new McpServer(
  { name: "docit", version: "1.0.0" },
  { instructions: `Doc-it MCP server → ${BASE_URL}. ${DEFAULT_SPACE ? `Default space: ${DEFAULT_SPACE}.` : "Provide 'space' param."} Tools: list_spaces, list_docs, read_doc, create_doc, update_doc, search_docs, list_tables, read_table, query_table, create_row, update_row, delete_row, list_tags, list_oncall, create_oncall, update_oncall_solution, list_changelog, create_changelog, list_changelog_systems, get_version. Use list_spaces first.` }
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
  if (!Array.isArray(tables)) return ok(tables); // forward error responses as-is
  return ok(tables.map((t) => ({
    id: t.id,
    title: t.title,
    columns: (t.columns || []).map((c) => `${c.name} (${c.type})`),
    rowCount: t.rowCount ?? (t.rows ? t.rows.length : 0),
    tags: t.tags || [],
  })));
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

// ── On-Call ─────────────────────────────────────────────────────────────

server.registerTool("list_oncall", {
  description: "List on-call report entries with optional filtering by date range and search query",
  inputSchema: z.object({
    from: z.string().optional().describe("Start date (YYYY-MM-DD)"),
    to: z.string().optional().describe("End date (YYYY-MM-DD)"),
    query: z.string().optional().describe("Search text"),
  }),
}, async ({ from, to, query }) => {
  const p = new URLSearchParams();
  if (from) p.set("from", from);
  if (to) p.set("to", to);
  if (query) p.set("q", query);
  return ok(await api("GET", `/api/oncall?${p}`));
});

server.registerTool("create_oncall", {
  description: "Create an on-call report entry",
  inputSchema: z.object({
    date: z.string().describe("Date (YYYY-MM-DD)"),
    time: z.string().describe("Time (HH:MM)"),
    description: z.string().describe("Problem description"),
    workingTime: z.string().optional().describe("Duration (e.g. '1h30m', '45m')"),
    solution: z.string().optional().describe("Solution description"),
    assistedBy: z.array(z.string()).optional().describe("Usernames of people who assisted"),
  }),
}, async ({ date, time, description, workingTime, solution, assistedBy }) => {
  return ok(await api("POST", "/api/oncall", { date, time, description, workingTime, solution, assistedBy }));
});

server.registerTool("get_oncall", {
  description: "Get a single on-call entry by ID",
  inputSchema: z.object({ id: z.string().describe("On-call entry ID (e.g. ONC-000001)") }),
}, async ({ id }) => {
  return ok(await api("GET", `/api/oncall/${encodeURIComponent(id)}`));
});

server.registerTool("update_oncall_solution", {
  description: "Update the solution field of an existing on-call entry",
  inputSchema: z.object({
    id: z.string().describe("On-call entry ID (e.g. ONC-000001)"),
    solution: z.string().describe("Updated solution text"),
  }),
}, async ({ id, solution }) => {
  return ok(await api("PATCH", `/api/oncall/${encodeURIComponent(id)}`, { solution }));
});

server.registerTool("delete_oncall", {
  description: "Delete an on-call entry (admin only)",
  inputSchema: z.object({ id: z.string().describe("On-call entry ID") }),
}, async ({ id }) => {
  return ok(await api("DELETE", `/api/oncall/${encodeURIComponent(id)}`));
});

server.registerTool("oncall_stats", {
  description: "Get on-call statistics: total entries, working time, per-registrar breakdown, heatmap, top assisted users",
  inputSchema: z.object({ days: z.number().optional().describe("Heatmap period in days (default 90)") }),
}, async ({ days }) => {
  const p = days ? `?days=${days}` : "";
  return ok(await api("GET", `/api/oncall/stats${p}`));
});

server.registerTool("oncall_users", {
  description: "List users available for the on-call assisted-by picker",
}, async () => {
  return ok(await api("GET", "/api/oncall/users"));
});

// ── Change Log ──────────────────────────────────────────────────────────

server.registerTool("list_changelog", {
  description: "List change log entries with optional filtering",
  inputSchema: z.object({
    from: z.string().optional().describe("Start date (YYYY-MM-DD)"),
    to: z.string().optional().describe("End date (YYYY-MM-DD)"),
    query: z.string().optional().describe("Search text"),
    category: z.string().optional().describe("Category filter (Disk, Network, Security, Software, Hardware, Configuration, Other)"),
    system: z.string().optional().describe("System name filter"),
  }),
}, async ({ from, to, query, category, system }) => {
  const p = new URLSearchParams();
  if (from) p.set("from", from);
  if (to) p.set("to", to);
  if (query) p.set("q", query);
  if (category) p.set("category", category);
  if (system) p.set("system", system);
  return ok(await api("GET", `/api/changelog?${p}`));
});

server.registerTool("create_changelog", {
  description: "Create a new change log entry",
  inputSchema: z.object({
    date: z.string().describe("Date (YYYY-MM-DD)"),
    system: z.string().describe("System or hostname affected"),
    category: z.enum(["Disk", "Network", "Security", "Software", "Hardware", "Configuration", "Other"]).describe("Change category"),
    description: z.string().describe("What was changed"),
    impact: z.string().describe("Impact description"),
    risk: z.enum(["Low", "Medium", "High", "Critical"]).describe("Risk level"),
    status: z.enum(["Completed", "Failed", "Rolled Back"]).describe("Change status"),
  }),
}, async ({ date, system, category, description, impact, risk, status }) => {
  return ok(await api("POST", "/api/changelog", { date, system, category, description, impact, risk, status }));
});

server.registerTool("list_changelog_systems", {
  description: "List known system names used in the change log (for autocomplete)",
}, async () => {
  return ok(await api("GET", "/api/changelog?systems=1"));
});

// ── System ───────────────────────────────────────────────────────────────

server.registerTool("get_version", { description: "Get Doc-it server version" }, async () => {
  return ok(await api("GET", "/api/version"));
});

// ── Start ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[docit-mcp] Connected to ${BASE_URL}`);
