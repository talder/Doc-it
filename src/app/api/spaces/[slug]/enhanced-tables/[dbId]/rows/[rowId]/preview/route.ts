import { NextRequest, NextResponse } from "next/server";
import { requireSpaceRole } from "@/lib/permissions";
import { readEnhancedTable } from "@/lib/enhanced-table";

type Params = { params: Promise<{ slug: string; dbId: string; rowId: string }> };

/**
 * GET /api/spaces/:slug/enhanced-tables/:dbId/rows/:rowId/preview
 *
 * Returns a lightweight preview of a single row (first 5 visible columns)
 * used by the relation chip hover card.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const { slug, dbId, rowId } = await params;
  try { await requireSpaceRole(slug, "reader"); }
  catch (err) { return NextResponse.json({ error: String(err) }, { status: 403 }); }

  const db = await readEnhancedTable(slug, dbId);
  if (!db) return NextResponse.json({ error: "Database not found" }, { status: 404 });

  const row = db.rows.find((r) => r.id === rowId);
  if (!row) return NextResponse.json({ error: "Row not found" }, { status: 404 });

  // Pick up to 5 columns (skip relation/lookup to keep it simple)
  const previewCols = db.columns
    .filter((c) => c.type !== "relation" && c.type !== "lookup")
    .slice(0, 5);

  const fields = previewCols.map((c) => ({
    name: c.name,
    type: c.type,
    value: row.cells[c.id] ?? null,
  }));

  return NextResponse.json({
    tableTitle: db.title,
    rowId: row.id,
    fields,
  });
}
