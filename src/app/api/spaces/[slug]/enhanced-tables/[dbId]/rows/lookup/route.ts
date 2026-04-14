import { NextRequest, NextResponse } from "next/server";
import { requireSpaceRole } from "@/lib/permissions";
import { readEnhancedTable, resolveRelationLabels } from "@/lib/enhanced-table";

type Params = { params: Promise<{ slug: string; dbId: string }> };

/**
 * GET /api/spaces/:slug/enhanced-tables/:dbId/rows/lookup
 * Query params:
 *   rowIds   – comma-separated target row IDs
 *   columnId – the relation column ID on this table (used to resolve target table + display column)
 *
 * Returns { labels: Record<rowId, string> }
 */
export async function GET(request: NextRequest, { params }: Params) {
  const { slug, dbId } = await params;
  try { await requireSpaceRole(slug, "reader"); }
  catch (err) { return NextResponse.json({ error: String(err) }, { status: 403 }); }

  const db = await readEnhancedTable(slug, dbId);
  if (!db) return NextResponse.json({ error: "Database not found" }, { status: 404 });

  const url = new URL(request.url);
  const rowIdsParam = url.searchParams.get("rowIds");
  const columnId = url.searchParams.get("columnId");

  if (!rowIdsParam || !columnId) {
    return NextResponse.json({ error: "Missing rowIds or columnId" }, { status: 400 });
  }

  const col = db.columns.find((c) => c.id === columnId);
  if (!col || col.type !== "relation" || !col.relation) {
    return NextResponse.json({ error: "Column is not a relation" }, { status: 400 });
  }

  const { targetSpace, targetDbId, displayColumnId } = col.relation;

  // Verify the caller has reader access to the target space
  try { await requireSpaceRole(targetSpace, "reader"); }
  catch { return NextResponse.json({ error: "No access to target space" }, { status: 403 }); }

  const rowIds = rowIdsParam.split(",").filter(Boolean);
  const labels = await resolveRelationLabels(targetSpace, targetDbId, rowIds, displayColumnId);

  return NextResponse.json({ labels });
}
