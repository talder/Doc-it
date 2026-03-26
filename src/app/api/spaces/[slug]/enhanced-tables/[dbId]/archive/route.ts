import { NextRequest, NextResponse } from "next/server";
import { requireSpaceRole } from "@/lib/permissions";
import { archiveEnhancedTable, unarchiveEnhancedTable } from "@/lib/enhanced-table";
import { auditLog } from "@/lib/audit";
import { invalidateSpaceCache } from "@/lib/space-cache";

type Params = { params: Promise<{ slug: string; dbId: string }> };

/** POST: archive a database */
export async function POST(_request: NextRequest, { params }: Params) {
  const { slug, dbId } = await params;
  let user;
  try {
    ({ user } = await requireSpaceRole(slug, "writer"));
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const ok = await archiveEnhancedTable(slug, dbId);
  if (!ok) return NextResponse.json({ error: "Database not found" }, { status: 404 });

  invalidateSpaceCache(slug);
  auditLog(_request, { event: "database.archive", outcome: "success", actor: user.username, spaceSlug: slug, resource: dbId, resourceType: "database" });
  return NextResponse.json({ success: true });
}

/** DELETE: unarchive a database (restore from archive) */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const { slug, dbId } = await params;
  let user;
  try {
    ({ user } = await requireSpaceRole(slug, "writer"));
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const ok = await unarchiveEnhancedTable(slug, dbId);
  if (!ok) return NextResponse.json({ error: "Archived database not found" }, { status: 404 });

  invalidateSpaceCache(slug);
  auditLog(_request, { event: "database.unarchive", outcome: "success", actor: user.username, spaceSlug: slug, resource: dbId, resourceType: "database" });
  return NextResponse.json({ success: true });
}
