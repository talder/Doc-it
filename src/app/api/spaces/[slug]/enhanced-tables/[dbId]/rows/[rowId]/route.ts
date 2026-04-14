import { NextRequest, NextResponse } from "next/server";
import { requireSpaceRole } from "@/lib/permissions";
import {
  readEnhancedTable,
  writeEnhancedTable,
  syncBidirectionalAdd,
  syncBidirectionalRemove,
  cleanupBidirectionalOnRowDelete,
} from "@/lib/enhanced-table";

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

  // Bidirectional relation sync: compare old and new values for each relation column
  for (const col of db.columns) {
    if (col.type !== "relation" || !col.relation?.bidirectional || !col.relation.reverseColumnId) continue;
    if (!(col.id in cells)) continue;

    const { targetSpace, targetDbId, reverseColumnId } = col.relation;
    const oldVal = row.cells[col.id];
    const newVal = cells[col.id];
    const oldIds = new Set(Array.isArray(oldVal) ? oldVal.map(String) : oldVal ? [String(oldVal)] : []);
    const newIds = new Set(Array.isArray(newVal) ? newVal.map(String) : newVal ? [String(newVal)] : []);

    // Removed links
    for (const id of oldIds) {
      if (!newIds.has(id)) {
        await syncBidirectionalRemove(targetSpace, targetDbId, reverseColumnId, id, rowId);
      }
    }
    // Added links
    for (const id of newIds) {
      if (!oldIds.has(id)) {
        await syncBidirectionalAdd(targetSpace, targetDbId, reverseColumnId, id, rowId);
      }
    }
  }

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

  const row = db.rows[idx];

  // Clean up bidirectional reverse references before deleting
  await cleanupBidirectionalOnRowDelete(slug, db, row);

  db.rows.splice(idx, 1);
  db.updatedAt = new Date().toISOString();
  await writeEnhancedTable(slug, dbId, db);
  return NextResponse.json({ success: true });
}
