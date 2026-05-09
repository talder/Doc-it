import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/config";

function initTable() {
  const db = getDb();
  db.prepare(`
    CREATE TABLE IF NOT EXISTS vl_saved_queries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      query TEXT NOT NULL,
      time_range TEXT NOT NULL DEFAULT 'now-1h',
      row_limit INTEGER NOT NULL DEFAULT 500,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `).run();
}

/** GET /api/victorialogs/saved-queries — list all saved queries */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  initTable();
  const rows = getDb().prepare(
    "SELECT * FROM vl_saved_queries ORDER BY created_at DESC"
  ).all();

  return NextResponse.json({ queries: rows });
}

/** POST /api/victorialogs/saved-queries — create a saved query */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({})) as {
    name?: string;
    query?: string;
    timeRange?: string;
    rowLimit?: number;
  };

  const { name, query, timeRange = "now-1h", rowLimit = 500 } = body;
  if (!name?.trim() || !query?.trim()) {
    return NextResponse.json({ error: "name and query are required" }, { status: 400 });
  }

  initTable();
  const result = getDb().prepare(
    "INSERT INTO vl_saved_queries (name, query, time_range, row_limit, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(
    name.trim(),
    query.trim(),
    timeRange,
    Math.min(Number(rowLimit) || 500, 10_000),
    user.username ?? user.email ?? "unknown",
    new Date().toISOString(),
  );

  const created = getDb().prepare("SELECT * FROM vl_saved_queries WHERE id = ?").get(result.lastInsertRowid);
  return NextResponse.json({ query: created }, { status: 201 });
}
