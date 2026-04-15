import { NextRequest, NextResponse } from "next/server";
import { requireSpaceRole } from "@/lib/permissions";
import { listTableRevisions, restoreTableRevision } from "@/lib/enhanced-table";

type Params = { params: Promise<{ slug: string; dbId: string }> };

/**
 * GET /api/spaces/:slug/enhanced-tables/:dbId/history
 * Returns revision list (newest first).
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const { slug, dbId } = await params;
  try { await requireSpaceRole(slug, "reader"); }
  catch (err) { return NextResponse.json({ error: String(err) }, { status: 403 }); }

  const revisions = await listTableRevisions(slug, dbId);
  return NextResponse.json({ revisions });
}

/**
 * POST /api/spaces/:slug/enhanced-tables/:dbId/history
 * Body: { filename: string }
 * Restores the table to a specific revision.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { slug, dbId } = await params;
  try { await requireSpaceRole(slug, "admin"); }
  catch (err) { return NextResponse.json({ error: String(err) }, { status: 403 }); }

  const { filename } = await request.json();
  if (!filename || typeof filename !== "string") {
    return NextResponse.json({ error: "Missing filename" }, { status: 400 });
  }

  // Basic safety: ensure filename doesn't escape the directory
  if (filename.includes("/") || filename.includes("..")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  const ok = await restoreTableRevision(slug, dbId, filename);
  if (!ok) return NextResponse.json({ error: "Revision not found" }, { status: 404 });

  return NextResponse.json({ success: true });
}
