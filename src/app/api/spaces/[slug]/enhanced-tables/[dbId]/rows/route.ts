import { NextRequest, NextResponse } from "next/server";
import { requireSpaceRole } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/auth";
import { readEnhancedTable, writeEnhancedTable, generateId } from "@/lib/enhanced-table";
import type { DbRow } from "@/lib/types";

type Params = { params: Promise<{ slug: string; dbId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { slug, dbId } = await params;
  try { await requireSpaceRole(slug, "reader"); }
  catch (err) { return NextResponse.json({ error: String(err) }, { status: 403 }); }

  const db = await readEnhancedTable(slug, dbId);
  if (!db) return NextResponse.json({ error: "Database not found" }, { status: 404 });
  return NextResponse.json(db.rows);
}

export async function POST(request: NextRequest, { params }: Params) {
  const { slug, dbId } = await params;
  try { await requireSpaceRole(slug, "writer"); }
  catch (err) { return NextResponse.json({ error: String(err) }, { status: 403 }); }

  const db = await readEnhancedTable(slug, dbId);
  if (!db) return NextResponse.json({ error: "Database not found" }, { status: 404 });

  const { cells } = await request.json();

  // Auto-populate createdBy columns with the authenticated user
  const user = await getCurrentUser();
  const mergedCells: Record<string, unknown> = { ...(cells || {}) };
  for (const col of db.columns) {
    if (col.type === "createdBy" && !mergedCells[col.id]) {
      mergedCells[col.id] = user?.username || "";
    }
  }

  const row: DbRow = {
    id: generateId(),
    cells: mergedCells,
    createdAt: new Date().toISOString(),
  };

  db.rows.push(row);
  db.updatedAt = new Date().toISOString();
  await writeEnhancedTable(slug, dbId, db);
  return NextResponse.json(row, { status: 201 });
}
