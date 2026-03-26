import { NextRequest, NextResponse } from "next/server";
import { requireSpaceRole } from "@/lib/permissions";
import { readEnhancedTable, writeEnhancedTable } from "@/lib/enhanced-table";

type Params = { params: Promise<{ slug: string; dbId: string; rowId: string }> };

export async function PUT(request: NextRequest, { params }: Params) {
  const { slug, dbId, rowId } = await params;
  try { await requireSpaceRole(slug, "writer"); }
  catch (err) { return NextResponse.json({ error: String(err) }, { status: 403 }); }

  const db = await readEnhancedTable(slug, dbId);
  if (!db) return NextResponse.json({ error: "Database not found" }, { status: 404 });

  const row = db.rows.find((r) => r.id === rowId);
  if (!row) return NextResponse.json({ error: "Row not found" }, { status: 404 });

  const { cells } = await request.json();
  // Merge cells (partial update)
  row.cells = { ...row.cells, ...cells };
  db.updatedAt = new Date().toISOString();
  await writeEnhancedTable(slug, dbId, db);
  return NextResponse.json(row);
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { slug, dbId, rowId } = await params;
  try { await requireSpaceRole(slug, "writer"); }
  catch (err) { return NextResponse.json({ error: String(err) }, { status: 403 }); }

  const db = await readEnhancedTable(slug, dbId);
  if (!db) return NextResponse.json({ error: "Database not found" }, { status: 404 });

  const idx = db.rows.findIndex((r) => r.id === rowId);
  if (idx === -1) return NextResponse.json({ error: "Row not found" }, { status: 404 });

  db.rows.splice(idx, 1);
  db.updatedAt = new Date().toISOString();
  await writeEnhancedTable(slug, dbId, db);
  return NextResponse.json({ success: true });
}
